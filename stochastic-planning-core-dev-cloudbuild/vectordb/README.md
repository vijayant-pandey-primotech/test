# Stochastic Planning - Vector Embedding System

This project creates vector embeddings for caregiving scenarios and stores them in PostgreSQL with pgvector for semantic similarity search.

## Features

- **Vector Embeddings**: Uses sentence-transformers to create 384-dimensional embeddings
- **PostgreSQL Integration**: Stores embeddings with pgvector extension for efficient similarity search
- **Semantic Search**: Find similar scenarios using cosine similarity
- **Platform Management**: Organizes scenarios by platform (Caregiving Platform)
- **Batch Processing**: Processes all scenarios from JSON file automatically

## Prerequisites

1. **PostgreSQL** (version 12+) with pgvector extension
2. **Python 3.8+**
3. **HuggingFace API Key** (optional, for model downloads)

## Installation

### 1. Install PostgreSQL and pgvector

```bash
# On Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib
sudo apt-get install postgresql-12-pgvector  # or your PostgreSQL version

# On macOS with Homebrew
brew install postgresql
brew install pgvector

# On Windows
# Download from https://www.postgresql.org/download/windows/
# Install pgvector extension separately
```

### 2. Set up Python environment

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure environment

Create a `.env` file in the backend directory:

```env
DB_USER=postgres
DB_PASSWORD=W@terfr0nt
DB_HOST=localhost
DB_PORT=5432
DB_NAME=stochastic-embedding
HUGGINGFACE_API_KEY=your_huggingface_api_key_here
```

## Usage

### 1. Initial Setup

Run the main setup script to create the database and process scenarios:

```bash
python main.py
```

This will:
- Create the `stochastic-embedding` database
- Install pgvector extension
- Create necessary tables
- Process all scenarios and generate embeddings
- Test the search functionality

### 2. Interactive Search Demo

Try the interactive search demo:

```bash
python search_demo.py
```

This provides an interactive interface to test semantic search with predefined and custom queries.

### 3. Programmatic Usage

```python
from embedding_service import EmbeddingService

# Initialize service
service = EmbeddingService()

# Search for similar scenarios
query = "My elderly parent needs help with daily activities"
results = service.search_similar_scenarios(query, limit=5)

for result in results:
    print(f"Similarity: {result['similarity']:.3f}")
    print(f"Scenario: {result['scenario']}")
    print(f"Dimensions: {result['dimensions']}")
```

## Database Schema

### Platforms Table
```sql
CREATE TABLE platforms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Scenarios Table
```sql
CREATE TABLE scenarios (
    id SERIAL PRIMARY KEY,
    scenario_id INTEGER NOT NULL,
    scenario TEXT NOT NULL,
    dimensions TEXT[] NOT NULL,
    embedding vector(384),
    platform_id INTEGER REFERENCES platforms(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## API Reference

### EmbeddingService

#### `__init__()`
Initialize the embedding service with the sentence transformer model.

#### `generate_embedding(text)`
Generate a vector embedding for the given text.

**Parameters:**
- `text` (str): The text to embed

**Returns:**
- `list`: 384-dimensional embedding vector

#### `search_similar_scenarios(query_text, limit=5)`
Search for scenarios similar to the query text.

**Parameters:**
- `query_text` (str): The search query
- `limit` (int): Maximum number of results to return

**Returns:**
- `list`: List of dictionaries containing scenario data and similarity scores

## Model Information

- **Model**: `sentence-transformers/all-MiniLM-L6-v2`
- **Dimensions**: 384
- **Performance**: Fast and efficient for semantic similarity
- **Language**: English

## Troubleshooting

### Common Issues

1. **pgvector extension not found**
   ```bash
   # Install pgvector extension
   sudo apt-get install postgresql-12-pgvector
   ```

2. **Database connection failed**
   - Verify PostgreSQL is running
   - Check credentials in `.env` file
   - Ensure database exists

3. **Model download issues**
   - Set `HUGGINGFACE_API_KEY` in `.env`
   - Check internet connection
   - Verify model name in `config.py`

### Performance Tips

- The system uses IVFFlat index for efficient similarity search
- Embeddings are cached after first generation
- Consider batch processing for large datasets

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License. 