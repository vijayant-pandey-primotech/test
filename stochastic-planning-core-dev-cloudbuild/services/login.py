#!/usr/bin/env python3
"""
Simple backend login system
"""

import mysql.connector
import bcrypt
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify password using bcrypt comparison
    Equivalent to bcrypt.compare() in Node.js
    
    Args:
        plain_password: The plain text password to verify
        hashed_password: The bcrypt hashed password from database
        
    Returns:
        bool: True if password matches, False otherwise
    """
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception as e:
        print(f"Error verifying password: {e}")
        return False

async def login_user(email: str, password: str) -> bool:
    """
    Main login method that accepts user email and password (clear text)
    
    Args:
        email: User's email address
        password: User's password in clear text
        
    Returns:
        bool: True if login successful, False otherwise
    """
    try:
        # Get database configuration from .env variables starting with "MYSQL_"
        db_config = {
            'host': os.getenv('Sql_DB_HOST', 'localhost'),
            'user': os.getenv('Sql_DB_USER', 'your_username'),
            'password': os.getenv('Sql_DB_PASSWORD', 'your_password'),
            'database': os.getenv('Sql_DB_NAME', 'your_database'),
            'port': int(os.getenv('Sql_DB_PORT', 3306))
        }
        
        # Connect to MySQL database
        import asyncio
        connection = await asyncio.to_thread(mysql.connector.connect, **db_config)
        cursor = await asyncio.to_thread(connection.cursor)
        
        # Select the password column from usermaster table
        query = "SELECT firstName, password, userId FROM usermaster WHERE emailAddress = %s"
        await asyncio.to_thread(cursor.execute, query, (email,))
        result = await asyncio.to_thread(cursor.fetchone)
        
        # Close database connection
        await asyncio.to_thread(cursor.close)
        await asyncio.to_thread(connection.close)
        
        # Check if user exists
        if not result:
            print(f"User with email {email} not found")
            return {"success": False, "firstName": None, "userId": None}
        
        firstName = result[0]
        stored_password = result[1]
        userId = result[2] if len(result) > 2 else None
        
        # Use bcrypt to compare the plain password with the stored hash
        if verify_password(password, stored_password):
            print(f"Login successful for {email}")
            return {"success": True, "firstName": firstName, "userId": userId}
        else:
            print(f"Login failed for {email} - invalid credentials")
            return {"success": False, "firstName": None, "userId": None}
            
    except Exception as e:
        print(f"Error during login: {e}")
        return {"success": False, "firstName": None, "userId": None}

