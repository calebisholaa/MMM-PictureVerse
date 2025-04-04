#!/bin/bash
#
# Dropbox Sync Script for MMM-PictureVerse
#

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PYTHON_DIR="${SCRIPT_DIR}/python"
VENV_DIR="${PYTHON_DIR}/venv"
PYTHON="${VENV_DIR}/bin/python"
LOG_FILE="${SCRIPT_DIR}/logs/dropbox-sync.log"

# Create logs directory if it doesn't exist
mkdir -p "${SCRIPT_DIR}/logs"

echo "Starting Dropbox sync at $(date)" | tee -a "$LOG_FILE"

# Check if Python virtual environment exists
if [ ! -d "$VENV_DIR" ]; then
    echo "Error: Python virtual environment not found at $VENV_DIR" | tee -a "$LOG_FILE"
    echo "Please run 'npm install' to set up the virtual environment." | tee -a "$LOG_FILE"
    exit 1
fi

# Check if the Dropbox script exists
if [ ! -f "${PYTHON_DIR}/Dropbox.py" ]; then
    echo "Error: Dropbox.py not found at ${PYTHON_DIR}/Dropbox.py" | tee -a "$LOG_FILE"
    exit 1
fi

# Check if token file exists, if not suggest setting up OAuth
TOKEN_FILE="${PYTHON_DIR}/dropbox_token.json"
if [ ! -f "$TOKEN_FILE" ]; then
    echo "Token file not found. You need to set up OAuth2 authentication." | tee -a "$LOG_FILE"
    echo "Run 'npm run setup-dropbox-oauth' to set up Dropbox authentication." | tee -a "$LOG_FILE"
    exit 1
fi

# Run the Dropbox sync script
echo "Running Dropbox sync..." | tee -a "$LOG_FILE"
cd "$SCRIPT_DIR"
"$PYTHON" "${PYTHON_DIR}/Dropbox.py" 2>&1 | tee -a "$LOG_FILE"

SYNC_RESULT=${PIPESTATUS[0]}
if [ $SYNC_RESULT -eq 0 ]; then
    echo "Dropbox sync completed successfully at $(date)" | tee -a "$LOG_FILE"
    exit 0
else
    echo "Dropbox sync failed with exit code $SYNC_RESULT at $(date)" | tee -a "$LOG_FILE"
    echo "Check the log file for details: $LOG_FILE" | tee -a "$LOG_FILE"
    exit 1
fi