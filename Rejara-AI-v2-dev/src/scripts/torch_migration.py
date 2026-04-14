import re
import os
import base64
import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv
from src.middleware.function_logger import *

load_dotenv()

Torch_Db_Host = os.environ.get("Torch_Db_Host")
Torch_Db_Username = os.environ.get("Torch_Db_Username")
Torch_Db_Password = os.environ.get("Torch_Db_Password")
Torch_Db_Name = os.environ.get("Torch_Db_Name")

# Database configuration 
DB_CONFIG = {
    "host": Torch_Db_Host,
    "user": Torch_Db_Username,
    "password": Torch_Db_Password,
    "database": Torch_Db_Name
}

# Function to clean description strings
def clean_description(description):
    if not description:
        return ""
    # Replace <br>, <br/>, <br /> (case-insensitive) with a semicolon
    description = re.sub(r'<br\s*/?>', ';', description, flags=re.IGNORECASE)
   
    # Remove all other HTML tags
    description = re.sub(r'<[^>]+>', '', description)
 
    # Fix malformed separators
    description = description.replace(": :", ":")
 
    # Split and clean
    parts = [part.strip() for part in description.split(';')]
    cleaned_parts = []
   
    for part in parts:
        if ':' in part:
            key, val = part.split(':', 1)
            if val.strip().lower() != "null" and val.strip() != "":
                cleaned_parts.append(f"{key.strip()}: {val.strip()}")
        else:
            if part.lower() != "null" and part != "":
                cleaned_parts.append(part)
   
    return "; ".join(cleaned_parts)


# Helper function to safely convert bytes to string
def safe_str(val):
    if isinstance(val, bytes):
        try:
            return val.decode('utf-8')
        except Exception:
            return str(val)
    return val


# MySQL connection functions
def connect_to_mysql():
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        if conn.is_connected():
            logger.info("Database connected successfully")
            return conn
    except Error as e:
        logger.error("Error while connecting to MySQL: {e}")
    return None


# Get user ID from email
def get_user_id(email):
    connection = connect_to_mysql()
    if not connection:
        logger.info("Connection failed. Cannot fetch user ID.")
        return None
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT id FROM users WHERE Email = %s", (email,))
        result = cursor.fetchone()
        return result["id"] if result else None
    except Error as e:
        logger.error(f"Error fetching user ID: {e}")
        return None
    finally:
        if connection and connection.is_connected():
            connection.close()


# Corrected SQL query for profile data
# Note: Removed extra comma at the end.
def fetch_profile_data(user_id):
    query = """
    SELECT 
        u.id AS userID,
        u.FirstName,
        u.LastName,
        u.Email,
        u.country,
        u.zip,
        u.YearBorn,
        u.Married,
        u.EverDivorced,
        u.Military,
        
        p.id AS petID,
        p.PetName AS petName,
        pt.PetType AS petType,
        
        r.id AS realEstateID,
        r.Address1 AS realEstateName,
        r.Address2 AS realEstateAddress,
        rt.RealEstateType AS realEstateType,
        r.City AS realEstateCity,
        r.State AS realEstateState,
        r.RealEstateStatus AS realEstateOwnerShip,
        r.Zip AS realEstateZip,
        
        v.id AS vehicleID,
        v.MakeModel AS vehicleModel,
        vt.VehicleType AS vehicleType,
        v.VehicleStatus AS vehicleOwnerShip,
        
        d.id AS dependentID,
        d.FirstName AS dependentFirstName,
        d.LastName AS dependentLastName,
        d.YearBorn AS dependentYearBorn,
        d.SpecialNeeds AS dependentsSpecialNeeds,
        FROM_BASE64(d.Relationship) AS dependentRelation
    FROM users u
    LEFT JOIN pets p ON u.id = p.UserID
    LEFT JOIN pettype pt ON p.PetType = pt.id
    LEFT JOIN realestates r ON u.id = r.UserID
    LEFT JOIN realestatetypes rt ON r.RealEstateType = rt.id
    LEFT JOIN vehicles v ON u.id = v.UserID
    LEFT JOIN vehicletypes vt ON v.VehicleType = vt.id
    LEFT JOIN dependents d ON u.id = d.UserID
    WHERE u.id = %s;
    """
    connection = connect_to_mysql()
    if not connection:
        return []
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(query, (user_id,))
        rows = cursor.fetchall()
        return rows
    except Error as e:
        logger.error(f"Error fetching profile data: {e}")
        return []
    finally:
        if connection and connection.is_connected():
            connection.close()


# Corrected SQL query for notebook data
# Note: Removed extra comma at the end.
def fetch_notebook_data(user_id):
    query = """
--  MAIN QUESTIONS: Always include them
SELECT
    qh.pageName AS PAGE,
    qh.id AS questionHeaderID,
    qh.heading AS questionHeader,
    aq.id AS allQuestionID,
    aq.question AS allQuestion,
    NULL AS subQuestionID,
    NULL AS subQuestion,
    a.id AS answerID,
    a.answer AS userAnswer,
    a.userID AS userID,
    a.notebookID AS notebookID,
    a.notebookType AS notebookType,
    s.id AS sectionID,
    s.name AS sectionName,
    COALESCE(
        v.MakeModel,
        p.PetName,
        re.Address1,
        CONCAT(per.FirstName, ' ', per.LastName),
        CONCAT(b.FirstName, ' ', b.LastName)
    ) AS notebookName
FROM the_torch_db.answers a
INNER JOIN the_torch_db.allquestions aq ON a.subquestionID = aq.id AND a.parentId = 0
INNER JOIN the_torch_db.questionheaders qh ON aq.headerID = qh.id
INNER JOIN the_torch_db.sections s ON a.notebookType = s.id
LEFT JOIN the_torch_db.vehicles v ON a.notebookID = v.id AND a.notebookType = 4
LEFT JOIN the_torch_db.pets p ON a.notebookID = p.id AND a.notebookType = 3
LEFT JOIN the_torch_db.realestates re ON a.notebookID = re.id AND a.notebookType = 1
LEFT JOIN the_torch_db.users per ON a.notebookID = per.id AND a.notebookType = 5
LEFT JOIN the_torch_db.dependents b ON a.notebookID = b.id AND a.notebookType = 2
WHERE a.userID = %s
 
UNION
 
-- SUBQUESTIONS: Only include if their parent's decoded answer = 'Yes'
SELECT
    qh.pageName AS PAGE,
    qh.id AS questionHeaderID,
    qh.heading AS questionHeader,
    aq.id AS allQuestionID,
    aq.question AS allQuestion,
    sq.id AS subQuestionID,
    sq.question AS subQuestion,
    a.id AS answerID,
    a.answer AS userAnswer,
    a.userID AS userID,
    a.notebookID AS notebookID,
    a.notebookType AS notebookType,
    s.id AS sectionID,
    s.name AS sectionName,
    COALESCE(
        v.MakeModel,
        p.PetName,
        re.Address1,
        CONCAT(per.FirstName, ' ', per.LastName),
        CONCAT(b.FirstName, ' ', b.LastName)
    ) AS notebookName
FROM the_torch_db.answers a
INNER JOIN the_torch_db.subquestions sq ON a.subquestionID = sq.id
INNER JOIN the_torch_db.allquestions aq ON sq.questionID = aq.id AND a.parentId = aq.id
INNER JOIN the_torch_db.questionheaders qh ON aq.headerID = qh.id
INNER JOIN the_torch_db.sections s ON a.notebookType = s.id
LEFT JOIN the_torch_db.vehicles v ON a.notebookID = v.id AND a.notebookType = 4
LEFT JOIN the_torch_db.pets p ON a.notebookID = p.id AND a.notebookType = 3
LEFT JOIN the_torch_db.realestates re ON a.notebookID = re.id AND a.notebookType = 1
LEFT JOIN the_torch_db.users per ON a.notebookID = per.id AND a.notebookType = 5
LEFT JOIN the_torch_db.dependents b ON a.notebookID = b.id AND a.notebookType = 2
INNER JOIN (
    SELECT
        subquestionID AS rootSubQuestionID,
        userID,
        notebookID,
        notebookType,
        FROM_BASE64(answer) AS decodedAnswer
    FROM the_torch_db.answers
    WHERE parentId = 0
) ra ON ra.userID = a.userID
     AND ra.notebookID = a.notebookID
     AND ra.notebookType = a.notebookType
     AND a.parentId = ra.rootSubQuestionID
     AND ra.decodedAnswer = 'Yes'
WHERE a.userID = %s;
    """
    connection = connect_to_mysql()
    if not connection:
        return []
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(query, (user_id,user_id))
        rows = cursor.fetchall()
        return rows
    except Error as e:
        logger.error(f"Error fetching notebook data: {e}")
        return []
    finally:
        if connection and connection.is_connected():
            connection.close()


# Helper functions to decode base64 values
def decode_base64_simple(value):
    if not value:
        return ""
    if isinstance(value, bytes):
        value = value.decode('utf-8')
    try:
        decoded = base64.b64decode(value)
        return decoded.decode('utf-8')
    except Exception:
        return safe_str(value)


# Helper functions to decode base64 values
def decode_base64_full(value):
    if not value:
        return ""
    if isinstance(value, bytes):
        value = value.decode('utf-8')
    try:
        parts = value.split()
        decoded_parts = [base64.b64decode(part).decode('utf-8') for part in parts]
        return " ".join(decoded_parts)
    except Exception:
        return safe_str(value)


# Helper function to clean description
def clean_description(description):
    description = description.replace(": :", ":")
    parts = [part.strip() for part in description.split(';')]
    cleaned_parts = []
    for part in parts:
        if ':' in part:
            key, val = part.split(':', 1)
            key = key.strip()
            val = val.strip()
           
            # Replace "None" with "Have this"
            # migration code
            if key.lower() == "none":
                key = "Have this"
 
            if key and val.lower() != "null" and val != "":
                cleaned_parts.append(f"{key}: {val}")
        else:
            if part.lower() != "null" and part != "":
                cleaned_parts.append(part)
    return "; ".join(cleaned_parts)


# Helper function to process profile data
def process_profile_data(rows):
    profile_data = {}
    for row in rows:
        user_id = str(row.get("userID", ""))
        if user_id not in profile_data:
            profile_data[user_id] = {
                "firstName": decode_base64_simple(row.get("FirstName", "")),
                "lastName": decode_base64_simple(row.get("LastName", "")),
                "email": decode_base64_simple(row.get("Email", "")),
                "country": decode_base64_simple(row.get("country", "")),
                "YearBorn": decode_base64_simple(row.get("YearBorn", "")),
                "userZip": row.get("zip", 0),
                "userMarried": row.get("Married", 0),
                "userEverDivorced": row.get("EverDivorced", 0),
                "userMilitary": row.get("Military", 0),
                "picture": "",
                "dependents": [],
                "vehicles": [],
                "pets": [],
                "realEstate": []
            }
            profile_data[user_id]["_dependents_set"] = set()
            profile_data[user_id]["_vehicles_set"] = set()
            profile_data[user_id]["_pets_set"] = set()
            profile_data[user_id]["_realEstate_set"] = set()
        # Process dependents
        if row.get("dependentID"):
            dep_key = (row.get("dependentID"), row.get("dependentFirstName"), row.get("dependentLastName"))
            if dep_key not in profile_data[user_id]["_dependents_set"]:
                profile_data[user_id]["dependents"].append({
                    "dependentID": row.get("dependentID"),
                    "firstName": decode_base64_simple(row.get("dependentFirstName", "")),
                    "lastName": decode_base64_simple(row.get("dependentLastName", "")),
                    "yearBorn": decode_base64_simple(row.get("dependentYearBorn", "")),
                    "specialNeeds": row.get("dependentsSpecialNeeds", 0),
                    "relation": decode_base64_simple(row.get("dependentRelation", "")),
                    "picture": ""
                })
                profile_data[user_id]["_dependents_set"].add(dep_key)
        # Process vehicles
        if row.get("vehicleID"):
            veh_key = (row.get("vehicleID"), row.get("vehicleModel"))
            if veh_key not in profile_data[user_id]["_vehicles_set"]:
                profile_data[user_id]["vehicles"].append({
                    "vehicleID": row.get("vehicleID"),
                    "type": row.get("vehicleType", ""),
                    "vehicleModel": decode_base64_simple(row.get("vehicleModel", "")),
                    "ownership": row.get("vehicleOwnerShip", 0),
                    "picture": ""
                })
                profile_data[user_id]["_vehicles_set"].add(veh_key)
        # Process pets
        if row.get("petID"):
            pet_key = (row.get("petID"), row.get("petName"), row.get("petType"))
            if pet_key not in profile_data[user_id]["_pets_set"]:
                profile_data[user_id]["pets"].append({
                    "petID": row.get("petID"),
                    "petName": decode_base64_simple(row.get("petName", "")),
                    "petType": decode_base64_simple(row.get("petType", "")),
                    "picture": ""
                })
                profile_data[user_id]["_pets_set"].add(pet_key)
        if row.get("realEstateID"):
            estate_key = (row.get("realEstateID"),
                          row.get("realEstateAddress"))
            if estate_key not in profile_data[user_id]["_realEstate_set"]:
                address_parts = [decode_base64_simple(
                    row.get("realEstateAddress", ""))]
                city = decode_base64_simple(row.get("realEstateCity", ""))
                state = decode_base64_simple(
                    row.get("realEstateState", ""))
                zip_code = row.get("realEstateZip", "")

 
                if city:
                    address_parts.append(f"city: {city}")
                if state:
                    address_parts.append(f"state: {state}")
                if zip_code:
                    address_parts.append(f"zip: {zip_code}")
            
                profile_data[user_id]["realEstate"].append({
                    "realEstateID": row.get("realEstateID"),
                    "name": decode_base64_simple(row.get("realEstateName", "")),
                    "address": ", ".join(address_parts),
                    "type": decode_base64_simple(row.get("realEstateType", "")),
                    "ownership": row.get("realEstateOwnerShip", 0),
                    "picture": ""
                })
                profile_data[user_id]["_realEstate_set"].add(estate_key)
    # Remove temporary sets
    for uid in profile_data:
        del profile_data[uid]["_dependents_set"]
        del profile_data[uid]["_vehicles_set"]
        del profile_data[uid]["_pets_set"]
        del profile_data[uid]["_realEstate_set"]
    return profile_data


# Helper function to process notebook data
def process_notebook_data(rows):
    notebook_dict = {}
    for row in rows:
        nb_id = row.get("notebookID")
        nb_name = decode_base64_full(row.get("notebookName", ""))
        key = (nb_id, nb_name)
        if key not in notebook_dict:
            notebook_dict[key] = {"chapters": {}}
        # Group by chapter defined by (sectionName, PAGE)
        section = row.get("sectionName", "")
        chapter = row.get("PAGE", "")
        chap_key = (section, chapter)
        if chap_key not in notebook_dict[key]["chapters"]:
            notebook_dict[key]["chapters"][chap_key] = {"items": {}}
        # Group by question (allQuestion) and combine descriptions
        question = row.get("allQuestion", "")
        sub_question = row.get("subQuestion", "")
        user_answer = decode_base64_full(row.get("userAnswer", ""))
        user_answer = re.sub(r'<br\s*/?>', ',', user_answer, flags=re.IGNORECASE)
        desc = f"{sub_question}: {user_answer}"
        if question not in notebook_dict[key]["chapters"][chap_key]["items"]:
            notebook_dict[key]["chapters"][chap_key]["items"][question] = []
        notebook_dict[key]["chapters"][chap_key]["items"][question].append(desc)
    final_notebooks = []
    for (nb_id, nb_name), nb_data in notebook_dict.items():
        chapters_list = []
        for (section, chapter), chap_data in nb_data["chapters"].items():
            items_list = []
            for question, desc_list in chap_data["items"].items():
                # raw_desc = "; ".join(desc_list)
                raw_desc = "; ".join([clean_description(desc) for desc in desc_list])
                # cleaned_desc = clean_description(raw_desc)
                items_list.append({"item": question, "description": clean_description(raw_desc)})
            chapters_list.append({"sectionName": section, "chapter": chapter, "items": items_list})
        final_notebooks.append({"notebookID": int(nb_id), "notebookName": nb_name, "chapters": chapters_list})
    return final_notebooks