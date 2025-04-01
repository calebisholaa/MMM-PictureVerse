#!/bin/bash

# This script sets up a Python virtual environment for MMM-PictureVerse

# Change to the directory where this script is located
cd "$(dirname "$0")"

echo "Setting up Python virtual environment for MMM-PictureVerse..."

# Check if python3-venv is installed
if ! dpkg -l | grep -q python3-venv; then
  echo "python3-venv is not installed. Please install it with:"
  echo "sudo apt update && sudo apt install python3-venv"
  exit 1
fi

# Create the virtual environment if it doesn't exist
if [ ! -d "python/venv" ]; then
  echo "Creating virtual environment..."
  python3 -m venv python/venv
  
  # Check if virtual environment was created successfully
  if [ ! -d "python/venv" ]; then
    echo "Failed to create virtual environment."
    exit 1
  fi
  
  echo "Virtual environment created successfully."
else
  echo "Virtual environment already exists."
fi

# Activate the virtual environment and install dependencies
echo "Installing Python dependencies..."
python/venv/bin/pip install --upgrade pip
python/venv/bin/pip install dropbox blinkpy aiohttp

echo "Setup complete!"
echo "You can now use 'npm run setup-blink' to configure Blink cameras"
echo "and 'npm run sync-dropbox' to sync your Dropbox photos."