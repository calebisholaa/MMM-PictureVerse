import json
from blinkpy.blinkpy import Blink 
from blinkpy.auth import Auth
import asyncio
from aiohttp import ClientSession
import os 

CREDS_FILE = os.path.join(os.path.dirname(__file__), "creds.json")

async def run_setup(session):
    username = input("Enter your Blink Username (email): ")
    password = input("Enter your Blink password: ")

    credentials = {
        "username": username,
        "password": password
    }
    
    auth = Auth(credentials, no_prompt=True)
    blink = Blink(session=session)
    blink.auth = auth
    await blink.start()

    two_fa = input("Enter the 2FA code sent to your email/phone: ")
    await auth.send_auth_key(blink, two_fa)
    await blink.setup_post_verify()

    print("✅ Blink setup complete!")

    with open(CREDS_FILE, "w") as f:
        json.dump(auth.data, f)

async def main():
    print("📸 MMM-PictureVerse: Optional Blink Setup")
    print("This displays motion-triggered clips and snapshots from your Blink camera.\n")

    answer = input("Do you want to set up Blink camera access now? (Y/N): ").strip().lower()
    if answer == "y":
        async with ClientSession() as session:
            await run_setup(session)
    else:
        print("✅ Blink setup skipped. You can run this script later to set it up.")

# Run the main coroutine
if __name__ == "__main__":
    asyncio.run(main())