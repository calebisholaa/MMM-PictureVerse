const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const chokidar = require("chokidar"); // For watching file system changes

module.exports = NodeHelper.create({
  start() {
    console.log("MMM-PictureVerse helper started");
    this.setupWatchers();
    
    // BUG FIX #1: Removed duplicate startCleanupScript() call
    this.startCleanupScript();
    
    // Set up the motion detection monitor
    this.startBlinkMonitor();

    // Set up periodic Dropbox sync (every 1 minute)
    this.dropboxInterval = setInterval(() => {
      this.syncDropbox((newFilesDownloaded) => {
        this.loadFamilyImages(newFilesDownloaded);
      });
    }, 1 * 60 * 1000); // 1 minute
    
    // Set up hourly cleanup of Blink images
    this.cleanupInterval = setInterval(() => {
      this.cleanupBlinkImages();
    }, 60 * 60 * 1000); // Run every hour
    
    // Run initial cleanup
    this.cleanupBlinkImages();
  },
  
  stop() {
    // Clear all intervals when module stops
    if (this.dropboxInterval) {
      clearInterval(this.dropboxInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Stop the Blink monitor
    this.stopBlinkMonitor();
    
    // Close file watchers
    if (this.watcher) {
      this.watcher.close();
    }
    if (this.picturesWatcher) {
      this.picturesWatcher.close();
    }
  },
  
  startBlinkMonitor() {
    const path = require("path");
    const { exec } = require("child_process");
    const fs = require("fs");
    
    // Path to the run script
    const runScript = path.join(__dirname, "run-monitor.sh");
    
    // BUG FIX #8: Check if script exists before executing
    if (!fs.existsSync(runScript)) {
      console.log("run-monitor.sh not found, skipping motion monitor startup");
      return;
    }
    
    // Check if Blink credentials exist
    const credsPath = path.join(__dirname, "python", "creds.json");
    if (!fs.existsSync(credsPath)) {
      console.log("Blink credentials not found, skipping motion monitor startup");
      return;
    }
    
    console.log("Starting Blink motion monitor...");
    
    // Make sure the script is executable
    exec(`chmod +x ${runScript}`, (error) => {
      if (error) {
        console.error(`Error making run script executable: ${error}`);
        return;
      }
      
      // Execute the wrapper script
      exec(runScript, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error starting Blink monitor: ${error}`);
          if (stderr) console.error(stderr);
          return;
        }
        
        console.log("Blink motion monitor started successfully");
        if (stdout) console.log(stdout);
      });
    });
  },
  
  stopBlinkMonitor() {
    const { exec } = require("child_process");
    console.log("Stopping Blink motion monitor...");
    
    exec("pkill -f \"python/BlinkMonitor.py\"", (error, stdout, stderr) => {
      if (error && error.code !== 1) { // Code 1 just means no processes found
        console.error(`Error stopping Blink monitor: ${error}`);
        return;
      }
      
      console.log("Blink motion monitor stopped");
    });
  },

  setupWatchers() {
    // Set up a watcher for the motion detection folder
    const mediaPath = path.join(__dirname, "python", "media");
    
    // Ensure the directory exists
    if (!fs.existsSync(mediaPath)) {
      fs.mkdirSync(mediaPath, { recursive: true });
    }
    
    // Watch for new files in the media directory (for motion clips)
    this.watcher = chokidar.watch(mediaPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });
    
    this.watcher.on("add", (filePath) => {
      if (filePath.endsWith(".mp4")) {
        console.log("Motion clip detected:", filePath);
        this.notifyMotionDetection();
      }
    });
    
    // Also watch the Pictures folder for changes (manual additions/deletions)
    const picturesPath = path.join(__dirname, "python", "Pictures");
    
    // Ensure the Pictures directory exists
    if (!fs.existsSync(picturesPath)) {
      fs.mkdirSync(picturesPath, { recursive: true });
    }
    
    // Watch for changes in the Pictures directory
    this.picturesWatcher = chokidar.watch(picturesPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });
    
    // When files are added or removed, update the image list
    this.picturesWatcher.on("all", (event) => {
      if (event === "add" || event === "unlink") {
        console.log(`Pictures folder ${event} detected, updating image list`);
        // Pass true to indicate a new upload was detected
        this.loadFamilyImages(event === "add");
      }
    });
  },
  
  /**
   * Helper function to check if file matches supported image/video extensions
   */
  isMediaFile(filename) {
    const lowerFilename = filename.toLowerCase();
    return lowerFilename.endsWith(".jpg") || 
           lowerFilename.endsWith(".jpeg") || 
           lowerFilename.endsWith(".png") ||
           lowerFilename.endsWith(".gif") ||
           lowerFilename.endsWith(".mp4");
  },
  
  /**
   * Helper function to check if file is an image
   */
  isImageFile(filename) {
    const lowerFilename = filename.toLowerCase();
    return lowerFilename.endsWith(".jpg") || 
           lowerFilename.endsWith(".jpeg") || 
           lowerFilename.endsWith(".png") ||
           lowerFilename.endsWith(".gif");
  },
  
  /**
   * Helper function to check if file is a video
   */
  isVideoFile(filename) {
    return filename.toLowerCase().endsWith(".mp4");
  },
  
  /**
   * Cleans up Blink camera images, retaining only one image per camera per hour
   * This helps prevent accumulation of too many files while keeping the latest snapshot for each hour
   */
  cleanupBlinkImages() {
    const fs = require("fs");
    const path = require("path");
  
    const mediaPath = path.join(__dirname, "python", "media");
    // BUG FIX #3: Fixed misleading comment - actually retains 2 hour-buckets
    const RETAIN_HOURS = 2; // keep last 2 hour-buckets per camera
  
    if (!fs.existsSync(mediaPath)) {
      console.log("Media directory not found, nothing to clean up");
      return;
    }
  
    // BUG FIX #7: Use consistent file filtering
    const files = fs.readdirSync(mediaPath).filter(f => this.isMediaFile(f));
  
    if (files.length === 0) {
      console.log("No media files found to clean up");
      return;
    }
  
    // BUG FIX #2: Updated regex to match both jpg/jpeg AND mp4 files
    // Parse: CameraName_YYYYMMDD_HHMMSS.jpg/mp4 → groups by (camera, hour)
    const rx = /^(.+?)_(\d{8})_(\d{2})(\d{4})\.(jpg|jpeg|mp4)$/i;
    const byHour = {}; // key: `${camera}_${YYYYMMDD}_${HH}` → files[]
  
    for (const filename of files) {
      const m = filename.match(rx);
      if (!m) {
        console.log(`File ${filename} doesn't match expected format, skipping`);
        continue;
      }
      const camera = m[1];
      const yyyymmdd = m[2];
      const HH = m[3];
      const mmss = m[4]; // MMSS
      const ts = `${yyyymmdd}_${HH}${mmss}`; // YYYYMMDD_HHMMSS (as string; lexicographic works)
      const key = `${camera}_${yyyymmdd}_${HH}`;
  
      if (!byHour[key]) byHour[key] = [];
      byHour[key].push({
        filename,
        fullPath: path.join(mediaPath, filename),
        ts
      });
    }
  
    let deleted = 0;
    let kept = 0;
  
    // 1) Dedup within each hour-bucket: keep newest ts
    for (const key of Object.keys(byHour)) {
      const files = byHour[key];
      if (files.length <= 1) { kept++; continue; }
  
      files.sort((a, b) => b.ts.localeCompare(a.ts)); // newest first
      kept++;
      for (let i = 1; i < files.length; i++) {
        try {
          fs.unlinkSync(files[i].fullPath);
          console.log(`Deleted older file: ${files[i].filename}`);
          deleted++;
        } catch (e) {
          console.error(`Error deleting ${files[i].filename}: ${e}`);
        }
      }
      // shrink array to only the newest
      byHour[key] = [files[0]];
    }
  
    // 2) Retention: keep only last N hour-buckets per camera
    // Build per-camera list of hour keys, newest→oldest by key suffix (YYYYMMDD_HH)
    const byCamera = {};
    for (const key of Object.keys(byHour)) {
      // key format camera_YYYYMMDD_HH → split last two underscores
      const lastUnderscore = key.lastIndexOf("_");
      const secondUnderscore = key.lastIndexOf("_", lastUnderscore - 1);
      const camera = key.substring(0, secondUnderscore);
      const hourKey = key.substring(secondUnderscore + 1); // YYYYMMDD_HH
  
      if (!byCamera[camera]) byCamera[camera] = [];
      byCamera[camera].push({ key, hourKey });
    }
  
    // For each camera, sort hour keys descending, keep only top RETAIN_HOURS
    for (const camera of Object.keys(byCamera)) {
      const hourBuckets = byCamera[camera];
      hourBuckets.sort((a, b) => b.hourKey.localeCompare(a.hourKey));
  
      if (hourBuckets.length <= RETAIN_HOURS) continue;
  
      // Remove everything beyond RETAIN_HOURS
      for (let i = RETAIN_HOURS; i < hourBuckets.length; i++) {
        const oldKey = hourBuckets[i].key;
        const fileInfo = byHour[oldKey][0]; // We only have one file per hour-bucket now
        try {
          fs.unlinkSync(fileInfo.fullPath);
          console.log(`Deleted old hour-bucket file: ${fileInfo.filename}`);
          deleted++;
        } catch (e) {
          console.error(`Error deleting ${fileInfo.filename}: ${e}`);
        }
      }
    }
  
    console.log(`Cleanup complete: Kept ${kept} files, deleted ${deleted} files`);
  },
  
  /**
   * Load family images from the Pictures folder
   * @param {boolean} newUploadDetected - Whether this refresh was triggered by a new file upload
   */
  loadFamilyImages(newUploadDetected = false) {
    // Load family images from the Pictures folder
    const picturesPath = path.join(__dirname, "python", "Pictures");
    if (!fs.existsSync(picturesPath)) {
      console.log("Pictures directory not found, creating it");
      fs.mkdirSync(picturesPath, { recursive: true });
      return;
    }

    // BUG FIX #7: Use consistent file filtering
    const fileList = fs.readdirSync(picturesPath).filter(f => this.isImageFile(f));
    
    // Get file stats to sort by creation time (newest first)
    const fileStats = fileList.map(filename => {
      const fullPath = path.join(picturesPath, filename);
      const stats = fs.statSync(fullPath);
      return {
        filename: filename,
        path: `modules/MMM-PictureVerse/python/Pictures/${filename}`,
        ctime: stats.ctimeMs  // Creation time in milliseconds
      };
    });
    
    // Sort files by creation time, newest first
    fileStats.sort((a, b) => b.ctime - a.ctime);
    
    // Extract just the paths for sending to the client
    const files = fileStats.map(file => file.path);

    console.log(`Found ${files.length} family images`);
    
    // Send the sorted list and flag if this was triggered by a new image
    this.sendSocketNotification("FAMILY_IMAGES", {
      images: files,
      newUpload: newUploadDetected
    });
  },
  
  notifyMotionDetection() {
    // Scan the media folder and send the latest media
    const mediaPath = path.join(__dirname, "python", "media");
    if (fs.existsSync(mediaPath)) {
      const files = fs.readdirSync(mediaPath);
      
      // BUG FIX #7: Use consistent file filtering
      const imageFiles = files.filter(f => this.isImageFile(f));
      const videoFiles = files.filter(f => this.isVideoFile(f));
      
      // Sort by creation time (newest first)
      const sortByCreationTime = (a, b) => {
        const statsA = fs.statSync(path.join(mediaPath, a));
        const statsB = fs.statSync(path.join(mediaPath, b));
        return statsB.birthtime - statsA.birthtime;
      };
      
      imageFiles.sort(sortByCreationTime);
      videoFiles.sort(sortByCreationTime);
      
      const latestImage = imageFiles.length > 0 ? imageFiles[0] : null;
      
      this.sendSocketNotification("BLINK_MEDIA_READY", {
        image: latestImage ? `modules/MMM-PictureVerse/python/media/${latestImage}` : null,
        videos: videoFiles.map(v => `modules/MMM-PictureVerse/python/media/${v}`)
      });
    }
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "REQUEST_VERSE") {
      this.fetchVerse();
    }

    if (notification === "CHECK_BLINK") {
      const credsPath = path.join(__dirname, "python", "creds.json");
      this.sendSocketNotification("BLINK_STATUS", fs.existsSync(credsPath));
    }

    if (notification === "REQUEST_BLINK") {
      // Clean up old images first
      this.cleanupBlinkImages();
      
      const script = path.join(__dirname, "python", "Blink.py");
      const pythonExec = path.join(__dirname, "python", "venv", "bin", "python");
      
      // BUG FIX #8: Check if paths exist before executing
      if (!fs.existsSync(script)) {
        console.error(`Blink.py not found at: ${script}`);
        this.sendSocketNotification("BLINK_MEDIA_READY", { images: [], videos: [] });
        return;
      }
      
      if (!fs.existsSync(pythonExec)) {
        console.error(`Python executable not found at: ${pythonExec}`);
        this.sendSocketNotification("BLINK_MEDIA_READY", { images: [], videos: [] });
        return;
      }
    
      exec(`${pythonExec} ${script}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing Blink.py: ${error}`);
          console.error(stderr);
          return;
        }
    
        console.log("Blink.py output:", stdout);
        this.cleanupBlinkImages(); // Clean up after new images are fetched
    
        const mediaPath = path.join(__dirname, "python", "media");
        if (fs.existsSync(mediaPath)) {
          const files = fs.readdirSync(mediaPath);
    
          // BUG FIX #7: Use consistent file filtering
          const imageFiles = files.filter(f => this.isImageFile(f)).sort().reverse();
          const videoFiles = files.filter(f => this.isVideoFile(f)).sort().reverse();
    
          // Determine current hour timestamp from the newest image or use current time
          const now = new Date();
          const currentHourPrefix = now.toISOString().slice(0, 10).replace(/-/g, '') + '_' + 
                                     String(now.getHours()).padStart(2, '0');
          
          // First, try to find images from the current hour
          let matchingImages = imageFiles.filter(filename => {
            const match = filename.match(/(\d{8}_\d{2})\d{4}/);
            return match && match[1] === currentHourPrefix;
          });
          
          // If no images from current hour, include all images from today
          if (matchingImages.length === 0) {
            const todayPrefix = now.toISOString().slice(0, 10).replace(/-/g, '');
            matchingImages = imageFiles.filter(filename => filename.includes(todayPrefix));
            
            // If still no images, just use all images
            if (matchingImages.length === 0) {
              matchingImages = imageFiles;
            }
          }
          
          console.log(`Found ${matchingImages.length} matching camera images for current hour/day`);
    
          this.sendSocketNotification("BLINK_MEDIA_READY", {
            images: matchingImages.map(f => `modules/MMM-PictureVerse/python/media/${f}`),
            videos: videoFiles.map(v => `modules/MMM-PictureVerse/python/media/${v}`)
          });
        } else {
          console.log("Media directory not found");
          this.sendSocketNotification("BLINK_MEDIA_READY", { images: [], videos: [] });
        }
      });
    }

    if (notification === "SYNC_DROPBOX") {
      // Directly sync with Dropbox without waiting for loadFamilyImages
      console.log("Performing immediate Dropbox sync on startup");
      this.syncDropbox();
    }

    if (notification === "REQUEST_IMAGES") {
      // First, ensure the Dropbox sync is fresh
      this.syncDropbox(() => {
        this.loadFamilyImages();
      });
    }

    // Add these new handlers
    if (notification === "START_BLINK_MONITOR") {
      this.startBlinkMonitor();
    }
    
    if (notification === "STOP_BLINK_MONITOR") {
      this.stopBlinkMonitor();
    }
    
    // Handle cleanup request
    if (notification === "CLEANUP_BLINK_IMAGES") {
      console.log("Received request to clean up Blink images");
      this.cleanupBlinkImages();
    }
  },

  syncDropbox(callback) {
    const script = path.join(__dirname, "python", "Dropbox.py");
    const pythonExec = path.join(__dirname, "python", "venv", "bin", "python");
    
    // BUG FIX #8: Check if paths exist before executing
    if (!fs.existsSync(script)) {
      console.error(`Dropbox.py not found at: ${script}`);
      if (callback) callback(false);
      return;
    }
    
    if (!fs.existsSync(pythonExec)) {
      console.error(`Python executable not found at: ${pythonExec}`);
      if (callback) callback(false);
      return;
    }
    
    console.log("Syncing Dropbox images...");
    
    exec(`${pythonExec} ${script}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing Dropbox.py: ${error}`);
        console.error(stderr);
        if (callback) callback(false);
      } else {
        console.log("Dropbox sync output:", stdout);
        // Check if any files were downloaded
        const filesDownloaded = stdout.includes("Downloaded") && !stdout.includes("Downloaded 0 new files");
        if (callback) callback(filesDownloaded);
      }
    });
  },
  
  startCleanupScript() {
    const path = require("path");
    const { exec } = require("child_process");
    
    // Path to the Python script
    const scriptPath = path.join(__dirname, "python", "CleanUpMedia.py");
    const pythonExec = path.join(__dirname, "python", "venv", "bin", "python");
    
    // BUG FIX #8: Check if paths exist before executing
    if (!fs.existsSync(scriptPath)) {
      console.log(`CleanUpMedia.py not found at: ${scriptPath}, skipping`);
      return;
    }
    
    if (!fs.existsSync(pythonExec)) {
      console.error(`Python executable not found at: ${pythonExec}`);
      return;
    }
    
    console.log("Starting media cleanup script...");
    exec(`${pythonExec} ${scriptPath} &`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error starting cleanup script: ${error}`);
        return;
      }
      console.log("Media cleanup script started successfully");
    });
  },

  fetchVerse() {
    const https = require("https");
    
    // BUG FIX #4: Add timeout to HTTP request
    const request = https.get("https://beta.ourmanna.com/api/v1/get/?format=text", res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        this.sendSocketNotification("VERSE_RESULT", data.trim());
      });
    }).on("error", (error) => {
      console.error(`Error fetching verse: ${error.message}`);
      this.sendSocketNotification("VERSE_RESULT", "Verse not available.");
    });
    
    // Set timeout to 10 seconds
    request.setTimeout(10000, () => {
      console.error("Verse fetch timeout after 10 seconds");
      request.destroy();
      this.sendSocketNotification("VERSE_RESULT", "Verse not available.");
    });
  }
});
