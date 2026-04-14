import os 
import re
import json
import flask
import requests
from src.services.google_service import *
from src.controller.cbot_controller import *
from src.controller.story_controller import *
from src.scripts.torch_migration import *
from src.scripts.torch_migration_source_script import *

cbot_routes = flask.Blueprint("cbot_routes", __name__)
migrate_url = os.environ.get("middle_tire_data_url_second")

api_url = f"{migrate_url}/api/auth/migartion"
api_url2 = f"{migrate_url}/api/auth/source-script"


# Chatbot API endpoint
def chat_handler_helper():
    """
    Endpoint to handle chatbot interactions.

    Responsibilities:
        - Parse incoming JSON
        - Validate required fields
        - Process user response
        - Update database with conversation data
        - Return next prompt or response
    """
    # Parse and validate incoming JSON
    data = flask.request.get_json(force=True)

    mode = data.get("mode", "personal")
    required_fields = ["uuid", "token"]
    missing_fields = [field for field in required_fields if not data.get(field)]

    if missing_fields:
        return flask.jsonify({"error": f"Missing required fields: {', '.join(missing_fields)}"}), 400
    
    # Common fields
    uuid = data.get("uuid")
    bearer_token = data.get("token")
    user_response = data.get("user_response", "")
    user_unique_id = data.get("user_unique_id", "")
    prev_question = data.get("prev_question", "")
    type = data.get("type", "")
    mode = data.get("mode", "personal")  # either 'personal' or 'cluster'
   
    if mode == "personal":
        # Personal-specific fields
        user_story_id = data.get("userStoryId")
        chapter_doc_id = data.get("chapterId")
        chapterName = data.get("chapterName")
        topic = data.get("topic", "")
        story_name = data.get("storyName", "")
        sub_category = data.get("subCategory", "")

        # Process user response
        response = handle_user_response(
            user_response=user_response,
            userStoryId=user_story_id,
            bearer_token=bearer_token,
            uuid=uuid,
            user_unique_id=user_unique_id,
            chapterId=chapter_doc_id,
            chapterName=chapterName,
            type=type,
            mode=mode,
        )

        # Save conversation
        try:
            save_gather_assist_conversation(
                user_unique_id=user_unique_id,
                topic=topic,
                storyName=story_name,
                prev_question=prev_question,
                user_response=user_response,
                uuid=uuid,
                userStoryId=user_story_id,
                subCategory=sub_category,
                chapterId=chapter_doc_id,
                chapterName=chapterName,
            )
        except Exception as e:
            flask.current_app.logger.error(f"Error saving personal conversation: {e}")

    else:  # mode == "cluster"
        assistantId = data.get("assistantId")
        selected_items_details = data.get('selected_items_details', None)
        function_flow = data.get("functionFlow", None)
        itemId = data.get("itemId", None)
        displayType = data.get("displayType", None)
        # conditions = data.get("conditions", None)

        # Process user response
        response = handle_user_response(
            user_response=user_response,
            bearer_token=bearer_token,
            uuid=uuid,
            user_unique_id=user_unique_id,
            type=type,
            assistantId=assistantId,
            mode=mode,
            selected_items_details=selected_items_details,
            itemId=itemId,
            function_flow = function_flow,
            # conditions = conditions,
        )

        # Save cluster conversation
        try:
            save_cluster_conversation(
                user_unique_id=user_unique_id,
                prev_question=prev_question,
                user_response=user_response,
                assistantId=assistantId,
                selected_items_details=selected_items_details,
                displayType=displayType,
            )
        except Exception as e:
            flask.current_app.logger.error(f"Error saving cluster conversation: {e}")

    return flask.jsonify(response)    


# Migrate data from Torch to rejara
def generate_data_helper():
    # Get email from the request body
    data = flask.request.get_json()
    email = data.get('email')
    
    if not email:
        return flask.jsonify({"error": "Email is required"}), 400

    user_id = get_user_id(email)
    if not user_id:
        return flask.jsonify({"error": "User not found"}), 404

    # Fetch and process profile data
    profile_rows = fetch_profile_data(user_id)
    if not profile_rows:
        return flask.jsonify({"error": "There was some issue in importing your data. Please try again later."}), 500

    notebook_rows = fetch_notebook_data(user_id)
    if not notebook_rows:
        return flask.jsonify({"error": "There was some issue in importing your data. Please try again later."}), 500

    processed_profile = process_profile_data(profile_rows)
    if not processed_profile:
        return flask.jsonify({"error": "There was some issue in importing your data. Please try again later."}), 500
        
    processed_notebook = process_notebook_data(notebook_rows)
    if not processed_profile:
        return flask.jsonify({"error": "There was some issue in importing your data. Please try again later."}), 500

    # Combine the data
    final_json = {
        "profileData": processed_profile,
        "notebookData": processed_notebook
    }

    # Generate output file name
    first_name = processed_profile[str(user_id)]["firstName"]
    safe_name = re.sub(r'[^A-Za-z0-9_-]+', '', first_name)
    output_file = f"{safe_name}_{user_id}_data.json"
    
    # Save the JSON to file
    try:
        # Save the JSON to a file
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(final_json, f, indent=4)

        # Open the file, read the data and send it as raw JSON in the body
        with open(output_file, 'r', encoding="utf-8") as f:
            json_data = json.load(f)    

        # Send the data as raw JSON to the migration URL
        response = requests.post(api_url, json=json_data)

        # Check for success in the migration response
        if response.status_code == 201:
            # If successful, delete the JSON file
            migration_response = response.json()  # This will be a dictionary
            os.remove(output_file)
            return flask.jsonify({"message": "Data processed and migrated successfully.", "details":migration_response}), 200
        else:
            # Instead of placing the entire API response as a string, send it properly
            migration_error = response.json()  # Parse the response as JSON
            os.remove(output_file)
            return flask.jsonify({"error": "There was some issue in importing your data. Please try again later.", "details": migration_error}), response.status_code

    except Exception as e:
        return flask.jsonify({"error": f"There was some issue in importing your data. Please try again later."}), 500



# Migrate data from Torch to rejara for source script
def generate_data2_helper():
    # Get email from the request body
    data = flask.request.get_json()
    email = data.get('email')
    
    if not email:
        return flask.jsonify({"error": "Email is required"}), 400

    user_id = get_user_id(email)
    if not user_id:
        return flask.jsonify({"error": "User not found"}), 404

    # Fetch and process profile data
    profile_rows = fetch_profile_data(user_id)
    if not profile_rows:
        return flask.jsonify({"error": "There was some issue in importing your data. Please try again later."}), 500

    notebook_rows = fetch_notebook_data(user_id)
    if not notebook_rows:
        return flask.jsonify({"error": "There was some issue in importing your data. Please try again later."}), 500

    processed_profile = process_profile_data(profile_rows)
    if not processed_profile:
        return flask.jsonify({"error": "There was some issue in importing your data. Please try again later."}), 500
        
    processed_notebook = process_notebook_data(notebook_rows)
    if not processed_profile:
        return flask.jsonify({"error": "There was some issue in importing your data. Please try again later."}), 500

    # Combine the data
    final_json = {
        "profileData": processed_profile,
        "notebookData": processed_notebook
    }

    # Generate output file name
    first_name = processed_profile[str(user_id)]["firstName"]
    safe_name = re.sub(r'[^A-Za-z0-9_-]+', '', first_name)
    output_file = f"{safe_name}_{user_id}_data.json"
    
    # Save the JSON to file
    try:
        # Save the JSON to a file
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(final_json, f, indent=4)

        # Open the file, read the data and send it as raw JSON in the body
        with open(output_file, 'r', encoding="utf-8") as f:
            json_data = json.load(f)    

        # Send the data as raw JSON to the migration URL
        response = requests.post(api_url2, json=json_data)

        # Check for success in the migration response
        if response.status_code == 201:
            # If successful, delete the JSON file
            migration_response = response.json()  # This will be a dictionary
            os.remove(output_file)
            return flask.jsonify({"message": "Data processed and migrated successfully.", "details":migration_response}), 200
        else:
            # Instead of placing the entire API response as a string, send it properly
            migration_error = response.json()  # Parse the response as JSON
            os.remove(output_file)
            return flask.jsonify({"error": "There was some issue in importing your data. Please try again later.", "details": migration_error}), response.status_code

    except Exception as e:
        return flask.jsonify({"error": f"There was some issue in importing your data. Please try again later."}), 500
    

# Create story API endpoint
def create_story_helper():
    auth_header = flask.request.headers.get("Authorization")
    if not auth_header:
        return flask.jsonify({"error": "Authorization token is required"}), 401

    # Extract token
    bearer_token = auth_header.replace("Bearer ", "").strip()

    # Get user input
    user_input = flask.request.get_json()

    # Call ask_user_questions
    story_data = ask_user_questions(user_input, bearer_token)

    # If it's still collecting data, return the bot response
    if "bot_message" in story_data:
        return flask.jsonify({"token": bearer_token, "story_data": story_data})

    # Ensure the required fields exist before calling `save_story_to_api`
    required_keys = ["storyName", "category", "subCategory", "chapters"]
    if all(key in story_data for key in required_keys):
        json_data = json.dumps(story_data, ensure_ascii=False)
        save_result = save_story_to_api(json.loads(json_data), bearer_token)
        return flask.jsonify(save_result)

    return flask.jsonify({"error": "Incomplete story data"}), 500    