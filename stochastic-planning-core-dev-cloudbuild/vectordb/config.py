import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database configuration
DB_CONFIG = {
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT"),
    "database": os.getenv("DB_NAME")
}

# HuggingFace configuration
HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACE_API_KEY")

# Model configuration
EMBEDDING_MODEL = "sentence-transformers/all-mpnet-base-v2"
EMBEDDING_DIMENSION = 768  # Dimension for all-mpnet-base-v2 