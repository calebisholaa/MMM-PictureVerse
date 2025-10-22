import asyncio
from aiohttp import ClientSession
from blinkpy.blinkpy import Blink
from blinkpy.auth import Auth
from blinkpy.helpers.util import json_load
import os


CREDS_FILE = os.path.join(os.path.dirname(__file__), "creds.json")


async def run_setup():
    username = input("Enter your Blink Username (email): ")
    password = input("Enter your Blink password: ")

    async with ClientSession() as session:
        blink = Blink(session=session)
        auth = Auth({"username": username, "password": password}, no_prompt=True)
        blink.auth = auth

        try:
            await blink.start()
        except Exception as e:
            two_fa = input("Enter the 2FA code sent to your email/phone: ")
            await blink.send_2fa_code(two_fa)
            await blink.setup_post_verify()

        print("Login successful. Saving credentials...")
        await blink.save(CREDS_FILE)
        print(f"Credentials saved to {CREDS_FILE}")


async def main():
    print("MMM-PictureVerse: Optional Blink Setup")
    print("This will store your Blink tokens for future runs.\n")
    if input("Do you want to continue? (Y/N): ").strip().lower() == "y":
        await run_setup()
    else:
        print("Setup skipped.")


if __name__ == "__main__":
    asyncio.run(main())
