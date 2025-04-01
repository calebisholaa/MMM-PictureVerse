# MMM-PictureVerse

A MagicMirror² module that displays:
- Family photos from your Dropbox as the main display
- Bible verses of the day (shown once per hour)
- Blink security camera feeds (shown once per hour)
- Motion detection video clips from Blink cameras (shown immediately when detected)

## Features

- **Family Photos**: Connect to your Dropbox account to display your family photos
- **Bible Verses**: Shows a Bible verse once per hour from the Daily Verse API
- **Security Cameras**: Displays feeds from your Blink security cameras once per hour
- **Motion Detection**: Immediately shows video clips when motion is detected by your cameras
- **Automatic Updates**: New photos added to Dropbox appear automatically on your mirror

## Installation

1. Navigate to your MagicMirror's modules folder:
   ```bash
   cd ~/MagicMirror/modules/
   ```

2. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/MMM-PictureVerse.git
   ```

3. Install dependencies:
   ```bash
   cd MMM-PictureVerse
   
   # Make sure Python virtual environment package is installed
   sudo apt update
   sudo apt install python3-venv
   
   # Install module dependencies and set up Python virtual environment
   npm install
   
   # Make the scripts executable
   chmod +x *.sh
   ```

The installation process will automatically:
- Install Node.js dependencies
- Create a Python virtual environment
- Install the required Python packages (dropbox, blinkpy, aiohttp)

## Setting Up Dropbox

To display photos from your Dropbox account:

1. Create a Dropbox app:
   - Go to [Dropbox Developer Apps](https://www.dropbox.com/developers/apps)
   - Click "Create app"
   - Choose "Scoped access"
   - Choose "Full Dropbox" access
   - Give your app a name (e.g., "MagicMirrorPhotos")
   - Click "Create app"

2. Generate an access token:
   - In your new app's settings, go to the "OAuth 2" section
   - Click "Generate" under "Generated access token"
   - Copy the access token

3. Create a configuration file:
   - In your module directory, navigate to the python folder:
     ```bash
     cd ~/MagicMirror/modules/MMM-PictureVerse/python/
     ```
   - Create a file named `dropbox_config.json`:
     ```bash
     nano dropbox_config.json
     ```
   - Add the following content, replacing the values with your own:
     ```json
     {
       "access_token": "YOUR_DROPBOX_ACCESS_TOKEN",
       "dropbox_folder": "/YourPhotosFolder",
       "allowed_extensions": [".jpg", ".jpeg", ".png", ".gif"]
     }
     ```
   - Save the file (Ctrl+O, then Enter, then Ctrl+X)

4. Test your configuration by running:
   ```bash
   cd ~/MagicMirror/modules/MMM-PictureVerse/
   npm run sync-dropbox
   ```

## Module Configuration

Add the module to your `config/config.js` file:

```javascript
{
  module: "MMM-PictureVerse",
  position: "fullscreen", // Recommended for photo display
  config: {
    // How long to show each family photo (default: 30 seconds)
    familyInterval: 30000,
    
    // Show verse once per hour (default: 1 hour)
    verseInterval: 3600000,
    
    // Show cameras once per hour (default: 1 hour)
    cameraInterval: 3600000,
    
    // How long to display cameras when shown (default: 1 minute)
    cameraDisplayTime: 60000,
    
    // Whether to interrupt normal flow to show motion clips (default: true)
    prioritizeMotionClips: true,
    
    // How long to show motion clips (default: 30 seconds)
    motionClipDisplayTime: 30000,
    
    // Whether to enable Blink camera integration (default: true)
    showBlink: true
  }
}
```

## Setting Up Blink Cameras (Optional)

If you have Blink cameras and want to display their feeds:

1. Run the Blink setup script:
   ```bash
   npm run setup-blink
   ```

2. Follow the prompts to enter your Blink credentials and 2FA code

## How It Works

The module will display your photos from Dropbox as the main content, with Bible verses and camera feeds shown at configured intervals:

- **Photos**: Your Dropbox photos are the primary display, rotating at your configured interval (default: 30 seconds)
- **Verses**: A Bible verse will be shown once per hour for 1 minute
- **Cameras**: Security camera feeds are shown once per hour for 1 minute
- **Motion**: Motion detection clips interrupt the regular display when detected

### Automatic Updates

- The module checks for new photos in your Dropbox folder every 5 minutes
- New photos are immediately added to the rotation
- Deleted photos are automatically removed
- Motion detection clips are displayed as soon as they are detected

## Troubleshooting

- **No photos appearing**: 
  - Check that your Dropbox configuration is correct
  - Make sure your access token is valid
  - Verify photos exist in the specified Dropbox folder
  - Run `npm run sync-dropbox` to manually sync photos

- **Bible verses not showing**: 
  - Check your internet connection
  - The API might be temporarily unavailable

- **Blink cameras not working**:
  - Run the setup script again: `npm run setup-blink`
  - Check your Blink credentials
  - Ensure your Blink cameras are online

- **Python issues**:
  - If you encounter Python-related errors, try reinstalling the virtual environment:
    ```bash
    rm -rf python/venv
    ./setup-venv.sh
    ```

## License

MIT

## Acknowledgments

- Thanks to the MagicMirror² team for creating the platform
- Daily Bible Verse API provided by [ourmanna.com](https://ourmanna.com)
- Built with ❤️ by Caleb Ishola
