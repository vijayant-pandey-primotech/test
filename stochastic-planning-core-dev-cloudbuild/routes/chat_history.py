from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, field_validator
from typing import List, Dict, Any, Optional
from database.mysql_db import get_mysql_connection
from middleware.rejara_auth_middleware import get_current_user
from core.logger import log_info, log_error
import json
import uuid
from datetime import datetime

router = APIRouter()

class ChatHistorySaveRequest(BaseModel):
    user_guid: Optional[str] = None
    chat_history: List[Dict[str, Any]] = []  # [{"type": "user"|"assistant", "content": "message", "timestamp": "time", "id": 123, "isTyping": false}]

    @field_validator('user_guid', mode='before')
    @classmethod
    def validate_user_guid(cls, v):
        # Convert empty strings to None
        if v == '' or v == 'null' or v == 'undefined':
            return None
        # Convert numbers to strings (for backward compatibility with old numeric IDs)
        if isinstance(v, (int, float)):
            return str(v)
        return v

    @field_validator('chat_history', mode='before')
    @classmethod
    def validate_chat_history(cls, v):
        # Convert null/None to empty list
        if v is None or v == 'null':
            return []
        # Ensure it's a list
        if not isinstance(v, list):
            log_error(f"chat_history is not a list, received type: {type(v)}, value: {v}")
            return []
        return v

class ChatHistoryLoadRequest(BaseModel):
    user_guid: Optional[str] = None

    @field_validator('user_guid', mode='before')
    @classmethod
    def validate_user_guid(cls, v):
        # Convert empty strings to None
        if v == '' or v == 'null' or v == 'undefined':
            return None
        # Convert numbers to strings (for backward compatibility with old numeric IDs)
        if isinstance(v, (int, float)):
            return str(v)
        return v

class ChatHistoryResponse(BaseModel):
    success: bool
    message: str
    chat_history: Optional[List[Dict[str, Any]]] = None
    user_guid: Optional[str] = None

@router.post("/chat-history/save", response_model=ChatHistoryResponse)
async def save_chat_history(
    request: ChatHistorySaveRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Save chat history to the assistant_users table in MySQL
    """
    try:
        # Log incoming request for debugging
        log_info(f"Save chat history request - user_guid: {request.user_guid}, chat_history length: {len(request.chat_history)}")
        # Get MySQL connection
        connection = get_mysql_connection()
        if not connection:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cursor = connection.cursor(dictionary=True)
        
        if request.user_guid:
            # Check if user exists and get existing assistant_data
            check_query = "SELECT assistant_data FROM assistant_users WHERE user_guid = %s"
            cursor.execute(check_query, (request.user_guid,))
            existing_user = cursor.fetchone()
            
            if existing_user:
                # Update existing user's assistant_data with chat history
                try:
                    # Parse existing assistant_data
                    assistant_data = json.loads(existing_user['assistant_data']) if existing_user['assistant_data'] else {}
                except (json.JSONDecodeError, TypeError):
                    # If parsing fails, start with empty dict
                    assistant_data = {}
                
                # Update chat history in assistant_data (preserve existing data)
                # Add timestamps to messages that don't have them
                chat_history_with_timestamps = []
                for message in request.chat_history:
                    if 'timestamp' not in message or not message['timestamp']:
                        message['timestamp'] = datetime.utcnow().isoformat()
                    chat_history_with_timestamps.append(message)
                
                assistant_data['chatHistory'] = chat_history_with_timestamps
                
                update_query = """
                    UPDATE assistant_users 
                    SET assistant_data = %s, modified_at = CURRENT_TIMESTAMP
                    WHERE user_guid = %s
                """
                cursor.execute(update_query, (json.dumps(assistant_data), request.user_guid))
            else:
                # Create new user with provided user_guid and chat history in assistant_data
                # Check if there's existing data for this user_guid first
                check_existing_query = "SELECT assistant_data FROM assistant_users WHERE user_guid = %s"
                cursor.execute(check_existing_query, (request.user_guid,))
                existing_data = cursor.fetchone()
                
                if existing_data and existing_data['assistant_data']:
                    try:
                        assistant_data = json.loads(existing_data['assistant_data'])
                    except (json.JSONDecodeError, TypeError):
                        assistant_data = {}
                else:
                    assistant_data = {}
                
                # Add timestamps to messages that don't have them
                chat_history_with_timestamps = []
                for message in request.chat_history:
                    if 'timestamp' not in message or not message['timestamp']:
                        message['timestamp'] = datetime.utcnow().isoformat()
                    chat_history_with_timestamps.append(message)
                
                assistant_data['chatHistory'] = chat_history_with_timestamps
                
                insert_query = """
                    INSERT INTO assistant_users (user_guid, assistant_guid, assistant_data, created_at, modified_at)
                    VALUES (%s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """
                cursor.execute(insert_query, (request.user_guid, '', json.dumps(assistant_data)))  # assistant_guid - using empty string as there's no assistant_guid in this app
        else:
            # No user_guid provided, generate a new UUID
            new_user_guid = str(uuid.uuid4())

            # Add timestamps to messages that don't have them
            chat_history_with_timestamps = []
            for message in request.chat_history:
                if 'timestamp' not in message or not message['timestamp']:
                    message['timestamp'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                chat_history_with_timestamps.append(message)

            assistant_data = {'chatHistory': chat_history_with_timestamps}
            insert_query = """
                INSERT INTO assistant_users (user_guid, assistant_guid, assistant_data, created_at, modified_at)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            cursor.execute(insert_query, (new_user_guid, '', json.dumps(assistant_data)))

            # Set the generated user_guid in the request
            request.user_guid = new_user_guid
            log_info(f"Created new user with user_guid: {new_user_guid}")
        
        connection.commit()
        cursor.close()
        connection.close()
        
        return ChatHistoryResponse(
            success=True,
            message="Chat history saved successfully",
            user_guid=request.user_guid
        )
        
    except Exception as e:
        log_error(f"Error saving chat history: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save chat history: {str(e)}")

@router.post("/chat-history/load", response_model=ChatHistoryResponse)
async def load_chat_history(
    request: ChatHistoryLoadRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Load chat history from the assistant_users table in MySQL
    """
    try:      
        # If no user_guid provided, return empty chat history
        if not request.user_guid:
            return ChatHistoryResponse(
                success=True,
                message="No user_guid provided",
                chat_history=[],
                user_guid=None
            )
        
        # Get MySQL connection
        connection = get_mysql_connection()
        if not connection:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cursor = connection.cursor(dictionary=True)
        
        # Query for chat history from assistant_data (like agent_api.py)
        query = """
            SELECT assistant_data, user_guid 
            FROM assistant_users 
            WHERE user_guid = %s
        """
        cursor.execute(query, (request.user_guid,))
        result = cursor.fetchone()
        
        cursor.close()
        connection.close()
        
        if result and result['assistant_data']:
            # Parse the assistant_data JSON
            try:
                assistant_data = json.loads(result['assistant_data']) if isinstance(result['assistant_data'], str) else result['assistant_data']
                chat_history = assistant_data.get('chatHistory', [])
                
                return ChatHistoryResponse(
                    success=True,
                    message="Chat history loaded successfully",
                    chat_history=chat_history,
                    user_guid=request.user_guid
                )
            except json.JSONDecodeError as e:
                log_error(f"Error parsing assistant_data JSON: {e}")
                raise HTTPException(status_code=500, detail="Invalid assistant_data format")
        else:
            log_info(f"No chat history found for user: {request.user_guid}")
            return ChatHistoryResponse(
                success=True,
                message="No chat history found",
                chat_history=[],
                user_guid=request.user_guid
            )
        
    except Exception as e:
        log_error(f"Error loading chat history: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load chat history: {str(e)}")

@router.post("/chat-history/clear", response_model=ChatHistoryResponse)
async def clear_chat_history(
    request: ChatHistoryLoadRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Clear chat history for a user
    """
    try:
        # Get MySQL connection
        connection = get_mysql_connection()
        if not connection:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cursor = connection.cursor(dictionary=True)
        
        # Clear chat history from assistant_data
        # First get existing assistant_data
        get_query = "SELECT assistant_data FROM assistant_users WHERE user_guid = %s"
        cursor.execute(get_query, (request.user_guid,))
        existing_user = cursor.fetchone()
        
        if existing_user and existing_user['assistant_data']:
            try:
                # Parse existing assistant_data
                assistant_data = json.loads(existing_user['assistant_data'])
                # Remove chatHistory
                assistant_data.pop('chatHistory', None)
                
                update_query = """
                    UPDATE assistant_users 
                    SET assistant_data = %s, modified_at = CURRENT_TIMESTAMP
                    WHERE user_guid = %s
                """
                cursor.execute(update_query, (json.dumps(assistant_data), request.user_guid))
            except (json.JSONDecodeError, TypeError):
                # If parsing fails, just update with empty assistant_data
                update_query = """
                    UPDATE assistant_users 
                    SET assistant_data = %s, modified_at = CURRENT_TIMESTAMP
                    WHERE user_guid = %s
                """
                cursor.execute(update_query, (json.dumps({}), request.user_guid))
        else:
            # No existing data, just update with empty assistant_data
            update_query = """
                UPDATE assistant_users 
                SET assistant_data = %s, modified_at = CURRENT_TIMESTAMP
                WHERE user_guid = %s
            """
            cursor.execute(update_query, (json.dumps({}), request.user_guid))
        
        if cursor.rowcount > 0:
            connection.commit()
            message = "Chat history cleared successfully"
        else:
            log_info(f"No user found to clear chat history: {request.user_guid}")
            message = "No user found to clear chat history"
        
        cursor.close()
        connection.close()
        
        return ChatHistoryResponse(
            success=True,
            message=message,
            user_guid=request.user_guid
        )
        
    except Exception as e:
        log_error(f"Error clearing chat history: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear chat history: {str(e)}")

@router.get("/chat-history/user/{user_guid}")
async def get_user_info(
    user_guid: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get user information and chat history status
    """
    try:
        # Get MySQL connection
        connection = get_mysql_connection()
        if not connection:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cursor = connection.cursor(dictionary=True)
        
        # Query for user info
        query = """
            SELECT user_guid, created_at, modified_at, 
                   CASE WHEN assistant_data IS NOT NULL THEN JSON_LENGTH(JSON_EXTRACT(assistant_data, '$.chatHistory')) ELSE 0 END as message_count
            FROM assistant_users 
            WHERE user_guid = %s
        """
        cursor.execute(query, (user_guid,))
        result = cursor.fetchone()
        
        cursor.close()
        connection.close()
        
        if result:
            return {
                "success": True,
                "user_guid": result['user_guid'],
                "created_at": result['created_at'],
                "modified_at": result['modified_at'],
                "message_count": result['message_count']
            }
        else:
            log_info(f"No user found: {user_guid}")
            return {
                "success": False,
                "message": "User not found",
                "user_guid": user_guid
            }
        
    except Exception as e:
        log_error(f"Error getting user info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get user info: {str(e)}")
