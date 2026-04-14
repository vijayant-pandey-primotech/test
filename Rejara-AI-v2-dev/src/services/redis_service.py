import os
from datetime import datetime
from typing import Dict
import redis
from dotenv import load_dotenv
# from src.middleware.function_logger import log_execution_time, log_function_call

load_dotenv()

# -------------- Redis Init -------------- #
# Support both formats of environment variable names (with and without underscore)
redis_host = os.getenv("REDISHOST", os.getenv("REDIS_HOST", "localhost"))
redis_port = int(os.getenv("REDISPORT", os.getenv("REDIS_PORT", 6379)))
redis_password = os.getenv("REDISPASSWORD", os.getenv("REDIS_PASSWORD", None))

if redis_password == "":
    redis_password = None


# Create Redis connection
redis_client = redis.StrictRedis(
    host=redis_host,
    port=redis_port,
    password=redis_password,
    decode_responses=True
)


# Get session data from Redis
# @log_execution_time
# @log_function_call
def get_session_redis(uuid: str) -> Dict:
    """
    Fetches a session from Redis based on UUID.
    If the session doesn't exist, creates a new one with default values.
    """
    # Try to get existing session
    session_data = redis_client.hgetall(f"session:{uuid}")
    
    if session_data:
        # Convert types for numeric fields
        session_data["count"] = int(session_data.get("count", 0))
        session_data["invalid_count"] = int(session_data.get("invalid_count", 0))
        session_data["policy_done"] = int(session_data.get("policy_done", 0))
        return session_data
    
    # Create new session with default values
    init_data = {
        "uuid": uuid,
        "count": 0,
        "invalid_count": 0,
        "last_question": "",
        "state": "awaiting_question",
        "created_at": datetime.utcnow().isoformat(),
        "answer_log": " ",
        "policy_done": 0
    }
    
    # Store new session with 24h expiration
    redis_client.hset(f"session:{uuid}", mapping=init_data)
    redis_client.expire(f"session:{uuid}", 86400)  # 24h TTL
    
    return init_data


# Update session data in Redis
# @log_execution_time
# @log_function_call
def update_session_redis(uuid: str, data: Dict) -> None:
    """
    Updates session data in Redis. Supports partial updates.
    Automatically refreshes the TTL to 24 hours.
    """
    if data:
        # Convert values to strings for Redis storage
        update_data = {k: str(v) for k, v in data.items()}
        redis_client.hset(f"session:{uuid}", mapping=update_data)
    
    # Refresh TTL to 24 hours on every update
    redis_client.expire(f"session:{uuid}", 86400)


def clear_redis_cache() -> bool:
    """
    Clears all data from the Redis cache.
    Returns True if successful, False otherwise.
    """
    try:
        redis_client.flushdb()
        return True
    except Exception as e:
        print(f"Error clearing Redis cache: {e}")
        return False