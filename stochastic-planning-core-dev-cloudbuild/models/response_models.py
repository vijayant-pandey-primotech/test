from pydantic import BaseModel
from typing import Dict, Any, Optional

class RecommendationResponse(BaseModel):
    success: bool
    message: str
    outcomes: Optional[Dict[str, Any]] = None
    dimensions_generated: Optional[list] = None
    user_guid: Optional[str] = None

class ConversationResponse(BaseModel):
    success: bool
    classification_type: str  # "scenario_generation" or "general_conversation"
    response: str
    response_title: Optional[str] = None
    reasoning: str

class LoginResponse(BaseModel):
    success: bool
    message: str
    user_guid: Optional[str] = None
    firstName: Optional[str] = None
    access_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int = 43200  # 12 hours in seconds 