"""
Assistant Context Service
Manages full conversation history in Redis for assistant-based conversations.
This service provides context-aware conversation management separate from session_data.
"""

import json
from typing import List, Dict, Optional, Any
from datetime import datetime
from src.services.redis_service import redis_client

# Redis TTL configuration: 12 hours (in seconds)
CONVERSATION_TTL_SECONDS = 12 * 60 * 60  # 43200 seconds = 12 hours


def _log_redis_error(level: str, operation: str, error: str, context: Optional[Dict[str, Any]] = None) -> None:
    """
    Log Redis operation errors/warnings as a single JSON object.
    
    Args:
        level: Log level (ERROR, WARNING)
        operation: Operation that failed (e.g., "get_assistant_conversation")
        error: Error message
        context: Optional context data (user_id, assistant_id, etc.)
    """
    log_data = {
        "timestamp": datetime.utcnow().isoformat(),
        "level": level,
        "operation": operation,
        "error": str(error),
        "service": "assistant_context_service"
    }
    
    # Extract assistant_id from context if available and add as top-level field
    if context:
        if "assistant_id" in context:
            log_data["assistantId"] = context.get("assistant_id")
            # Remove assistant_id from context to avoid duplication
            context = {k: v for k, v in context.items() if k != "assistant_id"}
        log_data["context"] = context
    
    print(json.dumps(log_data))


def log_redis_warning(operation: str, error: str, handler: str, context: Optional[Dict[str, Any]] = None) -> None:
    """
    Log Redis operation warnings as a single JSON object.
    Can be used by handlers (cluster_handler, personal_handler) to log warnings.
    
    Args:
        operation: Operation that failed (e.g., "load_conversation_history")
        error: Error message
        handler: Handler name (e.g., "cluster_handler", "personal_handler")
        context: Optional context data (user_id, assistant_id, etc.)
    """
    log_data = {
        "timestamp": datetime.utcnow().isoformat(),
        "level": "WARNING",
        "operation": operation,
        "error": str(error),
        "handler": handler
    }
    
    # Extract assistant_id from context if available and add as top-level field
    if context:
        if "assistant_id" in context:
            log_data["assistantId"] = context.get("assistant_id")
            # Remove assistant_id from context to avoid duplication
            context = {k: v for k, v in context.items() if k != "assistant_id"}
        log_data["context"] = context
    
    print(json.dumps(log_data))


def get_assistant_context_key(user_id: int, assistant_id: str) -> str:
    """
    Generate Redis key for assistant context.
    
    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant
        
    Returns:
        Redis key string in format: assistant:context:{userId}:{assistantId}
    """
    return f"assistant:context:{user_id}:{assistant_id}"


def get_assistant_conversation(user_id: int, assistant_id: str) -> List[Dict[str, str]]:
    """
    Retrieve full conversation history from Redis.
    
    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant
        
    Returns:
        List of conversation messages, each with 'role' and 'content' keys.
        Returns empty list if no conversation exists or on error.
    """
    try:
        key = get_assistant_context_key(user_id, assistant_id)
        conversation_json = redis_client.get(key)
        
        if conversation_json:
            conversation = json.loads(conversation_json)
            if isinstance(conversation, list):
                return conversation
            else:
                # Handle legacy format or corrupted data
                return []
        return []
    except json.JSONDecodeError:
        # Handle corrupted JSON data
        return []
    except Exception as e:
        # Log error but don't fail - return empty list
        _log_redis_error("ERROR", "get_assistant_conversation", str(e), {
            "user_id": user_id,
            "assistant_id": assistant_id
        })
        return []


def append_to_assistant_conversation(
    user_id: int,
    assistant_id: str,
    user_message: str,
    assistant_message: str
) -> bool:
    """
    Append user and assistant messages to the conversation history.
    
    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant
        user_message: The user's message/response
        assistant_message: The assistant's/bot's response
        
    Returns:
        True if successful, False otherwise
    """
    try:
        key = get_assistant_context_key(user_id, assistant_id)
        
        # Get existing conversation
        conversation = get_assistant_conversation(user_id, assistant_id)
        
        # Append new messages
        if user_message:
            conversation.append({
                "role": "user",
                "content": user_message,
                "timestamp": datetime.utcnow().isoformat(),
                "assistantId": assistant_id
            })
        
        if assistant_message:
            conversation.append({
                "role": "assistant",
                "content": assistant_message,
                "timestamp": datetime.utcnow().isoformat(),
                "assistantId": assistant_id
            })
        
        # Store back to Redis with 12-hour expiration
        conversation_json = json.dumps(conversation)
        redis_client.set(key, conversation_json, ex=CONVERSATION_TTL_SECONDS)  # 12 hours TTL
        
        return True
    except Exception as e:
        _log_redis_error("ERROR", "append_to_assistant_conversation", str(e), {
            "user_id": user_id,
            "assistant_id": assistant_id,
            "user_message_length": len(user_message) if user_message else 0,
            "assistant_message_length": len(assistant_message) if assistant_message else 0
        })
        return False


def initialize_assistant_conversation(
    user_id: int,
    assistant_id: str,
    initial_message: Optional[str] = None
) -> bool:
    """
    Initialize a new conversation for an assistant.
    If initial_message is provided, it will be added as the first assistant message.
    
    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant
        initial_message: Optional initial assistant message
        
    Returns:
        True if successful, False otherwise
    """
    try:
        key = get_assistant_context_key(user_id, assistant_id)
        
        # Check if conversation already exists
        existing = get_assistant_conversation(user_id, assistant_id)
        if existing:
            # Conversation already exists, don't overwrite
            return True
        
        # Create new conversation
        conversation = []
        if initial_message:
            conversation.append({
                "role": "assistant",
                "content": initial_message,
                "timestamp": datetime.utcnow().isoformat(),
                "assistantId": assistant_id
            })
        
        # Store to Redis with 12-hour expiration
        conversation_json = json.dumps(conversation)
        redis_client.set(key, conversation_json, ex=CONVERSATION_TTL_SECONDS)  # 12 hours TTL
        
        return True
    except Exception as e:
        _log_redis_error("ERROR", "initialize_assistant_conversation", str(e), {
            "user_id": user_id,
            "assistant_id": assistant_id,
            "has_initial_message": initial_message is not None
        })
        return False


def clear_assistant_conversation(user_id: int, assistant_id: str) -> bool:
    """
    Clear/invalidate the conversation history for an assistant.
    This should be called when the user exits or completes the assistant.
    
    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant
        
    Returns:
        True if successful, False otherwise
    """
    try:
        key = get_assistant_context_key(user_id, assistant_id)
        redis_client.delete(key)
        return True
    except Exception as e:
        _log_redis_error("ERROR", "clear_assistant_conversation", str(e), {
            "user_id": user_id,
            "assistant_id": assistant_id
        })
        return False


def get_conversation_as_text(user_id: int, assistant_id: str, max_messages: Optional[int] = None) -> str:
    """
    Get conversation history formatted as a text string for use in prompts.
    
    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant
        max_messages: Optional limit on number of messages to include (most recent)
        
    Returns:
        Formatted conversation string
    """
    try:
        conversation = get_assistant_conversation(user_id, assistant_id)
        
        if not conversation:
            return ""
        
        # Optionally limit to most recent messages
        if max_messages:
            conversation = conversation[-max_messages:]
        
        # Format as text
        formatted_lines = []
        for msg in conversation:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            formatted_lines.append(f"{role.capitalize()}: {content}")
        
        return "\n".join(formatted_lines)
    except Exception as e:
        _log_redis_error("ERROR", "get_conversation_as_text", str(e), {
            "user_id": user_id,
            "assistant_id": assistant_id,
            "max_messages": max_messages
        })
        return ""


def get_conversation_as_text_from_optimized(user_id: int, assistant_id: str, max_exchanges: Optional[int] = None) -> str:
    """
    Get conversation history from optimized Redis context formatted as text for use in prompts.
    This builds conversation context from the new v2 optimized format.

    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant
        max_exchanges: Optional limit on number of question-answer exchanges to include (most recent)

    Returns:
        Formatted conversation string with Q&A exchanges
    """
    try:
        context = get_optimized_context(user_id, assistant_id)

        if not context:
            return ""

        formatted_lines = []

        # Add seed question and answer if available
        # Use original question in conversation history (Approach 1: original in session/context, personalized only for display)
        seed = context.get("seed_question")
        if seed:
            seed_q = seed.get("original", "") or seed.get("personalized", "")
            answer = seed.get("answer", "")
            if seed_q:
                formatted_lines.append(f"Assistant: {seed_q}")
                if answer:
                    formatted_lines.append(f"User: {answer}")

        # Add policy questions and answers (use original question for consistency)
        policies = context.get("policies", [])
        for policy in policies:
            policy_q = policy.get("original_question", "") or policy.get("personalized_question", "")

            if policy_q:
                formatted_lines.append(f"Assistant: {policy_q}")

                # Handle both personal mode (string answer) and cluster mode (dict answers)
                if "answer" in policy:
                    # Personal mode - single answer
                    formatted_lines.append(f"User: {policy['answer']}")
                elif "answers" in policy:
                    # Cluster mode - multiple answers per dependent
                    answers_dict = policy.get("answers", {})
                    if answers_dict:
                        # Format as "User: [dependent1]: answer1, [dependent2]: answer2"
                        answer_parts = [f"{dep_name}: {ans}" for dep_name, ans in answers_dict.items()]
                        formatted_lines.append(f"User: {', '.join(answer_parts)}")

        # Optionally limit to most recent exchanges
        if max_exchanges and len(formatted_lines) > max_exchanges * 2:
            formatted_lines = formatted_lines[-(max_exchanges * 2):]

        return "\n".join(formatted_lines)
    except Exception as e:
        _log_redis_error("ERROR", "get_conversation_as_text_from_optimized", str(e), {
            "user_id": user_id,
            "assistant_id": assistant_id,
            "max_exchanges": max_exchanges
        })
        return ""


def get_conversation_summary(user_id: int, assistant_id: str) -> Dict[str, Any]:
    """
    Get summary information about the conversation.

    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant

    Returns:
        Dictionary with conversation metadata
    """
    try:
        conversation = get_assistant_conversation(user_id, assistant_id)

        return {
            "exists": len(conversation) > 0,
            "message_count": len(conversation),
            "user_messages": sum(1 for msg in conversation if msg.get("role") == "user"),
            "assistant_messages": sum(1 for msg in conversation if msg.get("role") == "assistant"),
            "last_message_time": conversation[-1].get("timestamp") if conversation else None
        }
    except Exception as e:
        _log_redis_error("ERROR", "get_conversation_summary", str(e), {
            "user_id": user_id,
            "assistant_id": assistant_id
        })
        return {
            "exists": False,
            "message_count": 0,
            "user_messages": 0,
            "assistant_messages": 0,
            "last_message_time": None
        }


# =============================================================================
# NEW OPTIMIZED FORMAT FUNCTIONS (Reduced Storage, Question/Answer Pairs)
# =============================================================================

def get_optimized_context_key(user_id: int, assistant_id: str) -> str:
    """
    Generate Redis key for optimized assistant context format.

    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant

    Returns:
        Redis key string in format: assistant:context:v2:{userId}:{assistantId}
    """
    return f"assistant:context:v2:{user_id}:{assistant_id}"


def get_optimized_context(user_id: int, assistant_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve optimized conversation context from Redis.

    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant

    Returns:
        Dictionary with structure:
        {
            "seed_question": {
                "original": str,
                "personalized": str,
                "item_name": str,
                "answer": str
            },
            "policies": [
                {
                    "policy_tag": str,
                    "original_question": str,
                    "personalized_question": str,
                    "answer": str | dict  # str for personal mode, dict for cluster mode
                }
            ],
            "metadata": {
                "last_updated": str,
                "question_count": int,
                "assistantId": str
            }
        }
        Returns None if no context exists or on error.
    """
    try:
        key = get_optimized_context_key(user_id, assistant_id)
        context_json = redis_client.get(key)

        if context_json:
            context = json.loads(context_json)
            if isinstance(context, dict):
                return context
        return None
    except json.JSONDecodeError:
        _log_redis_error("ERROR", "get_optimized_context", "Failed to decode JSON", {
            "user_id": user_id,
            "assistant_id": assistant_id
        })
        return None
    except Exception as e:
        _log_redis_error("ERROR", "get_optimized_context", str(e), {
            "user_id": user_id,
            "assistant_id": assistant_id
        })
        return None


def initialize_optimized_context(user_id: int, assistant_id: str) -> bool:
    """
    Initialize a new optimized context for an assistant.

    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant

    Returns:
        True if successful, False otherwise
    """
    try:
        key = get_optimized_context_key(user_id, assistant_id)

        # Check if context already exists
        existing = get_optimized_context(user_id, assistant_id)
        if existing:
            return True

        # Create new optimized context
        context = {
            "seed_question": None,
            "policies": [],
            "metadata": {
                "last_updated": datetime.utcnow().isoformat(),
                "question_count": 0,
                "assistantId": assistant_id
            }
        }

        # Store to Redis with 12-hour expiration
        context_json = json.dumps(context)
        redis_client.set(key, context_json, ex=CONVERSATION_TTL_SECONDS)

        return True
    except Exception as e:
        _log_redis_error("ERROR", "initialize_optimized_context", str(e), {
            "user_id": user_id,
            "assistant_id": assistant_id
        })
        return False


def append_seed_question_to_context(
    user_id: int,
    assistant_id: str,
    original_question: str,
    personalized_question: str,
    item_name: str,
    user_answer: str
) -> bool:
    """
    Append seed question and answer to optimized context.
    This stores the main question (not policy questions).

    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant
        original_question: Original question template (with placeholders)
        personalized_question: Question with actual dependent names
        item_name: Short name of item (e.g., "Birth Certificate")
        user_answer: User's response to the question

    Returns:
        True if successful, False otherwise
    """
    try:
        key = get_optimized_context_key(user_id, assistant_id)

        # Get existing context or create new one
        context = get_optimized_context(user_id, assistant_id)
        if not context:
            initialize_optimized_context(user_id, assistant_id)
            context = get_optimized_context(user_id, assistant_id)

        if not context:
            return False

        # Update seed question
        context["seed_question"] = {
            "original": original_question or "",
            "personalized": personalized_question or "",
            "item_name": item_name or "",
            "answer": user_answer or ""
        }

        # Update metadata
        context["metadata"]["last_updated"] = datetime.utcnow().isoformat()
        context["metadata"]["question_count"] = 1 + len(context.get("policies", []))

        # Store back to Redis with 12-hour expiration
        context_json = json.dumps(context)
        redis_client.set(key, context_json, ex=CONVERSATION_TTL_SECONDS)
        return True
    except Exception as e:
        _log_redis_error("ERROR", "append_seed_question_to_context", str(e), {
            "user_id": user_id,
            "assistant_id": assistant_id,
            "item_name": item_name
        })
        return False


def append_policy_answer_to_context(
    user_id: int,
    assistant_id: str,
    policy_tag: str,
    original_question: str,
    personalized_question: str,
    user_answer: Any,
    dependent_name: Optional[str] = None
) -> bool:
    """
    Append policy answer to optimized context.

    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant
        policy_tag: Policy identifier (e.g., "documentLocation")
        original_question: Original question template
        personalized_question: Question with actual names
        user_answer: User's response (str for personal mode, dict for cluster mode)
        dependent_name: Name of dependent (for cluster mode)

    Returns:
        True if successful, False otherwise
    """
    try:
        key = get_optimized_context_key(user_id, assistant_id)

        # Get existing context
        context = get_optimized_context(user_id, assistant_id)
        if not context:
            initialize_optimized_context(user_id, assistant_id)
            context = get_optimized_context(user_id, assistant_id)

        if not context:
            return False

        # Find existing policy or create new one
        policies = context.get("policies", [])
        existing_policy_index = None

        for i, policy in enumerate(policies):
            if policy.get("policy_tag") == policy_tag:
                existing_policy_index = i
                break

        if existing_policy_index is not None:
            # Update existing policy
            policy_entry = policies[existing_policy_index]

            # For cluster mode, answers is a dict mapping dependent names to answers
            # Use normalized key (lowercase) to prevent duplicate entries when same dependent is stored with different casing (e.g. "Phil" vs "phil")
            if dependent_name:
                if not isinstance(policy_entry.get("answers"), dict):
                    policy_entry["answers"] = {}
                dep_key = dependent_name.strip().lower()
                policy_entry["answers"][dep_key] = user_answer
            else:
                # For personal mode, answer is a simple string
                policy_entry["answer"] = user_answer
        else:
            # Create new policy entry
            new_policy = {
                "policy_tag": policy_tag,
                "original_question": original_question or "",
                "personalized_question": personalized_question or ""
            }

            # For cluster mode, answers is a dict (key normalized to lowercase to avoid duplicates)
            if dependent_name:
                dep_key = dependent_name.strip().lower()
                new_policy["answers"] = {dep_key: user_answer}
            else:
                # For personal mode, answer is a simple string
                new_policy["answer"] = user_answer

            policies.append(new_policy)

        context["policies"] = policies

        # Update metadata
        context["metadata"]["last_updated"] = datetime.utcnow().isoformat()
        context["metadata"]["question_count"] = (1 if context.get("seed_question") else 0) + len(policies)

        # Store back to Redis with 12-hour expiration
        context_json = json.dumps(context)
        redis_client.set(key, context_json, ex=CONVERSATION_TTL_SECONDS)

        return True
    except Exception as e:
        _log_redis_error("ERROR", "append_policy_answer_to_context", str(e), {
            "user_id": user_id,
            "assistant_id": assistant_id,
            "policy_tag": policy_tag,
            "dependent_name": dependent_name
        })
        return False


def get_context_for_summary(
    user_id: int,
    assistant_id: str,
    use_item_name: bool = True
) -> Dict[str, Any]:
    """
    Get context formatted for summary generation.

    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant
        use_item_name: If True, use item_name; if False, use original question

    Returns:
        Dictionary with formatted context:
        {
            "main_answer": "Birth Certificate: yes",
            "policy_answers": ["Location: in the drawer"],
            "full_context": {...}  # Full context object
        }
    """
    try:
        context = get_optimized_context(user_id, assistant_id)
        if not context:
            return {
                "main_answer": "",
                "policy_answers": [],
                "full_context": None
            }

        # Format main answer
        main_answer = ""
        seed = context.get("seed_question")
        if seed:
            if use_item_name:
                main_answer = f"{seed.get('item_name', '')}: {seed.get('answer', '')}"
            else:
                main_answer = f"{seed.get('personalized', '')}: {seed.get('answer', '')}"

        # Format policy answers
        policy_answers = []
        for policy in context.get("policies", []):
            policy_tag = policy.get("policy_tag", "")

            # Handle both personal mode (answer as string) and cluster mode (answers as dict)
            if "answer" in policy:
                # Personal mode
                answer = policy.get("answer", "")
                if use_item_name:
                    policy_answers.append(f"{policy_tag}: {answer}")
                else:
                    policy_answers.append(f"{policy.get('personalized_question', '')}: {answer}")
            elif "answers" in policy:
                # Cluster mode
                answers_dict = policy.get("answers", {})
                for dependent_name, answer in answers_dict.items():
                    if use_item_name:
                        policy_answers.append(f"{policy_tag} ({dependent_name}): {answer}")
                    else:
                        policy_answers.append(f"{policy.get('personalized_question', '')} ({dependent_name}): {answer}")

        return {
            "main_answer": main_answer,
            "policy_answers": policy_answers,
            "full_context": context
        }
    except Exception as e:
        _log_redis_error("ERROR", "get_context_for_summary", str(e), {
            "user_id": user_id,
            "assistant_id": assistant_id
        })
        return {
            "main_answer": "",
            "policy_answers": [],
            "full_context": None
        }


def build_policy_info_from_context(
    user_id: int,
    assistant_id: str
) -> List[Dict[str, Any]]:
    """
    Build policy info array from Redis optimized context.
    This replaces the need to build policy info from session data.

    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant

    Returns:
        List of policy info dictionaries:
        [
            {
                "tag": "documentLocation",
                "question": "Where is the location?",
                "isAnswered": True,
                "policyAnswer": "in the drawer"
            }
        ]
    """
    try:
        context = get_optimized_context(user_id, assistant_id)
        if not context:
            return []

        policy_info = []
        for policy in context.get("policies", []):
            policy_tag = policy.get("policy_tag")
            policy_question = policy.get("personalized_question") or policy.get("original_question")

            if not policy_tag or not policy_question:
                continue

            # Handle both personal mode (answer as string) and cluster mode (answers as dict)
            is_answered = False
            policy_answer = None

            if "answer" in policy:
                # Personal mode
                answer = policy.get("answer")
                if answer and str(answer).strip() not in ["", "Skipped", "No"]:
                    is_answered = True
                    policy_answer = answer
            elif "answers" in policy:
                # Cluster mode - combine all dependent answers
                answers_dict = policy.get("answers", {})
                if answers_dict:
                    is_answered = True
                    # Format as "John: in drawer, Jane: in cabinet"
                    policy_answer = ", ".join([f"{name}: {ans}" for name, ans in answers_dict.items()])

            policy_info_dict = {
                "tag": policy_tag,
                "question": policy_question,
                "isAnswered": is_answered,
                "policyAnswer": policy_answer if is_answered else None
            }

            policy_info.append(policy_info_dict)

        return policy_info
    except Exception as e:
        _log_redis_error("ERROR", "build_policy_info_from_context", str(e), {
            "user_id": user_id,
            "assistant_id": assistant_id
        })
        return []


def clear_optimized_context(user_id: int, assistant_id: str) -> bool:
    """
    Clear/invalidate the optimized conversation context.

    Args:
        user_id: Unique identifier for the user
        assistant_id: Unique identifier for the assistant

    Returns:
        True if successful, False otherwise
    """
    try:
        key = get_optimized_context_key(user_id, assistant_id)
        redis_client.delete(key)
        return True
    except Exception as e:
        _log_redis_error("ERROR", "clear_optimized_context", str(e), {
            "user_id": user_id,
            "assistant_id": assistant_id
        })
        return False


# =============================================================================
# PERSONAL MODE: OPTIMIZED FORMAT FUNCTIONS (Reduced Storage, Question/Answer Pairs)
# Keyed by (user_id, chapter_id) 
# =============================================================================

def get_personal_optimized_context_key(user_id: int, chapter_id: str) -> str:
    """
    Generate Redis key for optimized personal context format.

    Returns:
        Redis key string in format: personal:context:v2:{userId}:{chapterId}
    """
    return f"personal:context:v2:{user_id}:{chapter_id}"


def get_personal_optimized_context(user_id: int, chapter_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieve optimized conversation context for personal mode from Redis.
    Uses the same value shape as assistant optimized context, but a different key namespace.
    """
    try:
        key = get_personal_optimized_context_key(user_id, chapter_id)
        context_json = redis_client.get(key)

        if context_json:
            context = json.loads(context_json)
            if isinstance(context, dict):
                return context
        return None
    except json.JSONDecodeError:
        _log_redis_error("ERROR", "get_personal_optimized_context", "Failed to decode JSON", {
            "user_id": user_id,
            "chapter_id": chapter_id
        })
        return None
    except Exception as e:
        _log_redis_error("ERROR", "get_personal_optimized_context", str(e), {
            "user_id": user_id,
            "chapter_id": chapter_id
        })
        return None


def initialize_personal_optimized_context(user_id: int, chapter_id: str) -> bool:
    """
    Initialize a new optimized context for personal mode scoped to a chapter.
    """
    try:
        key = get_personal_optimized_context_key(user_id, chapter_id)

        existing = get_personal_optimized_context(user_id, chapter_id)
        if existing:
            return True

        context = {
            "seed_question": None,
            "policies": [],
            "metadata": {
                "last_updated": datetime.utcnow().isoformat(),
                "question_count": 0,
                "chapterId": chapter_id
            }
        }

        redis_client.set(key, json.dumps(context), ex=CONVERSATION_TTL_SECONDS)
        return True
    except Exception as e:
        _log_redis_error("ERROR", "initialize_personal_optimized_context", str(e), {
            "user_id": user_id,
            "chapter_id": chapter_id
        })
        return False


def append_seed_question_to_personal_context(
    user_id: int,
    chapter_id: str,
    original_question: str,
    personalized_question: str,
    item_name: str,
    user_answer: str
) -> bool:
    """
    Append seed question and answer to optimized personal (chapter-scoped) context.
    """
    try:
        key = get_personal_optimized_context_key(user_id, chapter_id)

        context = get_personal_optimized_context(user_id, chapter_id)
        if not context:
            initialize_personal_optimized_context(user_id, chapter_id)
            context = get_personal_optimized_context(user_id, chapter_id)

        if not context:
            return False

        context["seed_question"] = {
            "original": original_question or "",
            "personalized": personalized_question or "",
            "item_name": item_name or "",
            "answer": user_answer or ""
        }

        context.setdefault("metadata", {})
        context["metadata"]["last_updated"] = datetime.utcnow().isoformat()
        context["metadata"]["question_count"] = 1 + len(context.get("policies", []))
        context["metadata"]["chapterId"] = chapter_id

        redis_client.set(key, json.dumps(context), ex=CONVERSATION_TTL_SECONDS)
        return True
    except Exception as e:
        _log_redis_error("ERROR", "append_seed_question_to_personal_context", str(e), {
            "user_id": user_id,
            "chapter_id": chapter_id,
            "item_name": item_name
        })
        return False


def append_policy_answer_to_personal_context(
    user_id: int,
    chapter_id: str,
    policy_tag: str,
    original_question: str,
    personalized_question: str,
    user_answer: Any
) -> bool:
    """
    Append policy answer to optimized personal (chapter-scoped) context.
    Mirrors append_policy_answer_to_context() personal-mode behavior.
    """
    try:
        key = get_personal_optimized_context_key(user_id, chapter_id)

        context = get_personal_optimized_context(user_id, chapter_id)
        if not context:
            initialize_personal_optimized_context(user_id, chapter_id)
            context = get_personal_optimized_context(user_id, chapter_id)

        if not context:
            return False

        policies = context.get("policies", [])
        existing_policy_index = None
        for i, policy in enumerate(policies):
            if policy.get("policy_tag") == policy_tag:
                existing_policy_index = i
                break

        if existing_policy_index is not None:
            policy_entry = policies[existing_policy_index]
            policy_entry["original_question"] = original_question or policy_entry.get("original_question", "")
            policy_entry["personalized_question"] = personalized_question or policy_entry.get("personalized_question", "")
            policy_entry["answer"] = user_answer
        else:
            policies.append({
                "policy_tag": policy_tag,
                "original_question": original_question or "",
                "personalized_question": personalized_question or "",
                "answer": user_answer
            })

        context["policies"] = policies

        context.setdefault("metadata", {})
        context["metadata"]["last_updated"] = datetime.utcnow().isoformat()
        context["metadata"]["question_count"] = (1 if context.get("seed_question") else 0) + len(policies)
        context["metadata"]["chapterId"] = chapter_id

        redis_client.set(key, json.dumps(context), ex=CONVERSATION_TTL_SECONDS)
        return True
    except Exception as e:
        _log_redis_error("ERROR", "append_policy_answer_to_personal_context", str(e), {
            "user_id": user_id,
            "chapter_id": chapter_id,
            "policy_tag": policy_tag
        })
        return False


def get_conversation_as_text_from_personal_optimized(
    user_id: int,
    chapter_id: str,
    max_exchanges: Optional[int] = None
) -> str:
    """
    Get conversation history from personal optimized Redis context formatted as text for use in prompts.
    """
    try:
        context = get_personal_optimized_context(user_id, chapter_id)
        if not context:
            return ""

        formatted_lines: List[str] = []

        seed = context.get("seed_question")
        if seed:
            seed_q = seed.get("original", "") or seed.get("personalized", "")
            answer = seed.get("answer", "")
            if seed_q:
                formatted_lines.append(f"Assistant: {seed_q}")
                if answer:
                    formatted_lines.append(f"User: {answer}")

        for policy in context.get("policies", []):
            policy_q = policy.get("original_question", "") or policy.get("personalized_question", "")
            if not policy_q:
                continue
            formatted_lines.append(f"Assistant: {policy_q}")
            if "answer" in policy:
                formatted_lines.append(f"User: {policy.get('answer', '')}")

        if max_exchanges and len(formatted_lines) > max_exchanges * 2:
            formatted_lines = formatted_lines[-(max_exchanges * 2):]

        return "\n".join(formatted_lines)
    except Exception as e:
        _log_redis_error("ERROR", "get_conversation_as_text_from_personal_optimized", str(e), {
            "user_id": user_id,
            "chapter_id": chapter_id,
            "max_exchanges": max_exchanges
        })
        return ""


def build_policy_info_from_personal_context(
    user_id: int,
    chapter_id: str
) -> List[Dict[str, Any]]:
    """
    Build policy info array from Redis personal optimized context.
    """
    try:
        context = get_personal_optimized_context(user_id, chapter_id)
        if not context:
            return []

        policy_info: List[Dict[str, Any]] = []
        for policy in context.get("policies", []):
            policy_tag = policy.get("policy_tag")
            policy_question = policy.get("personalized_question") or policy.get("original_question")
            if not policy_tag or not policy_question:
                continue

            is_answered = False
            policy_answer = None
            answer = policy.get("answer")
            if answer is not None and str(answer).strip() not in ["", "Skipped", "No"]:
                is_answered = True
                policy_answer = answer

            policy_info.append({
                "tag": policy_tag,
                "question": policy_question,
                "isAnswered": is_answered,
                "policyAnswer": policy_answer if is_answered else None
            })

        return policy_info
    except Exception as e:
        _log_redis_error("ERROR", "build_policy_info_from_personal_context", str(e), {
            "user_id": user_id,
            "chapter_id": chapter_id
        })
        return []


def clear_personal_optimized_context(user_id: int, chapter_id: str) -> bool:
    """
    Clear/invalidate the optimized personal (chapter-scoped) conversation context.
    """
    try:
        key = get_personal_optimized_context_key(user_id, chapter_id)
        redis_client.delete(key)
        return True
    except Exception as e:
        _log_redis_error("ERROR", "clear_personal_optimized_context", str(e), {
            "user_id": user_id,
            "chapter_id": chapter_id
        })
        return False
