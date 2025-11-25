"""
Dropbox sync module - DIAGNOSTIC VERSION
This version has extra error logging to help identify the issue
"""

import os
import json
import sys
import time

# Print diagnostic info first
print("=" * 60)
print("DROPBOX DIAGNOSTIC VERSION")
print("=" * 60)
print(f"Python version: {sys.version}")
print(f"Current directory: {os.getcwd()}")
print(f"Script location: {os.path.abspath(__file__)}")

# Try to import Dropbox modules
try:
    print("\nTrying to import dropbox module...")
    from dropbox.exceptions import ApiError, AuthError
    print("[OK] dropbox module imported successfully")
except ImportError as e:
    print(f"[ERROR] Failed to import dropbox module: {e}")
    print("Run: pip install dropbox --break-system-packages")
    sys.exit(1)

try:
    print("Trying to import DropboxOAuth...")
    from DropboxOAuth import get_dropbox_client
    print("[OK] DropboxOAuth imported successfully")
except ImportError as e:
    print(f"[ERROR] Failed to import DropboxOAuth: {e}")
    print(f"Make sure DropboxOAuth.py exists in: {os.path.dirname(__file__)}")
    sys.exit(1)

# Define paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(SCRIPT_DIR, "dropbox_config.json")
LOCAL_FOLDER = os.path.join(SCRIPT_DIR, "Pictures")

print(f"\nPaths:")
print(f"  Config file: {CONFIG_FILE}")
print(f"  Local folder: {LOCAL_FOLDER}")
print(f"  Config exists: {os.path.exists(CONFIG_FILE)}")
print(f"  Local folder exists: {os.path.exists(LOCAL_FOLDER)}")

def load_config():
    """Load configuration from file"""
    print(f"\n[STEP 1] Loading config from: {CONFIG_FILE}")
    
    if not os.path.exists(CONFIG_FILE):
        print(f"[ERROR] Config file not found at {CONFIG_FILE}")
        raise FileNotFoundError("Please create dropbox_config.json from dropbox_config_template.json")
    
    try:
        with open(CONFIG_FILE, "r") as f:
            config = json.load(f)
            
        print(f"[OK] Config loaded successfully")
        
        dropbox_folder = config.get("dropbox_folder", "")
        if not dropbox_folder:
            print("[WARNING] dropbox_folder is not specified in config")
        else:
            print(f"  Dropbox folder: {dropbox_folder}")
        
        # Check sync mode
        sync_mode = config.get("sync_mode", "two-way")
        if sync_mode not in ["two-way", "download-only"]:
            print(f"[WARNING] Invalid sync_mode '{sync_mode}', using 'two-way'")
            sync_mode = "two-way"
        print(f"  Sync mode: {sync_mode}")
        
        # Check rate limiting
        rate_limit_delay = config.get("rate_limit_delay", 0.5)
        print(f"  Rate limit delay: {rate_limit_delay}s")
            
        return config
    except json.JSONDecodeError as e:
        print(f"[ERROR] Invalid JSON in config file: {e}")
        raise
    except Exception as e:
        print(f"[ERROR] Error loading config: {e}")
        raise

def ensure_local_folder():
    """Ensure local Pictures folder exists and is writable"""
    print(f"\n[STEP 2] Checking local folder: {LOCAL_FOLDER}")
    
    if not os.path.exists(LOCAL_FOLDER):
        print(f"  Creating local folder...")
        os.makedirs(LOCAL_FOLDER)
        print(f"  [OK] Folder created")
    else:
        print(f"  [OK] Folder exists")
    
    # Test write access
    try:
        test_file = os.path.join(LOCAL_FOLDER, ".test_write")
        with open(test_file, "w") as f:
            f.write("test")
        os.remove(test_file)
        print(f"  [OK] Folder is writable")
        return True
    except Exception as e:
        print(f"  [ERROR] Folder not writable: {e}")
        return False

def download_images():
    """
    Main function to download images from Dropbox to local folder
    Returns True if successful, False otherwise
    """
    print(f"\n{'=' * 60}")
    print(f"STARTING DROPBOX SYNC")
    print(f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'=' * 60}")
    
    try:
        # Load configuration
        config = load_config()
        
        # Ensure local folder exists and is writable
        if not ensure_local_folder():
            print("[ERROR] Local folder is not accessible")
            return False
        
        # Get settings from config
        allowed_extensions = config.get("allowed_extensions", [".jpg", ".jpeg", ".png", ".gif"])
        sync_mode = config.get("sync_mode", "two-way")
        rate_limit_delay = config.get("rate_limit_delay", 0.5)
        
        print(f"\n[STEP 3] Connecting to Dropbox...")
        print(f"  Allowed extensions: {', '.join(allowed_extensions)}")
        
        # Get the Dropbox client with OAuth2
        try:
            dbx = get_dropbox_client()
            if not dbx:
                print("[ERROR] get_dropbox_client() returned None")
                return False
            print("[OK] Connected to Dropbox")
        except Exception as e:
            print(f"[ERROR] Failed to connect to Dropbox: {e}")
            import traceback
            traceback.print_exc()
            return False
        
        # List files in the Dropbox folder
        dropbox_folder = config.get("dropbox_folder", "")
        
        try:
            print(f"\n[STEP 4] Listing files in Dropbox folder: {dropbox_folder}")
            result = dbx.files_list_folder(dropbox_folder)
            
            # Filter for files (not folders) and allowed extensions
            dropbox_files = {}
            for entry in result.entries:
                if hasattr(entry, 'name') and hasattr(entry, 'path_lower'):
                    if any(entry.name.lower().endswith(ext) for ext in allowed_extensions):
                        dropbox_files[entry.name] = entry
            
            print(f"  Found {len(dropbox_files)} image files")
            
            # Continue listing if there are more files
            while result.has_more:
                result = dbx.files_list_folder_continue(result.cursor)
                for entry in result.entries:
                    if hasattr(entry, 'name') and hasattr(entry, 'path_lower'):
                        if any(entry.name.lower().endswith(ext) for ext in allowed_extensions):
                            dropbox_files[entry.name] = entry
                print(f"  Found {len(dropbox_files)} total image files (after paging)")
            
            # Get list of files in local folder
            local_files = set(os.listdir(LOCAL_FOLDER)) if os.path.exists(LOCAL_FOLDER) else set()
            print(f"  Local files: {len(local_files)}")
            
            # Download new files
            print(f"\n[STEP 5] Downloading new files...")
            files_downloaded = 0
            files_failed = 0
            
            for filename, entry in dropbox_files.items():
                local_path = os.path.join(LOCAL_FOLDER, filename)
                if not os.path.exists(local_path):
                    print(f"  Downloading: {filename}")
                    try:
                        metadata, response = dbx.files_download(entry.path_lower)
                        
                        with open(local_path, "wb") as f:
                            f.write(response.content)
                        
                        if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
                            files_downloaded += 1
                            print(f"    [OK] {filename} ({os.path.getsize(local_path):,} bytes)")
                        else:
                            files_failed += 1
                            print(f"    [ERROR] File empty or missing")
                            if os.path.exists(local_path):
                                os.remove(local_path)
                        
                        if rate_limit_delay > 0:
                            time.sleep(rate_limit_delay)
                            
                    except ApiError as e:
                        files_failed += 1
                        print(f"    [ERROR] API error: {e}")
                        
                    except Exception as e:
                        files_failed += 1
                        print(f"    [ERROR] {e}")
            
            print(f"\n  Download summary: {files_downloaded} successful, {files_failed} failed")
            
            # Handle file removal based on sync mode
            files_removed = 0
            if sync_mode == "two-way":
                print(f"\n[STEP 6] Checking for files to remove (two-way sync)...")
                
                for local_file in local_files:
                    if local_file.startswith('.') or not os.path.isfile(os.path.join(LOCAL_FOLDER, local_file)):
                        continue
                    
                    if not any(local_file.lower().endswith(ext) for ext in allowed_extensions):
                        continue
                    
                    if local_file not in dropbox_files:
                        try:
                            local_path = os.path.join(LOCAL_FOLDER, local_file)
                            print(f"  Removing: {local_file}")
                            os.remove(local_path)
                            files_removed += 1
                        except Exception as e:
                            print(f"    [ERROR] {e}")
                
                print(f"  Removed {files_removed} files")
            else:
                print(f"\n[STEP 6] Skipping file removal (download-only mode)")
            
            # Final verification
            final_files = os.listdir(LOCAL_FOLDER) if os.path.exists(LOCAL_FOLDER) else []
            image_files = [f for f in final_files if any(f.lower().endswith(ext) for ext in allowed_extensions)]
            
            print(f"\n{'=' * 60}")
            print(f"SYNC COMPLETE")
            print(f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"{'=' * 60}")
            print(f"Summary:")
            print(f"  - Downloaded: {files_downloaded} files")
            print(f"  - Failed: {files_failed} files")
            print(f"  - Removed: {files_removed} files")
            print(f"  - Final count: {len(image_files)} images in local folder")
            print(f"{'=' * 60}")
            
            return True  # Always return True if we got this far without exceptions
            
        except ApiError as e:
            error_message = str(e)
            print(f"\n[ERROR] Dropbox API Error:")
            
            if "not_found" in error_message:
                print(f"  Folder not found: '{dropbox_folder}'")
                print(f"  Check that the folder exists in your Dropbox account")
            elif "invalid_access_token" in error_message:
                print(f"  Invalid access token")
                print(f"  Run: npm run setup-dropbox-oauth")
            elif "rate_limit" in error_message.lower():
                print(f"  API rate limit exceeded")
                print(f"  Increase 'rate_limit_delay' in dropbox_config.json")
            else:
                print(f"  {e}")
                
            return False
            
        except Exception as e:
            print(f"\n[ERROR] Unexpected error in download process:")
            print(f"  {e}")
            import traceback
            traceback.print_exc()
            return False
            
    except Exception as e:
        print(f"\n[ERROR] Fatal error:")
        print(f"  {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    try:
        success = download_images()
        
        if success:
            print("\n[OK] Script completed successfully")
            sys.exit(0)
        else:
            print("\n[ERROR] Script completed with errors")
            sys.exit(1)
            
    except Exception as e:
        print(f"\n[FATAL ERROR] Unhandled exception:")
        print(f"  {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)