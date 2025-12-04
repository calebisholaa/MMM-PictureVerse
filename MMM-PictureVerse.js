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
    sequential: false,              // Use sequential order for family photos (false = random)
    alwaysShowNewestFirst: true,   // Show newest upload first, then continue with sequence
    
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
    this.familyRandomOrder = null;     // For random mode
    this.familyRandomIndex = 0;        // Current position in random sequence
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


  stop() {
    // BUG FIX #6: Clear all timers when module stops to prevent memory leaks
    console.log('Stopping MMM-PictureVerse module and clearing all timers');
    
    this.clearTimers();
    
    if (this.hourlyTimer) {
      clearInterval(this.hourlyTimer);
      this.hourlyTimer = null;
    }
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

      // Clean up old camera images and request fresh ones
      this.sendSocketNotification("CLEANUP_BLINK_IMAGES");  
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
        if (!this.config.sequential) {
          // Move to the next image in our randomized sequence
          this.familyRandomIndex = (this.familyRandomIndex + 1) % this.familyRandomOrder.length;
          
          // Get the actual index to display from our random order
          this.familyIndex = this.familyRandomOrder[this.familyRandomIndex];
          console.log(`Showing random image ${this.familyRandomIndex+1}/${this.familyRandomOrder.length} (index: ${this.familyIndex})`);
        } else {
          // Traditional sequential order
          this.familyIndex = (this.familyIndex + 1) % this.familyImages.length;
        }
        
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
      
      // Store motion videos and images if available
      if (payload.videos && payload.videos.length > 0) {
        this.motionVideos = payload.videos.filter(v => v.endsWith(".mp4"));
        console.log(`Received ${this.motionVideos.length} motion videos`);
        
        // Update images too if available
        if (payload.images && payload.images.length > 0) {
          this.cameraImages = payload.images;
          console.log(`Updated with ${this.cameraImages.length} camera images`);
        }
        
        // Only interrupt current flow if prioritizing motion clips
        if (this.config.prioritizeMotionClips) {
          console.log("Motion detected! Interrupting current display to show motion clips");
          
          // Clear any existing motion timer
          if (this.motionTimer) {
            clearTimeout(this.motionTimer);
          }
          
          // Remember current display state
          this.previousDisplay = this.currentDisplay;
          
          // Reset motion start time for time-based looping
          this.motionStartTime = Date.now();
          
          // Switch to showing motion clips
          this.currentDisplay = "motion";
          this.showingMotion = true;
          this.videoIndex = 0;
          this.updateDom();
          
          // Set timer to return to previous state
          this.motionTimer = setTimeout(() => {
            console.log("Motion display time ended, returning to previous state");
            this.showingMotion = false;
            this.currentDisplay = this.previousDisplay;
            this.motionVideos = [];
            this.motionStartTime = null; // Reset the timer
            
            // If returning to family display, make sure we restart the family timer
            if (this.previousDisplay === "family") {
              this.startFamilyTimer();
            } 
            // If returning to camera display, make sure we restart the camera timer
            else if (this.previousDisplay === "camera") {
              this.startCameraTimer();
            }
            
            this.updateDom();
          }, this.config.motionClipDisplayTime);
        }
      }
      
      this.checkAllLoaded();
      this.updateDom();
    }
    
    if (notification === "FAMILY_IMAGES") {
      // Check if we received the new payload format
      const hasNewUpload = payload.newUpload !== undefined;
      
      // Get the images from the appropriate property
      const imageList = hasNewUpload ? payload.images : payload;
      
      // Log received images for debugging
      console.log(`Received ${imageList.length} family images${hasNewUpload && payload.newUpload ? " with new upload" : ""}`);
      
      // Store the new list of images
      this.familyImages = imageList;
      
      // === IMPROVED RANDOMIZATION LOGIC ===
      // TRUE RANDOM: Every photo appears exactly once per cycle
      if (!this.config.sequential) {
        // Check if we need to create or recreate the random order
        if (!this.familyRandomOrder || this.familyRandomOrder.length !== this.familyImages.length) {
          console.log("Creating new random shuffle for all images...");
          this.familyRandomOrder = this.createShuffledArray(this.familyImages.length);
          this.familyRandomIndex = 0;
          console.log(`Shuffled ${this.familyRandomOrder.length} photos - all will be shown once per cycle`);
        }
        
        // Check if we've completed a full cycle - reshuffle!
        if (this.familyRandomIndex >= this.familyRandomOrder.length) {
          console.log("Completed full cycle through all photos! Reshuffling...");
          this.familyRandomOrder = this.createShuffledArray(this.familyImages.length);
          this.familyRandomIndex = 0;
        }
      }
      
      // === IMMEDIATE SHOWING OF NEW UPLOADS ===
      if (this.familyImages.length > 0) {
        if (hasNewUpload && payload.newUpload) {
          const newestImagePath = this.familyImages[0];

          // Skip if we just showed this same image
          if (this.lastShownNewest === newestImagePath) {
            console.log("Newest photo already shown recently, skipping duplicate trigger");
            return;
          }

          console.log("NEW UPLOAD DETECTED - Showing immediately!");
          this.lastShownNewest = newestImagePath;
          
          // Show the newest photo (always at index 0)
          this.familyIndex = 0;
          
          if (!this.config.sequential) {
            // Create a NEW shuffle that includes ALL photos (including the newest)
            // But make sure the newest photo is NOT first in the shuffle
            // This way it won't show again until the cycle progresses naturally
            this.familyRandomOrder = this.createShuffledArray(this.familyImages.length);
            
            // If the newest photo (index 0) ended up first in the shuffle, swap it
            if (this.familyRandomOrder[0] === 0) {
              // Swap with a random position further in the array
              const swapPos = Math.floor(Math.random() * (this.familyRandomOrder.length - 1)) + 1;
              [this.familyRandomOrder[0], this.familyRandomOrder[swapPos]] = 
              [this.familyRandomOrder[swapPos], this.familyRandomOrder[0]];
              console.log(`Moved newest photo from position 0 to position ${swapPos} in shuffle`);
            }
            
            // Start from the beginning of the shuffle (which is now NOT the newest photo)
            this.familyRandomIndex = 0;
            
            console.log(`Created new shuffle of ${this.familyRandomOrder.length} photos (newest is at position ${this.familyRandomOrder.indexOf(0)})`);
          }
          
          // Stop all timers (verse, camera, motion, family)
          this.clearTimers();
          
          // Force switch to family mode
          this.currentDisplay = "family";
          
          // Update display + restart family slideshow
          this.updateDom();
          this.startFamilyTimer();
        } else {
          // No new upload - just ensure index is valid
          if (!this.config.sequential) {
            if (this.familyRandomIndex >= this.familyRandomOrder.length) {
              // Completed cycle, reshuffle
              this.familyRandomOrder = this.createShuffledArray(this.familyImages.length);
              this.familyRandomIndex = 0;
            }
          } else if (this.familyIndex >= this.familyImages.length) {
            this.familyIndex = 0;
          }
        }
      }
      
      this.checkAllLoaded();
      this.updateDom();
    }
  },
  /**
   * Create a perfectly shuffled array using Fisher-Yates algorithm
   * @param {number} length - Total number of items
   * @param {number} excludeFirst - Number of items to exclude from start (default 0)
   * @returns {Array} Shuffled indices
   */
  createShuffledArray(length, excludeFirst = 0) {
    // Create array starting after excluded items [excludeFirst, excludeFirst+1, ..., length-1]
    const array = Array.from({length: length - excludeFirst}, (_, i) => i + excludeFirst);
    
    // Fisher-Yates shuffle for perfect randomization
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    
    console.log(`Shuffled array: [${array.slice(0, 5).join(', ')}...] (${array.length} total)`);
    return array;
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
        
              // This should replace the 'motion' case in your getRegularDom method
      case "motion":
        if (this.motionVideos.length > 0) {
          const container = document.createElement("div");
          container.className = "motion-container";
          
          // Add a motion alert indicator
          const alertBanner = document.createElement("div");
          alertBanner.textContent = "Motion Detected";
          alertBanner.style.position = "absolute";
          alertBanner.style.top = "10px";
          alertBanner.style.left = "50%";
          alertBanner.style.transform = "translateX(-50%)";
          alertBanner.style.backgroundColor = "rgba(255, 0, 0, 0.7)";
          alertBanner.style.color = "white";
          alertBanner.style.padding = "5px 15px";
          alertBanner.style.borderRadius = "5px";
          alertBanner.style.zIndex = "100";
          alertBanner.className = "motion-alert";
          container.appendChild(alertBanner);

          const currentVideoPath = this.motionVideos[this.videoIndex];
          const isGarageVideo = currentVideoPath.toLowerCase().includes('garage');
          
          console.log(`[Motion Video] Loading video ${this.videoIndex + 1}/${this.motionVideos.length}`);
          console.log(`[Motion Video] Path: ${currentVideoPath}`);
          console.log(`[Motion Video] Is Garage: ${isGarageVideo}`);

          // Create the video element
          const video = document.createElement("video");
          
          // Set attributes BEFORE setting src
          video.autoplay = true;
          video.muted = true;
          video.controls = false;
          video.loop = false;
          video.playsInline = true;
          video.preload = "auto";
          video.className = "blessed-image visible";
          
          // Store reference for event handlers
          const self = this;
          let hasPlayedSuccessfully = false;
          let loadingTimeout = null;
          let fallbackToSnapshot = false;
          
          // Enhanced error handler with detailed logging
          video.onerror = function(e) {
            console.error(`[Motion Video ERROR] Video failed to load`);
            console.error(`  - Source: ${video.src}`);
            console.error(`  - ReadyState: ${video.readyState}`);
            console.error(`  - NetworkState: ${video.networkState}`);
            console.error(`  - Error code: ${video.error ? video.error.code : 'unknown'}`);
            console.error(`  - Error message: ${video.error ? video.error.message : 'unknown'}`);
            
            // Clear loading timeout
            if (loadingTimeout) clearTimeout(loadingTimeout);
            
            // Try to show snapshot instead
            const snapshotPath = currentVideoPath.replace('.mp4', '.jpg');
            console.log(`[Motion Video] Attempting fallback to snapshot: ${snapshotPath}`);
            
            // Create image fallback
            const fallbackImg = document.createElement('img');
            fallbackImg.src = snapshotPath;
            fallbackImg.className = 'blessed-image visible';
            fallbackImg.style.position = "relative";
            fallbackImg.style.left = "auto";
            fallbackImg.style.top = "auto";
            
            fallbackImg.onload = function() {
              console.log(`[Motion Video] ✓ Snapshot loaded successfully`);
              // Replace video with image
              if (video.parentNode === container) {
                container.replaceChild(fallbackImg, video);
                fallbackToSnapshot = true;
                
                // Auto-advance after showing snapshot for a bit
                setTimeout(() => {
                  self.handleVideoEnd();
                }, 5000); // Show snapshot for 5 seconds
              }
            };
            
            fallbackImg.onerror = function() {
              console.error(`[Motion Video] ✗ Snapshot also failed to load`);
              // Skip to next video
              self.handleVideoEnd();
            };
          };
          
          // Track loading progress
          video.onloadstart = function() {
            console.log(`[Motion Video] Loading started...`);
            
            // Set a timeout for loading (30 seconds max)
            loadingTimeout = setTimeout(() => {
              if (!hasPlayedSuccessfully && video.readyState < 3) {
                console.error(`[Motion Video] Loading timeout (30s) - forcing skip`);
                video.onerror({ type: 'timeout' });
              }
            }, 30000);
          };
          
          video.onloadedmetadata = function() {
            console.log(`[Motion Video] Metadata loaded`);
            console.log(`  - Duration: ${video.duration}s`);
            console.log(`  - Dimensions: ${video.videoWidth}x${video.videoHeight}`);
            
            // Check for invalid video
            if (video.videoWidth === 0 || video.videoHeight === 0) {
              console.error(`[Motion Video] Invalid dimensions - video may be corrupted`);
              video.onerror({ type: 'invalid_dimensions' });
              return;
            }
            
            if (video.duration === 0 || isNaN(video.duration)) {
              console.error(`[Motion Video] Invalid duration - video may be corrupted`);
              video.onerror({ type: 'invalid_duration' });
              return;
            }
          };
          
          video.onloadeddata = function() {
            console.log(`[Motion Video] Data loaded (readyState: ${video.readyState})`);
          };
          
          video.oncanplay = function() {
            console.log(`[Motion Video] Can play`);
            
            // Clear loading timeout
            if (loadingTimeout) {
              clearTimeout(loadingTimeout);
              loadingTimeout = null;
            }
            
            // Explicitly try to play
            const playPromise = video.play();
            
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  console.log(`[Motion Video] ✓ Playing successfully`);
                  hasPlayedSuccessfully = true;
                })
                .catch(err => {
                  console.error(`[Motion Video] Play failed:`, err);
                  // Try again after a short delay
                  setTimeout(() => {
                    video.play().catch(e => {
                      console.error(`[Motion Video] Second play attempt failed:`, e);
                      video.onerror({ type: 'play_failed' });
                    });
                  }, 100);
                });
            }
          };
          
          video.oncanplaythrough = function() {
            console.log(`[Motion Video] Can play through (fully loaded)`);
          };
          
          video.onplaying = function() {
            console.log(`[Motion Video] Now playing`);
          };
          
          video.onstalled = function() {
            console.warn(`[Motion Video] Playback stalled`);
          };
          
          video.onwaiting = function() {
            console.warn(`[Motion Video] Waiting for more data...`);
          };
          
          video.onsuspend = function() {
            console.log(`[Motion Video] Download suspended`);
          };
          
          video.onabort = function() {
            console.warn(`[Motion Video] Download aborted`);
          };
          
          video.onemptied = function() {
            console.warn(`[Motion Video] Media element emptied`);
          };
          
          // Handle video end
          self.handleVideoEnd = function() {
            const elapsedTime = Date.now() - self.motionStartTime;
            
            console.log(`[Motion Video] Video ended. Elapsed: ${elapsedTime}ms / ${self.config.motionClipDisplayTime}ms`);

            if (elapsedTime < self.config.motionClipDisplayTime) {
              if (self.videoIndex < self.motionVideos.length - 1) {
                self.videoIndex++;
                console.log(`[Motion Video] Advancing to next video (${self.videoIndex + 1}/${self.motionVideos.length})`);
                self.updateDom();
              } else {
                // Loop back to start
                self.videoIndex = 0;
                console.log(`[Motion Video] Restarting from first video`);
                self.updateDom();
              }
            } else {
              console.log(`[Motion Video] Time limit reached, returning to normal sequence`);
            }
          };
          
          video.onended = function() {
            self.handleVideoEnd();
          };

          // Center the video
          video.style.position = "relative";
          video.style.left = "auto";
          video.style.top = "auto";

          // Watchdog timer as backup
          setTimeout(() => {
            const elapsedTime = Date.now() - self.motionStartTime;
            if (elapsedTime >= self.config.motionClipDisplayTime) {
              console.log("[Motion Video] Watchdog: forcing exit from motion mode");
              self.showingMotion = false;
              self.currentDisplay = self.previousDisplay;
              self.motionVideos = [];
              self.motionStartTime = null;
              self.updateDom();
            }
          }, self.config.motionClipDisplayTime + 2000);

          // Add timestamp overlay
          const timestamp = document.createElement("div");
          timestamp.className = "timestamp";
          timestamp.style.position = "absolute";
          timestamp.style.bottom = "10px";
          timestamp.style.left = "10px";
          timestamp.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
          timestamp.style.color = "white";
          timestamp.style.padding = "5px 10px";
          timestamp.style.borderRadius = "3px";
          timestamp.style.fontSize = "14px";
          timestamp.style.fontFamily = "monospace";
          timestamp.style.zIndex = "101";
          
          // Extract timestamp from filename if possible
          const match = currentVideoPath.match(/(\d{8}_\d{6})/);
          if (match) {
            const tsString = match[1];
            const formattedTime = `${tsString.slice(0,4)}-${tsString.slice(4,6)}-${tsString.slice(6,8)} ${tsString.slice(9,11)}:${tsString.slice(11,13)}:${tsString.slice(13,15)}`;
            timestamp.textContent = formattedTime;
          } else {
            timestamp.textContent = new Date().toLocaleTimeString();
          }
          
          container.appendChild(timestamp);
          
          // Add camera name indicator
          const cameraName = document.createElement("div");
          cameraName.className = "camera-name";
          cameraName.style.position = "absolute";
          cameraName.style.top = "50px";
          cameraName.style.left = "10px";
          cameraName.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
          cameraName.style.color = "white";
          cameraName.style.padding = "5px 10px";
          cameraName.style.borderRadius = "3px";
          cameraName.style.fontSize = "16px";
          cameraName.style.fontWeight = "bold";
          cameraName.style.zIndex = "101";
          
          // Extract camera name from filename
          const nameMatch = currentVideoPath.match(/\/([^\/]+)_\d{8}_\d{6}\.mp4/);
          if (nameMatch) {
            cameraName.textContent = nameMatch[1].replace(/_/g, ' ');
          }
          container.appendChild(cameraName);

          // Now set the source to start loading
          video.src = currentVideoPath;
          container.appendChild(video);
          wrapper.appendChild(container);
          
          // Store the start time for time-based looping
          if (!self.motionStartTime) {
            self.motionStartTime = Date.now();
          }
        } else {
          console.log("[Motion Video] No motion clips available – falling back to family display");
          this.showingMotion = false;
          this.currentDisplay = 'family';
          if (this.familyImages.length > 0) {
            this.familyIndex = Math.floor(Math.random() * this.familyImages.length);
          }
          this.updateDom();
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
    this.wrapper.className = "blessed-center"; // Add this class to ensure proper styling
    
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
  
  // Make sure we have valid images and index
  if (images.length === 0 || currentIndex >= images.length) {
    console.error(`No valid images found for ${this.currentDisplay} display`);
    return this.wrapper;
  }
  
  // Only proceed if we have images and aren't already loading one
  if (images.length > 0 && currentIndex < images.length && !this.isImageLoading) {
    this.isImageLoading = true;
    
    // Log for debugging
    console.log(`Loading ${this.currentDisplay} image at index ${currentIndex}`);
    
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
      img.className = "blessed-image"; // Adding the proper class

      // Important: Set the image to be invisible and absolutely positioned
      img.style.position = "absolute";
      img.style.opacity = 0;
      img.style.transition = `opacity ${this.config.transition/1000}s`;
      
      // Hide image completely until it's sized correctly
      img.style.visibility = "hidden";
      
      // Add a timestamp for debugging
      img.dataset.timestamp = new Date().toISOString();
      
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
      
      // Add error logging for debugging
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
        
        console.log(`Image loaded successfully: ${eventImage.src}`);
        
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
          if (oldImg !== eventImage) {
            oldImg.style.opacity = 0;
            oldImg.classList.remove("visible");
          }
        });
        
        // Now add the new image to the main container
        self.fg.appendChild(eventImage);
        
        // Make the image visible again
        eventImage.style.visibility = "visible";
        
        // Now fade in the new image
        setTimeout(() => {
          eventImage.style.opacity = self.config.opacity;
          eventImage.classList.add("visible");
          
          // After the transition completes, remove any old images
          setTimeout(() => {
            // Remove all images except the latest one
            const allImages = self.fg.querySelectorAll("img");
            for (let i = 0; i < allImages.length; i++) {
              if (allImages[i] !== eventImage && allImages[i].parentNode === self.fg) {
                console.log("Removing old image");
                self.fg.removeChild(allImages[i]);
              }
            }
            
            // Allow loading the next image
            self.isImageLoading = false;
          }, self.config.transition + 100); // Wait slightly longer than transition time
          
        }, 50); // Short delay to ensure browser has rendered the new properties
      };
      
      // Now set the source to start loading
      img.src = imageSrc;
    } else {
      console.error("Invalid image source");
      this.isImageLoading = false;
    }
  }
  
  return this.wrapper;
}
});