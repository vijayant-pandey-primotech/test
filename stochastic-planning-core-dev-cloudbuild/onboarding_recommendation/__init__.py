"""
Onboarding Recommendation Module

This module provides personalized onboarding plans based on user data.
It receives tasks, onboarding data, and available functions with assistants,
then uses LLM to select relevant functions and assistants.

Usage:
    from onboarding_recommendation import router

    # In main.py:
    app.include_router(router, prefix="/api", tags=["onboarding"])
"""

from .api import router
from .service import OnboardingRecommendationService
from .schemas import (
    OnboardingRecommendationRequest,
    OnboardingRecommendationResponse,
    OnboardingRecommendationData,
    RecommendedFunction,
    RecommendedAssistant,
    RecommendedTaskItem,
    RecommendedTaskGroup,
)

__all__ = [
    'router',
    'OnboardingRecommendationService',
    'OnboardingRecommendationRequest',
    'OnboardingRecommendationResponse',
    'OnboardingRecommendationData',
    'RecommendedFunction',
    'RecommendedAssistant',
    'RecommendedTaskItem',
    'RecommendedTaskGroup',
]
