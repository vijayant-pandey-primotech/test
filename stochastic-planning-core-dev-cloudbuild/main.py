from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import recommendations, health, conversation, chat_history, user_profile, dual_login
from onboarding_recommendation import router as onboarding_router
from context import router as context_router, admin_router as context_admin_router
from context.pubsub_subscriber import start_subscriber_thread, stop_subscriber
import os


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-load config from MySQL into Redis if not already present
    try:
        from context.redis_client import get_redis
        from context.config_service import get_or_load_config
        get_or_load_config(get_redis())
    except Exception as e:
        import logging
        logging.getLogger("app").warning(f"Context config auto-load failed on startup: {e}")

    start_subscriber_thread()

    yield

    stop_subscriber()


# Create FastAPI app
app = FastAPI(title="Rejara Caregiving Recommendations API", version="1.0.0", lifespan=lifespan)

# CORS Configuration - Rejara frontend only
origins = ["*"]

# For development, allow all origins (comment out in production)
if os.getenv("ENVIRONMENT", "development") == "development":
    origins = ["*"]

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Include routers
app.include_router(recommendations.router, prefix="/api", tags=["recommendations"])
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(conversation.router, prefix="/api", tags=["conversation"])
app.include_router(chat_history.router, prefix="/api", tags=["chat-history"])
app.include_router(user_profile.router, prefix="/api", tags=["user-profile"])
app.include_router(dual_login.router, prefix="/api", tags=["auth"])
app.include_router(onboarding_router, prefix="/api", tags=["onboarding"])
app.include_router(context_router, prefix="/api", tags=["context"])
app.include_router(context_admin_router, prefix="/api", tags=["context"])

@app.get("/")
async def root():
    return {"message": "Caregiving Recommendations API"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True) 