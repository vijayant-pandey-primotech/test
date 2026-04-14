import openai
import google.generativeai as genai
import anthropic
import groq
import re
from core.config import LLM_CONFIGS
from core.logger import log_info, log_error, log_large_json

class LLMService:
    def __init__(self):
        """Initialize LLM service with configurations"""
        self.llm_configs = LLM_CONFIGS
    
    def extract_json_from_markdown(self, content):
        """Extract JSON from markdown code blocks"""
        # Remove markdown code block markers
        content = re.sub(r'^```json\s*', '', content, flags=re.MULTILINE)
        content = re.sub(r'^```\s*', '', content, flags=re.MULTILINE)
        content = re.sub(r'\s*```$', '', content, flags=re.MULTILINE)
        
        # Clean up any remaining whitespace
        content = content.strip()
        
        return content
    
    async def select_relevant_scopes(self, scenario: str) -> dict:
        """
        Given a scenario, ask an LLM to pick which context scopes/domains are relevant.

        Reads available scope names and their domains from Redis (context:config).
        Uses GPT-4o-mini for speed — this is a lightweight routing/classification call.

        Returns:
            { "scopes": [...], "domains": [...] }
            Falls back to { "scopes": [], "domains": [] } on any error (non-fatal).
        """
        import asyncio
        import json as json_module

        empty = {"scopes": [], "domains": []}

        try:
            from context.redis_client import get_redis
            redis = get_redis()
            config_raw = redis.get("context:config")
            if not config_raw:
                log_error("Context config not in Redis — skipping scope selection")
                return empty

            config = json_module.loads(config_raw)
            scope_lines = []
            for scope in config.get("context_scopes", []):
                domains = ", ".join(scope.get("domains", []))
                scope_lines.append(f"- {scope['scope_name']} (domains: {domains})")
            all_domains = config.get("domains", [])
            scopes_summary = "\n".join(scope_lines)

        except Exception as e:
            log_error(f"Failed to load scope list from Redis: {e}")
            return empty

        openai_config = next(
            (c for c in self.llm_configs if c.get("provider", "").lower() == "openai"), None
        )
        if not openai_config:
            log_error("No OpenAI config found for scope selection")
            return empty

        prompt = f"""You are a context routing assistant for a caregiving planning system.

Given the user scenario below, select the most relevant context scopes and/or domains that contain signals useful for generating personalized recommendations.

Available domains: {", ".join(all_domains)}

Available scopes:
{scopes_summary}

User Scenario:
{scenario}

Rules:
- Prefer domains over individual scopes when multiple scopes from the same domain apply.
- Only include scopes/domains that are directly relevant to the scenario.
- Do not include scopes that are clearly unrelated.

Respond ONLY with valid JSON in this exact format:
{{"scopes": ["scope name 1", "scope name 2"], "domains": ["Domain1", "Domain2"]}}"""

        try:
            client = openai.OpenAI(api_key=openai_config["apikey"])
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=openai_config["model"],
                messages=[
                    {"role": "system", "content": "You are a context routing assistant. Return only valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=300,
            )
            content = self.extract_json_from_markdown(response.choices[0].message.content.strip())
            result = json_module.loads(content)
            if isinstance(result, dict) and "scopes" in result and "domains" in result:
                log_info(f"Context scope selection: scopes={result['scopes']}, domains={result['domains']}")
                return result
            return empty

        except Exception as e:
            log_error(f"Scope selection LLM call failed: {e}")
            return empty

    async def generate_dimensions(self, scenario_text):
        """Generate dimensions using GPT-4o-mini"""
        import time
        start_time = time.time()
        
        try:
            # Find OpenAI config
            openai_config = next((config for config in self.llm_configs if config.get('provider', '').lower() == 'openai'), None)
            if not openai_config:
                log_error("No OpenAI configuration found")
                return None
            
            client = openai.OpenAI(api_key=openai_config['apikey'])
            
            prompt = f"""
            Analyze this caregiving scenario and extract 5-8 key dimensions that would be relevant for providing recommendations:
            
            Scenario: {scenario_text}
            
            Return ONLY a JSON array of dimension strings, like:
            ["emotional support", "practical assistance", "medical coordination", "financial planning", "respite care"]
            
            Focus on dimensions that would help structure caregiving recommendations.
            """
            
            log_info(f"Starting dimensions generation with {openai_config['model']}...")
            import asyncio
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=openai_config['model'],
                messages=[
                    {"role": "system", "content": "You are a caregiving expert who extracts relevant dimensions from scenarios."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=200
            )
            
            end_time = time.time()
            execution_time = end_time - start_time
            log_info(f"Dimensions generation completed in {execution_time:.2f} seconds")
            
            content = response.choices[0].message.content.strip()
            
            # Parse JSON response
            import json
            try:
                # Extract JSON from markdown code blocks if present
                clean_content = self.extract_json_from_markdown(content)
                
                dimensions = json.loads(clean_content)
                if isinstance(dimensions, list):
                    log_info(f"Generated {len(dimensions)} dimensions: {dimensions}")
                    return dimensions
                else:
                    log_error("Response is not a list")
                    return None
            except json.JSONDecodeError:
                log_error(f"Failed to parse JSON response: {content}")
                return None
                
        except Exception as e:
            log_error(f"Error generating dimensions: {e}")
            return []
    
    async def get_outcomes(self, user_scenario, dimensions, user_profile, latest_user_input=None):
        """Get outcomes from multiple LLM providers"""
        # we will need the prompt to be dynamically fetched from the database
        outcomes = {}
        
        # Create prompt once
        prompt = f"""        
        User Profile: {user_profile}
        Scenario: {user_scenario}
        Latest User Input: {latest_user_input}
        
        You are an expert advisor tasked with helping users make informed decisions based on their real-world situations in the realm of caregiving. 

        Recommendations must focus mainly on the latest user input while still considering the user profile and relevant questions 
        from the user scenario to generate deeper insights. 
        For example, if the user has been discussing their parent's dementia, then switched to discussing about
        financial planning, then the recommendations should only focus on the financial planning questions with focus on the latest user input.

        **IMPORTANT**: Recommendations must focus mainly on the latest user input while still considering the user profile and relevant questions from the user scenario.

        Your job is to:
        1. Extract key facts and characteristics from the user scenario relevant to the last user input
        2. Extract specific user from user scenario; e.g., mother, father, spouse, etc.
        3. Identify the relevant decision being considered
        4. Compare the three options based on:
        - Specific factors mentioned in the user scenario relevant to the last user input.
        - Any available user or subject profile attributes in User Profile (e.g., dementia severity, medical conditions, family support, income).
        5. Evaluate each option separately by:
        - Summarizing the situation relevant to that option.
        - Listing concrete reasons why that scenario may be appropriate (use bullet points).
        - Suggesting clear, actionable next steps for that scenario.
        - Include a few examples of specific tools, persons, organizations, companies, etc that can be used to implement the action steps.
        6. in the "considerations" section, add inference to other considerations; e.g., financials, costs, statistics, etc.
        7. Do not address the user as "the user" or "user"; instead, address them as "you" or "your"
        8. Generate a 2-3 words main title for the user scenario; e.g., "Financial Planning", "Medical Coordination", "Emotional Support", etc.
        9. Output in the language of the language of the scenario; e.g., if the scenario is in Spanish, output in Spanish.

        Respond in this **JSON format**:

        ```json
        {{
            "analysis": "Generate a brief explanation in a few sentences, up to 60 words, summarizing the recommendations and incorporating the user scenario for context.",
            "main_title": "Main Title",
            "scenarios": [
                {{
                    "title": "Scenario A",
                    "description": "Summary of the Situation",
                    "considerations": ["Reason 1", "Reason 2", "Reason 3"],
                    "action_steps": ["Step 1", "Step 2", "Step 3"]
                    "considerations_sources": ["source publisher: article title 1", "source publisher: article title 2", "source publisher: article title 3"]
                    "questions": "Include only questions used for the recommendations from the user input in a single string, separated by a pipe symbol |"
                }},
                {{
                    "title": "Scenario B",
                    "description": "Summary of the Situation",
                    "considerations": ["Reason 1", "Reason 2", "Reason 3"],
                    "action_steps": ["Step 1", "Step 2", "Step 3"]
                    "considerations_sources": ["source publisher: article title 1", "source publisher: article title 2", "source publisher: article title 3"]
                    "questions": "Include only questions used for the recommendations from the user input in a single string, separated by a pipe symbol |"
                }},
                {{
                    "title": "Scenario C",
                    "description": "Summary of the Situation",
                    "considerations": ["Reason 1", "Reason 2", "Reason 3"],
                    "action_steps": ["Step 1", "Step 2", "Step 3"]
                    "considerations_sources": ["source publisher: article title 1", "source publisher: article title 2", "source publisher: article title 3"]
                    "questions": "Include only questions used for the recommendations from the user input in a single string, separated by a pipe symbol |"
                }}
            ]
        }}    
        ```

        **IMPORTANT FORMATTING NOTES:**
        - Both "considerations" and "action_steps" should be arrays of strings (bullet points)
        - Do NOT use numbered lists for action_steps - use bullet points like considerations
        - Each item in both arrays should be a complete, actionable statement
        - Action steps should be specific, concrete, and immediately actionable
        - For "considerations_sources": STRICTLY use the format "Organization Name: Description" with a COLON (:) as the separator
        - DO NOT use hyphens (-), dashes (—), or any other characters as separators in considerations_sources
        - ONLY use a colon (:) to separate the organization name from the description
        """

        # log_info(f"\n=== PROMPT ===")
        # log_info(prompt)
        # log_info(f"=== END PROMPT ===\n")
        log_info(f"Total dimensions: {len(dimensions)}, Using first 20 for prompt")
        
        for i, config in enumerate(self.llm_configs):
            import time
            provider_start_time = time.time()
            
            try:
                provider = config.get('provider', '').lower()
                model = config.get('model', '')
                api_key = config.get('apikey', '')
                
                log_info(f"Starting {provider} ({model}) - Config {i+1}/{len(self.llm_configs)}")
                
                # Create client based on provider
                try:
                    log_info(f"Creating {provider} client...")
                    
                    if provider == 'xopenai': #skipping openai for now
                        client = openai.OpenAI(api_key=api_key)
                    elif provider == 'gemini':
                        genai.configure(api_key=api_key)
                        client = genai
                    elif provider == 'claude':
                        client = anthropic.Anthropic(api_key=api_key)
                    elif provider == 'groq':
                        client = groq.Groq(api_key=api_key)
                    else:
                        log_info(f"Provider {provider} not yet supported, skipping...")
                        continue
                        
                except Exception as e:
                    log_error(f"Error creating {provider} client: {e}")
                    continue
                
                # Handle different provider APIs
                import asyncio
                if provider == 'openai':
                    response = await asyncio.to_thread(
                        client.chat.completions.create,
                        model=model,
                        messages=[
                            {"role": "system", "content": "You are a compassionate caregiving expert with deep knowledge of eldercare and family dynamics."},
                            {"role": "user", "content": prompt}
                        ],
                        temperature=0.7,
                        max_tokens=1500
                    )
                    content = response.choices[0].message.content.strip()
                
                elif provider == 'gemini':
                    model_obj = client.GenerativeModel(model)
                    generation_config = {
                        'max_output_tokens': 65535
                    }
                    response = await asyncio.to_thread(
                        model_obj.generate_content,
                        prompt,
                        generation_config=generation_config
                    )
                    content = response.text.strip()
                
                elif provider == 'claude':
                    response = await asyncio.to_thread(
                        client.messages.create,
                        model=model,
                        max_tokens=1500,
                        temperature=0.7,
                        system="You are a compassionate caregiving expert with deep knowledge of eldercare and family dynamics.",
                        messages=[
                            {"role": "user", "content": prompt}
                        ]
                    )
                    content = response.content[0].text.strip()
                
                elif provider == 'groq':
                    response = await asyncio.to_thread(
                        client.chat.completions.create,
                        model=model,
                        messages=[
                            {"role": "system", "content": "You are a compassionate caregiving expert with deep knowledge of eldercare and family dynamics."},
                            {"role": "user", "content": prompt}
                        ],
                        temperature=0.7,
                        max_tokens=1500
                    )
                    content = response.choices[0].message.content.strip()
                
                # Parse response
                try:
                    import json
                    
                    # Extract JSON from markdown code blocks if present
                    clean_content = self.extract_json_from_markdown(content)
                    
                    parsed_response = json.loads(clean_content)
                    
                    if 'scenarios' in parsed_response:
                        outcomes[provider] = {
                            'model': model,
                            'scenarios': parsed_response['scenarios'],
                            'main_title': parsed_response.get('main_title', ''),
                            "analysis": parsed_response.get('analysis', '')
                        }
                        provider_end_time = time.time()
                        provider_execution_time = provider_end_time - provider_start_time
                        log_info(f"{provider} response parsed successfully in {provider_execution_time:.2f} seconds")
                        log_info(f"{provider} output - {len(parsed_response['scenarios'])} scenarios:")
                        for i, scenario in enumerate(parsed_response['scenarios']):
                            log_info(f"  Scenario {i+1}: {scenario.get('title', 'No title')}")
                            log_info(f"    Description: {scenario.get('description', 'No description')[:100]}...")
                            log_info(f"    Considerations: {len(scenario.get('considerations', []))} items")
                            log_info(f"    Action Steps: {len(scenario.get('action_steps', []))} items")
                            log_info(f"    Considerations Sources: {len(scenario.get('considerations_sources', []))} items")
                            log_info(f"    Analysis: {parsed_response.get('analysis', 'No analysis')}")
                            log_info(f"    Questions: {scenario.get('questions', 'No questions')}")
                    else:
                        provider_end_time = time.time()
                        provider_execution_time = provider_end_time - provider_start_time
                        log_error(f"{provider} response missing 'scenarios' key (took {provider_execution_time:.2f} seconds)")
                        
                except json.JSONDecodeError as e:
                    provider_end_time = time.time()
                    provider_execution_time = provider_end_time - provider_start_time
                    log_error(f"{provider} JSON parse error: {e} (took {provider_execution_time:.2f} seconds)")
                    log_large_json('error', f'{provider} Raw response', content, max_length=2000)
                    log_large_json('error', f'{provider} Cleaned content', clean_content, max_length=2000)
                    
            except Exception as e:
                provider_end_time = time.time()
                provider_execution_time = provider_end_time - provider_start_time
                log_error(f"Error with {provider}: {e} (took {provider_execution_time:.2f} seconds)")
                continue
        
        return outcomes if outcomes else None 