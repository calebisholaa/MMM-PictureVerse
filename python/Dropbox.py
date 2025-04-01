import dropbox
import os
import json

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "dropbox_config.json")
LOCAL_FOLDER = "Pictures"

def load_config():
    if not os.path.exists(CONFIG_FILE):
        raise FileNotFoundError("Please create dropbox_config.json from dropbox_config_template.json")
    
    with open(CONFIG_FILE, "r") as f:
        return json.load(f)

def download_images():
    config = load_config()
    dbx = dropbox.Dropbox(config["access_token"])

    if not os.path.exists(LOCAL_FOLDER):
        os.makedirs(LOCAL_FOLDER)

    try:
        # Get current list of files from Dropbox
        entries = dbx.files_list_folder(config["dropbox_folder"]).entries
        dropbox_files = {entry.name: entry for entry in entries if isinstance(entry, dropbox.files.FileMetadata)}
        
        # Get current list of local files
        local_files = set(os.listdir(LOCAL_FOLDER)) if os.path.exists(LOCAL_FOLDER) else set()
        
        # Download new files
        for filename, entry in dropbox_files.items():
            local_path = os.path.join(LOCAL_FOLDER, filename)
            if not os.path.exists(local_path):  # avoid re-downloading
                print(f"Downloading {filename}")
                _, res = dbx.files_download(entry.path_lower)
                with open(local_path, "wb") as f:
                    f.write(res.content)
        
        # Remove files that no longer exist in Dropbox
        for local_file in local_files:
            if local_file not in dropbox_files and os.path.isfile(os.path.join(LOCAL_FOLDER, local_file)):
                print(f"Removing {local_file} (no longer in Dropbox)")
                os.remove(os.path.join(LOCAL_FOLDER, local_file))
        
        return True
    except Exception as e:
        print(f"Dropbox fetch error: {e}")
        return False

if __name__ == "__main__":
    download_images()