from fastapi import APIRouter, HTTPException, Depends
from models.request_models import ConversationRequest
from models.response_models import ConversationResponse
from services.llm_service import LLMService
from middleware.rejara_auth_middleware import get_current_user
from core.logger import log_info, log_error, log_large_json
import json
import re
from typing import Dict, Any

router = APIRouter()

# Initialize LLM service
llm_service = LLMService()

@router.post("/conversation", response_model=ConversationResponse)
async def handle_conversation(
    request: ConversationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Handle general conversation and classify if user wants scenario generation
    """
    try:
        # Clean chat history by removing timestamps
        cleaned_history = []
        for message in request.chat_history:
            if 'bot' in message:
                content = message['bot']
                # Remove timestamp if present (format: "content [timestamp]")
                content = re.sub(r'\s*\[\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)?\]\s*$', '', content)
                cleaned_history.append({"bot": content})
            elif 'user' in message:
                content = message['user']
                # Remove timestamp if present
                content = re.sub(r'\s*\[\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)?\]\s*$', '', content)
                cleaned_history.append({"user": content})
        
        # Create conversation context
        conversation_context = ""
        for message in cleaned_history:
            if 'bot' in message:
                conversation_context += f"Assistant: {message['bot']}\n"
            elif 'user' in message:
                conversation_context += f"User: {message['user']}\n"
        
        # Create classification prompt
        classification_prompt = f"""
You are a conversation classifier for a caregiving planning system. Your job is to:

1. Analyze the conversation history and the latest user input
2. Determine if the user is requesting scenario generation or just asking general questions
3. Provide a helpful response to the user's input

Conversation History:
{conversation_context}

Latest User Input: {request.user_input}

Classification Rules:
- If the user is asking for specific caregiving advice, recommendations, or scenario analysis → classify as "scenario_generation"
- If the user is asking general questions, seeking information, or just chatting → classify as "general_conversation"

Respond in this JSON format:
{{
    "classificationType": "scenario_generation" or "general_conversation",
    "response": "Your helpful response to the user's input.  For 'general_conversation', include relevant information 
    from the conversation history that pertains the current user input. Additionally, always include a follow up suggestion 
    related to the context history and prompt the user to continue the conversation in the form of a question.",
    "response_title": "A short 6-8 words that starts with 'Preparing recommendations for <summary of the user scenario>...'",
    "reasoning": "Brief explanation of why you classified it this way"
}}

Examples:
- "My grandma fell and I'm worried about her living alone" → scenario_generation
- "What is caregiving?" → general_conversation
- "I need help deciding between assisted living and home care" → scenario_generation
- "How are you today?" → general_conversation
"""

        # Get OpenAI config for classification
        openai_config = next((config for config in llm_service.llm_configs if config.get('provider', '').lower() == 'openai'), None)
        if not openai_config:
            raise HTTPException(status_code=500, detail="OpenAI configuration not found")
        
        import openai
        client = openai.OpenAI(api_key=openai_config['apikey'])
        
        # Get classification response
        response = client.chat.completions.create(
            model=openai_config['model'],
            messages=[
                {"role": "system", "content": "You are a conversation classifier for a caregiving planning system. Always respond with valid JSON."},
                {"role": "user", "content": classification_prompt}
            ],
            temperature=0.3,
            max_tokens=500
        )
        
        content = response.choices[0].message.content.strip()
        log_info(f"Classification response: {content}")
        
        # Parse the response
        try:
            # Extract JSON from markdown if present
            clean_content = llm_service.extract_json_from_markdown(content)
            parsed_response = json.loads(clean_content)
            
            classification_type = parsed_response.get('classificationType', 'general_conversation')
            bot_response = parsed_response.get('response', 'I understand your question. How can I help you with your caregiving situation?')
            response_title = parsed_response.get('response_title', None)
            reasoning = parsed_response.get('reasoning', 'Unable to determine classification')
            
            return ConversationResponse(
                success=True,
                classification_type=classification_type,
                response=bot_response,
                response_title=response_title,
                reasoning=reasoning
            )
            
        except json.JSONDecodeError as e:
            log_error(f"JSON parse error: {e}")
            log_large_json('error', 'Raw response', content, max_length=5000)
            # Fallback response
            return ConversationResponse(
                success=True,
                classification_type="general_conversation",
                response="I understand your question. How can I help you with your caregiving situation?",
                response_title=None,
                reasoning="Failed to parse classification response"
            )
            
    except Exception as e:
        log_error(f"Error in conversation endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}") 