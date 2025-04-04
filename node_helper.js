const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const chokidar = require("chokidar"); // For watching file system changes

module.exports = NodeHelper.create({
  start() {
    console.log("MMM-PictureVerse helper started");
    this.setupWatchers();
    
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
  
  startBlinkMonitor() {
    const path = require("path");
    const { exec } = require("child_process");
    const fs = require("fs");
    
    // Path to the run script
    const runScript = path.join(__dirname, "run-monitor.sh");
    
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
   * Cleans up Blink camera images, retaining only one image per camera per hour
   * This helps prevent accumulation of too many files while keeping the latest snapshot for each hour
   */
  cleanupBlinkImages() {
    const fs = require("fs");
    const path = require("path");
    
    const mediaPath = path.join(__dirname, "python", "media");
    if (!fs.existsSync(mediaPath)) {
      console.log("Media directory not found, nothing to clean up");
      return;
    }
    
    // Get all jpg files in the media directory
    const files = fs.readdirSync(mediaPath)
      .filter(f => f.toLowerCase().endsWith(".jpg"));
    
    if (files.length === 0) {
      console.log("No image files found to clean up");
      return;
    }
    
    console.log(`Found ${files.length} images to analyze for cleanup`);
    
    // Group files by camera name and hour timestamp
    const groupedFiles = {};
    
    files.forEach(filename => {
      // Extract camera name and timestamp
      // Expected format: CameraName_YYYYMMDD_HHMMSS.jpg
      const match = filename.match(/^(.+?)_(\d{8}_\d{2})(\d{4})\.jpg$/);
      
      if (!match) {
        console.log(`File ${filename} doesn't match expected format, skipping`);
        return;
      }
      
      const cameraName = match[1];
      const hourTimestamp = match[2]; // YYYYMMDD_HH
      
      // Create a compound key: cameraName + hourTimestamp
      const key = `${cameraName}_${hourTimestamp}`;
      
      if (!groupedFiles[key]) {
        groupedFiles[key] = [];
      }
      
      groupedFiles[key].push({
        filename,
        fullPath: path.join(mediaPath, filename),
        minuteSeconds: match[3], // The MMSS part
        stats: fs.statSync(path.join(mediaPath, filename))
      });
    });
    
    // For each group, keep only the newest file
    let deletedCount = 0;
    let retainedCount = 0;
    
    for (const key in groupedFiles) {
      const fileGroup = groupedFiles[key];
      
      if (fileGroup.length <= 1) {
        // Only one file for this camera/hour, nothing to clean up
        retainedCount++;
        continue;
      }
      
      // Sort by creation time (newest first)
      fileGroup.sort((a, b) => b.stats.ctimeMs - a.stats.ctimeMs);
      
      // Keep the newest file, delete the rest
      const newestFile = fileGroup[0];
      console.log(`Keeping newest file for ${key}: ${newestFile.filename}`);
      retainedCount++;
      
      // Delete all but the newest file
      for (let i = 1; i < fileGroup.length; i++) {
        try {
          fs.unlinkSync(fileGroup[i].fullPath);
          console.log(`Deleted older file: ${fileGroup[i].filename}`);
          deletedCount++;
        } catch (err) {
          console.error(`Error deleting file ${fileGroup[i].filename}: ${err}`);
        }
      }
    }
    
    console.log(`Cleanup complete: retained ${retainedCount} files (newest per camera/hour), deleted ${deletedCount} files`);
  },
  
  /**
   * Load family images from the Pictures folder, sort by creation time, 
   * and send to the client with a flag if this was triggered by a new upload
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

    const fileList = fs.readdirSync(picturesPath)
      .filter(f => f.toLowerCase().endsWith(".jpg") || 
                  f.toLowerCase().endsWith(".jpeg") || 
                  f.toLowerCase().endsWith(".png") ||
                  f.toLowerCase().endsWith(".gif"));
    
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
      
      // Find the latest image and videos by creation time
      const imageFiles = files.filter(f => f.endsWith(".jpg"));
      const videoFiles = files.filter(f => f.endsWith(".mp4"));
      
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
    
          // Filter for image and video files
          const imageFiles = files.filter(f => f.endsWith(".jpg")).sort().reverse();
          const videoFiles = files.filter(f => f.endsWith(".mp4")).sort().reverse();
    
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

  fetchVerse() {
    const https = require("https");
    https.get("https://beta.ourmanna.com/api/v1/get/?format=text", res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        this.sendSocketNotification("VERSE_RESULT", data.trim());
      });
    }).on("error", () => {
      this.sendSocketNotification("VERSE_RESULT", "Verse not available.");
    });
  }
});