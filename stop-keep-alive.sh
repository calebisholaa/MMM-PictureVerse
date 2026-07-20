#!/bin/bash

# This script stops the network keep-alive pinger

# Change to the directory where this script is located
cd "$(dirname "$0")"

# Check if PID file exists
if [ -f .keep_alive.pid ]; then
  PID=$(cat .keep_alive.pid)
  echo "Stopping network keep-alive (PID: $PID)..."

  # Kill the process
  kill $PID 2>/dev/null || true

  # Remove PID file
  rm .keep_alive.pid

  echo "Network keep-alive stopped."
else
  echo "No running keep-alive found."

  # Try to find and kill any running instances
  pkill -f "keep-alive.sh" && echo "Killed running keep-alive process."
fi
