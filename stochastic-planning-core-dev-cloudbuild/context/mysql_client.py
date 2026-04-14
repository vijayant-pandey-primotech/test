"""
Context MySQL Client

Fetches the scope config from the context_config MySQL table.
Used as the source of truth when Redis config is missing or stale.
"""

import json
import mysql.connector
from mysql.connector import Error

from core.config import MYSQL_CONFIG
from context.logger import log_info, log_error


def fetch_config_from_mysql() -> dict:
    """
    Fetch the latest scope config JSON from the context_config table.

    Returns:
        Parsed config dict ready for load_config().

    Raises:
        RuntimeError: if table is empty or connection fails.
    """
    connection = None
    try:
        connection = mysql.connector.connect(**MYSQL_CONFIG)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT seed_data FROM context_config ORDER BY id DESC LIMIT 1"
        )
        row = cursor.fetchone()
        cursor.close()

        if not row or not row.get("seed_data"):
            raise RuntimeError("No config found in context_config table.")

        config = json.loads(row["seed_data"])
        log_info("Config fetched from MySQL context_config table.")
        return config

    except Error as e:
        log_error(f"MySQL connection failed while fetching config: {e}")
        raise RuntimeError(f"MySQL error: {e}")
    finally:
        if connection and connection.is_connected():
            connection.close()
