#!/usr/bin/env python3
"""
JWT Token Service for authentication
"""

import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from jose import JWTError, jwt
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 12

class JWTService:
    """JWT Token management service"""
    
    @staticmethod
    def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        """
        Create a JWT access token
        
        Args:
            data: Dictionary containing user data to encode in the token
            expires_delta: Optional timedelta for custom expiration time
            
        Returns:
            str: Encoded JWT token
        """
        to_encode = data.copy()
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
        
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    
    @staticmethod
    def verify_token(token: str) -> Optional[Dict[str, Any]]:
        """
        Verify and decode a JWT token
        
        Args:
            token: JWT token string
            
        Returns:
            Dict containing token payload if valid, None if invalid
        """
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except JWTError:
            return None
    
    @staticmethod
    def get_token_expiration(token: str) -> Optional[datetime]:
        """
        Get the expiration time of a token
        
        Args:
            token: JWT token string
            
        Returns:
            datetime of expiration if valid, None if invalid
        """
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            exp_timestamp = payload.get("exp")
            if exp_timestamp:
                return datetime.fromtimestamp(exp_timestamp)
        except JWTError:
            pass
        return None
    
    @staticmethod
    def is_token_expired(token: str) -> bool:
        """
        Check if a token is expired
        
        Args:
            token: JWT token string
            
        Returns:
            True if expired, False if valid
        """
        exp_time = JWTService.get_token_expiration(token)
        if exp_time:
            return datetime.utcnow() > exp_time
        return True

# Create a singleton instance
jwt_service = JWTService()
