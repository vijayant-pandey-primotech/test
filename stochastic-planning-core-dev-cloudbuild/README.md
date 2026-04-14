# Rejara Caregiving Recommendations Backend

FastAPI backend for Rejara caregiving recommendations system.

**Authentication:** Only supports Rejara double-encrypted JWT tokens (HS512 + AES-256-CBC)

## Quick Start

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure `.env` file:**

   Copy from existing `.env` or create with these required variables:

   ```bash
   # Environment
   ENVIRONMENT=development

   # PostgreSQL Database (for vector embeddings)
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=stochastic-embedding

   # MySQL Database (for user data)
   Sql_DB_HOST=localhost
   Sql_DB_USER=root
   Sql_DB_PASSWORD=your_password
   Sql_DB_NAME=rj_db
   Sql_DB_PORT=3306

   # JWT Configuration (MUST match Rejara Node.js backend)
   JWT_SECRET_KEY=your-jwt-secret
   ACCESS_TOKEN_SECRET=your-access-token-secret
   PAYLOAD_ENCRYPTION_KEY=your-payload-encryption-key

   # Similarity Threshold
   SIMILARITY_THRESHOLD=0.5

   # LLM Configurations (JSON array)
   LLM_CONFIGS=[{"provider":"OpenAI","model":"gpt-4o-mini","apikey":"sk-..."},{"provider":"Gemini","model":"gemini-2.5-flash","apikey":"..."}]

   # Firebase/Firestore Configuration
   FIREBASE_DB=rejara-dev-db
   PROJECTID=rejara
   ```

3. **Run the server:**
   ```bash
   python main.py
   ```

   Server will start on `http://0.0.0.0:8080`

## Authentication

**All endpoints** except `/api/health` require Rejara JWT authentication.

Include the Rejara JWT token in the Authorization header:
```
Authorization: Bearer <rejara-jwt-token>
```

### Token Source
- Use tokens from **Rejara Node.js backend** login
- OR use this backend's `/api/login` endpoint

## API Endpoints

### Public Endpoints (no auth required)
- `GET /` - Root endpoint
- `GET /api/health` - API health status

### Authentication Endpoint
- `POST /api/login` - Login with email/password (returns Rejara double-encrypted JWT)

### Protected Endpoints (require Rejara JWT)

**Conversation:**
- `POST /api/conversation` - Send chat message

**Recommendations:**
- `POST /api/recommendations?user={user_guid}` - Get caregiving recommendations
- `GET /api/recommendations/history/{user_guid}` - Get recommendation history
- `GET /api/scenario-status/{user_guid}` - Check if recommendation is processing

**Chat History:**
- `POST /api/chat-history/save` - Save chat history
- `POST /api/chat-history/load` - Load chat history

**User Profile:**
- `GET /api/user-profile/{user_guid}` - Get user profile
- `POST /api/user-profile/save` - Save user profile

## API Documentation

Full API documentation available at: `http://localhost:8080/docs`

## Architecture

**Backend Stack:**
- **FastAPI** - Web framework
- **PostgreSQL + pgvector** - Vector database for embeddings
- **MySQL** - User data storage
- **Sentence Transformers** - Embedding generation (768-dimensional vectors)
- **Multiple LLMs** - OpenAI GPT-4o-mini, Google Gemini
- **Pydantic** - Data validation
- **Firebase/Firestore** - Profile data integration

**Authentication:**
- **Rejara JWT** - Double-encrypted tokens (HS512 + AES-256-CBC)
- **CryptoJS Compatible** - OpenSSL format with EVP_BytesToKey

## Key Features

- ✅ Rejara double-encrypted JWT authentication
- ✅ Vector similarity search for scenario matching
- ✅ Multi-LLM recommendation generation
- ✅ Automatic scenario comparison and merging
- ✅ User profile integration with Firestore
- ✅ Chat history persistence
- ✅ Real-time recommendation status tracking

## Project Structure

```
stochastic-planning/
├── main.py                              # FastAPI application entry point
├── requirements.txt                     # Python dependencies
├── .env                                 # Environment configuration
├── README.md                            # This file
├── REJARA_INTEGRATION.md                # Integration guide
├── middleware/
│   └── rejara_auth_middleware.py        # Rejara JWT authentication
├── services/
│   ├── dual_jwt_service.py              # JWT token handling
│   ├── llm_service.py                   # LLM interactions
│   ├── firestore_service.py             # Firestore integration
│   └── login.py                         # Login logic
├── routes/
│   ├── dual_login.py                    # Login endpoint
│   ├── conversation.py                  # Chat endpoints
│   ├── recommendations.py               # Recommendation endpoints
│   ├── chat_history.py                  # Chat history endpoints
│   └── user_profile.py                  # User profile endpoints
├── database/
│   └── mysql_db.py                      # MySQL operations
├── models/
│   ├── request_models.py                # Request schemas
│   └── response_models.py               # Response schemas
├── core/
│   ├── config.py                        # Configuration management
│   └── logger.py                        # Logging utilities
├── utils/
│   └── chat_processor.py                # Chat processing utilities
├── vectordb/
│   └── ...                              # Vector database scripts
└── venv/                                # Python virtual environment
```

## Integration with Rejara

This backend integrates with the Rejara ecosystem:

1. **Accepts Rejara JWT tokens** from Rejara Node.js backend
2. **Shares JWT keys** with Rejara backend (must match)
3. **CORS configured** for Rejara frontend
4. **Firestore integration** for user profile data

See [REJARA_INTEGRATION.md](REJARA_INTEGRATION.md) for detailed integration guide. 
