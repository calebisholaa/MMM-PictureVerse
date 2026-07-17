"""
Shared helpers for the Blink camera scripts (Blink.py, BlinkMonitor.py).
Keeps camera-type detection, file validation, and media path conventions
in one place instead of duplicated across both scripts.
"""

from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.absolute()
MEDIA_FOLDER = SCRIPT_DIR / "media"
CREDS_FILE = SCRIPT_DIR / "creds.json"

# Camera-specific timing: wired cameras take longer to process a capture
WAIT_TIME_WIRED = 8
WAIT_TIME_WIRELESS = 3

DOWNLOAD_TIMEOUT_WIRED = 45
DOWNLOAD_TIMEOUT_WIRELESS = 30

MIN_FILE_SIZE = 1000  # 1KB minimum for a valid snapshot/video file


def is_wired_camera(camera) -> bool:
    """Check whether a blinkpy camera object is a wired camera"""
    return (
        hasattr(camera, "camera_type") and
        "wired" in str(camera.camera_type).lower()
    )


def validate_file(filepath: Path, min_size: int = MIN_FILE_SIZE) -> bool:
    """Validate that a downloaded media file exists and meets a minimum size"""
    if not filepath.exists():
        return False
    return filepath.stat().st_size >= min_size


def get_media_path(camera_name: str, timestamp: str, extension: str) -> Path:
    """Build the media file path for a camera capture"""
    safe_name = camera_name.replace(" ", "_")
    return MEDIA_FOLDER / f"{safe_name}_{timestamp}.{extension}"
