const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const chokidar = require("chokidar"); // For watching file system changes

module.exports = NodeHelper.create({
  start() {
    console.log("MMM-PictureVerse helper started");

    this.knownFiles = new Set();
    this.isInitialScan = true;

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

    // Set up the remote reboot/update page
    this.setupRemote();
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

  // Sets up a token-protected page at /pictureverse/remote with Reboot
  // and Update buttons, served from MagicMirror's own web server.
  setupRemote() {
    if (!this.expressApp) {
      console.error("[MMM-PictureVerse] No expressApp available, remote control disabled");
      return;
    }

    const crypto = require("crypto");
    const tokenPath = path.join(__dirname, ".remote_token");

    if (fs.existsSync(tokenPath)) {
      this.remoteToken = fs.readFileSync(tokenPath, "utf8").trim();
    } else {
      this.remoteToken = crypto.randomBytes(16).toString("hex");
      fs.writeFileSync(tokenPath, this.remoteToken);
    }

    console.log(`[MMM-PictureVerse] Remote control: http://<pi-ip-address>:8080/pictureverse/remote?token=${this.remoteToken}`);

    const checkToken = (req) => {
      const provided = Buffer.from(String(req.query.token || ""));
      const expected = Buffer.from(this.remoteToken);
      return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
    };

    this.expressApp.get("/pictureverse/remote", (req, res) => {
      if (!checkToken(req)) {
        res.status(403).send("Forbidden");
        return;
      }
      res.send(this.renderRemotePage(req.query.token));
    });

    this.expressApp.post("/pictureverse/remote/reboot", (req, res) => {
      if (!checkToken(req)) {
        res.status(403).send("Forbidden");
        return;
      }
      res.send("Rebooting...");
      setTimeout(() => exec("sudo reboot"), 500);
    });

    this.expressApp.post("/pictureverse/remote/update", (req, res) => {
      if (!checkToken(req)) {
        res.status(403).send("Forbidden");
        return;
      }
      res.send("Update started, the mirror will restart in a minute or two.");

      const cmd = `cd "${__dirname}" && git pull && npm install && pm2 restart all`;
      exec(cmd, { timeout: 5 * 60 * 1000 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[MMM-PictureVerse] Remote update failed: ${error.message}`);
          console.error(stderr);
        } else {
          console.log("[MMM-PictureVerse] Remote update output:", stdout);
        }
      });
    });
  },

  renderRemotePage(token) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mirror Remote</title>
  <style>
    body { font-family: sans-serif; background: #111; color: #eee; display: flex; flex-direction: column;
           align-items: center; justify-content: center; height: 100vh; margin: 0; gap: 1rem; }
    button { font-size: 1.2rem; padding: 1rem 2rem; border-radius: 8px; border: none; cursor: pointer; }
    #update { background: #2980b9; color: white; }
    #reboot { background: #c0392b; color: white; }
    #status { min-height: 1.5rem; }
  </style>
</head>
<body>
  <h1>Mirror Remote</h1>
  <button id="update">Update</button>
  <button id="reboot">Reboot</button>
  <div id="status"></div>
  <script>
    const token = ${JSON.stringify(String(token || ""))};
    const status = document.getElementById("status");
    function run(action, confirmMsg) {
      if (confirmMsg && !confirm(confirmMsg)) return;
      status.textContent = "Working...";
      fetch("/pictureverse/remote/" + action + "?token=" + encodeURIComponent(token), { method: "POST" })
        .then(r => r.text())
        .then(t => status.textContent = t)
        .catch(e => status.textContent = "Error: " + e);
    }
    document.getElementById("update").onclick = () => run("update");
    document.getElementById("reboot").onclick = () => run("reboot", "Reboot the mirror now?");
  </script>
</body>
</html>`;
  },

  startBlinkMonitor() {
    // Path to the run script
    const runScript = path.join(__dirname, "run-monitor.sh");

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
    exec(`chmod +x "${runScript}"`, (error) => {
      if (error) {
        console.error(`Error making run script executable: ${error}`);
        return;
      }

      // Execute the wrapper script
      exec(`"${runScript}"`, (error, stdout, stderr) => {
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
    console.log("Stopping Blink motion monitor...");

    exec("pkill -f \"python/BlinkMonitor.py\"", (error) => {
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
    
      // Initialize known files on startup (BEFORE watching)
    if (fs.existsSync(picturesPath)) {
      const existingFiles = fs.readdirSync(picturesPath).filter(f => this.isImageFile(f));
      existingFiles.forEach(file => this.knownFiles.add(file));
      console.log(`Initialized with ${this.knownFiles.size} existing files in Pictures folder`);
    }

    // Handle file additions - check if truly NEW
    this.picturesWatcher.on("add", (filePath) => {
      const filename = path.basename(filePath);
      
      // Only treat as NEW if we haven't seen this file before
      if (!this.knownFiles.has(filename) && this.isImageFile(filename)) {
        console.log(`NEW upload detected: ${filename}`);
        this.knownFiles.add(filename);
        this.loadFamilyImages(true);  // TRUE = new upload
      } else {
        console.log(`Known file re-detected: ${filename}`);
        this.loadFamilyImages(false);  // FALSE = just refresh
      }
    });

    // Handle file removals
    this.picturesWatcher.on("unlink", (filePath) => {
      const filename = path.basename(filePath);
      console.log(`File removed from Pictures: ${filename}`);
      this.knownFiles.delete(filename);
      this.loadFamilyImages(false);  // Not a new upload, just refresh
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
    const mediaPath = path.join(__dirname, "python", "media");
    const RETAIN_HOURS = 2; // keep last 2 hour-buckets per camera

    if (!fs.existsSync(mediaPath)) {
      console.log("Media directory not found, nothing to clean up");
      return;
    }

    const files = fs.readdirSync(mediaPath).filter(f => this.isMediaFile(f));

    if (files.length === 0) {
      console.log("No media files found to clean up");
      return;
    }

    // Parse: CameraName_YYYYMMDD_HHMMSS.jpg/jpeg/mp4 → groups by (camera, hour)
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
      const bucketFiles = byHour[key];
      if (bucketFiles.length <= 1) { kept++; continue; }

      bucketFiles.sort((a, b) => b.ts.localeCompare(a.ts)); // newest first
      kept++;
      for (let i = 1; i < bucketFiles.length; i++) {
        try {
          fs.unlinkSync(bucketFiles[i].fullPath);
          console.log(`Deleted older file: ${bucketFiles[i].filename}`);
          deleted++;
        } catch (e) {
          console.error(`Error deleting ${bucketFiles[i].filename}: ${e}`);
        }
      }
      // shrink array to only the newest
      byHour[key] = [bucketFiles[0]];
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

      exec(`"${pythonExec}" "${script}"`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing Blink.py: ${error}`);
          console.error(stderr);
          this.sendSocketNotification("BLINK_MEDIA_READY", { images: [], videos: [] });
          return;
        }

        console.log("Blink.py output:", stdout);
        this.cleanupBlinkImages(); // Clean up after new images are fetched

        const mediaPath = path.join(__dirname, "python", "media");
        if (!fs.existsSync(mediaPath)) {
          console.log("Media directory not found");
          this.sendSocketNotification("BLINK_MEDIA_READY", { images: [], videos: [] });
          return;
        }

        const files = fs.readdirSync(mediaPath);

        // Get all image and video files
        const imageFiles = files.filter(f => this.isImageFile(f));
        const videoFiles = files.filter(f => this.isVideoFile(f));

        // Sort by filename (which contains timestamp) - newest first
        imageFiles.sort().reverse();
        videoFiles.sort().reverse();

        // Group images by camera name to ensure we get one per camera
        const imagesByCamera = {};

        imageFiles.forEach(filename => {
          // Extract camera name from filename (e.g., "Garage_20241203_143022.jpg" -> "Garage")
          const match = filename.match(/^(.+?)_\d{8}_\d{6}/);
          if (match) {
            const cameraName = match[1];
            // Keep only the newest image per camera
            if (!imagesByCamera[cameraName]) {
              imagesByCamera[cameraName] = filename;
            }
          }
        });

        // Get the list of newest images (one per camera)
        const newestImages = Object.values(imagesByCamera);

        console.log(`Found ${newestImages.length} camera images (one per camera)`);
        console.log(`Camera names: ${Object.keys(imagesByCamera).join(', ')}`);

        this.sendSocketNotification("BLINK_MEDIA_READY", {
          images: newestImages.map(f => `modules/MMM-PictureVerse/python/media/${f}`),
          videos: videoFiles.map(v => `modules/MMM-PictureVerse/python/media/${v}`)
        });
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

    exec(`"${pythonExec}" "${script}"`, (error, stdout, stderr) => {
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