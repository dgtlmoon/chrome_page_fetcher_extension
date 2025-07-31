#!/usr/bin/env python3
"""
SSE Server for Chrome Extension Browser Commands
Sends changedetection.io browser steps via Server-Sent Events
"""

import asyncio
import json
import time
import uuid
from typing import List, Dict, Any
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from bs4 import BeautifulSoup

app = FastAPI(title="Browser Steps SSE Server")

# Enable CORS for Chrome extensions
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "chrome-extension://*",
        "http://localhost:*",
        "http://127.0.0.1:*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global command queue and results storage
command_queue: List[Dict[str, Any]] = []
command_results: Dict[str, Dict[str, Any]] = {}
html_content_storage: Dict[str, Dict[str, Any]] = {}
active_connections = set()

# Initialize with sample browser commands (similar to extension)
def initialize_commands():
    """Initialize the command queue with sample changedetection.io browser steps"""
    global command_queue
    command_queue = [
        {
            "id": str(uuid.uuid4()),
            "type": "action_goto_url",
            "selector": None,
            "value": "https://www.costco.com/.product.100736527.html",
            "status": "pending",
            "created_at": time.time()
        },
        {
            "id": str(uuid.uuid4()),
            "type": "action_wait_for_seconds",
            "selector": None,
            "value": "3",
            "status": "pending",
            "created_at": time.time()
        },
        {
            "id": str(uuid.uuid4()),
            "type": "action_execute_js",
            "selector": None,
            "value": "document.querySelector('h1')?.textContent",
            "status": "pending",
            "created_at": time.time()
        },
        {
            "id": str(uuid.uuid4()),
            "type": "action_execute_js",
            "selector": None,
            "value": "document.querySelector('.price')?.textContent",
            "status": "pending",
            "created_at": time.time()
        },
        {
            "id": str(uuid.uuid4()),
            "type": "action_wait_for_text",
            "selector": None,
            "value": "Add to Cart",
            "status": "pending",
            "created_at": time.time()
        },
        {
            "id": str(uuid.uuid4()),
            "type": "action_scroll_down",
            "selector": None,
            "value": None,
            "status": "pending",
            "created_at": time.time()
        },
        {
            "id": str(uuid.uuid4()),
            "type": "action_get_html_content",
            "selector": None,
            "value": None,
            "status": "pending",
            "created_at": time.time()
        }
    ]
    print(f"Initialized with {len(command_queue)} browser step commands")

@app.on_event("startup")
async def startup_event():
    """Initialize commands when server starts"""
    initialize_commands()

@app.get("/health")
async def health_check():
    """Health check endpoint for server discovery"""
    return {
        "status": "healthy",
        "server": "Browser Steps SSE Server",
        "commands_pending": len([c for c in command_queue if c["status"] == "pending"]),
        "timestamp": time.time()
    }

@app.get("/api/commands")
async def get_commands():
    """Get current command list status"""
    return {
        "commands": command_queue,
        "total": len(command_queue),
        "pending": len([c for c in command_queue if c["status"] == "pending"]),
        "completed": len([c for c in command_queue if c["status"] == "completed"]),
        "failed": len([c for c in command_queue if c["status"] == "failed"])
    }

@app.post("/api/command-result")
async def receive_command_result(result_data: dict):
    """Receive command execution results from extension"""
    command_id = result_data.get("command_id")
    if not command_id:
        return {"error": "Missing command_id"}
    
    # Update command status in queue
    command_type = None
    for cmd in command_queue:
        if cmd["id"] == command_id:
            cmd["status"] = "completed" if result_data.get("result") else "failed"
            cmd["completed_at"] = time.time()
            command_type = cmd["type"]
            if result_data.get("error"):
                cmd["error"] = result_data["error"]
            break
    
    # Store detailed result
    command_results[command_id] = {
        "result": result_data.get("result"),
        "error": result_data.get("error"),
        "timestamp": result_data.get("timestamp", time.time())
    }
    
    # Special handling for HTML content - server-side processing
    if command_type == "action_get_html_content" and result_data.get("result"):
        await result_receive_html_content(command_id, result_data["result"])
    
    result = result_data.get('result') or {}
    message = result.get('message') if isinstance(result, dict) else str(result) if result else None
    print(f"Received result for command {command_id}: {message or result_data.get('error') or 'No message'}")
    return {"status": "received"}

async def result_receive_html_content(command_id: str, result: dict):
    """Process HTML content with BeautifulSoup and store analysis"""
    try:
        html_content = result.get("html_content", "")
        text_content = result.get("text_content", "")
        url = result.get("url", "")
        original_title = result.get("title", "")
        
        if not html_content:
            print(f"No HTML content received for command {command_id}")
            return
        
        # Parse with BeautifulSoup
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Extract various elements for analysis
        title = soup.find('title')
        title_text = title.get_text().strip() if title else "No title found"
        
        # Get some basic stats
        all_links = soup.find_all('a')
        all_images = soup.find_all('img')
        all_forms = soup.find_all('form')
        all_headings = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
        
        # Store analysis results
        analysis = {
            "command_id": command_id,
            "url": url,
            "original_title": original_title,
            "bs4_title": title_text,
            "html_size": len(html_content),
            "text_size": len(text_content),
            "link_count": len(all_links),
            "image_count": len(all_images),
            "form_count": len(all_forms),
            "heading_count": len(all_headings),
            "headings": [h.get_text().strip()[:100] for h in all_headings[:5]],  # First 5 headings, truncated
            "first_links": [{"text": a.get_text().strip()[:50], "href": a.get('href')} for a in all_links[:5]],
            "processed_at": time.time()
        }
        
        html_content_storage[command_id] = analysis
        
        # Console debug output
        print("=" * 60)
        print(f"🌐 HTML CONTENT ANALYSIS - Command {command_id}")
        print("=" * 60)
        print(f"📍 URL: {url}")
        print(f"📄 Title (Original): {original_title}")
        print(f"📄 Title (BS4): {title_text}")
        print(f"📏 Document size: {len(html_content):,} characters")
        print(f"📝 Text content: {len(text_content):,} characters")
        print(f"🔗 Links found: {len(all_links)}")
        print(f"🖼️  Images found: {len(all_images)}")
        print(f"📋 Forms found: {len(all_forms)}")
        print(f"📑 Headings found: {len(all_headings)}")
        
        if all_headings:
            print(f"📑 First few headings:")
            for i, heading in enumerate(all_headings[:3], 1):
                print(f"   {i}. {heading.name.upper()}: {heading.get_text().strip()[:80]}")
        
        if all_links:
            print(f"🔗 First few links:")
            for i, link in enumerate(all_links[:3], 1):
                link_text = link.get_text().strip()[:50]
                link_href = link.get('href', 'No href')
                print(f"   {i}. {link_text} -> {link_href}")
        
        print("=" * 60)
        print(f"✅ HTML analysis completed and stored in memory")
        print("=" * 60)
        
    except Exception as e:
        error_msg = f"Failed to process HTML content: {str(e)}"
        print(f"❌ {error_msg}")
        
        # Store error info
        html_content_storage[command_id] = {
            "command_id": command_id,
            "error": error_msg,
            "processed_at": time.time()
        }

@app.get("/stream/browser-commands")
async def stream_browser_commands():
    """SSE endpoint that streams browser commands to extension"""
    
    async def event_generator():
        connection_id = str(uuid.uuid4())
        active_connections.add(connection_id)
        print(f"New SSE connection: {connection_id}")
        
        try:
            # Send initial connection confirmation
            yield f"data: {json.dumps({'type': 'connected', 'connection_id': connection_id})}\n\n"
            
            sent_commands = set()
            
            while connection_id in active_connections:
                # Find pending commands that haven't been sent yet
                pending_commands = [
                    cmd for cmd in command_queue 
                    if cmd["status"] == "pending" and cmd["id"] not in sent_commands
                ]
                
                for command in pending_commands:
                    # Mark command as sent
                    sent_commands.add(command["id"])
                    
                    # Send command via SSE
                    event_data = {
                        "type": "command",
                        "id": command["id"],
                        "data": {
                            "type": command["type"],
                            "selector": command["selector"],
                            "value": command["value"]
                        }
                    }
                    
                    yield f"data: {json.dumps(event_data)}\n\n"
                    print(f"Sent command {command['id']}: {command['type']}")
                    
                    # Add small delay between commands
                    await asyncio.sleep(0.1)
                
                # Check if all commands are done
                all_done = all(cmd["status"] in ["completed", "failed"] for cmd in command_queue)
                if all_done and len(sent_commands) == len(command_queue):
                    yield f"data: {json.dumps({'type': 'all_commands_completed'})}\n\n"
                    print("All commands completed, closing connection")
                    break
                
                # Wait before checking for new commands
                await asyncio.sleep(1)
                
        except asyncio.CancelledError:
            print(f"SSE connection {connection_id} cancelled")
        finally:
            active_connections.discard(connection_id)
            print(f"SSE connection {connection_id} closed")
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Cache-Control"
        }
    )

@app.post("/api/reset-commands")
async def reset_commands():
    """Reset all commands to pending status"""
    global command_results
    command_results.clear()
    
    for cmd in command_queue:
        cmd["status"] = "pending"
        if "completed_at" in cmd:
            del cmd["completed_at"]
        if "error" in cmd:
            del cmd["error"]
    
    print("Commands reset to pending status")
    return {"status": "reset", "commands": len(command_queue)}

if __name__ == "__main__":
    print("Starting Browser Steps SSE Server...")
    print("Available endpoints:")
    print("  - http://localhost:8000/health")
    print("  - http://localhost:8000/api/commands")
    print("  - http://localhost:8000/stream/browser-commands")
    print("  - http://localhost:8000/api/reset-commands")
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        log_level="info"
    )