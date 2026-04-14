from typing import Dict
from datetime import datetime, timedelta
from firebase_admin import  firestore
from src.config.google_db import *


db = get_firestore_client()

# Get session data from Firestore
def get_gather_assist_session(uuid: str, userStoryId: int, user_unique_id: int, user_response: str, chapterId) -> Dict:
    """
    Fetches a session document from Firestore based on UUID.
    If the session does not exist, a new one is created with default values.
    """
    # Initialize the root chat_session document first
    chat_session_ref = db.collection("ai").document("chat_session")
    chat_session_ref.set({"exists": True}, merge=True)

    # Now create/access the subcollection
    session_ref = chat_session_ref.collection("uuid").document(uuid)
    session_ref.set({"exists": True}, merge=True)
    
    chaapter_id_ref = session_ref.collection("chapter").document(chapterId)
    doc = chaapter_id_ref.get()

    if doc.exists:
        return doc.to_dict()
    else:
        # Create a new session with default values
        init_data = {
            "uuid": uuid,
            "userStoryId": userStoryId,
            "user_unique_id": user_unique_id,
            "count": 0,
            "invalid_count": 0,
            "last_question": None,
            "user_response": user_response,
            "state": "awaiting_question",
            "conversation_history": " ",
            "created_at": datetime.utcnow().isoformat(),
            "answer_log": " ",
            "policy_log": {},
            "policy_done": 0,
            "chapterId": chapterId,
            "pending_updates": [],
            "main_question_response": "",
            "questions_obj": []  # Initialize empty questions_obj
        }
        chaapter_id_ref.set(init_data)
        return init_data


# Update session data in Firestore
def update_gather_assist_session(uuid: str, chapterId, data: Dict) -> None:
    """
    Partially updates a session's fields in Firestore using the incoming 'data' dictionary.
    """
    session_ref = (
        db.collection("ai")
        .document("chat_session")
        .collection("uuid")
        .document(uuid)
        .collection("chapter")
        .document(chapterId)
    )
    session_ref.update(data)


# Save conversation data to Firestore
def save_gather_assist_conversation(user_unique_id,topic,storyName,prev_question,user_response,uuid,userStoryId,subCategory,chapterId, chapterName):
    try:
        date_str = datetime.today().strftime('%Y-%m-%d')
        
        user_ref = db.collection('ai_conversation').document(str(user_unique_id))
        user_ref.set({"exists": True}, merge=True)
        
        date_ref = user_ref.collection('conversations').document(date_str)
        date_ref.set({}, merge=True)
        
        topic_ref = date_ref.collection(topic).document(userStoryId)
        topic_ref.set({}, merge=True)

        chapter_ref = topic_ref.collection('chapters').document(chapterId)
        chapter_ref.set({}, merge=True)
        
        user_story_ref = chapter_ref.collection('conversation-data')
        existing_conversations = user_story_ref.stream()
        
        uuid_exists = False
        for doc in existing_conversations:
            if doc.id == uuid:
                uuid_exists = True
                messages = doc.to_dict().get("messages", [])
                break
        
        metadata = {
            'conversationName': topic,
            'storyName': storyName,
            'subCategory': subCategory,
            'userStoryId': userStoryId,
            'chapterId': chapterId,
            'chapterName': chapterName,
            'uuid': uuid,
            'lastUpdateTime': firestore.SERVER_TIMESTAMP,
        }
        topic_ref.set(metadata, merge=True)

        # Assign timestamps with a time gap
        ai_timestamp = datetime.utcnow()
        human_timestamp = ai_timestamp + timedelta(milliseconds=20)
        
        new_message = [
            {"message": prev_question, "sender": "AI", "timestamp": ai_timestamp, "uuid": uuid},
            {"message": user_response, "sender": "human", "timestamp": human_timestamp, "uuid": uuid},
        ]
        
        if uuid_exists:
            messages.extend(new_message)
            user_story_ref.document(uuid).update({"messages": messages})
        else:
            user_story_ref.document(uuid).set({"messages": new_message})
        
        return True, "Data saved successfully"
    except Exception as e:
        return False, f"Error saving data: {str(e)}"
    

# Save user recent logs to Firestore
def save_gather_assist_recent_logs(user_id, story_data, ai_message, user_message, rephrase_text=None):
    """
    Saves AI and user responses to Firestore under ai_recent_chat, grouped by itemId.
    
    Parameters:
    - user_id (str): The ID of the user.
    - story_data (dict): Dictionary containing storyId, itemId, docId, chapterId, storyName, etc.
    - ai_message (str): The AI-generated question.
    - user_message (str): The user's response.
    - rephrase_text (str, optional): Rephrased user response (if applicable).
    - full_response (str, optional): Full context of the user response (optional if you want to capture full response).
    """
    user_story_id = str(story_data["userStoryId"])
    chapter_id = str(story_data["chapterId"])
    item_id = str(story_data["itemId"])

    timestamp = firestore.SERVER_TIMESTAMP
    messagestamp = datetime.utcnow()

    # Reference to user > story > chapter > item
    user_ref = db.collection("ai_recent_chat").document(str(user_id))
    user_story_ref = user_ref.collection(user_story_id).document(chapter_id)
    item_ref = user_story_ref.collection('items').document(item_id)

    # Consistent metadata
    metadata = {
        "itemId": story_data["itemId"],
        "itemName": story_data.get("itemName"),
        "storyId": story_data.get("storyId"),
        "storyName": story_data.get("storyName"),
        "storyType": story_data.get("storyType"),
        "chapterId": story_data.get("chapterId"),
        "chapterName": story_data.get("chapterName"),
        "timestamp": timestamp
    }

    # Ensure hierarchy exists with merge
    user_ref.set({"exists": True}, merge=True)
    user_story_ref.set({"exists": True}, merge=True)
    user_story_ref.set(metadata, merge=True)
    item_ref.set(metadata, merge=True)

    # Message entry
    message_entry = {
        "ai": ai_message,
        "human": user_message,
        "rephrase_sentence": rephrase_text if rephrase_text else user_message,
        "timestamp": messagestamp
    }
    # Append message
    item_ref.update({
        "messages": firestore.ArrayUnion([message_entry]),
        "timestamp": timestamp
    })


# Save cluster conversation data to Firestore
def save_cluster_conversation(user_unique_id, prev_question, user_response,  assistantId, selected_items_details=None, displayType=None):
    try:
        date_str = datetime.today().strftime('%Y-%m-%d')

        user_ref = db.collection('ai_cluster').document(str(user_unique_id))
        user_ref.set({"exists": True}, merge=True)

        date_ref = user_ref.collection('conversations').document(date_str)
        date_ref.set({}, merge=True)

        user_story_ref = date_ref.collection('conversation-data')

        doc_id = str(assistantId)
        doc_ref = user_story_ref.document(doc_id)

        doc_snapshot = doc_ref.get()
        ai_timestamp = datetime.utcnow()
        human_timestamp = ai_timestamp + timedelta(milliseconds=20)

        new_message = [
            {
                "message": prev_question,
                "sender": "AI",
                "timestamp": ai_timestamp,
                "assistantId": assistantId,
                "selected_items_details": selected_items_details if selected_items_details else None,
                "displayType": displayType if displayType else None
            },
            {
                "message": user_response,
                "sender": "human",
                "timestamp": human_timestamp,
                "assistantId": assistantId,
                "selected_items_details": selected_items_details if selected_items_details else None,
                "displayType": displayType if displayType else None
            }
        ]

        if doc_snapshot.exists:
            existing_data = doc_snapshot.to_dict()
            messages = existing_data.get("messages", [])
            messages.extend(new_message)
            doc_ref.update({"messages": messages})
        else:
            doc_ref.set({"messages": new_message})

        return True, "Data saved successfully"

    except Exception as e:
        return False, f"Error saving data: {str(e)}"   
    

# Save user cluster logs to Firestore
def save_cluster_logs(user_id, story_data, ai_message, user_message, rephrase_text=None, selected_items_details=None):
    """
    Saves AI and user responses to Firestore under ai_cluster_log.
    If selected_items_details is provided, it creates a separate log for each item in the list.
    Otherwise, it logs against the primary item_id.
    
    Parameters:
    - user_id (str): The ID of the user.
    - story_data (dict): Dictionary containing parent item metadata.
    - ai_message (str): The AI-generated question.
    - user_message (str): The user's response.
    - rephrase_text (str, optional): Rephrased user response.
    - selected_items_details (list, optional): List of dependent items to log against.
    """

    assistantId = str(story_data["assistantId"])
    # This is the ID of the main cluster question/item
    main_item_id = str(story_data["itemId"]) 
    # print("main_item_id", main_item_id)

    timestamp = firestore.SERVER_TIMESTAMP
    messagestamp = datetime.utcnow()

    # Base reference to the assistant
    user_ref = db.collection("ai_cluster_log").document(str(user_id))
    user_story_ref = user_ref.collection("assistantId").document(assistantId)
    # print("assistant_id", assistantId)

    # Base metadata for the parent item
    parent_metadata = {
        "assistantId": assistantId,
        "mainItemId": main_item_id,
        "userStoryDocId": story_data.get("userStoryDocId"),
        "chapterDocId": story_data.get("chapterDocId"),
        "timestamp": timestamp
    }
    # print("parent_metadata", parent_metadata)

    # Ensure hierarchy exists
    user_ref.set({"exists": True}, merge=True)
    user_story_ref.set(parent_metadata, merge=True)

    # The actual message entry is the same for all logs in this turn
    message_entry = {
        "ai": ai_message,
        "human": user_message,
        "rephrase_sentence": rephrase_text if rephrase_text else user_message,
        "timestamp": messagestamp
    }
    # print("message_entry in policy", message_entry)

    # Reference to the main item's collection
    main_item_ref = user_story_ref.collection("items").document(main_item_id)
    main_item_ref.set({"exists": True, "timestamp": timestamp}, merge=True) # Ensure the item document exists
    # print("main_item_ref", main_item_ref)

    # If we have a list of dependents, loop and create a log for each
    if selected_items_details:
        for dependent_detail in selected_items_details:
            dependent_story_doc_id = str(dependent_detail.get("storyDocId"))
            dependent_chapterDocId = str(dependent_detail.get("chapterDocId"))
            if not dependent_story_doc_id:
                continue

            # Create a specific log document for this dependent
            dependent_log_ref = main_item_ref.collection("storyDocId").document(dependent_story_doc_id)
            
            dependent_metadata = {
                "storyDocId": dependent_story_doc_id,
                "storyName": dependent_detail.get("storyName"),
                "chapterDocId": dependent_chapterDocId,
                "timestamp": timestamp
            }
            dependent_log_ref.set(dependent_metadata, merge=True)

            # Append the message to this specific dependent's log
            dependent_log_ref.update({
                "messages": firestore.ArrayUnion([message_entry]),
                "timestamp": timestamp
            })
    else:
        dependent_story_doc_id = str(story_data.get("userStoryDocId"))
        dependent_chapterDocId = str(story_data.get("chapterDocId"))

        # print("user story doc id", story_data.get("userStoryDocId"))
        # print("chapter doc id", story_data.get("chapterDocId"))

        # Create a specific log document for this dependent
        dependent_log_ref = main_item_ref.collection("storyDocId").document(dependent_story_doc_id)

        dependent_metadata = {
            "storyDocId": dependent_story_doc_id,
            "storyName": None,
            "chapterDocId": dependent_chapterDocId,
            "timestamp": timestamp
        }
    
        # print("dependent metadata", dependent_metadata)

        dependent_log_ref.set({
            "storyDocId": dependent_story_doc_id,
            "storyName": None,
            "chapterDocId": dependent_chapterDocId,
            "timestamp": timestamp,
            "messages": firestore.ArrayUnion([message_entry])
        }, merge=True)


# Fetch cluster session data from Firestore
def get_cluster_session(uuid: str, user_unique_id: int, user_response: str, assistantId) -> Dict:
    """
    Fetches a session document from Firestore based on UUID.
    If the session does not exist, a new one is created with default values.
    """
    # Initialize the root chat_session document first
    chat_session_ref = db.collection("assistant_session").document("chat_session")
    chat_session_ref.set({"exists": True}, merge=True)

    # Now create/access the subcollection
    session_ref = chat_session_ref.collection("uuid").document(uuid)
    session_ref.set({"exists": True}, merge=True)
    
    chaapter_id_ref = session_ref.collection("chapter").document(str(assistantId))
    doc = chaapter_id_ref.get()

    if doc.exists:
        return doc.to_dict()
    else:
        # Create a new session with default values
        init_data = {
            "uuid": uuid,
            "assistantId": assistantId,
            "user_unique_id": user_unique_id,
            "count": 0,
            "invalid_count": 0,
            "last_question": None,
            "user_response":user_response,
            "state": "awaiting_question",
            "conversation_history": " ",
            "created_at": datetime.utcnow().isoformat(),
            "answer_log": " ",
            "policy_log":{},
            "policy_done": 0,
            "pending_updates": [],
            "main_question_response": "",
            "functionFlow": None,   # Add the function into the session to keep working the cloning of item.
            "selected_items_details": None, # Add for showing the dependent list
            "previous_item_name": None, # Add for showing previous completed item
        }
        chaapter_id_ref.set(init_data)
        return init_data    


# Update cluster session data in Firestore
def update_cluster_session(uuid: str, assistantId, data: Dict) -> None:
    """
    Partially updates a session's fields in Firestore using the incoming 'data' dictionary.
    """
    session_ref = (
        db.collection("assistant_session")
        .document("chat_session")
        .collection("uuid")
        .document(uuid)
        .collection("chapter")
        .document(str(assistantId))
    )
    session_ref.update(data)    


def check_item_existance(user_unique_id, user_story_doc_id, chapter_doc_id, medication_name):
    # print("user story doc id", user_story_doc_id)
    # print("chapter doc id ", chapter_doc_id)
    # print("medication name", medication_name)

    user_stories_ref = db.collection("user_stories").document(user_story_doc_id)
    user_story_doc = user_stories_ref.get()

    # print("user story doc", user_story_doc)
    if user_story_doc:
        chapter_ref = user_stories_ref.collection("chapters").document(chapter_doc_id)
        chapter_doc = chapter_ref.get()

        # print("chapter_doc", chapter_doc)
        if chapter_doc:
            chapter_data = chapter_doc.to_dict()
            items = chapter_data.get("items")
            found_item = None
            for item in items:
                for key in item.keys():
                    if key.lower() == medication_name.lower():
                    # if medication_name in item.lower():  # since medication_name is a key
                        found_item = item.get("itemId")
                        print(f"Found: {key}, ID: {found_item}.")
                        break
                else:
                    continue
                break

            print("found_item", found_item)
            return found_item
        else:
            return None
    else:
        return None