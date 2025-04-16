import os
import re
import time
import logging
import schedule
from datetime import datetime

# Configure logging
log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "blink_cleanup.log")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()
    ]
)

# Path to the media directory
MEDIA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "media")

def cleanup_blink_media():
    """
    Cleans up Blink camera media files (images and videos),
    keeping ONLY the most recent file per camera per type
    """
    logging.info("Starting Blink media cleanup...")
    
    try:
        # Ensure the media directory exists
        if not os.path.exists(MEDIA_DIR):
            logging.warning(f"Media directory not found: {MEDIA_DIR}")
            return False
        
        # Get all media files
        all_files = os.listdir(MEDIA_DIR)
        image_files = [f for f in all_files if f.lower().endswith(('.jpg', '.jpeg'))]
        video_files = [f for f in all_files if f.lower().endswith('.mp4')]
        
        logging.info(f"Found {len(image_files)} images and {len(video_files)} videos to analyze for cleanup")
        
        # Process images and videos separately
        files_deleted = 0
        files_kept = 0
        
        # Group files only by camera name and file type
        for file_type, file_list in [("image", image_files), ("video", video_files)]:
            grouped_files = {}
            
            for filename in file_list:
                # Extract camera name from filename
                # Expected format: CameraName_YYYYMMDD_HHMMSS.ext
                match = re.match(r'^(.+?)_(\d{8}_\d{6})\.(jpg|jpeg|mp4)$', filename, re.IGNORECASE)
                
                if not match:
                    logging.warning(f"{file_type.capitalize()} {filename} doesn't match expected format, skipping")
                    continue
                
                camera_name = match.group(1)
                timestamp = match.group(2)  # YYYYMMDD_HHMMSS
                
                # Create a key for grouping: camera + file type only
                key = f"{camera_name}_{file_type}"
                
                if key not in grouped_files:
                    grouped_files[key] = []
                
                file_path = os.path.join(MEDIA_DIR, filename)
                
                try:
                    grouped_files[key].append({
                        'filename': filename,
                        'full_path': file_path,
                        'timestamp': timestamp,
                        'size': os.path.getsize(file_path)
                    })
                except Exception as e:
                    logging.error(f"Error processing {filename}: {e}")
            
            # Process each group (camera + file type)
            for key, file_group in grouped_files.items():
                if len(file_group) <= 1:
                    # Only one file for this camera/type, nothing to clean up
                    files_kept += 1
                    logging.debug(f"Keeping {file_group[0]['filename']} (only file for {key})")
                    continue
                
                # Sort by timestamp (newest first)
                file_group.sort(key=lambda x: x['timestamp'], reverse=True)
                
                # Keep only the newest file
                newest_file = file_group[0]
                logging.info(f"Keeping newest {file_type} for {key}: {newest_file['filename']}")
                files_kept += 1
                
                # Delete ALL other files for this camera/type
                for i in range(1, len(file_group)):
                    try:
                        file_to_delete = file_group[i]
                        os.remove(file_to_delete['full_path'])
                        logging.info(f"Deleted older {file_type}: {file_to_delete['filename']} " +
                                    f"({format_file_size(file_to_delete['size'])})")
                        files_deleted += 1
                    except Exception as e:
                        logging.error(f"Error deleting file {file_group[i]['filename']}: {e}")
        
        # Log summary of cleanup operation
        logging.info(f"Cleanup complete: kept {files_kept} files (newest per camera/type), deleted {files_deleted} files")
        return True
    
    except Exception as e:
        logging.error(f"Error during cleanup: {e}")
        return False

def format_file_size(size_bytes):
    """Format file size in a human-readable format"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"

def run_scheduler():
    """Run the scheduler to execute cleanup at specified times"""
    # Schedule cleanup to run at 45 minutes past every hour
    schedule.every().hour.at(":45").do(cleanup_blink_media)
    
    # Also perform an immediate cleanup when script starts
    logging.info("Performing initial cleanup on startup")
    cleanup_blink_media()
    
    logging.info("Scheduler started - will run cleanup at 45 minutes past every hour")
    
    try:
        while True:
            schedule.run_pending()
            time.sleep(1)
    except KeyboardInterrupt:
        logging.info("Scheduler stopped by user")
    except Exception as e:
        logging.error(f"Scheduler error: {e}")

if __name__ == "__main__":
    logging.info("=" * 50)
    logging.info(f"Blink Media Cleanup Service Started - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logging.info(f"Media directory: {MEDIA_DIR}")
    logging.info(f"Log file: {log_file}")
    logging.info("=" * 50)
    
    run_scheduler()