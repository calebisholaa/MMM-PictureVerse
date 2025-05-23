#!/bin/bash

# cleanup-media.sh - Shell script to run CleanUpMedia.py
# This script handles setting up the environment and running the Python cleanup script

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PYTHON_DIR="${SCRIPT_DIR}/python"
LOG_DIR="${SCRIPT_DIR}/logs"
LOG_FILE="${LOG_DIR}/cleanup-media.log"

# Make sure the log directory exists
mkdir -p "$LOG_DIR"

# Record start time
echo "==================================================" >> "$LOG_FILE"
echo "Starting media cleanup at $(date)" >> "$LOG_FILE"
echo "==================================================" >> "$LOG_FILE"

# Check if we should use system Python or virtual environment
if [ -d "${PYTHON_DIR}/venv" ]; then
    echo "Virtual environment found, attempting to use it..." >> "$LOG_FILE"
    
    # Try to use venv, but continue even if it fails
    if [ -x "${PYTHON_DIR}/venv/bin/python" ]; then
        # venv is accessible and executable
        PYTHON="${PYTHON_DIR}/venv/bin/python"
        echo "Using Python from virtual environment" >> "$LOG_FILE"
    else
        # venv exists but Python not executable, use system Python
        PYTHON="python3"
        echo "Virtual environment Python not executable, using system Python" >> "$LOG_FILE"
    fi
else
    # No venv, use system Python
    PYTHON="python3"
    echo "No virtual environment found, using system Python" >> "$LOG_FILE"
fi

# Check if schedule package is installed
$PYTHON -c "import schedule" > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Schedule package not found, attempting to install..." >> "$LOG_FILE"
    
    # Try to install with pip
    if [ "$PYTHON" = "python3" ]; then
        # Using system Python
        pip3 install schedule >> "$LOG_FILE" 2>&1
    else
        # Using venv Python
        ${PYTHON_DIR}/venv/bin/pip install schedule >> "$LOG_FILE" 2>&1
    fi
    
    # Check if installation was successful
    $PYTHON -c "import schedule" > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "Failed to install schedule package. Please install it manually." >> "$LOG_FILE"
        echo "Failed to install schedule package. Please install it manually."
        exit 1
    fi
    
    echo "Schedule package installed successfully" >> "$LOG_FILE"
fi

# Run the cleanup script
echo "Running CleanUpMedia.py..." >> "$LOG_FILE"

# Check if the script exists
if [ -f "${PYTHON_DIR}/CleanUpMedia.py" ]; then
    # Make it executable
    chmod +x "${PYTHON_DIR}/CleanUpMedia.py"
    
    # Run the Python script, capturing output to log
    $PYTHON "${PYTHON_DIR}/CleanUpMedia.py" >> "$LOG_FILE" 2>&1
    
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]; then
        echo "CleanUpMedia.py completed successfully" >> "$LOG_FILE"
    else
        echo "CleanUpMedia.py exited with code $EXIT_CODE" >> "$LOG_FILE"
    fi
else
    echo "Error: CleanUpMedia.py not found at ${PYTHON_DIR}/CleanUpMedia.py" >> "$LOG_FILE"
    echo "Error: CleanUpMedia.py not found at ${PYTHON_DIR}/CleanUpMedia.py"
    exit 1
fi

echo "Media cleanup finished at $(date)" >> "$LOG_FILE"
echo "==================================================" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

exit 0