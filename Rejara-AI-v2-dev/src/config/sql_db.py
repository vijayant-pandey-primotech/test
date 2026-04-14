import os
import mysql.connector
from dotenv import load_dotenv


load_dotenv()

def get_mysql_connection():
    try:
        conn = mysql.connector.connect(
            host=os.getenv("Sql_DB_HOST"),
            user=os.getenv("Sql_DB_USER"),
            password=os.getenv("Sql_DB_PASSWORD"),
            database=os.getenv("Sql_DB_NAME")
        )
        if conn.is_connected():
            print("MySQL connected successfully.")
        return conn
    except mysql.connector.Error as err:
        print("Error connecting to MySQL:", err)
        return None
