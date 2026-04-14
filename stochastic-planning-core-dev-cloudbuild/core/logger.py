import logging
import os
import contextvars
from datetime import datetime
from pathlib import Path

# Create context variable for user_guid
user_guid_context = contextvars.ContextVar('user_guid')

# Detect if running locally or in Cloud Run
is_local_env = "K_SERVICE" not in os.environ

class RotatingFileHandler(logging.FileHandler):
    """Custom file handler that rotates files when they exceed 10MB"""
    
    def __init__(self, filename, max_bytes=10*1024*1024, backup_count=5):
        # Ensure logs directory exists
        log_dir = Path(filename).parent
        log_dir.mkdir(parents=True, exist_ok=True)
        
        super().__init__(filename, mode='a', encoding='utf-8')
        self.max_bytes = max_bytes
        self.backup_count = backup_count
        self.filename = filename
        
    def emit(self, record):
        """Emit a record and rotate if necessary"""
        if self.should_rotate():
            self.rotate()
        super().emit(record)
    
    def should_rotate(self):
        """Check if the file should be rotated"""
        try:
            return os.path.getsize(self.filename) >= self.max_bytes
        except OSError:
            return False
    
    def rotate(self):
        """Rotate the log file"""
        if self.stream:
            self.stream.close()
            self.stream = None
        
        # Create backup filename with date
        timestamp = datetime.now().strftime("%m%d%Y")
        backup_filename = f"{self.filename}.{timestamp}"
        
        # If backup file already exists, add a number
        counter = 1
        while os.path.exists(backup_filename):
            backup_filename = f"{self.filename}.{timestamp}_{counter}"
            counter += 1
        
        # Rename current file to backup
        try:
            os.rename(self.filename, backup_filename)
        except OSError:
            pass
        
        # Open new file
        self.stream = open(self.filename, 'a', encoding='utf-8')

def setup_logger():
    """Setup the application logger"""
    # Create logger
    logger = logging.getLogger('app')
    logger.setLevel(logging.INFO)
    
    # Remove existing handlers to avoid duplicates
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    if is_local_env:
        # Local environment: Use file logging
        # Create logs directory if it doesn't exist
        log_dir = Path(__file__).parent.parent / "logs"
        log_dir.mkdir(exist_ok=True)
        
        # Create file handler with rotation
        log_file = log_dir / "appslog.log"
        file_handler = RotatingFileHandler(log_file, max_bytes=10*1024*1024)
        file_handler.setLevel(logging.INFO)
        file_handler.setFormatter(formatter)
        
        # Add only file handler for local environment
        logger.addHandler(file_handler)
    else:
        # Cloud Run environment: Use console logging
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_handler.setFormatter(formatter)
        
        # Add only console handler for Cloud Run
        logger.addHandler(console_handler)
    
    return logger

# Create global logger instance
app_logger = setup_logger()

def log_info(message):
    """Log info message with automatic user_guid from context"""
    user_guid = user_guid_context.get(None)
    if user_guid:
        app_logger.info(f"[{user_guid}] {message}")
    else:
        app_logger.info(message)

def log_error(message):
    """Log error message with automatic user_guid from context"""
    user_guid = user_guid_context.get(None)
    if user_guid:
        app_logger.error(f"[{user_guid}] {message}")
    else:
        app_logger.error(message)

def log_warning(message):
    """Log warning message with automatic user_guid from context"""
    user_guid = user_guid_context.get(None)
    if user_guid:
        app_logger.warning(f"[{user_guid}] {message}")
    else:
        app_logger.warning(message)

def log_debug(message):
    """Log debug message with automatic user_guid from context"""
    user_guid = user_guid_context.get(None)
    if user_guid:
        app_logger.debug(f"[{user_guid}] {message}")
    else:
        app_logger.debug(message)

def log_structured_data(level, message, data, max_length=None):
    """
    Log structured data as a single entry, handling multi-line content properly.
    
    Args:
        level: Log level ('info', 'error', 'warning', 'debug')
        message: Main log message
        data: The data to log (can be multi-line)
        max_length: Optional maximum length to truncate data to
    """
    user_guid = user_guid_context.get(None)
    
    # Truncate data if max_length is specified
    if max_length and len(str(data)) > max_length:
        data = str(data)[:max_length] + "..."
    
    # Replace newlines with escaped newlines to keep it as a single log entry
    # This ensures GCP Cloud Logging treats it as one entry
    escaped_data = str(data).replace('\n', '\\n').replace('\r', '\\r')
    
    # Format the complete message
    if user_guid:
        full_message = f"[{user_guid}] {message}: {escaped_data}"
    else:
        full_message = f"{message}: {escaped_data}"
    
    # Log using the appropriate level
    if level.lower() == 'error':
        app_logger.error(full_message)
    elif level.lower() == 'warning':
        app_logger.warning(full_message)
    elif level.lower() == 'debug':
        app_logger.debug(full_message)
    else:  # default to info
        app_logger.info(full_message)

def log_large_json(level, message, json_data, max_length=5000):
    """
    Log large JSON data as a single structured entry.
    
    Args:
        level: Log level ('info', 'error', 'warning', 'debug')
        message: Main log message
        json_data: JSON data to log (can be dict, list, or string)
        max_length: Maximum length before truncation (default 5000)
    """
    import json as json_module
    
    # Convert to string if it's not already
    if isinstance(json_data, (dict, list)):
        json_str = json_module.dumps(json_data, indent=2, ensure_ascii=False)
    else:
        json_str = str(json_data)
    
    log_structured_data(level, message, json_str, max_length) 