import asyncio
from aiohttp import ClientSession
from blinkpy.blinkpy import Blink
from blinkpy.auth import Auth
from blinkpy.helpers.util import json_load
from datetime import datetime
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MEDIA_FOLDER = os.path.join(SCRIPT_DIR, "media")
CREDS_FILE = os.path.join(SCRIPT_DIR, "creds.json")

os.makedirs(MEDIA_FOLDER, exist_ok=True)


async def download_video_with_retry(cam, video_path, camera_name, max_retries=3):
    """
    Download video with retry logic and validation.
    Wired cameras may take longer to provide video files.
    """
    for attempt in range(max_retries):
        try:
            print(f"  Attempt {attempt + 1}/{max_retries} to download video...")
            
            # Set timeout for wired cameras (they can be slower)
            await asyncio.wait_for(
                cam.video_to_file(video_path),
                timeout=45.0  # 45 second timeout for wired cameras
            )
            
            # Verify the file was created and has content
            if os.path.exists(video_path):
                file_size = os.path.getsize(video_path)
                
                if file_size > 1000:  # At least 1KB
                    print(f"  ✓ Video saved successfully: {video_path} ({file_size:,} bytes)")
                    return True
                else:
                    print(f"  ✗ Video file too small ({file_size} bytes), removing...")
                    os.remove(video_path)
                    
            else:
                print(f"  ✗ Video file was not created")
                
        except asyncio.TimeoutError:
            print(f"  ✗ Attempt {attempt + 1} timed out (45s limit)")
            
        except Exception as e:
            print(f"  ✗ Attempt {attempt + 1} failed: {e}")
        
        # Wait before retrying
        if attempt < max_retries - 1:
            await asyncio.sleep(3)
    
    return False


async def monitor_motion(blink):
    print("Monitoring for motion...\n")
    
    # Log camera types on startup
    for name, cam in blink.cameras.items():
        cam_type = "Wired" if hasattr(cam, 'camera_type') and 'wired' in str(cam.camera_type).lower() else "Wireless"
        print(f"Camera detected: {name} ({cam_type})")
    print()

    while True:
        try:
            await blink.refresh()
            motion_detected = False

            for name, cam in blink.cameras.items():
                # Check camera status
                is_wired = hasattr(cam, 'camera_type') and 'wired' in str(cam.camera_type).lower()
                
                if cam.motion_detected:
                    motion_detected = True
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    print(f"🚨 Motion detected on {name} at {timestamp}")

                    # Take snapshot first
                    await cam.snap_picture()
                    
                    # Wait longer for wired cameras (they can be slower)
                    wait_time = 8 if is_wired else 3
                    print(f"  Waiting {wait_time}s for camera to process...")
                    await asyncio.sleep(wait_time)
                    
                    # Refresh to get latest data
                    await blink.refresh()

                    base_name = name.replace(" ", "_")
                    
                    # Save snapshot
                    img_path = os.path.join(MEDIA_FOLDER, f"{base_name}_{timestamp}.jpg")
                    try:
                        await cam.image_to_file(img_path)
                        if os.path.exists(img_path) and os.path.getsize(img_path) > 0:
                            print(f"  ✓ Snapshot saved: {img_path}")
                        else:
                            print(f"  ✗ Snapshot failed or empty")
                    except Exception as e:
                        print(f"  ✗ Snapshot error: {e}")

                    # Try to get motion video
                    print(f"  Checking for motion video...")
                    print(f"  - video_from_cache: {cam.video_from_cache}")
                    if hasattr(cam, 'last_record'):
                        print(f"  - last_record: {cam.last_record}")
                    
                    if cam.video_from_cache:
                        video_path = os.path.join(MEDIA_FOLDER, f"{base_name}_{timestamp}.mp4")
                        
                        # Use retry logic with longer timeout for wired cameras
                        success = await download_video_with_retry(
                            cam, video_path, name, 
                            max_retries=3 if is_wired else 2
                        )
                        
                        if not success:
                            print(f"  ✗ All video download attempts failed")
                            print(f"  ℹ Snapshot is still available: {img_path}")
                    else:
                        print(f"  ℹ No motion video in cache yet")
                        print(f"  ℹ This is normal for some cameras - snapshot saved")
                    
                    print(f"{'-'*60}\n")
                    
                else:
                    # Periodic status check (less verbose)
                    if datetime.now().second % 60 == 0:  # Every minute
                        print(f"[{datetime.now().strftime('%H:%M:%S')}] No motion on {name}")

            if motion_detected:
                print("=" * 60)
                print()

            await asyncio.sleep(30)

        except Exception as e:
            print(f"\n{'!'*60}")
            print(f"Error during motion monitoring: {e}")
            print(f"{'!'*60}")
            print("Retrying in 60 seconds...\n")
            await asyncio.sleep(60)


async def start():
    print(f"{'='*60}")
    print(f"Blink Motion Monitor")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Media folder: {MEDIA_FOLDER}")
    print(f"{'='*60}\n")

    if not os.path.exists(CREDS_FILE):
        print(f"Credentials file not found: {CREDS_FILE}")
        print("Please run BlinkSetup.py first.")
        return

    async with ClientSession() as session:
        try:
            creds = await json_load(CREDS_FILE)
            blink = Blink(session=session)
            blink.auth = Auth(creds, no_prompt=True)

            print("Connecting to Blink servers...")
            await blink.start()
            await blink.refresh()

            print(f"✅ Connected to Blink as {blink.auth.login_attributes.get('email', 'Unknown')}")
            print(f"📷 Cameras detected: {', '.join(blink.cameras.keys())}\n")

            await monitor_motion(blink)

        except Exception as e:
            print(f"\nError starting Blink monitor: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)


if __name__ == "__main__":
    try:
        asyncio.run(start())
    except KeyboardInterrupt:
        print("\n\n{'='*60}")
        print("Blink Monitor stopped by user")
        print(f"{'='*60}")
    except Exception as e:
        print(f"\n\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()