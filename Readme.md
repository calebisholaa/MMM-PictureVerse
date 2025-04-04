# MMM-PictureVerse

A MagicMirror² module that creates a beautiful display experience with:
- Bible verses of the day
- Blink security camera feeds
- Family photos from your Dropbox
- Automatic motion detection alerts from Blink cameras

## Features

- **Hourly Sequence**: Follows a structured hourly display sequence
  1. Verse of the day for 2 minutes
  2. Security camera images for 2 minutes 
  3. Family photos until the end of the hour
- **Bible Verses**: Shows a Bible verse at the start of each hour
- **Security Cameras**: Displays feeds from your Blink security cameras, focusing on the current hour's images
- **Family Photos**: Shows your Dropbox photos with smooth transitions
- **Real-time Motion Detection**: Automatically monitors your Blink cameras and immediately shows video clips when motion is detected
- **Motion Alerts**: Visual alerts when motion is detected with timestamp overlay
- **Automatic Updates**: New photos added to Dropbox appear automatically on your mirror
- **Dynamic Scaling**: Automatically sizes images to fit your display perfectly
- **OAuth2 Authentication**: Secure Dropbox integration with automatic token refresh

## Installation

1. Navigate to your MagicMirror's modules folder:
   ```bash
   cd ~/MagicMirror/modules/
   ```

2. Clone this repository:
   ```bash
   git clone https://github.com/calebisholaa/MMM-PictureVerse.git
   ```

3. Install dependencies:
   ```bash
   cd MMM-PictureVerse
   
   # Make sure Python virtual environment package is installed
   sudo apt update
   sudo apt install python3-venv
   
   # Make the scripts executable
   chmod +x *.sh
   
   # Install module dependencies and set up Python virtual environment
   npm install
   ```

The installation process will automatically:
- Install Node.js dependencies
- Create a Python virtual environment
- Install the required Python packages (dropbox, blinkpy, aiohttp)

## Setting Up Dropbox (For Family Photos)

MMM-PictureVerse now uses OAuth2 authentication with refresh tokens to ensure secure and continuous access to your Dropbox photos. This method follows Dropbox's official recommendations and eliminates the hassle of dealing with expired access tokens.

### Step 1: Create a Dropbox App

1. Go to [Dropbox Developer Apps](https://www.dropbox.com/developers/apps)
2. Click "Create app"
3. Choose "Scoped access" API
4. Choose "Full Dropbox" access type
5. Give your app a name (e.g., "MagicMirrorPhotos")
6. Click "Create app"

### Step 2: Configure Your App

1. In your new app's settings page:
   - Under "Permissions", add the following scopes:
     - `files.metadata.read`
     - `files.content.read`
   - Click "Submit" to save the permissions

2. Under "OAuth 2 > Redirect URIs" add:
   - `https://localhost`
   - Save changes

3. Note your "App key" and "App secret" from the Settings tab

### Step 3: Set Up OAuth2 Authentication

Run the OAuth setup script which will guide you through the entire process:

```bash
cd ~/MagicMirror/modules/MMM-PictureVerse/
npm run setup-dropbox-oauth
```

The script will:
1. Create a configuration file if it doesn't exist
2. Prompt you to enter your app key and secret
3. Open a browser window for you to authorize the app
4. Handle the OAuth flow and store refresh tokens
5. Test the connection by syncing with your Dropbox account

During the setup, you'll be asked to:
- Enter your Dropbox app key and secret
- Authorize the app in your browser
- Copy-paste the authorization code
- Specify the Dropbox folder containing your photos

### How the OAuth2 Implementation Works

This module uses the official OAuth2 code flow with refresh tokens as recommended by Dropbox:

1. **Short-lived access tokens**: The primary token used to access Dropbox expires after a few hours
2. **Refresh tokens**: A long-lived token that allows requesting new access tokens
3. **Automatic refresh**: The system automatically detects when tokens expire and refreshes them
4. **Secure storage**: Tokens are stored in a separate file from your configuration
5. **Background operation**: All token management happens automatically

This implementation follows Dropbox's best practices for authentication and will continue to work reliably without manual intervention.

## Setting Up Blink Cameras

To enable security camera feeds and motion detection:

1. Run the Blink setup script:
   ```bash
   npm run setup-blink
   ```

2. Follow the prompts to enter your Blink credentials and 2FA code

3. That's it! The module will automatically:
   - Display your camera feeds during the camera display portion of the cycle
   - Monitor your cameras for motion in the background
   - Immediately display motion clips when detected, with visual alerts
   - Keep only one image per camera per hour to maintain organization

## How It Works

The module follows a structured sequence that repeats every hour:

1. **Bible Verse (2 minutes)**: At the start of each hour, the module displays the verse of the day for 2 minutes.
2. **Camera Images (2 minutes)**: After the verse, the module displays security camera images for 2 minutes. It prioritizes images from the current hour.
3. **Family Photos (remainder of hour)**: For the rest of the hour, the module displays family photos from your Dropbox with smooth transitions.
4. **Motion Detection**: The module continuously monitors your Blink cameras in the background. If motion is detected, it immediately interrupts the normal display to show the motion clip with a visual alert and timestamp.

At the start of a new hour, the sequence begins again with a fresh verse and camera images.

### Hourly Camera Image Management

The system automatically manages your camera images, keeping only one image per camera per hour. This provides several benefits:
- Prevents storage space issues by removing duplicate images
- Maintains an organized record of what each camera sees hourly
- Automatically cleans up without user intervention

The cleanup happens:
- At module startup
- Every hour on a timer
- Before and after fetching new camera images
- When the hour changes

### Dropbox Synchronization

The Dropbox integration:
- Connects securely using OAuth2 authentication
- Refreshes tokens automatically in the background
- Syncs new photos automatically on a schedule
- Updates your display with new photos as they're added to Dropbox
- Removes local photos that are deleted from Dropbox

### Motion Detection System

The built-in motion detection system works seamlessly:

1. When the module starts, it automatically launches a background process that monitors your Blink cameras
2. When motion is detected, it:
   - Takes a snapshot of the camera view
   - Records the motion video clip
   - Immediately displays the video with an alert banner on your mirror
3. After the configured display time, it returns to the normal display sequence
4. All monitoring happens automatically in the background with no user intervention required

## Module Configuration

Add the module to your `config/config.js` file:

```javascript
{
  module: "MMM-PictureVerse",
  position: "fullscreen_below", // Recommended for photo display
  config: {
    // Timing settings
    familyInterval: 30000,       // How long to show each family photo (30 sec)
    verseDisplayTime: 120000,    // Show verse for 2 minutes
    cameraDisplayTime: 120000,   // Show cameras for 2 minutes
    
    // Motion detection
    prioritizeMotionClips: true, // Interrupt flow to show motion clips
    motionClipDisplayTime: 30000, // How long to show motion clips
    
    // Whether to enable Blink camera integration
    showBlink: true,
    
    // Image display settings
    opacity: 0.9,
    backgroundStyle: "none",    // Options: "blur", "color", or "none"
    backgroundColor: "black",   // Used when backgroundStyle is "color"
    blur: 8,                    // Blur amount in pixels when using "blur" style
    transition: 1000,            // Transition time between images (ms)
    sequential: false,            // Whether to cycle images sequentially or randomly
    alwaysShowNewestFirst: true,   // Show newest upload first, then continue with sequence
  }
}
```

## Display Settings

For the best photo viewing experience, use the `fullscreen` position. In fullscreen mode:

- Images automatically scale to fill the screen while maintaining aspect ratio
- Smooth transitions between images
- Custom background options

### Background Options

When using fullscreen mode, you can customize the background appearance:

- **backgroundStyle**: Choose from:
  - **"blur"**: Creates a blurred version of the current image as background (elegant effect)
  - **"color"**: Uses a solid color as background (good for higher contrast)
  - **"none"**: No special background (just shows the image)

- **backgroundColor**: Any valid CSS color (used when backgroundStyle is "color")
- **blur**: Amount of blur in pixels (used when backgroundStyle is "blur")
- **transition**: Duration of fade transitions between images (in milliseconds)

## Troubleshooting

### Dropbox Authentication Issues

- **Token expired errors**: Run `npm run setup-dropbox-oauth` to reauthorize
- **Configuration errors**: Check that your app key and secret are correct
- **Connection issues**: Verify your internet connection and Dropbox account status
- **Cannot open browser**: If the authorization URL doesn't open automatically, copy and paste it manually

To check Dropbox logs:
```bash
cat ~/MagicMirror/modules/MMM-PictureVerse/logs/dropbox-sync.log
```

### Camera Image Issues

- **No camera images appearing**: 
  - Run `npm run setup-blink` to set up Blink again
  - Check that your Blink cameras are online
  - Verify your Blink credentials are correct

- **Too many camera images**: 
  - The module automatically cleans up, keeping only one image per camera per hour
  - You can manually delete extra images from `python/media` folder if needed

To check Blink monitor logs:
```bash
cat ~/MagicMirror/modules/MMM-PictureVerse/logs/blink_monitor.log
```

### General Issues

- **No Bible verses showing**: 
  - Check your internet connection
  - The API might be temporarily unavailable

- **Python errors**:
  - If you encounter Python-related errors, try reinstalling the virtual environment:
    ```bash
    rm -rf python/venv
    ./setup-venv.sh
    ```

## Advanced: System Maintenance

### Checking System Status

```bash
# Check Dropbox OAuth status and force token refresh
cd ~/MagicMirror/modules/MMM-PictureVerse/python
./venv/bin/python DropboxOAuth.py

# Force a Dropbox sync
npm run sync-dropbox

# Check Blink monitor status
ps aux | grep BlinkMonitor.py

# Restart the Blink monitor
npm run stop-monitor
npm run start-monitor
```

### Updating OAuth2 Credentials

If you need to switch Dropbox accounts or your app credentials have changed:

1. Delete the existing token file:
   ```bash
   rm ~/MagicMirror/modules/MMM-PictureVerse/python/dropbox_token.json
   ```

2. Run the OAuth setup again:
   ```bash
   npm run setup-dropbox-oauth
   ```

## License

MIT

## Acknowledgments

- Thanks to the MagicMirror² team for creating the platform
- Daily Bible Verse API provided by [ourmanna.com](https://ourmanna.com)
- Built with ❤️ by Caleb Ishola
