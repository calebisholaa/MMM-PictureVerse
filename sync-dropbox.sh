#!/bin/bash

# This script syncs Dropbox photos using the Python virtual environment

# Change to the directory where this script is located
cd "$(dirname "$0")"

# Check if the virtual environment exists
if [ ! -d "python/venv" ]; then
  echo "Virtual environment not found. Please run 'npm install' first."
  exit 1
fi

# Run the Dropbox sync script
python/venv/bin/python python/Dropbox.py