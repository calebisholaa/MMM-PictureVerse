const NodeHelper = require("node_helper");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const chokidar = require("chokidar"); // For watching file system changes

module.exports = NodeHelper.create({
  start() {
    console.log("MMM-PictureVerse helper started");
    this.setupWatchers();
    
    // Set up periodic Dropbox sync (every 5 minutes)
    this.dropboxInterval = setInterval(() => {
      this.syncDropbox(() => {
        this.loadFamilyImages();
      });
    }, 5 * 60 * 1000); // 5 minutes
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
        this.loadFamilyImages();
      }
    });
  },
  
  loadFamilyImages() {
    // Load family images from the Pictures folder
    const picturesPath = path.join(__dirname, "Pictures");
    if (!fs.existsSync(picturesPath)) {
      console.log("Pictures directory not found, creating it");
      fs.mkdirSync(picturesPath, { recursive: true });
      return;
    }
  
    const files = fs.readdirSync(picturesPath)
      .filter(f => f.toLowerCase().endsWith(".jpg") || 
                   f.toLowerCase().endsWith(".jpeg") || 
                   f.toLowerCase().endsWith(".png") ||
                   f.toLowerCase().endsWith(".gif"))
      .map(f => `modules/MMM-PictureVerse/Pictures/${f}`);
  
    console.log(`Found ${files.length} family images`);
    this.sendSocketNotification("FAMILY_IMAGES", files);
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
      const script = path.join(__dirname, "python", "Blink.py");
      const pythonExec = path.join(__dirname, "python", "venv", "bin", "python");
      
      exec(`${pythonExec} ${script}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing Blink.py: ${error}`);
          console.error(stderr);
          return;
        }
        
        console.log("Blink.py output:", stdout);
        
        // After executing the script, scan for media
        const mediaPath = path.join(__dirname, "python", "media");
        if (fs.existsSync(mediaPath)) {
          const files = fs.readdirSync(mediaPath);
          
          // Find the latest files - sorted by name which includes timestamp
          const imageFiles = files.filter(f => f.endsWith(".jpg")).sort().reverse();
          const videoFiles = files.filter(f => f.endsWith(".mp4")).sort().reverse();
          
          const latestImage = imageFiles.length > 0 ? imageFiles[0] : null;
          
          this.sendSocketNotification("BLINK_MEDIA_READY", {
            image: latestImage ? `modules/MMM-PictureVerse/python/media/${latestImage}` : null,
            videos: videoFiles.map(v => `modules/MMM-PictureVerse/python/media/${v}`)
          });
        }
      });
    }

    if (notification === "REQUEST_IMAGES") {
      // First, ensure the Dropbox sync is fresh
      this.syncDropbox(() => {
        this.loadFamilyImages();
      });
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
      } else {
        console.log("Dropbox sync output:", stdout);
      }
      
      if (callback) callback();
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