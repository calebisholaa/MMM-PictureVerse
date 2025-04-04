"""
Dropbox sync module for MMM-PictureVerse
Downloads photos from Dropbox to local directory
Uses OAuth2 authentication with automatic token refresh
"""

import os
import json
import sys
import time
from dropbox.exceptions import ApiError, AuthError
from DropboxOAuth import get_dropbox_client

# Define paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(SCRIPT_DIR, "dropbox_config.json")
LOCAL_FOLDER = os.path.join(SCRIPT_DIR, "Pictures")

def load_config():
    """Load configuration from file"""
    print(f"Loading config from: {CONFIG_FILE}")
    
    if not os.path.exists(CONFIG_FILE):
        print(f"Error: Config file not found at {CONFIG_FILE}")
        raise FileNotFoundError("Please create dropbox_config.json from dropbox_config_template.json")
    
    try:
        with open(CONFIG_FILE, "r") as f:
            config = json.load(f)
            
        dropbox_folder = config.get("dropbox_folder", "")
        if not dropbox_folder:
            print("Warning: dropbox_folder is not specified in config")
        else:
            print(f"Using Dropbox folder: {dropbox_folder}")
            
        return config
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in config file: {e}")
        raise
    except Exception as e:
        print(f"Error loading config: {e}")
        raise

def ensure_local_folder():
    """Ensure local Pictures folder exists and is writable"""
    print(f"Local folder path: {LOCAL_FOLDER}")
    
    if not os.path.exists(LOCAL_FOLDER):
        print(f"Creating local folder: {LOCAL_FOLDER}")
        os.makedirs(LOCAL_FOLDER)
    else:
        print(f"Local folder exists: {LOCAL_FOLDER}")
    
    # Test write access
    try:
        test_file = os.path.join(LOCAL_FOLDER, ".test_write")
        with open(test_file, "w") as f:
            f.write("test")
        os.remove(test_file)
        print("Local folder is writable")
        return True
    except Exception as e:
        print(f"Warning: Local folder might not be writable: {e}")
        return False

def download_images():
    """
    Main function to download images from Dropbox to local folder
    Returns True if successful, False otherwise
    """
    print(f"Starting Dropbox sync process at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        # Load configuration
        config = load_config()
        
        # Ensure local folder exists and is writable
        if not ensure_local_folder():
            print("Error: Local folder is not accessible")
            return False
        
        # Get allowed file extensions from config or use defaults
        allowed_extensions = config.get("allowed_extensions", [".jpg", ".jpeg", ".png", ".gif"])
        print(f"Allowed file extensions: {', '.join(allowed_extensions)}")
        
        # Get the Dropbox client with OAuth2
        print("Connecting to Dropbox...")
        dbx = get_dropbox_client()
        if not dbx:
            print("Failed to connect to Dropbox")
            return False
        
        # List files in the Dropbox folder
        dropbox_folder = config.get("dropbox_folder", "")
        
        try:
            print(f"Listing files in Dropbox folder: {dropbox_folder}")
            result = dbx.files_list_folder(dropbox_folder)
            
            # Filter for files (not folders) and allowed extensions
            dropbox_files = {}
            for entry in result.entries:
                # Check if it's a file (not a folder)
                if hasattr(entry, 'name') and hasattr(entry, 'path_lower'):
                    # Check if it has an allowed extension
                    if any(entry.name.lower().endswith(ext) for ext in allowed_extensions):
                        dropbox_files[entry.name] = entry
            
            print(f"Found {len(dropbox_files)} image files in Dropbox folder")
            
            # Continue listing if there are more files
            while result.has_more:
                result = dbx.files_list_folder_continue(result.cursor)
                for entry in result.entries:
                    if hasattr(entry, 'name') and hasattr(entry, 'path_lower'):
                        if any(entry.name.lower().endswith(ext) for ext in allowed_extensions):
                            dropbox_files[entry.name] = entry
                
                print(f"Found {len(dropbox_files)} image files in Dropbox folder (after paging)")
            
            # Get list of files in local folder
            local_files = set(os.listdir(LOCAL_FOLDER)) if os.path.exists(LOCAL_FOLDER) else set()
            print(f"Found {len(local_files)} files in local folder")
            
            # Download new files
            files_downloaded = 0
            for filename, entry in dropbox_files.items():
                local_path = os.path.join(LOCAL_FOLDER, filename)
                if not os.path.exists(local_path):  # avoid re-downloading
                    print(f"Downloading {filename} to {local_path}")
                    try:
                        # Download the file
                        metadata, response = dbx.files_download(entry.path_lower)
                        
                        # Save to local file
                        with open(local_path, "wb") as f:
                            f.write(response.content)
                            
                        files_downloaded += 1
                        print(f"Successfully downloaded {filename}")
                    except Exception as e:
                        print(f"Error downloading {filename}: {e}")
            
            print(f"Downloaded {files_downloaded} new files")
            
            # Remove files that no longer exist in Dropbox
            files_removed = 0
            for local_file in local_files:
                # Skip hidden files and non-regular files
                if local_file.startswith('.') or not os.path.isfile(os.path.join(LOCAL_FOLDER, local_file)):
                    continue
                    
                if local_file not in dropbox_files:
                    try:
                        local_path = os.path.join(LOCAL_FOLDER, local_file)
                        print(f"Removing {local_file} (no longer in Dropbox)")
                        os.remove(local_path)
                        files_removed += 1
                    except Exception as e:
                        print(f"Error removing {local_file}: {e}")
            
            print(f"Removed {files_removed} files that are no longer in Dropbox")
            
            # Final verification
            final_files = os.listdir(LOCAL_FOLDER) if os.path.exists(LOCAL_FOLDER) else []
            print(f"Final file count in local folder: {len(final_files)}")
            
            # Sync complete
            print(f"Dropbox sync completed successfully at {time.strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"Summary: Downloaded {files_downloaded} files, removed {files_removed} files")
            return True
            
        except ApiError as e:
            error_message = str(e)
            
            # Handle common API errors
            if "not_found" in error_message:
                print(f"Error: Dropbox folder '{dropbox_folder}' not found")
                print("Please check that the folder exists in your Dropbox account")
            elif "invalid_access_token" in error_message:
                print("Error: Invalid access token")
                print("Please run the OAuth setup again: python DropboxOAuth.py setup")
            else:
                print(f"Dropbox API Error: {e}")
                
            return False
            
        except Exception as e:
            print(f"Error listing Dropbox files: {e}")
            return False
            
    except Exception as e:
        print(f"Dropbox sync error: {e}")
        return False

if __name__ == "__main__":
    print(f"Python version: {sys.version}")
    print(f"Script directory: {SCRIPT_DIR}")
    
    success = download_images()
    
    if success:
        print("Dropbox sync completed successfully!")
        sys.exit(0)
    else:
        print("Dropbox sync failed")
        sys.exit(1)