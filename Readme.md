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
    showBlink: true,
    
    // Image display settings
    opacity: 0.9,
    backgroundStyle: "blur",    // Options: "blur", "color", or "none"
    backgroundColor: "#000000", // Used when backgroundStyle is "color"
    blur: 8,                    // Blur amount in pixels when using "blur" style
    transition: 1000            // Transition time between images (ms)
    sequential: false              // Whether to cycle images sequentially or randomly

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
