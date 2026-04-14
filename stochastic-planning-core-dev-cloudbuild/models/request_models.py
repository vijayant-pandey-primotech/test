from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class RecommendationRequest(BaseModel):
    scenario: str
    latest_user_input: Optional[str] = None
    profile_info: Optional[str] = None

class ConversationRequest(BaseModel):
    user_guid: Optional[str] = None
    user_input: str
    chat_history: List[Dict[str, Any]] 