#!/usr/bin/env python3
import os
import re
import time
import logging
import schedule

MEDIA_DIR = os.path.join(os.path.dirname(__file__), "media")
LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
LOG_FILE = os.path.join(LOG_DIR, "blink_cleanup.log")

# Keep this many hours of history per camera/type
MAX_HOURS_TO_KEEP = 2  # 72 adjust as needed

if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

def parse_filename(filename):
    """
    Expect: CameraName_YYYYMMDD_HHMMSS.ext
    Supports: jpg, jpeg, mp4
    """
    match = re.match(r'^(.+?)_(\d{8})_(\d{2})(\d{2})(\d{2})\.(jpg|jpeg|mp4)$', filename, re.I)
    if not match:
        return None
    camera, ymd, HH, MM, SS, ext = match.groups()
    hour_key = f"{ymd}_{HH}"
    ts_key = f"{ymd}_{HH}{MM}{SS}"
    ext = ext.lower()
    kind = "video" if ext == "mp4" else "image"
    return camera, hour_key, ts_key, kind

def format_file_size(size_bytes):
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f}{unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f}TB"

def cleanup_blink_media():
    logging.info("Starting Blink media cleanup...")

    if not os.path.exists(MEDIA_DIR):
        logging.warning(f"Media directory not found: {MEDIA_DIR}")
        return False

    files = [f for f in os.listdir(MEDIA_DIR) if re.search(r'\.(jpg|jpeg|mp4)$', f, re.I)]
    logging.info(f"Found {len(files)} media files to analyze for cleanup")

    buckets = {}  # key: (camera, hour_key, kind) → list of (filename, ts_key, full_path, size)
    for f in files:
        parts = parse_filename(f)
        if not parts:
            logging.warning(f"Skipping non-matching file: {f}")
            continue
        camera, hour_key, ts_key, kind = parts
        full = os.path.join(MEDIA_DIR, f)
        try:
            size = os.path.getsize(full)
        except Exception as e:
            logging.error(f"Error stat'ing {f}: {e}")
            continue
        buckets.setdefault((camera, hour_key, kind), []).append((f, ts_key, full, size))

    deleted = 0
    kept = 0
    kept_by_camera_kind = {}

    # Deduplicate within each hour bucket
    for key, items in buckets.items():
        camera, hour_key, kind = key
        items.sort(key=lambda x: x[1], reverse=True)  # newest ts_key first
        newest = items[0]
        kept += 1
        kept_by_camera_kind.setdefault((camera, kind), []).append((hour_key, newest[0], newest[2]))

        for stale in items[1:]:
            try:
                os.remove(stale[2])
                logging.info(f"Deleted older {kind}: {stale[0]} ({format_file_size(stale[3])})")
                deleted += 1
            except Exception as e:
                logging.error(f"Error deleting {stale[0]}: {e}")

    # Enforce retention per camera/kind
    for (camera, kind), entries in kept_by_camera_kind.items():
        entries.sort(key=lambda x: x[0], reverse=True)  # newest hour first
        for old in entries[MAX_HOURS_TO_KEEP:]:
            try:
                os.remove(old[2])
                logging.info(f"Deleted old {kind} (beyond retention): {old[1]}")
                deleted += 1
            except Exception as e:
                logging.error(f"Error deleting {old[1]}: {e}")

    logging.info(f"Cleanup complete: kept {kept} hourly files, deleted {deleted}")
    return True

def main():
    cleanup_blink_media()
    # Schedule every hour at :45
    schedule.every().hour.at(":45").do(cleanup_blink_media)
    logging.info("Blink media cleanup scheduler started (every hour at :45)")
    while True:
        schedule.run_pending()
        time.sleep(30)

if __name__ == "__main__":
    main()
