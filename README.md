# Chrome Extension Browser Automation

A Chrome extension that executes changedetection.io-style browser automation commands via Server-Sent Events (SSE). The extension can automatically capture HTML content and process it with BeautifulSoup for analysis.

The browser step command list is retrieved from `sse-server.py` when the Chrome browser first starts by a little hack that triggers the connection on the first network IO. (Or else the chrome extension would need clicking)

First time usage-
- Have `sse-server.py` running
-  (first time only) Run the `fetch-page.sh` and enable the extension and 'debug mode' in extension config, close it.
- Run `fetch-page.sh` to test (it will re-use the same chrome profile)
- 
 (see below for more details),



## Features

- **Automated Browser Steps**: Execute changedetection.io browser automation commands
- **Server-Sent Events**: Real-time command streaming from Python SSE server
- **HTML Content Capture**: Extract and analyze page content with BeautifulSoup
- **Auto-trigger**: Automatically start automation when navigating to changedetection.io
- **Multi-connection Support**: Each browser session gets independent command execution
- **Flexible URL Targeting**: Configure any target URL via command line
- **Anti-Detection**: Better for Akamai Ghost and Cloudflare protected pages - no Chrome CDP remote debugger session to detect

## Project Structure

```
chrome-extension/
├── manifest.json          # Chrome extension manifest
├── background.js          # Extension background service worker
├── browser-steps.js       # Browser automation step implementations
├── popup.html            # Extension popup UI
├── popup.js              # Popup UI logic
├── sse-server.py         # Python SSE server
├── requirements.txt      # Python dependencies
├── fetch-page.sh         # Chrome launcher script
└── README.md            # This file
```

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select this directory
4. Note the extension ID for debugging

### 3. Start SSE Server

```bash
# Start server with target URL
python3 sse-server.py -u "https://www.costco.com/.product.100736527.html"

# Or use any other URL
python3 sse-server.py --url "https://example.com/product/123"
```

### 4. Launch Chrome with Extension

```bash
./fetch-page.sh
```

This will:
- Start Chrome with the extension loaded
- Set window size to 1280x1024
- Use HTTP proxy at 10.8.0.1:8118
- Navigate to changedetection.io (triggers auto-start)

## Usage Modes

### Auto-trigger Mode (Recommended)

1. Start the SSE server with your target URL
2. Run `./fetch-page.sh` 
3. Chrome opens and navigates to changedetection.io
4. Extension automatically intercepts the request and starts SSE session
5. Browser automation begins on your target URL

### Manual Mode

1. Start the SSE server
2. Load the extension in Chrome manually
3. Click the extension icon in the toolbar
4. Use "Run SSE Command List" button

## Browser Automation Commands

The system supports these changedetection.io browser step commands:

- `action_goto_url` - Navigate to URL
- `action_wait_for_seconds` - Wait for specified time
- `action_execute_js` - Execute JavaScript code
- `action_wait_for_text` - Wait for text to appear
- `action_scroll_down` - Scroll page down
- `action_get_html_content` - Capture full HTML content
- `action_click_element` - Click DOM element
- `action_enter_text_in_field` - Fill form fields
- And more...

## HTML Content Analysis

When `action_get_html_content` executes:

1. **Chrome Extension**: Captures full HTML, text content, URL, title
2. **SSE Server**: Processes HTML with BeautifulSoup
3. **Analysis Output**: Displays detailed console information:
   - Page title extraction
   - Document size statistics
   - Link and image counts
   - Form and heading analysis
   - First few headings and links

## SSE Server API

### Endpoints

- `GET /health` - Server health check
- `GET /api/commands` - View command queue status
- `GET /stream/browser-commands` - SSE command stream
- `POST /api/command-result` - Receive command results
- `POST /api/reset-commands` - Reset all commands to pending

### Command Line Options

```bash
python3 sse-server.py --help

Options:
  -u, --url URL     Target URL for automation (required)
  --host HOST       Server host (default: 0.0.0.0)  
  --port PORT       Server port (default: 8000)
```

## Architecture

### Communication Flow

```
Chrome Extension ←→ SSE Server ←→ BeautifulSoup Analysis
      ↓                ↓               ↓
Browser Commands → Command Results → HTML Processing
```

### Key Components

1. **Background Script**: Handles SSE connections and command execution
2. **Browser Steps**: Implements automation actions using Chrome APIs
3. **SSE Server**: Streams commands and processes results
4. **Auto-trigger**: WebRequest API intercepts changedetection.io navigation

## Configuration

### Chrome Launch Options

The `fetch-page.sh` script configures Chrome with:
- Custom user profile for isolation
- Extension loading and permissions
- Window size: 1280x1024
- HTTP proxy: 10.8.0.1:8118
- Disabled default apps and popups

### Server Discovery

The extension automatically discovers the SSE server by trying:
1. `http://localhost:8000`
2. `http://127.0.0.1:8000` 
3. `http://redis-browsersteps:8000` (Docker hostname)

## Development

### Debugging

1. **Extension Console**: `chrome://extensions/` → Details → Inspect views: service worker
2. **Server Logs**: Console output shows command execution and HTML analysis
3. **Network Tab**: Monitor SSE connection in Chrome DevTools

### Adding New Commands

1. Add command function to `browser-steps.js`
2. Add case to `executeAction()` switch statement
3. Update SSE server command list in `initialize_commands()`

### Testing

```bash
# Test manual commands
curl http://localhost:8000/api/commands

# Reset command queue  
curl -X POST http://localhost:8000/api/reset-commands
```

## Troubleshooting

### Extension Not Loading
- Check `chrome://extensions/` for errors
- Reload extension after code changes
- Verify manifest.json syntax

### SSE Connection Failed
- Ensure server is running on correct port
- Check CORS permissions in server
- Verify network connectivity

### Commands Not Executing
- Check background script console for errors
- Ensure target page allows content script injection
- Verify Chrome permissions are granted

### HTML Analysis Not Working
- Install BeautifulSoup: `pip install beautifulsoup4`
- Check server console for processing errors
- Ensure HTML content is being captured

## Security Notes

- Extension requires broad permissions for automation
- HTTP proxy routes all traffic through specified server
- HTML content is processed server-side
- Use only for authorized testing and development

## Anti-Detection Advantages

This Chrome extension approach offers significant advantages over traditional automation tools like Puppeteer or Selenium:

- **No Chrome DevTools Protocol (CDP)**: Unlike Puppeteer/Selenium, this extension doesn't use CDP remote debugging, which is easily detectable by anti-bot systems
- **Headful Browser**: Runs with full GUI (not headless), making it indistinguishable from normal user browsing - headless mode is easily detected by modern anti-bot systems
- **Regular Browser Instance**: Runs in a normal Chrome browser without automation flags that Akamai Ghost and Cloudflare look for
- **Native Extension APIs**: Uses standard Chrome extension APIs instead of automation protocols
- **Stealth Operation**: Commands are executed through Server-Sent Events, appearing as normal web traffic
- **Human-like Behavior**: Browser instance behaves identically to manual user interaction
- **Full Browser Environment**: Complete rendering engine, JavaScript execution, and user agent profile identical to regular browsing

This makes it particularly effective against sophisticated bot detection systems deployed by Akamai Ghost, Cloudflare Bot Management, and similar services that specifically target CDP-based automation tools and headless browser detection.

## License

This project is for educational and development purposes.
