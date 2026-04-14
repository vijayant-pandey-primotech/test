"""
Question Personalization Service
Transforms static admin panel questions into personalized, empathetic questions
using Redis data (care receivers, pets, autos) and conversation history.
"""

import os
import json
import re
from typing import Dict, List, Optional, Any
import groq
from src.utils.prompt_functions import clean_llm_json_response
from src.services.assistant_context_service import (
    get_conversation_as_text_from_optimized,
    get_conversation_as_text_from_personal_optimized,
)


class QuestionPersonalizationService:
    """
    Service for personalizing questions using user-specific data and conversation history.
    
    This service transforms generic questions into personalized, empathetic questions
    by incorporating care receiver names, pet names, auto names, and conversation context.
    """
    
    def __init__(
        self,
        max_conversation_messages: int = 10,
        enable_personalization: bool = True,
        llm_model: str = "llama-3.3-70b-versatile",
        llm_temperature: float = 0.2
    ):
        """
        Initialize the Question Personalization Service.

        Args:
            max_conversation_messages: Maximum number of conversation messages to include (default: 10)
            enable_personalization: Feature flag to enable/disable personalization (default: True)
            llm_model: LLM model to use for personalization (default: "llama-3.3-70b-versatile")
            llm_temperature: Temperature for LLM generation (default: 0.2)
        """
        self.max_conversation_messages = max_conversation_messages
        self.enable_personalization = enable_personalization
        self.llm_model = llm_model
        self.llm_temperature = llm_temperature
        self.groq_client = groq.Client(api_key=os.getenv("GROQ_API_KEY"))
    
    def personalize_question(
        self,
        original_question: str,
        dynamic_function_data: Optional[Dict[str, Any]] = None,
        user_id: Optional[int] = None,
        assistant_id: Optional[str] = None,
        chapter_id: Optional[str] = None,
        conversation_history: Optional[str] = None,
        story_type: Optional[str] = None,
        question_node: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Personalize a question using user-specific data and conversation history.
        Args:
            original_question: The original static question from admin panel
            dynamic_function_data: Dictionary containing personalized data with result array
            user_id: User unique identifier for retrieving conversation history
            assistant_id: Assistant identifier for retrieving conversation history
            conversation_history: Optional pre-fetched conversation history (if None, will fetch from Redis)
            story_type: Optional story type/category (e.g., "care_receivers", "pets", "autos", "realestate")
        Returns:
            Personalized question string, or original question if personalization fails
        """
        # Feature flag check
        if not self.enable_personalization:
            return original_question
        
        # Validate inputs
        if not original_question or not original_question.strip():
            return original_question
        
        if story_type.lower() == 'personal' or question_node.get("story", "").lower() == 'personal':
            return original_question
        try:
            # Extract personalized data from dynamicFunctionData
            personalized_data = self._extract_personalized_data(dynamic_function_data, story_type)

            # If no personalized data available, return original question
            if not personalized_data or not any(personalized_data.values()):
                # getting personalized_data for non dynamic
                personalized_data = self._extract_personalized_data_for_non_dynamic(
                    story_type=story_type,
                    question_node=question_node
                )
            # Get conversation history if not provided
            if conversation_history is None and user_id and (assistant_id or chapter_id):
                conversation_history = self._get_conversation_context(
                    user_id=user_id,
                    assistant_id=assistant_id,
                    chapter_id=chapter_id
                )

            # Build LLM prompt
            prompt = self._build_personalization_prompt(
                original_question=original_question,
                personalized_data=personalized_data,
                conversation_history=conversation_history or ""
            )

            # Call LLM for personalization
            personalized_question = self._call_llm_for_personalization(prompt)
            print(json.dumps({
                "log_type": "personalize_question",
                "original_question": original_question,
                "personalized_question": personalized_question,
                "personalized_data": personalized_data,
                "conversation_history": conversation_history
            }), flush=True)            

            # Validate and return personalized question
            if personalized_question and personalized_question.strip():
                # Check for hallucinated placeholder names - if found, return original question
                hallucinated_placeholders = ["[NAME_A]", "[NAME_B]", "[NAME_C]", "[NAME_D]", "[NAME_E]", "[NAME_F]", "[NAME_G]", "[PET_A]", "[PET_B]"]
                question_lower = personalized_question.lower()
                if any(placeholder.lower() in question_lower for placeholder in hallucinated_placeholders):
                    print(json.dumps({
                        "log_type": "personalization_hallucination_detected",
                        "reason": "placeholder_names_found",
                        "original_question": original_question[:100] if original_question else None,
                        "hallucinated_response": personalized_question[:200] if personalized_question else None,
                        "user_id": user_id,
                        "assistant_id": assistant_id
                    }), flush=True)
                    return original_question

                # Remove any brackets around actual names (LLM sometimes mimics bracket format)
                # e.g., "[House]" -> "House", "[Villa]" -> "Villa"
                personalized_question = re.sub(r'\[([^\]]+)\]', r'\1', personalized_question)

                # Validate that at least one actual provided name appears in the output
                # This catches cases where LLM uses completely different names
                all_provided_names = []
                for names_list in personalized_data.values():
                    all_provided_names.extend(names_list)

                if all_provided_names:
                    # Check if at least one provided name appears in the personalized question
                    name_found = any(name.lower() in question_lower for name in all_provided_names)
                    if not name_found:
                        print(json.dumps({
                            "log_type": "personalization_hallucination_detected",
                            "reason": "no_provided_names_found",
                            "original_question": original_question[:100] if original_question else None,
                            "hallucinated_response": personalized_question[:200] if personalized_question else None,
                            "provided_names": all_provided_names,
                            "user_id": user_id,
                            "assistant_id": assistant_id
                        }), flush=True)
                        return original_question

                return personalized_question.strip()
            else:
                return original_question
                
        except Exception as e:
            # Log error but don't break the flow - return original question
            print(json.dumps({
                "log_type": "question_personalization_error",
                "error": str(e),
                "error_type": type(e).__name__,
                "original_question": original_question[:100] if original_question else None,
                "user_id": user_id,
                "assistant_id": assistant_id
            }))
            return original_question
    
    def _extract_personalized_data(
        self,
        dynamic_function_data: Optional[Dict[str, Any]],
        story_type: Optional[str] = None
    ) -> Dict[str, List[str]]:
        """
        Extract personalized data dynamically grouped by story type from dynamicFunctionData.
        
        Args:
            dynamic_function_data: Dictionary containing dynamic function data with result array
            story_type: Optional story type/category from question object (e.g., "care_receivers", "pets", "autos", "realestate")
        Returns:
            Dictionary with keys as story types and values as lists of names: {story_type: [name1, name2, ...]}
        """
        # Dynamic dictionary that groups names by story type
        result = {}
        
        if not dynamic_function_data:
            return result
        
        try:
            # Extract result array from dynamicFunctionData
            result_list = dynamic_function_data.get("result", [])
            
            if not isinstance(result_list, list):
                return result
            
            # Extract storyName from each item in result
            for item in result_list:
                if isinstance(item, dict):
                    story_name = item.get("storyName")
                    if story_name and isinstance(story_name, str):
                        story_name = story_name.strip()
                        
                        # Determine story type for this item:
                        # 1. Check if item has its own story/storyType field
                        # 2. Fall back to provided story_type parameter
                        # 3. Fall back to default "items" if nothing available
                        item_story_type = (
                            item.get("story") or 
                            item.get("storyType") or 
                            story_type or 
                            "items"
                        )
                        
                        # Normalize story type (lowercase, replace spaces with underscores)
                        item_story_type = item_story_type.lower().strip().replace(" ", "_")
                        
                        # Initialize list for this story type if it doesn't exist
                        if item_story_type not in result:
                            result[item_story_type] = []
                        
                        # Add story name to the appropriate category
                        result[item_story_type].append(story_name)
            
            # Remove duplicates while preserving order for each category
            for category in result:
                result[category] = list(dict.fromkeys(result[category]))
            
        except Exception as e:
            print(json.dumps({
                "log_type": "extract_personalized_data_error",
                "error": str(e),
                "error_type": type(e).__name__
            }))
        
        return result
        
    #this function will fetch personal_data for non_dyanmic
    def _extract_personalized_data_for_non_dynamic(
        self,
        story_type: Optional[str] = None,
        question_node: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, List[str]]:
            

        result: Dict[str, List[str]] = {}

        if not question_node:
            return result

        try:
            story_name = question_node.get("storyName")

            if story_name and isinstance(story_name, str):
                story_name = story_name.strip()

                # Determine final story type
                final_story_type = (
                    story_type
                    or question_node.get("story")
                    or question_node.get("storyType")
                    or "items"
                )

                # Normalize story type (same pattern as your dynamic version)
                final_story_type = final_story_type.lower().strip().replace(" ", "_")

                # for personal story type, we don't want to inject the user name into the question
                # for example, it becomes awkward, if the user is John Doe and the question rephrases to "Does John Doe have a will?"
                # for now, we will hard code to check for final_story_type to skip "personal"
                # in the future, we will update the Admin panel to include a flag where a question does NOT require personalization
                if final_story_type.lower() != "personal":
                    result[final_story_type] = [story_name]

        except Exception as e:
            print(json.dumps({
                "log_type": "extract_personalized_data_non_dynamic_error",
                "error": str(e),
                "error_type": type(e).__name__
            }))
        return result

    def _get_conversation_context(
        self,
        user_id: int,
        assistant_id: Optional[str] = None,
        chapter_id: Optional[str] = None
    ) -> str:
        """
        Retrieve conversation history from Redis optimized context (v2).
        - Cluster mode: uses (user_id, assistant_id)
        - Personal mode: uses (user_id, chapter_id)

        Args:
            user_id: User unique identifier
            assistant_id: Assistant identifier (cluster mode)
            chapter_id: Chapter identifier (personal mode)

        Returns:
            Formatted conversation history as text string
        """
        try:
            if chapter_id:
                conversation_text = get_conversation_as_text_from_personal_optimized(
                    user_id=user_id,
                    chapter_id=chapter_id,
                    max_exchanges=self.max_conversation_messages
                )
            elif assistant_id:
                conversation_text = get_conversation_as_text_from_optimized(
                    user_id=user_id,
                    assistant_id=assistant_id,
                    max_exchanges=self.max_conversation_messages
                )
            else:
                conversation_text = ""
            return conversation_text or ""
        except Exception as e:
            print(json.dumps({
                "log_type": "get_conversation_context_error",
                "error": str(e),
                "error_type": type(e).__name__,
                "user_id": user_id,
                "assistant_id": assistant_id,
                "chapter_id": chapter_id
            }))
            return ""
    
    def _build_personalization_prompt(
        self,
        original_question: str,
        personalized_data: Dict[str, List[str]],
        conversation_history: str
    ) -> str:
        """
        Build the LLM prompt for personalizing the question.

        Args:
            original_question: The original static question
            personalized_data: Dictionary with story types as keys and lists of names as values
            conversation_history: Formatted conversation history

        Returns:
            Complete prompt string for LLM
        """
        # Dynamically build names context from any categories with entity type hints
        names_context = []
        entity_type_hints = []

        for story_type, names in personalized_data.items():
            if names:  # Only include non-empty lists
                # Format story type nicely (e.g., "care_receivers" -> "Care receivers", "realestate" -> "Realestate")
                formatted_type = story_type.replace("_", " ").title()
                names_context.append(f"{formatted_type}: {', '.join(names)}")

                # Add entity type hints to help LLM understand semantic context
                # IMPORTANT: hints must ONLY clarify what the names represent — they must NOT
                # cause the LLM to rewrite the question structure or inject new terms.
                if story_type in ["pets", "pet"]:
                    entity_type_hints.append(f"- {', '.join(names)} are PETS (animals), not people. ONLY for questions asking about opinions, thoughts, preferences, or decisions, the OWNER/USER should be the subject who thinks/decides ABOUT the pet. For all other questions (factual: phone numbers, names, addresses, providers, etc.), simply insert the pet names without rewriting the question.")
                elif story_type in ["autos", "auto", "vehicles", "vehicle"]:
                    entity_type_hints.append(f"- {', '.join(names)} are VEHICLES (cars/autos), not people. Simply insert these names where the original question references \"your vehicle\" or similar. Do NOT rewrite the question to be about vehicle mechanics or automotive concepts.")
                elif story_type in ["realestate", "real_estate", "property", "properties"]:
                    entity_type_hints.append(f"- {', '.join(names)} are PROPERTIES (real estate), not people. Simply insert these names where the original question references \"your property\" or similar. Do NOT rewrite the question to add real estate terminology or change the question's meaning.")


        names_text = "\n".join(names_context) if names_context else "No specific names available"

        # Build entity type hints section (helps LLM understand semantic context)
        # Entity type hints are derived from story_type in personalized_data
        entity_hints_section = ""
        if entity_type_hints:
            entity_hints_section = f"""
                ENTITY TYPE CONTEXT (IMPORTANT):
                {chr(10).join(entity_type_hints)}
            """

        # Build conversation context section
        conversation_section = ""
        if conversation_history and conversation_history.strip():
            conversation_section = f"""
            CONVERSATION HISTORY:
            {conversation_history}
        """

        prompt = f"""
            Original question: {original_question}
            Personalized data: {names_text}
            Conversation history: {conversation_section}

            Objective: Create a personalized question based on the original question and the personalized data.

            Rules:
            - Personalize data contains the entity type; mainly human vs non-human
                Examples: Human: care receiver, care recipient, dependent, except
                        Non-human: pet, autos, real estate, etc.
            - All names mentioned in the personalized data should be included in the personalized question, when applicable
            - Include information from the conversation history if it is relevant to the personalized question
            - The personalized question must maintain the original question's intent
            PERSONALIZED DATA:
            {names_text}
            GUIDELINES:
            **CRITICAL**: 
            - Use ONLY names from the PERSONALIZED DATA section above. Do NOT use any names mentioned in the conversation history as 
                subjects or objects of the question. Conversation history is for context and tone only—never as a source of entity names.
            - If PERSONALIZED DATA shows no specific names or entities, return the original question unchanged. 
                Do NOT introduce any subjects, roles, or entities not present in the PERSONALIZED DATA.
            - Use strict subject-verb agreement for inserted names across all story types: one name -> singular grammar ("does/has/is"), two or more names -> plural grammar ("do/have/are").

            - Before writing the personalized question, complete these steps internally:
                STEP 1 - Identify the entity type from PERSONALIZED DATA (e.g., "Autos", "Pet", "Real Estate")
                STEP 2 - Find the matching noun in the original question that refers to that entity type
                        (e.g., "Autos" matches "vehicle", "Pet" matches "pet/dog/cat", "Real Estate" matches "home/property")
                STEP 3 - The named entities ARE that noun. Replace the noun with the names directly.
                        Never make the names the *owner* of the noun they represent.

            Examples:
            1. Original: Does the care receiver have a hair stylist? 
            Personalized Data: Care Receivers: Zonin, Zackary
            Personalied Question: Do Zonin or Zackary have a hair stylist?

            2. Original: How often does the care receiver have an oil change for their vehicles? 
            Personalized Data: Autos: Nissan Altima, Toyota Tercel
            Personalied Question: How often does the care receiver have an oil change for the Nissan Altima and Toyota Tercel?

            3. Original: Where is the location of the closing documents?
            Personalized Data: Real Estate: Main Home, Charles Street Rental
            Personalied Question: Where is the location of the closing documents for the Main Home and Charles Street Rental?   
            
            Output: return only the personalized question, do not include any comments, reasoning, or explanations.
            Personalized question:
            """

        prompt_old = f"""You are a compassionate assistant that transforms generic questions into personalized, empathetic questions by incorporating specific names and context from the conversation.

            TASK:
            Transform the following generic question into a personalized, empathetic question using the provided names and conversation history.

            ORIGINAL QUESTION:
            {original_question}

            PERSONALIZED DATA:
            {names_text}
            {entity_hints_section}{conversation_section}
            GUIDELINES:
            1. **CRITICAL**: You MUST include ALL names provided in the personalized data - never use only a subset or partial list
            2. **CRITICAL**: Use ONLY names from the PERSONALIZED DATA section above. Do NOT use any names mentioned in the conversation history as subjects or objects of the question. Conversation history is for context and tone only—never as a source of entity names.
            3. Replace generic terms like "your care receiver", "your dependent", "your pet", etc. with ALL the specific names from PERSONALIZED DATA only
            4. Use natural, conversational language that feels empathetic and personal. You may use conversation history to inform tone or phrasing, but never to pull in names.
            5. Maintain the core meaning and intent of the original question
            6. Keep the question concise and clear
            7. Use proper grammar and natural phrasing
            8. When listing multiple names, use "or" (not "and") to indicate that the question applies to ANY of the individuals, unless the original question specifically requires collective action
            9. For 2 names: use "X or Y"
            10. For 3+ names: use "X, Y, Z, or W" (commas with "or" before the last name)

            EXAMPLES (Note: These use placeholder names for illustration - NEVER use these example names in your output):

            Example 1:
            Original: "Does your care receiver have a will?"
            Personalized Data: Care receivers: [NAME_A], [NAME_B]
            Personalized: "Does [NAME_A] or [NAME_B] have a will?"
            Note: Use "or" to indicate either/any person, not requiring all

            Example 2:
            Original: "Which pet has financial provisions made in a trust by their care receiver(s)?"
            Personalized Data: Care receivers: [NAME_A], [NAME_B] | Pets: [PET_A], [PET_B]
            Personalized: "Have [NAME_A] and [NAME_B] made financial provisions in a trust for [PET_A] and [PET_B]?"

            Example 3:
            Original: "Does your care receiver need help with daily activities?"
            Personalized Data: Care receivers: [NAME_A]
            Conversation History: User mentioned [NAME_A] prefers morning routines
            Personalized: "Does [NAME_A] need help with daily activities, particularly with her morning routines?"

            Example 3a:
            Original: "Please provide additional details needed when cleaning your care receiver's file cabinets."
            Personalized Data: Care receivers: [NAME_A, NAME_B, NAME_C]
            Conversation History: User previously indicated that these care receivers require assistance with cleaning their file cabinets.
            Personalized: "What additional details are needed when cleaning [NAME_A], [NAME_B], or [NAME_C]'s file cabinets?"

            Example 4 (IMPORTANT - Multiple names):
            Original: "Does the care receiver have a Passport and/or other Citizenship papers?"
            Personalized Data: Care receivers: [NAME_A], [NAME_B], [NAME_C], [NAME_D], [NAME_E], [NAME_F], [NAME_G]
            Personalized: "Do [NAME_A], [NAME_B], [NAME_C], [NAME_D], [NAME_E], [NAME_F], or [NAME_G] have a Passport and/or other Citizenship papers?"

            Example 5 (IMPORTANT - Pet questions with opinions/thoughts):
            Original: "How important does your care receiver think pet insurance is for managing unexpected medical expenses?"
            Personalized Data: Care receivers: [NAME_A], [NAME_B] | Pets: [PET_A]
            Entity Type Context: [PET_A] is a PET (animal), not a person
            WRONG: "How important does [PET_A] think pet insurance is?" (pets cannot think/have opinions)
            CORRECT: "How important does [NAME_A] or [NAME_B] think pet insurance is for [PET_A] to manage unexpected medical expenses?"
            Note: For pets, questions about opinions/thoughts/preferences should ask the care receiver about the pet, not the pet itself.

            Example 6 (Pet factual questions):
            Original: "Does your pet have a microchip?"
            Personalized Data: Pets: [PET_A], [PET_B]
            Personalized: "Does [PET_A] or [PET_B] have a microchip?"
            Note: Factual questions about pets (has X, needs Y) can directly reference the pet.

            CRITICAL RULES:
            - **NEVER USE SQUARE BRACKETS** in your output - the brackets in examples above are ONLY to indicate placeholders
            - **NEVER USE EXAMPLE PLACEHOLDER NAMES** like [NAME_A], [NAME_B], John, Jane, Sarah, etc. in your output
            - You MUST ONLY use the EXACT names provided in the PERSONALIZED DATA section above, WITHOUT any brackets. Do NOT use names from the conversation history—only from PERSONALIZED DATA.
            - Output names as plain text: "House" NOT "[House]", "Villa" NOT "[Villa]"
            - If no names are provided in PERSONALIZED DATA, return the original question unchanged
            - Return ONLY the personalized question, no explanations or additional text
            - You MUST use ALL names from the personalized data - using only a subset is INCORRECT
            - If the question doesn't naturally fit with names, return a slightly personalized version that feels more empathetic
            - Maintain question format (ending with "?")
            - Do not add any prefixes, suffixes, or markdown formatting
            - **CRITICAL - PRESERVE QUESTION MEANING**: You may rephrase for natural flow and empathy, and you must insert the provided names, but the MEANING and INTENT of the original question MUST stay the same.
            * If the original asks for a "phone number", the personalized question must still ask for a "phone number" — not "how phone calls are handled"
            * If the original asks for a "name", the personalized question must still ask for a "name"
            * Do NOT introduce new concepts, topics, or terminology that were not in the original question (e.g., do NOT add "finances", "real estate", "mechanics" etc. from entity type context)
            * Do NOT change WHAT is being asked — only change HOW it is phrased and WHO it references
            * Example: "What is the phone number of the lawn service?" with Properties: Villa, House, Apartment
                GOOD: "What is the phone number of the lawn service for Villa, House, or Apartment?" ✓
                GOOD: "Could you share the lawn service phone number for Villa, House, or Apartment?" ✓
                BAD:  "How does Villa handle phone calls related to lawn service finances in real estate?" ✗ (meaning changed)

            Now transform this question:
            {original_question}

            Personalized question:"""
        
        return prompt
    
    def _call_llm_for_personalization(self, prompt: str) -> str:
        """
        Call LLM to personalize the question.
        
        Args:
            prompt: Complete prompt string for LLM
            
        Returns:
            Personalized question string
        """
        try:
            completion = self.groq_client.chat.completions.create(
                model=self.llm_model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                temperature=self.llm_temperature,
                max_tokens=200  # Questions should be concise
            )
            
            personalized_question = completion.choices[0].message.content.strip()
            
            # Clean up response (remove any markdown or extra formatting)
            personalized_question = clean_llm_json_response(personalized_question)

            return personalized_question
            
        except Exception as e:
            print(json.dumps({
                "log_type": "llm_personalization_error",
                "error": str(e),
                "error_type": type(e).__name__,
                "model": self.llm_model
            }))
            raise

    def personalize_single_question(
        self,
        question_text: str,
        dynamic_function_data: Optional[Dict[str, Any]] = None,
        user_id: Optional[int] = None,
        assistant_id: Optional[str] = None,
        chapter_id: Optional[str] = None,
        story_type: Optional[str] = None,
        question_node: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Personalize a single question on-demand (for policy questions).
        This is more efficient than personalizing all questions upfront.

        Args:
            question_text: The question text to personalize
            dynamic_function_data: Dynamic function data for personalization
            user_id: User ID for conversation history
            assistant_id: Assistant ID for conversation history
            story_type: Story type for personalization context

        Returns:
            Personalized question string, or original if personalization fails/disabled
        """
        # Feature flag check
        if not self.enable_personalization:
            return question_text

        if not question_text or not question_text.strip():
            return question_text

        try:
            personalized = self.personalize_question(
                original_question=question_text,
                dynamic_function_data=dynamic_function_data,
                user_id=user_id,
                assistant_id=assistant_id,
                chapter_id=chapter_id,
                story_type=story_type,
                question_node=question_node
            )
            return personalized if personalized and personalized.strip() else question_text
        except Exception as e:
            print(json.dumps({
                "log_type": "single_question_personalization_error",
                "error": str(e),
                "error_type": type(e).__name__,
                "question": question_text[:100] if question_text else None
            }))
            return question_text

    def personalize_policy_questions(
        self,
        question_obj: Dict[str, Any],
        dynamic_function_data: Optional[Dict[str, Any]] = None,
        user_id: Optional[int] = None,
        assistant_id: Optional[str] = None,
        story_type: Optional[str] = None
        ) -> None:
            """
            DEPRECATED: This method personalizes ALL policy questions at once, wasting LLM cycles.
            Use personalize_single_question() instead for on-demand personalization.

            Personalize all policy questions in the policiesQuestion array.

            Args:
                question_obj: Question object containing policiesQuestion array
                dynamic_function_data: Dynamic function data for personalization
                user_id: User ID for conversation history
                assistant_id: Assistant ID for conversation history
                story_type: Story type for personalization context
            """
            # Feature flag check
            if not self.enable_personalization:
                return

            try:
                policies_question = question_obj.get("policiesQuestion", [])
                if not policies_question or not isinstance(policies_question, list):
                    return

                # Personalize each policy question
                for policy_obj in policies_question:
                    if not isinstance(policy_obj, dict):
                        continue

                    # For re-personalization, use originalQuestion template if available
                    # Otherwise fall back to current question (first-time personalization)
                    original_policy_question = policy_obj.get("question")
                    if not original_policy_question or not original_policy_question.strip():
                        continue

                    try:
                        personalized_policy_question = self.personalize_question(
                            original_question=original_policy_question,
                            dynamic_function_data=dynamic_function_data,
                            user_id=user_id,
                            assistant_id=assistant_id,
                            story_type=story_type
                        )

                        # Update the policy question with personalized version
                        if personalized_policy_question and personalized_policy_question.strip():
                            original = original_policy_question
                            personalized = personalized_policy_question.strip()
                            # Preserve original template question ONLY if not already set (first time personalization)
                            if "question" not in policy_obj:
                                policy_obj["question"] = original
                            policy_obj["question"] = personalized

                    except Exception as e:
                        # Log error but continue with other policy questions
                        print(json.dumps({
                            "log_type": "policy_question_personalization_error",
                            "error": str(e),
                            "error_type": type(e).__name__,
                            "policy_question": original_policy_question[:100] if original_policy_question else None
                        }))
                        # Continue with original question if personalization fails
                        continue

            except Exception as e:
                # Log error but don't break the flow
                print(json.dumps({
                    "log_type": "personalize_policy_questions_error",
                    "error": str(e),
                    "error_type": type(e).__name__
                }))