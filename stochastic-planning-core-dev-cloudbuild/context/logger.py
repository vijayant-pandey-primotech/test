"""
Context Module — Logger

Writes structured logs directly to GCP Cloud Logging using the context
service account key (CONTEXT_SERVICE_KEY_PATH).

This ensures context builder logs persist in GCP regardless of Cloud Run
redeploys, container restarts, or ephemeral filesystem resets.

Log name in GCP: context-builder

Falls back to stdout if the service key is unavailable (local dev without key,
CI environments, tests).
"""

import logging
import os

_logger = None


def _build_logger() -> logging.Logger:
    logger = logging.getLogger("context-builder")
    logger.setLevel(logging.INFO)
    logger.propagate = False  # don't bubble up to root / core logger

    if logger.handlers:
        return logger

    key_path = os.getenv("CONTEXT_SERVICE_KEY_PATH")

    try:
        from google.cloud import logging as gcp_logging
        from google.cloud.logging.handlers import CloudLoggingHandler
        from google.oauth2 import service_account

        if key_path and os.path.exists(key_path):
            # Local dev — use explicit service account key
            credentials = service_account.Credentials.from_service_account_file(key_path)
            client = gcp_logging.Client(credentials=credentials)
        else:
            # Cloud Run — use ADC
            client = gcp_logging.Client()

        handler = CloudLoggingHandler(client, name="context-builder")
        handler.setLevel(logging.INFO)
        logger.addHandler(handler)
        return logger

    except Exception:
        pass  # fall through to stdout

    # Fallback: stdout (also works fine on Cloud Run via automatic capture)
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s [context-builder] %(levelname)s %(message)s")
    )
    handler.setLevel(logging.INFO)
    logger.addHandler(handler)
    return logger


def _get_logger() -> logging.Logger:
    global _logger
    if _logger is None:
        _logger = _build_logger()
    return _logger


def log_info(message: str):
    _get_logger().info(message)


def log_error(message: str):
    _get_logger().error(message)
