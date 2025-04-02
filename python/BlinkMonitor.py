import asyncio
from aiohttp import ClientSession
from blinkpy.blinkpy import Blink
from blinkpy.auth import Auth
import os
import json
import sys
from datetime import datetime

# Define paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MEDIA_FOLDER = os.path.join(SCRIPT_DIR, "media")
CREDS_FILE = os.path.join(SCRIPT_DIR, "creds.json")

# Ensure media folder exists
os.makedirs(MEDIA_FOLDER, exist_ok=True)

async def monitor_motion(blink):
    print("📹 Monitoring for motion...")
    
    while True:
        try:
            await blink.refresh()
            motion_detected = False
            
            for name, cam in blink.cameras.items():
                if cam.motion_detected:
                    motion_detected = True
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    print(f"Motion detected on {name} at {timestamp}!")
                    
                    # Take a snapshot when motion is detected
                    await cam.snap_picture()
                    print("Taking snapshot...")
                    
                    # Wait for image and video to be available
                    print("Waiting for media to process...")
                    await asyncio.sleep(10)  # Adjust wait time if needed
                    await blink.refresh()
                    
                    # Save snapshot image
                    base_name = name.replace(" ", "_")
                    img_path = os.path.join(MEDIA_FOLDER, f"{base_name}_{timestamp}.jpg")
                    
                    await cam.image_to_file(img_path)
                    print(f"Motion snapshot saved: {img_path}")
                    
                    # Save video if available
                    if cam.video_from_cache:
                        video_path = os.path.join(MEDIA_FOLDER, f"{base_name}_{timestamp}.mp4")
                        await cam.video_to_file(video_path)
                        print(f"Motion video saved: {video_path}")
                    else:
                        print("No motion video available yet.")
                else:
                    print(f"No motion on {name}.")
            
            # Only print separator if something happened
            if motion_detected:
                print("-" * 50)
                
            # Sleep before next check
            await asyncio.sleep(30)
            
        except Exception as e:
            print(f"Error during motion monitoring: {e}")
            print("Will retry in 60 seconds...")
            await asyncio.sleep(60)

async def start():
    print(f"Blink Motion Monitor started at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Media will be saved to: {MEDIA_FOLDER}")
    
    # Check if credentials file exists
    if not os.path.exists(CREDS_FILE):
        print(f"Error: Credentials file not found at {CREDS_FILE}")
        print("Please run BlinkSetup.py first to set up Blink credentials.")
        return
    
    async with ClientSession() as session:
        try:
            # Load credentials
            with open(CREDS_FILE, "r") as f:
                creds = json.load(f)
            
            # Initialize Blink
            auth = Auth(creds, no_prompt=True)
            blink = Blink(session=session)
            blink.auth = auth
            
            # Start Blink session
            await blink.start()
            await blink.refresh()
            
            # Show connected cameras
            print(f"Connected to Blink account: {blink.auth.login_attributes.get('email', 'Unknown')}")
            print(f"Found {len(blink.cameras)} cameras:")
            for name in blink.cameras.keys():
                print(f"  - {name}")
            
            # Start monitoring
            await monitor_motion(blink)
            
        except Exception as e:
            print(f"Error starting Blink monitor: {e}")
            sys.exit(1)

if __name__ == "__main__":
    try:
        asyncio.run(start())
    except KeyboardInterrupt:
        print("\nBlink Monitor stopped by user.")
    except Exception as e:
        print(f"Unexpected error: {e}")