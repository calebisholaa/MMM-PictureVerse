"""
Blink Setup Script - FIXED VERSION
Interactive setup for Blink camera credentials
FIXED: Better error handling and clearer error messages
"""

import asyncio
import os
import sys
from aiohttp import ClientSession
from blinkpy.blinkpy import Blink
from blinkpy.auth import Auth


CREDS_FILE = os.path.join(os.path.dirname(__file__), "creds.json")


async def run_setup():
    """Interactive setup process for Blink credentials"""
    
    print("=" * 60)
    print("Blink Camera Setup")
    print("=" * 60)
    print()
    
    # Get credentials from user
    username = input("Enter your Blink Username (email): ").strip()
    if not username:
        print("Error: Username cannot be empty")
        return False
    
    password = input("Enter your Blink password: ").strip()
    if not password:
        print("Error: Password cannot be empty")
        return False
    
    print("\nAttempting to connect to Blink servers...")
    
    async with ClientSession() as session:
        blink = Blink(session=session)
        auth = Auth({"username": username, "password": password}, no_prompt=True)
        blink.auth = auth

        try:
            # Attempt initial login
            await blink.start()
            
            # If we get here, login was successful
            print("[OK] Login successful!")
            
        except Exception as e:
            error_str = str(e).lower()
            
            # FIX: Better error detection and handling
            if "unauthorized" in error_str or "401" in error_str:
                print("\n[ERROR] Login failed: Invalid username or password")
                print("Please check your credentials and try again")
                return False
                
            elif "2fa" in error_str or "two factor" in error_str or "verification" in error_str:
                print("\n2FA (Two-Factor Authentication) required")
                print("A verification code has been sent to your email/phone")
                print()
                
                max_attempts = 3
                for attempt in range(1, max_attempts + 1):
                    two_fa = input(f"Enter the 2FA code (attempt {attempt}/{max_attempts}): ").strip()
                    
                    if not two_fa:
                        print("Error: 2FA code cannot be empty")
                        continue
                    
                    try:
                        # Send the 2FA code
                        await blink.auth.send_auth_key(blink, two_fa)
                        await blink.setup_post_verify()
                        
                        print("[OK] 2FA verification successful!")
                        break
                        
                    except Exception as e2:
                        error2_str = str(e2).lower()
                        
                        if "invalid" in error2_str or "incorrect" in error2_str:
                            print(f"[ERROR] Invalid 2FA code (attempt {attempt}/{max_attempts})")
                            if attempt < max_attempts:
                                print("Please try again")
                        else:
                            print(f"[ERROR] 2FA verification error: {e2}")
                        
                        if attempt == max_attempts:
                            print("\nToo many failed attempts. Please restart the setup.")
                            return False
                else:
                    # Loop completed without break (all attempts failed)
                    return False
                    
            elif "network" in error_str or "connection" in error_str or "timeout" in error_str:
                print("\n[ERROR] Network error: Could not connect to Blink servers")
                print("Please check your internet connection and try again")
                return False
                
            else:
                # Unknown error
                print(f"\n[ERROR] Unexpected error during login: {e}")
                print("Please check your credentials and try again")
                if "--debug" in sys.argv:
                    import traceback
                    traceback.print_exc()
                return False

        # Save credentials
        print("\nSaving credentials...")
        try:
            await blink.save(CREDS_FILE)
            print(f"[OK] Credentials saved to {CREDS_FILE}")
            
            # Verify the file was created
            if os.path.exists(CREDS_FILE):
                file_size = os.path.getsize(CREDS_FILE)
                print(f"  File size: {file_size} bytes")
                
                if file_size < 10:
                    print("  [WARNING] Warning: Credentials file seems too small, may be corrupted")
                    return False
            else:
                print("  [ERROR] Error: Credentials file was not created")
                return False
                
        except Exception as e:
            print(f"[ERROR] Error saving credentials: {e}")
            return False
        
        # Test the connection
        print("\nTesting connection...")
        try:
            await blink.refresh()
            
            # Get account info
            email = blink.auth.login_attributes.get('email', 'Unknown')
            print(f"[OK] Connected as: {email}")
            
            # List cameras
            if len(blink.cameras) > 0:
                print(f"\nFound {len(blink.cameras)} camera(s):")
                for name in blink.cameras.keys():
                    print(f"  • {name}")
            else:
                print("\n[WARNING] Warning: No cameras found on this account")
                print("  Make sure cameras are set up in the Blink app first")
            
        except Exception as e:
            print(f"[ERROR] Error testing connection: {e}")
            print("Credentials were saved but connection test failed")
            print("You may need to run setup again")
            return False
        
        return True


async def main():
    """Main entry point"""
    print()
    print("=" * 60)
    print("MMM-PictureVerse: Blink Camera Setup")
    print("=" * 60)
    print()
    print("This will store your Blink authentication tokens for future use.")
    print("Your credentials will be stored locally in creds.json")
    print()
    
    # Check if credentials already exist
    if os.path.exists(CREDS_FILE):
        print(f"[WARNING] Warning: Credentials file already exists: {CREDS_FILE}")
        response = input("Do you want to overwrite it? (y/N): ").strip().lower()
        if response not in ['y', 'yes']:
            print("Setup cancelled.")
            return
        print()
    
    # Ask for confirmation
    response = input("Do you want to continue with setup? (Y/n): ").strip().lower()
    if response in ['n', 'no']:
        print("Setup cancelled.")
        return
    
    print()
    
    # Run the setup
    success = await run_setup()
    
    print()
    print("=" * 60)
    if success:
        print("[OK] Setup completed successfully!")
        print()
        print("Next steps:")
        print("  1. Start the motion monitor: npm run start-blink-monitor")
        print("  2. Or manually fetch snapshots: npm run blink-snapshot")
    else:
        print("[ERROR] Setup failed")
        print()
        print("Troubleshooting:")
        print("  • Verify your Blink username and password")
        print("  • Check your internet connection")
        print("  • Make sure 2FA codes are entered correctly")
        print("  • Run with --debug flag for more details")
    print("=" * 60)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nSetup interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        if "--debug" in sys.argv:
            import traceback
            traceback.print_exc()
        sys.exit(1)