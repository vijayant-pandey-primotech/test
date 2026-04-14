"""
Cluster mode handler for multi-dependent conversations.
Handles the flow for cluster mode conversations where users answer questions for multiple dependents.

"""

from typing import Dict, Any, List, Optional
from .models import (
    ConversationState, ConversationMode, UserResponseParams, 
    ResponseToUser, PolicyData, MAX_INVALID_COUNT, CONST_MOVE_ON_TO_NEXT_QUESTION, 
    CONST_INPUT_NOT_STORED, CONST_ITEM_COMPLETION_MESSAGE
)
from .services import (
    QuestionService, ValidationService, SessionService,
    DatabaseService, LoggingService, PolicyService, SummaryService,
)
from .utils import clean_input, insert_placeholder_values, safe_get_item_context, format_dependents_note, split_user_response, is_key_value_format, is_scoped_question, setup_all_users, personlize_question_for_error_question_case
from src.utils.prompt_functions import parse_free_text_response, policy_boolean_extraction, extract_item_name_from_response, query_resolver, extract_policy_answers_cluster_mode_v2, extract_compound_sentence, extract_data_by_user
from src.core.utils import build_selected_items_context
from src.utils.api_helper import get_unfilled_cluster_assistant_question, clone_new_item_through_assistant, save_seed_question_to_redis, save_policy_answer_to_redis
from src.utils.prompt_functions import generate_question
from uuid import uuid4
import json
import time
import os
import logging
from src.services.redis_service import redis_client
from src.services.google_service import check_item_existance
from src.services.assistant_context_service import (
    log_redis_warning,
    # Optimized format functions (v2 format - used for both storage and retrieval)
    get_optimized_context,
    get_conversation_as_text_from_optimized,
    clear_optimized_context,
    initialize_optimized_context
)

# Simple in-memory cache as Redis fallback
_memory_cache = {}

# Redis-like class for in-memory fallback
class InMemoryRedis:
    def __init__(self):
        self.data = _memory_cache  # global memory store (dict)

    # ---------------------------
    # HASH SET (like redis HSET)
    # ---------------------------
    def hset(self, redis_user_key, field, value):
        # If this user does not have a hash yet, create it
        if redis_user_key not in self.data:
            self.data[redis_user_key] = {}

        # Set data under hash
        self.data[redis_user_key][field] = value
        return True

    # ---------------------------
    # HASH GET (like redis HGET)
    # ---------------------------
    def hget(self, redis_user_key, field):
        # Return the user hash value
        return self.data.get(redis_user_key, {}).get(field)

    # ---------------------------
    # HASH GET ALL FIELDS (optional)
    # ---------------------------
    def hgetall(self, redis_user_key):
        return self.data.get(redis_user_key, {})

    # Legacy simple set (optional)
    def set(self, key, value, ex=None):
        self.data[key] = value
        return True

    # Legacy simple get (optional)
    def get(self, key):
        return self.data.get(key)

    def ping(self):
        return True

    
   
class ClusterModeHandler:
    """Handles cluster mode conversation logic."""
    
    def __init__(self):
        self.question_service = QuestionService()
        self.validation_service = ValidationService()
        self.session_service = SessionService()
        self.database_service = DatabaseService()
        self.logging_service = LoggingService()
        self.policy_service = PolicyService()
        self.summary_service = SummaryService()
        self.redis_memory = InMemoryRedis()

    def handle_response(self, params: UserResponseParams, session_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle cluster mode user response.
        
        Args:
            params: User response parameters
            session_data: Current session data
            
        Returns:
            Response dictionary for the user
        """
        # Load full conversation history from Redis v2 optimized format for context-aware responses
        if params.assistant_id and params.user_unique_id:
            try:
                # Use v2 optimized format (same format used for storage)
                optimized_context = get_optimized_context(params.user_unique_id, params.assistant_id)
                # Add full conversation to session_data for use in bot response generation
                session_data["full_conversation_history"] = optimized_context if optimized_context else {}
                session_data["full_conversation_text"] = get_conversation_as_text_from_optimized(
                    params.user_unique_id, params.assistant_id
                )
            except Exception as e:
                # Don't fail if conversation loading fails
                log_redis_warning("load_conversation_history", str(e), "cluster_handler", {
                    "user_unique_id": params.user_unique_id,
                    "assistant_id": params.assistant_id
                })
                session_data["full_conversation_history"] = {}
                session_data["full_conversation_text"] = ""
        
        # Extract session data
        last_question = session_data.get("last_question")
        invalid_count = session_data.get("invalid_count", 0)
        state = ConversationState(session_data.get("state", "awaiting_question"))
        questions = session_data.get("questions_obj", [])
        collected_pairs_dependent = session_data.get("collected_policy_pairs", {})
        collected = session_data.get("collected_answers", {})
        pending_policy = session_data.get("pending_policy_questions", [])
        affirmative_dependents = session_data.get("affirmative_dependents", [])
        full_items = session_data.get("full_items_details", [])
        user_unique_id = session_data.get("user_unique_id")
        extra_info = session_data.get("extra_info", {})
        if isinstance(extra_info, list):
            extra_info = {"": extra_info} if extra_info else {}
        else:
            extra_info = {k: list(v) for k, v in extra_info.items()}
        # policy_specific_data = session_data.get("policy_log", {})
        
        
        # Initialize response variables
        first_question = {}
        item_id = None
        new_q = None
        policy = []
        # Initialize questions and related variables - will be populated by fetch_next_question
        if state != ConversationState.AWAITING_QUESTION:
            qs = questions # keep it consistent with downstream variables
            qs = questions # keep it consistent with downstream variables
            this_item = qs[0] if qs else {}
            policy_qs = this_item.get("policiesQuestion", [])
            main_question_text = this_item.get("originalBackendQuestions", this_item.get("backendQuestions"))  # Use original (non-personalized) for internal logic
            first_question = qs[0] if qs else {}
            item_id = qs[0]["itemId"] if qs else None
            
            return self._handle_cluster_conversation(
                params, session_data, qs, policy_qs, main_question_text,
                first_question, item_id, collected_pairs_dependent, collected,
                pending_policy, affirmative_dependents, full_items,
                last_question, invalid_count, state, user_unique_id, extra_info
            )
        else:
            # Initial fetch - FIRST TIME USER LOGS IN
            try:

                next_question_obj = self.question_service.fetch_next_question(
                    mode=ConversationMode.CLUSTER,
                    assistant_id=params.assistant_id,
                    bearer_token=params.bearer_token,
                    user_id=params.user_unique_id,
                    personalize=True
                )
                
                if not next_question_obj or not isinstance(next_question_obj, dict):
                    return {
                        "status": "error",
                        "message": "Failed to fetch question. Please try again."
                    }
                
                new_q_obj = next_question_obj.get("question_obj")
                
                if not new_q_obj or not isinstance(new_q_obj, dict):
                    return {
                        "status": "error",
                        "message": "All assistant items completed successfully"
                    }
                
                backend_questions = new_q_obj.get("backendQuestions")

                if not backend_questions:
                    return {
                        "status": "error",
                        "message": "All assistant items completed successfully"
                    }

                question_text = backend_questions
                # Original (non-personalized) question for internal logic (session, extraction)
                original_backend_questions = new_q_obj.get("originalBackendQuestions", new_q_obj.get("backendQuestions"))

                # Always call insert_placeholder_values to ensure placeholders are replaced
                try:
                    context_key_question = insert_placeholder_values(new_q_obj, question_text)
                except Exception as e:
                    context_key_question = question_text  # Fallback to original
                try:
                    original_context_key = insert_placeholder_values(new_q_obj, original_backend_questions)
                except Exception as e:
                    original_context_key = original_backend_questions
                
                item_id = new_q_obj.get("itemId")
                function_flow = new_q_obj.get("functionFlow")
                dynamic_data = new_q_obj.get("dynamicFunctionData")
                static_question_for = ""
               
                # Safe check for dynamic_data and result
                if dynamic_data and isinstance(dynamic_data, dict):
                    result = dynamic_data.get("result")
                    
                    if isinstance(result, list) and len(result) > 0:
                        if len(result) <= 1:
                            function_flow = None
                            dynamic_data["displayType"] = None
                            
                            # Safe access to result[0] and storyName
                            first_result = result[0]
                            if isinstance(first_result, dict):
                                story_name = first_result.get('storyName')
                                # if story_name:
                                    # just commenting for now (Question for)
                                    # static_question_for = f"Question for {story_name.title()}:"

                # Normalize empty collections to None for consistency
                # Empty list/dict should be None to avoid issues downstream
                normalized_function_flow = function_flow if (function_flow and len(function_flow) > 0) else None
                normalized_dynamic_data = dynamic_data if (dynamic_data and isinstance(dynamic_data, dict) and dynamic_data) else None
                
                question_message = f"✅ Alright, let's get started!\n{context_key_question}\n" if not static_question_for else f"✅ Alright, let's get started!\n\n{static_question_for}\n{context_key_question}\n"
                
                # Build selectedItemsContext for non-dynamic cases
                selected_items_context = None
                if not normalized_dynamic_data and new_q_obj:
                    # Non-dynamic case: populate from question object
                    selected_items_context = build_selected_items_context(
                        selected_story_names=[new_q_obj.get("storyName", "")] if new_q_obj.get("storyName") else [],
                        question_obj=new_q_obj
                    )
                
                response = {
                    "prev_option": ["random1", "random2"],
                    "question": question_message,
                    "itemId": item_id,
                    "functionFlow": normalized_function_flow,
                    "dynamicFunctionData": normalized_dynamic_data
                }
                
                # Add selectedItemsContext if available
                if selected_items_context:
                    response["selectedItemsContext"] = selected_items_context
               
                # Safe extraction of dynamic_data result
                dynamic_data_result = []
                if dynamic_data and isinstance(dynamic_data, dict):
                    result = dynamic_data.get("result")
                    if isinstance(result, list):
                        dynamic_data_result = result
                
                # Initialize optimized context in Redis if this is first time
                if params.assistant_id and params.user_unique_id:
                    try:
                        initialize_optimized_context(
                            params.user_unique_id,
                            params.assistant_id
                        )
                    except Exception as e:
                        # Don't fail if initialization fails
                        log_redis_warning("initialize_optimized_context", str(e), "cluster_handler", {
                            "user_unique_id": params.user_unique_id,
                            "assistant_id": params.assistant_id
                        })
                
                try:
                    self._update_cluster_session(
                        params=params,
                        prompt=original_context_key,  # Store original (non-personalized) in session; personalized is only for frontend display
                        state=ConversationState.AWAITING_ANSWER, # Set state to awaiting answer
                        collected={}, #imp
                        pending_policy=[], #imp
                        full_items=[], #imp
                        affirmative_dependents=[], #imp
                        collected_pairs_dependent={}, #imp
                        invalid_count=0,
                        questions=[new_q_obj], # Save the full question object to the session
                        conversation_history="",
                        resp=response,
                        previous_item_name=new_q_obj.get("itemName") if not new_q_obj.get("isLoop", False) else "",
                        user_unique_id=user_unique_id,
                        dynamic_data=dynamic_data_result,
                        extra_info={},
                        redis_user_key=""
                    )
                except Exception as e:
                    # Don't raise - return response anyway to prevent complete failure
                    # raise  # Commented out to prevent crash
                    pass
                
                # Note: Initial message not stored in optimized format
                # Only Q&A pairs are stored via append_seed_question_to_context() and append_policy_answer_to_context()
                if params.assistant_id and params.user_unique_id:
                    try:
                        pass  # No initial message storage needed
                    except Exception as e:
                        # Don't fail if appending fails
                        log_redis_warning("append_initial_message", str(e), "cluster_handler", {
                            "user_unique_id": params.user_unique_id,
                            "assistant_id": params.assistant_id
                        })
                
                try:
                    return response
                except Exception as e:
                    # Return a safe fallback response
                    return {
                        "status": "error",
                        "message": "An error occurred while processing your request",
                        "prev_option": [],
                        "question": "I apologize, but there was an issue. Please try again.",
                        "itemId": item_id
                    }
            except Exception as e:
                # Return a safe error response
                return {
                    "status": "error",
                    "message": "Failed to initialize conversation. Please try again.",
                    "prev_option": [],
                    "question": "I apologize, but there was an issue initializing your conversation. Please refresh and try again."
                }
    
    def _handle_cluster_conversation(
        self, params: UserResponseParams, session_data: Dict[str, Any],
        qs: List[Dict], policy_qs: List[Dict], main_question_text: str,
        first_question: Dict, item_id: str, collected_pairs_dependent: Dict,
        collected: Dict, pending_policy: List[str], affirmative_dependents: List[Dict],
        full_items: List[Dict], last_question: str, invalid_count: int,
        state: ConversationState, user_unique_id: str, extra_info: List
    ) -> Dict[str, Any]:
        """Handle the main cluster conversation flow."""
        
        done = False
        force_skip_executed = False
        prompt = ""
        assistant_completed = False
        is_loop = False
        existing_item = False
        extract_item = {}
        extract_item_name = ""
        previous_item_name = ""
        just_recorded_item_name = ""  # Only set after DB update + fetch new seed (or force_skip to new seed)
        question_type = "policy" if state == ConversationState.POLICY else "seed"
        current_question = ""
        context_info = ""
        story_category = ""
        story_name = ""
        extraction_found = False
        # extra_info: dict of person -> list of strings; summary_generation looks up by summary_for_person
        if not isinstance(extra_info, dict):
            extra_info = {"": list(extra_info)} if extra_info else {}
        else:
            extra_info = {k: list(v) for k, v in extra_info.items()}

        redis_user_key = f"{params.user_unique_id}_{params.assistant_id}"
        if qs:
            # Always call insert_placeholder_values to ensure placeholders are replaced
            context_key_question = insert_placeholder_values(qs[0], qs[0].get("backendQuestions"))
            qs[0]["backendQuestions"] = context_key_question

            # Compute original (non-personalized) context key for internal logic
            original_context_key = insert_placeholder_values(qs[0], qs[0].get("originalBackendQuestions", qs[0].get("backendQuestions")))

            # Handle last_question - always replace placeholders
            last_question = insert_placeholder_values(qs[0], last_question)
            current_question = last_question
            is_loop = qs[0].get("isLoop")
            previous_item_name = qs[0].get("itemName") if not is_loop else ""
            session_data["previous_item_name"] = previous_item_name
            story_category = qs[0].get("story")
            story_name = qs[0].get("storyName")


        # Determine context_info: use affirmative_dependents for policy questions, full_items for seed questions
        current_story_type = qs[0].get("story", "") if qs and qs[0] else ""
        
        # Priority: For policy questions, use affirmative_dependents first (they answered "yes" to seed question)
        # selected_items_details contains ALL items presented, not just the ones answered for
        if question_type == "policy" and affirmative_dependents:
            # For policy questions: use affirmative_dependents (items that answered "yes" to seed question)
            story_names = [item["storyName"] for item in affirmative_dependents]
        elif params.selected_items_details:
            # fetch story_name from frontend (fallback for seed questions or when affirmative_dependents not available)
            story_names = [item["storyName"] for item in params.selected_items_details]
        elif qs and qs[0]:
            # For seed questions: use all items from dynamic_result or executionResult
            dynamic_result = qs[0].get('dynamicFunctionData', {}).get('result', [])
            if dynamic_result:
                story_names = [i['storyName'] for i in dynamic_result]
            else:
                # Safely access nested policiesQuestion structure
                policies_question = qs[0].get('policiesQuestion')
                if policies_question and isinstance(policies_question, list) and len(policies_question) > 0:
                    execution_result = policies_question[0].get('executionResult')
                    if execution_result and isinstance(execution_result, list) and len(execution_result) > 0:
                        result = execution_result[0].get('result', [])
                        story_names = [i['storyName'] for i in result if isinstance(i, dict) and 'storyName' in i]
                    else:
                        story_names = []
                else:
                    story_names = []
        else:
            story_names = []
        
        # Filter story_names to only include care receivers with positive answers (exclude skip/no)
        # Parse user response to identify which care receivers have skip/no responses
        answers_map = {}        
        all_users = setup_all_users(question_type, full_items, session_data, affirmative_dependents)
        # For policy questions: exclude users whose answer for this question was already extracted
        # from a prior response — they were never asked this question directly, so no new data
        # should be processed for them.
        if question_type == "policy" and collected_pairs_dependent:
            current_policy_q = session_data.get("current_policy_original_question", "").strip().lower()
            if current_policy_q:
                all_users = [
                    u for u in all_users
                    if not any(
                        p.get("question", "").strip().lower() == current_policy_q
                        and p.get("answer", "").strip().lower() not in ("", "skip")
                        for p in collected_pairs_dependent.get(u, [])
                    )
                ]
                # Sync story_names to match the filtered all_users so context_info
                # passed to the validation LLM only mentions users actually being asked.
                all_users_set = {u.lower() for u in all_users}
                story_names = [n for n in story_names if n.lower() in all_users_set]
        user_response_for_extraction = params.user_response
        if not is_key_value_format(user_response_for_extraction):
            # use LLM instead for full extraction
            answers_map = extract_data_by_user({"users": all_users, "user_response": user_response_for_extraction, "question": last_question})
        else:
            answers_map = split_user_response(user_response_for_extraction)

        # Use LLM (policy_boolean_extraction) to detect skip/no responses from answers_map
        # This handles both key-value format and free-text responses uniformly
        if story_names and params.user_response and answers_map:
            try:
                # Use policy_boolean_extraction to detect which users have skip/no responses
                skip_no_names = set()
                for name, value in answers_map.items():
                    if value and str(value).strip():
                        # if value is already a "no" or "skip", no need to waste LLM cycles
                        if value.lower() in ("no", "skip"):
                            result = "no"
                        else:
                            # policy_boolean_extraction returns "yes" for positive, "no" for negative/skip
                            result = policy_boolean_extraction(last_question, str(value))

                        if result == "no":
                            skip_no_names.add(name.lower())

                # Filter story_names to exclude those with skip/no responses
                if skip_no_names:
                    filtered_names = [name for name in story_names if name.lower() not in skip_no_names]
                    # Only update if we have at least one positive answer (fallback to original if all are skip/no)
                    if filtered_names:
                        story_names = filtered_names
            except Exception as e:
                logging.warning(f"Error detecting skip/no responses: {e}")
        
        context_info = f"{', '.join(story_names)} {'is a' if len(story_names) == 1 else 'are'} {current_story_type}" if story_names and current_story_type else ""

            

        caregiver_name = (qs[0].get("userName") if qs else None) if isinstance(qs, list) and qs else None
        print(json.dumps({"log_type": "caregiver_context", "mode": "cluster", "context": "validate_multiple", "caregiver_name": caregiver_name}), flush=True)
        raw_result = self.validation_service.validate_multiple_user_response(
            last_question, clean_input(params.user_response), context_info, caregiver_name=caregiver_name, story_type = current_story_type
        )

        # Store original user response before any modifications
        original_user_response = params.user_response

        if isinstance(raw_result, list) and len(raw_result) > 0:
            validation_status = raw_result[0].lower() if raw_result[0] else "error"
            validation_reply = raw_result[1] if len(raw_result) > 1 else ""
            validation_rephrased_question = raw_result[2] if len(raw_result) > 2 else ""
        elif isinstance(raw_result, dict):
            validation_status = raw_result.get("result", "error").lower()
            validation_reply = raw_result.get("reply", "")
            validation_rephrased_question = raw_result.get("rephrased_question", "")
        else:
            validation_status = "error"
            validation_reply = "Unable to process response"
            validation_rephrased_question = ""
        
        # Parse original_user_response which may be in key/value format or plain text
        # Example: "Moomoo=doesn't have one, Luuluu=doesn't need any help, Keekee=not required to have it" or "There isn't any"
        parsed_user_response = {} #
        if validation_status in ("no") and "=" in original_user_response:
            # Try to parse as key/value pairs
            pairs = [pair.strip() for pair in original_user_response.split(",")]
            for pair in pairs:
                if "=" in pair:
                    key, value = pair.split("=", 1)
                    parsed_user_response[key.strip().lower()] = value.strip()
        # Control flags for conversation flow
        has_question = True if validation_status == "question" else False
        invalid_user_response = validation_status == "error"

        # Handle skip or no responses for dynamic function questions
        if validation_status in ("skip", "no"):
            if state == ConversationState.POLICY:
                if affirmative_dependents:
                    params.user_response = ", ".join(f'{item["storyName"]}={validation_status}' for item in affirmative_dependents)
                else:
                    entry_to_add = f"Bot: {last_question}/User: {original_user_response}\n"
                    # Check for duplicates before adding
                    if entry_to_add not in session_data.get("conversation_history", ""):
                        session_data["conversation_history"] += entry_to_add

            elif state == ConversationState.AWAITING_ANSWER:
                session_data["previous_item_name"] = previous_item_name
 
        # Check if item existing or not in the db if exist then we update the existing item. !!ATTENTION!! It is only for cloning of the item.
        existing_item_id = None
        extract_item = None
        extract_item_name = None
        
        if params.function_flow and not invalid_user_response:
            if params.function_flow[0].get("event") == "after" and validation_status.lower() not in ("skip", "no", "question"):
                chapter_name = qs[0].get("chapterName", "") if qs else ""
                extract_item = extract_item_name_from_response(params.user_response, main_question_text, chapter_name)
                extract_item_name = extract_item.get("item_name")
                if extract_item_name:
                    self.redis_memory.hset(redis_user_key, "previous_item_name", extract_item_name)
                    existing_item_id = check_item_existance(params.user_unique_id, qs[0].get("userStoryDocId"), qs[0].get("chapterDocId"), extract_item_name.lower())

                    if not existing_item_id:
                        self.redis_memory.hset(redis_user_key, "unique_item_id", json.dumps(int(time.time())))
                        self.set_bool(redis_user_key, "existing", False)

                    else:
                        self.redis_memory.hset(redis_user_key, "unique_item_id", existing_item_id)
                        self.set_bool(redis_user_key, "existing", True)
                else:
                    validation_status = "error"
                    self.set_bool(redis_user_key, "existing", False)
                    invalid_user_response = True

        # Get the existing key from redis if a item exist then it should be true otherwise false this help us to validate the updation of the duplicate item
        existing_item = self.get_bool(redis_user_key, "existing")

        # Setup full_items and collected_pairs_dependent
        if not full_items:
            if params.selected_items_details and not is_loop:

                pending_policy = []
                for p in policy_qs:
                    # Use original template for session/Redis (personalize on-demand when displaying)
                    original_policy_q = p.get("question")
                    context_policy_question = insert_placeholder_values(qs[0], original_policy_q) if qs else original_policy_q
                    pending_policy.append(context_policy_question)

                # For cloning functionality: 
                # - If existing_item_id is found, keep the duplicate check question (first question) to ask user if they want to update
                # - If existing_item_id is None (no item found), remove the duplicate check question
                if not existing_item_id and pending_policy and is_loop and not existing_item:
                    pending_policy.pop(0)
                # Ensure duplicate check question is first when item exists
                elif existing_item_id and pending_policy and is_loop and existing_item:
                    # Check if first question is the duplicate check question, if not, reorder
                    duplicate_check_keywords = ["found an item", "already matches", "update the existing"]
                    first_question = pending_policy[0].lower() if pending_policy else ""
                    is_duplicate_check = any(keyword in first_question for keyword in duplicate_check_keywords)
                    if not is_duplicate_check and len(pending_policy) > 1:
                        # Find and move duplicate check question to front
                        for i, question in enumerate(pending_policy):
                            question_lower = question.lower()
                            if any(keyword in question_lower for keyword in duplicate_check_keywords):
                                pending_policy.insert(0, pending_policy.pop(i))
                                break

                # pending_policy = [p["question"] for p in policy_qs]
                if pending_policy:
                    self.redis_memory.hset(redis_user_key, "pending_policy_main_questions", json.dumps(pending_policy))
                else:
                    # Clear Redis if current question has no policy questions to prevent showing old policy questions
                    self.redis_memory.hset(redis_user_key, "pending_policy_main_questions", json.dumps([]))

                full_items = params.selected_items_details if params.selected_items_details else []
                collected = {
                    item["storyName"].lower(): (
                        answers_map.get(item["storyName"].lower(), "No")
                    )
                    for item in full_items
                }
                collected_pairs_dependent = {item["storyName"].lower(): [] for item in (full_items or [])}
            else:
                # Non-dynamic function question
                if state == ConversationState.AWAITING_ANSWER:
                    # pending_policy  = [p["question"] for p in policy_qs]
                    pending_policy = []
                    for p in policy_qs:
                        # Use original template for session/Redis (personalize on-demand when displaying)
                        original_policy_q = p.get("question")

                        context_policy_question = insert_placeholder_values(qs[0], original_policy_q) if qs else original_policy_q
                        pending_policy.append(context_policy_question)
                    
                    # For cloning functionality: 
                    # - If existing_item_id is found, keep the duplicate check question (first question) to ask user if they want to update
                    # - If existing_item_id is None (no item found), remove the duplicate check question
                    if not existing_item_id and pending_policy and is_loop and not existing_item:
                        pending_policy.pop(0)
                    # Ensure duplicate check question is first when item exists
                    elif existing_item_id and pending_policy and is_loop and existing_item:
                        # Check if first question is the duplicate check question, if not, reorder
                        duplicate_check_keywords = ["found an item", "already matches", "update the existing"]
                        first_question = pending_policy[0].lower() if pending_policy else ""
                        is_duplicate_check = any(keyword in first_question for keyword in duplicate_check_keywords)
                        if not is_duplicate_check and len(pending_policy) > 1:
                            # Find and move duplicate check question to front
                            for i, question in enumerate(pending_policy):
                                question_lower = question.lower()
                                if any(keyword in question_lower for keyword in duplicate_check_keywords):
                                    pending_policy.insert(0, pending_policy.pop(i))
                                    break

                    if pending_policy:
                        self.redis_memory.hset(redis_user_key, "pending_policy_main_questions", json.dumps(pending_policy))
                    else:
                        # Clear Redis if current question has no policy questions to prevent showing old policy questions
                        self.redis_memory.hset(redis_user_key, "pending_policy_main_questions", json.dumps([]))
                # Save valid user response for final summarization
                # Skip policy questions — their conversation_history is written inside the extraction block
                if not has_question and not invalid_user_response and question_type != 'policy':
                    entry_to_add = f"Bot: {last_question}/User: {original_user_response}\n"
                    # Check for duplicates before adding
                    if entry_to_add not in session_data.get("conversation_history", ""):
                        session_data["conversation_history"] += entry_to_add
        
        pending_policy_main_question = json.loads(self.redis_memory.hget(redis_user_key, "pending_policy_main_questions") or "null")
        # Setup affirmative_dependents if there is dynamic function data
        if full_items and not invalid_user_response and question_type != 'policy':

            # Parse the user response

            # swap out parse_free_text_response with extract_data_by_user which is more accurate and efficient
            # dependents = [item["storyName"].lower() for item in affirmative_dependents] if affirmative_dependents else [item["storyName"].lower() for item in full_items]
            # answers_map = parse_free_text_response(clean_input(params.user_response), dependents, last_question)

            # previous_item_name
            # Setup affirmative_dependents from seed question
            if not affirmative_dependents and len(affirmative_dependents) == 0 and validation_status not in ("skip", "no"):
                for detail in full_items:
                    story_name = detail["storyName"].lower()

                    detail["error"] = False # we are not using this
                    user_answer = answers_map.get(story_name, "No")

                    # this will never happen since there is already a condition "not invalid_user_response"
                    # if user_answer == "error":
                    #     detail["error"] = True
                    
                    #OverWrint Collect On the based of Answer_map (FromAI)
                    collected[story_name] = user_answer         # <<<< this line could be removed
                    if policy_boolean_extraction(main_question_text, user_answer) == "yes":
                        affirmative_dependents.append(detail)

                # Store filtered dynamic data for on-demand personalization of policy questions
                # Policy questions will be personalized individually when asked (saves LLM cycles)
                if affirmative_dependents and policy_qs and qs:
                    try:
                        # Create filtered dynamic_function_data with only affirmative dependents
                        filtered_dynamic_data = {
                            "success": True,
                            "result": affirmative_dependents
                        }

                        # Store filtered data in question object for on-demand personalization
                        # Policy questions are NOT personalized upfront - they will be personalized
                        # individually when each question is about to be asked
                        qs[0]["filteredDynamicFunctionData"] = filtered_dynamic_data

                        # Update pending_policy with original template questions (will be personalized on-demand)
                        pending_policy = []
                        for p in policy_qs:
                            # Use original template question if available, otherwise use current question
                            original_question = p.get("question")

                            
                            if qs:
                                original_question = insert_placeholder_values(qs[0], original_question)
                            pending_policy.append(original_question)

                        # Update Redis with template questions (will be personalized on-demand when displayed)
                        if pending_policy:
                            self.redis_memory.hset(redis_user_key, "pending_policy_main_questions", json.dumps(pending_policy))

                    except Exception as e:
                        print(json.dumps({
                            "log_type": "filtered_dynamic_data_setup_error",
                            "error": str(e),
                            "error_type": type(e).__name__
                        }))

# =========================================================== Extraction Start =========================================================================

        if (question_type == 'seed' and validation_status.lower() == "yes") or (question_type == 'policy'):
            if pending_policy:
                
                # Build extraction input
                # Get all user names for context (if available)
                # if answers_map is not generated earlier, then we need to generate it - only when validation_status is "error"
                user_response_for_extraction = original_user_response if validation_status in ("no") else params.user_response
                if not answers_map:
                    all_users = setup_all_users(question_type, full_items, session_data, affirmative_dependents)
              
                    if full_items:
                        if not is_key_value_format(user_response_for_extraction):
                            # use LLM instead for full extraction
                            answers_map = extract_data_by_user({"users": all_users, "user_response": user_response_for_extraction, "question": last_question})

                            user_response_for_extraction = {k.lower(): v for k, v in answers_map.items()}
                        else:
                            # Parse key-value format string into dictionary, handling text between pairs
                            user_response_for_extraction = split_user_response(params.user_response)
                else:
                    if full_items:
                        user_response_for_extraction = answers_map


                # Extract original policy questions from policy_qs (use originalQuestion template, not personalized version)
                original_policy_questions = [p.get("question") for p in policy_qs] if policy_qs else []


                # Safety check: ensure seed question is available (use main_question_text or fallback to last_question)
                seed_question_for_extraction = main_question_text if main_question_text else last_question
                if not seed_question_for_extraction:
                    seed_question_for_extraction = ""  # Will cause extraction to return early

                # Determine the original (non-personalized) "current question" for extraction.
                # - For seed turns, use the original seed question.
                # - For policy turns, use the stored original policy question.
                if question_type == "policy":
                    original_q = session_data.get("current_policy_original_question") or main_question_text or last_question
                else:
                    original_q = main_question_text or last_question

                extraction_input = {
                    # "user_response": answers_map if full_items else params.user_response,
                    # "seed_question": last_question,
                    # "policy_questions": pending_policy,
                    "user_response": user_response_for_extraction,
                    "seed_question": seed_question_for_extraction,
                    "policy_questions": original_policy_questions,
                    "all_users": all_users,  # Pass for context
                    "current_question": original_q,  # Always the original (non-personalized) question for this turn
                }

                # Call improved extraction function (v2)
                extraction_result = extract_policy_answers_cluster_mode_v2(extraction_input)

                # Always extract extra_info regardless of found status
                extraction_results = extraction_result.get("extraction_results", {})
                is_dynamic = isinstance(extraction_result["user_response"], dict)
                extracted_extra = extraction_results.get("extra_info", [])
                if isinstance(extracted_extra, dict):
                    for person_key, vals in extracted_extra.items():
                        if person_key is not None:
                            key = str(person_key)
                            if isinstance(vals, list):
                                extra_info.setdefault(key, []).extend(v for v in vals if v and str(v).strip())
                            elif vals and str(vals).strip():
                                extra_info.setdefault(key, []).append(str(vals).strip())
                elif isinstance(extracted_extra, list):
                    person_key = story_name if story_name else ""
                    extra_info.setdefault(person_key, []).extend(extracted_extra)
                elif extracted_extra and str(extracted_extra).strip():
                    person_key = story_name if story_name else ""
                    extra_info.setdefault(person_key, []).append(str(extracted_extra).strip())

                # Process results if found
                if extraction_result.get("found", False):
                    extraction_found = extraction_result.get("found", False)
                    extracted_policies = extraction_results.get("policy_questions", [])

                    # Track if we actually stored any extracted values
                    actually_extracted_count = 0
                    # Track processed policy questions for non-dynamic items to prevent duplicates in conversation_history
                    processed_policy_questions = set()
                    
                    if question_type == "seed" and session_data.get("dynamic_data") and not full_items:
                        seed_question_key = extraction_results.get("seed_question")
                        if seed_question_key:
                            # Use seed_question_for_extraction as key (what was passed to extraction function)
                            seed_results_list = seed_question_key.get(seed_question_for_extraction)
                            # In dynamic mode, seed_results is a list of dicts: [{user: answer}, ...]
                            if isinstance(seed_results_list, list):
                                for dep in seed_results_list:
                                    if isinstance(dep, dict) and dep:
                                        try:
                                            dep_name, dep_answer = next(iter(dep.items()))
                                            # Store the FULL response - extraction function now preserves original response verbatim
                                            # Preserve original case and formatting for better summary generation
                                            if dep_name and dep_answer:
                                                collected[dep_name] = dep_answer if isinstance(dep_answer, str) else str(dep_answer)
                                        except (StopIteration, ValueError, TypeError) as e:
                                            continue
                            elif seed_results_list is None:
                                pass

                    if question_type == "seed" and full_items:
                        seed_question_key = extraction_results.get("seed_question")
                        if seed_question_key:
                            # Track which dependents we've stored from extraction
                            stored_from_extraction = set()
                            # Use seed_question_for_extraction as key (what was passed to extraction function)
                            seed_results_list = seed_question_key.get(seed_question_for_extraction)
                            # In dynamic mode, seed_results is a list of dicts: [{user: answer}, ...]
                            if isinstance(seed_results_list, list):
                                for dep in seed_results_list:
                                    if isinstance(dep, dict) and dep:
                                        try:
                                            dep_name, dep_answer = next(iter(dep.items()))
                                            if not dep_name or not dep_answer:
                                                continue
                                            dep_key = dep_name.lower()
                                            # Skip if already stored to prevent duplicates
                                            if dep_key in stored_from_extraction:
                                                continue
                                            stored_from_extraction.add(dep_key)
                                            # CRITICAL: The extraction function now preserves the FULL original response verbatim
                                            # dep_answer IS the original response, so use it directly
                                            # answers_map might be filtered/parsed, so prioritize dep_answer

                                            # we do not want to keep the original response as the seed answer, it should just be the answer relevant to the seed question
                                            # NOTE: need to default to user's original answer if extraction came back with empty string
                                            if dep_answer == "":
                                                map_answer = user_response_for_extraction[dep_key] if dep_key in user_response_for_extraction else "Yes"
                                            else:
                                                map_answer = dep_answer
                                                # no need to hit LLM if the answer is already yes or no
                                                # if dep_answer.lower() in ("yes", "no", "skip"):
                                                    # map_answer = dep_answer
                                                # else:
                                                    # pass
                                                    # not passing Yes/No from 
                                                    # map_answer = policy_boolean_extraction(last_question, dep_answer)
                                            # at this place we are using map_answer from policy_boolean_extraction which is "yes", "no", or "skip" but collected should be based on answers_map (it could be bussiness or any details in seed not just yes no)
                                            # Preserve original case and formatting for better summary generation
                                            collected[dep_key] = map_answer if isinstance(map_answer, str) else str(map_answer)
                                        except (StopIteration, ValueError, TypeError) as e:
                                            continue
                            elif seed_results_list is None:
                                pass
                            
                            # Ensure ALL dependents have their answers stored (even if not in extraction result)
                            for detail in full_items:
                                story_name = detail["storyName"].lower()
                                if story_name not in stored_from_extraction and story_name not in collected:
                                    # Store from answers_map if available
                                    if answers_map and story_name in answers_map:
                                        collected[story_name] = answers_map[story_name]
                                    else:
                                        # Fallback to "No" if nothing available
                                        collected[story_name] = "No"

                    elif question_type == "seed" and not full_items:
                        # Use the FULL seed question answer - extraction function preserves original response verbatim
                        seed_question_key = extraction_results.get("seed_question", {})
                        # Use seed_question_for_extraction as key (what was passed to extraction function)
                        seed_answer = seed_question_key.get(seed_question_for_extraction, params.user_response)
                        # Always use original user response if extraction didn't preserve it properly
                        if not seed_answer or seed_answer.strip() == "":
                            seed_answer = params.user_response
                        # For cloning scenarios (isLoop), we need to store the answer in collected for summary generation
                        # Use storyName from qs[0] if available, otherwise use a default key
                        if is_loop and qs and qs[0].get("storyName"):
                            story_name_key = qs[0].get("storyName").lower()
                            collected[story_name_key] = seed_answer
                        # the conversation history should be reset; otherwise, it would include
                        # the session_data["conversation_history"] that was set above around line 481
                        # Use original (non-personalized) question for conversation history to ensure consistent extraction/summary
                        original_seed_q = main_question_text or last_question
                        session_data["conversation_history"] = f"Bot: {original_seed_q}/User: {seed_answer}\n"

                        # Store seed question in optimized Redis format for conversation history persistence
                        save_seed_question_to_redis(
                            params.user_unique_id, params.assistant_id,
                            qs[0] if qs else None, last_question, seed_answer
                        )

                    elif question_type == "seed" and full_items and qs:
                        # When full_items (dynamic multi-dependent), also store seed in optimized context so conversation history includes it
                        save_seed_question_to_redis(
                            params.user_unique_id, params.assistant_id,
                            qs[0] if qs else None, main_question_text or last_question, params.user_response
                        )

                    # the compound user input can cause the affirmative_dependents to fail to recognize a user has a positive "yes" answer
                    # adding a safeguard to re-establish the affirmative_dependents values
                    if question_type == "seed":
                        seed_question_key = extraction_results.get("seed_question")
                        if seed_question_key:
                            seed_results_list = seed_question_key.get(seed_question_for_extraction)

                            affirmative_dependents = []
                            if full_items:
                                for detail in full_items:
                                    story_name = detail["storyName"].lower()
                                    user_answer = next((str(v).strip() for d in (seed_results_list or []) if isinstance(d, dict) for k, v in d.items() if k.lower() == story_name), "No")
                                    if policy_boolean_extraction(main_question_text, user_answer) == "yes":
                                        affirmative_dependents.append(detail)
                                    else:
                                        # need to remove the collected_pairs_dependent entry for this story_name
                                        if story_name in collected_pairs_dependent:
                                            del collected_pairs_dependent[story_name]

                            # Re-personalize policy questions with ONLY affirmative dependents (after extraction)
                            # Store filtered dynamic data for on-demand personalization of policy questions
                            # Policy questions will be personalized individually when asked (saves LLM cycles)
                            if affirmative_dependents and policy_qs and qs:
                                try:
                                    # Create filtered dynamic_function_data with only affirmative dependents
                                    filtered_dynamic_data = {
                                        "success": True,
                                        "result": affirmative_dependents
                                    }

                                    # Store filtered data in question object for on-demand personalization
                                    # Policy questions are NOT personalized upfront - they will be personalized
                                    # individually when each question is about to be asked
                                    qs[0]["filteredDynamicFunctionData"] = filtered_dynamic_data

                                    # Update pending_policy with original template questions (will be personalized on-demand)
                                    pending_policy = []
                                    for p in policy_qs:
                                        # Use original template question if available, otherwise use current question
                                        original_question = p.get("question")

                                        if qs:
                                            original_question = insert_placeholder_values(qs[0], original_question)
                                        pending_policy.append(original_question)

                                    # Update Redis with template questions (will be personalized on-demand when displayed)
                                    if pending_policy:
                                        self.redis_memory.hset(redis_user_key, "pending_policy_main_questions", json.dumps(pending_policy))

                                except Exception as e:
                                    print(json.dumps({
                                        "log_type": "filtered_dynamic_data_setup_error_extraction",
                                        "error": str(e),
                                        "error_type": type(e).__name__
                                    }))

                    # for each user in affirmative_dependents, check if they have a positive "yes" answer
                    # write else q will either seed or policy
                    for policy_dict in extracted_policies:
                        for policy_question, answer_value in policy_dict.items():

                            if is_dynamic:
                                
                                # Handle dict format: [{"Ben": "ans"}, {"Mary": "ans"}]
                                if isinstance(answer_value, list) and len(answer_value) > 0:
                                    for obj in answer_value:
                                        for dep_name, dep_answer in obj.items():
                                            if dep_answer and str(dep_answer).strip() not in ["", "none", "n/a"]:
                                                dep_key = dep_name.lower()
                                                if dep_key in collected_pairs_dependent:
                                                    # Find original template question from policy_qs for individual summaries
                                                    question_to_store = policy_question
                                                    for p in policy_qs:
                                                        if p.get("question", "").strip().lower() == policy_question.strip().lower():
                                                            question_to_store = p.get("question", policy_question)

                                                            break

                                                    # Do not add to collected_pairs_dependent when invalid
                                                    if not invalid_user_response:
                                                        # If this person already has a meaningful answer extracted from a prior
                                                        # response, the question was never actually asked for them — skip entirely.
                                                        existing_entry = next((p for p in collected_pairs_dependent[dep_key] if p.get("question") == question_to_store), None)
                                                        if existing_entry and existing_entry["answer"].strip().lower() not in ("", "skip"):
                                                            continue
                                                        # Remove any existing entry for this question so summary uses latest response
                                                        collected_pairs_dependent[dep_key] = [
                                                            p for p in collected_pairs_dependent[dep_key]
                                                            if p.get("question") != question_to_store
                                                        ]
                                                        collected_pairs_dependent[dep_key].append({
                                                            "question": question_to_store,
                                                            "answer": dep_answer
                                                        })
                                                        actually_extracted_count += 1

                                                        # Store policy answer in Redis
                                                        save_policy_answer_to_redis(
                                                            params.user_unique_id, params.assistant_id, policy_qs,
                                                            policy_question, question_to_store, dep_answer, dep_name
                                                        )
                            else:
                                # Handle string format: "answer text"
                                if isinstance(answer_value, str) and answer_value.strip() not in ["", "none", "n/a"]:
                                    # Apply to all dependents
                                    if affirmative_dependents:
                                        for dep in affirmative_dependents:
                                            dep_key = dep["storyName"].lower()
                                            if dep_key in collected_pairs_dependent:
                                                # Find original template question from policy_qs for individual summaries
                                                question_to_store = policy_question
                                                for p in policy_qs:
                                                    if p.get("question", "").strip().lower() == policy_question.strip().lower():
                                                        question_to_store = p.get("question", policy_question)

                                                        break

                                                # # Do not add when invalid
                                                if not invalid_user_response:
                                                    # If this person already has a meaningful answer extracted from a prior
                                                    # response, the question was never actually asked for them — skip entirely.
                                                    existing_entry = next((p for p in collected_pairs_dependent[dep_key] if p.get("question") == question_to_store), None)
                                                    if existing_entry and existing_entry["answer"].strip().lower() not in ("", "skip"):
                                                        continue
                                                    # Remove any existing entry for this question so summary uses latest response
                                                    collected_pairs_dependent[dep_key] = [
                                                        p for p in collected_pairs_dependent[dep_key]
                                                        if p.get("question") != question_to_store
                                                    ]
                                                    collected_pairs_dependent[dep_key].append({
                                                        "question": question_to_store,
                                                        "answer": answer_value
                                                    })
                                                    actually_extracted_count += 1

                                                    # Store policy answer in Redis
                                                    save_policy_answer_to_redis(
                                                        params.user_unique_id, params.assistant_id, policy_qs,
                                                        policy_question, question_to_store, answer_value, dep["storyName"]
                                                    )
                                    else:
                                        # For non-dynamic items without affirmative_dependents, store in collected_pairs_dependent
                                        # using storyName from question object
                                        story_name = qs[0].get("storyName") if qs and qs[0] else ""
                                        if story_name:
                                            dep_key = story_name.lower()
                                            # Initialize collected_pairs_dependent for this dependent if not exists
                                            if dep_key not in collected_pairs_dependent:
                                                collected_pairs_dependent[dep_key] = []
                                            
                                            # Find original template question from policy_qs for individual summaries
                                            question_to_store = policy_question
                                            for p in policy_qs:
                                                if p.get("question", "").strip().lower() == policy_question.strip().lower():
                                                    question_to_store = p.get("question", policy_question)


                                                    break

                                            # Check if this question/answer pair already exists
                                            # # Do not add when invalid 
                                            if not invalid_user_response:
                                                # Remove any existing entry for this question so summary uses latest response
                                                collected_pairs_dependent[dep_key] = [
                                                    p for p in collected_pairs_dependent[dep_key]
                                                    if p.get("question") != question_to_store
                                                ]
                                                collected_pairs_dependent[dep_key].append({
                                                    "question": question_to_store,
                                                    "answer": answer_value
                                                })
                                                actually_extracted_count += 1

                                                # Store policy answer in Redis
                                                save_policy_answer_to_redis(
                                                    params.user_unique_id, params.assistant_id, policy_qs,
                                                    policy_question, question_to_store, answer_value, story_name
                                                )

                                                # Also store in conversation_history for summary generation
                                                formatted_question = policy_question.replace('{storyName}', story_name) if story_name else policy_question
                                                # Create a unique key for this policy question/answer pair to prevent duplicates
                                                policy_key = f"{formatted_question}|{answer_value}"
                                                # Check if this policy question/answer pair has already been processed
                                                if policy_key not in processed_policy_questions:
                                                    processed_policy_questions.add(policy_key)
                                                    entry_to_add = f"Bot: {formatted_question}/User: {answer_value}\n"
                                                    # Double-check if entry doesn't already exist in conversation_history
                                                    if entry_to_add not in session_data.get("conversation_history", ""):
                                                        session_data["conversation_history"] += entry_to_add

                        # if answers have been extracted for all depedents, then remove the policy question from pending_policy
                        # Only remove if collected_pairs_dependent is not empty AND answers exist for all dependents
                        # Previously, when is_dyanmic was False, there was no collected_pairs_dependent involved.
                        # Since key/vlaue pair required collected_pairs_dependent, it broke the logic that removed the policy question from pending_policy.
                        # Adding an additional check for is_dynamic to ensure the removing of policy question routes to the correct path
                        if collected_pairs_dependent and len(collected_pairs_dependent) > 0 and is_dynamic:
                            extracted_count = sum(1 for entries in collected_pairs_dependent.values() for entry in entries if entry.get('question') == policy_question)
                            # Only remove if we have answers for ALL dependents (and there are dependents)
                            if extracted_count == len(collected_pairs_dependent) and extracted_count > 0:
                                # Find and remove with case-insensitive comparison
                                policy_question_lower = policy_question.lower()
                                matching_item = next((item for item in pending_policy if item.lower() == policy_question_lower), None)
                                if matching_item:
                                    pending_policy.remove(matching_item)
                        else:
                            # When collected_pairs_dependent is None/empty, check conversation_history
                            # Loop through pending_policy and remove items found in conversation_history
                            conversation_history = session_data.get("conversation_history", "")
                            items_to_remove = []
                            for pending_item in pending_policy:
                                # Case-insensitive check if pending_item is in conversation_history
                                pending_item_lower = pending_item.lower()
                                if pending_item_lower in conversation_history.lower():
                                    items_to_remove.append(pending_item)
                            # Remove all matching items
                            for item in items_to_remove:
                                pending_policy.remove(item)
                    # Update Redis with modified pending_policy
                    self.redis_memory.hset(redis_user_key, "pending_policy_main_questions", json.dumps(pending_policy))
                    # # Override validation if extraction was successful AND we actually stored values
                    # # If we successfully extracted policy answers, the response is valid
                    # if invalid_user_response and actually_extracted_count > 0:
                    #     invalid_user_response = False
                    #     validation_status = "yes"
            
# =========================================================== Extraction End =========================================================================
        # Log user response for workbench
        if state == ConversationState.POLICY:
            if is_loop:
                params.item_id = json.loads(self.redis_memory.hget(redis_user_key, "unique_item_id") or "null")

            if not invalid_user_response:
                self._log_user_bot_exchange(
                    params, last_question, params.user_response, "",
                    selected_items_details=affirmative_dependents, qs=qs
                )
            else:
                # Server log only (not saved to Firestore to avoid polluting chat history)
                print(json.dumps({
                    "log_type": "invalid_response_retry",
                    "mode": "cluster",
                    "context": "policy",
                    "user_id": params.user_unique_id,
                    "question": last_question,
                    "user_response": params.user_response,
                    "invalid_count": invalid_count,
                    "validation_reply": validation_reply
                }), flush=True)
            
            # For non-loop items (non-dynamic), ensure policy answers are stored in conversation_history for summary generation.
            # For isLoop flows, extraction already writes the structured policy Q/A into conversation_history.
            # Appending the raw original_user_response here contaminates policy Q/A (e.g. specialty gets the
            # contact info appended).
            if not is_loop and not full_items and not has_question and not invalid_user_response:
                entry_to_add = f"Bot: {last_question}/User: {original_user_response}\n"
                # Check for duplicates before adding
                if entry_to_add not in session_data.get("conversation_history", ""):
                    session_data["conversation_history"] += entry_to_add
        else:
            if not has_question:
                # IMPORTANT: Ensure ALL dependents have their seed answers stored
                # When extraction_found is True, we already stored some answers above, but we need to ensure completeness
                if full_items:
                    for detail in full_items:
                        story_name = detail["storyName"].lower()
                        # If already stored from extraction, verify it has full information
                        # Otherwise, store from answers_map (which should have full parsed response)

                        # Not stored from extraction, store from answers_map
                        user_value = answers_map.get(story_name, "No")
                        user_value = "skip" if user_value == "error" else user_value

                        if story_name not in collected:
                            # Store original response for "no"/"skip" to preserve context for summary
                            if validation_status in ("no"):
                                # Check if story_name is found in parsed response
                                if story_name in parsed_user_response:
                                    collected[story_name] = parsed_user_response[story_name]
                                    user_value = parsed_user_response[story_name]
                                else:
                                    collected[story_name] = original_user_response
                                    user_value = original_user_response
                            else:
                                collected[story_name] = user_value

                        # the values in collected are correct, we don't want to store the original response 
                        # which can contain unwanted/unrelated information
                        else:
                            # a use case where it's not a dynamic function and the user's last response "validation_status" is "error"
                            # "collected" is not updated anywhere with the new user response - still maintains the previous one
                            # and will be incorreclty summarized in the final summary
                            if question_type == "seed" and not extraction_found and not invalid_user_response:
                                if validation_status == "skip":
                                    collected[story_name] = "skip"
                                else:
                                    collected[story_name] = answers_map.get(story_name, "No")
                                    
                        if is_loop:
                            params.item_id = json.loads(self.redis_memory.hget(redis_user_key, "unique_item_id") or "null")

                        if not invalid_user_response:
                            self._log_user_bot_exchange_multiple(
                                params, qs, user_value,
                                "Response to main question; triggering policy.",
                                selected_items_details=[detail]
                            )
                else:
                    if is_loop:
                        params.item_id = json.loads(self.redis_memory.hget(redis_user_key, "unique_item_id") or "null")

                    if not invalid_user_response:
                        self._log_user_bot_exchange(
                            params, qs, params.user_response, "", qs = qs
                        )
                    else:
                        # Server log only (not saved to Firestore to avoid polluting chat history)
                        print(json.dumps({
                            "log_type": "invalid_response_retry",
                            "mode": "cluster",
                            "context": "awaiting_answer",
                            "user_id": params.user_unique_id,
                            "question": last_question,
                            "user_response": params.user_response,
                            "invalid_count": invalid_count,
                            "validation_reply": validation_reply
                        }), flush=True)
          
        # Handle invalid user answers
        if invalid_user_response:
            invalid_count += 1
            if invalid_count >= MAX_INVALID_COUNT:
                # Force skip logic
                if policy_qs:
                    if full_items:
                        for item in affirmative_dependents:
                            current_dependent = item["storyName"].lower()

                            _answer = answers_map.get(current_dependent, "No") if answers_map else "error"
                            # Use original response if it was "no"/"skip", otherwise use "skip" for errors
                            answer_to_store = "skip" if _answer == "error" else _answer
                            # if validation_status in ("no", "skip"):
                            #     answer_to_store = original_user_response

                            # Find original template question from policy_qs for individual summaries
                            question_to_store = last_question
                            for p in policy_qs:
                                if p.get("question", "").strip().lower() == last_question.strip().lower():
                                    question_to_store = p.get("question", last_question)

                                    break

                            collected_pairs_dependent[current_dependent].append({
                                "question": question_to_store,
                                "answer": answer_to_store
                            })

                            # Store policy answer in Redis
                            save_policy_answer_to_redis(
                                params.user_unique_id, params.assistant_id, policy_qs,
                                last_question, question_to_store, answer_to_store, item["storyName"]
                            )
                    else:
                        entry_to_add = f"Bot: {last_question}/User: Skipped\n"
                        # Check for duplicates before adding
                        if entry_to_add not in session_data.get("conversation_history", ""):
                            session_data["conversation_history"] += entry_to_add
                else:
                    # Change "collected" to "skip" - not "no" when it was first initialized above
                    for k in collected:
                        collected[k] = "skip"

                force_skip_response = self._force_skip_and_move_on(
                    last_question, "Skipped", question_type,
                    params, qs, pending_policy, full_items, affirmative_dependents,
                    collected_pairs_dependent, collected, session_data, user_unique_id
                )
                
                state = ConversationState(force_skip_response["state"])
                invalid_count = force_skip_response["invalid_count"]
                full_question_obj = force_skip_response.get("full_question_obj")
                assistant_completed = force_skip_response["assistant_completed"]

                
                # Generate summary when answering second-to-last policy question OR last policy question (for force skip)
                if is_loop and isinstance(pending_policy_main_question, list) and len(pending_policy_main_question) >= 1:
                    is_second_to_last = len(pending_policy_main_question) >= 2 and last_question == pending_policy_main_question[-2]
                    is_last = len(pending_policy_main_question) >= 1 and last_question == pending_policy_main_question[-1]
                    
                    if is_second_to_last or is_last:
                        # Filter out the last policy question and "add another medication" question from conversation history before generating summary
                        policy_qs = qs[0].get("policiesQuestion", []) if qs else []
                        last_policy_question = self._get_last_policy_question(qs, policy_qs)
                        conversation_history = session_data.get("conversation_history", "")
                        filtered_history = self._filter_add_another_question(conversation_history, last_policy_question)
                        
                        bullet_summary = self.summary_service.generate_summary(
                            filtered_history, "", ConversationMode.CLUSTER, exclude_list=list(collected_pairs_dependent.keys()),
                            extra_info=extra_info
                        )

                        # Build policy info for cluster mode
                        unFilledPolicies = self.policy_service.build_policy_info_for_cluster(
                            policy_qs, collected_pairs_dependent, qs[0] if qs else None,
                            user_id=params.user_unique_id, assistant_id=params.assistant_id, use_optimized_context=True
                        )

                        self.database_service.update_database(
                            ConversationMode.CLUSTER, bullet_summary,
                            assistant_id=params.assistant_id, bearer_token=params.bearer_token,
                            item_id=item_id, unique_item_id = json.loads(self.redis_memory.hget(redis_user_key, "unique_item_id") or "null") if qs[0].get("isLoop", None) else None, is_loop = qs[0].get("isLoop", None), user_story_doc_id=qs[0].get("userStoryDocId", None),
                            chapter_doc_id=qs[0].get("chapterDocId", None), existing_item=existing_item,
                            unFilledPolicies=unFilledPolicies
                        )

                last_question = force_skip_response["last_question"]
                
                prompt = "All assistant items completed" if assistant_completed else last_question
                
                force_skip_executed = True
                # Capture item name we just recorded so completion message shows only after new seed
                if state == ConversationState.AWAITING_ANSWER and not assistant_completed and full_question_obj and qs:
                    just_recorded_item_name = (qs[0].get("itemName") or "") if not qs[0].get("isLoop") else (self.redis_memory.hget(redis_user_key, "previous_item_name") or "")
                    question_type = "seed"  # Response will be for new seed (so that we can build completion message correctly)

                # Reset variables for new seed question
                if state == ConversationState.AWAITING_ANSWER and not assistant_completed:
                    session_data["conversation_history"] = ""
                    session_data["main_question_response"] = ""
                    full_items = []
                    pending_policy = []
                    extra_info = {}
                    self.redis_memory.hset(redis_user_key, "pending_policy_main_questions", json.dumps([]))
                    # Reset item-specific Redis variables for new seed question
                    self.redis_memory.hset(redis_user_key, "previous_item_name", "")
                    self.redis_memory.hset(redis_user_key, "unique_item_id", json.dumps(None))
                    self.set_bool(redis_user_key, "existing", False)
                    affirmative_dependents = []
                    collected_pairs_dependent = {}
                    collected = {}
                
                if full_question_obj:
                    qs = full_question_obj

                if is_loop and assistant_completed:
                    state = ConversationState.AWAITING_QUESTION
        
        # Process valid responses
        if not invalid_user_response and not has_question:
            pending_policy_main_question = json.loads(self.redis_memory.hget(redis_user_key, "pending_policy_main_questions") or "null")
            
            # This part is used for item cloning functionality
            if params.function_flow and validation_status not in ("skip", "no") and not existing_item_id and not existing_item:
                for flow_items in params.function_flow:
                    if flow_items["event"] == "after":

                        # extract_item = extract_item_name_from_response(params.user_response, main_question_text)
                        if extract_item and extract_item.get("success") and extract_item_name:
                            get_unique_item_id = json.loads(self.redis_memory.hget(redis_user_key, "unique_item_id") or "null")
                            if not get_unique_item_id:
                                get_unique_item_id = int(time.time())
                                self.redis_memory.hset(redis_user_key, "unique_item_id", json.dumps(get_unique_item_id))
                            json_payload = {
                                "docId": qs[0].get("userStoryDocId"),
                                "chapterDocId": qs[0].get("chapterDocId"),
                                "itemId": get_unique_item_id,
                                "itemType": "item",
                                "type": "text",
                                "functionId": flow_items["functionId"],
                                "itemName": extract_item_name,
                                "chapterId": qs[0].get("chapterId"),
                                "seedItemId": qs[0].get("itemId")
                            }
                            try:
                                clone_item_api_response = clone_new_item_through_assistant(json_paylod=json_payload, bearer_token=params.bearer_token)
                            except Exception as e:
                                logging.error(f"Failed to clone item through assistant: {str(e)}")
                                logging.error(f"Payload: {json.dumps(json_payload, indent=2)}")
                                invalid_user_response = True
                                validation_reply = "I apologize, but there was an issue processing your request. Please try again."
                                clone_item_api_response = None

                        else:
                            invalid_user_response = True
                            validation_reply = extract_item.get("error_message") if extract_item else "Unable to extract item name"

            # Save policy answer first before moving on
            # When extraction_found is False: store for all dependents (original behaviour).
            # When extraction_found is True: backfill only dependents that extraction missed
            # (e.g. LLM returned "n/a" for one dependent's skip, which got filtered out).
            # Duplicate check prevents double-entries.
            if policy_qs and state == ConversationState.POLICY:
                if full_items and affirmative_dependents:
                    # Find original template question from policy_qs for individual summaries
                    question_to_store = last_question
                    for p in policy_qs:
                        if p.get("question", "").strip().lower() == last_question.strip().lower():
                            question_to_store = p.get("question", last_question)

                            break

                    for item in affirmative_dependents:
                        current_dependent = item["storyName"].lower()

                        # # Do not add to collected_pairs_dependent when invalid 
                        if invalid_user_response:
                            continue

                        # If this person already has a meaningful answer extracted from a prior
                        # response, the question was never actually asked for them — skip entirely.
                        # Use case-insensitive comparison to handle casing differences between
                        # the stored question (original template casing) and question_to_store.
                        existing_entry = next(
                            (p for p in collected_pairs_dependent.get(current_dependent, [])
                             if p.get("question", "").strip().lower() == question_to_store.strip().lower()),
                            None
                        )
                        if existing_entry and existing_entry["answer"].strip().lower() not in ("", "skip"):
                            continue

                        # Remove any existing entry for this question so summary uses latest response
                        # Case-insensitive remove to match the guard above.
                        collected_pairs_dependent[current_dependent] = [
                            p for p in collected_pairs_dependent.get(current_dependent, [])
                            if p.get("question", "").strip().lower() != question_to_store.strip().lower()
                        ]
                        _answer = answers_map.get(current_dependent, "No")
                        # Use original response for "no"/"skip" to preserve context for summary
                        answer_to_store = "skip" if _answer == "error" else _answer
                        if validation_status in ("no"):
                            # Check if current_dependent is found in parsed response
                            if current_dependent in parsed_user_response:
                                answer_to_store = parsed_user_response[current_dependent]
                            else:
                                answer_to_store = original_user_response

                        collected_pairs_dependent[current_dependent].append({
                            "question": question_to_store,
                            "answer": answer_to_store
                        })

                        # Store policy answer in Redis
                        save_policy_answer_to_redis(
                            params.user_unique_id, params.assistant_id, policy_qs,
                            last_question, question_to_store, answer_to_store, item["storyName"]
                        )
                elif not full_items:
                    # For non-loop items (non-dynamic), store policy answers in both collected_pairs_dependent and conversation_history
                    story_name = qs[0].get("storyName") if qs and qs[0] else ""
                    if story_name:
                        dep_key = story_name.lower()
                        # Initialize collected_pairs_dependent for this dependent if not exists
                        if dep_key not in collected_pairs_dependent:
                            collected_pairs_dependent[dep_key] = []
                        
                        # Find original template question from policy_qs for individual summaries
                        question_to_store = last_question
                        for p in policy_qs:
                            if p.get("question", "").strip().lower() == last_question.strip().lower():
                                question_to_store = p.get("question", last_question)
                                
                                break


                        # # Do not add when invalid 
                        if not invalid_user_response:
                            # Remove any existing entry for this question so summary uses latest response 
                            collected_pairs_dependent[dep_key] = [
                                p for p in collected_pairs_dependent[dep_key]
                                if p.get("question") != question_to_store
                            ]

                            collected_pairs_dependent[dep_key].append({
                                "question": question_to_store,
                                "answer": original_user_response
                            })

                            # Store policy answer in Redis
                            save_policy_answer_to_redis(
                                params.user_unique_id, params.assistant_id, policy_qs,
                                last_question, question_to_store, original_user_response, story_name
                            )

                    # Also store in conversation_history for summary generation
                    # For isLoop/non-dynamic flows, extraction already writes the structured
                    # policy Q/A into conversation_history. Appending the raw
                    # original_user_response here causes contamination like:
                    #   specialty -> "Physician, he can be contacted at ...",
                    #   then specialty again -> duplicate bullet.
                    if not is_loop and not has_question and not invalid_user_response:
                        entry_to_add = f"Bot: {last_question}/User: {original_user_response}\n"
                        # Check for duplicates before adding
                        if entry_to_add not in session_data.get("conversation_history", ""):
                            session_data["conversation_history"] += entry_to_add
            
            # next_policy_index = None
            # for i, policy_obj in enumerate(policy_qs):
            #     # Already answered? skip
            #     if policy_obj.get("executionResult"):
            #         continue

            #     # Check conditions
            #     if not check_policy_conditions(policy_obj, policy_qs):
            #         policy_obj["executionResult"] = "Skipped (condition not met)"
            #         continue

            #     # This is the next unanswered, condition-passing policy question
            #     next_policy_index = i
            #     break

            if not invalid_user_response:
                
                # For updating the item before asking the last policy question in the item cloning functionality
                # Generate summary when answering second-to-last policy question OR last policy question
                # Refresh pending_policy_main_question to ensure we have the latest state
                pending_policy_main_question_refreshed = json.loads(self.redis_memory.hget(redis_user_key, "pending_policy_main_questions") or "null")
                if is_loop and isinstance(pending_policy_main_question_refreshed, list) and len(pending_policy_main_question_refreshed) >= 1:
                    is_second_to_last = len(pending_policy_main_question_refreshed) >= 2 and last_question == pending_policy_main_question_refreshed[-2]
                    is_last = len(pending_policy_main_question_refreshed) >= 1 and last_question == pending_policy_main_question_refreshed[-1]
                    # Also check if pending_policy is empty (all questions answered) and we're in POLICY state
                    pending_policy_check = json.loads(self.redis_memory.hget(redis_user_key, "pending_policy_main_questions") or "null")
                    is_all_answered = (not pending_policy_check or len(pending_policy_check) == 0) and state == ConversationState.POLICY
                    
                    if is_second_to_last or is_last or is_all_answered:
                        # Filter out the last policy question and "add another medication" question from conversation history before generating summary
                        policy_qs = qs[0].get("policiesQuestion", []) if qs else []
                        last_policy_question = self._get_last_policy_question(qs, policy_qs)
                        conversation_history = session_data.get("conversation_history", "")
                        filtered_history = self._filter_add_another_question(conversation_history, last_policy_question)
                        
                        bullet_summary = self.summary_service.generate_summary(
                            filtered_history, "", ConversationMode.CLUSTER, exclude_list=list(collected_pairs_dependent.keys()) if collected_pairs_dependent else [],
                            extra_info=extra_info
                        )

                        # Build policy info for cluster mode
                        unFilledPolicies = self.policy_service.build_policy_info_for_cluster(
                            policy_qs, collected_pairs_dependent, qs[0] if qs else None,
                            user_id=params.user_unique_id, assistant_id=params.assistant_id, use_optimized_context=True
                        ) if collected_pairs_dependent else []

                        self.database_service.update_database(
                            ConversationMode.CLUSTER, bullet_summary,
                            assistant_id=params.assistant_id, bearer_token=params.bearer_token,
                            item_id=item_id, unique_item_id = json.loads(self.redis_memory.hget(redis_user_key, "unique_item_id") or "null") if qs[0].get("isLoop", None) else None, is_loop = qs[0].get("isLoop", None), user_story_doc_id=qs[0].get("userStoryDocId", None),
                            chapter_doc_id=qs[0].get("chapterDocId", None), existing_item = existing_item,
                            unFilledPolicies=unFilledPolicies
                        )

                # Check if user denied update using keyword matching (more robust than exact string match)
                duplicate_check_keywords = ["found an item", "already matches", "update the existing", "already exists"]
                is_duplicate_check_question = any(kw in last_question.lower() for kw in duplicate_check_keywords)
                user_denied_update = (is_loop and existing_item and validation_status.lower() in ("skip", "no") and is_duplicate_check_question)

                if user_denied_update:
                    # User declined to update existing item - reset state and ask for new medication
                    prompt = qs[0].get("backendQuestions")
                    state = ConversationState.AWAITING_ANSWER
                    session_data["conversation_history"] = ""
                    extra_info = {}
                    self.redis_memory.hset(redis_user_key, "pending_policy_main_questions", json.dumps([]))
                    self.redis_memory.hset(redis_user_key, "previous_item_name", "")
                    self.redis_memory.hset(redis_user_key, "unique_item_id", json.dumps(None))
                    self.set_bool(redis_user_key, "existing", False)
                    
                else:
                    # Refresh pending_policy from Redis to ensure we have the latest state
                    # (in case it was modified during extraction or other processing)
                    pending_policy = json.loads(self.redis_memory.hget(redis_user_key, "pending_policy_main_questions") or "null")
                    if not isinstance(pending_policy, list):
                        pending_policy = []
                    
                    # Check for more policy questions
                    # Allow transition from seed to policy when validation_status is "yes" (not skip/no)
                    # OR when already in POLICY state and validation_status is skip/no
                    can_ask_policy = (
                        (validation_status not in ("skip", "no")) or 
                        (validation_status in ("skip", "no") and state == ConversationState.POLICY)
                    )
                    
                    if pending_policy and can_ask_policy:
                        # When transitioning from seed to policy questions, ensure duplicate check question is asked first if item exists
                        if question_type == 'seed' and existing_item_id and is_loop and existing_item:
                            # Ensure duplicate check question is first in pending_policy
                            duplicate_check_keywords = ["found an item", "already matches", "update the existing"]
                            first_question = pending_policy[0].lower() if pending_policy else ""
                            is_duplicate_check = any(keyword in first_question for keyword in duplicate_check_keywords)
                            if not is_duplicate_check and len(pending_policy) > 1:
                                # Find and move duplicate check question to front
                                for i, question in enumerate(pending_policy):
                                    question_lower = question.lower()
                                    if any(keyword in question_lower for keyword in duplicate_check_keywords):
                                        pending_policy.insert(0, pending_policy.pop(i))
                                        # Update Redis with reordered questions
                                        self.redis_memory.hset(redis_user_key, "pending_policy_main_questions", json.dumps(pending_policy))
                                        break
                        
                        prompt = pending_policy.pop(0) if pending_policy else "Policy questions completed, but something went wrong. Moving on."
                        if prompt:
                            session_data["current_policy_original_question"] = prompt
                        # Policy question personalization moved to after dynamicFunctionData filter (uses correct filtered result)

                        # Update Redis with the modified pending_policy after popping the question
                        self.redis_memory.hset(redis_user_key, "pending_policy_main_questions", json.dumps(pending_policy))
                        invalid_count = 0
                        state = ConversationState.POLICY
                                
                    else:
                        # All policy questions have been answered
                        # For loop items, generate summary if not already generated (skip if user denied update)
                        if is_loop and not full_items:
                            # Check if summary was already generated above (line 1022-1037)
                            # If not, generate it now since all questions are answered
                            pending_policy_final_check = json.loads(self.redis_memory.hget(redis_user_key, "pending_policy_main_questions") or "null")
                            if not pending_policy_final_check or len(pending_policy_final_check) == 0:
                                # All questions answered, generate summary
                                # Get the last policy question to exclude from summary (for loop/cloning scenarios)
                                policy_qs = qs[0].get("policiesQuestion", []) if qs else []
                                last_policy_question = self._get_last_policy_question(qs, policy_qs)
                                
                                # Filter out the last policy question and "add another medication" question from conversation history before generating summary
                                conversation_history = session_data.get("conversation_history", "")
                                filtered_history = self._filter_add_another_question(conversation_history, last_policy_question)
                                
                                bullet_summary = self.summary_service.generate_summary(
                                    filtered_history, "", ConversationMode.CLUSTER, exclude_list=list(collected_pairs_dependent.keys()) if collected_pairs_dependent else [],
                                    extra_info=extra_info
                                )

                                # Build policy info for cluster mode
                                unFilledPolicies = self.policy_service.build_policy_info_for_cluster(
                            policy_qs, collected_pairs_dependent, qs[0] if qs else None,
                            user_id=params.user_unique_id, assistant_id=params.assistant_id, use_optimized_context=True
                        ) if collected_pairs_dependent else []

                                self.database_service.update_database(
                                    ConversationMode.CLUSTER, bullet_summary,
                                    assistant_id=params.assistant_id, bearer_token=params.bearer_token,
                                    item_id=item_id, unique_item_id = json.loads(self.redis_memory.hget(redis_user_key, "unique_item_id") or "null") if qs[0].get("isLoop", None) else None, is_loop = qs[0].get("isLoop", None), user_story_doc_id=qs[0].get("userStoryDocId", None),
                                    chapter_doc_id=qs[0].get("chapterDocId", None), existing_item = existing_item,
                                    unFilledPolicies=unFilledPolicies
                                )
                        
                        # Ready to save data to firestore

                        if full_items:
                            structured_kv_response = {}
                            conversation_str = ""

                            # remove duplicate entries
                            if policy_qs:
                                for _storyName in collected_pairs_dependent:
                                    seen = {}
                                    unique_entries = []
                                    for entry in collected_pairs_dependent[_storyName]:
                                        question = entry.get('question')
                                        if question not in seen:
                                            seen[question] = True
                                            unique_entries.append(entry)
                                    collected_pairs_dependent[_storyName] = unique_entries

                            for detail in full_items:
                                story_name = detail['storyName']
                                story_name_lower = story_name.lower()
                                # Safely get user_answer from collected, with fallback to prevent KeyError
                                user_answer = collected.get(story_name_lower, params.user_response if not full_items else "No")
                                # Use original (non-personalized) question for summary (Approach 1)
                                bot_question = qs[0].get("originalBackendQuestions", qs[0].get("backendQuestions", ""))
                                item_name = qs[0]["itemName"]
                                context_key_question = insert_placeholder_values(qs[0], bot_question)
                                conversation_str = f"Bot:{context_key_question}/User: {user_answer}\n"

                                if policy_qs:
                                    last_policy_question = self._get_last_policy_question(qs, policy_qs)
                                    dependent_policy_pairs = collected_pairs_dependent.get(story_name.lower(), [])
                                    for pair in dependent_policy_pairs:
                                        pair_question = pair.get('question', '')
                                        # Skip the last policy question if it's a loop scenario
                                        if last_policy_question and pair_question.strip().lower() == last_policy_question.strip().lower():
                                            continue
                                        context_key_question = insert_placeholder_values(qs[0], pair_question)
                                        conversation_str += f"Bot: {context_key_question}/User: {pair['answer']}\n"

                                # Filter out the last policy question and "add another medication" question before generating summary
                                last_policy_question = self._get_last_policy_question(qs, policy_qs) if policy_qs else None
                                filtered_conversation_str = self._filter_add_another_question(conversation_str, last_policy_question)
                                # Pass only this person's extra_info to avoid cross-contamination between dependents
                                person_extra_info = next((v for k, v in extra_info.items() if k.lower() == story_name.lower()), [])
                                item_summary = self.summary_service.generate_summary(filtered_conversation_str, item_name="", exclude_list=list(collected_pairs_dependent.keys()), summary_for_person=story_name, extra_info=person_extra_info)
                                structured_kv_response[story_name] = item_summary.strip("- ").strip()
                            
                            # Build policy info for cluster mode
                            policy_qs = qs[0].get("policiesQuestion", []) if qs else []
                            unFilledPolicies = self.policy_service.build_policy_info_for_cluster(
                            policy_qs, collected_pairs_dependent, qs[0] if qs else None,
                            user_id=params.user_unique_id, assistant_id=params.assistant_id, use_optimized_context=True
                        )
                            
                            self.database_service.update_bulk_database(
                                structured_kv_response, full_items, params.assistant_id, params.bearer_token, item_id,
                                unFilledPolicies=unFilledPolicies
                            )
                        else:
                            
                            if not is_loop:
                                # No dynamic function data
                                # Get the last policy question to exclude from summary (for loop/cloning scenarios)
                                policy_qs = qs[0].get("policiesQuestion", []) if qs else []
                                last_policy_question = self._get_last_policy_question(qs, policy_qs)
                                
                                # Filter out the last policy question and "add another medication" question from conversation history before generating summary
                                conversation_history = session_data.get("conversation_history", "")
                                filtered_history = self._filter_add_another_question(conversation_history, last_policy_question)
                                
                                bullet_summary = self.summary_service.generate_summary(
                                    filtered_history, "", ConversationMode.CLUSTER, exclude_list=list(collected_pairs_dependent.keys()),
                                    extra_info=extra_info
                                )

                                # Build policy info for cluster mode
                                unFilledPolicies = self.policy_service.build_policy_info_for_cluster(
                            policy_qs, collected_pairs_dependent, qs[0] if qs else None,
                            user_id=params.user_unique_id, assistant_id=params.assistant_id, use_optimized_context=True
                        )

                                self.database_service.update_database(
                                    ConversationMode.CLUSTER, bullet_summary,
                                    assistant_id=params.assistant_id, bearer_token=params.bearer_token,
                                    item_id=item_id, unique_item_id = json.loads(self.redis_memory.hget(redis_user_key, "unique_item_id") or "null") if qs[0].get("isLoop", None) else None, is_loop = qs[0].get("isLoop", None), user_story_doc_id=qs[0].get("userStoryDocId", None),
                                    chapter_doc_id=qs[0].get("chapterDocId", None),
                                    unFilledPolicies=unFilledPolicies
                                )

                        next_res = {}
                        if pending_policy_main_question and last_question == pending_policy_main_question[-1] and validation_status.lower() in ("skip", "no"):
                            if not qs[0].get("nextStoryDocId", None) and is_loop:
                                next_res["completed"] = True
                            else:
                                next_res = get_unfilled_cluster_assistant_question(params.assistant_id, params.bearer_token, next_story_doc_id = qs[0].get("nextStoryDocId", None))
                        else:
                            user_story_doc_id = None
                            next_story_doc_id = None
                            if qs[0].get("functionFlow"):
                                if qs[0].get("functionFlow")[0].get("event") == "after" and validation_status.lower() == "yes":
                                    user_story_doc_id = qs[0].get("userStoryDocId", None)
                                    next_res = get_unfilled_cluster_assistant_question(params.assistant_id, params.bearer_token, current_story_doc_id = user_story_doc_id, next_story_doc_id=next_story_doc_id)

                                elif qs[0].get("functionFlow")[0].get("event") == "after" and validation_status.lower() in ("skip", "no"):
                                    next_story_doc_id = qs[0].get("nextStoryDocId", None)
                                    if is_loop and not next_story_doc_id:
                                        next_res["completed"] = True
                                    else:
                                        next_res = get_unfilled_cluster_assistant_question(params.assistant_id, params.bearer_token, current_story_doc_id = user_story_doc_id, next_story_doc_id=next_story_doc_id)

                                else:
                                    next_res = get_unfilled_cluster_assistant_question(params.assistant_id, params.bearer_token, current_story_doc_id = user_story_doc_id, next_story_doc_id=next_story_doc_id)
                                  
                            else:
                                next_res = get_unfilled_cluster_assistant_question(params.assistant_id, params.bearer_token, current_story_doc_id = user_story_doc_id, next_story_doc_id=next_story_doc_id)
                                
                                    
                        
                        # Reset variables and check completion
                        invalid_count = 0
                        session_data["conversation_history"] = ""
                        
                        if next_res.get("completed"):
                            prompt = "✅ Your response for this assistant has been recorded in the organizer."
                            state = ConversationState.AWAITING_ANSWER if not is_loop else ConversationState.AWAITING_QUESTION
                            collected = {}
                            pending_policy = []
                            extra_info = {}
                            self.redis_memory.hset(redis_user_key, "pending_policy_main_questions", json.dumps([]))
                            # Reset item-specific Redis variables when completed
                            self.redis_memory.hset(redis_user_key, "previous_item_name", "")
                            self.redis_memory.hset(redis_user_key, "unique_item_id", json.dumps(None))
                            self.set_bool(redis_user_key, "existing", False)
                            full_items = []
                            collected_pairs_dependent = {}
                            item_id = None
                            qs = []
                        else:
                            # Capture item name we just recorded so completion message shows only with new seed
                            # Don't show completion message if user denied update (nothing was recorded)
                            just_recorded_item_name = (qs[0].get("itemName") or "") if not qs[0].get("isLoop") else (self.redis_memory.hget(redis_user_key, "previous_item_name") or "")

                            # Get questions for next item
                            questions = next_res["questions"]
                            qs = questions
                            nq = qs[0]
                            next_question = nq.get("backendQuestions") or generate_question(nq["itemName"], nq["context"])

                            # Personalize the new seed question
                            if next_question and params.user_unique_id and params.assistant_id:
                                try:
                                    from src.services.question_personalization_service import QuestionPersonalizationService
                                    personalizer = QuestionPersonalizationService()
                                    dynamic_func_data = nq.get("dynamicFunctionData")
                                    # Preserve original template
                                    if "originalBackendQuestions" not in nq:
                                        nq["originalBackendQuestions"] = next_question
                                    original_template = nq.get("originalBackendQuestions", next_question)
                                    personalized_question = personalizer.personalize_question(
                                        original_question=original_template,
                                        dynamic_function_data=dynamic_func_data,
                                        user_id=params.user_unique_id,
                                        assistant_id=params.assistant_id,
                                        story_type=nq.get("story"),
                                        question_node=nq
                                    )
                                    next_question = personalized_question
                                    nq["backendQuestions"] = personalized_question
                                except Exception as e:
                                    # Don't fail if personalization fails - use original question
                                    pass

                            # Add completion message before next question
                            # completion_message = CONST_ITEM_COMPLETION_MESSAGE.format(item_name=current_item_name)
                            # prompt = f"{completion_message}\n\n{next_question}"
                            prompt = f"{next_question}"
                            
                            # Response will be for new seed (so that we can build completion message correctly)
                            question_type = "seed"
                            state = ConversationState.AWAITING_ANSWER
                            affirmative_dependents = []
                            full_items = []
                            collected_pairs_dependent = {}
                            pending_policy = []
                            extra_info = {}
                            self.redis_memory.hset(redis_user_key, "pending_policy_main_questions", json.dumps([]))
                            # Reset item-specific Redis variables when moving to next question
                            self.redis_memory.hset(redis_user_key, "previous_item_name", "")
                            self.redis_memory.hset(redis_user_key, "unique_item_id", json.dumps(None))
                            self.set_bool(redis_user_key, "existing", False)
        done = prompt.startswith(("✅ Your response has been recorded in the organizer.", "Your response has been recorded in the organizer.", "All assistant items completed"))
        
        # Setup proper messaging for invalid answers or user questions
        if (invalid_user_response or has_question) and not force_skip_executed:
            item_name, context = safe_get_item_context(qs)
            query_response = query_resolver(last_question, context, params.user_response)
            personlize_question = personlize_question_for_error_question_case(question_type, qs, last_question, params)
            prompt = f"⚠️ {validation_reply}\n\n🔄 Let's try again:\n{personlize_question}" if not force_skip_executed else validation_reply

            if has_question:
                prompt = f"💡 {query_response}\n\n🔄 To continue:\n{personlize_question}"
                
        # Build response structure
        resp = self._build_cluster_response(
            done, prompt, has_question, invalid_user_response, force_skip_executed,
            validation_reply, item_id, state, qs, affirmative_dependents, last_question, pending_policy_main_question, session_data, question_type, current_question,
            validation_status, user_unique_id,
            just_recorded_item_name=just_recorded_item_name, redis_user_key = redis_user_key
        )

        # Manipulate dynamicFunctionData, remove the "storyName" that has data extracted 
        if state == ConversationState.POLICY:
            # Check if pending_policy_main_question is a list
            if isinstance(pending_policy_main_question, list) and len(pending_policy_main_question) > 0:
                # pair["question"] is stored as original; compare with original policy question (Approach 1)
                question_for_match = session_data.get("current_policy_original_question") or prompt
                matching_keys = []
                for key, pairs in collected_pairs_dependent.items():
                    if isinstance(pairs, list):
                        for pair in pairs:
                            if isinstance(pair, dict) and pair.get("question") == question_for_match:
                                if key not in matching_keys:
                                    matching_keys.append(key)
                                break
                
                # If matching keys are found, remove items from dynamicFunctionData where storyName matches any of them
                if matching_keys and resp.get("dynamicFunctionData") and not invalid_user_response and not has_question:
                    dynamic_func_data = resp["dynamicFunctionData"]
                    if isinstance(dynamic_func_data, dict):
                        result = dynamic_func_data.get("result")
                        if isinstance(result, list):
                            # Filter out items where storyName (lowercase) matches any of the matching keys
                            matching_keys_lower = [key.lower() for key in matching_keys]
                            filtered_result = [
                                item for item in result
                                if isinstance(item, dict) and item.get("storyName", "").lower() not in matching_keys_lower
                            ]
                            dynamic_func_data["result"] = filtered_result
                            # If result becomes empty, set dynamicFunctionData to None
                            if len(filtered_result) == 0:
                                resp["dynamicFunctionData"] = None

        # Personalize policy question using the final dynamicFunctionData (filtered result we send in response)
        # This ensures question text matches the list shown (e.g. "Josephine" not "Kimberly and Josephine" when Kimberly already answered)
        if (
            state == ConversationState.POLICY
            and not invalid_user_response
            and not has_question
            and params.user_unique_id
            and params.assistant_id
        ):
            template = session_data.get("current_policy_original_question")
            dynamic_data_for_personalize = resp.get("dynamicFunctionData")
            # Fallback for single affirmative: dynamicFunctionData is None but we still need to personalize
            if not dynamic_data_for_personalize and affirmative_dependents and len(affirmative_dependents) == 1:
                dynamic_data_for_personalize = {"result": affirmative_dependents, "success": True}
            if template and dynamic_data_for_personalize and isinstance(dynamic_data_for_personalize, dict) and dynamic_data_for_personalize.get("result"):
                try:
                    from src.services.question_personalization_service import QuestionPersonalizationService
                    personalizer = QuestionPersonalizationService()
                    personalized = personalizer.personalize_single_question(
                        question_text=template,
                        dynamic_function_data=dynamic_data_for_personalize,
                        user_id=params.user_unique_id,
                        assistant_id=params.assistant_id,
                        story_type=qs[0].get("story") if qs else None,
                        question_node=qs[0] if qs else None
                    )
                    if personalized and personalized.strip():
                        personalized_with_placeholders = insert_placeholder_values(qs[0], personalized) if qs else personalized
                        old_context_key = insert_placeholder_values(qs[0], prompt) if qs else prompt
                        if old_context_key in resp.get("question", ""):
                            resp["question"] = resp["question"].replace(old_context_key, personalized_with_placeholders, 1)
                except Exception:
                    pass  # Don't fail if personalization fails - keep original

        prompt = (prompt if not invalid_user_response and not has_question else last_question)


        if not prompt and is_loop:
            prompt = "✅ Your response for this assistant has been recorded in the organizer."

        # Resolve prompt to original (non-personalized) version for session storage
        # If in policy state, use the stored original policy question; otherwise use original seed question
        original_prompt = prompt
        if state == ConversationState.POLICY and session_data.get("current_policy_original_question"):
            original_prompt = session_data.get("current_policy_original_question")
        elif state == ConversationState.AWAITING_ANSWER and qs and isinstance(qs, list) and qs[0]:
            # Always read from the current qs[0] (which may have been updated during this turn
            # when transitioning to a new seed question), not from main_question_text which could be stale
            original_prompt = qs[0].get("originalBackendQuestions", qs[0].get("backendQuestions", prompt))

        # Update session
        dynamic_data = (qs[0].get("dynamicFunctionData") or {}).get("result", []) if qs else []
        self._update_cluster_session(
            params, original_prompt, state, collected, pending_policy, full_items,
            affirmative_dependents, collected_pairs_dependent, invalid_count,
            qs, session_data.get("conversation_history", ""), resp, previous_item_name, user_unique_id, dynamic_data,
            current_policy_original_question=session_data.get("current_policy_original_question"),
            extra_info=extra_info, redis_user_key = redis_user_key
        )
        
        # Note: Conversation storage now handled by optimized format
        # Seed questions and policy answers are stored via append_seed_question_to_context()
        # and append_policy_answer_to_context() respectively
        
        return resp
    
    def _force_skip_and_move_on(
        self, skipped_question: str, item_summary: str, question_type: str,
        params: UserResponseParams, qs: List[Dict], pending_policy: List[str],
        full_items: List[Dict], affirmative_dependents: List[Dict],
        collected_pairs_dependent: Dict, collected: Dict, session_data: Dict[str, Any], user_unique_id, redis_user_key: str = ""
    ) -> Dict[str, Any]:
        """Force skip current question and move on."""
        
        base_message = "It seems I've had some difficulty with this one"
        retry_message = ". Let's move on to the next question. "
        complete_message = "; although all questions have been completed. Feel free to return to this question through the organizer if you'd like to revise your response."
        return_question = ""
        assistant_completed = False
        
        if question_type == "seed":
            is_loop = False
        
            if full_items:
                context_key_question = skipped_question
                if qs:
                    context_key_question = insert_placeholder_values(qs[0], skipped_question)
                    is_loop = qs[0].get("isLoop")

                    if is_loop:
                        params.item_id = json.loads(self.redis_memory.hget(redis_user_key, "unique_item_id") or "null")
                        # next_story_doc_id = qs[0].get("nextStoryDocId")

                    # update the questions list of dictionaries with placholder values
                    qs[0]["backendQuestions"] = context_key_question

                if not is_loop:
                    self._log_user_bot_exchange_multiple(
                        params, qs, item_summary, 
                        f"Force skipped after {MAX_INVALID_COUNT} invalid attempts",
                        selected_items_details=full_items
                    )
                    

                    self._update_bulk_cluster_database(
                        full_items, collected, collected_pairs_dependent, qs,
                        params.assistant_id, params.bearer_token, qs[0]["itemId"], params.user_unique_id
                    )
            else:
                context_key_question = ""
                next_story_doc_id = None
                if qs:
                    # Always call insert_placeholder_values to ensure placeholders are replaced
                    context_key_question = insert_placeholder_values(qs[0], qs[0].get("backendQuestions"))
                    # update the questions list of dictionaries with placholder values
                    qs[0]["backendQuestions"] = context_key_question
                    is_loop = qs[0].get("isLoop")

                    if is_loop:
                        unique_item_id = json.loads(self.redis_memory.hget(redis_user_key, "unique_item_id") or "null")
    
                        params.item_id = unique_item_id
                        qs[0]["itemId"] = unique_item_id
                        next_story_doc_id = qs[0].get("nextStoryDocId")
                

                # To restric to update the logs and db in case of item cloning if bot forcely skip the seed question in item cloning
                if not is_loop:
                    self._log_user_bot_exchange(
                        params, qs, item_summary, 
                        f"Force skipped after {MAX_INVALID_COUNT} invalid attempts",
                        selected_items_details=full_items, qs = qs
                    )
                    
                    # Build policy info for cluster mode
                    policy_qs = qs[0].get("policiesQuestion", []) if qs else []
                    unFilledPolicies = self.policy_service.build_policy_info_for_cluster(
                        policy_qs, collected_pairs_dependent, qs[0] if qs else None,
                        user_id=params.user_unique_id, assistant_id=params.assistant_id, use_optimized_context=True
                    )
                    
                    self.database_service.update_database(
                        ConversationMode.CLUSTER, item_summary,
                        assistant_id=params.assistant_id, bearer_token=params.bearer_token,
                        item_id=qs[0]["itemId"], user_story_doc_id=qs[0].get("userStoryDocId", None),
                        chapter_doc_id=qs[0].get("chapterDocId", None),
                        unFilledPolicies=unFilledPolicies
                    )
            
            # Get current item name before fetching next question
            # current_item_name = qs[0].get("itemName", "this item") if qs else "this item"
            
            next_question_obj = None
            if not is_loop:
                next_question_obj = self.question_service.fetch_next_question(
                    ConversationMode.CLUSTER, assistant_id=params.assistant_id,
                    bearer_token=params.bearer_token,
                    user_id=params.user_unique_id, personalize=True
                )
            elif is_loop and next_story_doc_id:
                next_question_obj = self.question_service.fetch_next_question(
                    ConversationMode.CLUSTER, assistant_id=params.assistant_id,
                    bearer_token=params.bearer_token, next_story_doc_id = next_story_doc_id,
                    user_id=params.user_unique_id, personalize=True

                )
            elif is_loop and not next_story_doc_id:
                next_question_obj = None

            if next_question_obj:
                next_q = next_question_obj.get("question")
                policy = next_question_obj.get("policy")
                new_q_obj = next_question_obj.get("question_obj")
                full_question_obj = next_question_obj.get("full_question_obj")
                
                context_key_question = next_q
                if full_question_obj:
                    qs = full_question_obj
                    # Always call insert_placeholder_values to ensure placeholders are replaced
                    context_key_question = insert_placeholder_values(qs[0], next_q)

                if next_q:
                    # Add completion message before moving to next question
                    # completion_message = CONST_ITEM_COMPLETION_MESSAGE.format(item_name=current_item_name)
                    ResponseToUser.next_question= f"{base_message} {retry_message}{context_key_question}"
                    return_question = context_key_question
                    assistant_completed = True if next_q.startswith("All assistant items completed successfully") else False
                else:
                    ResponseToUser.bot_response = f"{base_message} {complete_message}"
                    assistant_completed = True

            else:
                ResponseToUser.bot_response = f"{base_message} {complete_message}"
                assistant_completed = True
        
        else:  # policy question

            context_key_question = skipped_question
            is_loop = False
            if qs:
                # Skip placeholder replacement if question was already personalized by LLM
                # Always call insert_placeholder_values to ensure placeholders are replaced
                context_key_question = insert_placeholder_values(qs[0], skipped_question)
                is_loop = qs[0].get("isLoop")

                if is_loop:
                    unique_item_id = json.loads(self.redis_memory.hget(redis_user_key, "unique_item_id") or "null")
                    params.item_id = unique_item_id
                    qs[0]["itemId"] = unique_item_id
                    next_story_doc_id = qs[0].get("nextStoryDocId")

            self._log_user_bot_exchange(
                params, context_key_question, item_summary,
                f"Force skipped after {MAX_INVALID_COUNT} invalid attempts",
                selected_items_details=full_items, qs=qs
            )
            
            policy_question = pending_policy.pop(0) if pending_policy else ""
            if policy_question:
                session_data["current_policy_original_question"] = policy_question
            pending_context_key_question = insert_placeholder_values(qs[0], policy_question)

            # On-demand personalization of policy question (instead of personalizing all upfront)
            if pending_context_key_question and params.user_unique_id and params.assistant_id:
                try:
                    from src.services.question_personalization_service import QuestionPersonalizationService
                    personalizer = QuestionPersonalizationService()
                    # Use filtered data (affirmative dependents only) if available, otherwise use original
                    dynamic_func_data = qs[0].get("filteredDynamicFunctionData") or qs[0].get("dynamicFunctionData") if qs else None
                    pending_context_key_question = personalizer.personalize_single_question(
                        question_text=pending_context_key_question,
                        dynamic_function_data=dynamic_func_data,
                        user_id=params.user_unique_id,
                        assistant_id=params.assistant_id,
                        story_type=qs[0].get("story") if qs else None,
                        question_node=qs[0] if qs else None
                    )
                except Exception as e:
                    # Don't fail if personalization fails - use original question
                    pass

            if pending_context_key_question:
                ResponseToUser.next_question = f"{base_message} {retry_message} {pending_context_key_question}"
                return_question = pending_context_key_question
            else:
                pending_policy_main_question = json.loads(self.redis_memory.hget(redis_user_key, "pending_policy_main_questions") or "null")
                if is_loop and isinstance(pending_policy_main_question, list) and len(pending_policy_main_question) >= 2 and context_key_question != pending_policy_main_question[-1]:
                    if full_items:
                        # Always call insert_placeholder_values to ensure placeholders are replaced
                        context_key_question = insert_placeholder_values(qs[0], qs[0].get("backendQuestions"))
                        qs[0]["backendQuestions"] = context_key_question

                        self._update_bulk_cluster_database(
                            full_items, collected, collected_pairs_dependent, qs,
                            params.assistant_id, params.bearer_token, qs[0]["itemId"]
                        )
                    else:
                        bullet_summary = self.summary_service.generate_bullet_summary(
                            session_data.get("conversation_history", "")
                        )
                        final_new_summary = self.summary_service.generate_summary(
                            bullet_summary, "", ConversationMode.CLUSTER, exclude_list=list(collected_pairs_dependent.keys())
                        )
                        
                        # Build policy info for cluster mode
                        policy_qs = qs[0].get("policiesQuestion", []) if qs else []
                        unFilledPolicies = self.policy_service.build_policy_info_for_cluster(
                            policy_qs, collected_pairs_dependent, qs[0] if qs else None,
                            user_id=params.user_unique_id, assistant_id=params.assistant_id, use_optimized_context=True
                        )
                        
                        self.database_service.update_database(
                            ConversationMode.CLUSTER, final_new_summary,
                            assistant_id=params.assistant_id, bearer_token=params.bearer_token,
                            item_id=qs[0]["itemId"],
                            user_story_doc_id=qs[0].get("userStoryDocId", None),
                            chapter_doc_id=qs[0].get("chapterDocId", None),
                            unFilledPolicies=unFilledPolicies
                        )
                elif not is_loop:
                    if full_items:
                        # Always call insert_placeholder_values to ensure placeholders are replaced
                        context_key_question = insert_placeholder_values(qs[0], qs[0].get("backendQuestions"))
                        qs[0]["backendQuestions"] = context_key_question

                        self._update_bulk_cluster_database(
                            full_items, collected, collected_pairs_dependent, qs,
                            params.assistant_id, params.bearer_token, qs[0]["itemId"]
                        )
                    else:
                        bullet_summary = self.summary_service.generate_bullet_summary(
                            session_data.get("conversation_history", "")
                        )
                        final_new_summary = self.summary_service.generate_summary(
                            bullet_summary, "", ConversationMode.CLUSTER, exclude_list=list(collected_pairs_dependent.keys())
                        )
                        
                        # Build policy info for cluster mode
                        policy_qs = qs[0].get("policiesQuestion", []) if qs else []
                        unFilledPolicies = self.policy_service.build_policy_info_for_cluster(
                            policy_qs, collected_pairs_dependent, qs[0] if qs else None,
                            user_id=params.user_unique_id, assistant_id=params.assistant_id, use_optimized_context=True
                        )
                        
                        self.database_service.update_database(
                            ConversationMode.CLUSTER, final_new_summary,
                            assistant_id=params.assistant_id, bearer_token=params.bearer_token,
                            item_id=qs[0]["itemId"],
                            user_story_doc_id=qs[0].get("userStoryDocId", None),
                            chapter_doc_id=qs[0].get("chapterDocId", None),
                            unFilledPolicies=unFilledPolicies
                        )

                # Get current item name before fetching next question
                # current_item_name = qs[0].get("itemName", "this item") if qs else "this item"
                
                next_question_obj = None
                if not is_loop:
                    next_question_obj = self.question_service.fetch_next_question(
                        ConversationMode.CLUSTER, assistant_id=params.assistant_id,
                        bearer_token=params.bearer_token,
                        user_id=params.user_unique_id, personalize=True
                    )
                elif is_loop and next_story_doc_id:
                    next_question_obj = self.question_service.fetch_next_question(
                        ConversationMode.CLUSTER, assistant_id=params.assistant_id,
                        bearer_token=params.bearer_token, next_story_doc_id = next_story_doc_id,
                        user_id=params.user_unique_id, personalize=True
                    )
                elif is_loop and not next_story_doc_id:
                    next_question_obj = None

                if next_question_obj:
                    next_q = next_question_obj["question"]
                    policy = next_question_obj["policy"]
                    new_q_obj = next_question_obj["question_obj"]
                    full_question_obj = next_question_obj.get("full_question_obj")
                    context_key_question = next_q

                    if full_question_obj:
                        qs = full_question_obj
                        context_key_question = insert_placeholder_values(qs[0], next_q)

                    if next_q:
                        # Add completion message before moving to next question
                        # completion_message = CONST_ITEM_COMPLETION_MESSAGE.format(item_name=current_item_name)
                        ResponseToUser.next_question = f"{base_message} {retry_message}{context_key_question}"
                        return_question = context_key_question
                        question_type = "seed"  # Force seed mode on fallback
                        assistant_completed = True if context_key_question.startswith("All assistant items completed successfully") else False
                    else:
                        ResponseToUser.bot_response = f"{base_message} {complete_message}"
                        assistant_completed = True
                    
                else:
                    ResponseToUser.bot_response = f"{base_message} {complete_message}"
                    assistant_completed = True
        
        return {
            "state": "awaiting_answer" if question_type == "seed" else "policy",
            "invalid_count": 0,
            "last_question": return_question or None,
            "assistant_completed": assistant_completed,
            "full_question_obj": qs
        }
    
    def _update_bulk_cluster_database(
        self, full_items: List[Dict], collected: Dict[str, str],
        collected_pairs_dependent: Dict[str, List[Dict]], qs: List[Dict],
        assistant_id: str, bearer_token: str, item_id: str, user_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Update database with bulk cluster data."""
        
        # take the policy questions from the qs, (before passing to _get_last_policy_question)
        policy_qs = qs[0].get("policiesQuestion", []) if qs else []

        structured_kv_response = {}
        conversation_str =""
        for idx, detail in enumerate(full_items):
            # Safe access to storyName
            story_name = detail.get("storyName")
            if not story_name:
                continue
                
            story_name_lower = story_name.lower()
            
            # Safely get user_answer from collected, with fallback to prevent KeyError
            user_answer = collected.get(story_name_lower, "")
            
            # Safe access to qs[0] and backendQuestions
            if not qs or len(qs) == 0:
                continue
            # Use original (non-personalized) question for summary (Approach 1)
            bot_question = qs[0].get("originalBackendQuestions", qs[0].get("backendQuestions", ""))
            if not bot_question:
                bot_question = ""
            
            # item_name = qs[0]["itemName"]
            context_key_bot_question = insert_placeholder_values(qs[0], bot_question)
            # is_affirmative = policy_boolean_extraction(context_key_bot_question, user_answer) == "yes"
            conversation_str = f"Bot:{context_key_bot_question}/User: {user_answer}\n"
            
            # if not is_affirmative:
            #     # Handle negative initial answers
            #     negative_responses = []
            #     for pair in collected_pairs_dependent.get(story_name, []):
            #         if "no" in pair["answer"].lower() or "not" in pair["answer"].lower():
            #             context_key_question = insert_placeholder_values(qs[0], pair['question'])
            #             negative_responses.append(f"{context_key_question}: {pair['answer']}")
            #     if negative_responses:
            #         summary = f"No {item_name}.\n" + "\n".join(negative_responses)
            #     else:
            #         summary = f"No {item_name}."
            #     structured_kv_response[story_name] = summary
            #     continue

            last_policy_question = self._get_last_policy_question(qs, policy_qs)
            dependent_policy_pairs = collected_pairs_dependent.get(story_name.lower(), [])
            
            for pair_idx, pair in enumerate(dependent_policy_pairs):
                # Safe access to pair keys
                if not isinstance(pair, dict):
                    continue
                # Skip the last policy question if it's a loop scenario
                if last_policy_question:
                    pair_question = pair.get('question', '')
                    if pair_question.strip().lower() == last_policy_question.strip().lower():
                        continue
                    
                question_text = pair.get('question')
                answer_text = pair.get('answer')
                
                if not question_text:
                    continue
                    
                context_key_question = insert_placeholder_values(qs[0], question_text)
                conversation_str += f"Bot: {context_key_question}/User: {answer_text}\n"
            
            # Filter out the last policy question and "add another medication" question before generating summary
            filtered_conversation_str = self._filter_add_another_question(conversation_str, last_policy_question)
            item_summary = self.summary_service.generate_summary(filtered_conversation_str, item_name="", exclude_list=list(collected_pairs_dependent.keys()), summary_for_person=story_name)
            structured_kv_response[story_name] = item_summary.strip("- ").strip()
        
        # Build policy info for cluster mode - one policy info per item (all items share same policiesQuestion)
        policy_qs = qs[0].get("policiesQuestion", []) if qs else []
        unFilledPolicies = self.policy_service.build_policy_info_for_cluster(
            policy_qs, collected_pairs_dependent, qs[0] if qs else None,
            user_id=user_id, assistant_id=assistant_id, use_optimized_context=True
        )
        
        update_response = self.database_service.update_bulk_database(
            structured_kv_response, full_items, assistant_id, bearer_token, item_id,
            unFilledPolicies=unFilledPolicies
        )
        full_items = None
        return update_response
    
    # COMMENTED OUT - Policy key implementation (not for this release)
    # def _build_policy_info(
    #     self, policy_qs: List[Dict], collected_pairs_dependent: Dict[str, List[Dict]]
    # ) -> List[Dict[str, Any]]:
    #     """
    #     Build policy information array with tag, question, and answered status.
    #     
    #     Args:
    #         policy_qs: List of policy question objects from policiesQuestion
    #         collected_pairs_dependent: Dictionary mapping dependent names to their policy Q&A pairs
    #         
    #     Returns:
    #         List of policy info dictionaries with tag, question, and isAnswered
    #     """
    #     if not policy_qs:
    #         return []
    #     
    #     policy_info = []
    #     for policy_obj in policy_qs:
    #         policy_tag = policy_obj.get("policy")
    #         policy_question = policy_obj.get("question")
    #         
    #         if not policy_tag or not policy_question:
    #             continue
    #         
    #         # Check if this policy question is answered
    #         # For cluster mode, check if question exists in collected_pairs_dependent
    #         is_answered = False
    #         for dep_name, pairs in collected_pairs_dependent.items():
    #             if any(
    #                 pair.get("question", "").strip().lower() == policy_question.strip().lower()
    #                 for pair in pairs
    #             ):
    #                 is_answered = True
    #                 break
    #         
    #         policy_info.append({
    #             "tag": policy_tag,
    #             "question": policy_question,
    #             "isAnswered": is_answered
    #         })
    #     
    #     return policy_info
    
    def _build_cluster_response(
        self, done: bool, prompt: str, has_question: bool,
        invalid_user_response: bool, force_skip_executed: bool,
        validation_reply: str, item_id: str, state: ConversationState,
        qs: List[Dict], affirmative_dependents: List[Dict],
        last_question: str, pending_policy_main_question: Any, session_data: Dict[str, Any],
        question_type: str, current_question: str,
        validation_status, user_unique_id,
        just_recorded_item_name: str = "",
        redis_user_key: str = ""
    ) -> Dict[str, Any]:
        """Build the cluster mode response structure."""
        
        context_key_question = prompt
        is_loop = False
        existing = False
        completion_message = ""
        message = ""

        if qs:
            context_key_question = insert_placeholder_values(qs[0], prompt)
            is_loop = qs[0].get("isLoop")
            existing = self.get_bool(user_unique_id, "existing")
            # Only show item completion message after DB update + fetch new seed (or force_skip to new seed)
            if just_recorded_item_name:
                pass
                # completion_message = CONST_ITEM_COMPLETION_MESSAGE.format(item_name=just_recorded_item_name) #Not using for now
        # Prepare personalized "Next question" text for policy questions with dependents
        # Only personalize when there's exactly 1 dependent selected
        next_question_prefix = CONST_MOVE_ON_TO_NEXT_QUESTION
        # Cluster: show only "Next question" (no dependent name)
        # if state == ConversationState.POLICY and affirmative_dependents and len(affirmative_dependents) == 1:
        #     personalized_prefix = format_dependents_note(affirmative_dependents, include_prefix=True)
        #     if personalized_prefix:
        #         next_question_prefix = personalized_prefix

        pending_policy_main_question = json.loads(self.redis_memory.hget(redis_user_key, "pending_policy_main_questions") or "null")
        last_policy_question = pending_policy_main_question[-1] if pending_policy_main_question else None

        final_response_condition_kwargs = {
            "done": done,
            "is_loop": is_loop,
            "current_question": current_question,
            "question_type": question_type,
            "last_policy_question": last_policy_question,
            "next_question_prefix": next_question_prefix,
            "completion_message": completion_message,
            "message": message,
            "pending_policy_main_question": pending_policy_main_question,
            "invalid_user_response": invalid_user_response,
            "has_question": has_question,
            "force_skip_executed": force_skip_executed,
            "validation_status": validation_status,
            "validation_reply": validation_reply,
            "context_key_question": context_key_question
        }
        
        message = self.final_response_conditions(final_response_condition_kwargs)

        resp = {
            "prev_option": [],
            "question": message,
            "itemId": item_id,
            "functionFlow": None,
            "dynamicFunctionData": None, 
            "conditions": None
        }
        
        # COMMENTED OUT - Policy key implementation (not for this release)
        # Add policy information when seed + all policies are completed and data is saved to DB
        # This happens when: question_type is "seed", no pending policies, state is AWAITING_ANSWER (moving to next question)
        # and we're not in the middle of handling an error or question
        # if (question_type == "seed" and 
        #     (not pending_policy_main_question or len(pending_policy_main_question) == 0) and
        #     qs and state == ConversationState.AWAITING_ANSWER and
        #     not invalid_user_response and not has_question):
        #     policy_qs = qs[0].get("policiesQuestion", [])
        #     collected_pairs_dependent = session_data.get("collected_policy_pairs", {})
        #     
        #     if policy_qs:
        #         policy_info = self._build_policy_info(policy_qs, collected_pairs_dependent)
        #         if policy_info:
        #             resp["policy"] = policy_info
        
        # Setup function data for policy question
        if state == ConversationState.POLICY:
            current_policy_question = prompt if (not has_question and not invalid_user_response) else last_question
            this_item = qs[0] if qs else {}
            policy_data = this_item.get("policiesQuestion", [])
            # Match by original question: prompt/last_question may be personalized; policy_data has original questions
            current_policy_original = (session_data.get("current_policy_original_question") or "").strip().lower()
            if current_policy_question:
                #apply placeholer
                def _policy_matches(p):
                    policy_q = (p.get("question") or "").strip()
                    personalized = insert_placeholder_values(qs[0], policy_q) if (qs and policy_q) else policy_q
                    return personalized.strip().lower() == current_policy_original
                current_policy_obj = next((p for p in policy_data if _policy_matches(p)), {})


                policy_function_flow = current_policy_obj.get("functionFlow", [])
                resp["functionFlow"] = policy_function_flow

                # Show affirmative dependents list for policy questions with multiple dependents
                # This allows users to see and select from the list of care receivers who answered "yes"
                # Use consistent shape: {"result": [...], "success": True}
                if affirmative_dependents and len(affirmative_dependents) > 1:
                    resp["dynamicFunctionData"] = {"result": affirmative_dependents, "success": True}
                    # Use seed question's functionFlow if policy doesn't have its own
                    if not policy_function_flow and qs and qs[0].get("functionFlow"):
                        resp["functionFlow"] = qs[0].get("functionFlow")
                elif affirmative_dependents and len(affirmative_dependents) == 1 and not is_loop:
                    # Single affirmative dependent - don't show list, question is for that one person
                    # Clear dynamicFunctionData and functionFlow to prevent list display
                    resp["dynamicFunctionData"] = None
                    resp["functionFlow"] = None
                elif policy_function_flow:
                    # Policy has its own functionFlow - check for executionResult
                    execution_result = current_policy_obj.get("executionResult")
                    if not execution_result:
                        # Check in function flow items
                        for func in policy_function_flow:
                            if isinstance(func, dict) and func.get("executionResult"):
                                execution_result = func.get("executionResult")
                                break

                    if execution_result and isinstance(execution_result, list):
                        resp["dynamicFunctionData"] = execution_result[0]

                    if resp["dynamicFunctionData"]:
                        if not is_loop:
                            resp["dynamicFunctionData"]["displayType"] = None
                            resp["functionFlow"] = None

            resp["itemId"] = this_item.get("itemId")
        if not done and state == ConversationState.AWAITING_ANSWER:
            # Safe access to qs[0]
            ff = None
            df = None
            if qs and len(qs) > 0 and isinstance(qs[0], dict):
                ff = qs[0].get("functionFlow")
                df = qs[0].get("dynamicFunctionData")

            # Safe check for df and result
            if df and isinstance(df, dict):
                result = df.get("result")
                if isinstance(result, list) and len(result) > 0 and len(result) <= 1:
                    ff = None
                    df["displayType"] = None
                    if not has_question and not invalid_user_response and not force_skip_executed and not is_loop:
                        # Safe access to result[0] and storyName
                        first_result = result[0]
                        if isinstance(first_result, dict):
                            story_name = first_result.get('storyName')
                            if story_name:
                                _completion_block = f"{completion_message}\n\n" if completion_message else ""
                                resp["question"] =  (
                                                        f"✅ {validation_reply}\n\n"
                                                        f"{_completion_block}"
                                                        f"{CONST_MOVE_ON_TO_NEXT_QUESTION}\n"
                                                        # f"Next question for {story_name.title()}:\n"  # Cluster: show only "Next question"
                                                        f"{context_key_question}"
                                                    )

            # Safe access to qs[0]
            item_id_for_resp = None
            if qs and len(qs) > 0 and isinstance(qs[0], dict):
                item_id_for_resp = qs[0].get("itemId")
            
            resp.update(functionFlow=ff, dynamicFunctionData=df, itemId=item_id_for_resp)
        
        # Build selectedItemsContext after dynamicFunctionData is set
        selected_items_context = None
        
        # Get the final dynamicFunctionData from response (may have been set above)
        df_for_matching = resp.get("dynamicFunctionData")
        if not df_for_matching and qs and len(qs) > 0:
            df_for_matching = qs[0].get("dynamicFunctionData")
        
        # Detect if this is a NEW seed question (not scoped to a specific dependent)
        # A question is scoped if the message contains "for {name}" pattern
        question_message = resp.get("question", "") or message or ""
        is_scoped = is_scoped_question(question_message)
        
        # Case A: Dynamic Function Agents
        if df_for_matching and isinstance(df_for_matching, dict) and df_for_matching.get("result"):
            # Extract user selections from affirmative_dependents (for policy) or collected answers (for seed)
            selected_story_names = []
            
            if state == ConversationState.POLICY and affirmative_dependents:
                # Policy questions: use affirmative_dependents (users who answered "yes" to seed question)
                selected_story_names = [item.get("storyName", "") for item in affirmative_dependents if item.get("storyName")]
            #No need to send selectedItemsContext for new seed questions
            
            if selected_story_names:
                selected_items_context = build_selected_items_context(
                    selected_story_names=selected_story_names,
                    dynamic_function_data=df_for_matching
                )
        
        # Case B: Non-Dynamic Function Agents
        elif qs and len(qs) > 0 and not df_for_matching:
            # No dynamic function data - populate directly from question object
            question_obj = qs[0]
            if question_obj.get("storyName"):
                selected_items_context = build_selected_items_context(
                    selected_story_names=[question_obj.get("storyName", "")],
                    question_obj=question_obj
                )
        
        # Add selectedItemsContext to response if available
        # For dynamic function agents with new seed questions, this will be None/omitted
        if selected_items_context:
            resp["selectedItemsContext"] = selected_items_context
        
        return resp
    
    def _update_cluster_session(
        self, params: UserResponseParams, prompt: str, state: ConversationState,
        collected: Dict[str, str], pending_policy: List[str], full_items: List[Dict],
        affirmative_dependents: List[Dict], collected_pairs_dependent: Dict[str, List[Dict]],
        invalid_count: int, questions: List[Dict], conversation_history: str, resp: Dict, previous_item_name, user_unique_id, dynamic_data,
        current_policy_original_question: Optional[str] = None,
        extra_info: Optional[List] = None, 
        redis_user_key: str = ""
    ) -> None:
        """Update cluster session data."""
        
        context_key_question = prompt
        function_flow = None
        selected_item_details = None
        is_loop = False
        
        if questions:
            try:
                context_key_question = insert_placeholder_values(questions[0], prompt)
            except Exception as e:
                context_key_question = prompt  # Fallback to original
            
            function_flow = resp.get("functionFlow")
            
            # Safe access to dynamicFunctionData
            dynamic_func_data = resp.get("dynamicFunctionData")
            
            if dynamic_func_data is not None and isinstance(dynamic_func_data, dict):
                selected_item_details = dynamic_func_data.get("result")
            else:
                selected_item_details = None
            
            is_loop = questions[0].get("isLoop") if isinstance(questions[0], dict) else False
    
        update_data = {
            "last_question": context_key_question,
            "state": state.value,
            "collected_answers": collected,
            "pending_policy_questions": pending_policy,
            "full_items_details": full_items,
            "affirmative_dependents": affirmative_dependents,
            "collected_policy_pairs": collected_pairs_dependent,
            "invalid_count": invalid_count,
            "repeat_policy_count": 0,
            "questions_obj": questions,
            "conversation_history": conversation_history,
            "functionFlow": function_flow,
            "selected_items_details": selected_item_details,
            "previous_item_name": previous_item_name if not is_loop else self.redis_memory.hget(redis_user_key, "previous_item_name"),
            "dynamic_data": dynamic_data
        }
        if current_policy_original_question is not None:
            update_data["current_policy_original_question"] = current_policy_original_question
        if extra_info is not None:
            update_data["extra_info"] = {k: list(v) for k, v in extra_info.items()} if isinstance(extra_info, dict) else extra_info
        try:
            self.session_service.update_session_data(
                params.uuid, ConversationMode.CLUSTER, update_data,
                assistant_id=params.assistant_id
            )
        except Exception as e:
            raise
    

    def _log_user_bot_exchange(
        self, params: UserResponseParams, question_text: Any, user_text: str,
        summary: str = "", selected_items_details: Optional[List[Dict]] = None, qs=None
    ) -> None:
        """Log user-bot exchange."""
        
        if isinstance(question_text, list) and question_text:
            story_data = {
                "userStoryDocId": question_text[0].get("userStoryDocId"),
                "chapterDocId": question_text[0].get("chapterDocId"),
                "assistantId": question_text[0].get("assistantId"),
                "itemId": params.item_id if question_text[0].get("isLoop") else question_text[0].get("itemId"),
            }
            ai_message = question_text if question_text else ""
        else:
            # Handle single question
            story_data = {
                # "userStoryDocId": None,
                # "chapterDocId": None,
                "userStoryDocId": qs[0].get("userStoryDocId", None),
                "chapterDocId": qs[0].get("chapterDocId", None),
                "assistantId": qs[0].get("assistantId", None),
                "itemId": params.item_id,
            }
            ai_message = str(question_text)
        
        self.logging_service.log_user_bot_exchange(
            ConversationMode.CLUSTER, params.user_unique_id, story_data,
            ai_message, user_text, summary or "-", selected_items_details
        )
    
    def _log_user_bot_exchange_multiple(
        self, params: UserResponseParams, qs: List[Dict], user_text: str,
        summary: str = "", selected_items_details: Optional[List[Dict]] = None
    ) -> None:
        """Log user-bot exchange for multiple items."""
        
        first_q = qs[0] if qs else {}

        user_story_doc_id = None
        chapter_doc_id = None
        assistant_id = None
        item_id = None
        if first_q:
            user_story_doc_id = first_q.get("userStoryDocId")
            chapter_doc_id = first_q.get("chapterDocId")
            assistant_id = first_q.get("assistantId")
            item_id = first_q.get("itemId")
        else:
            user_story_doc_id = None
            chapter_doc_id = None
            assistant_id = params.assistant_id
            item_id = params.item_id

        story_data = {
            "userStoryDocId": user_story_doc_id,
            "chapterDocId": chapter_doc_id,
            "assistantId": assistant_id,
            "itemId": item_id,
        }
        
        self.logging_service.log_user_bot_exchange(
            ConversationMode.CLUSTER, params.user_unique_id, story_data,
            qs, user_text, summary or "-", selected_items_details
        )

    
    def set_bool(self, redis_user_key, key, value: bool):
        self.redis_memory.hset(redis_user_key, key, "true" if value else "false")

    def _get_last_policy_question(self, qs: List[Dict], policy_qs: List[Dict]) -> str:
        """
        Get the last policy question for loop/cloning scenarios.
        Returns original (non-personalized) question for consistent matching with conversation_history (Approach 1).
        """
        if not qs or not qs[0]:
            return None
        is_loop = qs[0].get("isLoop", False)
        if is_loop and policy_qs and len(policy_qs) > 0:
            return policy_qs[-1].get("question", "")
            
        return None
    
    def _filter_add_another_question(self, conversation_history: str, last_policy_question: str = None) -> str:
        """
        Filter out the last policy question and 'add another medication'/'add more' type questions from conversation history.
        The last policy question is used for flow control in cloning/loop scenarios and should not appear in the final summary.
        """
        if not conversation_history:
            return conversation_history
        
        lines = conversation_history.split('\n')
        filtered_lines = []
        
        # Keywords to identify questions that should be excluded from summary
        exclude_keywords = [
            "add another medication", 
            "add another", 
            "want to add another",
            "do you want to add more",
            "want to add more",
            "add more medical providers",
            "add more"
        ]
        
        for line in lines:
            if line.strip():
                line_lower = line.lower()
                
                # Check if this line contains the last policy question (for loop/cloning scenarios)
                should_exclude = False
                if last_policy_question:
                    # Extract the question part from the line (format: "Bot: question/User: answer")
                    if "bot:" in line_lower:
                        question_part = line.split("/User:")[0].replace("Bot:", "").strip().lower()
                        if question_part == last_policy_question.strip().lower():
                            should_exclude = True
                
                # Also check for keyword-based exclusions
                if not should_exclude:
                    should_exclude = any(keyword in line_lower for keyword in exclude_keywords)
                
                if not should_exclude:
                    filtered_lines.append(line)
        
        return '\n'.join(filtered_lines)
    
    def get_bool(self, redis_user_key, key, default=False):
        data = self.redis_memory.hget(redis_user_key, key)
        if data is None:
            return default
        # Handle both str and bytes types safely
        if isinstance(data, bytes):
            data = data.decode("utf-8")
        return data.lower() == "true"


    def process_and_update_items(
        self,
        full_items,
        collected,
        qs,
        policy_qs,
        collected_pairs_dependent,
        session_data,
        item_id,
        params
    ):
        """
        Process items, generate summaries, and update the database.
        Handles both dynamic function data (full_items) and fallback cluster mode.
        """
        if full_items:
            structured_kv_response = {}

            for detail in full_items:
                story_name = detail['storyName']
                user_answer = collected.get(story_name.lower(), "")
                # Use original (non-personalized) question for summary so extraction/context stay consistent
                bot_question = qs[0].get("originalBackendQuestions", qs[0].get("backendQuestions", ""))
                item_name = qs[0]["itemName"]
                context_key_question = insert_placeholder_values(qs[0], bot_question)
                # Build conversation string
                conversation_str = f"Bot:{context_key_question}/User: {user_answer}\n"

                # Add dependent policy questions if present
                if policy_qs:
                    last_policy_question = self._get_last_policy_question(qs, policy_qs)
                    dependent_policy_pairs = collected_pairs_dependent.get(story_name.lower(), [])
                    for pair in dependent_policy_pairs:
                        pair_question = pair.get('question', '')
                        # Skip the last policy question if it's a loop scenario
                        if last_policy_question and pair_question.strip().lower() == last_policy_question.strip().lower():
                            continue
                        context_key_question = insert_placeholder_values(qs[0], pair_question)
                        conversation_str += f"Bot: {context_key_question}/User: {pair['answer']}\n"

                # Filter out the last policy question and "add another medication" question before generating summary
                last_policy_question = self._get_last_policy_question(qs, policy_qs) if policy_qs else None
                filtered_conversation_str = self._filter_add_another_question(conversation_str, last_policy_question)
                # Generate item summary
                item_summary = self.summary_service.generate_summary(filtered_conversation_str, item_name="", exclude_list=list(collected_pairs_dependent.keys()), summary_for_person=story_name)
                structured_kv_response[story_name] = item_summary.strip("- ").strip()

            # Build policy info for cluster mode
            unFilledPolicies = self.policy_service.build_policy_info_for_cluster(
            policy_qs, collected_pairs_dependent, qs[0] if qs else None,
            user_id=params.user_unique_id, assistant_id=params.assistant_id, use_optimized_context=True
        )

            # Bulk update database with structured summaries
            self.database_service.update_bulk_database(
                structured_kv_response, full_items, params.assistant_id, params.bearer_token, item_id,
                unFilledPolicies=unFilledPolicies
            )

        else:
            # No dynamic function data -> cluster summary fallback
            policy_qs = qs[0].get("policiesQuestion", []) if qs else []
            last_policy_question = self._get_last_policy_question(qs, policy_qs)
            conversation_history = session_data.get("conversation_history", "")
            filtered_history = self._filter_add_another_question(conversation_history, last_policy_question)
            
            bullet_summary = self.summary_service.generate_summary(
                filtered_history, "", ConversationMode.CLUSTER, exclude_list=list(collected_pairs_dependent.keys())
            )
            
            # Build policy info for cluster mode
            unFilledPolicies = self.policy_service.build_policy_info_for_cluster(
            policy_qs, collected_pairs_dependent, qs[0] if qs else None,
            user_id=params.user_unique_id, assistant_id=params.assistant_id, use_optimized_context=True
        )
            
            self.database_service.update_database(
                ConversationMode.CLUSTER, bullet_summary,
                assistant_id=params.assistant_id, bearer_token=params.bearer_token,
                item_id=item_id,
                unFilledPolicies=unFilledPolicies
            )
    
    def final_response_conditions(self, kwargs):
        done = kwargs["done"]
        is_loop = kwargs["is_loop"]
        current_question = kwargs["current_question"]
        question_type = kwargs["question_type"]
        last_policy_question = kwargs["last_policy_question"]
        next_question_prefix = kwargs["next_question_prefix"]
        completion_message = kwargs["completion_message"]
        message = kwargs["message"]
        pending_policy_main_question = kwargs["pending_policy_main_question"]
        invalid_user_response = kwargs["invalid_user_response"]
        has_question = kwargs["has_question"]
        force_skip_executed = kwargs["force_skip_executed"]
        validation_status = kwargs["validation_status"]
        validation_reply = kwargs["validation_reply"]
        context_key_question = kwargs["context_key_question"]
        completion_block = f"{completion_message}\n\n" if completion_message else ""

        
        # ----------------- Your conditions -----------------
        if done:
            message = "✅ Your response for this assistant has been recorded in the organizer."

        elif has_question or (invalid_user_response and not force_skip_executed):
            message = context_key_question

        elif force_skip_executed and question_type == "seed":
            # Don't include completion_message if context_key_question is already a completion message
            if context_key_question and context_key_question.startswith(("✅ Your response", "Your response")):
                message = context_key_question
            else:
                message = (
                    f"{CONST_INPUT_NOT_STORED}\n\n"
                    f"{completion_block}"
                    f"{next_question_prefix}\n"
                    f"{context_key_question}"
                )

        elif (
            force_skip_executed
            and question_type == "policy"
            and pending_policy_main_question
            and current_question != last_policy_question
        ):
            message = (
                f"{CONST_INPUT_NOT_STORED}\n\n"
                f"{next_question_prefix}\n"
                f"{context_key_question}"
            )

        elif (
            pending_policy_main_question
            and question_type == "policy"
            and current_question == last_policy_question
        ):
            # Don't include completion_message if context_key_question is already a completion message
            if context_key_question and context_key_question.startswith(("✅ Your response", "Your response")):
                message = context_key_question
            else:
                message = (
                    f"✅ {validation_reply}\n\n"
                    f"{completion_block}"
                    f"{next_question_prefix}\n"
                    f"{context_key_question}"
                )

        elif (
            is_loop
            and pending_policy_main_question
            and question_type == "seed"
            and validation_status.lower() in ("skip", "no")
        ):
            message = (
                f"✅ {validation_reply}\n\n"
                f"{next_question_prefix}\n"
                f"{context_key_question}"
            )

        elif (
            not is_loop
            and pending_policy_main_question
            and question_type == "seed"
            and validation_status.lower() in ("skip", "no")
        ):
            # Don't include completion_message if context_key_question is already a completion message
            if context_key_question and context_key_question.startswith(("✅ Your response", "Your response")):
                message = context_key_question
            else:
                message = (
                    f"✅ {validation_reply}\n\n"
                    f"{completion_block}"
                    f"{next_question_prefix}\n"
                    f"{context_key_question}"
                )

        elif not pending_policy_main_question and question_type == "seed":
            # Don't include completion_message if done (assistant completed) or if context_key_question is already a completion message
            if done or (context_key_question and context_key_question.startswith(("✅ Your response", "Your response"))):
                message = context_key_question if context_key_question and context_key_question.startswith(("✅ Your response", "Your response")) else "✅ Your response for this assistant has been recorded in the organizer."
            else:
                message = (
                    f"✅ {validation_reply}\n\n"
                    f"{completion_block}"
                    f"{next_question_prefix}\n"
                    f"{context_key_question}"
                )

        else:
            message = (
                f"✅ {validation_reply}\n\n"
                f"{next_question_prefix}\n"
                f"{context_key_question}"
            )

        return message
