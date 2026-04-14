import os
from dotenv import load_dotenv
from core.logger import log_info, log_error

# Get the directory where config.py is located
config_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_file_path = os.path.join(config_dir, '.env')

# Load .env file from the backend directory
load_dotenv(env_file_path)

# PostgreSQL configuration removed - no longer needed

# MySQL configuration (for user lookup)
MYSQL_CONFIG = {
    'user': os.getenv('MYSQL_USER'),
    'password': os.getenv('MYSQL_PASSWORD'),
    'host': os.getenv('MYSQL_HOST', 'localhost'),
    'port': int(os.getenv('MYSQL_PORT', '3306')),
    'database': os.getenv('MYSQL_DATABASE'),
    'autocommit': True
}

# LLM Configurations - load only once per process
import json

LLM_CONFIGS = []

# Only load if not already loaded (prevents multiple loads in reload mode)
if not LLM_CONFIGS and os.getenv('LLM_CONFIGS'):
    try:
        LLM_CONFIGS = json.loads(os.getenv('LLM_CONFIGS'))
    except json.JSONDecodeError as e:
        log_error(f"Error parsing LLM_CONFIGS: {e}")
        LLM_CONFIGS = [] 