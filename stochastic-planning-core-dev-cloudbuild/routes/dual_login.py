from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.login import login_user
from services.firestore_service import firestore_service
from services.dual_jwt_service import dual_jwt_service
from models.response_models import LoginResponse
from core.logger import log_info, log_error

router = APIRouter()

class LoginRequest(BaseModel):
    email: str
    password: str
    user_guid: Optional[str] = None

@router.post("/login", response_model=LoginResponse)
async def rejara_login(request: LoginRequest):
    """
    Rejara login endpoint
    Returns double-encrypted JWT tokens (HS512 + AES-256-CBC)
    """
    try:
        log_info(f"Rejara login attempt for email: {request.email}")

        # Validate input
        if not request.email or not request.password:
            raise HTTPException(status_code=400, detail="Email and password are required")

        # Attempt login using the existing login service
        login_result = await login_user(request.email, request.password)

        if login_result["success"]:
            log_info(f"Login successful for: {request.email}")

            user_guid = None

            # Check if user provided a user_guid and if profile data exists
            if request.user_guid:
                log_info(f"Checking for existing profile data with user_guid: {request.user_guid}")
                existing_profile = await firestore_service._check_existing_profile(request.user_guid)
                if existing_profile:
                    user_guid = request.user_guid
                else:
                    log_info(f"No existing profile found for user_guid: {request.user_guid}")

            # If no existing profile, fetch from Firestore
            if not user_guid:
                try:
                    user_id = str(login_result["userId"])
                    log_info(f"Attempting to fetch profile from Firestore for user_id: {user_id}")
                    firestore_result = await firestore_service.build_profile_info(user_id)
                    if firestore_result and isinstance(firestore_result, dict):
                        user_guid = firestore_result.get("user_guid")
                except Exception as e:
                    log_error(f"Firestore profile fetch failed (non-critical): {str(e)}")

            # Prepare payload for token generation
            token_payload = {
                "id": login_result["userId"],
                "email": request.email,
                "userName": login_result["firstName"],
                "firstName": login_result["firstName"],
                "user_guid": user_guid
            }

            # Generate Rejara-style double-encrypted tokens
            refresh_token, access_token = dual_jwt_service.create_rejara_tokens(token_payload)

            log_info(f"Generated Rejara tokens for: {request.email}")

            # If user has no context in Redis yet, trigger a background recompute.
            # Handles new users whose signup event was never published to Pub/Sub.
            if user_guid:
                try:
                    import asyncio
                    from context.redis_client import get_redis
                    from context.builder_service import recompute_all_scopes
                    from context.firestore_client import get_db

                    redis = get_redis()
                    existing_keys = redis.keys(f"context:user:{login_result['userId']}:scope:*")
                    if not existing_keys:
                        log_info(f"No context found for user {login_result['userId']} — triggering background recompute")
                        asyncio.create_task(
                            asyncio.to_thread(recompute_all_scopes, str(login_result["userId"]), redis, get_db())
                        )
                    else:
                        log_info(f"Context already exists for user {login_result['userId']} ({len(existing_keys)} scopes) — skipping recompute")
                except Exception as e:
                    log_error(f"Background context recompute check failed (non-critical): {e}")

            return LoginResponse(
                success=True,
                message="Login successful",
                user_guid=user_guid,
                firstName=login_result["firstName"],
                access_token=refresh_token,  # 24-hour refresh token
                token_type="bearer",
                expires_in=86400,  # 24 hours in seconds
                refresh_token=access_token  # 30-minute access token
            )
        else:
            log_error(f"Login failed for: {request.email}")
            return LoginResponse(
                success=False,
                message="Invalid email or password",
                firstName=None
            )

    except Exception as e:
        log_error(f"Error during login: {e}")
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")
