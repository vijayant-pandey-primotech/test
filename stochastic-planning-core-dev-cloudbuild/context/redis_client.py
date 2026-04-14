"""
Redis client — singleton connection for the context module.

Reads connection config from environment variables:
  REDIS_HOST      (default: localhost)
  REDIS_PORT      (default: 6379)
  REDIS_PASSWORD  (optional)
"""

import os
import redis
from context.logger import log_info, log_error

_client = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        host = os.getenv("REDIS_HOST", "localhost")
        port = int(os.getenv("REDIS_PORT", "6379"))
        password = os.getenv("REDIS_PASSWORD") or None
        _client = redis.Redis(
            host=host,
            port=port,
            password=password,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )
        log_info(f"Redis client initialized at {host}:{port}")
    return _client
