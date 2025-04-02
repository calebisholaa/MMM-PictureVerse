Module.register("MMM-PictureVerse", {
  defaults: {
    // Main timing settings
    familyInterval: 30000,         // How long to show each family photo (30 sec)
    verseDisplayTime: 120000,      // Show verse for 2 minutes
    cameraDisplayTime: 120000,     // Show cameras for 2 minutes (2 min)
    
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
    this.currentDisplay = "loading";   // Start with loading state
    this.familyImages = [];
    this.familyIndex = 0;
    this.bibleVerse = null;
    this.cameraImages = [];
    this.cameraIndex = 0;
    this.motionVideos = [];
    this.videoIndex = 0;
    this.loaded = false;
    this.showingMotion = false;
    this.motionTimer = null;
    this.wrapper = null;
    this.fullscreen = false;
    this.timer = null;
    this.sequenceTimer = null;
    this.hourlyTimer = null;
    this.lastHour = new Date().getHours(); // Track current hour for hourly reset

    // Request initial data
    this.sendSocketNotification("REQUEST_VERSE");
    
    // Request immediate Dropbox sync on startup
    this.sendSocketNotification("SYNC_DROPBOX");
    this.sendSocketNotification("REQUEST_IMAGES");

    if (this.config.showBlink) {
      this.sendSocketNotification("CHECK_BLINK");
      // Request camera images on startup
      this.sendSocketNotification("REQUEST_BLINK");
    }

    // Check if we're in fullscreen mode
    if (this.data.position.toLowerCase().startsWith("fullscreen")) {
      this.fullscreen = true;
    }

    // Start the hourly sequence timer (check every minute for hour change)
    this.hourlyTimer = setInterval(() => {
      this.checkHourlyReset();
    }, 60000);

    // Start the display sequence when everything is loaded
    this.startSequence();
  },

  getStyles() {
    return ["MMM-PictureVerse.css"];
  },

  // Check if hour has changed and restart sequence if needed
  checkHourlyReset() {
    const currentHour = new Date().getHours();
    
    // If hour has changed, restart the sequence
    if (currentHour !== this.lastHour) {
      console.log(`Hour changed from ${this.lastHour} to ${currentHour}, restarting sequence`);
      this.lastHour = currentHour;
      
      // Clear any existing timers
      this.clearTimers();
      
      // Request fresh verse and camera data
      this.sendSocketNotification("REQUEST_VERSE");
      this.sendSocketNotification("REQUEST_BLINK");
      
      // Restart the sequence
      this.startSequence();
    }
  },

  // Clear all active timers
  clearTimers() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    if (this.sequenceTimer) {
      clearTimeout(this.sequenceTimer);
      this.sequenceTimer = null;
    }
    
    if (this.motionTimer) {
      clearTimeout(this.motionTimer);
      this.motionTimer = null;
    }
  },

  // Start the hourly display sequence: verse -> cameras -> family photos
  startSequence() {
    console.log("Starting display sequence");
    
    // Wait for everything to load
    if (!this.loaded) {
      console.log("Waiting for data to load before starting sequence");
      this.sequenceTimer = setTimeout(() => {
        this.startSequence();
      }, 5000); // Check again in 5 seconds
      return;
    }
    
    // Clear any existing timers
    this.clearTimers();
    
    // Start with verse of the day
    this.currentDisplay = "verse";
    this.updateDom();
    console.log("Showing verse of the day for 2 minutes");
    
    // After 2 minutes, show camera images
    this.sequenceTimer = setTimeout(() => {
      // If we don't have camera images yet, request them
      if (this.cameraImages.length === 0 && this.config.showBlink) {
        console.log("No camera images available, requesting from Blink");
        this.sendSocketNotification("REQUEST_BLINK");
      }
      
      this.currentDisplay = "camera";
      this.cameraIndex = 0;
      this.updateDom();
      console.log("Showing camera images for 2 minutes");
      
      // Start cycling through camera images
      this.startCameraTimer();
      
      // After 2 minutes, switch to family photos
      this.sequenceTimer = setTimeout(() => {
        this.currentDisplay = "family";
        this.familyIndex = 0;
        this.updateDom();
        console.log("Showing family photos until end of hour");
        
        // Start cycling through family images
        this.startFamilyTimer();
      }, this.config.cameraDisplayTime);
      
    }, this.config.verseDisplayTime);
  },

  // Start timer for cycling camera images
  startCameraTimer() {
    if (this.cameraImages.length === 0) {
      console.log("No camera images to cycle through");
      return;
    }
    
    if (this.timer) {
      clearTimeout(this.timer);
    }
    
    this.timer = setTimeout(() => {
      if (this.currentDisplay === "camera") {
        this.cameraIndex = (this.cameraIndex + 1) % this.cameraImages.length;
        this.updateDom();
        this.startCameraTimer(); // Continue cycling
      }
    }, 10000); // Show each camera image for 10 seconds
  },

  // Start timer for cycling family images
  startFamilyTimer() {
    if (this.familyImages.length === 0) {
      console.log("No family images to cycle through");
      return;
    }
    
    if (this.timer) {
      clearTimeout(this.timer);
    }
    
    this.timer = setTimeout(() => {
      if (this.currentDisplay === "family") {
        this.familyIndex = (this.familyIndex + 1) % this.familyImages.length;
        this.updateDom();
        this.startFamilyTimer(); // Continue cycling
      }
    }, this.config.familyInterval);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "VERSE_RESULT") {
      this.bibleVerse = payload;
      console.log("Received verse:", this.bibleVerse ? this.bibleVerse.substring(0, 30) + "..." : "None");
      this.checkAllLoaded();
    }

    if (notification === "BLINK_STATUS" && payload === true) {
      // Blink camera is set up and ready
      console.log("Blink camera setup detected");
    }

    if (notification === "BLINK_MEDIA_READY") {
      // Handle both single image and multiple images
      if (payload.images && payload.images.length > 0) {
        this.cameraImages = payload.images;
        console.log(`Received ${this.cameraImages.length} camera images`);
      } else if (payload.image) {
        this.cameraImages = [payload.image];
        console.log("Received 1 camera image");
      } else {
        console.log("No camera images received");
      }
      
      // Store motion videos if available
      if (payload.videos && payload.videos.length > 0) {
        this.motionVideos = payload.videos;
        
        // Only interrupt current flow if prioritizing motion clips
        if (this.config.prioritizeMotionClips) {
          // Clear any existing motion timer
          if (this.motionTimer) {
            clearTimeout(this.motionTimer);
          }
          
          // Remember current display state
          this.previousDisplay = this.currentDisplay;
          
          // Switch to showing motion clips
          this.currentDisplay = "motion";
          this.showingMotion = true;
          this.videoIndex = 0;
          
          // Set timer to return to previous state
          this.motionTimer = setTimeout(() => {
            this.showingMotion = false;
            this.currentDisplay = this.previousDisplay;
            this.updateDom();
          }, this.config.motionClipDisplayTime);
        }
      }
      
      this.checkAllLoaded();
      this.updateDom();
    }

    if (notification === "FAMILY_IMAGES") {
      // Log received images for debugging
      console.log(`Received ${payload.length} family images`);
      
      // Store the new list of images
      this.familyImages = payload;
      
      // Set initial index
      if (this.familyImages.length > 0 && this.familyIndex >= this.familyImages.length) {
        this.familyIndex = 0;
      }
      
      this.checkAllLoaded();
      this.updateDom();
    }
  },

  // Check if all required data is loaded
  checkAllLoaded() {
    if (!this.loaded && this.bibleVerse && (this.familyImages.length > 0 || this.cameraImages.length > 0)) {
      console.log("All data loaded, starting display sequence");
      this.loaded = true;
      
      // Start the sequence if we're still in loading state
      if (this.currentDisplay === "loading") {
        this.startSequence();
      }
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

  getDom() {
    if (this.fullscreen && (this.currentDisplay === "family" || this.currentDisplay === "camera")) {
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
            // Updated verse display case for getRegularDom method
      case "verse":
        // Create an outer wrapper for positioning
        const verseWrapper = document.createElement("div");
        verseWrapper.style.position = "relative";
        verseWrapper.style.width = "100%";
        verseWrapper.style.height = "100%";
        
        // Create the verse container
        const verseContainer = document.createElement("div");
        verseContainer.className = "verse";
        
        // Split the verse into text and reference
        let verseText = this.bibleVerse || "Loading verse...";
        let verseReference = "";
        
        // Try to extract reference if it contains a dash or parenthesis
        if (verseText.includes(" - ")) {
          const parts = verseText.split(" - ");
          verseText = parts[0].trim();
          verseReference = parts[1].trim();
        } else if (verseText.includes("(") && verseText.includes(")")) {
          const match = verseText.match(/(.*)\s*\((.*)\)/);
          if (match) {
            verseText = match[1].trim();
            verseReference = match[2].trim();
          }
        }
        
        // Create verse text element
        const textElement = document.createElement("div");
        textElement.className = "verse-text";
        textElement.textContent = verseText;
        verseContainer.appendChild(textElement);
        
        // Create reference element if available
        if (verseReference) {
          const referenceElement = document.createElement("div");
          referenceElement.className = "verse-reference";
          referenceElement.textContent = verseReference;
          verseContainer.appendChild(referenceElement);
        }
        
        verseWrapper.appendChild(verseContainer);
        wrapper.appendChild(verseWrapper);
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
        } else {
          wrapper.innerHTML = "No family images available";
        }
        break;
        
      case "camera":
        if (this.cameraImages.length > 0) {
          const container = document.createElement("div");
          container.className = "camera-container";
          
          const img = document.createElement("img");
          img.src = this.cameraImages[this.cameraIndex];
          img.className = "blessed-image visible";
          
          // Center the camera image
          img.style.position = "relative";
          img.style.left = "auto";
          img.style.top = "auto";
          
          container.appendChild(img);
          wrapper.appendChild(container);
        } else {
          wrapper.innerHTML = "Camera images not available";
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
        wrapper.innerHTML = "Loading...";
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
      this.fg.style.position = "relative";
      this.fg.style.width = "100%";
      this.fg.style.height = "100%";
      this.fg.style.overflow = "hidden";
      this.wrapper.appendChild(this.fg);
    }
  
    // Get the current image source based on display type
    let images = [];
    let currentIndex = 0;
    
    if (this.currentDisplay === "family") {
      images = this.familyImages;
      currentIndex = this.familyIndex;
    } else if (this.currentDisplay === "camera") {
      images = this.cameraImages;
      currentIndex = this.cameraIndex;
    }
    
    if (images.length > 0 && currentIndex < images.length && !this.isImageLoading) {
      this.isImageLoading = true;
      
      // Get the size of the margin, if any, we want to be full screen
      const m = window
        .getComputedStyle(document.body, null)
        .getPropertyValue("margin-top");
      
      // Set the style for the containing div
      this.fg.style.border = "none";
      this.fg.style.margin = "0px";
  
      // Get the current image
      const imageSrc = images[currentIndex];
      
      if (imageSrc) {
        // Create img tag element
        const img = document.createElement("img");
  
        // Important: Set the image to be invisible and absolutely positioned
        // but DON'T give it a specific position yet - this is key to preventing the right-side flash
        img.style.position = "absolute";
        img.style.opacity = 0;
        img.style.transition = `opacity ${this.config.transition/1000}s`;
        
        // Hide image completely until it's sized correctly
        img.style.visibility = "hidden";
        
        // Create a hidden container for the new image that won't affect layout
        const imgContainer = document.createElement("div");
        imgContainer.style.position = "absolute";
        imgContainer.style.top = 0;
        imgContainer.style.left = 0;
        imgContainer.style.right = 0;
        imgContainer.style.bottom = 0;
        imgContainer.style.zIndex = -1;
        imgContainer.style.overflow = "hidden";
        imgContainer.appendChild(img);
        
        // Add the container to the DOM
        this.fg.appendChild(imgContainer);
        
        // Now set the source to start loading
        img.src = imageSrc;
        
        // Set the image load error handler
        img.onerror = (evt) => {
          const eventImage = evt.currentTarget;
          console.error(`Image load failed: ${eventImage.src}`);
          
          // Clean up the container
          if (imgContainer.parentNode) {
            imgContainer.parentNode.removeChild(imgContainer);
          }
          
          // Skip to next image
          if (this.currentDisplay === "family") {
            this.familyIndex = (this.familyIndex + 1) % this.familyImages.length;
          } else if (this.currentDisplay === "camera") {
            this.cameraIndex = (this.cameraIndex + 1) % this.cameraImages.length;
          }
          
          this.isImageLoading = false;
          this.updateDom();
        };
        
        // Set the onload event handler - this is the key to smooth transitions
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
  
          // Now properly position the image
          eventImage.style.left = `${result.targetleft}px`;
          eventImage.style.top = `${result.targettop}px`;
          
          // Remove imgContainer and move the image to the main container
          imgContainer.parentNode.removeChild(imgContainer);
          
          // Set background based on chosen style BEFORE making the new image visible
          if (self.config.backgroundStyle === "blur") {
            self.bk.style.backgroundImage = `url(${eventImage.src})`;
          } else if (self.config.backgroundStyle === "color") {
            self.bk.style.backgroundImage = "none";
            self.bk.style.backgroundColor = self.config.backgroundColor;
          }
          
          // Make sure old images are faded out first
          const existingImages = self.fg.querySelectorAll("img");
          existingImages.forEach(oldImg => {
            oldImg.style.opacity = 0;
          });
          
          // Now add the new image to the main container
          self.fg.appendChild(eventImage);
          
          // Make the image visible again
          eventImage.style.visibility = "visible";
          
          // Now fade in the new image
          setTimeout(() => {
            eventImage.style.opacity = self.config.opacity;
            
            // After the transition completes, remove any old images
            setTimeout(() => {
              // Remove all images except the last one
              const allImages = self.fg.querySelectorAll("img");
              for (let i = 0; i < allImages.length - 1; i++) {
                if (allImages[i].parentNode === self.fg) {
                  self.fg.removeChild(allImages[i]);
                }
              }
              
              // Allow loading the next image
              self.isImageLoading = false;
            }, self.config.transition + 100); // Wait slightly longer than transition time
            
          }, 50); // Short delay to ensure browser has rendered the new properties
        };
      }
    }
    
    return this.wrapper;
  }
});