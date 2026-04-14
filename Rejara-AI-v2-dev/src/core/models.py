"""
Data models, enums, and structured types for the conversation system.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Any, Union

#these are the converstation state
class ConversationState(Enum):
    """Enumeration of conversation states."""
    AWAITING_QUESTION = "awaiting_question"
    AWAITING_ANSWER = "awaiting_answer" #(seed)
    POLICY = "policy" #(policy)
    DONE = "done"


class ConversationMode(Enum):
    """Enumeration of conversation modes."""
    PERSONAL = "personal"
    CLUSTER = "cluster"


class ValidationResult(Enum):
    """Enumeration of validation results."""
    ANSWERED = "answered"
    ERROR = "error"
    SKIP = "skip"
    NO = "no"
    QUESTION = "question"


@dataclass
class PolicyData:
    """Represents policy data with policy name and value."""
    policy: str
    value: Optional[str] = None


@dataclass
class QuestionData:
    """Represents question data from the database."""
    doc_id: Optional[str] = None
    chapter_id: Optional[str] = None
    item_id: Optional[str] = None
    user_story_id: Optional[int] = None
    item_name: Optional[str] = None
    context: Optional[str] = None
    policy: Optional[List[Dict]] = None
    backend_questions: Optional[str] = None
    story_id: Optional[str] = None
    story_name: Optional[str] = None
    story_type: Optional[str] = None
    chapter_name: Optional[str] = None
    sequence_order: Optional[int] = None
    next_chapter: Optional[str] = None
    next_chapter_id: Optional[str] = None
    is_last_chapter: Optional[bool] = None
    policies_question: List[Dict] = field(default_factory=list)
    function_flow: Optional[List] = None
    dynamic_function_data: Optional[Dict] = None
    
    # Cluster mode specific fields
    assistant_id: Optional[str] = None
    user_story_doc_id: Optional[str] = None
    chapter_doc_id: Optional[str] = None
    empty: bool = False


@dataclass
class SessionData:
    """Represents session data stored between conversations."""
    last_question: Optional[str] = None
    last_question_unchanged: Optional[str] = None
    invalid_count: int = 0
    repeat_policy_count: int = 0
    state: ConversationState = ConversationState.AWAITING_QUESTION
    count: int = 0
    policy_log: List[PolicyData] = field(default_factory=list)
    policy_done: int = 0
    answer_log: str = " "
    conversation_history: str = ""
    prev_question: Optional[str] = None
    chapter_id: Optional[str] = None
    chapter_name: Optional[str] = None
    main_question_response: str = ""
    assistant_id: Optional[str] = None
    full_items_details: List[Dict] = field(default_factory=list)
    questions_obj: List[Dict] = field(default_factory=list)
    collected_policy_pairs: Dict[str, List[Dict]] = field(default_factory=dict)
    collected_answers: Dict[str, str] = field(default_factory=dict)
    pending_policy_questions: List[str] = field(default_factory=list)
    affirmative_dependents: List[Dict] = field(default_factory=list)


@dataclass
class ValidationResponse:
    """Represents a validation response from LLM."""
    result: str
    reason: str = "No reason provided"
    reply: str = ""


@dataclass
class PolicyPair:
    """Represents a question-answer pair for policy tracking."""
    question: str
    answer: str


@dataclass
class UserResponseParams:
    """Parameters for user response handling."""
    user_response: str
    bearer_token: str
    uuid: str
    type: str
    user_unique_id: int
    user_story_id: Optional[int] = None
    chapter_id: Optional[str] = None
    chapter_name: Optional[str] = None
    assistant_id: Optional[str] = None
    mode: ConversationMode = ConversationMode.PERSONAL
    selected_items_details: Optional[List[Dict]] = None
    item_id: Optional[str] = None
    function_flow: Optional[List[Dict[str, Any]]] = None
    # conditions: Optional[List[Dict[str, Any]]] = None


@dataclass
class ForceSkipResult:
    """Result of force skip operation."""
    state: ConversationState
    invalid_count: int
    last_question: Optional[str]
    assistant_completed: bool


@dataclass
class ResponseToUser:
    """Response structure sent to user."""
    prev_option: List[str] = field(default_factory=lambda: ["random1", "random2"])
    question: str = ""
    bot_response: str = ""
    next_question: str = ""
    user_story_id: Optional[int] = None
    all_questions_answered: bool = False
    is_last_chapter: bool = False
    next_chapter: Optional[str] = None
    next_chapter_id: Optional[str] = None
    item_id: Optional[str] = None
    function_flow: Optional[List] = None
    dynamic_function_data: Optional[Dict] = None


@dataclass
class UpdateData:
    """Data structure for session updates."""
    last_question: Optional[str] = None
    prev_question: Optional[str] = None
    user_response: str = ""
    main_question_response: str = ""
    invalid_count: int = 0
    repeat_policy_count: int = 0
    state: ConversationState = ConversationState.AWAITING_QUESTION
    answer_log: str = " "
    policy_done: int = 0
    conversation_history: str = ""
    policy_log: List[PolicyData] = field(default_factory=list)
    function_flow: Optional[List] = None
    dynamic_function_data: Optional[Dict] = None
    questions_obj: List[Dict] = field(default_factory=list)
    full_items_details: List[Dict] = field(default_factory=list)


# Constants
MAX_INVALID_COUNT = 3
CONST_MOVE_ON_TO_NEXT_QUESTION = "🔍 Next question:"
CONST_INPUT_NOT_STORED = "⚠️ Oops, looks like we are having some difficulties with this question. No worries — you can update the information anytime."
CONST_ITEM_COMPLETION_MESSAGE = "Your response for {item_name} has been successfully recorded in organizer."

# Default phrases used in response generation
NON_FINAL_PHRASES = [
    "Moving to the next question.",
    "Let's continue.",
    "Proceeding to the next step.",
    "Moving on."
]

DEFAULT_LIKE_PHRASES_CLUSTER = [
    "✅ Your response has been recorded in the organizer.",
]

DEFAULT_LIKE_PHRASES_PERSONAL = [
    "✅ Your response has been recorded.",
    "✅ Your response has been recorded.\n\n➡️ Do you want to move to the next chapter?",
    "✅ Your response has been recorded.\n\n➡️ Do you want to move to the Assistant screen?"
]