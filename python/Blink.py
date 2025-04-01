import json
from blinkpy.blinkpy import Blink
from blinkpy.auth import Auth
import asyncio
from aiohttp import ClientSession
import os
from datetime import datetime

MEDIA_FOLDER = "media"
CREDS_FILE = os.path.join(os.path.dirname(__file__), "creds.json")

async def fetch_blink_media(session):
    with open(CREDS_FILE, "r") as f:
        creds = json.load(f)

    auth = Auth(creds, no_prompt=True)
    blink = Blink(session=session)
    blink.auth = auth
    await blink.start()
    await blink.refresh()

    os.makedirs(MEDIA_FOLDER, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    for name, cam in blink.cameras.items():
        print(f"\nCamera: {name}")

        await cam.snap_picture()
        await asyncio.sleep(5)  # allow Blink to process the image
        await blink.refresh()

        base_name = name.replace(" ", "_")
        img_path = os.path.join(MEDIA_FOLDER, f"{base_name}_{timestamp}.jpg")
        vid_path = os.path.join(MEDIA_FOLDER, f"{base_name}_{timestamp}.mp4")

        await cam.image_to_file(img_path)
        print(f"Saved image: {img_path}")

        if cam.video_from_cache:
            await cam.video_to_file(vid_path)
            print(f"Saved video: {vid_path}")
        else:
            print("No recent video available.")

async def main():
    async with ClientSession() as session:
        await fetch_blink_media(session)

if __name__ == "__main__":
    asyncio.run(main())