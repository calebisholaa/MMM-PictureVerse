"""
Dropbox OAuth2 Authentication Module
- Implements OAuth 2.0 code flow with refresh tokens
- Handles token refresh automatically
- Based on Dropbox API v2 documentation
"""

import os
import json
import time
import webbrowser
import requests
import base64
import urllib.parse
from dropbox import Dropbox
from dropbox.exceptions import AuthError

# Define paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(SCRIPT_DIR, "dropbox_config.json")
TOKEN_FILE = os.path.join(SCRIPT_DIR, "dropbox_token.json")

def setup_oauth():
    """
    Set up OAuth2 flow for Dropbox with refresh token support
    """
    print("Setting up Dropbox OAuth2 authentication...")
    
    # Load app credentials from config
    try:
        with open(CONFIG_FILE, "r") as f:
            config = json.load(f)
            
        app_key = config.get("app_key")
        app_secret = config.get("app_secret")
        
        if not app_key or not app_secret:
            print("Error: app_key and app_secret must be provided in dropbox_config.json")
            print("Please update your config file with these values from your Dropbox app")
            return False
            
        print(f"App Key: {app_key[:5]}...{app_key[-5:] if len(app_key) > 10 else ''}")
        
        # Construct the authorization URL with required parameters
        # Following Dropbox docs to request offline access (refresh tokens)
        auth_url = "https://www.dropbox.com/oauth2/authorize"
        auth_params = {
            "client_id": app_key,
            "response_type": "code",
            "token_access_type": "offline",  # Request refresh token
        }
        
        auth_url = f"{auth_url}?{urllib.parse.urlencode(auth_params)}"
        
        print("\n1. Please go to this URL to authorize your app:")
        print(auth_url)
        
        # Try to open the browser automatically
        try:
            webbrowser.open(auth_url)
            print("Browser opened automatically. If it didn't open, copy and paste the URL manually.")
        except:
            print("Could not open browser automatically. Please copy and paste the URL into your browser.")
        
        # Get the authorization code from the user
        auth_code = input("\n2. Enter the authorization code you received: ").strip()
        
        if not auth_code:
            print("Error: No authorization code provided.")
            return False
            
        # Exchange the auth code for access and refresh tokens
        token_url = "https://api.dropboxapi.com/oauth2/token"
        token_data = {
            "code": auth_code,
            "grant_type": "authorization_code",
            "client_id": app_key,
            "client_secret": app_secret
        }
        
        print("Exchanging authorization code for tokens...")
        response = requests.post(token_url, data=token_data)
        
        if response.status_code != 200:
            print(f"Error: Failed to exchange authorization code for tokens. Status code: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
        token_info = response.json()
        
        # Check if we received the required tokens
        if "access_token" not in token_info or "refresh_token" not in token_info:
            print("Error: Did not receive the required tokens from Dropbox.")
            print(f"Response: {token_info}")
            return False
            
        # Save tokens to file
        token_data = {
            "access_token": token_info["access_token"],
            "refresh_token": token_info["refresh_token"],
            "expires_at": time.time() + token_info.get("expires_in", 14400),  # Default 4 hours if not provided
            "app_key": app_key,
            "app_secret": app_secret
        }
        
        # Make sure the token file's directory exists
        os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
        
        with open(TOKEN_FILE, "w") as f:
            json.dump(token_data, f, indent=2)
            
        print("OAuth2 setup complete! Token information saved.")
        
        # If dropbox_folder doesn't exist in config, prompt for it
        if "dropbox_folder" not in config or not config["dropbox_folder"]:
            dropbox_folder = input("\n3. Enter the Dropbox folder path to use (e.g., /Photos): ")
            config["dropbox_folder"] = dropbox_folder
            
            # Save updated config
            with open(CONFIG_FILE, "w") as f:
                json.dump(config, f, indent=2)
                
        print(f"Configuration updated. Dropbox folder path: {config.get('dropbox_folder')}")
        return True
        
    except Exception as e:
        print(f"Error during OAuth2 setup: {e}")
        return False

def refresh_access_token(app_key, app_secret, refresh_token):
    """
    Refresh the access token using the refresh token
    Returns a new access token and its expiration time
    """
    try:
        token_url = "https://api.dropboxapi.com/oauth2/token"
        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": app_key,
            "client_secret": app_secret
        }
        
        response = requests.post(token_url, data=data)
        
        if response.status_code != 200:
            print(f"Error refreshing token: {response.status_code}")
            print(f"Response: {response.text}")
            return None, None
            
        result = response.json()
        new_access_token = result.get("access_token")
        expires_in = result.get("expires_in", 14400)  # Default 4 hours if not provided
        
        # Calculate the absolute expiration time
        expires_at = time.time() + expires_in
        
        return new_access_token, expires_at
    except Exception as e:
        print(f"Exception during token refresh: {e}")
        return None, None

def get_dropbox_client():
    """
    Get a valid Dropbox client, refreshing the access token if needed
    """
    try:
        # Check if token file exists
        if not os.path.exists(TOKEN_FILE):
            print(f"Token file not found at {TOKEN_FILE}")
            print("Running OAuth2 setup...")
            if setup_oauth():
                print("OAuth2 setup completed successfully")
            else:
                print("OAuth2 setup failed")
                return None
        
        # Load token data
        with open(TOKEN_FILE, "r") as f:
            token_data = json.load(f)
        
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_at = token_data.get("expires_at")
        app_key = token_data.get("app_key")
        app_secret = token_data.get("app_secret")
        
        current_time = time.time()
        token_buffer = 600  # Refresh token 10 minutes before it expires
        
        # Check if token is expired or will expire soon
        if not expires_at or current_time + token_buffer > expires_at:
            print("Access token expired or will expire soon, refreshing...")
            
            new_access_token, new_expires_at = refresh_access_token(
                app_key, app_secret, refresh_token
            )
            
            if new_access_token and new_expires_at:
                # Update token data
                token_data["access_token"] = new_access_token
                token_data["expires_at"] = new_expires_at
                
                # Save updated token data
                with open(TOKEN_FILE, "w") as f:
                    json.dump(token_data, f, indent=2)
                
                print("Access token refreshed successfully")
                access_token = new_access_token
            else:
                print("Failed to refresh access token, attempting setup again...")
                if setup_oauth():
                    # Reload token data after setup
                    with open(TOKEN_FILE, "r") as f:
                        token_data = json.load(f)
                    access_token = token_data.get("access_token")
                else:
                    print("OAuth setup failed again")
                    return None
        
        # Initialize Dropbox client with the valid access token
        dbx = Dropbox(access_token)
        
        # Test the connection
        try:
            account = dbx.users_get_current_account()
            print(f"Connected to Dropbox as: {account.email}")
            return dbx
        except AuthError as e:
            print(f"AuthError: {e}")
            print("Trying OAuth setup again...")
            if setup_oauth():
                # Recursively try again with new credentials
                return get_dropbox_client()
            return None
        except Exception as e:
            print(f"Error testing Dropbox connection: {e}")
            return None
            
    except Exception as e:
        print(f"Error in get_dropbox_client: {e}")
        return None

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "setup":
        setup_oauth()
    else:
        print("Usage:")
        print("  python DropboxOAuth.py setup   - Run the OAuth2 setup process")
        print("  python DropboxOAuth.py         - Test the Dropbox connection")
        
        # Test the connection
        dbx = get_dropbox_client()
        if dbx:
            print("Successfully connected to Dropbox!")
            print("OAuth2 is set up correctly with automatic token refresh.")
        else:
            print("Failed to connect to Dropbox. Run 'python DropboxOAuth.py setup' to set up.")