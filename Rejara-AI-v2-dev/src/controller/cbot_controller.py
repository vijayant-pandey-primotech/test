"""
Refactored cbot_controller.py - Entry Point Only
All business logic has been moved to src/core/ modules for better maintainability.
"""

from typing import Optional, List, Dict, Any
from src.core.handlers import ResponseHandler


def handle_user_response(
    user_response: str,
    bearer_token: str,
    uuid: str,
    type: str,
    user_unique_id: int,
    userStoryId: Optional[int] = None,
    chapterId: Optional[str] = None,
    chapterName: Optional[str] = None,
    assistantId: Optional[str] = None,
    mode: str = "personal",
    selected_items_details: Optional[list] = None,
    itemId: Optional[str] = None,
    function_flow: Optional[List[Dict[str, Any]]] = None,
    # conditions: Optional[List[Dict[str, Any]]] = None,
) -> dict:
    """
    Main entry point for handling user responses.
    Delegates to the ResponseHandler for actual processing.
    
    Args:
        user_response: User's response text
        bearer_token: Authorization token for API calls
        uuid: Session UUID
        type: Conversation type
        user_unique_id: User's unique identifier
        userStoryId: User story ID (for personal mode)
        chapterId: Chapter ID (for personal mode)
        chapterName: Chapter name (for personal mode)
        assistantId: Assistant ID (for cluster mode)
        mode: Conversation mode ("personal" or "cluster")
        selected_items_details: Selected items for cluster mode
        itemId: Current item ID
        
    Returns:
        dict: Response dictionary for the user
    """
    handler = ResponseHandler()
    return handler.handle_user_response(
        user_response=user_response,
        bearer_token=bearer_token,
        uuid=uuid,
        type=type,
        user_unique_id=user_unique_id,
        user_story_id=userStoryId,
        chapter_id=chapterId,
        chapter_name=chapterName,
        assistant_id=assistantId,
        mode=mode,
        selected_items_details=selected_items_details,
        item_id=itemId,
        function_flow=function_flow,
        # conditions = conditions,
    )


# Legacy function aliases for backwards compatibility
# These maintain the original function signatures while delegating to the new system

def extract_keys(data):
    """Legacy function - moved to src/core/utils.py"""
    from src.core.utils import extract_keys as new_extract_keys
    return new_extract_keys(data)


def clean_input(text: str) -> str:
    """Legacy function - moved to src/core/utils.py"""
    from src.core.utils import clean_input as new_clean_input
    return new_clean_input(text)


def update_policy_data(new_q: str, user_response: str, all_policies: list, current_policy_data: list, current_policy: str) -> list:
    """Legacy function - moved to src/core/utils.py"""
    from src.core.utils import update_policy_data as new_update_policy_data
    from src.core.models import PolicyData
    
    # Convert old format to new format
    policy_data_objects = [PolicyData(policy=item['policy'], value=item.get('value')) for item in current_policy_data]
    
    # Call new function
    updated_objects = new_update_policy_data(new_q, user_response, all_policies, policy_data_objects, current_policy)
    
    # Convert back to old format
    return [{'policy': obj.policy, 'value': obj.value} for obj in updated_objects]