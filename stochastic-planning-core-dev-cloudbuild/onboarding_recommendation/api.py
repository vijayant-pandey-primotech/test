"""
FastAPI router for Onboarding Recommendation endpoints.
Thin API layer delegating to service.
"""
import uuid
from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any

from core.logger import log_info, log_error, user_guid_context
from middleware.rejara_auth_middleware import get_current_user
from .schemas import OnboardingRecommendationRequest, OnboardingRecommendationResponse
from .service import OnboardingRecommendationService

router = APIRouter()


@router.post(
    "/v1/onboarding/recommendation",
    response_model=OnboardingRecommendationResponse,
    summary="Generate onboarding recommendation",
    description="Creates personalized onboarding plan with relevant functions, assistants, and tasks"
)
async def get_onboarding_recommendation(
    request: OnboardingRecommendationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Generate personalized onboarding plan based on user data.

    This endpoint:
    1. Receives tasks, onboarding data, and available functions with assistants
    2. Analyzes user profile (care receivers, pets, real estate, vehicles)
    3. Uses OpenAI GPT-4o-mini to select relevant functions and assistants
    4. Returns sequenced functions with relevant assistants and tasks
    """
    request_id = str(uuid.uuid4())

    # Set user context for logging
    user_guid = current_user.get('user_guid')
    if user_guid:
        user_guid_context.set(user_guid)

    log_info(f"[{request_id}] Received onboarding recommendation request from user: {user_guid}")
    log_info(f"[{request_id}] Onboarding step: {request.onboardingData.onBoardStep}")
    log_info(f"[{request_id}] Tasks: {len(request.onboardingRecommendation)}, Functions: {len(request.allFunctionsWithAssistants)}")

    try:
        # Initialize service
        service = OnboardingRecommendationService()

        # Generate recommendation
        success, data, error = await service.generate_recommendation(request, request_id)

        if success and data:
            log_info(f"[{request_id}] Successfully generated recommendation with {len(data.functions)} functions and {len(data.tasks)} tasks")
            return OnboardingRecommendationResponse(
                success=True,
                data=data,
                request_id=request_id
            )
        else:
            log_error(f"[{request_id}] Failed to generate recommendation: {error}")
            return OnboardingRecommendationResponse(
                success=False,
                error=error or "Unknown error occurred",
                request_id=request_id
            )

    except HTTPException:
        raise
    except Exception as e:
        log_error(f"[{request_id}] Unexpected error in onboarding recommendation: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )
