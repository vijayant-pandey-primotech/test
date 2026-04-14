from fastapi import APIRouter, HTTPException, Query, Depends
from models.request_models import RecommendationRequest
from models.response_models import RecommendationResponse
from services.llm_service import LLMService
from database.mysql_db import get_user_by_guid, get_mysql_connection
from utils.chat_processor import process_chat_history
from middleware.rejara_auth_middleware import get_current_user
from core.config import LLM_CONFIGS
from core.logger import log_info, log_error, log_large_json, user_guid_context
import google.generativeai as genai
import json
import time
import re
import uuid
from datetime import datetime
from typing import Dict, Any

router = APIRouter()

# Initialize services
llm_service = LLMService()

def smart_json_repair(json_string: str) -> str:
    """
    Intelligently repair JSON by using the error position to identify and fix issues.
    Similar to how jsonlint.com works - it tells you exactly where the problem is.
    """
    if not json_string:
        return json_string
    
    # First, try to parse as-is
    try:
        json.loads(json_string)
        return json_string  # Already valid
    except json.JSONDecodeError as e:
        log_info(f"JSON error at position {e.pos}: {e.msg}")
        
        # Extract the problematic area around the error
        error_pos = e.pos
        context_start = max(0, error_pos - 50)
        context_end = min(len(json_string), error_pos + 50)
        problem_area = json_string[context_start:context_end]
        
        log_info(f"Problem area around error: ...{problem_area}...")
        
        # Try different repair strategies based on the error message
        repaired = json_string
        
        if "Expecting ',' delimiter" in e.msg:
            # Look for missing comma before the error position
            # Find the last complete structure before the error
            before_error = json_string[:error_pos]
            
            # Look for patterns like "}" followed by "{" or "]" followed by "["
            if re.search(r'}\s*{', before_error):
                # Missing comma between objects
                repaired = re.sub(r'}\s*{', '}, {', repaired)
            elif re.search(r']\s*\[', before_error):
                # Missing comma between arrays
                repaired = re.sub(r']\s*\[', '], [', repaired)
            elif re.search(r'}\s*\[', before_error):
                # Missing comma between object and array
                repaired = re.sub(r'}\s*\[', '}, [', repaired)
            elif re.search(r']\s*{', before_error):
                # Missing comma between array and object
                repaired = re.sub(r']\s*{', '], {', repaired)
            else:
                # More aggressive approach - look for any } or ] not followed by comma
                # but followed by whitespace and then { or [
                repaired = re.sub(r'([}\]])[\s\n]+([{\[])', r'\1, \2', repaired)
        
        elif "Expecting property name" in e.msg:
            # Look for unquoted keys or extra characters
            # Find the area around the error and look for common issues
            error_context = json_string[max(0, error_pos-20):min(len(json_string), error_pos+20)]
            
            if re.search(r'[^"]\w+:', error_context):
                # Unquoted keys
                repaired = re.sub(r'(\w+):', r'"\1":', repaired)
            elif '"' in error_context and not re.search(r':\s*"', error_context):
                # Missing quotes around values
                repaired = re.sub(r':\s*([^",{\[\s][^,}\]]*?)([,}\]])', r': "\1"\2', repaired)
        
        elif "Extra data" in e.msg:
            # There's extra text after the JSON - find the end of the valid JSON
            # Find the last complete closing brace
            last_brace = json_string.rfind('}')
            if last_brace > 0:
                repaired = json_string[:last_brace + 1]
        
        elif "Unterminated string" in e.msg:
            # Look for unescaped quotes or missing closing quotes
            # This is trickier, but we can try to find and fix common patterns
            if '"' in json_string[error_pos:error_pos+10]:
                # Try to add missing closing quote
                repaired = json_string[:error_pos] + '"' + json_string[error_pos:]
        
        # Try parsing the repaired version
        try:
            json.loads(repaired)
            log_info("JSON repair successful!")
            return repaired
        except json.JSONDecodeError as e2:
            log_error(f"Repair failed. New error at position {e2.pos}: {e2.msg}")
            
            # If repair failed, try a more aggressive approach
            # Extract just the JSON part by finding the first { and last }
            first_brace = json_string.find('{')
            last_brace = json_string.rfind('}')
            
            if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                extracted = json_string[first_brace:last_brace + 1]
                try:
                    json.loads(extracted)
                    log_info("JSON extraction successful!")
                    return extracted
                except:
                    pass
            
            return json_string  # Return original if all else fails

async def update_scenario_running_flag(user_guid, running_status):
    """Update scenario_running flag in assistant_data"""
    try:
        import asyncio
        connection = await asyncio.to_thread(get_mysql_connection)
        if not connection:
            log_error("Database connection failed")
            return False

        cursor = await asyncio.to_thread(connection.cursor, dictionary=True)

        # Get existing assistant_data for existing user
        get_query = "SELECT assistant_data FROM assistant_users WHERE user_guid = %s"
        await asyncio.to_thread(cursor.execute, get_query, (user_guid,))
        existing_user = await asyncio.to_thread(cursor.fetchone)
        
        if not existing_user:
            # Create a new user record with the scenario_running flag
            assistant_data = {
                'scenario_running': running_status
            }
            
            insert_query = """
                INSERT INTO assistant_users (user_guid, assistant_guid, assistant_data, created_at, modified_at)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            await asyncio.to_thread(cursor.execute, insert_query, (user_guid, '', json.dumps(assistant_data)))
            
            if cursor.rowcount > 0:
                await asyncio.to_thread(connection.commit)
                return True
            else:
                log_error(f"Failed to create new user record for: {user_guid}")
                return False
        
        if existing_user and existing_user['assistant_data']:
            try:
                # Parse existing assistant_data
                assistant_data = json.loads(existing_user['assistant_data'])
            except (json.JSONDecodeError, TypeError):
                # If parsing fails, start with empty dict
                assistant_data = {}
        else:
            # No existing data, start with empty dict
            assistant_data = {}
        
        # Update scenario_running flag
        assistant_data['scenario_running'] = running_status
               
        # Update database
        update_query = """
            UPDATE assistant_users 
            SET assistant_data = %s, modified_at = CURRENT_TIMESTAMP
            WHERE user_guid = %s
        """
        await asyncio.to_thread(cursor.execute, update_query, (json.dumps(assistant_data), user_guid))
        
        if cursor.rowcount > 0:
            await asyncio.to_thread(connection.commit)
            return True
        else:
            log_error(f"Failed to update scenario_running flag for: {user_guid}")
            return False
            
    except Exception as e:
        log_error(f"Error updating scenario_running flag: {e}")
        return False
    finally:
        try:
            await asyncio.to_thread(cursor.close)
            await asyncio.to_thread(connection.close)
        except:
            pass

async def generate_scenario_title(user_inputs: list) -> str:
    """
    Generate a meaningful scenario title based on cumulated user inputs.
    Uses LLM to create a concise, descriptive title.
    """
    try:
        # Combine all user inputs into a single context
        combined_input = " ".join(user_inputs)
        
        # Create a simple prompt for title generation
        title_prompt = f"""
        Based on this caregiving scenario input, generate a concise, descriptive title (max 100 characters):
        
        Input: {combined_input}
        
        Return only the title text, no quotes, no additional text. Make it specific and meaningful.
        """
        
        # Use OpenAI for title generation (faster and more reliable than Gemini for this)
        openai_config = next((config for config in LLM_CONFIGS if config.get('provider', '').lower() == 'openai'), None)
        if not openai_config:
            # Fallback to a simple title
            return f"Care Planning Session - {datetime.now().strftime('%m/%d/%Y')}"
        
        import openai
        client = openai.OpenAI(api_key=openai_config['apikey'])
        
        response = client.chat.completions.create(
            model=openai_config['model'],
            messages=[{"role": "user", "content": title_prompt}],
            max_tokens=100,
            temperature=0.7
        )
        
        title = response.choices[0].message.content.strip()
        
        # Remove surrounding quotes if present
        if title.startswith('"') and title.endswith('"'):
            title = title[1:-1]
        elif title.startswith("'") and title.endswith("'"):
            title = title[1:-1]
        
        # Ensure title is not too long
        if len(title) > 100:
            title = title[:97] + "..."
        
        return title
        
    except Exception as e:
        log_error(f"Error generating scenario title: {e}")
        # Fallback to a simple title
        return f"Care Planning Session - {datetime.now().strftime('%m/%d/%Y')}"

async def save_recommendations_to_database(user_guid, recommendation_entry, is_new_scenario_group=False):
    """Save recommendation scenarios to assistant_data.recommendationHistory"""
    try:
        import asyncio
        connection = await asyncio.to_thread(get_mysql_connection)
        if not connection:
            log_error("Database connection failed")
            return False

        cursor = await asyncio.to_thread(connection.cursor, dictionary=True)

        # Handle case where no user_guid is provided (first recommendation)
        if not user_guid:
            # Create first scenario group
            scenario_group = {
                'scenario_group_id': str(uuid.uuid4()),
                'scenario_title': recommendation_entry.get('main_title', 'Care Planning Session'),
                'created_at': recommendation_entry.get('timestamp', datetime.utcnow().isoformat()),
                'scenarios': [recommendation_entry]
            }
            assistant_data = {
                'recommendationHistory': [scenario_group]
            }
            
            insert_query = """
                INSERT INTO assistant_users (assistant_guid, assistant_data, created_at, modified_at)
                VALUES (%s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            await asyncio.to_thread(cursor.execute, insert_query, ('', json.dumps(assistant_data)))
            
            if cursor.rowcount > 0:
                # Get the auto-generated user_guid
                try:
                    last_id = cursor.lastrowid
                    await asyncio.to_thread(cursor.execute, "SELECT user_guid FROM assistant_users WHERE user_id = %s", (last_id,))
                    result = await asyncio.to_thread(cursor.fetchone)
                    if result:
                        user_guid = result['user_guid']
                        await asyncio.to_thread(connection.commit)
                        return user_guid  # Return the generated user_guid
                    else:
                        raise Exception("Failed to retrieve user_guid")
                except Exception as db_error:
                    log_error(f"Database error getting user_guid: {db_error}")
                    return False
            else:
                log_error("Failed to create new user record")
                return False

        # Get existing assistant_data for existing user
        get_query = "SELECT assistant_data FROM assistant_users WHERE user_guid = %s"
        await asyncio.to_thread(cursor.execute, get_query, (user_guid,))
        existing_user = await asyncio.to_thread(cursor.fetchone)
        
        if not existing_user:
            # Create a new user record with the recommendation
            scenario_group = {
                'scenario_group_id': str(uuid.uuid4()),
                'scenario_title': recommendation_entry.get('main_title', 'Care Planning Session'),
                'created_at': recommendation_entry.get('timestamp', datetime.utcnow().isoformat()),
                'scenarios': [recommendation_entry]
            }
            assistant_data = {
                'recommendationHistory': [scenario_group]
            }
            
            insert_query = """
                INSERT INTO assistant_users (user_guid, assistant_guid, assistant_data, created_at, modified_at)
                VALUES (%s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
            await asyncio.to_thread(cursor.execute, insert_query, (user_guid, '', json.dumps(assistant_data)))
            
            if cursor.rowcount > 0:
                await asyncio.to_thread(connection.commit)
                return True
            else:
                log_error(f"Failed to create new user record for: {user_guid}")
                return False
        
        if existing_user and existing_user['assistant_data']:
            try:
                # Parse existing assistant_data
                assistant_data = json.loads(existing_user['assistant_data'])
            except (json.JSONDecodeError, TypeError):
                # If parsing fails, start with empty dict
                assistant_data = {}
        else:
            # No existing data, start with empty dict
            assistant_data = {}
        
        # Initialize recommendationHistory if it doesn't exist
        if 'recommendationHistory' not in assistant_data:
            assistant_data['recommendationHistory'] = []
        
        # Check if this is a new scenario group or adding to existing group
        if is_new_scenario_group or not assistant_data['recommendationHistory']:
            # Create new scenario group
            scenario_group = {
                'scenario_group_id': str(uuid.uuid4()),
                'scenario_title': recommendation_entry.get('main_title', 'Care Planning Session'),
                'created_at': recommendation_entry.get('timestamp', datetime.utcnow().isoformat()),
                'scenarios': [recommendation_entry]
            }
            assistant_data['recommendationHistory'].append(scenario_group)
        else:
            # Add to the most recent scenario group
            current_group = assistant_data['recommendationHistory'][-1]
            current_group['scenarios'].append(recommendation_entry)
            
            # Update scenario title based on all user inputs in this group
            user_inputs = [scenario.get('user_input', '') for scenario in current_group['scenarios']]
            user_inputs = [inp for inp in user_inputs if inp]  # Remove empty inputs
            
            if len(user_inputs) > 1:  # Only update title if there are multiple scenarios
                try:
                    new_title = await generate_scenario_title(user_inputs)
                    current_group['scenario_title'] = new_title
                    log_info(f"Updated scenario group title: {new_title}")
                except Exception as e:
                    log_error(f"Failed to update scenario title: {e}")
                    # Keep existing title if update fails
               
        # Update database
        update_query = """
            UPDATE assistant_users 
            SET assistant_data = %s, modified_at = CURRENT_TIMESTAMP
            WHERE user_guid = %s
        """
        await asyncio.to_thread(cursor.execute, update_query, (json.dumps(assistant_data), user_guid))
        
        if cursor.rowcount > 0:
            await asyncio.to_thread(connection.commit)
            
            # Verify what was actually saved
            verify_query = "SELECT assistant_data FROM assistant_users WHERE user_guid = %s"
            await asyncio.to_thread(cursor.execute, verify_query, (user_guid,))
            verify_result = await asyncio.to_thread(cursor.fetchone)
            if verify_result and verify_result['assistant_data']:
                try:
                    saved_data = json.loads(verify_result['assistant_data'])
                    if 'recommendationHistory' not in saved_data:
                        log_error("Verification failed - recommendationHistory not found in saved data!")
                except Exception as verify_error:
                    log_error(f"Verification failed - could not parse saved data: {verify_error}")
            
            return True
        else:
            log_error(f"No rows updated for user: {user_guid}")
            return False
            
    except Exception as e:
        log_error(f"Error saving recommendations to database: {e}")
        return False
    finally:
        if 'cursor' in locals():
            await asyncio.to_thread(cursor.close)
        if 'connection' in locals():
            await asyncio.to_thread(connection.close)

async def get_recommendation_history(user_guid):
    """Retrieve recommendation history from assistant_data.recommendationHistory"""
    try:
        import asyncio
        connection = await asyncio.to_thread(get_mysql_connection)
        if not connection:
            log_error("Database connection failed")
            return []
        
        cursor = await asyncio.to_thread(connection.cursor, dictionary=True)
        
        # Get assistant_data
        get_query = "SELECT assistant_data FROM assistant_users WHERE user_guid = %s"
        await asyncio.to_thread(cursor.execute, get_query, (user_guid,))
        existing_user = await asyncio.to_thread(cursor.fetchone)
        
        if existing_user and existing_user['assistant_data']:
            try:
                # Parse existing assistant_data
                assistant_data = json.loads(existing_user['assistant_data'])
                recommendation_history = assistant_data.get('recommendationHistory', [])
                return recommendation_history
            except (json.JSONDecodeError, TypeError):
                log_error(f"Error parsing assistant_data for user: {user_guid}")
                return []
        else:
            return []
            
    except Exception as e:
        log_error(f"Error retrieving recommendation history: {e}")
        return []
    finally:
        if 'cursor' in locals():
            await asyncio.to_thread(cursor.close)
        if 'connection' in locals():
            await asyncio.to_thread(connection.close)

async def compare_scenarios_with_gemini(outcomes, user_scenario):
    """Compare scenarios from different providers using Gemini and merge similar ones"""
    import time
    comparison_start_time = time.time()
    
    try:
        # Find Gemini config
        gemini_config = next((config for config in LLM_CONFIGS if config.get('provider', '').lower() == 'gemini'), None)
        if not gemini_config:
            log_error("No Gemini configuration found for scenario comparison")
            return outcomes
        
        # Configure Gemini
        genai.configure(api_key=gemini_config['apikey'])
        model = genai.GenerativeModel(gemini_config['model'])
        
        log_info(f"Starting scenario comparison with {gemini_config['model']}...")
        
        # Prepare scenarios for comparison
        providers = list(outcomes.keys())
        if len(providers) < 2:
            log_info("Only one provider available, skipping comparison")
            # Still ensure main_title is included in the response
            if providers and 'main_title' in outcomes[providers[0]]:
                # Handle analysis - could be string (old format) or object (new format)
                analysis = outcomes[providers[0]].get('analysis', {})
                if isinstance(analysis, str):
                    # Convert old string format to new object format
                    analysis = {
                        "summary": analysis,
                        "follow_up_question": "What additional information would help me better tailor this plan to your specific situation?"
                    }
                elif not isinstance(analysis, dict):
                    # Fallback if analysis is neither string nor dict
                    analysis = {
                        "summary": "Single provider result - no comparison needed",
                        "follow_up_question": "What additional information would help me better tailor this plan to your specific situation?"
                    }
                
                return {
                    "main_title": outcomes[providers[0]]['main_title'],
                    "merged_scenarios": outcomes[providers[0]]['scenarios'],
                    "analysis": analysis,
                    "original_providers": providers,
                    "total_original_scenarios": len(outcomes[providers[0]]['scenarios']),
                    "merged_scenarios_count": len(outcomes[providers[0]]['scenarios']),
                    "merging_criteria": {
                        "single_provider": "No comparison needed"
                    }
                }
            return outcomes
        
        # Create semantic analysis and merging prompt
        comparison_prompt = f"""
        You are an expert analyst comparing caregiving scenarios from different AI providers.
        
        IMPORTANT: Respond in the same language providers merged_scenarios, if it's in Spanish, respond in Spanish. If they're in French, respond in French. Match the language exactly.
        
        I have scenarios from {len(providers)} providers: {', '.join(providers)}
        
        Your task is to:
        1. Analyze semantic similarity between scenarios across providers
        2. Merge scenarios that have similar semantics (≥67% similarity for 3 providers, ≥50% for 2 providers)
        3. Only include scenarios that have good agreement across providers
        4. Create a consolidated outcome with the best merged scenarios

        CRITICAL JSON FORMATTING REQUIREMENTS:
        - Return ONLY a valid JSON object, nothing else
        - Do not include any text before or after the JSON
        - Do not use markdown code blocks (```json)
        - Ensure all strings are properly quoted with double quotes
        - Ensure all brackets and braces are properly closed
        - No trailing commas before closing brackets/braces
        - Escape any quotes within string values
        
        Return ONLY a **valid JSON object** that strictly follows this structure:        
        {{
            "merged_outcomes": {{
                "scenarios": [
                    {{
                        "title": "Merged scenario title",
                        "description": "Best merged description",
                        "considerations": [
                            "Merged consideration 1",
                            "Merged consideration 2"
                        ],
                        "action_steps": [
                            "Merged action step 1",
                            "Merged action step 2"
                        ],
                        "considerations_sources": ["source publisher: article title 1", "source publisher: article title 2", "source publisher: article title 3"],                        
                        "provider_agreement": {{
                            "providers_agreeing": ["provider1", "provider2"],
                            "agreement_percentage": 85,
                            "original_scenarios": [
                                {{
                                    "provider": "provider1",
                                    "title": "Original title",
                                    "description": "Original description"
                                }}
                            ]
                        }}
                    }}
                ],
                "analysis": {{
                    "summary": "Generate a brief explanation in a few sentences, up to 60 words, summarizing the overall recommendations related to the user scenario in a friendly and engaging tone. Do not mention providers or merging.",
                    "follow_up_question": "A single, clear question that encourages the user to continue the conversation and improves the caregiving plan. Make it specific to their situation and actionable."
                }}
            }}
        }}
        
        Guidelines for merging:
        - Only include scenarios where at least 2 providers have similar semantic content
        - For 3 providers: require ≥67% similarity (2+ providers agree)
        - For 2 providers: require ≥50% similarity (both providers agree)
        - Merge similar content by taking the best/most comprehensive version
        - Exclude scenarios that are too different across providers
        - Prioritize scenarios with higher agreement percentages
        - Give more concrete examples of action steps; give a specific tool, person, etc.
        - For considerations_sources: merge all unique publishers and article titles from the scenarios being merged. If multiple providers have the same publishers and article titles,
            include it only once. Combine all unique publishers and article titles from the merged scenarios into a single array.
        - IMPORTANT: For considerations_sources, STRICTLY use the format "Organization Name: Description" with a COLON (:) as the separator. DO NOT use hyphens (-), dashes (—), or any other characters as separators.

        Provider scenarios:
        """
        
        # Add each provider's scenarios to the prompt
        for provider in providers:
            provider_outcome = outcomes[provider]
            comparison_prompt += f"\n\n{provider.upper()} SCENARIOS:\n"
            for i, scenario in enumerate(provider_outcome['scenarios']):
                comparison_prompt += f"\nScenario {i+1}:\n"
                # Escape special characters that could break JSON parsing
                title = str(scenario.get('title', 'N/A')).replace('"', '\\"').replace('\n', ' ').replace('\r', ' ')
                description = str(scenario.get('description', 'N/A')).replace('"', '\\"').replace('\n', ' ').replace('\r', ' ')
                considerations = [str(item).replace('"', '\\"').replace('\n', ' ').replace('\r', ' ') for item in scenario.get('considerations', [])]
                action_steps = [str(item).replace('"', '\\"').replace('\n', ' ').replace('\r', ' ') for item in scenario.get('action_steps', [])]
                considerations_sources = [str(item).replace('"', '\\"').replace('\n', ' ').replace('\r', ' ') for item in scenario.get('considerations_sources', [])]

                comparison_prompt += f"Title: {title}\n"
                comparison_prompt += f"Description: {description}\n"
                comparison_prompt += f"Considerations: {considerations}\n"
                comparison_prompt += f"Action Steps: {action_steps}\n"
                if considerations_sources:
                    comparison_prompt += f"Considerations Sources: {considerations_sources}\n"    

        # Get comparison from Gemini (run in thread pool to avoid blocking)
        import asyncio
        response = await asyncio.to_thread(model.generate_content, comparison_prompt)
        content = response.text.strip()
        
        # Parse the comparison result
        try:
            # Extract JSON from markdown if present
            if '```json' in content:
                content = content.split('```json')[1].split('```')[0].strip()
            elif '```' in content:
                content = content.split('```')[1].strip()
            
            # Try to parse JSON, with smart repair if it fails
            try:
                comparison_result = json.loads(content)
            except json.JSONDecodeError as e:
                log_error(f"Initial JSON parse failed: {e.msg} at position {e.pos}")
                log_info("Attempting smart JSON repair...")
                
                # Use smart repair to fix the JSON
                repaired_content = smart_json_repair(content)
                comparison_result = json.loads(repaired_content)
            merged_outcomes = comparison_result.get('merged_outcomes', {})
            
            # Get main_title from the first provider (they should all be similar)
            main_title = ""
            for provider in providers:
                if 'main_title' in outcomes[provider]:
                    main_title = outcomes[provider]['main_title']
                    break
            
            # Extract analysis - handle both new object format and old string format for backward compatibility
            analysis = merged_outcomes.get('analysis', {})
            if isinstance(analysis, str):
                # Convert old string format to new object format
                analysis = {
                    "summary": analysis,
                    "follow_up_question": "What additional information would help me better tailor this plan to your specific situation?"
                }
            elif not isinstance(analysis, dict) or 'summary' not in analysis:
                # Fallback if analysis is missing or malformed
                analysis = {
                    "summary": "I've analyzed your situation and updated the plan. These scenarios are tailored to your specific caregiving situation and include actionable steps to help you make informed decisions.",
                    "follow_up_question": "What additional information would help me better tailor this plan to your specific situation?"
                }
            
            # Create a new consolidated outcome structure
            consolidated_outcomes = {
                "main_title": main_title,
                "merged_scenarios": merged_outcomes.get('scenarios', []),
                "analysis": analysis,
                "original_providers": providers,
                "total_original_scenarios": sum(len(outcomes[provider]['scenarios']) for provider in providers),
                "merged_scenarios_count": len(merged_outcomes.get('scenarios', [])),
                "merging_criteria": {
                    "min_agreement_3_providers": "67%",
                    "min_agreement_2_providers": "50%",
                    "semantic_similarity_threshold": "High"
                }
            }
            
            comparison_end_time = time.time()
            comparison_execution_time = comparison_end_time - comparison_start_time
            log_info(f"Successfully merged scenarios: {len(merged_outcomes.get('scenarios', []))} scenarios from {len(providers)} providers in {comparison_execution_time:.2f} seconds")
            analysis_summary = analysis.get('summary', '') if isinstance(analysis, dict) else str(analysis)
            log_info(f"Merging analysis: {analysis_summary[:100]}...")
            
            return consolidated_outcomes
            
        except json.JSONDecodeError as e:
            comparison_end_time = time.time()
            comparison_execution_time = comparison_end_time - comparison_start_time
            log_error(f"Failed to parse Gemini comparison response: {e} (took {comparison_execution_time:.2f} seconds)")
            log_large_json('error', 'Raw response', content, max_length=10000)
            # Raise exception instead of returning original outcomes
            raise Exception(f"Failed to parse Gemini comparison response: {e}")
            
    except Exception as e:
        comparison_end_time = time.time()
        comparison_execution_time = comparison_end_time - comparison_start_time
        log_error(f"Error in scenario comparison: {e} (took {comparison_execution_time:.2f} seconds)")
        # Raise exception instead of returning original outcomes
        raise Exception(f"Error in scenario comparison: {e}")

@router.post("/recommendations", response_model=RecommendationResponse)
async def get_recommendations(
    request: RecommendationRequest,
    user: str = Query(None, description="User GUID from URL parameter"),
    new_scenario_group: bool = Query(False, description="Start a new scenario group"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get caregiving recommendations based on user scenario
    """
    import time
    overall_start_time = time.time()
    
    try:
        # Step 1: Handle user_guid - use JWT token user_guid for transactions, URL user_guid only for viewing
        # Get the actual user_guid from JWT token for saving operations
        actual_user_guid = current_user.get('user_guid')

        # Set user_guid in context for automatic logging
        user_guid_context.set(actual_user_guid)

        log_info(f"DEBUG current_user payload: {current_user}")
        log_info(f"Received request - User GUID from URL: {user}")
        log_info(f"Request scenario: {request.scenario}")
        log_info(f"Starting overall recommendation generation process...")
        
        # Set scenario_running flag to 'yes' at the start of processing
        if actual_user_guid:
            await update_scenario_running_flag(actual_user_guid, 'yes')
            log_info(f"Set scenario_running flag to 'yes' for user: {actual_user_guid}")
        
        # Use URL user_guid only for loading chat history (viewing another user's data)
        view_user_guid = user if user and user != 'null' and user != '' else actual_user_guid
        
        if not actual_user_guid:
            log_info("No user_guid in JWT token, will generate one after recommendations are created")
            user_info = None
        else:
            # Get user info for the actual user (from JWT token)
            user_info = await get_user_by_guid(actual_user_guid)
            if not user_info:
                log_info(f"User not found: {actual_user_guid} - setting chat_history to blank")
                user_info = None
        
        if not user_info:
            log_info(f"Using blank chat history for user: {actual_user_guid}")

        # Step 2: Select relevant context scopes for this scenario (LLM routing call)
        dimensions = []
        log_info("Selecting relevant context scopes for scenario...")
        selected_scopes = await llm_service.select_relevant_scopes(request.scenario)

        # Step 3: Fetch user context signals from Redis
        from context.context_fetcher import fetch_context_for_user, format_context_for_prompt
        context_data = {"stories": [], "user_profile": None}
        if actual_user_guid:
            try:
                context_data = fetch_context_for_user(
                    actual_user_guid,
                    selected_scopes.get("scopes", []),
                    selected_scopes.get("domains", []),
                )
                story_count = len(context_data.get("stories", []))
                scope_count = sum(len(s.get("context_scopes", [])) for s in context_data.get("stories", []))
                log_info(f"Context fetched — {story_count} stories, {scope_count} scopes")
            except Exception as e:
                log_error(f"Context fetch failed: {e} — proceeding without context")

        # Step 4: Build user_profile with context signals injected
        user_profile = f"User ID: {actual_user_guid or 'Unknown'}"

        has_context = bool(context_data.get("stories") or context_data.get("user_profile"))
        if has_context:
            user_profile += f"\n\n{format_context_for_prompt(context_data)}"

        # Add profile information if provided
        if request.profile_info and request.profile_info.strip():
            user_profile += f"\n\nAdditional Profile Information:\n{request.profile_info.strip()}"
            log_info(f"Including user profile information in recommendation generation")
        else:
            log_info(f"No profile information provided")
        
        # if user_info and user_info.get('chat_history'):
        #     processed_chat = process_chat_history(user_info['chat_history'])
        #     if processed_chat:
        #         user_profile += f"\n\nChat History: {processed_chat}"
        # else:
        #     log_info(f"Using blank chat history for user profile")
        
        # Add previous recommendations to context
        # previous_recommendations = get_recommendation_history(user)
        # if previous_recommendations:
        #     user_profile += f"\n\nPrevious Recommendations History:"
        #     for i, rec in enumerate(previous_recommendations):
        #         user_profile += f"\n\nRecommendation Set {i+1} (from {rec.get('timestamp', 'unknown time')}):"
        #         for j, scenario in enumerate(rec.get('content', [])):
        #             user_profile += f"\n  Scenario {j+1}: {scenario.get('title', 'No title')}"
        #             user_profile += f"\n    Description: {scenario.get('description', 'No description')}"
        #             user_profile += f"\n    Key Considerations: {', '.join(scenario.get('considerations', [])[:3])}"  # First 3 considerations
        #             user_profile += f"\n    Key Actions: {', '.join(scenario.get('action_steps', [])[:3])}"  # First 3 actions
        
        outcomes = await llm_service.get_outcomes(request.scenario, dimensions, user_profile, request.latest_user_input)
        
        if not outcomes:
            raise HTTPException(status_code=500, detail="Failed to generate outcomes")
        
        # Step 4: Compare scenarios using Gemini with retry logic
        log_info("Starting scenario comparison with Gemini...")
        comparison_success = False
        max_retries = 3  # Original attempt + 2 retries
        
        for attempt in range(max_retries):
            try:
                if attempt > 0:
                    log_info(f"Retry attempt {attempt} for scenario comparison...")
                outcomes = await compare_scenarios_with_gemini(outcomes, request.scenario)
                comparison_success = True
                break
            except Exception as e:
                log_error(f"Error in compare_scenarios_with_gemini (attempt {attempt + 1}): {e}")
                if attempt == max_retries - 1:  # Last attempt failed
                    # Set scenario_running flag to 'no' when all comparison attempts fail
                    if actual_user_guid:
                        await update_scenario_running_flag(actual_user_guid, 'no')
                        log_info(f"Set scenario_running flag to 'no' for user: {actual_user_guid} (due to comparison error)")
                    # Return error state instead of original outcomes
                    return RecommendationResponse(
                        success=False,
                        message="Unable to generate recommendations at this time. Please try again later.",
                        outcomes=None,
                        dimensions_generated=dimensions,
                        user_guid=actual_user_guid
                    )
        
        # Log final outcome summary
        if outcomes and 'merged_scenarios' in outcomes:
            log_info(f"Final OUTCOME SUMMARY:")
            log_info(f"  Total merged scenarios: {len(outcomes['merged_scenarios'])}")
            log_info(f"  Original providers: {outcomes.get('original_providers', [])}")
            log_info(f"  Total original scenarios: {outcomes.get('total_original_scenarios', 0)}")
            log_info(f"  Merging criteria: {outcomes.get('merging_criteria', {})}")
            
            for i, scenario in enumerate(outcomes['merged_scenarios']):
                log_info(f"  Final Scenario {i+1}: {scenario.get('title', 'No title')}")
                log_info(f"    Description: {scenario.get('description', 'No description')[:100]}...")
                log_info(f"    Considerations: {len(scenario.get('considerations', []))} items")
                log_info(f"    Action Steps: {len(scenario.get('action_steps', []))} items")
                log_info(f"    Considerations Sources: {len(scenario.get('considerations_sources', []))} items")                
                if scenario.get('provider_agreement'):
                    log_info(f"    Provider Agreement: {scenario['provider_agreement'].get('agreement_percentage', 0)}%")
        else:
            log_info("No merged scenarios in final outcome")
        
        # Step 5: Save recommendations to assistant_data
        log_info("Saving recommendations to assistant_data...")
        save_start_time = time.time()
        
        try:
            # Prepare recommendation data for saving
            recommendation_entry = {
                "timestamp": datetime.utcnow().isoformat(),
                "user_input": request.scenario,
                "main_title": outcomes.get('main_title', '') if outcomes else '',
                "content": []
            }
            
            # Extract scenarios from outcomes
            if outcomes and 'merged_scenarios' in outcomes:
                for scenario in outcomes['merged_scenarios']:
                    scenario_data = {
                        "title": scenario.get('title', ''),
                        "description": scenario.get('description', ''),
                        "considerations": scenario.get('considerations', []),
                        "action_steps": scenario.get('action_steps', []),
                        "considerations_sources": scenario.get('considerations_sources', [])
                    }
                    recommendation_entry["content"].append(scenario_data)
            else:
                log_info("No merged scenarios to save")
            
            # Save to database using actual_user_guid from JWT token
            if recommendation_entry["content"]:
                # If no actual_user_guid from JWT token, generate one by creating a user record
                if not actual_user_guid:
                    actual_user_guid = await save_recommendations_to_database(None, recommendation_entry, new_scenario_group)
                    if actual_user_guid:
                        save_end_time = time.time()
                        save_execution_time = save_end_time - save_start_time
                    else:
                        log_error("Failed to create new user record")
                else:
                    save_success = await save_recommendations_to_database(actual_user_guid, recommendation_entry, new_scenario_group)
                    if save_success:
                        save_end_time = time.time()
                        save_execution_time = save_end_time - save_start_time
                    else:
                        log_error("Failed to save recommendations to database")
                
        except Exception as save_error:
            log_error(f"Error saving recommendations: {save_error}")
            # Set scenario_running flag to 'no' even if saving fails
            if actual_user_guid:
                await update_scenario_running_flag(actual_user_guid, 'no')
                log_info(f"Set scenario_running flag to 'no' for user: {actual_user_guid} (due to save error)")
        
        overall_end_time = time.time()
        overall_execution_time = overall_end_time - overall_start_time
        log_info(f"RECOMMENDATION GENERATION COMPLETE - Total execution time: {overall_execution_time:.2f} seconds")
        
        # Set scenario_running flag to 'no' when processing is complete
        if actual_user_guid:
            await update_scenario_running_flag(actual_user_guid, 'no')
            log_info(f"Set scenario_running flag to 'no' for user: {actual_user_guid}")
        
        return RecommendationResponse(
            success=True,
            message="Outcomes generated successfully",
            outcomes=outcomes,
            dimensions_generated=dimensions,
            user_guid=actual_user_guid  # Include the actual user_guid from JWT token
        )
        
    except HTTPException:
        raise
    except Exception as e:
        overall_end_time = time.time()
        overall_execution_time = overall_end_time - overall_start_time
        log_error(f"Error in get_recommendations: {e} (took {overall_execution_time:.2f} seconds)")
        
        # Set scenario_running flag to 'no' when processing fails
        if actual_user_guid:
            await update_scenario_running_flag(actual_user_guid, 'no')
            log_info(f"Set scenario_running flag to 'no' for user: {actual_user_guid} (due to error)")
        
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/recommendations/history/{user_guid}")
async def get_recommendation_history_endpoint(
    user_guid: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get recommendation history for a user
    """
    try:
        # Get recommendation history
        history = await get_recommendation_history(user_guid)
        
        return {
            "success": True,
            "message": f"Retrieved {len(history)} recommendation entries",
            "user_guid": user_guid,
            "recommendation_history": history,
            "total_entries": len(history)
        }
        
    except Exception as e:
        log_error(f"Error retrieving recommendation history: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve recommendation history: {str(e)}")

@router.post("/recommendations/start-new-group")
async def start_new_scenario_group(
    user_guid: str = Query(..., description="User GUID"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Start a new scenario group - called when user clicks the '+' button"""
    try:
        # This endpoint just returns success - the actual grouping happens
        # when the next recommendation is saved with is_new_scenario_group=True
        log_info(f"New scenario group requested for user: {user_guid}")
        return {"success": True, "message": "New scenario group ready"}
    except Exception as e:
        log_error(f"Error starting new scenario group: {e}")
        return {"success": False, "message": "Failed to start new scenario group"}

@router.get("/scenario-status/{user_guid}")
async def get_scenario_status(
    user_guid: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get scenario_running status for a user
    """
    try:
        import asyncio
        connection = await asyncio.to_thread(get_mysql_connection)
        if not connection:
            log_error("Database connection failed")
            raise HTTPException(status_code=500, detail="Database connection failed")

        cursor = await asyncio.to_thread(connection.cursor, dictionary=True)

        # Get scenario_running flag from assistant_data
        query = "SELECT assistant_data FROM assistant_users WHERE user_guid = %s"
        await asyncio.to_thread(cursor.execute, query, (user_guid,))
        user_data = await asyncio.to_thread(cursor.fetchone)
        
        await asyncio.to_thread(cursor.close)
        await asyncio.to_thread(connection.close)
        
        if not user_data or not user_data['assistant_data']:
            return {
                "success": True,
                "user_guid": user_guid,
                "scenario_running": "no"
            }
        
        try:
            assistant_data = json.loads(user_data['assistant_data'])
            scenario_running = assistant_data.get('scenario_running', 'no')
        except (json.JSONDecodeError, TypeError):
            scenario_running = 'no'
        
        return {
            "success": True,
            "user_guid": user_guid,
            "scenario_running": scenario_running
        }
        
    except Exception as e:
        log_error(f"Error retrieving scenario status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve scenario status: {str(e)}")
