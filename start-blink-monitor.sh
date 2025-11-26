#!/bin/bash

# This script starts the Blink motion monitor in the background

# Change to the directory where this script is located
cd "$(dirname "$0")"

# Check if the virtual environment exists
if [ ! -d "python/venv" ]; then
  echo "Virtual environment not found. Please run 'npm install' first."
  exit 1
fi

# Create log directory if it doesn't exist
mkdir -p logs

# Kill any existing monitor process
pkill -f "python/BlinkMonitor.py" || true

# Start the motion monitor in the background
echo "Starting Blink motion monitor..."

# Save the PID
echo $! > .blink_monitor.pid

echo "Blink motion monitor started with PID $(cat .blink_monitor.pid)"
