"""
Main orchestration handlers for the conversation system.
This module routes between different conversation modes and handles the main flow.
"""

from typing import Dict, Any, Optional, List
from .models import ConversationMode, UserResponseParams
from .services import SessionService
from .personal_handler import PersonalModeHandler
from .cluster_handler import ClusterModeHandler


class ResponseHandler:
    """
    Main handler that orchestrates the conversation flow.
    Routes between personal and cluster modes based on the request parameters.
    """
    
    def __init__(self):
        self.session_service = SessionService()
        self.personal_handler = PersonalModeHandler()
        self.cluster_handler = ClusterModeHandler()
    
    def handle_user_response(
        self,
        user_response: str,
        bearer_token: str,
        uuid: str,
        type: str,
        user_unique_id: int,
        user_story_id: Optional[int] = None,
        chapter_id: Optional[str] = None,
        chapter_name: Optional[str] = None,
        assistant_id: Optional[str] = None,
        mode: str = "personal",
        selected_items_details: Optional[list] = None,
        item_id: Optional[str] = None,
        function_flow: Optional[List[Dict[str, Any]]] = None,
        # conditions: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Main entry point for handling user responses.
        Routes to appropriate handler based on conversation mode.
        
        Args:
            user_response: The user's response text
            bearer_token: Authorization token for API calls
            uuid: Session UUID for tracking
            type: Type of conversation (story, assistant, etc.)
            user_unique_id: Unique identifier for the user
            user_story_id: User story ID (for personal mode)
            chapter_id: Chapter ID (for personal mode)
            chapter_name: Chapter name (for personal mode)
            assistant_id: Assistant ID (for cluster mode)
            mode: Conversation mode ("personal" or "cluster")
            selected_items_details: Selected items for cluster mode
            item_id: Current item ID
            
        Returns:
            Dictionary containing the response for the user
        """
        # Validate and convert mode
        try:
            conversation_mode = ConversationMode(mode.lower())
        except ValueError:
            conversation_mode = ConversationMode.PERSONAL
        
        # Create parameters object
        params = UserResponseParams(
            user_response=user_response,
            bearer_token=bearer_token,
            uuid=uuid,
            type=type,
            user_unique_id=user_unique_id,
            user_story_id=user_story_id,
            chapter_id=chapter_id,
            chapter_name=chapter_name,
            assistant_id=assistant_id,
            mode=conversation_mode,
            selected_items_details=selected_items_details,
            item_id=item_id,
            function_flow = function_flow,
            # conditions = conditions,
        )
        
        try:
            # Get current session data
            session_data = self.session_service.get_session_data(
                uuid=uuid,
                user_unique_id=user_unique_id,
                user_response=user_response,
                mode=conversation_mode,
                assistant_id=assistant_id,
                user_story_id=user_story_id,
                chapter_id=chapter_id
            )
            
            # Route to appropriate handler based on mode
            if conversation_mode == ConversationMode.CLUSTER:
                return self.cluster_handler.handle_response(params, session_data)
            else:
                return self.personal_handler.handle_response(params, session_data)
                
        except Exception as e:
            # Error handling - return a safe response
            import traceback
            traceback.print_exc()
            return {
                "status": "error",
                "message": f"An error occurred while processing your request: {str(e)}",
                "prev_option": ["random1", "random2"],
                "question": "I apologize, but there was an issue processing your request. Please try again."
            }
    
    def get_conversation_status(
        self,
        uuid: str,
        mode: str = "personal",
        assistant_id: Optional[str] = None,
        chapter_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get the current status of a conversation session.
        
        Args:
            uuid: Session UUID
            mode: Conversation mode
            assistant_id: Assistant ID for cluster mode
            chapter_id: Chapter ID for personal mode
            
        Returns:
            Dictionary containing session status information
        """
        try:
            conversation_mode = ConversationMode(mode.lower())
        except ValueError:
            conversation_mode = ConversationMode.PERSONAL
        
        try:
            # Get session data without triggering updates
            session_data = self.session_service.get_session_data(
                uuid=uuid,
                user_unique_id=0,  # Dummy value for status check
                user_response="",  # Empty for status check
                mode=conversation_mode,
                assistant_id=assistant_id,
                chapter_id=chapter_id
            )
            
            return {
                "status": "success",
                "session_data": {
                    "state": session_data.get("state", "awaiting_question"),
                    "last_question": session_data.get("last_question"),
                    "invalid_count": session_data.get("invalid_count", 0),
                    "conversation_active": session_data.get("state") not in ["done", "completed"]
                }
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Could not retrieve session status: {str(e)}"
            }
    
    def reset_conversation(
        self,
        uuid: str,
        mode: str = "personal",
        assistant_id: Optional[str] = None,
        chapter_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Reset a conversation session to start over.
        
        Args:
            uuid: Session UUID
            mode: Conversation mode
            assistant_id: Assistant ID for cluster mode
            chapter_id: Chapter ID for personal mode
            
        Returns:
            Dictionary indicating success or failure
        """
        try:
            conversation_mode = ConversationMode(mode.lower())
        except ValueError:
            conversation_mode = ConversationMode.PERSONAL
        
        try:
            # Reset session data
            reset_data = {
                "state": "awaiting_question",
                "last_question": None,
                "invalid_count": 0,
                "conversation_history": "",
                "policy_log": [],
                "collected_answers": {},
                "pending_policy_questions": [],
                "full_items_details": [],
                "affirmative_dependents": [],
                "collected_policy_pairs": {},
                "extra_info": {}
            }
            
            self.session_service.update_session_data(
                uuid=uuid,
                mode=conversation_mode,
                update_data=reset_data,
                assistant_id=assistant_id,
                chapter_id=chapter_id
            )
            
            return {
                "status": "success",
                "message": "Conversation reset successfully"
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Could not reset conversation: {str(e)}"
            }


class ConversationOrchestrator:
    """
    Higher-level orchestrator for managing multiple conversation sessions.
    Provides utilities for session management and conversation coordination.
    """
    
    def __init__(self):
        self.response_handler = ResponseHandler()
    
    def process_user_input(
        self,
        user_input: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Process user input with validation and routing.
        
        Args:
            user_input: Dictionary containing all user input parameters
            
        Returns:
            Processed response dictionary
        """
        # Validate required parameters
        required_params = ['user_response', 'bearer_token', 'uuid', 'type', 'user_unique_id']
        missing_params = [param for param in required_params if param not in user_input]
        
        if missing_params:
            return {
                "status": "error",
                "message": f"Missing required parameters: {', '.join(missing_params)}"
            }
        
        # Extract and validate parameters
        mode = user_input.get('mode', 'personal')
        if mode not in ['personal', 'cluster']:
            mode = 'personal'
        
        # Route to main handler
        return self.response_handler.handle_user_response(
            user_response=user_input['user_response'],
            bearer_token=user_input['bearer_token'],
            uuid=user_input['uuid'],
            type=user_input['type'],
            user_unique_id=user_input['user_unique_id'],
            user_story_id=user_input.get('user_story_id'),
            chapter_id=user_input.get('chapter_id'),
            chapter_name=user_input.get('chapter_name'),
            assistant_id=user_input.get('assistant_id'),
            mode=mode,
            selected_items_details=user_input.get('selected_items_details'),
            item_id=user_input.get('item_id')
        )
    
    def batch_process_conversations(
        self,
        conversation_requests: list[Dict[str, Any]]
    ) -> list[Dict[str, Any]]:
        """
        Process multiple conversation requests in batch.
        
        Args:
            conversation_requests: List of conversation request dictionaries
            
        Returns:
            List of response dictionaries
        """
        results = []
        for request in conversation_requests:
            try:
                result = self.process_user_input(request)
                results.append(result)
            except Exception as e:
                results.append({
                    "status": "error",
                    "message": f"Batch processing error: {str(e)}",
                    "request_id": request.get('uuid', 'unknown')
                })
        
        return results
    
    def get_active_sessions(
        self,
        user_unique_id: int,
        mode: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get information about active sessions for a user.
        
        Args:
            user_unique_id: User's unique identifier
            mode: Optional mode filter
            
        Returns:
            Dictionary containing active session information
        """
        # This would require additional session tracking infrastructure
        # For now, return a placeholder structure
        return {
            "status": "success",
            "active_sessions": [],
            "message": "Session tracking not fully implemented in current refactor"
        }


# Factory function for creating handlers
def create_response_handler() -> ResponseHandler:
    """
    Factory function to create a new ResponseHandler instance.
    
    Returns:
        New ResponseHandler instance
    """
    return ResponseHandler()


# Factory function for creating orchestrators  
def create_conversation_orchestrator() -> ConversationOrchestrator:
    """
    Factory function to create a new ConversationOrchestrator instance.
    
    Returns:
        New ConversationOrchestrator instance
    """
    return ConversationOrchestrator()