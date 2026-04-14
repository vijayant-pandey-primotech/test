import mysql.connector
from mysql.connector import Error
from core.config import MYSQL_CONFIG
from core.logger import log_info, log_error

def get_mysql_connection():
    """Get MySQL database connection"""
    try:
        connection = mysql.connector.connect(**MYSQL_CONFIG)
        return connection
    except Error as e:
        log_error(f"Error connecting to MySQL: {e}")
        return None

async def get_user_by_guid(user_guid):
    """Get user information from assistant_users table by user_guid"""
    
    try:
        import asyncio
        connection = await asyncio.to_thread(get_mysql_connection)
        if not connection:
            log_error("MySQL connection failed - returning None")
            return None
        
        cursor = await asyncio.to_thread(connection.cursor, dictionary=True)
        
        query = """
            SELECT 
                   JSON_EXTRACT(assistant_data, '$.chatHistory') as chat_history
            FROM assistant_users 
            WHERE user_guid = %s
        """
        
        log_info(f"📝 Executing MySQL query: {query} with user_guid: {user_guid}")
        await asyncio.to_thread(cursor.execute, query, (user_guid,))
        user = await asyncio.to_thread(cursor.fetchone)
        
        await asyncio.to_thread(cursor.close)
        await asyncio.to_thread(connection.close)
        
        if not user:
            log_error(f"User not found: {user_guid}")
        
        return user
        
    except Error as e:
        log_error(f"Error getting user by GUID: {e}")
        return None

def validate_user_guid(user_guid):
    """Validate if user_guid exists in assistant_users table"""
    user = get_user_by_guid(user_guid)
    return user is not None 