import json
from core.logger import log_info, log_error

def process_chat_history(chat_history_json):
    """
    Process chat history from JSON format to chronological conversation string
    
    Args:
        chat_history_json (str): JSON string containing chat history
        
    Returns:
        str: Processed chat history as chronological conversation string
    """
    try:
        # Parse the chat history JSON
        chat_history = json.loads(chat_history_json)
        
        # Check if it's already in the desired format (dict with user/assistant keys)
        if isinstance(chat_history, dict) and ('user' in chat_history or 'assistant' in chat_history):
            # Already in the right format
            processed_chat = chat_history
        else:
            # Process array format to extract type as key and content as value
            processed_chat = {}
            
            for item in chat_history:
                if isinstance(item, dict) and 'type' in item and 'content' in item:
                    processed_chat[item['type']] = item['content']
            
        # Convert to string format to preserve chronological order
        chat_string = ""
        for item in chat_history:
            if isinstance(item, dict) and 'type' in item and 'content' in item:
                chat_string += f'"{item["type"]}": "{item["content"]}", '
        
        # Remove trailing comma and space
        if chat_string:
            chat_string = chat_string[:-2]
            processed_chat = chat_string
        
        return processed_chat
        
    except (json.JSONDecodeError, TypeError) as e:
        log_error(f"Error processing chat history: {e}")
        # Fallback to original format if parsing fails
        return chat_history_json 