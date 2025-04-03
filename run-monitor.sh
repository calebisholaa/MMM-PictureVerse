#!/bin/bash

# This script runs the Blink monitor in a more resilient way

# Change to the directory where this script is located
cd "$(dirname "$0")"

# Create logs directory if it doesn't exist
mkdir -p logs

# Path to Python and script
PYTHON="python/venv/bin/python"
SCRIPT="python/BlinkMonitor.py"
LOG="logs/blink_monitor.log"

# Kill any existing processes
pkill -f "python/BlinkMonitor.py" || true

# Check if the virtual environment exists
if [ ! -d "python/venv" ]; then
  echo "Virtual environment not found. Please run 'npm install' first."
  exit 1
fi

# Check if Blink credentials exist
if [ ! -f "python/creds.json" ]; then
  echo "Blink credentials not found. Please run 'npm run setup-blink' first."
  exit 1
fi

# Start the monitor
echo "Starting Blink monitor at $(date)" >> "$LOG"
"$PYTHON" "$SCRIPT" >> "$LOG" 2>&1 &

# Save PID
echo $! > .blink_monitor.pid
echo "Monitor started with PID $!" >> "$LOG"
echo "Blink motion monitor started. Check logs at: $LOG"