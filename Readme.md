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

3. Create a configuration file using the template:
   - In your module directory, navigate to the python folder:
     ```bash
     cd ~/MagicMirror/modules/MMM-PictureVerse/python/
     ```
   - Copy the template to create your configuration file:
     ```bash
     cp dropbox_config_template.json dropbox_config.json
     ```
   - Edit the new configuration file:
     ```bash
     nano dropbox_config.json
     ```
   - Update the content with your information:
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

## How It Works

The module follows a structured sequence that repeats every hour:

1. **Bible Verse (2 minutes)**: At the start of each hour, the module displays the verse of the day for 2 minutes.
2. **Camera Images (2 minutes)**: After the verse, the module displays security camera images for 2 minutes. It prioritizes images from the current hour.
3. **Family Photos (remainder of hour)**: For the rest of the hour, the module displays family photos from your Dropbox with smooth transitions.
4. **Motion Detection**: The module continuously monitors your Blink cameras in the background. If motion is detected, it immediately interrupts the normal display to show the motion clip with a visual alert and timestamp.

At the start of a new hour, the sequence begins again with a fresh verse and camera images.

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
    backgroundStyle: "blur",    // Options: "blur", "color", or "none"
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

- **Motion detection not working**:
  - Check the monitor logs: `cat ~/MagicMirror/modules/MMM-PictureVerse/logs/blink_monitor.log`
  - Verify your Blink cameras are properly set up for motion detection in the Blink app
  - Restart MagicMirror to restart the monitor

- **Python issues**:
  - If you encounter Python-related errors, try reinstalling the virtual environment:
    ```bash
    rm -rf python/venv
    ./setup-venv.sh
    ```

## Advanced: Checking Monitor Status

The motion monitor runs automatically in the background. To check its status:

```bash
# View the monitor logs
cat ~/MagicMirror/modules/MMM-PictureVerse/logs/blink_monitor.log

# Check if the monitor process is running
ps aux | grep BlinkMonitor.py
```

## License

MIT

## Acknowledgments

- Thanks to the MagicMirror² team for creating the platform
- Daily Bible Verse API provided by [ourmanna.com](https://ourmanna.com)
- Built with ❤️ by Caleb Ishola
