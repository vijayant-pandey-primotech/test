import os
import json
import re
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
import mysql.connector
from core.logger import log_info, log_error

class FirestoreService:
    def __init__(self):
        self.db = None
        self._initialize_firestore()
    
    def _initialize_firestore(self):
        """Initialize Firestore connection"""
        try:
            # Get project ID and database ID from environment variables
            project_id = os.getenv('PROJECTID')
            database_id = os.getenv('FIREBASE_DB')
            
            if not project_id:
                raise ValueError("PROJECTID environment variable is required")
            if not database_id:
                raise ValueError("FIREBASE_DB environment variable is required")
            
            # Set the credentials path
            cred_path = 'service_key.json'
            if not os.path.exists(cred_path):
                raise FileNotFoundError(f"Service account key not found at: {cred_path}")
            
            # Set environment variable for Google libraries
            os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = os.path.abspath(cred_path)
            
            # Initialize Firebase Admin SDK only once
            cred = credentials.Certificate(cred_path)
            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred)
            
            # Build Firestore client with project and database parameters
            self.db = firestore.Client(project=project_id, database=database_id)
        except Exception as e:
            log_error(f"Failed to initialize Firestore: {str(e)}")
            raise
    
    def _get_mysql_connection(self):
        """Get MySQL connection for assistant_data table"""
        try:
            connection = mysql.connector.connect(
                host=os.getenv('MYSQL_HOST'),
                user=os.getenv('MYSQL_USER'),
                password=os.getenv('MYSQL_PASSWORD'),
                database=os.getenv('MYSQL_DATABASE'),
                port=3306
            )
            return connection
        except Exception as e:
            log_error(f"MySQL connection failed: {str(e)}")
            raise
    
    def _generate_user_guid(self):
        """Generate a new user_guid using UUID (same as save_user_profile)"""
        import uuid
        return str(uuid.uuid4())
    
    async def _check_existing_profile(self, user_guid):
        """Check if profileInfo already exists in assistant_data table using user_guid"""
        try:
            import asyncio
            connection = await asyncio.to_thread(self._get_mysql_connection)
            cursor = await asyncio.to_thread(connection.cursor)
            
            # Check if profileInfo exists for this user_guid
            query = """
                SELECT assistant_data FROM assistant_users 
                WHERE user_guid = %s
            """
            await asyncio.to_thread(cursor.execute, query, (user_guid,))
            result = await asyncio.to_thread(cursor.fetchone)
            
            await asyncio.to_thread(cursor.close)
            await asyncio.to_thread(connection.close)
            
            if result and result[0]:
                # Parse the JSON and check if profileInfo exists
                import json
                try:
                    assistant_data = json.loads(result[0])
                    profile_info = assistant_data.get('profileInfo', '')
                    if profile_info and profile_info.strip() != '':
                        return profile_info
                    else:
                        return None
                except:
                    return None
            
            return None
        except Exception as e:
            log_error(f"Error checking existing profile: {str(e)}")
            return None
    
    async def _save_profile_to_database(self, user_guid, profile_info, userId=None):
        """Save profile info to assistant_users table using same pattern as save_user_profile"""
        try:
            import asyncio
            connection = await asyncio.to_thread(self._get_mysql_connection)
            cursor = await asyncio.to_thread(connection.cursor, dictionary=True)
            
            # Check if user exists and get existing assistant_data
            check_query = "SELECT assistant_data FROM assistant_users WHERE user_guid = %s"
            await asyncio.to_thread(cursor.execute, check_query, (user_guid,))
            existing_user = await asyncio.to_thread(cursor.fetchone)
            
            if existing_user:
                # Update existing user's assistant_data with profile info
                try:
                    # Parse existing assistant_data
                    assistant_data = json.loads(existing_user['assistant_data']) if existing_user['assistant_data'] else {}
                except (json.JSONDecodeError, TypeError):
                    # If parsing fails, start with empty dict
                    assistant_data = {}
                
                # Update profile info and userId in assistant_data (preserve existing data)
                assistant_data['profileInfo'] = profile_info
                if userId:
                    assistant_data['userId'] = userId
                
                update_query = """
                    UPDATE assistant_users 
                    SET assistant_data = %s, modified_at = CURRENT_TIMESTAMP
                    WHERE user_guid = %s
                """
                await asyncio.to_thread(cursor.execute, update_query, (json.dumps(assistant_data), user_guid))
            else:
                # Create new user with provided user_guid and profile info in assistant_data
                assistant_data = {'profileInfo': profile_info}
                if userId:
                    assistant_data['userId'] = userId
                insert_query = """
                    INSERT INTO assistant_users (user_guid, assistant_guid, assistant_data, created_at, modified_at)
                    VALUES (%s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """
                await asyncio.to_thread(cursor.execute, insert_query, (user_guid, '', json.dumps(assistant_data)))
            
            await asyncio.to_thread(connection.commit)
            await asyncio.to_thread(cursor.close)
            await asyncio.to_thread(connection.close)
            
            log_info(f"Profile info saved to database for user_guid: {user_guid}")
        except Exception as e:
            log_error(f"Error saving profile to database: {str(e)}")
            raise
    
    async def build_profile_info(self, user_id):
        """Build profile info from Firestore data using FIRESTORE_ITEMS environment variable"""
        try:
            log_info(f"Fetching profile data from Firestore for user {user_id}")
            
            # Get environment variables
            collection_name = os.getenv('FIRESTORE_COLLECTION', 'user_stories')
            firestore_items_json = os.getenv('FIRESTORE_ITEMS', '[]')
            firestore_custom_items_json = os.getenv('FIRESTORE_CUSTOM_ITEMS', '[]')
            
            # Parse FIRESTORE_ITEMS JSON array
            try:
                firestore_items = json.loads(firestore_items_json)
            except json.JSONDecodeError as e:
                log_error(f"Error parsing FIRESTORE_ITEMS JSON: {e}")
                return None
            
            # Parse FIRESTORE_CUSTOM_ITEMS JSON array
            try:
                firestore_custom_items = json.loads(firestore_custom_items_json)
            except json.JSONDecodeError as e:
                log_error(f"Error parsing FIRESTORE_CUSTOM_ITEMS JSON: {e}")
                firestore_custom_items = []
            
            # Build profile info parts
            profile_parts = []
            personal_info = None
            
            # Process FIRESTORE_CUSTOM_ITEMS for personal info (age and marital status)
            for item in firestore_custom_items:
                story_id = item.get('story_id')
                chapter_name = item.get('name')
                
                if story_id and chapter_name:
                    personal_info = self._get_personal_info(user_id, collection_name, story_id, chapter_name)
                    if personal_info:
                        # Check if we have care receiver names (story_id == 97)
                        care_receiver_names = self._get_care_receiver_names(user_id, collection_name, 97)
                        if care_receiver_names:
                            profile_parts.append(f"{personal_info} providing care for {care_receiver_names}")
                        else:
                            profile_parts.append(personal_info)
            
            # Process each item in FIRESTORE_ITEMS
            for item in firestore_items:
                story_id = item.get('story_id')
                name = item.get('name')
                items = item.get('items', [])
                
                if not story_id:
                    continue
                
                # If no name and items defined, just get count
                if not name and not items:
                    count_info = self._get_story_counts(user_id, collection_name, story_id)
                    if count_info:
                        profile_parts.append(count_info)
                
                # If name and items are defined, get detailed info
                elif name and items:
                    # Use _get_care_receiver_docs for story_id == 97 (care receivers)
                    if story_id == 97:
                        docs_info = self._get_care_receiver_docs(user_id, collection_name, story_id, name, items)
                    else:
                        docs_info = self._get_chapter_docs(user_id, collection_name, story_id, name, items)
                    if docs_info:
                        profile_parts.append(docs_info)
            
            # Build final profile info with bullet points and line breaks
            if profile_parts:
                # Format each part with "- " prefix and line break
                formatted_parts = [f"- {part}" for part in profile_parts]
                profile_info = "\n".join(formatted_parts)
                
                # Generate user_guid and save to database
                user_guid = self._generate_user_guid()
                await self._save_profile_to_database(user_guid, profile_info, userId=str(user_id))
                
                log_info(f"Profile info built and saved: {profile_info}")
                return {"profile_info": profile_info, "user_guid": user_guid}
            else:
                log_info(f"No profile data found for user {user_id}")
                # Still generate user_guid even if no profile data
                user_guid = self._generate_user_guid()
                return {"profile_info": None, "user_guid": user_guid}
                
        except Exception as e:
            log_error(f"Error building profile info: {str(e)}")
            # Still generate user_guid even if profile building fails
            user_guid = self._generate_user_guid()
            return {"profile_info": None, "user_guid": user_guid}
    
    def _get_personal_info(self, user_id, collection_name, story_id, chapter_name):
        """Get personal info (age and marital status) from Firestore data"""
        try:
            docs = self.db.collection(collection_name).where('userId', '==', int(user_id)).where('storyId', '==', int(story_id)).stream()
            
            for doc in docs:
                data = doc.to_dict()
                if 'storyName' in data:
                    story_name = data['storyName']
                    
                    # Look for the specific chapter in subcollections
                    chapters_ref = self.db.collection(collection_name).document(doc.id).collection('chapters')
                    chapter_docs = chapters_ref.where('chapterName', '==', chapter_name).stream()
                    
                    for chapter_doc in chapter_docs:
                        chapter_data = chapter_doc.to_dict()
                        age_info = ""
                        marital_info = ""
                        
                        # Look through items array for personal info
                        if 'items' in chapter_data and isinstance(chapter_data['items'], list):
                            for item in chapter_data['items']:
                                if isinstance(item, dict) and item.get('isAnswered') == 1:
                                    # Calculate age from Date of Birth
                                    if 'Date Of Birth' in item:
                                        try:
                                            birth_date_str = item['Date Of Birth']
                                            # Handle ISO format (1979-10-01T04:00:00.000Z)
                                            if 'T' in birth_date_str:
                                                birth_date = datetime.fromisoformat(birth_date_str.replace('Z', '+00:00'))
                                            else:
                                                # Handle MM-DD-YYYY format
                                                birth_date = datetime.strptime(birth_date_str, '%m-%d-%Y')
                                            age = datetime.now().year - birth_date.year
                                            age_info = f"I am a {age} year old"
                                        except Exception as e:
                                            log_error(f"Error parsing birth date '{birth_date_str}': {e}")
                                    
                                    # Get marital status (if available)
                                    if 'Married' in item:
                                        marital_status = item['Married'].lower()
                                        if 'yes' in marital_status or 'married' in marital_status:
                                            marital_info = "married"
                                        elif 'no' in marital_status or 'single' in marital_status:
                                            marital_info = "single"
                        
                        if age_info and marital_info:
                            return f"{age_info}, {marital_info}"
                        elif age_info:
                            return age_info
                        elif marital_info:
                            return f"I am {marital_info}"
                           
        except Exception as e:
            log_error(f"Error getting personal info: {str(e)}")
        
        return None
    
    def _get_care_receiver_names(self, user_id, collection_name, care_receiver_id):
        """Get care receiver names for the profile"""
        try:
            docs = self.db.collection(collection_name).where('userId', '==', int(user_id)).where('storyId', '==', int(care_receiver_id)).stream()
            
            names = []
            for doc in docs:
                data = doc.to_dict()
                if 'storyName' in data:
                    names.append(data['storyName'])
            
            if names:
                if len(names) == 1:
                    return names[0]
                elif len(names) == 2:
                    return f"{names[0]} and {names[1]}"
                else:
                    return f"{', '.join(names[:-1])}, and {names[-1]}"
            
            return None
        except Exception as e:
            log_error(f"Error getting care receiver names: {str(e)}")
            return None
    
    def _get_story_counts(self, user_id, collection_name, story_id):
        """Get story type counts for story_id that has no name and items defined"""
        try:
            story_counts = {}
            
            docs = self.db.collection(collection_name).where('userId', '==', int(user_id)).where('storyId', '==', int(story_id)).stream()
            
            for doc in docs:
                data = doc.to_dict()
                if 'storyType' in data:
                    story_type = data['storyType']
                    story_counts[story_type] = story_counts.get(story_type, 0) + 1
            
            if story_counts:
                count_parts = []
                for story_type, count in story_counts.items():
                    count_parts.append(f"{count} {story_type}")
                return f"with {', '.join(count_parts)}"
            
            return None
        except Exception as e:
            log_error(f"Error getting story counts: {str(e)}")
            return None
    
    def _get_chapter_docs(self, user_id, collection_name, story_id, name, items):
        """Get chapter documents info for specific story_id, name, and items"""
        try:
            docs = self.db.collection(collection_name).where('userId', '==', int(user_id)).where('storyId', '==', int(story_id)).stream()
            
            chapter_info = []
            
            for doc in docs:
                data = doc.to_dict()
                if 'storyName' in data:
                    story_name = data['storyName']
                    has_docs = []
                    missing_docs = []
                    
                    # Look for the specific chapter in subcollections
                    chapters_ref = self.db.collection(collection_name).document(doc.id).collection('chapters')
                    chapter_docs = chapters_ref.where('chapterName', '==', name).stream()
                    
                    for chapter_doc in chapter_docs:
                        chapter_data = chapter_doc.to_dict()
                        
                        # Check each item in the chapter's items array
                        if 'items' in chapter_data and isinstance(chapter_data['items'], list):
                            for item in chapter_data['items']:
                                if isinstance(item, dict) and item.get('isAnswered') == 1:
                                    for doc_type in items:
                                        if doc_type in item:
                                            value = str(item[doc_type]).lower()
                                            doc_type_lower = doc_type.lower()
                                            
                                            # Use HTML tags as delimiters to get first line
                                            # Split by </p> tags to get individual paragraphs
                                            paragraphs = re.split(r'</p>', value)
                                            first_paragraph = paragraphs[0] if paragraphs else value
                                            # Strip HTML tags from first paragraph
                                            clean_first_paragraph = re.sub(r'<[^>]+>', '', first_paragraph).strip()
                                            # Further split by carriage returns to get first line
                                            first_line = clean_first_paragraph.split('\n')[0].strip()
                                            
                                            if 'no' in first_line and any(part in first_line for part in doc_type_lower.split()):
                                                missing_docs.append(doc_type)
                                            else:
                                                has_docs.append(doc_type)
                    
                    if has_docs or missing_docs:
                        doc_info = ""
                        if has_docs:
                            doc_info += f"has {', '.join(has_docs)}"
                        if missing_docs:
                            if len(doc_info) > 0:
                                doc_info += f" but does not have {', '.join(missing_docs)}"
                            else:
                                doc_info += f"does not have {', '.join(missing_docs)}"
                        chapter_info.append(doc_info)
            
            if chapter_info:
                return ". ".join(chapter_info)
                
        except Exception as e:
            log_error(f"Error getting chapter docs: {str(e)}")
        
        return None
    
    def _get_care_receiver_docs(self, user_id, collection_name, care_receiver_id, care_receiver_chapter, care_receiver_items):
        """Get care receiver documents info for story_id == 97, processing each care receiver individually"""
        try:
            docs = self.db.collection(collection_name).where('userId', '==', int(user_id)).where('storyId', '==', int(care_receiver_id)).stream()
            
            care_receiver_info = []
            
            for doc in docs:
                data = doc.to_dict()
                if 'storyName' in data:
                    story_name = data['storyName']
                    has_docs = []
                    missing_docs = []
                    
                    # Look for the specific chapter in subcollections
                    chapters_ref = self.db.collection(collection_name).document(doc.id).collection('chapters')
                    chapter_docs = chapters_ref.where('chapterName', '==', care_receiver_chapter).stream()
                    
                    for chapter_doc in chapter_docs:
                        chapter_data = chapter_doc.to_dict()
                        
                        # Check each care receiver item in the chapter's items array
                        if 'items' in chapter_data and isinstance(chapter_data['items'], list):
                            for item in chapter_data['items']:
                                if isinstance(item, dict) and item.get('isAnswered') == 1:
                                    for doc_type in care_receiver_items:
                                        if doc_type in item:
                                            value = str(item[doc_type]).lower()
                                            doc_type_lower = doc_type.lower()
                                            
                                            # Use HTML tags as delimiters to get first line
                                            # Split by </p> tags to get individual paragraphs
                                            paragraphs = re.split(r'</p>', value)
                                            first_paragraph = paragraphs[0] if paragraphs else value
                                            # Strip HTML tags from first paragraph
                                            clean_first_paragraph = re.sub(r'<[^>]+>', '', first_paragraph).strip()
                                            # Further split by carriage returns to get first line
                                            first_line = clean_first_paragraph.split('\n')[0].strip()
                                            
                                            if 'no' in first_line and any(part in first_line for part in doc_type_lower.split()):
                                                missing_docs.append(doc_type)
                                            else:
                                                has_docs.append(doc_type)
                    
                    if has_docs or missing_docs:
                        doc_info = f"{story_name}"
                        if has_docs:
                            doc_info += f" has {', '.join(has_docs)}"
                        if missing_docs:
                            if len(doc_info) > len(story_name):
                                doc_info += f" but does not have {', '.join(missing_docs)}"
                            else:
                                doc_info += f" does not have {', '.join(missing_docs)}"
                        care_receiver_info.append(doc_info)
            
            if care_receiver_info:
                return ". ".join(care_receiver_info)
                
        except Exception as e:
            log_error(f"Error getting care receiver docs: {str(e)}")
        
        return None

# Create global instance
firestore_service = FirestoreService()
