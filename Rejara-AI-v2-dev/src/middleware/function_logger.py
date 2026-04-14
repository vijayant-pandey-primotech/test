import re
import time
import logging
import functools
import traceback
from functools import wraps

# Configure logging to print logs in the terminal
logging.basicConfig(
    level=logging.INFO,  # Set log level to INFO
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()]  # Print logs to the terminal
)

logger = logging.getLogger(__name__)

# Replace JWT tokens with [TOKEN_HIDDEN]
def mask_token(value):
    """Replace JWT tokens with [TOKEN_HIDDEN]"""
    if isinstance(value, str) and re.match(r'eyJ[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+', value):
        return "[TOKEN_HIDDEN]"
    return value

# Decorator to log function execution time
def log_execution_time(func):
    """
    Decorator to log function execution details including:
    - Function start time
    - Execution time
    - Errors and full traceback if any occur
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        try:
            result = func(*args, **kwargs)
            execution_time = time.time() - start_time
            logger.info(f"Function '{func.__name__}' executed successfully in {execution_time:.4f} seconds")
            return result
        except Exception as e:
            execution_time = time.time() - start_time
            error_message = f"Function '{func.__name__}' failed after {execution_time:.4f} seconds. Error: {str(e)}"
            logger.error(error_message)
            logger.error(traceback.format_exc())  # Logs full traceback
            raise e  # Re-raise the exception so Flask can handle it properly
    return wrapper

# Decorator to log function input arguments and output
def log_function_call(func):
    """Decorator to log function input arguments and output, excluding bearer_token."""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        # Convert args to a list to allow modification
        arg_names = func.__code__.co_varnames[:func.__code__.co_argcount]
        safe_args = list(args)

        # Mask `bearer_token` in args if it exists
        if 'bearer_token' in arg_names:
            index = arg_names.index('bearer_token')
            if index < len(safe_args):
                safe_args[index] = "[TOKEN_HIDDEN]"

        # Mask `bearer_token` in kwargs
        safe_kwargs = {k: "[TOKEN_HIDDEN]" if k == "bearer_token" else v for k, v in kwargs.items()}

        logger.info(f"Calling function: {func.__name__}")
        logger.info(f"Arguments: args={safe_args}, kwargs={safe_kwargs}")

        result = func(*args, **kwargs)

        logger.info(f"Function {func.__name__} returned: {result}")

        return result

    return wrapper