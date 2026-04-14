import os
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
from src.middleware.function_logger import *

load_dotenv()

# Provide your path to Firebase credentials or use environment variables
cred = credentials.Certificate("service_key.json")
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "service_key.json"

# Initialize Firestore client
firebase_admin.initialize_app(cred)
db_name = os.getenv("DB_CURRENT", "rejara-dev-db")
project_id = os.getenv("PROJECTID", "rejara")
db = firestore.Client(project=project_id, database=db_name)

@log_execution_time
@log_function_call
def get_firestore_client():
    """
    Returns the Firestore database client.
    """
    return db