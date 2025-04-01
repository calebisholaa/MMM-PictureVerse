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
    showBlink: true,               // Enable blink camera integration
    
    // Image display settings
    opacity: 0.9,                  // Image opacity
    maxWidth: "100%",              // Maximum width for non-fullscreen
    maxHeight: "100%",             // Maximum height for non-fullscreen
    backgroundStyle: "blur",       // Background style: "blur", "color", or "none"
    backgroundColor: "black",      // Background color when using "color" style
    blur: 8,                       // Background blur amount (for fullscreen)
    transition: 1000               // Transition time between images (ms)
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
    this.wrapper = null;
    this.fullscreen = false;
    this.timer = null;

    // Request initial data
    this.sendSocketNotification("REQUEST_VERSE");
    
    // Request immediate Dropbox sync on startup
    this.sendSocketNotification("SYNC_DROPBOX");
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
    
    // Check if we're in fullscreen mode
    if (this.data.position.toLowerCase().startsWith("fullscreen")) {
      this.fullscreen = true;
    }
  },

  getStyles() {
    return ["MMM-PictureVerse.css"];
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
      const oldIndex = this.familyIndex;
      this.familyIndex = (this.familyIndex + 1) % this.familyImages.length;
      console.log(`Cycling family image from index ${oldIndex} to ${this.familyIndex} of ${this.familyImages.length} total`);
      this.updateDom();
    } else {
      console.log("No family images to display");
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
      // Log received images for debugging
      console.log(`Received ${payload.length} family images:`, payload);
      
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
          console.log(`New image detected, showing it now at index ${this.familyIndex}`);
        }
      } else if (payload.length > 0) {
        // Make sure we're starting with a valid index
        this.familyIndex = 0;
        console.log(`Setting initial family index to 0 of ${payload.length} images`);
      }
      
      this.loaded = true;
      this.updateDom();
    }
  },

  // Image scaling function (from MMM-ImagesPhotos)
  scaleImage(srcwidth, srcheight, targetwidth, targetheight, fLetterBox) {
    const result = { width: 0, height: 0, fScaleToTargetWidth: true };

    if (
      srcwidth <= 0 ||
      srcheight <= 0 ||
      targetwidth <= 0 ||
      targetheight <= 0
    ) {
      return result;
    }

    // Scale to the target width
    const scaleX1 = targetwidth;
    const scaleY1 = (srcheight * targetwidth) / srcwidth;

    // Scale to the target height
    const scaleX2 = (srcwidth * targetheight) / srcheight;
    const scaleY2 = targetheight;

    // Now figure out which one we should use
    let fScaleOnWidth = scaleX2 > targetwidth;
    if (fScaleOnWidth) {
      fScaleOnWidth = fLetterBox;
    } else {
      fScaleOnWidth = !fLetterBox;
    }

    if (fScaleOnWidth) {
      result.width = Math.floor(scaleX1);
      result.height = Math.floor(scaleY1);
      result.fScaleToTargetWidth = true;
    } else {
      result.width = Math.floor(scaleX2);
      result.height = Math.floor(scaleY2);
      result.fScaleToTargetWidth = false;
    }
    result.targetleft = Math.floor((targetwidth - result.width) / 2);
    result.targettop = Math.floor((targetheight - result.height) / 2);

    return result;
  },

  startTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    
    const self = this;
    self.timer = setTimeout(() => {
      self.updateDom(self.config.transition);
    }, this.config.familyInterval);
  },

  getDom() {
    if (this.fullscreen && this.currentDisplay === "family") {
      return this.getFullscreenDom();
    }
    return this.getRegularDom();
  },

  getRegularDom() {
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
          img.style.opacity = this.config.opacity;
          img.style.maxWidth = this.config.maxWidth;
          img.style.maxHeight = this.config.maxHeight;
          img.style.transition = `opacity ${this.config.transition/1000}s`;
          wrapper.appendChild(img);
          this.startTimer();
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
          img.className = "blessed-image visible";
          
          // Center the camera image
          img.style.position = "relative";
          img.style.left = "auto";
          img.style.top = "auto";
          
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
          
          // Center the video
          video.style.position = "relative";
          video.style.left = "auto";
          video.style.top = "auto";
      
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
  },

  getFullscreenDom() {
    const self = this;
    
    // If wrapper div not yet created
    if (this.wrapper === null) {
      // Create it once, try to reduce image flash on change
      this.wrapper = document.createElement("div");
      this.bk = document.createElement("div");
      this.bk.className = "background-image";
      
      // Set up background style
      if (this.config.backgroundStyle === "blur") {
        this.bk.style.filter = `blur(${this.config.blur}px)`;
        this.bk.style["-webkit-filter"] = `blur(${this.config.blur}px)`;
      } else if (this.config.backgroundStyle === "color") {
        this.bk.style.backgroundColor = this.config.backgroundColor;
      }
      
      this.wrapper.appendChild(this.bk);
      this.fg = document.createElement("div");
      this.wrapper.appendChild(this.fg);
    }
    
    if (this.familyImages.length > 0) {
      // Get the size of the margin, if any, we want to be full screen
      const m = window
        .getComputedStyle(document.body, null)
        .getPropertyValue("margin-top");
      
      // Set the style for the containing div
      this.fg.style.border = "none";
      this.fg.style.margin = "0px";

      // Get the current family image
      const imageSrc = this.familyImages[this.familyIndex];
      let img = null;
      
      if (imageSrc) {
        // Create img tag element
        img = document.createElement("img");

        // Set default position, corrected in onload handler
        img.style.left = `${0}px`;
        img.style.top = document.body.clientHeight + parseInt(m, 10) * 2;
        img.style.position = "relative";
        img.style.opacity = 0;
        img.style.transition = `opacity ${this.config.transition/1000}s`;

        img.src = imageSrc;
        
        // Append this image to the div
        this.fg.appendChild(img);

        // Set the image load error handler
        img.onerror = (evt) => {
          const eventImage = evt.currentTarget;
          console.error(`Image load failed: ${eventImage.src}`);
          // Skip to next image
          this.familyIndex = (this.familyIndex + 1) % this.familyImages.length;
          this.updateDom();
        };
        
        // Set the onload event handler
        img.onload = (evt) => {
          // Get the image of the event
          const eventImage = evt.currentTarget;
          
          // What's the size of this image and its parent
          const w = eventImage.width;
          const h = eventImage.height;
          const tw = document.body.clientWidth + parseInt(m, 10) * 2;
          const th = document.body.clientHeight + parseInt(m, 10) * 2;

          // Compute the new size and offsets
          const result = self.scaleImage(w, h, tw, th, true);

          // Adjust the image size
          eventImage.width = result.width;
          eventImage.height = result.height;

          // Adjust the image position
          eventImage.style.left = `${result.targetleft}px`;
          eventImage.style.top = `${result.targettop}px`;

          // If another image was already displayed
          const c = self.fg.childElementCount;
          if (c > 1) {
            for (let i = 0; i < c - 1; i++) {
              // Hide it
              self.fg.firstChild.style.opacity = 0;
              // Remove the image element from the div
              self.fg.removeChild(self.fg.firstChild);
            }
          }
          
          // Show the current image
          self.fg.firstChild.style.opacity = self.config.opacity;

          // Set background based on chosen style
          if (self.config.backgroundStyle === "blur") {
            self.bk.style.backgroundImage = `url(${self.fg.firstChild.src})`;
          } else if (self.config.backgroundStyle === "color") {
            self.bk.style.backgroundImage = "none";
            self.bk.style.backgroundColor = self.config.backgroundColor;
          }
          
          // Start timer for next image
          self.startTimer();
        };
      }
    }
    
    return this.wrapper;
  }
});