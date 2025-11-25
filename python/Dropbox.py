"""
Dropbox sync module for MMM-PictureVerse - FIXED VERSION
Downloads photos from Dropbox to local directory
Uses OAuth2 authentication with automatic token refresh
FIXED: Added configurable sync mode to prevent accidental deletions
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
        
        # NEW: Check sync mode
        sync_mode = config.get("sync_mode", "two-way")
        if sync_mode not in ["two-way", "download-only"]:
            print(f"Warning: Invalid sync_mode '{sync_mode}', using 'two-way'")
            sync_mode = "two-way"
        print(f"Sync mode: {sync_mode}")
        
        # NEW: Check rate limiting
        rate_limit_delay = config.get("rate_limit_delay", 0.5)
        print(f"Rate limit delay: {rate_limit_delay}s between downloads")
            
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
        
        # Get settings from config
        allowed_extensions = config.get("allowed_extensions", [".jpg", ".jpeg", ".png", ".gif"])
        sync_mode = config.get("sync_mode", "two-way")
        rate_limit_delay = config.get("rate_limit_delay", 0.5)
        
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
            files_failed = 0
            
            for filename, entry in dropbox_files.items():
                local_path = os.path.join(LOCAL_FOLDER, filename)
                if not os.path.exists(local_path):  # avoid re-downloading
                    print(f"Downloading {filename}...")
                    try:
                        # Download the file
                        metadata, response = dbx.files_download(entry.path_lower)
                        
                        # Save to local file
                        with open(local_path, "wb") as f:
                            f.write(response.content)
                        
                        # Verify file was saved
                        if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
                            files_downloaded += 1
                            print(f"  ✓ Successfully downloaded {filename} ({os.path.getsize(local_path):,} bytes)")
                        else:
                            files_failed += 1
                            print(f"  ✗ Download failed: file is empty or missing")
                            if os.path.exists(local_path):
                                os.remove(local_path)
                        
                        # FIX: Add rate limiting to avoid API limits
                        if rate_limit_delay > 0:
                            time.sleep(rate_limit_delay)
                            
                    except ApiError as e:
                        files_failed += 1
                        print(f"  ✗ API error downloading {filename}: {e}")
                        # Continue with next file instead of failing completely
                        
                    except Exception as e:
                        files_failed += 1
                        print(f"  ✗ Error downloading {filename}: {e}")
            
            print(f"\nDownload summary: {files_downloaded} successful, {files_failed} failed")
            
            # FIX: Only remove files if sync_mode is "two-way"
            files_removed = 0
            if sync_mode == "two-way":
                print(f"\nSync mode is 'two-way' - checking for files to remove...")
                
                for local_file in local_files:
                    # Skip hidden files and non-regular files
                    if local_file.startswith('.') or not os.path.isfile(os.path.join(LOCAL_FOLDER, local_file)):
                        continue
                    
                    # Skip files that don't match allowed extensions
                    if not any(local_file.lower().endswith(ext) for ext in allowed_extensions):
                        print(f"  Skipping {local_file} (not in allowed extensions)")
                        continue
                    
                    if local_file not in dropbox_files:
                        try:
                            local_path = os.path.join(LOCAL_FOLDER, local_file)
                            print(f"  Removing {local_file} (no longer in Dropbox)")
                            os.remove(local_path)
                            files_removed += 1
                        except Exception as e:
                            print(f"  ✗ Error removing {local_file}: {e}")
                
                print(f"Removed {files_removed} files that are no longer in Dropbox")
            else:
                print(f"\nSync mode is 'download-only' - skipping file removal")
                print("Local files will NOT be deleted even if removed from Dropbox")
            
            # Final verification
            final_files = os.listdir(LOCAL_FOLDER) if os.path.exists(LOCAL_FOLDER) else []
            image_files = [f for f in final_files if any(f.lower().endswith(ext) for ext in allowed_extensions)]
            print(f"\nFinal image count in local folder: {len(image_files)}")
            
            # Sync complete
            print(f"\nDropbox sync completed at {time.strftime('%Y-%m-%d %H:%M:%S')}")
            print("=" * 60)
            print(f"Summary:")
            print(f"  - Downloaded: {files_downloaded} files")
            print(f"  - Failed: {files_failed} files")
            if sync_mode == "two-way":
                print(f"  - Removed: {files_removed} files")
            else:
                print(f"  - Removed: 0 files (download-only mode)")
            print("=" * 60)
            
            return files_downloaded > 0 or files_removed > 0
            
        except ApiError as e:
            error_message = str(e)
            
            # Handle common API errors
            if "not_found" in error_message:
                print(f"Error: Dropbox folder '{dropbox_folder}' not found")
                print("Please check that the folder exists in your Dropbox account")
            elif "invalid_access_token" in error_message:
                print("Error: Invalid access token")
                print("Please run the OAuth setup again: npm run setup-dropbox-oauth")
            elif "rate_limit" in error_message.lower():
                print("Error: Dropbox API rate limit exceeded")
                print("Try increasing 'rate_limit_delay' in dropbox_config.json")
            else:
                print(f"Dropbox API Error: {e}")
                
            return False
            
        except Exception as e:
            print(f"Error listing Dropbox files: {e}")
            import traceback
            traceback.print_exc()
            return False
            
    except Exception as e:
        print(f"Dropbox sync error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("Dropbox Sync Script - Fixed Version")
    print("=" * 60)
    print(f"Python version: {sys.version}")
    print(f"Script directory: {SCRIPT_DIR}")
    print("=" * 60)
    print()
    
    success = download_images()
    
    if success:
        print("\n✓ Dropbox sync completed successfully!")
        sys.exit(0)
    else:
        print("\n✗ Dropbox sync failed")
        sys.exit(1)
