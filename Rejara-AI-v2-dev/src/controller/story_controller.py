import json
from openai import OpenAI
from dotenv import load_dotenv
import os
import time
import requests
from flask import request
from src.config.google_db import *

load_dotenv()

db = get_firestore_client() 
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
API_URL = os.getenv("middle_tire_data_url_second")

# External API Details
getUserStoryData = f"{API_URL}/api/auth/get-data-for-new-story"
saveUserStoryData = f"{API_URL}/api/auth/create-user-story"


# Function to save user responses to Firestore
def save_response_to_firestore(user_id, uuid, data):
    user_ref = db.collection('ai_story_create').document(str(user_id))
    user_ref.set({"exists": True}, merge=True)
    doc_ref = user_ref.collection(str(uuid)).document("story")
    doc_ref.set(data, merge=True)    


# Function to retrieve user story data from Firestore
def get_user_story_from_firestore(user_id, uuid):
    """Retrieve all stored user responses from Firestore"""
    doc_ref = db.collection("ai_story_create").document(user_id).collection(uuid).document("story")
    doc = doc_ref.get()
    return doc.to_dict() if doc.exists else {}


# Function to fetch existing user story data from an external API
def fetch_user_story_data(bearer_token):
    """
    Fetches existing user story, category, and subcategory data from an external API.
    """
    headers = {"Authorization": f"Bearer {bearer_token}"}
    
    try:
        response = requests.get(getUserStoryData, headers=headers)
        if response.status_code == 200:
            data = response.json().get("userStoriesData", [])
            return data
        else:
            print(f"Error fetching data: {response.status_code}")
            return []
    except Exception as e:
        print(f"API Error: {str(e)}")
        return []


# Function to check if a story already exists in a specific category
def check_story_in_category(storyName, category_name, user_data):
    """
    Checks if the given story name already exists in the specified category.
    """
    for item in user_data:
        if (item["storyName"].lower() == storyName.lower() and
                item["category"].lower() == category_name.lower()):
            return item
    return None


# Function to generate chapters and items dynamically using OpenAI API
def generate_chapters_and_items(storyName, category, subcategory):
    """
    Generates up to 5 chapters with up to 10 items per chapter dynamically based on user inputs.
    """
    prompt = f"""
    You are an intelligent assistant that generates chapters and items for a story based on user-provided details.
    
    ### Task Overview:
    - User provides the **Story Name, Category, and Subcategory**.
    - Generate up to **5 chapters** related to the given category and subcategory.
    - For each chapter, suggest up to **10 relevant items** aligned with the context.
    
    ---
    
    ### Example:
    Story Name: Samsung
    Category: Smartphone
    Subcategory: Samsung Galaxy S24
    
    Generated Chapters:
    1. Mobile:
       - mobile name
       - mobile model
       - mobile color
       - mobile price
    2. Mobile Accessories:
       - mobile charger
       - mobile earphones
       - mobile back cover
       - mobile screen guard
    3. Mobile Features:
       - mobile ram
       - mobile rom
       - mobile camera
       - mobile battery
       - mobile processor
    
    ---
    
    ### Input:
    Story Name: {storyName}
    Category: {category}
    Subcategory: {subcategory}
    
    ---
    
    ### Output Format:
    Return the result in JSON format:
    {{
        "chapters": [
            {{
                "chapter_name": "Chapter 1 Name",
                "items": ["item 1", "item 2", ..., "item 10"]
            }},
            ...
        ]
    }}
    """
    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "system", "content": prompt}],
    )

    generated_data = completion.choices[0].message.content.strip() if completion.choices[0].message.content else ""

    try:
        chapters_data = json.loads(generated_data)
        return chapters_data
    except Exception as e:
        print("Error parsing AI response:", str(e))
        return {"chapters": []}
       


def ask_user_questions(userInput, bearer_token):
    """
    Main bot function to ask questions, gather user responses, and validate story-category existence.
    Stores user responses in Firestore.
    """

    user_data = fetch_user_story_data(bearer_token)
    step = userInput.get("step")
    uuid = userInput.get("uuid")
    user_id = userInput.get("user_id")

    if step is None or not uuid:
        return {"error": "Missing required fields: step or uuid."}, 400

    session_data = get_user_story_from_firestore(user_id, uuid)

    # Step 1: Ask for story name
    if step == 0:
        return {"bot_message": "Great! Please provide a name for your new story.", "next_step": 1, "isOptional": False, "isCategory": False}

    # Step 2: Capture Story Name
    if step == 1:
        storyName = userInput.get("storyName", "").strip()

        if not storyName:
            return {"bot_message": "The story name cannot be empty. Kindly provide a valid name.", "next_step": 1, "isOptional": False, "isCategory": False}

        session_data["storyName"] = storyName
        save_response_to_firestore(user_id, uuid, session_data)

        return {"bot_message": "Great! Please choose a category for your story.", "next_step": 2, "isOptional": False, "isCategory": True}

    # Step 3: Capture Category Name & Check for Existing Story
    if step == 2:
        category_name = userInput.get("category", "").strip()

        if not category_name:
            return {"bot_message": "The category name cannot be empty. Please provide a valid category.", "next_step": 2, "isOptional": False, "isCategory": False}

        session_data["category"] = category_name
        save_response_to_firestore(user_id, uuid, session_data)

        storyName = session_data.get("storyName", "")
        existing_story = check_story_in_category(storyName, category_name, user_data)

        # 🔥 CHANGE STARTS HERE
        if existing_story:
            session_data["existing_story"] = existing_story
            save_response_to_firestore(user_id, uuid, session_data)

            return {
                "bot_message": f"A story titled '{storyName}' already exists under the category '{category_name}'. "
                               f"Please provide a new name for your story within the same category.",
                "next_step": 6,
                "isOptional": False,
                "isCategory": False
            }
        # 🔥 CHANGE ENDS HERE

        return {"bot_message": "Would you like to add a subcategory to this story?", "next_step": 4, "isOptional": True, "isCategory": False}

    # Step 3 old logic skipped
    if step == 3:
        return {"bot_message": "Invalid step. Please restart the conversation.", "next_step": 0, "isOptional": False, "isCategory": False}

    # Step 4: Decide Whether to Add Subcategory
    if step == 4:
        subcategory_choice = userInput.get("response", "").strip().lower()

        if subcategory_choice == "yes":
            return {"bot_message": "Please enter a name for the subcategory.", "next_step": 5, "isOptional": False, "isCategory": False}

        elif subcategory_choice == "no":
            session_data["subCategory"] = session_data["category"]
            session_data["chapters"] = []
            save_response_to_firestore(user_id, uuid, session_data)

            return {"bot_message": "Thank you for your response. Please click on the finish story button to create your story.", "next_step": 8, "your_story_data": session_data, "isOptional": False, "isCategory": False}

        return {"bot_message": "Invalid selection. Please respond with 'yes' or 'no'.", "next_step": 4, "isOptional": True, "isCategory": False}

    # Step 5: Capture Subcategory Name
    if step == 5:
        subcategory_name = userInput.get("subCategory", "").strip()

        session_data["subCategory"] = subcategory_name
        session_data["chapters"] = []
        save_response_to_firestore(user_id, uuid, session_data)

        return {"bot_message": "Thank you for your response. Please click on the finish story button to create your story.", "next_step": 8, "your_story_data": session_data, "isOptional": False, "isCategory": False}

    # ✅ UPDATED STEP 6: After new story name, ask for subcategory
    if step == 6:
        new_story_name = userInput.get("new_storyName", "").strip()

        existing_story = session_data.get("existing_story")
        if not existing_story:
            return {"bot_message": "No existing story found. Please go back and choose an existing story first.", "next_step": 3, "isOptional": False, "isCategory": False}

        if check_story_in_category(new_story_name, session_data["category"], user_data):
            return {"bot_message": f"The name '{new_story_name}' is already in use. Please choose a different story name.", "next_step": 6, "isOptional": False, "isCategory": False}

        session_data["storyName"] = new_story_name
        session_data["category"] = existing_story["category"]
        session_data["subCategory"] = existing_story.get("subCategory", "")
        session_data["chapters"] = existing_story.get("chapters", [])
        session_data.pop("existing_story", None)
        save_response_to_firestore(user_id, uuid, session_data)

        # 🔥 NEW CHANGE: Ask subcategory question
        return {
            "bot_message": "Would you like to add a subcategory to this story?",
            "next_step": 4,
            "isOptional": True,
            "isCategory": False
        }

    # Step 7: Handle New Category and Ask for Subcategory
    if step == 7:
        new_category = userInput.get("new_category", "").strip()

        if not new_category:
            return {"bot_message": "Category cannot be empty. Please enter a valid name.", "next_step": 7, "isOptional": False, "isCategory": False}

        for story in user_data:
            if story.get("category", "").lower() == new_category.lower():
                return {"bot_message": "This category already exists. Kindly choose a different category name.", "next_step": 7, "isOptional": False, "isCategory": False}

        session_data["category"] = new_category
        save_response_to_firestore(user_id, uuid, session_data)

        return {"bot_message": "Would you like to add a subcategory for this new category?", "next_step": 9, "isOptional": True, "isCategory": False}

    # Step 9: Handle subcategory choice after new category creation
    if step == 9:
        subcategory_choice = userInput.get("response", "").strip().lower()

        if subcategory_choice == "yes":
            return {"bot_message": "Please enter a name for the new subcategory.", "next_step": 5, "isOptional": False, "isCategory": False}

        elif subcategory_choice == "no":
            session_data["subCategory"] = session_data["category"]
            session_data["chapters"] = []
            save_response_to_firestore(user_id, uuid, session_data)

            return {"bot_message": "Thank you for your response. Please click on the finish story button to create your story.", "next_step": 8, "your_story_data": session_data, "isOptional": False, "isCategory": False}

        return {"bot_message": "Invalid selection. Please respond with 'yes' or 'no'.", "next_step": 9, "isOptional": True, "isCategory": False}

    # Step 8: Generate Story & Return Full Data
    if step == 8:
        session_data = get_user_story_from_firestore(user_id, uuid)

        if not session_data:
            return {"error": "Failed to retrieve user story data from Firestore"}

        chapters_data = generate_chapters_and_items(
            session_data["storyName"],
            session_data["category"],
            session_data.get("subCategory", "")
        )

        session_data["chapters"] = chapters_data.get("chapters", [])

        formatted_data = {
            "storyName": session_data["storyName"],
            "category": session_data["category"],
            "subCategory": session_data.get("subCategory", ""),
            "chapters": session_data["chapters"]
        }

        save_response_to_firestore(user_id, uuid, formatted_data)
        return formatted_data

    return {"bot_message": "Invalid step. Please restart the conversation.", "next_step": 0, "isOptional": False, "isCategory": False}



# Function to save the generated story data to an external API
def save_story_to_api(story_data, bearer_token):
    """
    Sends the generated story data to the external API and returns its response message.
    """
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(saveUserStoryData, headers=headers, json=story_data)

        if response.status_code == 201:
            response_json = response.json()
            return response_json
        
        else:
            return {
                "success": False,
                "message": "Oops! Couldn't save your response. Please try again later."
            }
        
    except Exception as e:
        return {
            "success": False,
            "message": "Something went wrong. Please try again in a bit."
        }
