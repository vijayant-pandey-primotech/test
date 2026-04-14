from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, Dict, Any
from database.mysql_db import get_mysql_connection
from middleware.rejara_auth_middleware import get_current_user
from core.logger import log_info, log_error
import json

router = APIRouter()

class ProfileSaveRequest(BaseModel):
    user_guid: Optional[str] = None
    profileInfo: str
    language: Optional[str] = None
    userId: Optional[str] = None

class ProfileResponse(BaseModel):
    success: bool
    message: str
    profileInfo: Optional[str] = None
    language: Optional[str] = None
    user_guid: Optional[str] = None

@router.post("/user/profile", response_model=ProfileResponse)
async def save_user_profile(
    request: ProfileSaveRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Save user profile information to the assistant_users table in MySQL
    """
    try:
        # Generate user_guid if not provided
        if not request.user_guid:
            import uuid
            request.user_guid = str(uuid.uuid4())

        # Get MySQL connection
        connection = get_mysql_connection()
        if not connection:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cursor = connection.cursor(dictionary=True)
        
        # Check if user exists and get existing assistant_data
        check_query = "SELECT assistant_data FROM assistant_users WHERE user_guid = %s"
        cursor.execute(check_query, (request.user_guid,))
        existing_user = cursor.fetchone()
        
        if existing_user:
            # Update existing user's assistant_data with profile info
            try:
                # Parse existing assistant_data
                assistant_data = json.loads(existing_user['assistant_data']) if existing_user['assistant_data'] else {}
            except (json.JSONDecodeError, TypeError):
                # If parsing fails, start with empty dict
                assistant_data = {}
            
            # Update profile info, language, and userId in assistant_data (preserve existing data)
            assistant_data['profileInfo'] = request.profileInfo
            if request.language:
                assistant_data['language'] = request.language
            if request.userId:
                assistant_data['userId'] = request.userId
            
            update_query = """
                UPDATE assistant_users 
                SET assistant_data = %s, modified_at = CURRENT_TIMESTAMP
                WHERE user_guid = %s
            """
            cursor.execute(update_query, (json.dumps(assistant_data), request.user_guid))
        else:
            # Create new user with provided user_guid and profile info in assistant_data
            assistant_data = {'profileInfo': request.profileInfo}
            if request.language:
                assistant_data['language'] = request.language
            if request.userId:
                assistant_data['userId'] = request.userId
            insert_query = """
                INSERT INTO assistant_users (user_guid, assistant_guid, assistant_data, created_at, modified_at)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            cursor.execute(insert_query, (request.user_guid, '', json.dumps(assistant_data)))
        
        connection.commit()
        cursor.close()
        connection.close()
        
        return ProfileResponse(
            success=True,
            message="Profile saved successfully",
            profileInfo=request.profileInfo,
            language=request.language,
            user_guid=request.user_guid
        )
        
    except Exception as e:
        log_error(f"Error saving profile: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save profile: {str(e)}")

@router.get("/user/profile/{user_guid}", response_model=ProfileResponse)
async def get_user_profile(
    user_guid: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Load user profile information from the assistant_users table in MySQL
    """
    try:
        # Get MySQL connection
        connection = get_mysql_connection()
        if not connection:
            raise HTTPException(status_code=500, detail="Database connection failed")
        
        cursor = connection.cursor(dictionary=True)
        
        # Query for profile info from assistant_data
        query = """
            SELECT assistant_data, user_guid 
            FROM assistant_users 
            WHERE user_guid = %s
        """
        cursor.execute(query, (user_guid,))
        result = cursor.fetchone()
        
        cursor.close()
        connection.close()
        
        if result and result['assistant_data']:
            # Parse the assistant_data JSON
            try:
                assistant_data = json.loads(result['assistant_data']) if isinstance(result['assistant_data'], str) else result['assistant_data']
                profile_info = assistant_data.get('profileInfo', '')
                language = assistant_data.get('language', '')
                
                return ProfileResponse(
                    success=True,
                    message="Profile loaded successfully",
                    profileInfo=profile_info,
                    language=language,
                    user_guid=user_guid
                )
            except json.JSONDecodeError as e:
                log_error(f"Error parsing assistant_data JSON: {e}")
                raise HTTPException(status_code=500, detail="Invalid assistant_data format")
        else:
            return ProfileResponse(
                success=True,
                message="No profile found",
                profileInfo="",
                language="",
                user_guid=user_guid
            )
        
    except Exception as e:
        log_error(f"Error loading profile: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load profile: {str(e)}")
