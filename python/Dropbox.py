import dropbox
import os
import json
import sys

# Define paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(SCRIPT_DIR, "dropbox_config.json")
LOCAL_FOLDER = os.path.join(SCRIPT_DIR, "Pictures")

def load_config():
    print(f"Looking for config file at: {CONFIG_FILE}")
    if not os.path.exists(CONFIG_FILE):
        print(f"Error: Config file not found at {CONFIG_FILE}")
        raise FileNotFoundError("Please create dropbox_config.json from dropbox_config_template.json")
    
    try:
        with open(CONFIG_FILE, "r") as f:
            config = json.load(f)
            print(f"Config loaded successfully. Dropbox folder path: {config.get('dropbox_folder', 'Not specified')}")
            return config
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in config file: {e}")
        raise
    except Exception as e:
        print(f"Error loading config: {e}")
        raise

def download_images():
    print(f"Starting Dropbox sync process...")
    
    try:
        config = load_config()
        
        # Check access token format (without exposing the full token)
        token = config.get("access_token", "")
        token_preview = token[:5] + "..." + token[-5:] if len(token) > 10 else "Invalid token"
        print(f"Using Dropbox access token: {token_preview}")
        
        # Check if local folder exists and is writable
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
            except Exception as e:
                print(f"Warning: Local folder might not be writable: {e}")
        
        # Initialize Dropbox API
        print("Initializing Dropbox client...")
        try:
            dbx = dropbox.Dropbox(config["access_token"])
            account = dbx.users_get_current_account()
            print(f"Connected to Dropbox as: {account.name.display_name} ({account.email})")
        except dropbox.exceptions.AuthError:
            print("Error: Invalid access token. Please generate a new one.")
            return False
        except Exception as e:
            print(f"Error connecting to Dropbox: {e}")
            return False

        # Check if folder exists
        dropbox_folder = config.get("dropbox_folder", "")
        print(f"Listing files in Dropbox folder: {dropbox_folder}")
        
        try:
            result = dbx.files_list_folder(dropbox_folder)
            print(f"Found {len(result.entries)} entries in Dropbox folder")
            
            # Get current list of files from Dropbox
            dropbox_files = {entry.name: entry for entry in result.entries if isinstance(entry, dropbox.files.FileMetadata)}
            print(f"Found {len(dropbox_files)} files in Dropbox folder")
            
            # Print list of files
            if dropbox_files:
                print("Files in Dropbox folder:")
                for name in dropbox_files.keys():
                    print(f"  - {name}")
            else:
                print("No files found in the Dropbox folder")
                
            # Get current list of local files
            local_files = set(os.listdir(LOCAL_FOLDER)) if os.path.exists(LOCAL_FOLDER) else set()
            print(f"Found {len(local_files)} files in local folder")
            
            # Download new files
            files_downloaded = 0
            for filename, entry in dropbox_files.items():
                local_path = os.path.join(LOCAL_FOLDER, filename)
                if not os.path.exists(local_path):  # avoid re-downloading
                    print(f"Downloading {filename} to {local_path}")
                    try:
                        _, res = dbx.files_download(entry.path_lower)
                        with open(local_path, "wb") as f:
                            f.write(res.content)
                        files_downloaded += 1
                        print(f"Successfully downloaded {filename}")
                    except Exception as e:
                        print(f"Error downloading {filename}: {e}")
            
            print(f"Downloaded {files_downloaded} new files")
            
            # Remove files that no longer exist in Dropbox
            files_removed = 0
            for local_file in local_files:
                if local_file not in dropbox_files and os.path.isfile(os.path.join(LOCAL_FOLDER, local_file)):
                    try:
                        print(f"Removing {local_file} (no longer in Dropbox)")
                        os.remove(os.path.join(LOCAL_FOLDER, local_file))
                        files_removed += 1
                    except Exception as e:
                        print(f"Error removing {local_file}: {e}")
            
            print(f"Removed {files_removed} files")
            
            # Final verification
            final_files = os.listdir(LOCAL_FOLDER) if os.path.exists(LOCAL_FOLDER) else []
            print(f"Final file count in local folder: {len(final_files)}")
            
            return True
        except dropbox.exceptions.ApiError as e:
            print(f"Dropbox API Error: {e}")
            return False
        
    except Exception as e:
        print(f"Dropbox sync error: {e}")
        return False

if __name__ == "__main__":
    print(f"Python version: {sys.version}")
    print(f"Script directory: {SCRIPT_DIR}")
    success = download_images()
    print(f"Dropbox sync {'successful' if success else 'failed'}")