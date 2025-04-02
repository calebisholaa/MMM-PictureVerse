#!/bin/bash

# This script stops the Blink motion monitor

# Change to the directory where this script is located
cd "$(dirname "$0")"

# Check if PID file exists
if [ -f .blink_monitor.pid ]; then
  PID=$(cat .blink_monitor.pid)
  echo "Stopping Blink motion monitor (PID: $PID)..."
  
  # Kill the process
  kill $PID 2>/dev/null || true
  
  # Remove PID file
  rm .blink_monitor.pid
  
  echo "Blink motion monitor stopped."
else
  echo "No running Blink monitor found."
  
  # Try to find and kill any running instances
  pkill -f "python/BlinkMonitor.py" && echo "Killed running monitor process."
fi