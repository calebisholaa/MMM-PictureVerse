#!/bin/bash

# This script starts the network keep-alive pinger in the background

# Change to the directory where this script is located
cd "$(dirname "$0")"

# Create log directory if it doesn't exist
mkdir -p logs

# Kill any existing keep-alive process
pkill -f "keep-alive.sh" || true

# Start the keep-alive loop in the background
echo "Starting network keep-alive..."
chmod +x keep-alive.sh
./keep-alive.sh &

# Save the PID
echo $! > .keep_alive.pid

echo "Network keep-alive started with PID $(cat .keep_alive.pid)"
