import os
import json 
import getpass
import requests
from dotenv import load_dotenv
from typing import List, Dict, Any
from src.utils.prompt_functions import *

load_dotenv()

# Getting credentials BOT one doesnot have anytjhing to remove
def _set_if_undefined(var: str):
    if not os.environ.get(var):
        os.environ[var] = getpass.getpass(f"Please provide your {var}")
_set_if_undefined("OPENAI_API_KEY")


global middle_tire_data_url

middle_tire_data_url = os.getenv("middle_tire_data_url")
BOOLEAN_EXTRACTION_ITEM_IDS = os.getenv("BOOLEAN_EXTRACTION_ITEM_IDS", "")
BOOLEAN_EXTRACTION_ITEM_IDS = [int(x.strip()) for x in BOOLEAN_EXTRACTION_ITEM_IDS.split(",") if x.strip()]


# Function to load the JSON data from the file
def safe_json_load(data):
        try:
            return json.loads(data) if data else {}
        except (TypeError, json.JSONDecodeError):
            return {}


def fuzzy_match_name(partial_name: str, full_names: list) -> str:
    """
    Matches a partial name (e.g., 'jamie') to a full name (e.g., 'jamie paul').

    Args:
        partial_name (str): The partial name to match (already lowercased)
        full_names (list): List of full names (already lowercased)

    Returns:
        str: The matched full name, or the original partial_name if no match found
    """
    partial_name = partial_name.strip().lower()

    # First try exact match
    if partial_name in full_names:
        return partial_name

    # Try to find if partial_name is the first name of any full name
    for full_name in full_names:
        full_name_parts = full_name.split()
        # Check if partial name matches the first name
        if full_name_parts and partial_name == full_name_parts[0]:
            return full_name
        # Check if partial name is contained within the full name (for single word matches)
        if len(full_name_parts) == 1 and partial_name in full_name:
            return full_name

    # If no match found, return original
    return partial_name


def normalize_parsed_names(parsed_response: dict, expected_names: list) -> dict:
    """
    Normalizes the names in a parsed response dictionary to match expected full names.

    Args:
        parsed_response (dict): The response dictionary with potentially partial names as keys
        expected_names (list): List of expected full names (lowercased)

    Returns:
        dict: Dictionary with normalized names as keys
    """
    normalized = {}
    reason = parsed_response.get("reason", "")

    for key, value in parsed_response.items():
        if key == "reason":
            continue

        # Try to match the key to a full name
        matched_name = fuzzy_match_name(key, expected_names)
        normalized[matched_name] = value

    if reason:
        normalized["reason"] = reason

    return normalized


# previously get_unfilled questions
def get_unfilled_gather_assist_question(user_story_id: str, bearer_token: str, chapterId: str) -> List[Dict]:
    """
    Retrieves unfilled gather assist questions based on the user story ID and bearer token.

    Args:
        user_story_id (str): The ID of the user story to query.
        bearer_token (str): The bearer token for authorization.
        
    Returns:
        List[Dict]: A list of dictionaries with unfilled pet question details. 
                    Returns an empty list if all data is filled.
                    
    Raises:
        ValueError: If 'user_story_id' or 'bearer_token' is missing.
        requests.RequestException: If the HTTP request fails.
        KeyError: If expected keys are missing in the response.
    """
    
    # Validate required parameters
    if not user_story_id:
        raise ValueError("Missing 'user_story_id'.")
    if not chapterId:
        raise ValueError("Missing 'chapterId'.")
    if not bearer_token:
        raise ValueError("Missing 'bearer_token'.")
    
    unfilled_questions = []
    
    # Construct the API URL
    url = f"{middle_tire_data_url}/api/organizer/get-items-ai"
    params = {"userStoryId": user_story_id, "chapterId": chapterId }
    
    # Set up headers for the request
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"  
    }
    
    try:
        # Make the GET request to the API
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()  # Raise an error for bad status codes
        data = response.json()
        body = data.get("body", {})
        
        # Extract total items from the response
        total_items = data.get("body", {}).get("totalItems", 0)
        
        if total_items > 0:
            items_raw = data["body"].get("items", [])
            # Ensure items is a list
            if isinstance(items_raw, dict):
                items = [items_raw]
            elif isinstance(items_raw, list):
                items = items_raw
            else:
                items = []
            
            # Process each item and collect relevant details
            unfilled_questions = []
            for item in items:
                question = {
                    "docId": item.get("docId"),
                    "chapterId": item.get("chapterId"),
                    "itemId": item.get("itemId"),
                    "userStoryId": item.get("userStoryId"),
                    "itemName": item.get("itemName"),
                    "context": item.get("sample_conversation"),
                    "policy": item.get("unFilledPolicies"),
                    "backendQuestions": item.get("questions"),
                    "storyId": item.get("storyId"),
                    "storyName": item.get("storyName"),
                    "storyType": item.get("storyType"),
                    "story": item.get("story"),
                    "chapterName":item.get("chapterName"),
                    "sequenceOrder": item.get("sequenceOrder"),
                    "nextChapter": item.get("nextChapter"), 
                    "nextChapterId": item.get("nextChapterId"),
                    "isLastChapter": item.get("isLastChapter"),
                    "policiesQuestion": item.get("policiesQuestion", []),
                    # Caregiver / first-person name (if provided by backend)
                    "userName": item.get("userName")
                }
                unfilled_questions.append(question)
            return unfilled_questions
        else:
            item_fallback = body.get("items", {})
            fallback = {
                "docId": body.get("docId"),
                "chapterId": chapterId,
                "userStoryId": user_story_id,
                "itemId": None,
                "itemName": None,
                "context": None,
                "policy": [],
                "backendQuestions": None,
                "storyId": None,
                "storyName": None,
                "storyType": None,
                "chapterName": None,
                "sequenceOrder": item_fallback.get("sequenceOrder"),
                "nextChapter": item_fallback.get("nextChapter"),
                "nextChapterId": item_fallback.get("nextChapterId"),
                "isLastChapter": item_fallback.get("isLastChapter"),
                "empty": True,  # <-- custom flag to help downstream logic
                "policiesQuestion": []
            }
            return [fallback]
    
    except requests.RequestException as e:
        # Handle HTTP request-related errors
        raise requests.RequestException(f"HTTP request failed: {e}")
    except KeyError as e:
        # Handle missing keys in the response
        raise KeyError(f"Missing expected key in response: {e}")
              

# Function to update the data to the database
def update_gather_assist_data_to_database(newDescription: str, user_story_id: str, bearer_token: str, key_pair_value: None, chapterId:str, unFilledPolicies: List[Dict] = None) -> str:
    """ 
    Updates data in the database based on user input.

    Args:
        newDescription (str): Data provided along with the new description.
        user_story_id (str): The ID of the user story.
        bearer_token (str): The bearer token for authorization.
        key_pair_value: Additional value to be stored (optional).
        chapterId (str): Chapter ID.
        unFilledPolicies (List[Dict]): Optional list of policy information with tag, question, and isAnswered.

    Returns:
        str: A message indicating whether the update was successful or not.
    """

    # Ensure required parameters are present
    if not user_story_id:
        raise ValueError("Missing 'user_story_id'.")
    if not chapterId:
        raise ValueError("Missing 'chapterId'.")
    if not bearer_token:
        raise ValueError("Missing 'bearer_token'.")
    
    # Normalize the user response for case insensitivity
    newDescription = newDescription.strip()

    # Fetch item details from the database
    url = f"{middle_tire_data_url}/api/organizer/get-items-ai?userStoryId={user_story_id}&chapterId={chapterId}"
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()


        item = data.get("body", {}).get("items", {})
        if not item:
            return "No items found for the given userStoryId."

        item_id = item.get("itemId")
        item_name = item.get("itemName")

        # Apply boolean_extraction validation for specific item IDs
        # if item_id in [69, 70, 71]:
        if item_id in BOOLEAN_EXTRACTION_ITEM_IDS:    
            extracted_boolean = boolean_extraction(item_name, newDescription)  # Returns True/False
            newDescription = "yes" if extracted_boolean else "no"

        # Build policy info from item data if not provided or empty
        if unFilledPolicies is None or (isinstance(unFilledPolicies, list) and len(unFilledPolicies) == 0):
            # Get policiesQuestion from item data
            policies_question = item.get("policiesQuestion", [])
            
            if policies_question and len(policies_question) > 0:
                # Build basic policy info structure (all marked as not answered since we don't have policy_specific_data here)
                unFilledPolicies = [
                    {
                        "tag": policy_obj.get("policy"),
                        "question": policy_obj.get("question"),
                        "isAnswered": False,
                        "policyAnswer": None
                    }
                    for policy_obj in policies_question
                    if policy_obj.get("policy") and policy_obj.get("question")
                ]
            else:
                unFilledPolicies = []

        # Prepare the update payload
        update_data = {
            "docId": item.get("docId"),
            "chapterId": item.get("chapterId"),
            "itemId": item_id,  
            "userStoryId": item.get("userStoryId"),
            "itemName": item_name,  
            "newDescription": newDescription,  # Updated with case-insensitive validation
            "seedExtracted": key_pair_value,
            "unFilledPolicies": unFilledPolicies
        }
        
        # Send update request
        update_url = f"{middle_tire_data_url}/api/organizer/update-item-ai"
        update_response = requests.post(update_url, headers=headers, json=update_data)
        

        if update_response.status_code == 200:
            update_json = update_response.json()
            return update_json  
 
        else:
            return f"Update failed with status code: {update_response.status_code}. Response: {update_response.text}"
    
    except requests.RequestException as e:
        return f"Request failed: {e}"
    except KeyError as e:
        return f"Missing expected key in response: {e}"
    except ValueError as e:
        return f"Error: {e}"
    

# Function to get unfilled cluster questions based on the assistantId
def get_unfilled_cluster_assistant_question(assistantId: int,  bearer_token: str, current_story_doc_id: str = None, next_story_doc_id: str = None) -> List[Dict]:
    """
    Retrieves unfilled gather assist questions based on the user story ID and bearer token.

    Args:
        assistantId (str): The ID of the user story to query.
        bearer_token (str): The bearer token for authorization.
        
    Returns:
        List[Dict]: A list of dictionaries with unfilled gather assist question details. 
                    Returns an empty list if all data is filled.
                    
    Raises:
        ValueError: If 'assistantId' or 'bearer_token' is missing.
        requests.RequestException: If the HTTP request fails.
        KeyError: If expected keys are missing in the response.
    """
    
    # Validate required parameters
    if not assistantId:
        raise ValueError("Missing 'assistantId'.")
    if not bearer_token:
        raise ValueError("Missing 'bearer_token'.")
    
    # Construct the API URL
    # url = f"{middle_tire_data_url}/api/assistant/get-clusterd-item-data"
    url = f"{middle_tire_data_url}/api/assistant/get-assistant-item-question2"
 
    params = {"assistantId": assistantId}
    
    # Set up headers for the request
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"
    }
    payload = {
        "currentStoryDocId": current_story_doc_id,
        "nextStoryDocId": next_story_doc_id,
    }

    try:
        # Make the POST request to the API
        response = requests.post(url, headers=headers, params=params, json = payload)
        
        response.raise_for_status()  # Raise an error for bad status codes
        data = response.json()
        
        body = data.get("body", {})
        
        # Extract total items from the response
        total_items = body.get("totalAvailableItems", 0)
        
        if total_items > 0:
            items_raw = body.get("items", [])
            
            # Ensure items is a list
            if isinstance(items_raw, dict):
                items = [items_raw]
            elif isinstance(items_raw, list):
                items = items_raw
            else:
                items = []
            
            # Process each item and collect relevant details
            questions = []
            for idx, item in enumerate(items):
                question = {
                    "assistantId": item.get("assistantId"),
                    "itemId": item.get("itemId"),
                    "itemName": item.get("itemName"),
                    "backendQuestions": item.get("question"),
                    "context": item.get("sampleConversation"),
                    "policiesQuestion": item.get("policiesQuestion", []),
                    "policy": item.get("unFilledPolicies"),
                    "userStoryDocId": item.get("userStoryDocId"),
                    "chapterDocId": item.get("chapterDocId"),
                    "userStoryId": item.get("userStoryId"),
                    "functionFlow": item.get("functionFlow"),
                    "storyName": item.get("storyName"),
                    "chapterId": item.get("chapterId"),
                    "currentStoryDocId": item.get("currentStoryDocId"),
                    "nextStoryDocId": item.get("nextStoryDocId"),
                    "dynamicFunctionData": item.get("dynamicFunctionData"),
                    "chapterName": item.get("chapterName"),
                    "itemName": item.get("itemName"),
                    "isLoop": item.get("isLoop"),
                    "story": item.get("story"),
                    # Caregiver / first-person name (if provided by backend)
                    "userName": item.get("userName")
                }
                questions.append(question)
            return {
                "completed": False,
                "questions": questions
            }
        else:
            return {
                "completed": True,
                "questions": []
            }
    
    except requests.RequestException as e:
        # Handle HTTP request-related errors
        raise requests.RequestException(f"HTTP request failed: {e}")
    except KeyError as e:
        # Handle missing keys in the response
        raise KeyError(f"Missing expected key in response: {e}")
    except Exception as e:
        # Catch any other unexpected errors
        raise
    
    
# Function to update data in the database cluster based on user input
def update_cluster_assistant_data_to_database(newDescription: str, assistantId: str, bearer_token: str, itemId:str, existing_item: bool = False, uniqueItemId: str = None, isLoop: bool = None, user_story_doc_id: str = None, chapter_doc_id: str = None, unFilledPolicies: List[Dict] = None) -> str:
    """ 
    Updates data in the database based on user input.

    Args:
        newDescription (str): Data provided along with the new description.
        assistantId (str): The ID of the assistant.
        bearer_token (str): The bearer token for authorization.
        itemId (str): The item ID.
        existing_item (bool): Whether this is an existing item.
        uniqueItemId (str): Unique item ID for cloned items.
        isLoop (bool): Whether this is a loop item.
        user_story_doc_id (str): User story document ID.
        chapter_doc_id (str): Chapter document ID.
        unFilledPolicies (List[Dict]): Optional list of policy information with tag, question, and isAnswered.

    Returns:
        str: A message indicating whether the update was successful or not.
    """
    # Ensure required parameters are present
    if not assistantId:
        raise ValueError("Missing 'assistantId'.")
    if not itemId:
        raise ValueError("Missing 'itemId'.")
    if not bearer_token:
        raise ValueError("Missing 'bearer_token'.")
    
    # Normalize the user response for case insensitivity
    newDescription = newDescription.strip()
    if uniqueItemId and newDescription:   # This for when we clone the item then we have to remove the summary of the last policy question "do you want to add more" so we remove the item from the newDescription
        newDescription = newDescription.split("\n")

        if len(newDescription)!= 0 and not existing_item:
            newDescription.pop(0)
        elif len(newDescription) != 0 and existing_item:
            newDescription.pop(0)
            newDescription.pop(0)
            
        newDescription = "\n".join(newDescription)
    
    # Fetch item details from the database
    # url = f"{middle_tire_data_url}/api/assistant/get-clusterd-item-data?assistantId={assistantId}&itemId={itemId}"
    url = f"{middle_tire_data_url}/api/assistant/get-assistant-item-question2?assistantId={assistantId}&itemId={itemId}"
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(url, headers=headers)
        response.raise_for_status()
        data = response.json()


        item = data.get("body", {}).get("items", {})
        if not item:
            return "No items found for the given assistantId."
        
        userStoryDocId = item.get("userStoryDocId")
        chapterDocId = item.get("chapterDocId")
        
        # Build policy info from item data if not provided or empty
        if unFilledPolicies is None or (isinstance(unFilledPolicies, list) and len(unFilledPolicies) == 0):
            # Get policiesQuestion from item data
            policies_question = item.get("policiesQuestion", [])
            
            if policies_question and len(policies_question) > 0:
                # Build basic policy info structure (all marked as not answered since we don't have collected_pairs_dependent here)
                unFilledPolicies = [
                    {
                        "tag": policy_obj.get("policy"),
                        "question": policy_obj.get("question"),
                        "isAnswered": False,
                        "policyAnswer": None
                    }
                    for policy_obj in policies_question
                    if policy_obj.get("policy") and policy_obj.get("question")
                ]
            else:
                unFilledPolicies = []
        
        # Prepare the update payload
        update_data = {
            "storyDocId": userStoryDocId if user_story_doc_id is None else user_story_doc_id,
            "chapterDocId": chapterDocId if chapter_doc_id is None else chapter_doc_id,
            "itemId": itemId,
            "uniqueItemId": uniqueItemId,    
            "itemAnswered": newDescription, 
            "assistantId": assistantId,
            "isLoop": isLoop,
            "unFilledPolicies": unFilledPolicies
        }

        # Send update request
        update_url = f"{middle_tire_data_url}/api/assistant/update-assistant-item"
        update_response = requests.put(update_url, headers=headers, json=update_data)
        

        if update_response.status_code == 200:
            update_json = update_response.json()
            return update_json  
 
        else:
            return f"Update failed with status code: {update_response.status_code}. Response: {update_response.text}"
    
    except requests.RequestException as e:
        return f"Request failed: {e}"
    except KeyError as e:
        return f"Missing expected key in response: {e}"
    except ValueError as e:
        return f"Error: {e}"        
    
def update_bulk_cluster_assistant_data_to_database(
    user_response,
    selected_items_details: list,
    assistantId: str,
    bearer_token: str,
    itemId: str,
    unFilledPolicies: List[Dict] = None
) -> dict:
    """Updates data for multiple items with a bulk API call."""

    if not all([user_response, selected_items_details, assistantId, bearer_token]):
        raise ValueError("Missing required parameters for bulk update.")

    # Normalize user_response to a dictionary
    answers_map = {}

    if isinstance(user_response, str):
        try:
            user_response = json.loads(user_response)
            if not isinstance(user_response, dict):
                raise ValueError
            answers_map = {k.lower(): v for k, v in user_response.items()}
        except (json.JSONDecodeError, ValueError):
            # Fallback to parsing key=value pairs from string
            for item in user_response.split(','):
                try:
                    key, val = item.split('=')
                    answers_map[key.strip().lower()] = val.strip()
                except ValueError:
                    raise TypeError (f"[API_HELPER] WARNING: Incorrect format in user_response item: '{item}'")
    elif isinstance(user_response, dict):
        answers_map = {k.lower(): v for k, v in user_response.items()}
    else:
        raise TypeError("user_response must be either str or dict.")

    # Normalize partial names in answers_map to match full names
    full_names = [detail.get("storyName", "").lower() for detail in selected_items_details]
    answers_map = normalize_parsed_names(answers_map, full_names)

    # Ensure unFilledPolicies is a list (default to empty list if None)
    if unFilledPolicies is None:
        unFilledPolicies = []

    # Construct payload
    payload = []
    for detail in selected_items_details:
        story_name = detail.get("storyName", "").lower()
        item_answered = answers_map.get(story_name, "No Response Provided")

        payload_item = {
            "storyDocId": detail.get("storyDocId"),
            "chapterDocId": detail.get("chapterDocId"),
            "itemId": itemId,
            "itemAnswered": item_answered,
            "assistantId": int(assistantId) if str(assistantId).isdigit() else assistantId,
            "unFilledPolicies": unFilledPolicies
        }
        payload.append(payload_item)

    update_url = f"{middle_tire_data_url}/api/assistant/update-assistant-item"
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.put(update_url, headers=headers, json=payload)

        if response.status_code == 200:
            return response.json()
        else:
            return {
                "status": "failure",
                "status_code": response.status_code,
                "response": response.text
            }
    except requests.RequestException as e:
        raise e


def clone_new_item_through_assistant(
    json_paylod: Dict[str, Any],
    bearer_token: str
):
    """
    Adds a new item through the assistant API.

    Args:
        doc_id (str): The document ID.
        item_name (str): The name of the item.
        chapter_doc_id (str): The chapter document ID.
        type_ (str): The type of the item (e.g., text).
        item_id (str): The unique item ID.
        item_type (str): The type of the item (e.g., paragraph).
        function_id (int): The function ID to trigger.
        bearer_token (str): The bearer token for authorization.

    Returns:
        Dict[str, Any]: The API response as a dictionary.

    Raises:
        ValueError: If required parameters are missing.
        requests.RequestException: If the HTTP request fails.
    """

    # Construct URL
    url = f"{middle_tire_data_url}/api/assistant/add-new-item-through-assistant"

    # Set up headers
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"
    }

    payload = json_paylod

    try:
        # Make the POST request
        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()  # raise for 4xx/5xx

        return response.json()

    except requests.HTTPError as e:
        # Try to get the error message from the response body
        error_detail = ""
        try:
            error_detail = response.json() if response.text else response.text
        except:
            error_detail = response.text if hasattr(response, 'text') else str(e)

        raise requests.RequestException(f"HTTP request failed: {e}. Backend response: {error_detail}")
    except requests.RequestException as e:
        raise requests.RequestException(f"HTTP request failed: {e}")


# =============================================================================
# REDIS CONVERSATION HISTORY HELPERS
# =============================================================================

def save_seed_question_to_redis(
    user_id: int,
    assistant_id: str,
    question_obj: Dict,
    personalized_question: str,
    user_answer: str
) -> bool:
    """
    Save seed question and answer to Redis optimized context.

    Args:
        user_id: User's unique identifier
        assistant_id: Assistant's unique identifier
        question_obj: The question object containing originalBackendQuestions, backendQuestions, itemName
        personalized_question: The personalized question text shown to user
        user_answer: User's answer to the seed question

    Returns:
        True if saved successfully, False otherwise
    """
    if not user_id or not assistant_id:
        return False

    try:
        from src.services.assistant_context_service import append_seed_question_to_context

        original_question = ""
        item_name = ""
        if question_obj:
            original_question = question_obj.get("originalBackendQuestions", question_obj.get("backendQuestions", ""))
            item_name = question_obj.get("itemName", "")

        append_seed_question_to_context(
            user_id=user_id,
            assistant_id=assistant_id,
            original_question=original_question,
            personalized_question=personalized_question or "",
            item_name=item_name,
            user_answer=user_answer or ""
        )
        return True
    except Exception as e:
        # Log but don't fail - conversation history is non-critical
        print(json.dumps({
            "level": "WARNING",
            "operation": "save_seed_question_to_redis",
            "error": str(e),
            "user_id": user_id,
            "assistant_id": assistant_id
        }))
        return False


def save_policy_answer_to_redis(
    user_id: int,
    assistant_id: str,
    policy_qs: List[Dict],
    policy_question: str,
    original_question: str,
    user_answer: str,
    dependent_name: str = None
) -> bool:
    """
    Save policy answer to Redis optimized context.

    Args:
        user_id: User's unique identifier
        assistant_id: Assistant's unique identifier
        policy_qs: List of policy question objects to find policy_tag
        policy_question: The policy question text (personalized)
        original_question: The original template question
        user_answer: User's answer
        dependent_name: Name of the dependent (for cluster mode)

    Returns:
        True if saved successfully, False otherwise
    """
    if not user_id or not assistant_id:
        return False

    try:
        from src.services.assistant_context_service import append_policy_answer_to_context

        # Find policy_tag from policy_qs
        policy_tag = ""
        if policy_qs:
            for p in policy_qs:
                if p.get("question", "").strip().lower() == policy_question.strip().lower():
                    policy_tag = p.get("policy", "")
                    break

        append_policy_answer_to_context(
            user_id=user_id,
            assistant_id=assistant_id,
            policy_tag=policy_tag,
            original_question=original_question or "",
            personalized_question=policy_question or "",
            user_answer=user_answer or "",
            dependent_name=dependent_name
        )
        return True
    except Exception as e:
        # Log but don't fail - conversation history is non-critical
        print(json.dumps({
            "level": "WARNING",
            "operation": "save_policy_answer_to_redis",
            "error": str(e),
            "user_id": user_id,
            "assistant_id": assistant_id,
            "policy_tag": policy_tag if 'policy_tag' in dir() else ""
        }))
        return False