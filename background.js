console.log('=== BACKGROUND SCRIPT STARTING ===');

// Load browser steps module
try {
  importScripts('./browser-steps.js');
  console.log('Browser steps module loaded successfully');
} catch (error) {
  console.error('Failed to load browser-steps.js:', error);
}

// Browser steps command queue for Costco product page
const commandList = [
  { id: 1, type: 'action_goto_url', selector: null, value: 'https://www.costco.com/.product.100736527.html', status: 'pending' },
  { id: 2, type: 'action_wait_for_seconds', selector: null, value: '3', status: 'pending' },
  { id: 3, type: 'action_execute_js', selector: null, value: 'document.querySelector("h1")?.textContent', status: 'pending' },
  { id: 4, type: 'action_execute_js', selector: null, value: 'document.querySelector(".price")?.textContent', status: 'pending' },
  { id: 5, type: 'action_wait_for_text', selector: null, value: 'Add to Cart', status: 'pending' },
  { id: 6, type: 'action_scroll_down', selector: null, value: null, status: 'pending' }
];

let commandResults = [];

console.log('Command list created with', commandList.length, 'changedetection.io browser steps');

// Install listener
chrome.runtime.onInstalled.addListener(() => {
  console.log('=== EXTENSION INSTALLED ===');
});

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('=== MESSAGE RECEIVED ===', message);
  
  if (message.action === 'getStatus') {
    console.log('Sending command list:', commandList);
    sendResponse({ commands: commandList, results: commandResults });
    return false;
  }
  
  if (message.action === 'runCommands') {
    console.log('Running changedetection.io browser steps...');
    executeCommandList()
      .then(results => {
        sendResponse({ success: true, results, commands: commandList });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message, commands: commandList });
      });
    return true; // Keep message channel open for async response
  }
  
  if (message.action === 'runSSECommands') {
    console.log('Starting SSE command execution...');
    startSSECommandListener()
      .then(result => {
        sendResponse({ success: true, message: result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
  
  console.log('Unknown action:', message.action);
  sendResponse({ error: 'Unknown action' });
  return false;
});

// Execute changedetection.io browser step command list
async function executeCommandList() {
  commandResults = [];
  
  for (let i = 0; i < commandList.length; i++) {
    const command = commandList[i];
    command.status = 'running';
    console.log(`Executing command ${command.id}: ${command.type}`);
    
    try {
      const result = await globalThis.browserSteps.executeAction(command.type, command.selector, command.value);
      command.status = 'completed';
      commandResults.push({ commandId: command.id, result });
      console.log(`Command ${command.id} completed:`, result);
    } catch (error) {
      command.status = 'failed';
      command.error = error.message;
      commandResults.push({ commandId: command.id, error: error.message });
      console.error(`Command ${command.id} failed:`, error);
    }
  }
  
  return commandResults;
}

// SSE Command Listener with Dynamic Server Discovery
class SSECommandProcessor {
  constructor() {
    this.servers = [
      'http://localhost:8000',
      'http://127.0.0.1:8000',
      'http://redis-browsersteps:8000'
    ];
    this.activeServer = null;
    this.eventSource = null;
    this.pendingCommands = new Map();
  }

  async findActiveServer() {
    for (const server of this.servers) {
      try {
        console.log(`Trying server: ${server}`);
        const response = await fetch(`${server}/health`, { 
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });
        
        if (response.ok) {
          const data = await response.json();
          this.activeServer = server;
          console.log(`Connected to SSE server: ${server}`, data);
          return server;
        }
      } catch (error) {
        console.log(`Failed to connect to ${server}:`, error.message);
      }
    }
    
    throw new Error('No SSE servers available');
  }

  async startListening() {
    if (!this.activeServer) {
      await this.findActiveServer();
    }

    const streamUrl = `${this.activeServer}/stream/browser-commands`;
    console.log(`Starting SSE connection to: ${streamUrl}`);

    return new Promise((resolve, reject) => {
      this.eventSource = new EventSource(streamUrl);
      let commandCount = 0;

      this.eventSource.onopen = () => {
        console.log('SSE connection opened');
      };

      this.eventSource.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Received SSE message:', message);

          if (message.type === 'connected') {
            console.log(`SSE connected with ID: ${message.connection_id}`);
            resolve('SSE connection established, waiting for commands...');
          } 
          else if (message.type === 'command') {
            commandCount++;
            await this.executeSSECommand(message.id, message.data);
          }
          else if (message.type === 'all_commands_completed') {
            console.log('All SSE commands completed');
            this.cleanup();
          }
        } catch (error) {
          console.error('Error processing SSE message:', error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        this.cleanup();
        
        if (!this.activeServer) {
          reject(new Error('SSE connection failed'));
        } else {
          // Try to reconnect after delay
          setTimeout(() => {
            this.activeServer = null;
            this.startListening();
          }, 5000);
        }
      };

      // Timeout if no connection after 10 seconds
      setTimeout(() => {
        if (!this.activeServer) {
          this.cleanup();
          reject(new Error('SSE connection timeout'));
        }
      }, 10000);
    });
  }

  async executeSSECommand(commandId, command) {
    console.log(`Executing SSE command ${commandId}:`, command);
    this.pendingCommands.set(commandId, { status: 'running', startTime: Date.now() });

    try {
      const result = await globalThis.browserSteps.executeAction(
        command.type,
        command.selector, 
        command.value
      );

      this.pendingCommands.set(commandId, { status: 'completed', result });
      await this.sendResult(commandId, result);
      console.log(`SSE command ${commandId} completed:`, result);

    } catch (error) {
      this.pendingCommands.set(commandId, { status: 'failed', error: error.message });
      await this.sendResult(commandId, null, error.message);
      console.error(`SSE command ${commandId} failed:`, error);
    }
  }

  async sendResult(commandId, result, error = null) {
    if (!this.activeServer) return;

    try {
      await fetch(`${this.activeServer}/api/command-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command_id: commandId,
          result,
          error,
          timestamp: Date.now()
        })
      });
    } catch (err) {
      console.error('Failed to send result:', err);
    }
  }

  cleanup() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    console.log('SSE connection cleaned up');
  }
}

// Global SSE processor instance
let sseProcessor = null;

async function startSSECommandListener() {
  try {
    if (sseProcessor) {
      sseProcessor.cleanup();
    }
    
    sseProcessor = new SSECommandProcessor();
    const result = await sseProcessor.startListening();
    return result;
  } catch (error) {
    console.error('Failed to start SSE listener:', error);
    throw error;
  }
}

console.log('=== BACKGROUND SCRIPT LOADED ===');