Module.register("MMM-PictureVerse", {
  defaults: {
    // Main timing settings
    familyInterval: 30000,         // How long to show each family photo (30 sec)
    verseInterval: 3600000,        // Show verse once per hour (1 hour)
    cameraInterval: 3600000,       // Show cameras once per hour (1 hour)
    cameraDisplayTime: 60000,      // How long to display cameras when shown (1 min)
    
    // Other settings
    prioritizeMotionClips: true,   // Interrupt normal flow to show motion clips
    motionClipDisplayTime: 30000,  // How long to show motion clips (30 sec)
    showBlink: true                // Enable blink camera integration
  },

  start() {
    // Initialize state variables
    this.currentDisplay = "family";   // Start with family photos
    this.familyImages = [];
    this.familyIndex = 0;
    this.bibleVerse = null;
    this.latestImage = null;
    this.motionVideos = [];
    this.videoIndex = 0;
    this.loaded = false;
    this.lastVerseTime = 0;
    this.lastCameraTime = 0;
    this.showingMotion = false;
    this.motionTimer = null;

    // Request initial data
    this.sendSocketNotification("REQUEST_VERSE");
    this.sendSocketNotification("REQUEST_IMAGES");

    if (this.config.showBlink) {
      this.sendSocketNotification("CHECK_BLINK");
    }

    // Main display timer
    this.timer = setInterval(() => {
      this.updateDisplay();
    }, this.config.familyInterval);

    // Check for timed events every minute
    this.scheduledTimer = setInterval(() => {
      this.checkScheduledEvents();
    }, 60000);
  },

  checkScheduledEvents() {
    const now = Date.now();
    
    // Check if it's time to show verse (once per hour)
    if (now - this.lastVerseTime >= this.config.verseInterval) {
      this.lastVerseTime = now;
      this.currentDisplay = "verse";
      
      // Schedule to return to family photos after a short time
      setTimeout(() => {
        if (this.currentDisplay === "verse") {
          this.currentDisplay = "family";
          this.updateDom();
        }
      }, 60000); // Show verse for 1 minute
      
      this.updateDom();
    }
    
    // Check if it's time to show cameras (once per hour)
    if (now - this.lastCameraTime >= this.config.cameraInterval) {
      this.lastCameraTime = now;
      this.currentDisplay = "camera";
      this.sendSocketNotification("REQUEST_BLINK");
      
      // Schedule to return to family photos after camera display time
      setTimeout(() => {
        if (this.currentDisplay === "camera") {
          this.currentDisplay = "family";
          this.updateDom();
        }
      }, this.config.cameraDisplayTime);
      
      this.updateDom();
    }
  },

  updateDisplay() {
    // Skip if showing motion clips or not on family display
    if (this.showingMotion || this.currentDisplay !== "family") {
      return;
    }
    
    // Cycle to next family image
    if (this.familyImages.length > 0) {
      this.familyIndex = (this.familyIndex + 1) % this.familyImages.length;
      this.updateDom();
    }
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "VERSE_RESULT") {
      this.bibleVerse = payload;
      this.loaded = true;
      this.updateDom();
    }

    if (notification === "BLINK_STATUS" && payload === true) {
      // Blink camera is set up and ready
      console.log("Blink camera setup detected");
    }

    if (notification === "BLINK_MEDIA_READY") {
      this.latestImage = payload.image;
      
      // If there are new motion videos, prioritize showing them
      if (payload.videos && payload.videos.length > 0) {
        this.motionVideos = payload.videos;
        this.videoIndex = 0;
        
        // Only interrupt current flow if prioritizing motion clips
        if (this.config.prioritizeMotionClips) {
          // Clear any existing motion timer
          if (this.motionTimer) {
            clearTimeout(this.motionTimer);
          }
          
          // Switch to showing motion clips
          this.currentDisplay = "motion";
          this.showingMotion = true;
          
          // Set timer to return to previous state
          this.motionTimer = setTimeout(() => {
            this.showingMotion = false;
            this.currentDisplay = "family";
            this.updateDom();
          }, this.config.motionClipDisplayTime);
        }
      }
      
      this.updateDom();
    }

    if (notification === "FAMILY_IMAGES") {
      // Store the new list of images
      this.familyImages = payload;
      
      // If this is an update (not first load) and we're showing family images,
      // reset the index to show the newest image
      if (this.loaded && this.currentDisplay === "family" && payload.length > 0) {
        // Find new images (if any)
        const previousImages = new Set(this.familyImages || []);
        const newImages = payload.filter(img => !previousImages.has(img));
        
        if (newImages.length > 0) {
          // If there are new images, show the first new one
          this.familyIndex = payload.indexOf(newImages[0]);
          console.log("New image detected, showing it now");
        }
      }
      
      this.updateDom();
    }
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "blessed-center";

    if (!this.loaded) {
      wrapper.innerHTML = "Loading...";
      return wrapper;
    }

    switch (this.currentDisplay) {
      case "verse":
        wrapper.innerHTML = `<div class="verse">${this.bibleVerse || "Loading verse..."}</div>`;
        break;
        
      case "family":
        if (this.familyImages.length > 0) {
          const img = document.createElement("img");
          img.src = this.familyImages[this.familyIndex];
          img.className = "blessed-image visible";
          wrapper.appendChild(img);
        } else {
          wrapper.innerHTML = "No family images available";
        }
        break;
        
      case "camera":
        if (this.latestImage) {
          const container = document.createElement("div");
          container.className = "camera-container";
          
          const img = document.createElement("img");
          img.src = this.latestImage;
          img.className = "blessed-image";
          container.appendChild(img);
          
          wrapper.appendChild(container);
        } else {
          wrapper.innerHTML = "Camera image not available";
        }
        break;
        
      case "motion":
        if (this.motionVideos.length > 0) {
          const container = document.createElement("div");
          container.className = "motion-container";
      
          const video = document.createElement("video");
          video.src = this.motionVideos[this.videoIndex];
          video.controls = true;
          video.autoplay = true;
          video.loop = false;
          video.className = "blessed-image visible";
      
          video.onended = () => {
            this.videoIndex = (this.videoIndex + 1) % this.motionVideos.length;
            this.updateDom();
          };
      
          container.appendChild(video);
          wrapper.appendChild(container);
        } else {
          wrapper.innerHTML = "No motion clips available";
        }
        break;
        
      default:
        wrapper.innerHTML = "Unknown display type";
    }

    return wrapper;
  }
});