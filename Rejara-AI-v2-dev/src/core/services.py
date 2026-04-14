"""
Business logic and service calls for the conversation system.
This module handles API calls, session management, and core business operations.
"""
import json
from typing import Dict, List, Optional, Tuple, Any

from .models import (
    QuestionData, SessionData, ConversationState, ConversationMode,
    PolicyData, ValidationResponse, UserResponseParams, UpdateData
)
from .utils import clean_input, update_policy_data
from src.utils.api_helper import get_unfilled_cluster_assistant_question, get_unfilled_gather_assist_question
from src.utils.prompt_functions import generate_question
from src.middleware.function_logger import log_function_call

class QuestionService:
    """Service for handling question-related operations."""
    
    @staticmethod
    def fetch_next_question(
        mode: ConversationMode,
        assistant_id: Optional[str] = None,
        bearer_token: Optional[str] = None,
        user_story_id: Optional[int] = None,
        chapter_id: Optional[str] = None,
        next_story_doc_id: Optional[str] = None,
        user_id: Optional[int] = None,
        personalize: bool = True 
    ) -> dict:
        """
        Fetch the next question based on mode.

        Always returns a dict with keys:
            - policy: list
            - question: str or None
            - question_obj: list
            - first_question: dict or None
        """

        if mode == ConversationMode.CLUSTER:
            result = get_unfilled_cluster_assistant_question(assistant_id, bearer_token, next_story_doc_id=next_story_doc_id)

            if result.get("completed", False):
                return {
                    "policy": [],
                    "question": "All assistant items completed successfully",
                    "question_obj": [],
                    "full_question_obj": [],
                }

            questions = result.get("questions", [])
            
            if not questions:
                return {
                    "policy": [],
                    "question": "All assistant items completed successfully",
                    "question_obj": [],
                    "full_question_obj": [],
                }

            q = questions[0]
            
            item_name = q.get("itemName", "")
            context = q.get("context", "")
            default_question = q.get("backendQuestions")
            q["backendQuestions"] = default_question if default_question else generate_question(item_name, context)

            # Safe check for dynamicFunctionData
            dynamic_func_data = q.get("dynamicFunctionData")
            
            if dynamic_func_data and isinstance(dynamic_func_data, dict) and dynamic_func_data.get("success") and "result" in dynamic_func_data:
                result_list = dynamic_func_data.get("result", [])
                if isinstance(result_list, list) and len(result_list) == 1:
                    questions[0]["dynamicFunctionData"]["displayType"] = None
            # Personalize ONLY the seed question if enabled and user_id/assistant_id provided
            # Note: Policy questions are personalized on-demand when asked (not all at once) to save LLM cycles
            if personalize and user_id and assistant_id and q["backendQuestions"]:
                try:
                    from src.services.question_personalization_service import QuestionPersonalizationService
                    personalizer = QuestionPersonalizationService()
                    # Preserve original template question ONLY if not already set (first time personalization)
                    if "originalBackendQuestions" not in q:
                        q["originalBackendQuestions"] = q["backendQuestions"]
                    # Always use original template for personalization (for re-personalization scenarios)
                    original_template = q.get("originalBackendQuestions", q["backendQuestions"])
                    personalized_question = personalizer.personalize_question(
                        original_question=original_template,
                        dynamic_function_data=dynamic_func_data,
                        user_id=user_id,
                        assistant_id=assistant_id,
                        story_type= q.get("story"),
                        question_node=q
                    )
                    q["backendQuestions"] = personalized_question
                    # Policy questions are NOT personalized here - they will be personalized on-demand
                    # when each policy question is about to be asked (saves LLM cycles)

                except Exception as e:
                    # Log error but continue with original question
                    print(json.dumps({
                        "log_type": "question_service_personalization_error",
                        "error": str(e),
                        "error_type": type(e).__name__
                    }))

            try:
                policy_data = q.get("policy", [{}])
                if isinstance(policy_data, list) and len(policy_data) > 0 and isinstance(policy_data[0], dict):
                    policy = list(policy_data[0].keys())
                else:
                    policy = []
            except Exception as e:
                policy = []

            result_dict = {
                "policy": policy,
                "question": q["backendQuestions"],
                "question_obj": questions[0],
                "full_question_obj": questions,
            }
            return result_dict

        else:  # Personal mode
            questions = get_unfilled_gather_assist_question(user_story_id, bearer_token, chapter_id)

            if questions and not questions[0].get("empty", False):
                item_name = questions[0]["itemName"]
                context = questions[0]["context"]
                default_question = questions[0].get("backendQuestions")
                question = default_question if default_question else generate_question(item_name, context)

                if not question:
                    log_function_call(
                        "Your response for this chapter has been recorded. Do you want to move to the next chapter?"
                    )
                    return {
                        "policy": [],
                        "question": "Your response for this chapter has been recorded. Do you want to move to the next chapter?",
                        "question_obj": [],
                        "first_question": None,
                    }
                
                # Personalize ONLY the seed question if enabled and user_id + (chapter_id or assistant_id) provided
                # Personal mode uses chapter_id for Redis context; cluster uses assistant_id
                # Policy questions are personalized on-demand when asked (not all at once) to save LLM cycles
                if personalize and user_id and question and (chapter_id or assistant_id):
                    try:
                        from src.services.question_personalization_service import QuestionPersonalizationService
                        personalizer = QuestionPersonalizationService()
                        dynamic_func_data = questions[0].get("dynamicFunctionData")
                        # Preserve original template question ONLY if not already set (first time personalization)
                        if "originalBackendQuestions" not in questions[0]:
                            questions[0]["originalBackendQuestions"] = question
                        # Always use original template for personalization (for re-personalization scenarios)
                        original_template = questions[0].get("originalBackendQuestions", question)
                        personalized_question = personalizer.personalize_question(
                            original_question=original_template,
                            dynamic_function_data=dynamic_func_data,
                            user_id=user_id,
                            assistant_id=assistant_id if not chapter_id else None,
                            chapter_id=chapter_id,
                            story_type=questions[0].get("story"),
                            question_node=questions[0]
                        )
                        question = personalized_question
                        questions[0]["backendQuestions"] = personalized_question
                        # Policy questions are NOT personalized here - they will be personalized on-demand
                        # when each policy question is about to be asked (saves LLM cycles)
                    except Exception as e:
                        # Log error but continue with original question
                        print(json.dumps({
                            "log_type": "question_service_personalization_error",
                            "error": str(e),
                            "error_type": type(e).__name__
                        }))
                
                try:
                    policy = list(questions[0]["policy"][0].keys())
                except Exception:
                    policy = []

                return {
                    "policy": policy,
                    "question": question,
                    "question_obj": questions,
                    "first_question": questions[0],
                }

            else:
                log_function_call(
                    "Your response for this chapter has been recorded. Do you want to move to the next chapter? "
                    f"No unfilled personal questions found for userStoryId: {user_story_id}"
                )
                return {
                    "policy": [],
                    "question": "Your response for this chapter has been recorded. Do you want to move to the next chapter?",
                    "question_obj": [],
                    "first_question": None,
                }



class ValidationService:
    """Service for handling user response validation."""
    
    @staticmethod
    def validate_user_response(question: str, answer: str, caregiver_name: str | None = None) -> ValidationResponse:
        """
        Validate user response using LLM.
        
        Args:
            question: The question asked
            answer: User's response
            
        Returns:
            ValidationResponse object
        """
        from src.utils.prompt_functions import validate_user_response
        
        raw_result = validate_user_response(question, clean_input(answer), caregiver_name=caregiver_name)
        
        if isinstance(raw_result, str):
            return ValidationResponse(
                result=raw_result,
                reason="No reason provided",
                reply=""
            )
        else:
            result = str(raw_result.output)
            if result.lower() == "yes":
                result = "answered"
            return ValidationResponse(
                result=result,
                reason=str(raw_result.reason),
                reply=f"{str(raw_result.reply)} "
            )
    
    @staticmethod
    def validate_multiple_user_response(question: str, answer: str, context_info, story_type: str, caregiver_name: str | None = None) -> Dict[str, Any]:
        """
        Validate multiple user responses.
        
        Args:
            question: The question asked
            answer: User's response
            
        Returns:
            Dictionary with validation results
        """
        from src.utils.prompt_functions import validate_multiple_user_response
        
        return validate_multiple_user_response(question, clean_input(answer), context_info, story_type, caregiver_name=caregiver_name)


class SessionService:
    """Service for handling session management."""
    
    @staticmethod
    def get_session_data(
        uuid: str,
        user_unique_id: int,
        user_response: str,
        mode: ConversationMode,
        assistant_id: Optional[str] = None,
        user_story_id: Optional[int] = None,
        chapter_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get session data based on mode.
        
        Args:
            uuid: Session UUID
            user_unique_id: User unique ID
            user_response: User's response
            mode: Conversation mode
            assistant_id: Assistant ID for cluster mode
            user_story_id: User story ID for personal mode
            chapter_id: Chapter ID for personal mode
            
        Returns:
            Session data dictionary
        """
        from src.services.google_service import get_cluster_session, get_gather_assist_session
        
        if mode == ConversationMode.CLUSTER:
            return get_cluster_session(uuid, user_unique_id, user_response, assistant_id)
        else:
            return get_gather_assist_session(uuid, user_story_id, user_unique_id, user_response, chapter_id)
    
    @staticmethod
    def update_session_data(
        uuid: str,
        mode: ConversationMode,
        update_data: Dict[str, Any],
        assistant_id: Optional[str] = None,
        chapter_id: Optional[str] = None
    ) -> None:
        """
        Update session data based on mode.
        
        Args:
            uuid: Session UUID
            mode: Conversation mode
            update_data: Data to update
            assistant_id: Assistant ID for cluster mode
            chapter_id: Chapter ID for personal mode
        """
        from src.services.google_service import update_cluster_session, update_gather_assist_session
        
        if mode == ConversationMode.CLUSTER:
            update_cluster_session(uuid, assistant_id, update_data)
        else:
            update_gather_assist_session(uuid, chapter_id, update_data)


class DatabaseService:
    """Service for handling database operations."""
    
    @staticmethod
    def update_database(
        mode: ConversationMode,
        summary: str,
        assistant_id: Optional[str] = None,
        bearer_token: Optional[str] = None,
        item_id: Optional[str] = None,
        user_story_id: Optional[int] = None,
        chapter_id: Optional[str] = None,
        additional_data: str = "",
        unique_item_id: Optional[int] = None,
        is_loop:Optional[bool] = None,
        user_story_doc_id:Optional[str] = None,
        chapter_doc_id:Optional[str] = None,
        existing_item: Optional[bool] = None,
        unFilledPolicies: Optional[List[Dict]] = None
    ) -> Any:
        """
        Update database based on mode.
        
        Args:
            mode: Conversation mode
            summary: Summary to save
            assistant_id: Assistant ID for cluster mode
            bearer_token: Authorization token
            item_id: Item ID
            user_story_id: User story ID for personal mode
            chapter_id: Chapter ID for personal mode
            additional_data: Additional data to save
            unique_item_id: Unique item ID for cloned items
            is_loop: Whether this is a loop item
            user_story_doc_id: User story document ID
            chapter_doc_id: Chapter document ID
            existing_item: Whether this is an existing item
            unFilledPolicies: Optional list of policy information with tag, question, and isAnswered
            
        Returns:
            Update result
        """
        from src.utils.api_helper import (
            update_cluster_assistant_data_to_database,
            update_gather_assist_data_to_database
        )
        
        if mode == ConversationMode.CLUSTER:
            return update_cluster_assistant_data_to_database(
                summary, assistant_id, bearer_token, item_id, 
                uniqueItemId=unique_item_id, isLoop=is_loop, 
                user_story_doc_id=user_story_doc_id, chapter_doc_id=chapter_doc_id, 
                existing_item=existing_item, unFilledPolicies=unFilledPolicies
            )
        else:
            return update_gather_assist_data_to_database(
                summary, user_story_id, bearer_token, additional_data, chapter_id,
                unFilledPolicies=unFilledPolicies
            )
    
    @staticmethod
    def update_bulk_database(
        user_response: Dict[str, str],
        selected_items_details: List[Dict],
        assistant_id: str,
        bearer_token: str,
        item_id: str,
        unFilledPolicies: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Update database with bulk data for cluster mode.
        
        Args:
            user_response: Dictionary of user responses
            selected_items_details: List of item details
            assistant_id: Assistant ID
            bearer_token: Authorization token
            item_id: Item ID
            unFilledPolicies: Optional list of policy information with tag, question, and isAnswered
            
        Returns:
            Update result
        """
        from src.utils.api_helper import update_bulk_cluster_assistant_data_to_database
        
        return update_bulk_cluster_assistant_data_to_database(
            user_response, selected_items_details, assistant_id, bearer_token, item_id,
            unFilledPolicies=unFilledPolicies
        )


class LoggingService:
    """Service for handling logging operations."""
    
    @staticmethod
    def log_user_bot_exchange(
        mode: ConversationMode,
        user_unique_id: int,
        story_data: Dict[str, Any],
        # ai_message: str,
        ai_message: Any,
        user_message: str,
        rephrase_text: str = "-",
        selected_items_details: Optional[List[Dict]] = None
    ) -> None:
        """
        Log user-bot exchange based on mode.
        
        Args:
            mode: Conversation mode
            user_unique_id: User unique ID
            story_data: Story data dictionary
            ai_message: AI message
            user_message: User message
            rephrase_text: Rephrased text
            selected_items_details: Selected items details
        """
        from src.services.google_service import save_cluster_logs, save_gather_assist_recent_logs
        
        if mode == ConversationMode.CLUSTER:
            save_cluster_logs(
                user_id=user_unique_id,
                story_data=story_data,
                ai_message=ai_message,
                user_message=user_message,
                rephrase_text=rephrase_text,
                selected_items_details=selected_items_details
            )
        else:
            save_gather_assist_recent_logs(
                user_id=user_unique_id,
                story_data=story_data,
                ai_message=ai_message,
                user_message=user_message,
                rephrase_text=rephrase_text
            )


class PolicyService:
    """Service for handling policy-related operations."""
    
    @staticmethod
    def get_policy_topic(questions: List[Dict[str, Any]], mode: ConversationMode) -> List[str]:
        """
        Extract policy topics from questions based on mode.
        
        Args:
            questions: List of questions
            mode: Conversation mode
            delete-user
        Returns:
            List of policy topics
        """
        if not questions:
            return []
            
        if mode == ConversationMode.CLUSTER:
            policies = questions[0].get("policiesQuestion") or []
            return [item['policy'] for item in policies if item and 'policy' in item]
        else:
            return [item['policy'] for item in questions[0].get("policiesQuestion", [])]
    
    @staticmethod
    def initialize_policy_data(policy_topic: List[str], policy_specific_data: Any) -> List[PolicyData]:
        """
        Initialize policy data structure.
        
        Args:
            policy_topic: List of policy topics
            policy_specific_data: Existing policy data
            
        Returns:
            List of PolicyData objects
        """
        if (policy_specific_data == {} or 
            policy_specific_data == [] or 
            (isinstance(policy_specific_data, list) and 
             len(policy_specific_data) > 0 and 
             policy_specific_data[0] == 'documentLocation')):
            return [PolicyData(policy=p, value=None) for p in policy_topic]
        
        # Convert existing data to PolicyData objects if needed
        if isinstance(policy_specific_data, list):
            return [
                PolicyData(policy=item.get('policy', ''), value=item.get('value'))
                if isinstance(item, dict)
                else PolicyData(policy=str(item), value=None)
                for item in policy_specific_data
            ]
        
        return policy_specific_data
    
    @staticmethod
    def build_policy_info_for_personal(
        policy_qs: List[Dict] = None,  # Kept for backwards compatibility but not used
        policy_specific_data: List[PolicyData] = None,  # Kept for backwards compatibility but not used
        user_id: Optional[int] = None,
        assistant_id: Optional[str] = None,
        chapter_id: Optional[str] = None,
        use_optimized_context: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Build policy information array for personal mode from optimized Redis context.

        Personal mode uses (user_id, chapter_id) for Redis key; assistant_id is for cluster fallback.

        Args:
            policy_qs: Deprecated - kept for backwards compatibility
            policy_specific_data: Deprecated - kept for backwards compatibility
            user_id: User identifier (required)
            assistant_id: Assistant identifier (cluster/legacy - use chapter_id for personal)
            chapter_id: Chapter identifier (personal mode - preferred for personal context)
            use_optimized_context: Must be True (ignored, always uses optimized context)

        Returns:
            List of policy info dictionaries with tag, question, isAnswered, and policyAnswer
        """
        if not user_id:
            print("Warning: user_id required for optimized context")
            return []

        try:
            if chapter_id:
                from src.services.assistant_context_service import build_policy_info_from_personal_context
                policy_info = build_policy_info_from_personal_context(user_id, chapter_id)
            elif assistant_id:
                from src.services.assistant_context_service import build_policy_info_from_context
                policy_info = build_policy_info_from_context(user_id, assistant_id)
            else:
                print("Warning: chapter_id or assistant_id required for optimized context")
                return []
            return policy_info
        except Exception as e:
            print(f"Error: Failed to build policy info from optimized context: {e}")
            return []
    
    @staticmethod
    def build_policy_info_for_cluster(
        policy_qs: List[Dict] = None,  # Kept for backwards compatibility but not used
        collected_pairs_dependent: Dict[str, List[Dict]] = None,  # Kept for backwards compatibility but not used
        question_obj: Optional[Dict] = None,  # Kept for backwards compatibility but not used
        user_id: Optional[int] = None,
        assistant_id: Optional[str] = None,
        use_optimized_context: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Build policy information array for cluster mode from optimized Redis context.

        Args:
            policy_qs: Deprecated - kept for backwards compatibility
            collected_pairs_dependent: Deprecated - kept for backwards compatibility
            question_obj: Deprecated - kept for backwards compatibility
            user_id: User identifier (required)
            assistant_id: Assistant identifier (required)
            use_optimized_context: Must be True (ignored, always uses optimized context)

        Returns:
            List of policy info dictionaries with tag, question, isAnswered, and policyAnswer
        """
        # ONLY use optimized Redis context format
        if not user_id or not assistant_id:
            print("Warning: user_id and assistant_id required for optimized context")
            return []

        try:
            from src.services.assistant_context_service import build_policy_info_from_context
            policy_info = build_policy_info_from_context(user_id, assistant_id)
            return policy_info
        except Exception as e:
            print(f"Error: Failed to build policy info from optimized context: {e}")
            return []


class SummaryService:
    """Service for handling summary generation."""
    
    @staticmethod
    def generate_summary(
        conversation_history: str,
        item_name: str = "",
        mode: ConversationMode = ConversationMode.PERSONAL,
        exclude_list: list = [],
        summary_for_person: str = "",
        extra_info: list = None
    ) -> str:
        """
        Generate summary from conversation history.

        Args:
            conversation_history: The conversation to summarize
            item_name: Item name for context
            mode: Conversation mode
            exclude_list: List of items to exclude
            summary_for_person: If provided, generates person-specific summary (for cluster mode)
            extra_info: Optional. If None, no additional context is passed to the summary.

        Returns:
            Generated summary
        """
        from src.utils.prompt_functions import summary_generation, preprocess_features

        if extra_info is None:
            extra_info = []

        try:
            summary = summary_generation(conversation_history, item_name, exclude_list, summary_for_person, extra_info)
            
            # Defensive check: ensure summary is not None or empty
            if summary is None:
                summary = f"- Information about {item_name}" if item_name else "- User provided information"
            elif not isinstance(summary, str):
                summary = str(summary) if summary else (f"- Information about {item_name}" if item_name else "- User provided information")
            
            if mode == ConversationMode.PERSONAL:
                # Apply preprocessing for personal mode
                return preprocess_features(summary)
            return summary
        except Exception as e:
            # Return a safe fallback summary
            fallback_summary = f"- Information about {item_name}" if item_name else "- User provided information"
            return fallback_summary
    
    @staticmethod
    def generate_bullet_summary(conversation_history: str) -> str:
        """
        Generate bullet point summary from conversation history.
        
        Args:
            conversation_history: The conversation to summarize
            
        Returns:
            Bullet point summary
        """
        from src.utils.prompt_functions import summary_generation
        summaries = summary_generation(conversation_history).strip()
        return "\n".join(line.strip() for line in summaries.split("\n") if line.strip())