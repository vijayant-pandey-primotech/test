"""
Personal mode handler for individual user conversations.
Handles the flow for personal mode conversations where users answer questions individually.
"""

import json
from typing import Dict, Any, List, Optional
from .models import (
    ConversationState, ConversationMode, UserResponseParams, 
    ResponseToUser, PolicyData, MAX_INVALID_COUNT, CONST_MOVE_ON_TO_NEXT_QUESTION,
    CONST_ITEM_COMPLETION_MESSAGE
)
from .services import (
    QuestionService, ValidationService, SessionService, 
    DatabaseService, LoggingService, PolicyService, SummaryService
)
from .utils import clean_input, get_navigation_metadata, safe_get_item_context
from src.utils.prompt_functions import preprocess_features, summary_generation, extract_policy_answers_personal_mode
from src.services.question_personalization_service import QuestionPersonalizationService
from src.services.assistant_context_service import (
    log_redis_warning,
    # Personal mode: keyed by (user_id, chapter_id)
    get_personal_optimized_context,
    get_conversation_as_text_from_personal_optimized,
    append_seed_question_to_personal_context,
    append_policy_answer_to_personal_context,
    initialize_personal_optimized_context,
)


class PersonalModeHandler:
    """Handles personal mode conversation logic."""
    
    def __init__(self):
        self.question_service = QuestionService()
        self.validation_service = ValidationService()
        self.session_service = SessionService()
        self.database_service = DatabaseService()
        self.logging_service = LoggingService()
        self.policy_service = PolicyService()
        self.summary_service = SummaryService()
    def handle_response(self, params: UserResponseParams, session_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle personal mode user response.
        
        Args:
            params: User response parameters
            session_data: Current session data
            
        Returns:
            Response dictionary for the user
        """
        # Load full conversation history from Redis personal context (user_id, chapter_id)
        if params.user_unique_id and params.chapter_id:
            try:
                optimized_context = get_personal_optimized_context(params.user_unique_id, params.chapter_id)
                session_data["full_conversation_text"] = get_conversation_as_text_from_personal_optimized(
                    params.user_unique_id, params.chapter_id
                )
                session_data["full_conversation_history"] = optimized_context if optimized_context else {}
            except Exception as e:
                log_redis_warning("load_conversation_history", str(e), "personal_handler", {
                    "user_unique_id": params.user_unique_id,
                    "chapter_id": params.chapter_id
                })
                session_data["full_conversation_history"] = {}
                session_data["full_conversation_text"] = ""
        
        # Extract session data
        last_question = session_data.get("last_question")
        last_question_unchanged = session_data.get("last_question")
        current_policy_original_question = session_data.get("current_policy_original_question")
        invalid_count = session_data.get("invalid_count", 0)
        repeat_policy_count = session_data.get("repeat_policy_count", 0)
        state = ConversationState(session_data.get("state", "awaiting_question"))
        count = session_data.get("count", 0)
        policy_specific_data = session_data.get("policy_log", {})
        policy_done = session_data.get("policy_done", 0)
        all_answer = session_data.get("answer_log", " ")
        self.previous_conversation = session_data.get("conversation_history", "")
        prev_question_storage = session_data.get("prev_question")
        main_question_response = session_data.get("main_question_response", "")
        full_items = session_data.get("full_items_details", [])
        questions = session_data.get("questions_obj", [])
        
        response_to_user = ResponseToUser()

        # Recovery: if the session says we are answering but we don't have valid
        # question templates cached, refetch the next question.
        #
        # This prevents cases where session `questions_obj[0].originalBackendQuestions`
        # exists but is stored as `null`/None, which later breaks `.strip()`.
        if state == ConversationState.AWAITING_ANSWER:
            first_q = questions[0] if questions else None
            if not first_q:
                state = ConversationState.AWAITING_QUESTION
            else:
                original_template = first_q.get("originalBackendQuestions", None)
                backend_template = first_q.get("backendQuestions", None)
                if original_template is None and backend_template is None:
                    state = ConversationState.AWAITING_QUESTION
        # Initialize questions and related variables
        first_question = {}
        item_id = None
        new_q = None
        policy = []
        
        # Fetch next question if in awaiting_question state
        if state == ConversationState.AWAITING_QUESTION:
            next_question_obj = self.question_service.fetch_next_question(
                mode=ConversationMode.PERSONAL,
                user_story_id=params.user_story_id,
                bearer_token=params.bearer_token,
                chapter_id=params.chapter_id,
                user_id=params.user_unique_id,
                assistant_id=params.assistant_id,
                personalize=True
            )
            # Store question data in a variable for debugging
           
            questions = next_question_obj["question_obj"]
            new_q = next_question_obj["question"]
            original_q = questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", "")) if questions else ""
            policy = next_question_obj["policy"]
        else:
            questions = session_data.get("questions_obj", [])
            first_question = questions[0] if questions else {}
            item_id = first_question.get("itemId") if questions else None
            new_q = first_question.get("backendQuestions") if questions else None
            original_q = first_question.get("originalBackendQuestions", first_question.get("backendQuestions", "")) if questions else None
            try:
                policy = list(first_question.get("policy", [{}])[0].keys()) if questions else []
            except:
                policy = []
        
        # Get navigation metadata
        nav_metadata = get_navigation_metadata(questions)
        is_last_chapter = nav_metadata["is_last_chapter"]
        next_chapter = nav_metadata["next_chapter"]
        next_chapter_id = nav_metadata["next_chapter_id"]
        
        # Get policy topics and initialize policy data
        policy_topic = self.policy_service.get_policy_topic(questions, ConversationMode.PERSONAL)
        policy_specific_data = self.policy_service.initialize_policy_data(policy_topic, policy_specific_data)
        
        # Get item context safely
        item_name, context = safe_get_item_context(questions)

        # Handle different conversation states
        if state == ConversationState.AWAITING_ANSWER:
            return self._handle_awaiting_answer_state(
                params, response_to_user, new_q, last_question, invalid_count,
                self.previous_conversation, main_question_response, policy_topic,
                policy_specific_data, questions, full_items, all_answer,
                is_last_chapter, next_chapter, next_chapter_id
            )
        
        elif state == ConversationState.POLICY:
            return self._handle_policy_state(
                params, response_to_user, last_question, invalid_count,
                self.previous_conversation, policy_specific_data, questions,
                full_items, all_answer, is_last_chapter, next_chapter, next_chapter_id,
                current_policy_original_question=current_policy_original_question
            )
        
        else:
            # Initial state - start conversation
            if new_q:
                response_to_user.bot_response = f"✅ Alright, let's get started!\n {new_q}"
                state = ConversationState.AWAITING_ANSWER
                last_question = original_q  # Store original (non-personalized) in session; personalized is only for frontend display
                invalid_count = 0
                
                # Initialize personal context in Redis if this is first time
                if params.user_unique_id and params.chapter_id:
                    try:
                        initialize_personal_optimized_context(params.user_unique_id, params.chapter_id)
                    except Exception as e:
                        log_redis_warning("initialize_personal_optimized_context", str(e), "personal_handler", {
                            "user_unique_id": params.user_unique_id,
                            "chapter_id": params.chapter_id
                        })
            else:
                response_to_user.bot_response = "All questions have been answered."
                last_question = None
                state = ConversationState.DONE
        
        # Build final response (Redis logging is handled in _build_final_response)
        final_response = self._build_final_response(
            response_to_user, params, state, last_question, invalid_count,
            repeat_policy_count, policy_specific_data, self.previous_conversation,
            main_question_response, full_items, questions, policy_done, all_answer,
            is_last_chapter, next_chapter, next_chapter_id
        )
        
        return final_response
    
    def _handle_awaiting_answer_state(
        self, params: UserResponseParams, response_to_user: ResponseToUser,
        new_q: str, last_question: str, invalid_count: int,
        previous_conversation: str, main_question_response: str,
        policy_topic: List[str], policy_specific_data: List[PolicyData],
        questions: List[Dict], full_items: List[Dict], all_answer: str,
        is_last_chapter: bool, next_chapter: str, next_chapter_id: str
    ) -> Optional[Dict[str, Any]]:
        """Handle the awaiting answer state logic."""
        
        if not params.user_response:
            response_to_user.bot_response = "I didn't catch that. Could you please clarify?"
            return None
        
        # Validate user response - use original (non-personalized) question like cluster mode
        caregiver_name = (questions[0].get("userName") if questions else None) if isinstance(questions, list) and questions else None
        print(json.dumps({"log_type": "caregiver_context", "mode": "personal", "context": "awaiting_answer", "caregiver_name": caregiver_name}), flush=True)

        # `dict.get(key, default)` does NOT fall back when the key exists but its value is None.
        # So we explicitly prefer originalBackendQuestions if it's a non-None string; otherwise fall back.
        if questions and questions[0]:
            original_q_for_validation = questions[0].get("originalBackendQuestions", None)
            if original_q_for_validation is None:
                original_q_for_validation = questions[0].get("backendQuestions", "")
        else:
            original_q_for_validation = new_q

        validation_result = self.validation_service.validate_user_response(original_q_for_validation, clean_input(params.user_response), caregiver_name=caregiver_name)
        
        # if policy_topic and policy_specific_data:
        #     policies = questions[0].get("policiesQuestion", [])
        #     unanswered_policy_questions = []
        #     unanswered_indices = []

        #     for i, (policy_data, policy_obj) in enumerate(zip(policy_specific_data, policies)):
        #         if policy_data.value is None:
        #             unanswered_policy_questions.append(policy_obj.get("question", ""))
        #             unanswered_indices.append(i)

        #     if unanswered_policy_questions:
        #         # Try to extract answers from seed response regardless of validation result
        #         # Extraction can succeed even if validation marked it as error
        #         extraction_input = {
        #             "user_response": params.user_response,
        #             "seed_question": new_q,
        #             "policy_questions": unanswered_policy_questions
        #         }

        #         extraction_result = extract_policy_answers_personal_mode(extraction_input)

        #         if extraction_result.get("found", False):
        #             extracted_policies = extraction_result.get("policy_questions", [])

        #             # Track if we actually stored any extracted values
        #             actually_extracted_count = 0

        #             # Map extracted answers back to policy_specific_data
        #             for policy_dict in extracted_policies:
        #                 for policy_question, answer_value in policy_dict.items():
        #                     if answer_value and str(answer_value).strip() not in ["", "none", "n/a"]:
        #                         # Find the index in unanswered list
        #                         try:
        #                             unanswered_idx = unanswered_policy_questions.index(policy_question)
        #                             actual_idx = unanswered_indices[unanswered_idx]

        #                             # Update policy_specific_data
        #                             policy_specific_data[actual_idx].value = answer_value
        #                             actually_extracted_count += 1

        #                             # Add to conversation history
        #                             previous_conversation += f"\nBot : {policy_question}, User : {answer_value}"

        #                         except ValueError:
        #                             # Question not in list, skip
        #                             pass

        #             # Override validation if extraction was successful AND we actually stored values
        #             # If we successfully extracted policy answers, the response is valid
        #             if validation_result.result == "error" and actually_extracted_count > 0:
        #                 validation_result.result = "answered"
        #                 validation_result.reply = "Your response has been recorded."
       
        # ==
        if validation_result.result == "error":
            invalid_count += 1
            if invalid_count >= MAX_INVALID_COUNT:
                # Force skip logic
                self.logging_service.log_user_bot_exchange(
                    ConversationMode.PERSONAL, params.user_unique_id,
                    self._build_story_data(questions[0]),
                    last_question, params.user_response, "Force skipped after 3 invalid attempts"
                )
                
                update_result = self._force_skip_and_move_on("Skipped", questions, params, previous_conversation=previous_conversation, last_question=last_question)
                response_to_user.next_question = f"✅ {validation_result.reply}\n\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{update_result['next_question']}"
                response_to_user.bot_response = update_result["bot_response"]
                questions = update_result["question_obj"]
                return self._build_final_response(
                    response_to_user, params, ConversationState.AWAITING_ANSWER,
                    update_result['original_next_question'], 0, 0, [], " ", "",
                    full_items, questions, 0, " ",
                    is_last_chapter, next_chapter, next_chapter_id
                )
            else:
                # Retry with same question — server log only (not saved to Firestore to avoid polluting chat history)
                print(json.dumps({
                    "log_type": "invalid_response_retry",
                    "mode": "personal",
                    "context": "awaiting_answer",
                    "user_id": params.user_unique_id,
                    "question": new_q,
                    "user_response": params.user_response,
                    "invalid_count": invalid_count,
                    "validation_reply": validation_result.reply
                }), flush=True)

                next_question_obj = self.question_service.fetch_next_question(
                    ConversationMode.PERSONAL, user_story_id=params.user_story_id,
                    bearer_token=params.bearer_token, chapter_id=params.chapter_id,
                    user_id=params.user_unique_id, assistant_id=params.assistant_id, personalize=True
                )
                questions = next_question_obj["question_obj"]
                new_q = next_question_obj["question"]
                original_q = questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", "")) if questions else ""
                policy = next_question_obj["policy"]
                response_to_user.next_question = f"✅ {validation_result.reply}\n Let's try that again: \n{new_q}"

                return self._build_final_response(
                    response_to_user, params, ConversationState.AWAITING_ANSWER,
                    original_q, invalid_count, 0, policy_specific_data, previous_conversation,
                    main_question_response, full_items, questions, 0, all_answer,
                    is_last_chapter, next_chapter, next_chapter_id
                )
        
        elif "answer" in validation_result.result:
            return self._handle_valid_answer(
                params, response_to_user, new_q, validation_result,
                previous_conversation, main_question_response, policy_topic,
                policy_specific_data, questions, full_items, all_answer,
                is_last_chapter, next_chapter, next_chapter_id
            )
        
        elif validation_result.result == "skip" or validation_result.result == "no":
            return self._handle_skip_or_no_answer(
                params, response_to_user, new_q, validation_result,
                previous_conversation, questions, full_items,
                is_last_chapter, next_chapter, next_chapter_id
            )
        
        elif 'question' in validation_result.result:
            # User asked a clarification question - use query_resolver to provide context-aware answer
            from src.utils.prompt_functions import query_resolver
            item_name, context = safe_get_item_context(questions)
            query_response = query_resolver(new_q, context, params.user_response)
            response_to_user.bot_response = f"{query_response}\n\n🔄 To continue:\n {last_question}"
            self.logging_service.log_user_bot_exchange(
                ConversationMode.PERSONAL, params.user_unique_id,
                self._build_story_data(questions[0]),
                questions,
                params.user_response, query_response
            )
            return self._build_final_response(
                response_to_user, params, ConversationState.AWAITING_ANSWER,
                last_question, invalid_count, 0, policy_specific_data, previous_conversation,
                main_question_response, full_items, questions, 0, all_answer,
                is_last_chapter, next_chapter, next_chapter_id
            )
        
        else:
            # Invalid response - rephrase and retry
            next_question_obj = self.question_service.fetch_next_question(
                ConversationMode.PERSONAL, user_story_id=params.user_story_id,
                bearer_token=params.bearer_token, chapter_id=params.chapter_id,
                user_id=params.user_unique_id, assistant_id=params.assistant_id, personalize=True
            )
            questions = next_question_obj["question_obj"]
            new_q = next_question_obj["question"]
            original_q = questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", "")) if questions else ""
            policy = next_question_obj["policy"]

            from src.utils.prompt_functions import rephrase_sentence
            rephrased_answer = rephrase_sentence("Your answer was invalid " + new_q)

            # Server log only (not saved to Firestore to avoid polluting chat history)
            print(json.dumps({
                "log_type": "invalid_response_fallback",
                "mode": "personal",
                "context": "awaiting_answer",
                "user_id": params.user_unique_id,
                "question": new_q,
                "user_response": params.user_response,
                "invalid_count": invalid_count,
                "validation_result": validation_result.result
            }), flush=True)

            if new_q:
                response_to_user.next_question = rephrased_answer
                invalid_count += 1
            else:
                response_to_user.bot_response += " No more questions remaining."

            return self._build_final_response(
                response_to_user, params, ConversationState.AWAITING_ANSWER if new_q else ConversationState.DONE,
                original_q, invalid_count, 0, policy_specific_data, previous_conversation,
                main_question_response, full_items, questions, 0, all_answer,
                is_last_chapter, next_chapter, next_chapter_id
            )
    
    def _handle_valid_answer(
        self, params: UserResponseParams, response_to_user: ResponseToUser,
        new_q: str, validation_result, previous_conversation: str,
        main_question_response: str, policy_topic: List[str],
        policy_specific_data: List[PolicyData], questions: List[Dict],
        full_items: List[Dict], all_answer: str, is_last_chapter: bool,
        next_chapter: str, next_chapter_id: str
    ) -> Dict[str, Any]:
        """Handle valid answer logic."""

        # Use original (non-personalized) question for internal logic; personalized new_q is only for frontend display
        original_seed = questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", "")) if questions else new_q

        # fixes conversation history issue : now the latest qustion will be at very first and then the que which comes late
        previous_conversation = str(previous_conversation) + "\n" + f"Bot : {original_seed}, User : {params.user_response}"

# =============================================EX STARTED ==========================================================================
        if policy_topic and policy_specific_data:
            policies = questions[0].get("policiesQuestion", [])
            unanswered_policy_questions = []
            unanswered_indices = []

            for i, (policy_data, policy_obj) in enumerate(zip(policy_specific_data, policies)):
                if policy_data.value is None:
                    unanswered_policy_questions.append(policy_obj.get("question", ""))
                    unanswered_indices.append(i)

            if unanswered_policy_questions:
                # Try to extract answers from seed response regardless of validation result
                # Extraction can succeed even if validation marked it as error
                extraction_input = {
                    "user_response": params.user_response,
                    "seed_question": original_seed,
                    "policy_questions": unanswered_policy_questions
                }

                extraction_result = extract_policy_answers_personal_mode(extraction_input)

                if extraction_result.get("found", False):
                    extracted_policies = extraction_result.get("policy_questions", [])

                    # Track if we actually stored any extracted values
                    actually_extracted_count = 0

                    # Map extracted answers back to policy_specific_data
                    for policy_dict in extracted_policies:
                        for policy_question, answer_value in policy_dict.items():
                            if answer_value and str(answer_value).strip() not in ["", "none", "n/a"]:
                                # Find the index in unanswered list
                                try:
                                    unanswered_idx = unanswered_policy_questions.index(policy_question)
                                    actual_idx = unanswered_indices[unanswered_idx]

                                    # Update policy_specific_data
                                    policy_specific_data[actual_idx].value = answer_value
                                    actually_extracted_count += 1

                                    # Add to conversation history
                                    previous_conversation += f"\nBot : {policy_question}, User : {answer_value}"
                                except ValueError:
                                    # Question not in list, skip
                                    pass

                    # Override validation if extraction was successful AND we actually stored values
                    # If we successfully extracted policy answers, the response is valid
                    if validation_result.result == "error" and actually_extracted_count > 0:
                        validation_result.result = "answered"
                        validation_result.reply = "Your response has been recorded."
       
# =============================================EX STARTED ==========================================================================

        # Use original (non-personalized) question for summary so extraction/context stay consistent (Approach 1)
        rephrase_text = self.summary_service.generate_summary(
            params.user_response,
            questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", ""))
        )

        self.logging_service.log_user_bot_exchange(
            ConversationMode.PERSONAL, params.user_unique_id,
            self._build_story_data(questions[0]),
            questions,
            params.user_response, rephrase_text, full_items
        )

        # Save the initial response to the main question
        main_question_response = params.user_response

        # Store seed question in personal Redis context (user_id, chapter_id)
        if params.user_unique_id and params.chapter_id:
            try:
                append_seed_question_to_personal_context(
                    user_id=params.user_unique_id,
                    chapter_id=params.chapter_id,
                    original_question=questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", "")),
                    personalized_question=new_q or "",
                    item_name=questions[0].get("itemName", ""),
                    user_answer=params.user_response
                )
            except Exception as e:
                log_redis_warning("append_seed_question_to_personal_context", str(e), "personal_handler", {
                    "user_unique_id": params.user_unique_id,
                    "chapter_id": params.chapter_id
                })
        
        if policy_topic:
            # Update policy data - use original (non-personalized) question like cluster mode
            from .utils import update_policy_data
            policy_specific_data = update_policy_data(original_seed, params.user_response, policy_topic, policy_specific_data, "")
            
            try:
                if sum(1 for item in policy_specific_data if item.value is None) == 0:
                    # All policies answered - generate summary and move to next question
                    new_summary = self.summary_service.generate_summary(previous_conversation, "", ConversationMode.PERSONAL)
                    
                    # Get current item name before saving and moving on
                    current_item_name = questions[0].get("itemName", "this item") if questions else "this item"
                    
                    # Build policy info for personal mode (using new optimized format)
                    policy_qs = questions[0].get("policiesQuestion", []) if questions else []
                    unFilledPolicies = self.policy_service.build_policy_info_for_personal(
                        policy_qs, policy_specific_data,
                        user_id=params.user_unique_id,
                        chapter_id=params.chapter_id,
                        assistant_id=params.assistant_id,
                        use_optimized_context=True
                    )
                    
                    self.database_service.update_database(
                        ConversationMode.PERSONAL, new_summary,
                        user_story_id=params.user_story_id, bearer_token=params.bearer_token,
                        chapter_id=params.chapter_id,
                        unFilledPolicies=unFilledPolicies
                    )
                    
                    next_question_obj = self.question_service.fetch_next_question(
                        ConversationMode.PERSONAL, user_story_id=params.user_story_id,
                        bearer_token=params.bearer_token, chapter_id=params.chapter_id,
                        user_id=params.user_unique_id, assistant_id=params.assistant_id, personalize=True
                    )
                    questions = next_question_obj["question_obj"]
                    new_q = next_question_obj["question"]
                    original_q = questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", "")) if questions else ""
                    policy = next_question_obj["policy"]

                    # Add completion message before next question
                    # completion_message = CONST_ITEM_COMPLETION_MESSAGE.format(item_name=current_item_name)
                    # response_to_user.next_question = f"✅ {validation_result.reply}\n\n{completion_message}\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{new_q}"
                    response_to_user.next_question = f"✅ {validation_result.reply}\n\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{new_q}"

                    

                    final_response = self._build_final_response(
                        response_to_user, params, ConversationState.AWAITING_ANSWER,
                        original_q, 0, 0, [], " ", "", full_items, questions, 0, " ",
                        is_last_chapter, next_chapter, next_chapter_id
                    )
                    
                    # COMMENTED OUT - Policy key implementation (not for this release)
                    # Add policy info to response when seed + all policies completed
                    # if policy_info:
                    #     final_response["policy"] = policy_info
                    
                    return final_response
                else:
                    # Move to next policy question (personalize on-demand for display only)
                    policies = questions[0].get("policiesQuestion", [])
                    next_policy_index = next((i for i, item in enumerate(policy_specific_data) if item.value is None), len(policies))
                    
                    if next_policy_index < len(policies):
                        original_policy_question = policies[next_policy_index].get("question", "")
                        policy_question_display = original_policy_question
                        try:
                            q0 = questions[0] if questions else {}
                            policy_question_display = QuestionPersonalizationService().personalize_single_question(
                                question_text=original_policy_question,
                                dynamic_function_data=q0.get("dynamicFunctionData"),
                                user_id=params.user_unique_id,
                                assistant_id=params.assistant_id if not params.chapter_id else None,
                                chapter_id=params.chapter_id,
                                story_type=q0.get("story"),
                                question_node=q0
                            ) or original_policy_question
                        except Exception:
                            pass
                        # Store original in session; personalized only for frontend display
                        response_to_user.next_question = f"✅ {validation_result.reply}\n\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{policy_question_display}"
                        return self._build_final_response(
                            response_to_user, params, ConversationState.POLICY,
                            original_policy_question, 0, 0, policy_specific_data, previous_conversation,
                            main_question_response, full_items, questions, 0, all_answer,
                            is_last_chapter, next_chapter, next_chapter_id,
                            current_policy_original_question=original_policy_question
                        )
                    else:
                        policy_question = ""
                        response_to_user.next_question = f"✅ {validation_result.reply}\n\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{policy_question}"
                        return self._build_final_response(
                            response_to_user, params, ConversationState.POLICY,
                            policy_question, 0, 0, policy_specific_data, previous_conversation,
                            main_question_response, full_items, questions, 0, all_answer,
                            is_last_chapter, next_chapter, next_chapter_id
                        )
            except Exception:
                # Fallback to policy questions (personalize on-demand for display only)
                policies = questions[0].get("policiesQuestion", [])
                next_policy_index = next((i for i, item in enumerate(policy_specific_data) if item.value is None), len(policies))
                
                if next_policy_index < len(policies):
                    original_policy_question = policies[next_policy_index].get("question", "")
                    policy_question_display = original_policy_question
                    try:
                        q0 = questions[0] if questions else {}
                        policy_question_display = QuestionPersonalizationService().personalize_single_question(
                            question_text=original_policy_question,
                            dynamic_function_data=q0.get("dynamicFunctionData"),
                            user_id=params.user_unique_id,
                            assistant_id=params.assistant_id if not params.chapter_id else None,
                            chapter_id=params.chapter_id,
                            story_type=q0.get("story"),
                            question_node=q0
                        ) or original_policy_question
                    except Exception:
                        pass
                    response_to_user.next_question = f"✅ {validation_result.reply}\n\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{policy_question_display}"
                    return self._build_final_response(
                        response_to_user, params, ConversationState.POLICY,
                        original_policy_question, 0, 0, policy_specific_data, previous_conversation,
                        main_question_response, full_items, questions, 0, all_answer,
                        is_last_chapter, next_chapter, next_chapter_id,
                        current_policy_original_question=original_policy_question
                    )
                else:
                    policy_question = ""
                    response_to_user.next_question = f"✅ {validation_result.reply}\n\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{policy_question}"
                    return self._build_final_response(
                        response_to_user, params, ConversationState.POLICY,
                        policy_question, 0, 0, policy_specific_data, previous_conversation,
                        main_question_response, full_items, questions, 0, all_answer,
                        is_last_chapter, next_chapter, next_chapter_id
                    )
        else:
            # No policy questions - generate summary and move to next question
            new_summary = self.summary_service.generate_summary(previous_conversation, "", ConversationMode.PERSONAL)
            
            # Get current item name before saving and moving on
            current_item_name = questions[0].get("itemName", "this item") if questions else "this item"
            
            # Build policy info for personal mode (no policy data in this path, so empty list)
            unFilledPolicies = []
            
            update_result = self.database_service.update_database(
                ConversationMode.PERSONAL, new_summary,
                user_story_id=params.user_story_id, bearer_token=params.bearer_token,
                additional_data=all_answer, chapter_id=params.chapter_id,
                unFilledPolicies=unFilledPolicies
            )
            
            next_question_obj = self.question_service.fetch_next_question(
                ConversationMode.PERSONAL, user_story_id=params.user_story_id,
                bearer_token=params.bearer_token, chapter_id=params.chapter_id,
                user_id=params.user_unique_id, assistant_id=params.assistant_id, personalize=True
            )
            questions = next_question_obj["question_obj"]
            new_q = next_question_obj["question"]
            original_q = questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", "")) if questions else ""
            policy = next_question_obj["policy"]
            if new_q:
                if not new_q.startswith("Your response for this"):
                    response_to_user.bot_response = str(update_result) if update_result else ""
                else:
                    response_to_user.bot_response = ''

                # Add completion message before next question
                # completion_message = CONST_ITEM_COMPLETION_MESSAGE.format(item_name=current_item_name)
                # response_to_user.next_question = f"✅ {validation_result.reply}\n\n{completion_message}\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{new_q}"
                response_to_user.next_question = f"✅ {validation_result.reply}\n\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{new_q}"


                return self._build_final_response(
                    response_to_user, params, ConversationState.AWAITING_ANSWER,
                    original_q, 0, 0, [], " ", "", full_items, questions, 0, " ",
                    is_last_chapter, next_chapter, next_chapter_id
                )
            else:
                response_to_user.bot_response = f"🎉 Thank you! {update_result} All questions have been answered."
                
                return self._build_final_response(
                    response_to_user, params, ConversationState.DONE,
                    None, 0, 0, [], " ", "", full_items, questions, 0, " ",
                    is_last_chapter, next_chapter, next_chapter_id
                )
    
    def _handle_skip_or_no_answer(
        self, params: UserResponseParams, response_to_user: ResponseToUser,
        new_q: str, validation_result, previous_conversation: str,
        questions: List[Dict], full_items: List[Dict], is_last_chapter: bool,
        next_chapter: str, next_chapter_id: str
    ) -> Dict[str, Any]:
        """Handle skip or no answer logic."""

        # Use original (non-personalized) question for internal logic
        original_seed = questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", "")) if questions else new_q

        cleaned_user_input = clean_input(params.user_response.strip().lower())
        if validation_result.result == "skip":
            final_summary = "Skipped"
        else:
            # Use original question for summary consistency (Approach 1)
            final_summary = self.summary_service.generate_summary(
                cleaned_user_input,
                questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", ""))
            ).strip()

        self.logging_service.log_user_bot_exchange(
            ConversationMode.PERSONAL, params.user_unique_id,
            self._build_story_data(questions[0]),
            questions,
            params.user_response, final_summary, full_items
        )

        previous_conversation = str(previous_conversation) + "\n" + f"Bot : {original_seed}, User : {params.user_response}"
        
        # Build policy info for personal mode (no policy data in skip/no path, so empty list)
        unFilledPolicies = []
        
        self.database_service.update_database(
            ConversationMode.PERSONAL, final_summary,
            user_story_id=params.user_story_id, bearer_token=params.bearer_token,
            additional_data="None", chapter_id=params.chapter_id,
            unFilledPolicies=unFilledPolicies
        )
        
        # Get current item name before moving on
        current_item_name = questions[0].get("itemName", "this item") if questions else "this item"
        
        # Reset state and get next question
        next_question_obj = self.question_service.fetch_next_question(
            ConversationMode.PERSONAL, user_story_id=params.user_story_id,
            bearer_token=params.bearer_token, chapter_id=params.chapter_id,
            user_id=params.user_unique_id, assistant_id=params.assistant_id, personalize=True
        )
        questions = next_question_obj["question_obj"]
        new_q = next_question_obj["question"]
        original_q = questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", "")) if questions else ""
        policy = next_question_obj["policy"]

        if new_q:
            # Add completion message before next question
            # completion_message = CONST_ITEM_COMPLETION_MESSAGE.format(item_name=current_item_name)
            # response_to_user.next_question = f"✅ {validation_result.reply}\n\n{completion_message}\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{new_q}"
            response_to_user.next_question = f"✅ {validation_result.reply}\n\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{new_q}"

            return self._build_final_response(
                response_to_user, params, ConversationState.AWAITING_ANSWER,
                original_q, 0, 0, [], " ", "", full_items, questions, 0, " ",
                is_last_chapter, next_chapter, next_chapter_id
            )
        else:
            response_to_user.bot_response = "No more questions remain."
            
            return self._build_final_response(
                response_to_user, params, ConversationState.DONE,
                None, 0, 0, [], " ", "", full_items, questions, 0, " ",
                is_last_chapter, next_chapter, next_chapter_id
            )
    
    def _handle_policy_state(
        self, params: UserResponseParams, response_to_user: ResponseToUser,
        last_question: str, invalid_count: int, previous_conversation: str,
        policy_specific_data: List[PolicyData], questions: List[Dict],
        full_items: List[Dict], all_answer: str, is_last_chapter: bool,
        next_chapter: str, next_chapter_id: str,
        current_policy_original_question: Optional[str] = None
    ) -> Dict[str, Any]:
        """Handle policy state logic."""
        # Use original (non-personalized) question for validation like cluster mode
        question_for_validation = current_policy_original_question or last_question

        # Validate policy response (pass caregiver name when available)
        caregiver_name = (questions[0].get("userName") if questions else None) if isinstance(questions, list) and questions else None
        print(json.dumps({"log_type": "caregiver_context", "mode": "personal", "context": "policy", "caregiver_name": caregiver_name}), flush=True)
        validation_result = self.validation_service.validate_user_response(question_for_validation, clean_input(params.user_response), caregiver_name=caregiver_name)
        policies = questions[0].get("policiesQuestion", [])
        # if the val_st == ans mark policy_specific_data ans for current (for which question asked ) or skip depends on the status
        
        # ===================== POLICY EXTRACTION FROM POLICY RESPONSE =====================
        # Use original question for matching (last_question/current_policy_original_question is original when stored correctly)
        current_original = (current_policy_original_question or last_question or "").strip().lower()
        
        # ================================================================ END EXTRACTION POLICY ==========================================================================================================
        unanswered_policy_questions = []
        unanswered_indices = []
        # give policy_specific_data only for which is None
        for i, (policy_data, policy_obj) in enumerate(zip(policy_specific_data, policies)):
            policy_question = policy_obj.get("question", "")
            # Only include if unanswered AND not the current question (match by original)
            if policy_data.value is None and (policy_question or "").strip().lower() != current_original:
                unanswered_policy_questions.append(policy_question)
                unanswered_indices.append(i)

        if unanswered_policy_questions:
            # Try to extract answers from current policy response regardless of validation result
            # Extraction can succeed even if validation marked it as error
            extraction_input = {
                "user_response": params.user_response,
                "seed_question": question_for_validation,  # Original policy question for extraction
                "policy_questions": unanswered_policy_questions
            }
            extraction_result = extract_policy_answers_personal_mode(extraction_input)

            if extraction_result.get("found", False):
                extracted_policies = extraction_result.get("policy_questions", [])

                # Track if we actually stored any extracted values
                actually_extracted_count = 0

                # Map extracted answers back to policy_specific_data
                for policy_dict in extracted_policies:
                    for policy_question, answer_value in policy_dict.items():
                        if answer_value and str(answer_value).strip() not in ["", "none", "n/a"]:
                            # Find the index in unanswered list
                            try:
                                unanswered_idx = unanswered_policy_questions.index(policy_question)
                                actual_idx = unanswered_indices[unanswered_idx]

                                # Update policy_specific_data
                                policy_specific_data[actual_idx].value = answer_value
                                actually_extracted_count += 1

                                # Add to conversation history
                                previous_conversation += f"\nBot : {policy_question}, User : {answer_value}"
                            except ValueError:
                                # Question not in list, skip
                                pass

                    # Override validation if extraction was successful AND we actually stored values
                    # If we successfully extracted policy answers, the response is valid
                    if validation_result.result == "error" and actually_extracted_count > 0:
                        validation_result.result = "answered"
                        validation_result.reply = "Your response has been recorded."
        
        # ================================================================ END EXTRACTION POLICY ==========================================================================================================
        
        if validation_result.result == "error":
            invalid_count += 1
            if invalid_count >= MAX_INVALID_COUNT:
                return self._handle_policy_max_invalid(
                    params, response_to_user, last_question, invalid_count,
                    previous_conversation, policy_specific_data, questions,
                    full_items, all_answer, is_last_chapter, next_chapter, next_chapter_id
                )
            else:
                next_question = last_question
                # Server log only (not saved to Firestore to avoid polluting chat history)
                print(json.dumps({
                    "log_type": "invalid_response_retry",
                    "mode": "personal",
                    "context": "policy",
                    "user_id": params.user_unique_id,
                    "question": last_question,
                    "user_response": params.user_response,
                    "invalid_count": invalid_count,
                    "validation_reply": validation_result.reply
                }), flush=True)
                response_to_user.next_question = f"✅ {validation_result.reply}\nLet's try that again: \n{next_question}"
                
                return self._build_final_response(
                    response_to_user, params, ConversationState.POLICY,
                    next_question, invalid_count, 0, policy_specific_data, previous_conversation,
                    "", full_items, questions, 0, all_answer,
                    is_last_chapter, next_chapter, next_chapter_id,
                    current_policy_original_question=current_policy_original_question or next_question
                )
        
        elif "answer" in validation_result.result:
            return self._handle_policy_valid_answer(
                params, response_to_user, last_question, validation_result,
                previous_conversation, policy_specific_data, policies, questions,
                full_items, all_answer, is_last_chapter, next_chapter, next_chapter_id
            )
        
        elif "skip" in validation_result.result or "no" in validation_result.result:
            return self._handle_policy_skip_or_no(
                params, response_to_user, last_question, validation_result,
                previous_conversation, policy_specific_data, policies, questions,
                full_items, all_answer, is_last_chapter, next_chapter, next_chapter_id
            )
        
        elif 'question' in validation_result.result:
            # User asked a clarification question - use query_resolver with original for context
            from src.utils.prompt_functions import query_resolver
            item_name, context = safe_get_item_context(questions)
            query_response = query_resolver(question_for_validation, context, params.user_response)
            response_to_user.bot_response = f"{query_response}\n\n🔄 To continue:\n{last_question}"
            self.logging_service.log_user_bot_exchange(
                ConversationMode.PERSONAL, params.user_unique_id,
                self._build_story_data(questions[0]),
                last_question, params.user_response, query_response
            )
            return self._build_final_response(
                response_to_user, params, ConversationState.POLICY,
                last_question, invalid_count, 0, policy_specific_data, previous_conversation,
                "", full_items, questions, 0, all_answer,
                is_last_chapter, next_chapter, next_chapter_id,
                current_policy_original_question=current_policy_original_question or last_question
            )
    
        else:
            # Handle other validation results
            return self._handle_policy_other_result(
                params, response_to_user, last_question, validation_result,
                previous_conversation, policy_specific_data, policies, questions,
                full_items, all_answer, is_last_chapter, next_chapter, next_chapter_id
            )
    
    def _handle_policy_valid_answer(
        self, params: UserResponseParams, response_to_user: ResponseToUser,
        last_question: str, validation_result, previous_conversation: str,
        policy_specific_data: List[PolicyData], policies: List[Dict],
        questions: List[Dict], full_items: List[Dict], all_answer: str,
        is_last_chapter: bool, next_chapter: str, next_chapter_id: str
    ) -> Dict[str, Any]:
        """Handle valid policy answer."""
        
        # Save current response to policy_specific_data
        policy_topic = self.policy_service.get_policy_topic(questions, ConversationMode.PERSONAL)
        
        for i, item in enumerate(policy_specific_data):
            if item.value is None:
                from .utils import update_policy_data
                policy_specific_data = update_policy_data(
                    last_question, params.user_response, policy_topic,
                    policy_specific_data, policies[i]["policy"]
                )
                break
        
        rephrase_text = self.summary_service.generate_summary(params.user_response)
        self.logging_service.log_user_bot_exchange(
            ConversationMode.PERSONAL, params.user_unique_id,
            self._build_story_data(questions[0]),
            last_question, params.user_response, rephrase_text, full_items
        )

        previous_conversation += f"\nBot : {last_question}, User : {params.user_response}"

        # Store policy answer in personal Redis context (user_id, chapter_id)
        if params.user_unique_id and params.chapter_id:
            try:
                for i, item in enumerate(policy_specific_data):
                    if item.value is not None and i < len(policies):
                        policy_obj = policies[i]
                        append_policy_answer_to_personal_context(
                            user_id=params.user_unique_id,
                            chapter_id=params.chapter_id,
                            policy_tag=policy_obj.get("policy", ""),
                            original_question=policy_obj.get("question", ""),
                            personalized_question=last_question,
                            user_answer=item.value
                        )
                        break
            except Exception as e:
                log_redis_warning("append_policy_answer_to_personal_context", str(e), "personal_handler", {
                    "user_unique_id": params.user_unique_id,
                    "chapter_id": params.chapter_id
                })
        
        # Check if all policy questions answered
        if all(item.value is not None for item in policy_specific_data):
            # All answered - generate summary and move to next question
            final_summary = self.summary_service.generate_bullet_summary(previous_conversation)
            
            # Get current item name before saving and moving on
            current_item_name = questions[0].get("itemName", "this item") if questions else "this item"
            
            # Build policy info for personal mode (using new optimized format)
            policy_qs = questions[0].get("policiesQuestion", []) if questions else []
            unFilledPolicies = self.policy_service.build_policy_info_for_personal(
                policy_qs, policy_specific_data,
                user_id=params.user_unique_id,
                chapter_id=params.chapter_id,
                assistant_id=params.assistant_id,
                use_optimized_context=True
            )

            self.database_service.update_database(
                ConversationMode.PERSONAL, final_summary,
                user_story_id=params.user_story_id, bearer_token=params.bearer_token,
                additional_data=all_answer, chapter_id=params.chapter_id,
                unFilledPolicies=unFilledPolicies
            )
            
            next_question_obj = self.question_service.fetch_next_question(
                ConversationMode.PERSONAL, user_story_id=params.user_story_id,
                bearer_token=params.bearer_token, chapter_id=params.chapter_id,
                user_id=params.user_unique_id, assistant_id=params.assistant_id, personalize=True
            )
            questions = next_question_obj["question_obj"]
            new_q = next_question_obj["question"]
            original_q = questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", "")) if questions else ""
            policy = next_question_obj["policy"]

            # Add completion message before next question
            # completion_message = CONST_ITEM_COMPLETION_MESSAGE.format(item_name=current_item_name)
            # response_to_user.next_question = f"✅ {validation_result.reply}\n\n{completion_message}\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{new_q}"
            response_to_user.next_question = f"✅ {validation_result.reply}\n\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{new_q}"


            final_response = self._build_final_response(
                response_to_user, params, ConversationState.AWAITING_ANSWER,
                original_q, 0, 0, [], " ", "", full_items, questions, 0, " ",
                is_last_chapter, next_chapter, next_chapter_id
            )

            # COMMENTED OUT - Policy key implementation (not for this release)
            # Add policy info to response when seed + all policies completed
            # if policy_info:
            #     final_response["policy"] = policy_info
            
            return final_response
        else:
            # Find next eligible policy question with conditions met
            next_policy_index = None
            for i, policy_obj in enumerate(policies):
                if policy_specific_data[i].value is not None:
                    continue
                from .utils import check_policy_conditions
                if not check_policy_conditions(policy_obj, policy_specific_data, policies):
                    policy_specific_data[i].value = "Skipped (condition not met)"
                    continue
                next_policy_index = i
                break
            
            if next_policy_index is not None:
                original_policy_question = policies[next_policy_index].get("question", "Let's continue.").replace('"', "")
                policy_question_display = original_policy_question
                try:
                    q0 = questions[0] if questions else {}
                    policy_question_display = QuestionPersonalizationService().personalize_single_question(
                        question_text=original_policy_question,
                        dynamic_function_data=q0.get("dynamicFunctionData"),
                        user_id=params.user_unique_id,
                        assistant_id=params.assistant_id if not params.chapter_id else None,
                        chapter_id=params.chapter_id,
                        story_type=q0.get("story"),
                        question_node=q0
                    ) or original_policy_question
                except Exception:
                    pass
                cleaned_question = policy_question_display.replace('\\"', '') if policy_question_display else ""
                response_to_user.next_question = f"✅ {validation_result.reply}\n\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{cleaned_question}" if policy_question_display else "Let's continue."
                
                return self._build_final_response(
                    response_to_user, params, ConversationState.POLICY,
                    original_policy_question, 0, 0, policy_specific_data, previous_conversation,
                    "", full_items, questions, 0, all_answer,
                    is_last_chapter, next_chapter, next_chapter_id,
                    current_policy_original_question=original_policy_question
                )
            else:
                # All questions answered or blocked by conditions
                bullet_summary = self.summary_service.generate_bullet_summary(previous_conversation)
                
                # Get current item name before saving and moving on
                current_item_name = questions[0].get("itemName", "this item") if questions else "this item"
                
                # Build policy info for personal mode
                policy_qs = questions[0].get("policiesQuestion", []) if questions else []
                unFilledPolicies = self.policy_service.build_policy_info_for_personal(
                    policy_qs, policy_specific_data,
                    user_id=params.user_unique_id,
                    chapter_id=params.chapter_id,
                    assistant_id=params.assistant_id,
                    use_optimized_context=True
                )
                
                self.database_service.update_database(
                    ConversationMode.PERSONAL, bullet_summary,
                    user_story_id=params.user_story_id, bearer_token=params.bearer_token,
                    additional_data=all_answer, chapter_id=params.chapter_id,
                    unFilledPolicies=unFilledPolicies
                )
                
                next_question_obj = self.question_service.fetch_next_question(
                    ConversationMode.PERSONAL, user_story_id=params.user_story_id,
                    bearer_token=params.bearer_token, chapter_id=params.chapter_id,
                    user_id=params.user_unique_id, assistant_id=params.assistant_id, personalize=True
                )
                questions = next_question_obj["question_obj"]
                new_q = next_question_obj["question"]
                original_q = questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", "")) if questions else ""
                policy = next_question_obj["policy"]

                # Add completion message before next question
                # completion_message = CONST_ITEM_COMPLETION_MESSAGE.format(item_name=current_item_name)
                # response_to_user.next_question = f"✅ {validation_result.reply}\n\n{completion_message}\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{new_q}"
                response_to_user.next_question = f"✅ {validation_result.reply}\n\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{new_q}"


                return self._build_final_response(
                    response_to_user, params, ConversationState.AWAITING_ANSWER,
                    original_q, 0, 0, [], " ", "", full_items, questions, 0, " ",
                    is_last_chapter, next_chapter, next_chapter_id
                )
    
    def _handle_policy_skip_or_no(
        self, params: UserResponseParams, response_to_user: ResponseToUser,
        last_question: str, validation_result, previous_conversation: str,
        policy_specific_data: List[PolicyData], policies: List[Dict],
        questions: List[Dict], full_items: List[Dict], all_answer: str,
        is_last_chapter: bool, next_chapter: str, next_chapter_id: str
    ) -> Dict[str, Any]:
        """Handle policy skip or no answer."""
        
        skip_val = "Skipped" if "skip" in validation_result.result else "No"
        
        for i, item in enumerate(policy_specific_data):
            if item.value is None:
                policy_specific_data[i].value = skip_val
                break
        
        previous_conversation += f"\nBot : {last_question}, User : {params.user_response}"
        self.logging_service.log_user_bot_exchange(
            ConversationMode.PERSONAL, params.user_unique_id,
            self._build_story_data(questions[0]),
            last_question, params.user_response, skip_val, full_items
        )
        
        # Same logic as valid answer: check for next valid question
        if all(item.value is not None for item in policy_specific_data):
            bullet_summary = self.summary_service.generate_bullet_summary(previous_conversation)
            final_summary = self.summary_service.generate_summary(bullet_summary, "", ConversationMode.PERSONAL)
            
            # Get current item name before saving and moving on
            current_item_name = questions[0].get("itemName", "this item") if questions else "this item"
            
            # Build policy info for personal mode (using new optimized format)
            policy_qs = questions[0].get("policiesQuestion", []) if questions else []
            unFilledPolicies = self.policy_service.build_policy_info_for_personal(
                policy_qs, policy_specific_data,
                user_id=params.user_unique_id,
                chapter_id=params.chapter_id,
                assistant_id=params.assistant_id,
                use_optimized_context=True
            )

            self.database_service.update_database(
                ConversationMode.PERSONAL, final_summary,
                user_story_id=params.user_story_id, bearer_token=params.bearer_token,
                additional_data=all_answer, chapter_id=params.chapter_id,
                unFilledPolicies=unFilledPolicies
            )
            
            next_question_obj = self.question_service.fetch_next_question(
                ConversationMode.PERSONAL, user_story_id=params.user_story_id,
                bearer_token=params.bearer_token, chapter_id=params.chapter_id,
                user_id=params.user_unique_id, assistant_id=params.assistant_id, personalize=True
            )
            questions = next_question_obj["question_obj"]
            new_q = next_question_obj["question"]
            original_q = questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", "")) if questions else ""
            policy = next_question_obj["policy"]

            # Add completion message before next question
            # completion_message = CONST_ITEM_COMPLETION_MESSAGE.format(item_name=current_item_name)
            # response_to_user.next_question = f"✅ {validation_result.reply}\n\n{completion_message}\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{new_q}"
            response_to_user.next_question = f"✅ {validation_result.reply}\n\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{new_q}"


            return self._build_final_response(
                response_to_user, params, ConversationState.AWAITING_ANSWER,
                original_q, 0, 0, [], " ", "", full_items, questions, 0, " ",
                is_last_chapter, next_chapter, next_chapter_id
            )
        else:
            next_policy_index = None
            for i, policy_obj in enumerate(policies):
                if policy_specific_data[i].value is not None:
                    continue
                from .utils import check_policy_conditions
                if not check_policy_conditions(policy_obj, policy_specific_data, policies):
                    policy_specific_data[i].value = "Skipped (condition not met)"
                    continue
                next_policy_index = i
                break
            
            if next_policy_index is not None:
                original_policy_question = policies[next_policy_index].get("question", "").replace('"', "")
                policy_question_display = original_policy_question
                try:
                    q0 = questions[0] if questions else {}
                    policy_question_display = QuestionPersonalizationService().personalize_single_question(
                        question_text=original_policy_question,
                        dynamic_function_data=q0.get("dynamicFunctionData"),
                        user_id=params.user_unique_id,
                        assistant_id=params.assistant_id if not params.chapter_id else None,
                        chapter_id=params.chapter_id,
                        story_type=q0.get("story"),
                        question_node=q0
                    ) or original_policy_question
                except Exception:
                    pass
                response_to_user.next_question = f"✅ {validation_result.reply}\n\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{policy_question_display}"
                
                return self._build_final_response(
                    response_to_user, params, ConversationState.POLICY,
                    original_policy_question, 0, 0, policy_specific_data, previous_conversation,
                    "", full_items, questions, 0, all_answer,
                    is_last_chapter, next_chapter, next_chapter_id,
                    current_policy_original_question=original_policy_question
                )
            else:
                policy_question = "Continuing to the next section..."
                response_to_user.next_question = f"✅ {validation_result.reply}\n\n{CONST_MOVE_ON_TO_NEXT_QUESTION}\n{policy_question}"
                
                return self._build_final_response(
                    response_to_user, params, ConversationState.POLICY,
                    policy_question, 0, 0, policy_specific_data, previous_conversation,
                    "", full_items, questions, 0, all_answer,
                    is_last_chapter, next_chapter, next_chapter_id
                )
    
    def _handle_policy_max_invalid(
        self, params: UserResponseParams, response_to_user: ResponseToUser,
        last_question: str, invalid_count: int, previous_conversation: str,
        policy_specific_data: List[PolicyData], questions: List[Dict],
        full_items: List[Dict], all_answer: str, is_last_chapter: bool,
        next_chapter: str, next_chapter_id: str
    ) -> Dict[str, Any]:
        """Handle policy max invalid attempts."""
        
        new_summary = "Skipped"
        
        self.logging_service.log_user_bot_exchange(
            ConversationMode.PERSONAL, params.user_unique_id,
            self._build_story_data(questions[0]),
            last_question, params.user_response, "Force skipped after 3 invalid attempts"
        )
        
        for i, item in enumerate(policy_specific_data):
            if item.value is None:
                policy_specific_data[i].value = new_summary
                break
        
        previous_conversation += f"\nBot : {last_question}, User : {new_summary}"
        question_type = "policy"
        update_result = self._force_skip_and_move_on(new_summary, questions, params, question_type, previous_conversation, last_question)
        response_to_user.bot_response = update_result["bot_response"]
        response_to_user.next_question = update_result["next_question"]
        questions = update_result["question_obj"]
        return self._build_final_response(
            response_to_user, params, update_result["state"],
            update_result["original_next_question"], 0, 0, [], " ", "",
            full_items, questions, 0, " ",
            is_last_chapter, next_chapter, next_chapter_id
        )
    
    def _handle_policy_other_result(
        self, params: UserResponseParams, response_to_user: ResponseToUser,
        last_question: str, validation_result, previous_conversation: str,
        policy_specific_data: List[PolicyData], policies: List[Dict],
        questions: List[Dict], full_items: List[Dict], all_answer: str,
        is_last_chapter: bool, next_chapter: str, next_chapter_id: str
    ) -> Dict[str, Any]:
        """Handle other policy validation results."""
        
        next_policy_index = None
        for i, policy_obj in enumerate(policies):
            if policy_specific_data[i].value is not None:
                continue
            from .utils import check_policy_conditions
            if not check_policy_conditions(policy_obj, policy_specific_data, policies):
                policy_specific_data[i].value = "Skipped (condition not met)"
                continue
            next_policy_index = i
            break
        
        if next_policy_index is not None:
            policy_question = policies[next_policy_index].get("question", "").replace('"', "")
        else:
            policy_specific_data[i].value = "Skipped (condition not met)"
            policy_question = last_question
        
        from src.utils.prompt_functions import summary_generation
        rephrased_policy_question = last_question
        rephrased_answer = summary_generation(validation_result.reason + " " + rephrased_policy_question)
        response_to_user.next_question = rephrased_answer
        
        self.logging_service.log_user_bot_exchange(
            ConversationMode.PERSONAL, params.user_unique_id,
            self._build_story_data(questions[0]),
            last_question, params.user_response, validation_result.reason, full_items
        )
        
        return self._build_final_response(
            response_to_user, params, ConversationState.POLICY,
            rephrased_policy_question, 0, 0, policy_specific_data, previous_conversation,
            "", full_items, questions, 0, all_answer,
            is_last_chapter, next_chapter, next_chapter_id,
            current_policy_original_question=last_question
        )
    
    def _handle_max_invalid_attempts(
        self, params: UserResponseParams, response_to_user: ResponseToUser,
        last_question: str, full_items: List[Dict], is_last_chapter: bool,
        next_chapter: str, next_chapter_id: str
    ) -> Dict[str, Any]:
        """Handle maximum invalid attempts reached."""
        
        response_to_user.bot_response = "Response skipped or invalid please fill in the details manually, Let's move to the next Question \n"
        
        # Build policy info for personal mode (skip scenario, no policy data available)
        unFilledPolicies = []
        
        update_response = self.database_service.update_database(
            ConversationMode.PERSONAL, "Skipped",
            user_story_id=params.user_story_id, bearer_token=params.bearer_token,
            additional_data="", chapter_id=params.chapter_id,
            unFilledPolicies=unFilledPolicies
        )
        
        if isinstance(update_response, dict) and "body" in update_response:
            new_description = update_response["body"].get("newDescription", params.user_response)
        else:
            new_description = params.user_response
        
        self.logging_service.log_user_bot_exchange(
            ConversationMode.PERSONAL, params.user_unique_id,
            self._build_story_data({}),
            last_question, params.user_response, new_description, full_items
        )
        
        next_question_obj = self.question_service.fetch_next_question(
            ConversationMode.PERSONAL, user_story_id=params.user_story_id,
            bearer_token=params.bearer_token, chapter_id=params.chapter_id,
            user_id=params.user_unique_id, assistant_id=params.assistant_id, personalize=True
        )
        questions = next_question_obj["question_obj"]
        new_q = next_question_obj["question"]
        original_q = questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", "")) if questions else ""
        policy = next_question_obj["policy"]

        if new_q:
            response_to_user.next_question = new_q
            return self._build_final_response(
                response_to_user, params, ConversationState.AWAITING_ANSWER,
                original_q, 0, 0, [], " ", "", full_items, [], 0, " ",
                is_last_chapter, next_chapter, next_chapter_id
            )
        else:
            response_to_user.bot_response += " No more questions remain."
            return self._build_final_response(
                response_to_user, params, ConversationState.DONE,
                None, 0, 0, [], " ", "", full_items, [], 0, " ",
                is_last_chapter, next_chapter, next_chapter_id
            )
    

    def _force_skip_and_move_on(
        self, summary: str, questions: List[Dict], params: UserResponseParams,
        question_type: str = "seed",
        previous_conversation = None,
        last_question = None,
    ) -> Dict[str, Any]:
        """Force skip current question and move to next."""
        base_message = "It seems I've had some difficulty with this one"
        retry_message = ". \nLet's move on to the next question. \n"
        complete_message = "; although all questions have been completed. Feel free to return to this question through the organizer if you'd like to revise your response."
        return_question = ""
        assistant_completed = False
        bot_response = ""
        next_question = ""
        if question_type == "seed":
            # Get current item name before moving on
            current_item_name = questions[0].get("itemName", "this item") if questions else "this item"
            
            self.logging_service.log_user_bot_exchange(
                    ConversationMode.PERSONAL, params.user_unique_id,
                    self._build_story_data(questions[0]),
                    last_question, params.user_response, "Force skipped after 3 invalid attempts"
            )
            # Build policy info for personal mode (force skip scenario, try to get from questions)
            policy_qs = questions[0].get("policiesQuestion", []) if questions else []
            # For force skip, we don't have policy_specific_data, so pass empty list
            unFilledPolicies = []
            if policy_qs:
                # Build basic policy info without answered status
                unFilledPolicies = [{"tag": p.get("policy"), "question": p.get("question"), "isAnswered": False, "policyAnswer": None} for p in policy_qs if p.get("policy") and p.get("question")]
            
            self.database_service.update_database(
                ConversationMode.PERSONAL, summary,
                user_story_id=params.user_story_id, bearer_token=params.bearer_token,
                additional_data="", chapter_id=params.chapter_id,
                unFilledPolicies=unFilledPolicies
            )
            
            next_question_obj = self.question_service.fetch_next_question(
                ConversationMode.PERSONAL, user_story_id=params.user_story_id,
                bearer_token=params.bearer_token, chapter_id=params.chapter_id,
                user_id=params.user_unique_id, assistant_id=params.assistant_id, personalize=True
            )
            questions = next_question_obj["question_obj"]
            new_q = next_question_obj["question"]
            original_q = questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", "")) if questions else ""
            policy = next_question_obj["policy"]
            next_q = new_q
            if next_q:
                # Add completion message before next question
                # completion_message = CONST_ITEM_COMPLETION_MESSAGE.format(item_name=current_item_name)
                # next_question = f"{base_message} {retry_message}\n\n{completion_message}\n\n{next_q}"
                next_question = f"{base_message} {retry_message}\n\n{next_q}"

                return_question = original_q  # Use original for session storage
                assistant_completed = True if next_q.startswith("All assistant items completed successfully") else False
            else:
                bot_response = f"{base_message} {complete_message}"
                assistant_completed = True

        else:  # policy
            # Handle policy skip logic
            self.logging_service.log_user_bot_exchange(
                    ConversationMode.PERSONAL, params.user_unique_id,
                    self._build_story_data(questions[0]),
                    last_question, params.user_response, "Force skipped after 3 invalid attempts"
            )
            policy_question_display = ""
            original_policy_question = ""
            policies = questions[0].get("policiesQuestion", [])
            next_policy_index = next((i for i, item in enumerate([]) if item.get('value') is None), len(policies))
            
            if next_policy_index < len(policies):
                original_policy_question = policies[next_policy_index].get("question", "")
                policy_question_display = original_policy_question
                try:
                    q0 = questions[0] if questions else {}
                    policy_question_display = QuestionPersonalizationService().personalize_single_question(
                        question_text=original_policy_question,
                        dynamic_function_data=q0.get("dynamicFunctionData"),
                        user_id=params.user_unique_id,
                        assistant_id=params.assistant_id if not params.chapter_id else None,
                        chapter_id=params.chapter_id,
                        story_type=q0.get("story"),
                        question_node=q0
                    ) or original_policy_question
                except Exception:
                    pass

            if policy_question_display:
                next_question = f"{base_message} {retry_message} {policy_question_display}"
                return_question = original_policy_question  # Store original for session
            else:
                # Get current item name before saving and moving on
                current_item_name = questions[0].get("itemName", "this item") if questions else "this item"
                
                bullet_summary = "\n".join([line.strip() for line in summary_generation(previous_conversation).split("\n") if line.strip()])
                final_new_summary = preprocess_features(bullet_summary)
                
                # Build policy info for personal mode (force skip policy scenario)
                policy_qs = questions[0].get("policiesQuestion", []) if questions else []
                # For force skip, we don't have policy_specific_data, so build basic info
                unFilledPolicies = []
                if policy_qs:
                    unFilledPolicies = [{"tag": p.get("policy"), "question": p.get("question"), "isAnswered": False, "policyAnswer": None} for p in policy_qs if p.get("policy") and p.get("question")]
                
                self.database_service.update_database(
                        ConversationMode.PERSONAL, final_new_summary,
                        user_story_id=params.user_story_id, bearer_token=params.bearer_token,
                        chapter_id=params.chapter_id,
                        unFilledPolicies=unFilledPolicies
                )
        
                next_question_obj = self.question_service.fetch_next_question(
                    ConversationMode.PERSONAL, user_story_id=params.user_story_id,
                    bearer_token=params.bearer_token, chapter_id=params.chapter_id,
                    user_id=params.user_unique_id, assistant_id=params.assistant_id, personalize=True
                )
                questions = next_question_obj["question_obj"]
                new_q = next_question_obj["question"]
                original_q = questions[0].get("originalBackendQuestions", questions[0].get("backendQuestions", "")) if questions else ""
                policy = next_question_obj["policy"]
                next_q = new_q

                if next_q:
                    # Add completion message before next question
                    # completion_message = CONST_ITEM_COMPLETION_MESSAGE.format(item_name=current_item_name)
                    # next_question = f"{base_message} {retry_message}\n\n{completion_message}\n\n{next_q}"
                    next_question = f"{base_message} {retry_message}\n\n{next_q}"

                    return_question = original_q  # Use original for session storage
                    question_type = "seed"  # Force seed mode on fallback
                    assistant_completed = True if next_q.startswith("All assistant items completed successfully") else False
                else:
                    bot_response = f"{base_message} {complete_message}"
                    assistant_completed = True
        
        return {
            "state": ConversationState.AWAITING_ANSWER if question_type == "seed" else ConversationState.POLICY,
            "invalid_count": 0,
            "assistant_completed": assistant_completed,
            "next_question": next_question,
            "original_next_question": return_question,  # Original (non-personalized) for session storage
            "bot_response": bot_response,
            "question_obj": questions
        }
       
    def _build_story_data(self, question: Dict[str, Any]) -> Dict[str, Any]:
        """Build story data dictionary for logging."""
        return {
            "userStoryId": question.get("userStoryId"),
            "storyId": question.get("storyId"),
            "itemId": question.get("itemId"),
            "itemName": question.get("itemName"),
            "docId": question.get("docId"),
            "chapterId": question.get("chapterId"),
            "chapterName": question.get("chapterName"),
            "storyName": question.get("storyName"),
            "storyType": question.get("storyType")
        }
    
    def _build_final_response(
        self, response_to_user: ResponseToUser, params: UserResponseParams,
        state: ConversationState, last_question: str, invalid_count: int,
        repeat_policy_count: int, policy_specific_data: List[PolicyData],
        previous_conversation: str, main_question_response: str,
        full_items: List[Dict], questions: List[Dict], policy_done: int,
        all_answer: str, is_last_chapter: bool, next_chapter: str, next_chapter_id: str,
        current_policy_original_question: Optional[str] = None
    ) -> Dict[str, Any]:
        """Build the final response dictionary."""
        # last_question is always original (non-personalized) for session storage
        # Update session data
        update_data = {
            "last_question": last_question,
            "prev_question": last_question,
            "user_response": params.user_response,
            "main_question_response": main_question_response if state == ConversationState.POLICY else params.user_response,
            "invalid_count": invalid_count,
            "repeat_policy_count": repeat_policy_count,
            "state": state.value,
            "answer_log": all_answer,
            "policy_done": policy_done,
            "conversation_history": previous_conversation,
            "policy_log": [{"policy": p.policy, "value": p.value} for p in policy_specific_data],
            "functionFlow": None,
            "dynamicFunctionData": None,
            "questions_obj": questions,
            "full_items_details": full_items
        }
        # Store original policy question when in policy state; clear when leaving
        if state == ConversationState.POLICY and current_policy_original_question is not None:
            update_data["current_policy_original_question"] = current_policy_original_question
        elif state != ConversationState.POLICY:
            update_data["current_policy_original_question"] = None
        
        self.session_service.update_session_data(
            params.uuid, ConversationMode.PERSONAL, update_data, chapter_id=params.chapter_id
        )
        
        # Build response using utils
        from .utils import build_response_structure
        
        # Extract fields from questions object for dynamicFunctionData
        item_id = None
        chapter_name = None
        dynamic_function_data = None
        
        if questions and len(questions) > 0:
            first_question = questions[0]
            item_id = first_question.get("itemId")
            chapter_name = first_question.get("chapterName")
            
            # Build dynamicFunctionData structure
            chapter_doc_id = first_question.get("chapterId")
            story_doc_id = first_question.get("docId")
            story_name = first_question.get("storyName")
            
            if chapter_doc_id or story_doc_id or story_name:
                dynamic_function_data = {
                    "result": [{
                        "chapterDocId": chapter_doc_id,
                        "error": False,
                        "storyDocId": story_doc_id,
                        "storyName": story_name
                    }]
                }
        
        final_response = build_response_structure(
            mode="personal",
            state=state.value,
            bot_response=response_to_user.bot_response,
            next_question=response_to_user.next_question,
            item_id=item_id,
            user_story_id=params.user_story_id,
            is_last_chapter=is_last_chapter,
            next_chapter=next_chapter,
            next_chapter_id=next_chapter_id,
            chapter_name=chapter_name,
            dynamic_function_data=dynamic_function_data
        )
        
        # Note: Conversation storage now handled by optimized format
        # Seed questions and policy answers are stored via append_seed_question_to_context()
        # and append_policy_answer_to_context() respectively
        
        return final_response