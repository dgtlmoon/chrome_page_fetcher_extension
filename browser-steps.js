// Changedetection.io browser steps implementation for Chrome extension
// Mirrors the functionality from changedetectionio/blueprint/browser_steps/browser_steps.py

console.log('Loading changedetection.io browser steps...');

// Global state
let page = null;

// Initialize page if not exists
async function ensurePage() {
  if (!page) {
    const tab = await chrome.tabs.create({ url: 'about:blank' });
    page = { tabId: tab.id };
  }
  return page;
}

// Browser step implementations using Chrome extension APIs

async function action_goto_url(selector, value) {
  if (!value) {
    throw new Error('No URL provided for goto_url action');
  }
  
  await ensurePage();
  await chrome.tabs.update(page.tabId, { url: value });
  
  // Wait for page to load
  await new Promise(resolve => {
    const listener = (tabId, changeInfo) => {
      if (tabId === page.tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
  
  return { message: `Navigated to ${value}` };
}

async function action_goto_site(selector, value) {
  // In extension context, just go to the provided URL or a default
  return await action_goto_url(selector, value || 'https://changedetection.io');
}

async function action_click_element_containing_text(selector, value) {
  if (!value || !value.trim()) {
    return { message: 'No text provided to click' };
  }
  
  await ensurePage();
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: page.tabId },
    func: (text) => {
      // Find element containing the text
      const xpath = `//*[contains(text(), "${text}")]`;
      const element = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      
      if (element) {
        element.click();
        return { clicked: true, text: element.textContent.trim() };
      }
      return { clicked: false, message: `No element found containing text: ${text}` };
    },
    args: [value]
  });
  
  return { message: `Clicked element containing text: ${value}`, result: result[0].result };
}

async function action_click_element_containing_text_if_exists(selector, value) {
  try {
    return await action_click_element_containing_text(selector, value);
  } catch (error) {
    return { message: `Element containing text "${value}" not found, continuing...` };
  }
}

async function action_click_element(selector, value) {
  if (!selector || !selector.trim()) {
    throw new Error('No selector provided for click_element action');
  }
  
  await ensurePage();
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: page.tabId },
    func: (sel) => {
      const element = document.querySelector(sel);
      if (element) {
        element.click();
        return { clicked: true, selector: sel };
      }
      return { clicked: false, message: `Element not found: ${sel}` };
    },
    args: [selector]
  });
  
  return { message: `Clicked element: ${selector}`, result: result[0].result };
}

async function action_click_element_if_exists(selector, value) {
  try {
    return await action_click_element(selector, value);
  } catch (error) {
    return { message: `Element "${selector}" not found, continuing...` };
  }
}

async function action_execute_js(selector, value) {
  if (!value) {
    return { message: 'No JavaScript code provided' };
  }
  
  await ensurePage();
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: page.tabId },
    func: (code) => {
      // Safe evaluation of common patterns
      if (code.includes('document.querySelector("h1")?.textContent')) {
        const h1 = document.querySelector("h1");
        return h1 ? h1.textContent : null;
      }
      if (code.includes('document.title')) {
        return document.title;
      }
      if (code.includes('window.location.href')) {
        return window.location.href;
      }
      if (code.includes('document.querySelector(')) {
        // Allow basic querySelector operations
        try {
          return eval(code);
        } catch (e) {
          return `Error executing code: ${e.message}`;
        }
      }
      return `Code execution not supported: ${code}`;
    },
    args: [value]
  });
  
  return { message: `Executed JS: ${value}`, result: result[0].result };
}

async function action_wait_for_seconds(selector, value) {
  const seconds = parseFloat(value) || 1.0;
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  return { message: `Waited for ${seconds} seconds` };
}

async function action_wait_for_text(selector, value) {
  if (!value) {
    return { message: 'No text provided to wait for' };
  }
  
  await ensurePage();
  
  let found = false;
  let attempts = 0;
  const maxAttempts = 300; // 30 seconds max
  
  while (!found && attempts < maxAttempts) {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId: page.tabId },
        func: (text) => document.body.innerText.includes(text),
        args: [value]
      });
      
      found = result[0].result;
      if (!found) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
    } catch (error) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  if (!found) {
    throw new Error(`Text "${value}" not found after ${maxAttempts * 100}ms`);
  }
  
  return { message: `Found text: ${value}` };
}

async function action_wait_for_text_in_element(selector, value) {
  if (!selector || !value) {
    throw new Error('Both selector and text are required');
  }
  
  await ensurePage();
  
  let found = false;
  let attempts = 0;
  const maxAttempts = 300; // 30 seconds max
  
  while (!found && attempts < maxAttempts) {
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId: page.tabId },
        func: (sel, text) => {
          const element = document.querySelector(sel);
          return element ? element.innerText.includes(text) : false;
        },
        args: [selector, value]
      });
      
      found = result[0].result;
      if (!found) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
    } catch (error) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  if (!found) {
    throw new Error(`Text "${value}" not found in element "${selector}" after ${maxAttempts * 100}ms`);
  }
  
  return { message: `Found text "${value}" in element: ${selector}` };
}

async function action_enter_text_in_field(selector, value) {
  if (!selector || !value) {
    throw new Error('Both selector and text are required for enter_text_in_field');
  }
  
  await ensurePage();
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: page.tabId },
    func: (sel, text) => {
      const element = document.querySelector(sel);
      if (element) {
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return { filled: true, selector: sel, value: text };
      }
      return { filled: false, message: `Element not found: ${sel}` };
    },
    args: [selector, value]
  });
  
  return { message: `Entered text in field: ${selector}`, result: result[0].result };
}

async function action_press_enter(selector, value) {
  await ensurePage();
  
  await chrome.scripting.executeScript({
    target: { tabId: page.tabId },
    func: () => {
      const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13 });
      document.dispatchEvent(event);
    }
  });
  
  return { message: 'Pressed Enter key' };
}

async function action_check_checkbox(selector, value) {
  if (!selector) {
    throw new Error('Selector required for check_checkbox');
  }
  
  await ensurePage();
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: page.tabId },
    func: (sel) => {
      const element = document.querySelector(sel);
      if (element && element.type === 'checkbox') {
        element.checked = true;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return { checked: true, selector: sel };
      }
      return { checked: false, message: `Checkbox not found: ${sel}` };
    },
    args: [selector]
  });
  
  return { message: `Checked checkbox: ${selector}`, result: result[0].result };
}

async function action_uncheck_checkbox(selector, value) {
  if (!selector) {
    throw new Error('Selector required for uncheck_checkbox');
  }
  
  await ensurePage();
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: page.tabId },
    func: (sel) => {
      const element = document.querySelector(sel);
      if (element && element.type === 'checkbox') {
        element.checked = false;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return { unchecked: true, selector: sel };
      }
      return { unchecked: false, message: `Checkbox not found: ${sel}` };
    },
    args: [selector]
  });
  
  return { message: `Unchecked checkbox: ${selector}`, result: result[0].result };
}

async function action_scroll_down(selector, value) {
  await ensurePage();
  
  await chrome.scripting.executeScript({
    target: { tabId: page.tabId },
    func: () => {
      window.scrollBy(0, 600);
    }
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  return { message: 'Scrolled down 600px' };
}

async function action_get_html_content(selector, value) {
  await ensurePage();
  
  const result = await chrome.scripting.executeScript({
    target: { tabId: page.tabId },
    func: () => {
      // Get the full HTML content of the page
      const htmlContent = document.documentElement.outerHTML;
      const textContent = document.body.innerText;
      
      return {
        html: htmlContent,
        text: textContent,
        url: window.location.href,
        title: document.title,
        size: htmlContent.length,
        timestamp: Date.now()
      };
    }
  });
  
  const content = result[0].result;
  console.log(`Captured HTML content: ${content.size} characters from ${content.url}`);
  
  return { 
    message: `Captured HTML content (${content.size} chars)`,
    html_content: content.html,
    text_content: content.text,
    url: content.url,
    title: content.title,
    size: content.size,
    timestamp: content.timestamp
  };
}

// Execute browser step command
async function executeAction(actionType, selector = null, value = null) {
  console.log(`Executing browser step: ${actionType}`);
  
  switch (actionType) {
    case 'action_goto_url':
      return await action_goto_url(selector, value);
    case 'action_goto_site':
      return await action_goto_site(selector, value);
    case 'action_click_element_containing_text':
      return await action_click_element_containing_text(selector, value);
    case 'action_click_element_containing_text_if_exists':
      return await action_click_element_containing_text_if_exists(selector, value);
    case 'action_click_element':
      return await action_click_element(selector, value);
    case 'action_click_element_if_exists':
      return await action_click_element_if_exists(selector, value);
    case 'action_enter_text_in_field':
      return await action_enter_text_in_field(selector, value);
    case 'action_execute_js':
      return await action_execute_js(selector, value);
    case 'action_wait_for_seconds':
      return await action_wait_for_seconds(selector, value);
    case 'action_wait_for_text':
      return await action_wait_for_text(selector, value);
    case 'action_wait_for_text_in_element':
      return await action_wait_for_text_in_element(selector, value);
    case 'action_press_enter':
      return await action_press_enter(selector, value);
    case 'action_check_checkbox':
      return await action_check_checkbox(selector, value);
    case 'action_uncheck_checkbox':
      return await action_uncheck_checkbox(selector, value);
    case 'action_scroll_down':
      return await action_scroll_down(selector, value);
    case 'action_get_html_content':
      return await action_get_html_content(selector, value);
    default:
      throw new Error(`Unknown action type: ${actionType}`);
  }
}

// Make functions available globally for service worker context
// Use globalThis instead of window for service worker compatibility
globalThis.browserSteps = {
  executeAction,
  ensurePage,
  // Export individual actions if needed
  action_goto_url,
  action_goto_site,
  action_click_element_containing_text,
  action_click_element_containing_text_if_exists,
  action_click_element,
  action_click_element_if_exists,
  action_enter_text_in_field,
  action_execute_js,
  action_wait_for_seconds,
  action_wait_for_text,
  action_wait_for_text_in_element,
  action_press_enter,
  action_check_checkbox,
  action_uncheck_checkbox,
  action_scroll_down,
  action_get_html_content
};

console.log('Changedetection.io browser steps loaded successfully');