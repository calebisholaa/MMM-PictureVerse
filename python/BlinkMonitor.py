"""
Blink Camera Motion Monitor - Refactored Version
Monitors Blink cameras for motion and saves snapshots/videos
"""

import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

from aiohttp import ClientSession
from blinkpy.blinkpy import Blink
from blinkpy.auth import Auth
from blinkpy.helpers.util import json_load


# ==================== CONFIGURATION ====================
class Config:
    """Centralized configuration"""
    SCRIPT_DIR = Path(__file__).parent.absolute()
    MEDIA_FOLDER = SCRIPT_DIR / "media"
    CREDS_FILE = SCRIPT_DIR / "creds.json"
    
    # Timeouts (in seconds)
    DOWNLOAD_TIMEOUT_WIRED = 45
    DOWNLOAD_TIMEOUT_WIRELESS = 30
    
    # Retry settings
    MAX_RETRIES_WIRED = 3
    MAX_RETRIES_WIRELESS = 2
    RETRY_DELAY = 3
    
    # Wait times after capturing (in seconds)
    CAPTURE_WAIT_WIRED = 8
    CAPTURE_WAIT_WIRELESS = 3
    
    # Monitoring
    CHECK_INTERVAL = 30  # How often to check for motion
    STATUS_LOG_INTERVAL = 60  # How often to log "no motion" status
    
    # File size validation
    MIN_IMAGE_SIZE = 1000  # 1KB minimum
    MIN_VIDEO_SIZE = 1000  # 1KB minimum
    
    # Debug mode
    DEBUG = True  # Set to False to reduce verbose logging


# ==================== LOGGING ====================
class Logger:
    """Simple logger with different levels"""
    
    @staticmethod
    def info(message: str, indent: int = 0):
        """Standard info message"""
        prefix = "  " * indent
        print(f"{prefix}{message}")
    
    @staticmethod
    def success(message: str, indent: int = 0):
        """Success message with checkmark"""
        prefix = "  " * indent
        print(f"{prefix}[OK] {message}")
    
    @staticmethod
    def error(message: str, indent: int = 0):
        """Error message with X"""
        prefix = "  " * indent
        print(f"{prefix}[ERROR] {message}")
    
    @staticmethod
    def warning(message: str, indent: int = 0):
        """Warning message"""
        prefix = "  " * indent
        print(f"{prefix}[WARNING] {message}")
    
    @staticmethod
    def debug(message: str, indent: int = 0):
        """Debug message (only if DEBUG is True)"""
        if Config.DEBUG:
            prefix = "  " * indent
            print(f"{prefix}[DEBUG] {message}")
    
    @staticmethod
    def separator(char: str = "=", length: int = 60):
        """Print separator line"""
        print(char * length)
    
    @staticmethod
    def timestamp() -> str:
        """Get formatted timestamp"""
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ==================== CAMERA UTILITIES ====================
class CameraInfo:
    """Helper class to manage camera information"""
    
    def __init__(self, camera, name: str):
        self.camera = camera
        self.name = name
        self._is_wired = None
    
    @property
    def is_wired(self) -> bool:
        """Check if camera is wired (cached)"""
        if self._is_wired is None:
            self._is_wired = (
                hasattr(self.camera, 'camera_type') and 
                'wired' in str(self.camera.camera_type).lower()
            )
        return self._is_wired
    
    @property
    def type_name(self) -> str:
        """Get camera type name"""
        return "Wired" if self.is_wired else "Wireless"
    
    @property
    def safe_name(self) -> str:
        """Get filesystem-safe camera name"""
        return self.name.replace(" ", "_")
    
    def get_timeout(self) -> int:
        """Get appropriate download timeout for this camera"""
        return Config.DOWNLOAD_TIMEOUT_WIRED if self.is_wired else Config.DOWNLOAD_TIMEOUT_WIRELESS
    
    def get_max_retries(self) -> int:
        """Get appropriate max retries for this camera"""
        return Config.MAX_RETRIES_WIRED if self.is_wired else Config.MAX_RETRIES_WIRELESS
    
    def get_capture_wait(self) -> int:
        """Get appropriate wait time after capture"""
        return Config.CAPTURE_WAIT_WIRED if self.is_wired else Config.CAPTURE_WAIT_WIRELESS


# ==================== FILE OPERATIONS ====================
class MediaHandler:
    """Handles saving and validating media files"""
    
    @staticmethod
    def validate_file(filepath: Path, min_size: int) -> bool:
        """Validate that file exists and meets minimum size"""
        if not filepath.exists():
            return False
        
        file_size = filepath.stat().st_size
        if file_size < min_size:
            Logger.debug(f"File too small: {file_size} bytes (min: {min_size})", indent=2)
            return False
        
        return True
    
    @staticmethod
    def get_file_path(camera_info: CameraInfo, timestamp: str, extension: str) -> Path:
        """Generate file path for media"""
        filename = f"{camera_info.safe_name}_{timestamp}.{extension}"
        return Config.MEDIA_FOLDER / filename
    
    @staticmethod
    async def save_snapshot(camera, camera_info: CameraInfo, timestamp: str) -> Optional[Path]:
        """Save camera snapshot"""
        img_path = MediaHandler.get_file_path(camera_info, timestamp, "jpg")
        
        try:
            await camera.image_to_file(str(img_path))
            
            if MediaHandler.validate_file(img_path, Config.MIN_IMAGE_SIZE):
                file_size = img_path.stat().st_size
                Logger.success(f"Snapshot saved: {img_path.name} ({file_size:,} bytes)", indent=1)
                return img_path
            else:
                Logger.error("Snapshot validation failed", indent=1)
                if img_path.exists():
                    img_path.unlink()
                return None
                
        except Exception as e:
            Logger.error(f"Snapshot error: {e}", indent=1)
            return None
    
    @staticmethod
    async def save_video(camera, camera_info: CameraInfo, timestamp: str) -> Optional[Path]:
        """Save motion video with retry logic"""
        video_path = MediaHandler.get_file_path(camera_info, timestamp, "mp4")
        max_retries = camera_info.get_max_retries()
        timeout = camera_info.get_timeout()
        
        for attempt in range(1, max_retries + 1):
            try:
                Logger.debug(f"Video download attempt {attempt}/{max_retries}", indent=1)
                
                # Download with timeout
                await asyncio.wait_for(
                    camera.video_to_file(str(video_path)),
                    timeout=timeout
                )
                
                # Validate file
                if MediaHandler.validate_file(video_path, Config.MIN_VIDEO_SIZE):
                    file_size = video_path.stat().st_size
                    Logger.success(f"Video saved: {video_path.name} ({file_size:,} bytes)", indent=1)
                    return video_path
                else:
                    Logger.error(f"Video validation failed (attempt {attempt})", indent=1)
                    if video_path.exists():
                        video_path.unlink()
                        
            except asyncio.TimeoutError:
                Logger.error(f"Download timeout after {timeout}s (attempt {attempt})", indent=1)
                
            except Exception as e:
                Logger.error(f"Download error (attempt {attempt}): {e}", indent=1)
            
            # Wait before retry
            if attempt < max_retries:
                await asyncio.sleep(Config.RETRY_DELAY)
        
        Logger.error("All video download attempts failed", indent=1)
        return None


# ==================== MOTION MONITORING ====================
class MotionMonitor:
    """Handles motion detection and recording"""
    
    def __init__(self, blink: Blink):
        self.blink = blink
        self.cameras: Dict[str, CameraInfo] = {}
        self.last_status_log = 0
    
    def initialize_cameras(self):
        """Initialize camera info objects"""
        Logger.info("\nInitializing cameras...")
        for name, camera in self.blink.cameras.items():
            cam_info = CameraInfo(camera, name)
            self.cameras[name] = cam_info
            Logger.info(f"  - {name} ({cam_info.type_name})")
        Logger.info("")
    
    async def handle_motion(self, name: str, camera, camera_info: CameraInfo):
        """Handle motion detection for a single camera"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        Logger.separator()
        Logger.info(f"Motion detected: {name}")
        Logger.info(f"Time: {Logger.timestamp()}")
        Logger.info(f"Type: {camera_info.type_name}")
        Logger.separator()
        
        # Step 1: Trigger snapshot
        Logger.info("Capturing snapshot...", indent=1)
        try:
            await camera.snap_picture()
        except Exception as e:
            Logger.error(f"Failed to trigger snapshot: {e}", indent=1)
            return
        
        # Step 2: Wait for camera to process
        wait_time = camera_info.get_capture_wait()
        Logger.debug(f"Waiting {wait_time}s for camera processing...", indent=1)
        await asyncio.sleep(wait_time)
        
        # Step 3: Refresh to get latest data
        Logger.debug("Refreshing camera data...", indent=1)
        await self.blink.refresh()
        
        # Step 4: Save snapshot
        snapshot_path = await MediaHandler.save_snapshot(camera, camera_info, timestamp)
        
        # Step 5: Check for video
        Logger.info("Checking for motion video...", indent=1)
        Logger.debug(f"video_from_cache: {camera.video_from_cache}", indent=2)
        
        if hasattr(camera, 'last_record'):
            Logger.debug(f"last_record: {camera.last_record}", indent=2)
        
        if camera.video_from_cache:
            video_path = await MediaHandler.save_video(camera, camera_info, timestamp)
            
            if not video_path and snapshot_path:
                Logger.warning("Video failed, but snapshot is available", indent=1)
        else:
            Logger.warning("No video in cache (snapshot saved)", indent=1)
            Logger.debug("This is normal for some cameras/configurations", indent=2)
        
        Logger.separator("-")
        Logger.info("")
    
    async def check_motion(self):
        """Check all cameras for motion"""
        try:
            await self.blink.refresh()
            motion_detected = False
            
            for name, camera in self.blink.cameras.items():
                camera_info = self.cameras.get(name)
                if not camera_info:
                    continue
                
                if camera.motion_detected:
                    motion_detected = True
                    await self.handle_motion(name, camera, camera_info)
                else:
                    # Periodic status logging
                    current_time = datetime.now().second
                    if current_time - self.last_status_log >= Config.STATUS_LOG_INTERVAL:
                        Logger.debug(f"[{datetime.now().strftime('%H:%M:%S')}] No motion on {name}")
            
            # Update last status log time
            if not motion_detected:
                self.last_status_log = datetime.now().second
            
        except Exception as e:
            Logger.error(f"Error during motion check: {e}")
            Logger.debug(f"Full error: {repr(e)}")
            raise
    
    async def monitor_loop(self):
        """Main monitoring loop"""
        Logger.info("Starting motion monitoring...\n")
        
        while True:
            try:
                await self.check_motion()
                await asyncio.sleep(Config.CHECK_INTERVAL)
                
            except Exception as e:
                Logger.separator("!")
                Logger.error(f"Error in monitoring loop: {e}")
                Logger.separator("!")
                Logger.info("Retrying in 60 seconds...\n")
                await asyncio.sleep(60)


# ==================== MAIN APPLICATION ====================
async def initialize_blink(session: ClientSession) -> Blink:
    """Initialize and authenticate with Blink"""
    Logger.info("Loading credentials...")
    creds = await json_load(str(Config.CREDS_FILE))
    
    blink = Blink(session=session)
    blink.auth = Auth(creds, no_prompt=True)
    
    Logger.info("Connecting to Blink servers...")
    await blink.start()
    await blink.refresh()
    
    # Log connection info
    email = blink.auth.login_attributes.get('email', 'Unknown')
    Logger.success(f"Connected as: {email}")
    
    # Log sync modules
    Logger.info(f"\nSync Modules: {len(blink.sync)}")
    for sync_name, sync in blink.sync.items():
        Logger.info(f"  - {sync_name}: {sync.status}")
        if hasattr(sync, 'cameras'):
            Logger.info(f"    Cameras: {', '.join(sync.cameras.keys())}")
    
    Logger.info(f"\nTotal cameras: {len(blink.cameras)}")
    
    return blink


async def main():
    """Main application entry point"""
    # Print header
    Logger.separator()
    Logger.info("Blink Motion Monitor - Refactored")
    Logger.info(f"Started: {Logger.timestamp()}")
    Logger.info(f"Media folder: {Config.MEDIA_FOLDER}")
    Logger.info(f"Debug mode: {'ON' if Config.DEBUG else 'OFF'}")
    Logger.separator()
    Logger.info("")
    
    # Check credentials file
    if not Config.CREDS_FILE.exists():
        Logger.error(f"Credentials file not found: {Config.CREDS_FILE}")
        Logger.info("Please run BlinkSetup.py first.")
        return
    
    # Create media folder
    Config.MEDIA_FOLDER.mkdir(exist_ok=True)
    
    # Initialize Blink connection
    async with ClientSession() as session:
        try:
            blink = await initialize_blink(session)
            
            # Start monitoring
            monitor = MotionMonitor(blink)
            monitor.initialize_cameras()
            
            await monitor.monitor_loop()
            
        except Exception as e:
            Logger.error(f"Fatal error: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)


# ==================== ENTRY POINT ====================
if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        Logger.info("\n")
        Logger.separator()
        Logger.info("Monitor stopped by user")
        Logger.separator()
    except Exception as e:
        Logger.error(f"\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)