#!/bin/bash

# Script to start Chrome with the Puppeteer extension loaded

EXTENSION_DIR="$(pwd)"
PROFILE_DIR="$(pwd)/profile"

# Create profile directory if it doesn't exist
mkdir -p "$PROFILE_DIR"

echo "Starting Chrome with Puppeteer extension..."
echo "Extension directory: $EXTENSION_DIR"
echo "Profile directory: $PROFILE_DIR"

# Function to cleanup Chrome processes
cleanup() {
  echo ""
  echo "Shutting down Chrome..."
  if [[ -n $CHROME_PID ]]; then
    kill $CHROME_PID 2>/dev/null
    wait $CHROME_PID 2>/dev/null
  fi
  # Kill any remaining Chrome processes using this profile
  pkill -f "user-data-dir=$PROFILE_DIR" 2>/dev/null
  echo "Chrome shutdown complete."
  exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start Chrome with the extension loaded
google-chrome \
  --user-data-dir="$PROFILE_DIR" \
  --load-extension="$EXTENSION_DIR" \
  --disable-extensions-except="$EXTENSION_DIR" \
  --no-first-run \
  --disable-default-apps \
  --disable-popup-blocking \
  --disable-translate \
  --new-window \
  &

CHROME_PID=$!

echo "Chrome started with extension loaded! (PID: $CHROME_PID)"
echo "You can now use the Puppeteer extension from the toolbar."
echo "Press Ctrl+C to stop Chrome and exit this script."

# Wait for Chrome to exit or for signal
wait $CHROME_PID