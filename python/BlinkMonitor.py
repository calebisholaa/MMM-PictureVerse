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


async def monitor_motion(blink):
    print("Monitoring for motion...\n")

    while True:
        try:
            await blink.refresh()
            motion_detected = False

            for name, cam in blink.cameras.items():
                if cam.motion_detected:
                    motion_detected = True
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    print(f"🚨 Motion detected on {name} at {timestamp}")

                    await cam.snap_picture()
                    await asyncio.sleep(2)
                    await blink.refresh()

                    base_name = name.replace(" ", "_")
                    img_path = os.path.join(MEDIA_FOLDER, f"{base_name}_{timestamp}.jpg")
                    await cam.image_to_file(img_path)
                    print(f" Snapshot saved: {img_path}")

                    if cam.video_from_cache:
                        video_path = os.path.join(MEDIA_FOLDER, f"{base_name}_{timestamp}.mp4")
                        await cam.video_to_file(video_path)
                        print(f" Motion video saved: {video_path}")
                    else:
                        print(" No motion video available yet.")
                else:
                    print(f"No motion on {name}")

            if motion_detected:
                print("-" * 50)

            await asyncio.sleep(30)

        except Exception as e:
            print(f"Error during motion monitoring: {e}")
            print("Retrying in 60 seconds...")
            await asyncio.sleep(60)


async def start():
    print(f"Blink Motion Monitor started at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Media will be saved to: {MEDIA_FOLDER}")

    if not os.path.exists(CREDS_FILE):
        print(f"❌ Credentials file not found at {CREDS_FILE}")
        print("Please run BlinkSetup.py first.")
        return

    async with ClientSession() as session:
        try:
            creds = await json_load(CREDS_FILE)
            blink = Blink(session=session)
            blink.auth = Auth(creds, no_prompt=True)

            await blink.start()
            await blink.refresh()

            print(f"✅ Connected to Blink as {blink.auth.login_attributes.get('email', 'Unknown')}")
            print(f"📷 Cameras detected: {', '.join(blink.cameras.keys())}\n")

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
