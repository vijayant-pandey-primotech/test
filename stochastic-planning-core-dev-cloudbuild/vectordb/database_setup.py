import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from config import DB_CONFIG
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))
from core.logger import log_info, log_error

def create_database():
    """Create the database if it doesn't exist"""
    # Connect to default postgres database to create new database
    conn = psycopg2.connect(
        user=DB_CONFIG["user"],
        password=DB_CONFIG["password"],
        host=DB_CONFIG["host"],
        port=DB_CONFIG["port"],
        database="postgres"
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cursor = conn.cursor()
    
    try:
        # Check if database exists
        cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_CONFIG["database"],))
        exists = cursor.fetchone()
        
        if not exists:
            cursor.execute(f"CREATE DATABASE {DB_CONFIG['database']}")
            log_info(f"Database '{DB_CONFIG['database']}' created successfully.")
        else:
            log_info(f"Database '{DB_CONFIG['database']}' already exists.")
            
    except Exception as e:
        log_error(f"Error creating database: {e}")
    finally:
        cursor.close()
        conn.close()

def setup_tables():
    """Create the necessary tables and install pgvector extension"""
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    pgvector_available = False
    
    try:
        # Try to install pgvector extension, but don't fail if not available
        try:
            cursor.execute("CREATE EXTENSION IF NOT EXISTS vector")
            log_info("pgvector extension installed/verified.")
            
            # Verify vector type exists
            cursor.execute("SELECT typname FROM pg_type WHERE typname = 'vector'")
            if cursor.fetchone():
                log_info("Vector type verified. Using pgvector for similarity search.")
                pgvector_available = True
            else:
                log_info("Vector type not found. Using array-based similarity search.")
        except Exception as e:
            log_error(f"pgvector extension not available: {e}")
            log_info("Using array-based similarity search instead.")
        
        # Create Platforms table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS platforms (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Insert Caregiving Platform
        cursor.execute("""
            INSERT INTO platforms (id, name, description) 
            VALUES (1, 'Caregiving Platform', 'Platform for caregiving scenarios and support')
            ON CONFLICT (id) DO NOTHING
        """)
        
        # Create Scenarios table with vector embedding
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS scenarios (
                id SERIAL PRIMARY KEY,
                scenario TEXT NOT NULL,
                dimensions TEXT[] NOT NULL,
                embedding vector(768),
                platform_id INTEGER REFERENCES platforms(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create index for vector similarity search
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS scenarios_embedding_idx 
            ON scenarios 
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100)
        """)
        
        conn.commit()
        log_info("Tables created successfully.")
        
    except Exception as e:
        log_error(f"Error setting up tables: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    log_info("Setting up database...")
    create_database()
    setup_tables()
    log_info("Database setup complete!") 