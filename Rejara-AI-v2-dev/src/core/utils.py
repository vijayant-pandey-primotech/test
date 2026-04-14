"""
Utility functions for the conversation system.
These are pure helper functions without side effects.
"""

import re
from typing import List, Dict, Any, Optional
from .models import PolicyData


def extract_keys(data: List[Dict[str, Any]]) -> List[List[Optional[str]]]:
    """
    Extract keys from the data.
    
    Args:
        data: List of dictionaries containing location and mandatory fields
        
    Returns:
        List of [location, mandatory] pairs
    """
    return [[item.get('location', None), item.get('mandatory', None)] for item in data]


def clean_input(text: str) -> str:
    """
    Clean the input text by removing special characters.
    
    Args:
        text: The input text to clean
        
    Returns:
        Cleaned text with special characters removed
    """
    return re.sub(r'[{}[\]()<>\\|#*~`"\\\\]', '', text).strip()

# The Old One
# def update_policy_data(
#     new_q: str, 
#     user_response: str, 
#     all_policies: List[str], 
#     current_policy_data: List[PolicyData], 
#     current_policy: str
# ) -> List[PolicyData]:
#     """
#     Validate the user response against the question and update policy data.
    
#     Args:
#         new_q: The new question
#         user_response: User's response
#         all_policies: List of all policies
#         current_policy_data: Current policy data list
#         current_policy: Current policy being processed
        
#     Returns:
#         Updated policy data list
#     """
#     # Import here to avoid circular imports
#     from src.utils.prompt_functions import policy_data_extraction
    
#     primary_data_policy, _ = policy_data_extraction(new_q, user_response, all_policies, current_policy)

#     for policy, value in primary_data_policy.items():
#         if value is not None and value != "":
#             for current_item in current_policy_data:
#                 # Match extracted policy with known list; 
#                 # need to account for LLM sometimes changes the policy name slightly
#                 if policy.lower() in current_item.policy.lower():
#                     current_item.value = 'Answered'  # no need to store actual value; LLM also sometimes changes the structure

#     return current_policy_data

def update_policy_data(
    new_q: str, 
    user_response: str, 
    all_policies: List[str], 
    current_policy_data: List[PolicyData], 
    current_policy: str
) -> List[PolicyData]:
    """
    Validate the user response against the question and update policy data.
    
    Args:
        new_q: The new question
        user_response: User's response
        all_policies: List of all policies
        current_policy_data: Current policy data list
        current_policy: Current policy being processed
        
    Returns:
        Updated policy data list
    """

    if not current_policy or current_policy is None:
        return current_policy_data
    for item in current_policy_data:
        if item.value is None:
            if item.policy == current_policy:
                item.value = "Answered"
                return current_policy_data

def check_policy_conditions(
    policy_question: Dict[str, Any], 
    policy_specific_data: List[PolicyData], 
    all_policies: List[Dict[str, Any]]
) -> bool:
    """
    Evaluates if a policy question's conditions are met based on policy_specific_data.
    Uses boolean_extraction to interpret complex answers as True/False.

    Args:
        policy_question: The policy question with a 'conditions' field
        policy_specific_data: List of policy answers [{policy, value}, ...]
        all_policies: Full list of all policy questions

    Returns:
        True if all conditions are met, False otherwise
    """
    # Import here to avoid circular imports
    from src.utils.prompt_functions import policy_boolean_extraction
    
    conditions = policy_question.get("conditions", [])
    if not conditions:
        return True  # No conditions = always valid

    for condition in conditions:
        depends_on = condition.get("dependsOn")
        expected_value = str(condition.get("value", "")).strip().lower()
        operator = condition.get("operator", "Equal")

        # Find the actual answer for the dependsOn policy
        policy_data = next((item for item in policy_specific_data if item.policy == depends_on), None)

        if not policy_data or not policy_data.value:
            return False  # Can't evaluate condition

        user_answer = str(policy_data.value).strip()

        # Get the original question for the dependsOn policy
        bot_question_data = next((item for item in all_policies if item.get("policy") == depends_on), None)
        bot_question_text = bot_question_data.get("question", "") if bot_question_data else ""

        # Normalize user answer using policy_boolean_extraction
        try:
            normalized_bool = policy_boolean_extraction(bot_question_text, user_answer)
            normalized_value = "yes" if normalized_bool == "yes" else "no"
        except:
            normalized_value = user_answer.lower()  # fallback

        # Evaluate the condition
        if operator == "Equal" and normalized_value != expected_value:
            return False

    return True

# new function for the cluster and presonal 
# def check_policy_conditions(
#     policy_question: Dict[str, Any],
#     all_policy_qs: List[Dict[str, Any]]
# ) -> bool:
#     """
#     Evaluates if a policy question's conditions are met 
#     based on other policy questions' executionResult.

#     Args:
#         policy_question: The policy question being checked.
#         all_policy_qs: Full list of policy questions (policy_qs).

#     Returns:
#         True if all conditions are met, False otherwise.
#     """

#     conditions = policy_question.get("conditions", [])
#     if not conditions:
#         return True  # No conditions → always valid

#     for condition in conditions:
#         depends_on = condition.get("dependsOn")
#         expected_value = str(condition.get("value", "")).strip().lower()
#         operator = condition.get("operator", "Equal")

#         # Find the question this condition depends on
#         dependency_q = next((q for q in all_policy_qs if q.get("policy") == depends_on), None)
#         if not dependency_q:
#             return False  # Dependency not found

#         user_answer = dependency_q.get("executionResult")

#         # If no answer yet, can't evaluate
#         if not user_answer:
#             return False

#         # Normalize answer (basic yes/no handling for now)
#         normalized_value = str(user_answer).strip().lower()

#         # Apply operator
#         if operator == "Equal" and normalized_value != expected_value:
#             return False

#     return True


def build_response_structure(
    mode: str,
    state: str,
    bot_response: str,
    next_question: str,
    item_id: Optional[str],
    user_story_id: Optional[int] = None,
    is_last_chapter: bool = False,
    next_chapter: Optional[str] = None,
    next_chapter_id: Optional[str] = None,
    chapter_name: Optional[str] = None,
    function_flow: Optional[List] = None,
    dynamic_function_data: Optional[Dict] = None,
    selected_items_context: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Build the final response structure based on mode and state.
    
    Args:
        mode: Conversation mode (personal/cluster)
        state: Current conversation state
        bot_response: Bot's response message
        next_question: Next question to ask
        item_id: Current item ID
        user_story_id: User story ID (for personal mode)
        is_last_chapter: Whether this is the last chapter
        next_chapter: Next chapter name
        next_chapter_id: Next chapter ID
        function_flow: Function flow data
        dynamic_function_data: Dynamic function data
        
    Returns:
        Structured response dictionary
    """
    from .models import (
        NON_FINAL_PHRASES, 
        DEFAULT_LIKE_PHRASES_CLUSTER, 
        DEFAULT_LIKE_PHRASES_PERSONAL
    )
    
    if mode == 'cluster':
        default_like_phrases = DEFAULT_LIKE_PHRASES_CLUSTER
        type_lower = "assistant"  # Assuming cluster mode is for assistant
        
        # Combine bot_response and next_question checks
        is_completion_message = (
            "All assistant items completed successfully" in (bot_response or "") or
            "All assistant items completed successfully" in (next_question or "")
        )
        
        # Final fallback message logic
        if state == "done" or is_completion_message:
            final_response = "✅ Your response has been recorded in the organizer."
        elif next_question and not any(phrase in next_question for phrase in default_like_phrases + NON_FINAL_PHRASES):
            final_response = next_question
        elif bot_response and not any(phrase in bot_response for phrase in default_like_phrases + NON_FINAL_PHRASES):
            final_response = bot_response
        else:
            final_response = "✅ Your response has been recorded in the organizer."
            
        # Clean and fallback
        final_response = (final_response or "").replace('"', "")
        
        if not final_response:
            final_response = "Sorry, something went wrong. Please restart or refresh the conversation."
            
        response = {
            "prev_option": ["random1", "random2"],
            "question": final_response,
            "itemId": item_id,
        }
        
        if not is_completion_message and state != "policy":
            response["functionFlow"] = function_flow
            response["dynamicFunctionData"] = dynamic_function_data
            response["itemId"] = item_id
        
        # Add selectedItemsContext if provided
        if selected_items_context:
            response["selectedItemsContext"] = selected_items_context
            
        return response
        
    else:  # personal mode
        default_like_phrases = DEFAULT_LIKE_PHRASES_PERSONAL
        
        if next_question and all(phrase not in next_question for phrase in default_like_phrases + NON_FINAL_PHRASES):
            final_response = next_question
        elif bot_response and all(phrase not in bot_response for phrase in default_like_phrases + NON_FINAL_PHRASES):
            final_response = bot_response
        else:
            type_lower = "story"  # Default assumption for personal mode
            if not is_last_chapter:
                final_response = "✅ Your response has been recorded.\n\n➡️ Do you want to move to the next chapter?"
            else:
                final_response = "✅ Your response has been recorded."
                
        # Clean and format
        final_response = (final_response or "").replace('"', "")
        
        if not final_response:
            final_response = "Sorry, something went wrong. Please restart or refresh the conversation."
            
        all_questions_done = any(
            phrase in final_response.strip() for phrase in default_like_phrases
        )
        
        response = {
            "prev_option": ["random1", "random2"], 
            "question": final_response, 
            "userStoryId": user_story_id, 
            "allQuestionsAnswered": all_questions_done, 
            "is_last_chapter": is_last_chapter,
            "nextChapter": next_chapter,
            "nextChapterId": next_chapter_id
        }
        
        # Add itemId at root level
        if item_id:
            response["itemId"] = item_id
        
        # Add chapterName at root level
        if chapter_name:
            response["chapterName"] = chapter_name
        
        # Add dynamicFunctionData if provided
        if dynamic_function_data:
            response["dynamicFunctionData"] = dynamic_function_data
        
        # Add selectedItemsContext if provided
        if selected_items_context:
            response["selectedItemsContext"] = selected_items_context
        
        return response


def get_navigation_metadata(questions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Extract navigation metadata from questions for personal mode.
    
    Args:
        questions: List of question objects
        
    Returns:
        Dictionary with navigation metadata
    """
    if not questions:
        return {
            "is_last_chapter": False,
            "next_chapter": None,
            "next_chapter_id": None
        }
        
    first_question = questions[0]
    is_last_chapter_raw = first_question.get("isLastChapter", False)
    is_last_chapter = (
        True if is_last_chapter_raw is True
        else str(is_last_chapter_raw).strip().lower() == "true"
    )
    
    return {
        "is_last_chapter": is_last_chapter,
        "next_chapter": first_question.get("nextChapter"),
        "next_chapter_id": first_question.get("nextChapterId")
    }


def format_final_response_message(
    mode: str,
    state: str,
    bot_response: str,
    next_question: str,
    is_completion_message: bool = False,
    is_last_chapter: bool = False,
    type_param: Optional[str] = None
) -> str:
    """
    Format the final response message based on conversation state and mode.
    
    Args:
        mode: Conversation mode
        state: Current state
        bot_response: Bot response
        next_question: Next question
        is_completion_message: Whether this is a completion message
        is_last_chapter: Whether this is the last chapter
        type_param: Type parameter from request
        
    Returns:
        Formatted final response message
    """
    from .models import NON_FINAL_PHRASES, DEFAULT_LIKE_PHRASES_CLUSTER, DEFAULT_LIKE_PHRASES_PERSONAL
    
    if mode == 'cluster':
        default_like_phrases = DEFAULT_LIKE_PHRASES_CLUSTER
        type_lower = (type_param or "").lower()
        is_assistant = type_lower == "assistant"
        
        if state == "done" or (is_completion_message and is_assistant):
            return "✅ Your response has been recorded in the organizer."
        elif next_question and not any(phrase in next_question for phrase in default_like_phrases + NON_FINAL_PHRASES):
            return next_question
        elif bot_response and not any(phrase in bot_response for phrase in default_like_phrases + NON_FINAL_PHRASES):
            return bot_response
        else:
            return "✅ Your response has been recorded in the organizer." if is_assistant else "Your response for this chapter has been recorded."
    else:
        default_like_phrases = DEFAULT_LIKE_PHRASES_PERSONAL
        
        if next_question and all(phrase not in next_question for phrase in default_like_phrases + NON_FINAL_PHRASES):
            return next_question
        elif bot_response and all(phrase not in bot_response for phrase in default_like_phrases + NON_FINAL_PHRASES):
            return bot_response
        else:
            type_lower = (type_param or "").lower()
            if type_lower == "story" and not is_last_chapter:
                return "Your response for this chapter has been recorded. Do you want to move to the next chapter?"
            elif type_lower == "story" and is_last_chapter:
                return "Your response for this chapter has been recorded."
            elif type_lower == "assistant" and not is_last_chapter:
                return "Your response for this chapter has been recorded. Do you want to move to the Assistant screen?"
            elif type_lower == "assistant" and is_last_chapter:
                return "Your response for this chapter has been recorded. Do you want to move to the Assistant screen?"
            else:
                return "Your response for this chapter has been recorded."


def safe_get_item_context(questions: List[Dict[str, Any]]) -> tuple[Optional[str], Optional[str]]:
    """
    Safely extract item name and context from questions.
    
    Args:
        questions: List of question dictionaries
        
    Returns:
        Tuple of (item_name, context)
    """
    try:
        item_name = questions[0]["itemName"]
        context = questions[0]["context"]
        return item_name, context
    except (IndexError, KeyError, TypeError):
        return None, None
    
def insert_placeholder_values(question_obj, text_question):
    placeholder_values = {
        "storyName": question_obj.get("storyName", None),
        "subCategoryName": question_obj.get("subCategoryName").lower() if question_obj.get("subCategoryName") else None ,
        "chapterName": question_obj.get("chapterName").lower() if question_obj.get("chapterName") else None,
        "itemName": question_obj.get("itemName").lower() if question_obj.get("itemName") else None,
    }
    new_context_question = text_question.format(**placeholder_values)
    return new_context_question

# we are not using this function for now
def format_dependents_note(dependents: List[Dict[str, Any]], include_prefix: bool = True) -> str:
    """
    Return a readable reminder of who a policy question applies to.
    
    Args:
        dependents: List of dependent dictionaries containing name information
        include_prefix: If True, includes "🔍 Next question for", otherwise just returns names
        
    Returns:
        Formatted string indicating who the question is for (empty if no dependents)
        
    Examples:
        With prefix:
        - 1 dependent: "🔍 Next question for Ritika:"
        - 2 dependents: "🔍 Next question for Ritika and Shivay:"
        - 3+ dependents: "🔍 Next question for Ritika, Shivay, and Vaidehi:"
        
        Without prefix (for embedding):
        - "for Ritika"
        - "for Ritika and Shivay"
        - "for Ritika, Shivay, and Vaidehi"
    """
    if not dependents:
        return ""

    names: List[str] = []
    for item in dependents:
        # Try different possible name keys
        for key in ("storyName", "name", "dependentName"):
            value = item.get(key)
            if value:
                names.append(value)
                break

    if not names:
        return ""

    # Format the names part
    if len(names) == 1:
        names_part = f"for {names[0]}"
    elif len(names) == 2:
        names_part = f"for {names[0]} and {names[1]}"
    else:
        # For 3 or more, use Oxford comma format
        names_part = f"for {', '.join(names[:-1])}, and {names[-1]}"
    
    if include_prefix:
        return f"🔍 Next question {names_part}:"
    else:
        return names_part


def split_user_response(user_response: str) -> List[str]:
    """
       Properly split the user response into key-value pairs
       splitting just by comma can incorrectly split a key/value pair response that contains a comma; e.g.
       "Joey=yes and Judith Brown, 212 555-1233 is the executor, Madison=yes"
       -> {"joey": "yes and Judith Brown, 212 555-1233 is the executor", "madison": "yes"}
    """
    _user_response_for_extraction = {}
    parts = [p.strip() for p in user_response.split(",")]
    i = 0
    while i < len(parts):
        part = parts[i]
        if "=" in part and len(part.split("=", 1)) == 2:
            # Found a key-value pair
            key, value = part.split("=", 1)
            key = key.strip().lower()
            value = value.strip()
            
            # Collect any following text until the next key-value pair
            i += 1
            while i < len(parts):
                next_part = parts[i]
                # If next part is a key-value pair, stop collecting
                if "=" in next_part and len(next_part.split("=", 1)) == 2:
                    break
                # Otherwise, append to value
                value += ", " + next_part
                i += 1
            
            _user_response_for_extraction[key] = value.strip()
        else:
            i += 1

    return _user_response_for_extraction

def is_key_value_format(text: str) -> bool:
    # Check if text is in key=value format (e.g., "bob=xxx, john=xxx, mary=xxx")
    if not isinstance(text, str):
        return False
    # Check if it contains "=" and looks like key=value pairs
    if "=" not in text:
        return False
    # Split by comma and check for key-value pairs
    # Allow text between pairs (not every part needs "=")
    parts = [part.strip() for part in text.split(",") if part.strip()]
    # Count how many parts have valid key=value format
    key_value_parts = [part for part in parts if "=" in part and len(part.split("=", 1)) == 2]
    # Return True if we have at least 1 key-value pair (e.g., "joey=not yet")
    return len(key_value_parts) >= 1


def is_scoped_question(question_text: str) -> bool:
    """
    Detect if a question is scoped to a specific dependent.
    
    A question is scoped if it contains patterns like:
    - "for {name}" (e.g., "Next question for Karthic:")
    - "Question for {name}"
    - "Next question for {name}"
    
    Args:
        question_text: The question message/text to check
        
    Returns:
        True if the question is scoped to a specific dependent, False otherwise
    """
    if not question_text:
        return False
    
    import re
    scoped_patterns = [
        r"for\s+[A-Z][a-zA-Z]+",  # "for Karthic", "for Lewis"
        r"Question\s+for\s+[A-Z][a-zA-Z]+",  # "Question for Karthic"
        r"Next\s+question\s+for\s+[A-Z][a-zA-Z]+",  # "Next question for Karthic"
    ]
    for pattern in scoped_patterns:
        if re.search(pattern, question_text, re.IGNORECASE):
            return True
    return False


def build_selected_items_context(
    selected_story_names: List[str],
    dynamic_function_data: Optional[Dict] = None,
    question_obj: Optional[Dict] = None
) -> Optional[List[Dict[str, Any]]]:
    """
    Build selectedItemsContext from user selections.
    
    For dynamic function agents:
    - Matches selected_story_names against dynamicFunctionData.result using storyName (or storyDocId)
    - Returns filtered subset of dynamicFunctionData.result containing only matched items
    
    For non-dynamic function agents:
    - Populates selectedItemsContext directly from question_obj
    - Even if only a single implicit item exists
    
    Args:
        selected_story_names: List of story names (lowercase) that user selected
        dynamic_function_data: Dynamic function data containing all available items
        question_obj: Question object for non-dynamic cases
        
    Returns:
        List of selected items with fields: chapterDocId, chapterName, storyDocId, storyName, itemId
        Returns None if no selections or invalid data
    """
    if not selected_story_names:
        return None
    
    selected_items = []
    
    # Normalize selected story names to lowercase for matching
    selected_names_lower = [name.lower().strip() for name in selected_story_names if name]
    
    if not selected_names_lower:
        return None
    
    # Case A: Dynamic Function Agents
    if dynamic_function_data and isinstance(dynamic_function_data, dict):
        result = dynamic_function_data.get("result")
        if isinstance(result, list) and len(result) > 0:
            for item in result:
                if not isinstance(item, dict):
                    continue
                
                # Match using storyName (primary) or storyDocId (fallback)
                story_name = item.get("storyName", "")
                story_doc_id = item.get("storyDocId", "")
                
                # Normalize for comparison
                story_name_lower = story_name.lower().strip() if story_name else ""
                
                # Check if this item matches any selected name
                is_selected = False
                if story_name_lower in selected_names_lower:
                    is_selected = True
                elif story_doc_id:
                    # Try matching by storyDocId if available
                    for selected_name in selected_names_lower:
                        if story_doc_id.lower() == selected_name.lower():
                            is_selected = True
                            break
                
                if is_selected:
                    # Extract only required fields
                    selected_item = {
                        "chapterDocId": item.get("chapterDocId", ""),
                        "chapterName": item.get("chapterName", ""),
                        "storyDocId": item.get("storyDocId", ""),
                        "storyName": item.get("storyName", ""),
                        "itemId": item.get("itemId")
                    }
                    # Only add if we have at least storyName
                    if selected_item["storyName"]:
                        selected_items.append(selected_item)
    
    # Case B: Non-Dynamic Function Agents
    elif question_obj and isinstance(question_obj, dict):
        # Directly populate from question object
        selected_item = {
            "chapterDocId": question_obj.get("chapterDocId", ""),
            "chapterName": question_obj.get("chapterName", ""),
            "storyDocId": question_obj.get("userStoryDocId", "") or question_obj.get("storyDocId", ""),
            "storyName": question_obj.get("storyName", ""),
            "itemId": question_obj.get("itemId")
        }
        # Only add if we have at least storyName
        if selected_item["storyName"]:
            selected_items.append(selected_item)
    
    # Return None if empty, otherwise return the list
    return selected_items if selected_items else None

def setup_all_users(question_type: str, full_items: Optional[List[Dict[str, Any]]] = None, session_data: Optional[Dict] = None, 
                    affirmative_dependents: Optional[List[Dict[str, Any]]] = None) -> List[str]:
    all_users = []
    if question_type == "seed":
        if full_items:
            all_users = [item["storyName"].lower() for item in full_items]
        elif session_data.get("dynamic_data"):
            all_users = [item["storyName"].lower() for item in session_data.get("dynamic_data", [])]
        else:
            all_users = [session_data["questions_obj"][0].get("storyName", "").lower()]
    elif question_type == "policy":
        if affirmative_dependents:
            all_users = [item["storyName"].lower() for item in affirmative_dependents]
    return all_users

def personlize_question_for_error_question_case(question_type, qs, last_question, params):
    if question_type == 'policy':
        try:
            from src.services.question_personalization_service import QuestionPersonalizationService
            personalizer = QuestionPersonalizationService()
            # Use filtered data (affirmative dependents only) if available, otherwise use original
            dynamic_func_data = qs[0].get("filteredDynamicFunctionData") or qs[0].get("dynamicFunctionData") if qs else None
            personlize_question = personalizer.personalize_single_question(
                question_text=last_question,
                dynamic_function_data=dynamic_func_data,
                user_id=params.user_unique_id,
                assistant_id=params.assistant_id,
                story_type=qs[0].get("story") if qs else None,
                question_node=qs[0] if qs else None
            )
            return personlize_question

        except Exception as e:
            # Don't fail if personalization fails - use original question
            pass
    else:
        try:
            from src.services.question_personalization_service import QuestionPersonalizationService
            personalizer = QuestionPersonalizationService()
            # dynamic_func_data = nq.get("dynamicFunctionData")
            dynamic_func_data = qs[0].get("filteredDynamicFunctionData") or qs[0].get("dynamicFunctionData") if qs else None
            # original_template = qs[0].get("originalBackendQuestions", qs[0].get("backendQuestions", ""))
            current_story_type = qs[0].get("story", "") if qs and qs[0] else ""

            # original_template = nq.get("originalBackendQuestions", next_question)
            personlize_question = personalizer.personalize_question(
                original_question=last_question,
                dynamic_function_data=dynamic_func_data,
                user_id=params.user_unique_id,
                assistant_id=params.assistant_id,
                story_type=current_story_type,
                question_node=qs[0] if qs else None
            )
            return personlize_question
        except Exception as e:
            # Don't fail if personalization fails - use original question
            pass