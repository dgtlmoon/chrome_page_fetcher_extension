document.addEventListener('DOMContentLoaded', function() {
  const runButton = document.getElementById('runButton');
  const runSSEButton = document.getElementById('runSSEButton');
  const commandListDiv = document.getElementById('commandList');
  const resultsDiv = document.getElementById('results');
  const resultsSection = document.getElementById('resultsSection');
  
  // Load initial command list
  loadCommandList();
  
  runButton.addEventListener('click', async function() {
    runButton.disabled = true;
    runButton.textContent = 'Running...';
    resultsDiv.innerHTML = '';
    resultsSection.style.display = 'none';
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'runCommands'
      });
      
      console.log('Run commands response:', response);
      
      if (response && response.success) {
        displayResults(response.results);
        resultsSection.style.display = 'block';
        // Update command list with final status
        displayCommandList(response.commands);
      } else if (response) {
        resultsDiv.innerHTML = `<div class="result-item" style="color: red;">Error: ${response.error}</div>`;
        resultsSection.style.display = 'block';
        if (response.commands) {
          displayCommandList(response.commands);
        }
      } else {
        resultsDiv.innerHTML = `<div class="result-item" style="color: red;">Error: No response from background script</div>`;
        resultsSection.style.display = 'block';
      }
      
    } catch (error) {
      console.error('Command execution error:', error);
      resultsDiv.innerHTML = `<div class="result-item" style="color: red;">Error: ${error.message}</div>`;
      resultsSection.style.display = 'block';
    }
    
    runButton.disabled = false;
    runButton.textContent = 'Run Command List';
  });
  
  runSSEButton.addEventListener('click', async function() {
    runSSEButton.disabled = true;
    runSSEButton.textContent = 'Connecting...';
    resultsDiv.innerHTML = '';
    resultsSection.style.display = 'none';
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'runSSECommands'
      });
      
      console.log('SSE commands response:', response);
      
      if (response && response.success) {
        displayResults([{
          commandId: 'sse',
          result: { message: response.message }
        }]);
        resultsSection.style.display = 'block';
      } else if (response) {
        resultsDiv.innerHTML = `<div class="result-item" style="color: red;">Error: ${response.error}</div>`;
        resultsSection.style.display = 'block';
      } else {
        resultsDiv.innerHTML = `<div class="result-item" style="color: red;">Error: No response from background script</div>`;
        resultsSection.style.display = 'block';
      }
      
    } catch (error) {
      console.error('SSE command execution error:', error);
      resultsDiv.innerHTML = `<div class="result-item" style="color: red;">Error: ${error.message}</div>`;
      resultsSection.style.display = 'block';
    }
    
    runSSEButton.disabled = false;
    runSSEButton.textContent = 'Run SSE Command List';
  });
  
  async function loadCommandList() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getStatus'
      });
      console.log('Status response:', response);
      
      if (response && response.commands) {
        displayCommandList(response.commands);
        if (response.results && response.results.length > 0) {
          displayResults(response.results);
          resultsSection.style.display = 'block';
        }
      } else {
        console.error('Invalid response structure:', response);
      }
    } catch (error) {
      console.error('Failed to load command list:', error);
    }
  }
  
  function displayCommandList(commands) {
    commandListDiv.innerHTML = '';
    commands.forEach(command => {
      const commandDiv = document.createElement('div');
      commandDiv.className = `command-item command-${command.status}`;
      
      let details = '';
      if (command.type === 'goto') {
        details = `URL: ${command.url}`;
      } else if (command.type === 'getElement') {
        details = `Selector: ${command.selector}, Property: ${command.property}`;
      }
      
      commandDiv.innerHTML = `
        <div class="command-type">${command.id}. ${command.type.toUpperCase()}</div>
        <div class="command-details">${details}</div>
        ${command.status === 'failed' ? `<div style="color: red; font-size: 10px;">Error: ${command.error}</div>` : ''}
      `;
      
      commandListDiv.appendChild(commandDiv);
    });
  }
  
  function displayResults(results) {
    resultsDiv.innerHTML = '';
    results.forEach(result => {
      const resultDiv = document.createElement('div');
      resultDiv.className = 'result-item';
      
      if (result.error) {
        resultDiv.innerHTML = `<strong>Command ${result.commandId}:</strong> <span style="color: red;">${result.error}</span>`;
      } else {
        let resultText = JSON.stringify(result.result, null, 2);
        if (resultText.length > 100) {
          resultText = resultText.substring(0, 100) + '...';
        }
        resultDiv.innerHTML = `<strong>Command ${result.commandId}:</strong><br><pre style="margin: 2px 0;">${resultText}</pre>`;
      }
      
      resultsDiv.appendChild(resultDiv);
    });
  }
});