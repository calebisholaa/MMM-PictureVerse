"""
Blink Camera Snapshot Script - Fixed Version
Fetches snapshots and videos from all Blink cameras
"""

import json
import asyncio
import os
from datetime import datetime
from pathlib import Path

from aiohttp import ClientSession
from blinkpy.blinkpy import Blink
from blinkpy.auth import Auth


# ==================== CONFIGURATION ====================
SCRIPT_DIR = Path(__file__).parent.absolute()
MEDIA_FOLDER = SCRIPT_DIR / "media"
CREDS_FILE = SCRIPT_DIR / "creds.json"

# Camera-specific settings
WAIT_TIME_WIRED = 8      # Wired cameras need more time
WAIT_TIME_WIRELESS = 3   # Wireless cameras are faster

# File validation
MIN_FILE_SIZE = 1000     # 1KB minimum for valid files

# Timeouts
DOWNLOAD_TIMEOUT_WIRED = 45
DOWNLOAD_TIMEOUT_WIRELESS = 30


# ==================== HELPER FUNCTIONS ====================
def is_wired_camera(camera) -> bool:
    """Check if camera is wired type"""
    return (
        hasattr(camera, 'camera_type') and 
        'wired' in str(camera.camera_type).lower()
    )


def validate_file(filepath: Path, min_size: int = MIN_FILE_SIZE) -> bool:
    """Validate that file exists and has content"""
    if not filepath.exists():
        return False
    
    file_size = filepath.stat().st_size
    if file_size < min_size:
        print(f"  File too small: {file_size} bytes (min: {min_size})")
        return False
    
    return True


async def save_snapshot(camera, filepath: Path, camera_name: str) -> bool:
    """
    Save camera snapshot with validation
    Returns True if successful, False otherwise
    """
    try:
        await camera.image_to_file(str(filepath))
        
        if validate_file(filepath):
            file_size = filepath.stat().st_size
            print(f"  ✓ Snapshot saved: {filepath.name} ({file_size:,} bytes)")
            return True
        else:
            print(f"  ✗ Snapshot validation failed")
            if filepath.exists():
                filepath.unlink()
            return False
            
    except Exception as e:
        print(f"  ✗ Snapshot error: {e}")
        return False


async def save_video(camera, filepath: Path, camera_name: str, is_wired: bool) -> bool:
    """
    Save motion video with timeout and validation
    Returns True if successful, False otherwise
    """
    timeout = DOWNLOAD_TIMEOUT_WIRED if is_wired else DOWNLOAD_TIMEOUT_WIRELESS
    
    try:
        print(f"  Downloading video (timeout: {timeout}s)...")
        
        await asyncio.wait_for(
            camera.video_to_file(str(filepath)),
            timeout=timeout
        )
        
        if validate_file(filepath):
            file_size = filepath.stat().st_size
            print(f"  ✓ Video saved: {filepath.name} ({file_size:,} bytes)")
            return True
        else:
            print(f"  ✗ Video validation failed")
            if filepath.exists():
                filepath.unlink()
            return False
            
    except asyncio.TimeoutError:
        print(f"  ✗ Video download timeout after {timeout}s")
        return False
        
    except Exception as e:
        print(f"  ✗ Video error: {e}")
        return False


# ==================== MAIN FUNCTION ====================
async def fetch_blink_media(session):
    """Fetch snapshots and videos from all Blink cameras"""
    
    # Load credentials
    print("Loading Blink credentials...")
    if not CREDS_FILE.exists():
        print(f"Error: Credentials file not found: {CREDS_FILE}")
        print("Please run BlinkSetup.py first")
        return False
    
    with open(CREDS_FILE, "r") as f:
        creds = json.load(f)
    
    # Initialize Blink
    auth = Auth(creds, no_prompt=True)
    blink = Blink(session=session)
    blink.auth = auth
    
    print("Connecting to Blink servers...")
    await blink.start()
    await blink.refresh()
    
    # Create media folder
    MEDIA_FOLDER.mkdir(exist_ok=True)
    
    # Get timestamp for this batch
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    print(f"\nFound {len(blink.cameras)} camera(s)")
    print("=" * 60)
    
    success_count = 0
    
    # Process each camera
    for name, cam in blink.cameras.items():
        print(f"\nCamera: {name}")
        
        # Check camera type
        is_wired = is_wired_camera(cam)
        camera_type = "Wired" if is_wired else "Wireless"
        print(f"  Type: {camera_type}")
        
        # Trigger snapshot
        print("  Triggering snapshot...")
        try:
            await cam.snap_picture()
        except Exception as e:
            print(f"  ✗ Failed to trigger snapshot: {e}")
            continue
        
        # Wait for camera to process (camera-specific time)
        wait_time = WAIT_TIME_WIRED if is_wired else WAIT_TIME_WIRELESS
        print(f"  Waiting {wait_time}s for processing...")
        await asyncio.sleep(wait_time)
        
        # Refresh to get latest data
        await blink.refresh()
        
        # Prepare file paths
        base_name = name.replace(" ", "_")
        img_path = MEDIA_FOLDER / f"{base_name}_{timestamp}.jpg"
        vid_path = MEDIA_FOLDER / f"{base_name}_{timestamp}.mp4"
        
        # Save snapshot
        snapshot_success = await save_snapshot(cam, img_path, name)
        
        # Try to save video if available
        video_success = False
        if cam.video_from_cache:
            print("  Video available in cache")
            video_success = await save_video(cam, vid_path, name, is_wired)
        else:
            print("  ℹ No video in cache (this is normal for some cameras)")
        
        # Track success
        if snapshot_success or video_success:
            success_count += 1
        
        print("-" * 60)
    
    print(f"\nCompleted: {success_count}/{len(blink.cameras)} cameras successful")
    print("=" * 60)
    
    return success_count > 0


async def main():
    """Main entry point"""
    print("=" * 60)
    print("Blink Camera Snapshot Script")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Media folder: {MEDIA_FOLDER}")
    print("=" * 60)
    
    async with ClientSession() as session:
        try:
            success = await fetch_blink_media(session)
            
            if success:
                print("\n✓ Snapshot fetch completed successfully")
                return 0
            else:
                print("\n✗ No snapshots were saved")
                return 1
                
        except Exception as e:
            print(f"\n✗ Error: {e}")
            import traceback
            traceback.print_exc()
            return 1


if __name__ == "__main__":
    import sys
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
