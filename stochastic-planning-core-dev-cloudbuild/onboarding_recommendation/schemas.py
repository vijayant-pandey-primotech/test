"""
Pydantic models for Onboarding Recommendation API request/response validation.
"""
from pydantic import BaseModel, field_validator
from typing import List, Dict, Any, Optional

from .constants import VALID_PRIORITIES, PRIORITY_MEDIUM


# --- Request Models ---

class OnboardingRecommendationItem(BaseModel):
    """
    Onboarding recommendation item from Node.js.
    Supports two formats:
    - Nested: item is an activity with activityId + tasks[]
    - Flat: item is a task directly with title
    """
    title: Optional[str] = None
    taskId: Optional[int] = None
    activityId: Optional[int] = None
    activityName: Optional[str] = None
    metaData: Optional[Dict[str, Any]] = None
    description: Optional[str] = None
    tasks: Optional[List[Dict[str, Any]]] = None


class OnboardingData(BaseModel):
    """User's onboarding selections"""
    onBoard1: Optional[Dict[str, Any]] = None
    onBoard2: Optional[Dict[str, Any]] = None
    onBoard3: Optional[Dict[str, Any]] = None
    onBoard4: Optional[Dict[str, Any]] = None
    onBoard5: Optional[Dict[str, Any]] = None
    onBoardStep: int = 0

    @field_validator('onBoardStep', mode='before')
    @classmethod
    def validate_step(cls, v):
        """Ensure onBoardStep is a valid non-negative integer"""
        if v is None:
            return 0
        try:
            step = int(v)
            return max(0, step)
        except (ValueError, TypeError):
            return 0

    @field_validator('onBoard1', 'onBoard2', 'onBoard3', 'onBoard4', 'onBoard5', mode='before')
    @classmethod
    def convert_null_string(cls, v):
        """Convert 'null' string to None"""
        if v == 'null' or v == '':
            return None
        return v


class AssistantItem(BaseModel):
    """Individual assistant within a function"""
    assistantName: str
    description: Optional[str] = None
    assistantId: int


class FunctionWithAssistants(BaseModel):
    """Activity/function containing multiple assistants"""
    activityId: int
    activityName: str
    description: Optional[str] = None
    assistants: List[AssistantItem] = []


class OnboardingRecommendationRequest(BaseModel):
    """Main request model - accepts payload directly without body wrapper"""
    onboardingRecommendation: List[OnboardingRecommendationItem] = []
    onboardingData: OnboardingData
    allFunctionsWithAssistants: List[FunctionWithAssistants] = []

    @field_validator('onboardingRecommendation', mode='before')
    @classmethod
    def ensure_recommendation_list(cls, v):
        """Ensure onboardingRecommendation is always a list"""
        if v is None:
            return []
        if not isinstance(v, list):
            return [v]
        return v

    @field_validator('allFunctionsWithAssistants', mode='before')
    @classmethod
    def ensure_functions_list(cls, v):
        """Ensure allFunctionsWithAssistants is always a list"""
        if v is None:
            return []
        if not isinstance(v, list):
            return [v]
        return v


# --- Response Models ---

class RecommendedAssistant(BaseModel):
    """Individual assistant in the response"""
    assistantName: str
    assistantId: int
    reason: Optional[str] = None
    priority: str = PRIORITY_MEDIUM

    @field_validator('priority', mode='before')
    @classmethod
    def validate_priority(cls, v):
        """Validate and normalize priority value"""
        if v is None:
            return PRIORITY_MEDIUM
        v_lower = str(v).lower().strip()
        if v_lower not in VALID_PRIORITIES:
            return PRIORITY_MEDIUM
        return v_lower


class RecommendedFunction(BaseModel):
    """Function/activity with its selected assistants"""
    id: str
    activityId: int
    activityName: str
    sequence: int
    assistants: List[RecommendedAssistant] = []


class RecommendedTaskItem(BaseModel):
    """Individual task within a selected task group"""
    taskId: Optional[int] = None
    title: str
    metaData: Optional[Dict[str, Any]] = None
    description: Optional[str] = None
    taskMasterId: Optional[int] = None


class RecommendedTaskGroup(BaseModel):
    """Activity group containing selected tasks, with a unique id"""
    id: str
    activityId: Optional[int] = None
    activityName: str
    description: Optional[str] = None
    sequence: int
    tasks: List[RecommendedTaskItem] = []


class UnselectedAssistant(BaseModel):
    """Unselected assistant in the response"""
    assistantName: str
    assistantId: int
    reason: Optional[str] = None


class UnselectedFunction(BaseModel):
    """Unselected function/activity with its assistants"""
    id: str
    activityId: int
    activityName: str
    sequence: int
    assistants: List[UnselectedAssistant] = []


class UnselectedTaskItem(BaseModel):
    """Individual task within an unselected task group"""
    taskId: Optional[int] = None
    title: str
    metaData: Optional[Dict[str, Any]] = None
    description: Optional[str] = None
    taskMasterId: Optional[int] = None


class UnselectedTaskGroup(BaseModel):
    """Activity group containing unselected tasks"""
    id: str
    activityId: Optional[int] = None
    activityName: str
    description: Optional[str] = None
    sequence: int
    tasks: List[UnselectedTaskItem] = []


class OnboardingRecommendationData(BaseModel):
    """Response data structure with functions and tasks"""
    functions: List[RecommendedFunction] = []
    tasks: List[RecommendedTaskGroup] = []
    unselectedFunctions: List[UnselectedFunction] = []
    unselectedTasks: List[UnselectedTaskGroup] = []


class OnboardingRecommendationResponse(BaseModel):
    """API response model"""
    success: bool
    data: Optional[OnboardingRecommendationData] = None
    error: Optional[str] = None
    request_id: Optional[str] = None
