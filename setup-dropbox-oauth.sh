#!/bin/bash
#
# Dropbox OAuth2 Setup Script for MMM-PictureVerse
#

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PYTHON_DIR="${SCRIPT_DIR}/python"
VENV_DIR="${PYTHON_DIR}/venv"
PYTHON="${VENV_DIR}/bin/python"
CONFIG_TEMPLATE="${PYTHON_DIR}/dropbox_config_template.json"
CONFIG_FILE="${PYTHON_DIR}/dropbox_config.json"

echo "==================================================================="
echo "           Dropbox OAuth2 Setup for MMM-PictureVerse"
echo "==================================================================="
echo

# Check if Python virtual environment exists
if [ ! -d "$VENV_DIR" ]; then
    echo "Python virtual environment not found. Installing dependencies..."
    
    # Create virtual environment
    cd "$PYTHON_DIR"
    python3 -m venv venv
    
    # Activate and install dependencies
    source ${VENV_DIR}/bin/activate
    pip install --upgrade pip
    pip install dropbox requests
    
    echo "Virtual environment created and dependencies installed."
else
    echo "Python virtual environment found at: $VENV_DIR"
fi

# Check if config template exists
if [ ! -f "$CONFIG_TEMPLATE" ]; then
    echo "Error: Config template not found at $CONFIG_TEMPLATE"
    echo "Please ensure the template file exists before running this script."
    exit 1
fi

# If config doesn't exist, create it from template
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Creating config file from template..."
    cp "$CONFIG_TEMPLATE" "$CONFIG_FILE"
    
    echo "Config file created at: $CONFIG_FILE"
    echo "You need to edit this file with your Dropbox app credentials."
    echo
    
    # Prompt user to edit the config file
    read -p "Would you like to edit the config file now? (y/n): " EDIT_CONFIG
    if [[ "$EDIT_CONFIG" =~ ^[Yy]$ ]]; then
        if command -v nano >/dev/null 2>&1; then
            nano "$CONFIG_FILE"
        elif command -v vi >/dev/null 2>&1; then
            vi "$CONFIG_FILE"
        else
            echo "No editor found. Please edit $CONFIG_FILE manually before continuing."
            exit 1
        fi
    else
        echo "Please edit $CONFIG_FILE manually before continuing."
        exit 0
    fi
else
    echo "Config file already exists at: $CONFIG_FILE"
fi

# Run the OAuth setup
echo
echo "Starting OAuth setup process..."
cd "$PYTHON_DIR"
"$PYTHON" DropboxOAuth.py setup

if [ $? -eq 0 ]; then
    echo
    echo "==================================================================="
    echo "Dropbox OAuth2 setup complete!"
    echo "Your authentication will now refresh automatically when tokens expire."
    echo "==================================================================="
else
    echo
    echo "Error: Dropbox OAuth setup failed. Please check the output above for details."
    exit 1
fi

# Test the connection by running a sync
echo
echo "Testing Dropbox connection with a sync operation..."
cd "$SCRIPT_DIR"
"$PYTHON" "$PYTHON_DIR/Dropbox.py"

if [ $? -eq 0 ]; then
    echo
    echo "==================================================================="
    echo "Setup completed successfully! Your photos should now sync from Dropbox."
    echo "==================================================================="
else
    echo
    echo "Warning: Sync test failed. Please check the output above for details."
    echo "You may need to run this setup again with corrected settings."
    exit 1
fi

exit 0