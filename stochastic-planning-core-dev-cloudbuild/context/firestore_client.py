"""
Firestore client — dedicated to the context module.

Uses service account key if CONTEXT_SERVICE_KEY_PATH is set and the file exists.
Falls back to Application Default Credentials (ADC) on Cloud Run.

Env vars:
  CONTEXT_SERVICE_KEY_PATH  path to service account JSON (optional — not needed on Cloud Run)
  PROJECTID                 GCP project ID
  FIREBASE_DB               Firestore database ID (e.g. rejara-development-db)
"""

import os
from google.cloud import firestore
from google.oauth2 import service_account
from context.logger import log_info, log_error

_db = None


def get_db():
    global _db
    if _db is None:
        key_path = os.getenv("CONTEXT_SERVICE_KEY_PATH")
        project_id = os.getenv("PROJECTID", "rejara")
        database_id = os.getenv("FIREBASE_DB", "rejara-development-db")

        if key_path and os.path.exists(key_path):
            # Local dev — use explicit service account key
            creds = service_account.Credentials.from_service_account_file(key_path)
            _db = firestore.Client(
                project=project_id,
                database=database_id,
                credentials=creds,
            )
            log_info(
                f"Context Firestore client initialized via service account key — "
                f"project={project_id}, database={database_id}"
            )
        else:
            # Cloud Run — use Application Default Credentials (ADC)
            _db = firestore.Client(
                project=project_id,
                database=database_id,
            )
            log_info(
                f"Context Firestore client initialized via ADC — "
                f"project={project_id}, database={database_id}"
            )
    return _db
