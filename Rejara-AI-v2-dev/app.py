import os
import logging
from flask import Flask
from flask_cors import CORS
from gevent.pywsgi import WSGIServer
import redis

# Import routers
from src.router.routes import cbot_routes

# Import logger
from src.middleware.logger import log_request, log_response
from src.middleware.function_logger import log_execution_time, logger, log_function_call

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)


# Cors Configuration

# Configuration
app.config['Port'] = int(os.getenv("Port", 5000))
app.config['OPENAI_API_KEY'] = os.getenv("OPENAI_API_KEY")
app.secret_key = os.getenv("FLASK_SECRET_KEY")


CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# Logging configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Getting credentials BOT one doesnot have anytjhing to remove
def get_required_env(var_name: str) -> str:
    """Ensure required environment variables are set."""
    value = os.getenv(var_name)
    if not value:
        raise ValueError(f"Missing required environment variable: {var_name}")
    return value


# Default route
@app.route('/test')
@log_execution_time
@log_execution_time
def testing():
    """Return the version of the app."""
    logger.info("Test API called")
    logger.info("Test API called")
    return 'version 4.0.3.1'

# Register middleware
app.before_request(log_request)  # Log before handling requests
app.after_request(log_response)  # Log after handling responses


# Register routes
app.register_blueprint(cbot_routes, url_prefix='/flask')

# Start the server
def start_server(port: int) -> None:
    """Start the WSGI server."""
    http_server = WSGIServer(('0.0.0.0', port), app)
    logger.info(f"Server running on port {port}...")
    print(f"Server running on port {port}...")
    http_server.serve_forever()

# Main function
if __name__ == '__main__':
    try:
        # Ensure required credentials are set
        get_required_env("OPENAI_API_KEY")
        
        # Start the server
        start_server(app.config['Port'])
    except KeyboardInterrupt:
        logger.info("\nServer stopped by user...")
        print("\nServer stopped by user...")
    except Exception as e:
        logger.error("Failed to start server...", exc_info=True)
        print("Failed to start server...", e)

