import time
from flask import request, g
from datetime import datetime
from src.config.google_db import *
from google.cloud import firestore 

db = get_firestore_client()


# Log API requests and responses to Firestore
def log_to_firestore(log_entry, user_id, api_path):
    """
    Save API logs to Firestore.
    """
    if not user_id or user_id == "unknown":
        return # Skip logging if user_id is invalid or missing
    
    # Generate a formatted timestamp as the document ID
    date_str = datetime.now().strftime("%Y-%m-%d-%H:%M:%S")
    
    # Store log entry with date-time as the document ID
    user_doc_ref  = db.collection("ai_apilogs").document(str(user_id))
    user_doc = user_doc_ref.get()

    if not user_doc.exists:
        user_doc_ref.set({"created_at": firestore.SERVER_TIMESTAMP})

    api_path_ref = user_doc_ref.collection(api_path.replace("/", "_")).document(date_str)
    api_path_ref.set(log_entry, merge=True) # Merge to avoid overwriting



# Middleware to log incoming requests
def log_request():
    """
    Middleware to log incoming requests.
    Saves data in Flask's 'g' object for later use in response logging.
    """
    if request.path == "/":
        return  # Ignore uptime check requests

    g.start_time = time.time()  # Correctly store start time as float
    g.request_data = request.get_json(silent=True) or {}



# Middleware to log responses after request processing
def log_response(response):
    """
    Middleware to log responses after request processing.
    Handles policy-related follow-up questions by retaining parent itemId and itemName.
    """
    request_body = g.get("request_data", {})
    user_id = request_body.get("user_unique_id", "unknown")

    api_path = request.path.strip("/") or "root"
    log_entry = {
        "timestamp": firestore.SERVER_TIMESTAMP,
        "api_path": request.path,
        "http_method": request.method,
        "request_body": request_body,
        "query_params": request.args.to_dict(),
        "headers": {key: value for key, value in request.headers.items() if key.lower() not in ["authorization", "cookie"]},
        "response_status": response.status_code,
        "user_id": user_id,
    }

    # Save log to Firestore
    if user_id != "unknown":
        log_to_firestore(log_entry, user_id, api_path)

    return response