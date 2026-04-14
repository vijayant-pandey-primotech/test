import os
import re
import json 
from openai import OpenAI
from datetime import datetime
from pydantic import BaseModel
from dotenv import load_dotenv
import groq
from pydantic_core.core_schema import none_schema

load_dotenv()

# Validate required environment variables
def _validate_env_var(var: str):
    """
    Validates that a required environment variable is set.
    Raises an EnvironmentError with a clear message if not set.
    """
    if not os.environ.get(var):
        raise EnvironmentError(
            f"❌ Required environment variable '{var}' is not set.\n"
            f"Please set it in your deployment configuration or .env file.\n"
            f"For Cloud Run: gcloud run services update SERVICE_NAME --update-env-vars {var}=YOUR_VALUE\n"
            f"For Docker: Add -e {var}=YOUR_VALUE to docker run command\n"
            f"For local development: Add {var}=YOUR_VALUE to your .env file"
        )

_validate_env_var("OPENAI_API_KEY")


client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def clean_llm_json_response(raw_response: str) -> str:
    """
    Clean LLM JSON responses by removing markdown code fences.

    Handles formats like:
    - ```json\n{...}\n```
    - ```{...}```
    - {... } (already clean)

    Args:
        raw_response: Raw response string from LLM

    Returns:
        Cleaned JSON string ready for parsing
    """
    cleaned = raw_response.strip()
    cleaned = cleaned.replace("```json", "").replace("```", "")
    return cleaned.strip()


def logprobs_to_dict(logprobs) -> dict | None:
    """
    Convert OpenAI ChoiceLogprobs object to a JSON-serializable dictionary.
    
    Args:
        logprobs: ChoiceLogprobs object from OpenAI API response
        
    Returns:
        Dictionary representation of logprobs, or None if logprobs is None
    """
    if logprobs is None:
        return None
    
    # Try Pydantic v2 method first, then v1, then fallback to string
    if hasattr(logprobs, 'model_dump'):
        return logprobs.model_dump()
    elif hasattr(logprobs, 'dict'):
        return logprobs.dict()
    else:
        # Fallback: convert to string representation
        return str(logprobs)


class Bool_Response(BaseModel):
    output: bool


class validator_response(BaseModel):
    output: str
    reason: str
    reply: str    


class generate_question_output(BaseModel):
    response: str


class Response(BaseModel):
    output: str
    reason: str   


class policy_validator_response(BaseModel):
    output: bool


class query_resolver_mod(BaseModel):
    response: str


class generate_policy_question_data_model(BaseModel):
    response: str

class MultiDependentResponse(BaseModel):
    responses: dict[str, str]
    
# Function to load the JSON data from the file
def safe_json_load(data):
        try:
            return json.loads(data) if data else {}
        except (TypeError, json.JSONDecodeError):
            return {}      
     

# Function to preprocess the input string
def preprocess_features(input_str):
    """
    Preprocesses the input string by replacing underscores with spaces
    and converting each word to title case.

    Args:
        input_str (str): The string to preprocess.

    Returns:
        str: The preprocessed string.
    """
    # Defensive check: handle None or empty input
    if input_str is None:
        return ""
    if not isinstance(input_str, str):
        input_str = str(input_str)
    if not input_str.strip():
        return input_str
    
    # Replace underscores with spaces
    input_str = input_str.replace('_', ' ')
    sentences = re.split(r'([.,!?]\s*)', input_str)

    # Capitalize first letter of the string (safely handle empty strings)
    # REMOVING THIS DIRECTIVE!  Causes inappropriate capitalization
    # sentences = [s[0].upper() + s[1:] if s and len(s) > 0 else s for s in sentences]
    return ''.join(sentences)


# Function to extract the boolean value from the human response
def boolean_extraction(bot_question, human_response):
    """
    Extract data from the human response based on the context of the bot's question.

    Args:
        bot_question (str): The question asked by the bot.
        human_response (str): The input text provided by the user.

    Returns:
        bool: True if positive, False if negative.
    """
    prompt = f"""
    You are an intelligent agent that determines whether an input is positive or negative based on the given question.
    - If the response expresses agreement, confirmation, or a positive sentiment, return `True`.
    - If the response contains negation (e.g., 'never', 'not', 'haven't', 'no'), return `False`.
    - If uncertain, return `False`.

    Examples:
    - Bot: "Have you ever been divorced?"  
      Human: "I have never been divorced." 
      output : False \n  

    - Bot: "Are you currently divorced?"  
      Human: "Yes, I got divorced last year." → True  
    
    Bot's Question: {bot_question}
    Human Response: {human_response}
    """

    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": human_response}
            ],
            response_format=Bool_Response
        )

        parsed_message = completion.choices[0].message.parsed

        return parsed_message.output  # Returns True or False directly
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"OpenAI API Error in validate_boolean_response: {error_type} - {error_msg}")
        return False  # Default to False on error
    

# Validate the response based on the policy
def validate_user_response(question: str, answer: str, caregiver_name: str | None = None) -> dict:
    """
    Classifies a user response into one of: 'yes', 'no', 'skip', 'question', or 'error'
    based on real-world language and intent.
 
    Parameters:
        question (str): The question asked.
        answer (str): The human response.
 
    Returns:
        dict: A structured response (e.g., {"result": "yes", "location": "drawer", "reason": "Location provided"})
    """
    question = question.strip()
    profile_line = f'The profile answering is "{caregiver_name}". ' if caregiver_name else "User"

    prompt = f"""
    You are an AI assistant validating human responses during a Q&A session.
    {profile_line}The person answering is always the PROFILE (first person: "I", "me", "my") etc.
    The question subject (e.g., "your care receiver", a named person like "Bala", a pet, a vehicle, or a property)
    is a SEPARATE entity that the Profile is responsible for.

    Your job is to classify the Profile's answer to a question into one of these five categories:

    - "yes" → The user affirmatively answered the question or provided a meaningful response or location.
    - "no" → The user clearly denied or rejected the premise of the question.
    - "skip" → The user avoided answering, deflected, or chose not to respond.
    - "question" → The user responded with a question instead of an answer or user is unclear about the asked question.
    - "error" → The response is unclear, gibberish, random, or irrelevant to the question.

    Apply these detailed rules:

    **1. QUESTION**
    - If the response contains a follow-up or clarifying question (e.g., "What do you mean?", "Can you explain?", "Why are you asking?", "What is that?", "get me some ideas", "give me examples"), classify it as "question".
    - This takes precedence over "yes", "no", or "skip" classifications, even if the response includes affirmative or negative words like "yes" or "no".
    - Example: "No, but why do you need this?" should be classified as "question" because it includes a follow-up question.
    - Exception: If the question appears rhetorical and the primary intent is to affirm or deny (e.g., "Yes, isn't that obvious?"), prioritize "yes" or "no".

    **2. YES**
    - The user says "Yes", "Yeah", "I do", "I have", or similar affirmatives.
    - The response contains an affirmative answer but may contain negative answer that is not relevant to the question.
    - The response is a meaningful statement related to the question, even if not explicitly "yes".
    - It must be for the present
    - **CRITICAL FOR YES/NO QUESTIONS**: For questions asking "Does X have Y?" or "Do you have X?" or similar yes/no questions:
        * ANY response that starts with "Yes", "Yeah", "I do", "I have" should be classified as "yes", EVEN IF it includes additional information, names, or mentions missing details
        * Examples that should be "yes":
            - Q: "Does this dependent have a primary care doctor?" A: "Yes, Mitchel is the name of the doctor but I don't have his number" → "yes"
            - Q: "Do you have insurance?" A: "Yes, I have Blue Cross but I don't have the policy number" → "yes"
            - Q: "Does she attend school?" A: "Yes, she goes to Lincoln Elementary" → "yes"
        * Additional context, names, or missing information does NOT make it "error" - if it affirms the question, it's "yes"
    - **PROFILE CONTEXT FOR ASSISTANCE QUESTIONS**:
        * For questions that ask whether a care receiver/entity needs assistance, help, or support
          (e.g., "Does Bala need assistance with meal planning?", "Does your care receiver need help with bathing?",
          "Does this pet/vehicle/property need assistance with X?"):
            - If the profile responds with first-person actions done FOR the other entity
              (e.g., "I cook and serve her meals", "I prepare the meals", "I bathe him", "I handle the bills",
              "I drive him to appointments"), you MUST treat this as the entity REQUIRING and RECEIVING assistance.
              This is a valid, meaningful answer and should be classified as "yes" / "answered", NOT as "no help needed".
            - Do NOT assume independence when the profile describes doing the task themselves.
    - **IMPORTANT - TIME PERIOD EXPRESSIONS**: If the question asks about days, time periods, supply duration, frequency, or "how often/how long",
        then time period expressions are VALID answers and should be classified as "yes":
        * "weekly", "monthly", "for a month", "for a week", "twice a day", "daily", "3 months", "a year", etc. are all VALID
        * These expressions answer the question even if not in exact "days" format
        * Example: Q: "How many days of supply is prescribed?" A: "for a month" → classify as "yes" (valid answer)
        * Example: Q: "How often do you take this?" A: "twice a day" → classify as "yes" (valid answer)
    - Conditional affirmatives like "sometimes", "occasionally", "at times" are valid "yes" answers — they confirm the condition exists at least partially.
    - If the answer is an affirmative "yes" but does not provide the information requested, return "Error"; 
        e.g., if the question is "How many cars do you have?", the answer is "Yes, I have the information for that" 
        but does not provide the specific information requested, return "Error".
        **EXCEPTION**: This error rule does NOT apply to yes/no questions (questions asking "Does X have Y?" or "Do you have X?") - for those, "yes" with any context is valid.
    - **IMPORTANT - PARTIAL BUT RELEVANT ANSWERS**: For open-ended questions that ask for details, instructions, descriptions, or plans
        (e.g., "What care instructions should be provided?", "Describe the daily routine", "What arrangements have been made?"):
        * ANY response that is relevant and on-topic should be classified as "yes", even if it only addresses one aspect of the question
        * A partial but meaningful answer is still a valid answer — do NOT classify it as "error" just because it doesn't cover everything
        * Example: Q: "What permanent care instructions should be provided for Jojo?" A: "He needs to take his medications on time" → classify as "yes" (valid partial answer about medication)
        * Example: Q: "What daily routine does your care receiver follow?" A: "She eats breakfast at 8am" → classify as "yes" (valid partial answer about routine)
        * Only classify as "error" if the response is truly irrelevant, gibberish, or nonsensical

    **3. NO**
    - The user says "No", "I don't", "I do not", "I haven't", or clearly denies having or doing something asked in the question.
    - Make sure it's a true denial, not part of a deflection like "No comment".
    - If the answer contains both a "yes" and "no", return "No" if it's for the present

    **4. SKIP**
    - The user avoids answering by saying things like:
    - "No comment", "Not available", "Not sure", "I prefer not to answer", "I'd rather not say", "I don't want to share", "Skip this", "I'll answer later"
    - These are not true "no" answers — they indicate unwillingness or refusal to answer.

    **5. ERROR**
    - The response is nonsensical, off-topic, or doesn't make logical sense.
    - Examples include:
    - Gibberish: "asdfgh", "###", "...."
    - Completely unrelated answers like "banana" to a financial question.
    - Empty or very short answers with no meaning (e.g., just emojis, punctuation).

    - Using the context of the question and the user's answer, provide a short sentence reply to the user.
        - For correct answers:
            - If the question is sensitive or concerning, respond with acknowledgement and/or sympathy only, in a calm and respectful tone.
            Do not use any wording that implies positivity, approval, celebration, happiness, or benefit
            (e.g., avoid phrases like "good to know", "great to see", "happy to hear").
            - If the situation is neutral or positive, respond with acknowledgement, encouragement, or praise in a conversational tone.
        - For "no" answers: Use "Your response indicates that you have NOT..." or "Your response indicates that you have not.." - do not contradict the user's denial.
        - For questions, reply with a one paragraph explanation to the user question, do not ask for follow up and don't always start with "That's a great question..."
        - For errors, politely explain why in a gentle, energetic, high-spirited and conversational tone but do not ask for follow up, make any suggestion or add comments; and don't always start with "It seems...".

    **Always output a strict JSON object like this:**
    {{ "result": "yes", "reply":"reply", "reason":"reason" }} or {{ "result": "no", "reply":"reply", "reason":"reason" }}, etc.

    ** If the response includes a multiple user response then extract the relevant information for each user and return every response**
     **Examples**
     - Question: "Do you have an estate plan?"
       Answer: "Kevin=No, Loren=No, Sam=Yes, Frank=No"
        → This should be classified as "yes" because Sam answered "yes"

     - Question: "Where is the house key located?"
       Answer: "Susan is stored in the glove compartment while Jon and Jane are stored under the rug"
       → This should be classified as "yes" because it provides specific storage locations for each dependent

    Only return one of: "yes", "no", "skip", "question", or "error".

    **Question:** {question}
    **Answer:** {answer}
    """
 
    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": prompt}],
            response_format={"type": "json_object"}
        )

        # Clean response - remove markdown code fences if present
        raw_content = clean_llm_json_response(completion.choices[0].message.content)
        response_data = json.loads(raw_content)  

        print(json.dumps({
            "log_type": "validate_user_response",
            "question": question,
            "answer": answer,
            "response_data": response_data
        }), flush=True)

        try:
            result = response_data["result"]
            reply = response_data.get("reply", "No reply provided")  # Extract the reply field with fallback
            if result.lower() == "yes":
                result = "answered"
            return validator_response(output=result, reason="validated from GPT", reply=reply)
        except:
            return validator_response(output="error", reason="Invalid GPT response", reply="Unable to process response")
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"OpenAI API Error in validate_user_response: {error_type} - {error_msg}")
        
        # Return a graceful fallback response
        return validator_response(
            output="error", 
            reason=f"Service temporarily unavailable: {error_type}", 
            reply="I'm experiencing technical difficulties. Please try again in a moment."
        )


# Generate the question based on the topic and context
def generate_question(question_topics, context) -> str:
    """
    Generate the question based on question topics and context 

    question_topics : question topic about which major of the question will be asked by bot
    context : Context what is the topic 
    """
    prompt = f"""
    "You are a conversational assistant and trying to collect the information from the user. 
    Your task is to generate one  question based on the topic provided and use context also to generate relavent question.
    topic: {question_topics}
    context: {context}

    Example: 
    topic : birthday 
    context: used for the legal purpose
    question: When is your birthday this might be used for legal purpose ?
    """
    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt},
            ],
            response_format=generate_question_output,
        )

        event = completion.choices[0].message.parsed

        # Process the generated question to ensure proper capitalization
        formatted_question = preprocess_features(event.response)

        # Return the parsed response (e.g., "answered" or "skip")
        return formatted_question
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"OpenAI API Error in generate_question: {error_type} - {error_msg}")
        # Return a basic fallback question
        return f"Can you tell me about your {question_topics}?"


# Extract data from the human response based on the given question.
def policy_data_extraction(question, human_response,policy_data,current_policy):
    timestamp = datetime.now().isoformat()

    prompt = f"""
    Conversation Context: {question}
    Human's Response: {human_response}
    Policy Data: {policy_data}
    Current Policy: {current_policy}
    Extract relevant information from the human response while adhering to the conversation context and policy data. Follow these guidelines:
    - Identify and match policy data points if specifically found in human response. Return them as key-value pairs.
    - No boolean values, only yes or no
    - The extracted information must be relevant to the question's policy; examples
        - always match extracted information against the question first;
            then match against other policies with current policy being higher priority, if applicable
        - a location policy should reference a place, a storage area,bag, bank locker , online etc
        - a name policy should reference a real person, title of a person, place name, organization name, etc
        - a contact number policy should reference a phone number
        - an email address policy should reference an email address
        - a quantity policy should reference a number, decimal, count, etc
        - a verification policy such as "Has/have you", "Have/has it been", "Did/do you", etc should reference a yes, no, skip, etc;
        - a policy requesting details should return specific detail, do not return a yes or no answer
    - Do not make up policy data keys, only use the ones provided in the policy_data list
    - If no information can be confidently extracted, do not return the key-value pairs
    - Do not guess. If there's no clear signal, return nothing.

    **Output Format**: Provide the result as a valid JSON object with `policy_data` and `reasoning`fields.

    Time Stamp: {timestamp}
    """
   
    try:
        completion = client.beta.chat.completions.parse(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                  
                )
        # Parse the JSON response - clean markdown code fences first
        raw_content = clean_llm_json_response(completion.choices[0].message.content)
        response_json = json.loads(raw_content)

        # Extract policy_data and extra_data from the response
        policy_data_result = response_json.get("policy_data", {})
        
        print(json.dumps({
            "log_type": "policy_data_extraction",
            "question": question,
            "human_response": human_response,
            "policy_data": policy_data,
            "current_policy": current_policy,
            "policy_data_result": policy_data_result,
            "response_json": response_json
        }), flush=True)

        # Set a default reason (you can modify this based on your needs)
        reason = "Data extracted successfully"
        
        return policy_data_result, reason
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"OpenAI API Error in policy_data_extraction: {error_type} - {error_msg}")
        return {}, "Failed to extract data due to service error"


# Resolve the query based on the question topic, context, and user response.
def query_resolver(question_topic,context,user_response=None)->str:

    prompt = f"""
    You are a conversational assistant gathering information from the user. 
    Base on the {question_topic}, return a short and summarized response related to the {user_response}.
    If applicable, use the {context} provided to help generate a more informative response.
      
    Use the following parameters:
    • Topic: {question_topic}
    • Context: {context}
    • Last Response: {user_response}
    
    Example:
    ----------
    question_topic: Do you receive any government benefits?
    context: key sources of income
    user_response: Why do you need this information?
    possible response: We need to know if you are receiving any government benefits to help determine your total sources of income
    ----------
    """
    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt},
            ],
            response_format=query_resolver_mod,
        )

        event = completion.choices[0].message.parsed
        return event.response
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"OpenAI API Error in query_resolver: {error_type} - {error_msg}")
        return "I understand your question. Could you please provide more information so I can assist you better?"


# Generate a concise summary based on the provided conversation data.
def summary_generation(data: str, item_name: str="", exclude_list: list=[], summary_for_person: str="", extra_info=None) -> str:
    """
    Generate a detailed yet concise bullet-point summary based on conversation data.

    Args:
    - data (str): The conversation data that needs to be summarized.
    - item_name (str): Optional item name to help contextualize summary.
    - exclude_list (list): List of names to exclude from the summary.
    - summary_for_person (str): If provided, the summary is specifically for this person only.
                                Do not mention other names from the question - only reference this person.
    - extra_info (list or dict): Optional. If dict, keyed by person name; uses the list for
                                summary_for_person. If list, used as-is. Additional context from
                                extraction; included as bullet points in data.

    Returns:
    - str: The generated summary, formatted to avoid starting with sentence words like 'Yes', No, 'I am', 'The', 'Are', 'Is', or 'I have'.
    - str: The generated summary, capturing all key context in grammatically correct sentences.
    """
    # Resolve extra_info for this person: dict -> look up by summary_for_person; list -> use as-is

    # need to remove summary_for_person logic
    # we've gone back to using the original question in the summary
    # there is no need to worry about multiple names in the question causing the summary to be incorrect
    # the logic has negative effects on the summary
    summary_for_person = None     
    
    if extra_info is None:
        extra_info_resolved = []
    elif isinstance(extra_info, dict):
        if summary_for_person:
            extra_info_resolved = list(extra_info.get(summary_for_person.lower(), []))
        else:
            extra_info_resolved = []
            for v in extra_info.values():
                if isinstance(v, list):
                    extra_info_resolved.extend(v)
                elif v and str(v).strip():
                    extra_info_resolved.append(str(v).strip())
    else:
        extra_info_resolved = list(extra_info) if extra_info else []

    # Build additional context block for extra_info (cannot use backslash inside f-string expression)
    extra_info_lines = [str(s).strip() for s in extra_info_resolved if s and str(s).strip()]
    if extra_info_lines:
        bullet_lines = "\n".join("- " + line for line in extra_info_lines)
        data += f"\nBot: Note: /User:{bullet_lines}"

    # Build entity-specific instruction if summary_for_person is provided
    # Note: parameter is named "summary_for_person" but works for any entity type (pets, autos, real estate, etc.)
    entity_specific_instruction = ""
    if summary_for_person:
        entity_specific_instruction = f"""
        - **CRITICAL - ENTITY-SPECIFIC SUMMARY**: This summary is ONLY for "{summary_for_person}".
            - Do NOT mention any other names/items that may appear in the question
            - The summary should be written as if it's only about "{summary_for_person}"
            - If the question mentions multiple names/items, ignore all except "{summary_for_person}"
            - This applies to people (Mom, Dad), pets (Tuffy, Max), vehicles (Honda Civic), properties, etc.
            - Example (person): Question "Does Mom, Joshua, or Sister have health insurance?" for "Mom" →
              write "Does not have health insurance" NOT "Mom, Joshua, or Sister do not have health insurance"
            - Example (pet): Question "Does Tuffy or Max have a microchip?" for "Tuffy" →
              write "Has a microchip" NOT "Tuffy or Max has a microchip"
            - Example (vehicle): Question "Is Honda Civic or Toyota Camry insured?" for "Honda Civic" →
              write "Is insured" NOT "Honda Civic or Toyota Camry is insured"
        """

    prompt = f"""Summarize the following *data* into a bullet-point list.
        **RULES**
        1. If *data* is in Bot/User form, then:
        - *Bot* is the question and *User* is the answer.
        - For each Bot/User pair, create one bullet point that:
            - Clearly reflects the question's topic
            - Includes all relevant details from the user's answer
            - Uses complete but concise sentences    
        - Start each bullet with a dash: `-`
        - Avoid generic or overly short summaries that cut off meaningful context.
        - Include casual or implied details only if they enhance clarity or realism.
        - **PROFILE CONTEXT**:
            - The User is always the profile answering on behalf of another entity
              (a care receiver, pet, vehicle, property, etc.).
            - Bot questions are about that other entity, NOT the profile.
            - When the profile uses first-person ("I", "me", "my") to describe doing tasks FOR the entity
              (e.g., "I cook and serve her meals", "I prepare the meals", "I bathe him", "I handle the bills"),
              you MUST summarize this as the entity RECEIVING assistance with those tasks, not as being independent.
        - **CRITICAL - SKIP RESPONSES MUST BE INCLUDED**: If the answer is "skip", "skipped", deferred or voided:
            - You MUST create a bullet point for EVERY skip response
            - Format: "No information provided about [topic]" where [topic] is extracted from the question
            - Extract the topic from the question (e.g., "if it is reviewed by an attorney" → "attorney review")
            - DO NOT omit skip responses - they are important information that the user chose to defer
            - Example: "Bot: Please tell if it is reviewed by an attorney./User: skip" → "- No information provided about attorney review"
       - **BOT: NOTE: /USER: PAIRS**: If *data* ends with "Bot: Note: /User: ...", treat it strictly as contextual metadata, NOT as a question-answer pair.

            - Under NO circumstances should this Note produce:
                - "No information provided about additional [X]"
                - "No additional information"
                - Any negative, missing, or absence-based bullet point

            - If the Note contains ONLY missing, unavailable, or negative statements → IGNORE it completely (do not generate any bullet).

            - ONLY if the Note contains concrete, positive, actionable details (e.g., names, dates, instructions, facts), extract and include exactly ONE normal bullet summarizing those details.

            - Never interpret absence of data in the Note as a valid summary point.
        - If the answer is "no" or denies having/needing something:
            - Format: Acknowledge the denial in a way that mirrors the question structure with proper grammar
            - If question asks "Which one has X?" → "Does not have [X]"
            - If question asks "Do you have X?" → "There is no [X]"
            - If question asks "Does this person need help with X?" → "Help is not needed with [X]"
            - If question asks "Is X available?" → "[X] is not available"
            - If question asks "Have you completed X?" → "[X] has not been completed"
            - If question asks "Is [subject] [adjective]?" (e.g., "Is your care receiver technically savvy?") → "Is not [adjective]" (e.g., "Is not technically savvy")
            - If question asks "Are [subject] [adjective]?" → "Are not [adjective]"
            - If question asks "Can [subject] [verb]?" → "Cannot [verb]" or "Is not able to [verb]"
            - General pattern: Restate the question subject with a negative form, maintaining proper grammar
        - Phrase the bullet objectively and avoid any references to a person or subject (e.g., "individual", "person", "user", "person's name").  
        - Make sure the summary is aligned with the *Item Name*, if applicable.
        - **CRITICAL**: All bot/user pairs MUST be summarized - this includes:
            - YES/NO answers
            - SKIP responses (MUST include these - never omit them)
            - Detailed answers
            - Empty or voided responses
            - Do not drop skip/no responses, even if at the end of the *data*
            - Every question-answer pair in the data must have a corresponding bullet point in the summary
        - Do not cut the user aditional information if it is relevent to the asked question store the user full answer.
        - When summarizing, the summary should be written without specifying for anyone,
            the summary is by default for a single person and does not require a complete sentence, do not start with "both", "all", "they", "no one", "everyone", "none", etc in the summary.
            do not include terms like "care receivers," "dependents," "individuals," or any plural form from the question in the summary.
            only exlcude the names that match the exclude_list but keep others not found in the exclude_list in the summary.
            Example: "The service broker is Jerry Jones" instead of "The service broker for the care receivers is Jerry Jones."
            Example: "A premium membership, paid in full" instead of "Both have a premium membership, they were paid in full."
        - **EXCLUDE LIST HANDLING**:
            * If the user's entire answer IS a name from the exclude_list (and nothing else), KEEP IT in the summary - it's the actual answer.
        - Format known field types using standard conventions, e.g. phone number, SSN, email, etc.
        2. If *data* is not in Bot/User form then *data* is the user answer, the summary should include the *item name*
        3. Do not repeat the full question or full response.
        4. Do not add any unnecessary context, explanations, or qualifiers like "preferred", "chosen", "indicated", etc.
        5. Output must be in bullet point format only. Do not include explanations, headings, or commentary.
        6. Each bullet point should have proper grammar, punctuation, and capitalization.
        7. Do not capitalize words after commas unless they are proper nouns.
        8. Keep sentence casing consistent throughout the bullet.

        **EXAMPLES**
        data: "Bot:Can your care receiver drive a vehicle safely?/User: Yes\nBot: Can your care receiver park the car?/User: yes\nBot: Can your care receiver manuever turns?/User: she can take care of that"
        Summary: "- Can drive a vehicle safely
                  - Can park the car
                  - Can manuever turns"

        Data: "Bot: Please select the person who needs help with lying down./User: Both"
        Summary: "- Help is needed with lying down"

        Data: "Bot:Please provide the passport and citizenship paper details for the care receivers below./User: They are both US Citizen, born in the USA"
        Summary: "- US Citizen, born in the USA"

        Data: "Bot: Can this person pick up light objects./User: Both can"
        Summary: "- Able to pick up light objects"

        Data: "Bot: Does your care receiver need help turning on the coffee maker?/User: Yes\nBot: Please provide coffee preference details./User: skip"
        Summary: "- Help is needed turning on the coffee maker
                  - No information provided about coffee preference"

        Data: "Bot: Does your care receiver have a Will?/User: Yes\nBot: Where is the location of the original will?/User: stored in the safe\nBot: Please tell if it is reviewed by an attorney./User: skip\nBot: Are the instructions for the will up to date?/User: no\nBot: If an alternate executor is named in the will, please provide the person's contact details./User: skip"
        Summary: "- A will is present
                  - The original will is stored in the safe
                  - No information provided about attorney review
                  - Instructions for the will are not up to date
                  - No information provided about alternate executor contact details"

        Data: "Bot: Is your care receiver technically savvy?/User: No\nBot: Can your care receiver use a phone to call for help?/User: yes"
        Summary: "- Is not technically savvy
                  - Can use a phone to call for help"

        Data: "Bot: Please provide the name of the reception?/User: The Rise of AI\nBot: Can you provide information for the reception? (e.g., date, time, location)./User: Tuesday, 10am, 9/23/2025 at Waldorf Astoria"
        Summary: "- The reception is The Rise of AI\n- Information for the reception:\n  • Tuesday at 10:00am\n  • September 23rd, 2025\n  • Waldorf Astoria"


        DATA: {data}
        ITEM NAME: {item_name}
        EXCLUDE LIST: {exclude_list}
        """
        # SUMMARY FOR: {summary_for_person if summary_for_person else "Not specified (general summary)"}
        # {entity_specific_instruction}
        # """

    try:
        # Request completion from the model
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",  # Specify the appropriate model
            messages=[{"role": "system", "content": prompt}],
            response_format = generate_policy_question_data_model, 
            temperature=0.2,
        )

        event = completion.choices[0].message.parsed
        
        # Defensive check: ensure event and event.response exist
        if event is None:
            raise ValueError("Parsed event is None")
        
        if not hasattr(event, 'response') or event.response is None:
            raise ValueError("Parsed event.response is None or missing")
        
        summary = event.response.strip() if event.response else ""
        
        # Handle empty summary
        if not summary:
            print(f"Warning: Empty summary generated for data: {data[:100]}...")
            summary = f"- Information about {item_name}" if item_name else "- User provided information"
        
        unwanted_prefixes = ["User is", "The user is", "They are", "Someone is", "Person is", "Individual is"]
        for prefix in unwanted_prefixes:
            if summary.lower().startswith(prefix.lower()):
                summary = summary[len(prefix):].strip().capitalize()

        print(json.dumps({
            "log_type": "summary_generation",
            "data": data,
            "item_name": item_name,
            "exclude_list": exclude_list,
            "summary": summary
        }), flush=True)

        return event.response if event.response else summary
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        import traceback
        print(f"OpenAI API Error in summary_generation: {error_type} - {error_msg}")
        print(f"Traceback: {traceback.format_exc()}")
        # Return a minimal summary based on the data
        return f"- Information about {item_name}" if item_name else "- User provided information"


# Rephrase the given sentence while maintaining its original meaning and clarity.
def rephrase_sentence(sentence) -> str:
    """
    used to update the database 
    Rephrase the given sentence while maintaining its original meaning and clarity.
    Ensure the revised version is concise, grammatically correct, and easy to understand.

    sentence: The input sentence that needs to be rephrased.
    """
    prompt = f"""
    You are an advisor to your loved ones. Please create a simple sentence to provide them with instructions on this interaction.
    Your task is to rewrite the following sentence while keeping its original meaning intact. 
    Ensure the revised version is concise, grammatically correct, and easy to understand.
    
    Sentence: "{sentence}"
    """
    
    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt},
            ],
            response_format=generate_question_output,
        )

        event = completion.choices[0].message.parsed
        
        # Return the rephrased sentence
        return event.response
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"OpenAI API Error in rephrase_sentence: {error_type} - {error_msg}")
        # Return original sentence if rephrasing fails
        return sentence


# Rephrase a question to sound more formal, polite, or confirmatory.
def rephrase_question(question) -> str:
    """
    Rephrases a question to sound more formal, polite, or confirmatory.

    Example:
    Input: "Do you have an estate plan?"
    Output: "Please confirm if you have an estate plan."
    """
    prompt = f"""
    You are a helpful assistant tasked with rephrasing direct questions into more polite or confirmatory language.

    RULES:
    - Do not change the meaning of the original question.
    - Add polite or softening phrasing such as:
        - "Could you please confirm..."

    Example:
    Original: Do you have an estate plan?
    Rephrased: Please confirm if you have an estate plan.

    Now rephrase the following question:

    Original: {question}
    Rephrased:
        """

    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": prompt},
            ],
            response_format=generate_question_output,
        )

        event = completion.choices[0].message.parsed

        return event.response
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"OpenAI API Error in rephrase_question: {error_type} - {error_msg}")
        # Return original question if rephrasing fails
        return question    

def convert_summary_to_kv(summary: str, item_names: list) -> dict:
    prompt = f"""
    Given this unstructured summary:
    {summary}

    And these item names: {', '.join(item_names)}

    Convert the summary into JSON format as key-value pairs. The key must strictly match one of the provided item names.

    Example input:
    - Parent will is located in a red bag.
    - Child will is located in Google Drive.

    Example output:
    {{
        "Parent": "Parent will is located in a red bag.",
        "Child": "Child will is located in Google Drive."
    }}

    Ensure JSON format output strictly.
    """
    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": prompt}],
            response_format={"type": "json_object"}
        )

        # Clean response - remove markdown code fences if present
        raw_content = clean_llm_json_response(completion.choices[0].message.content)
        response_data = json.loads(raw_content)
        return response_data
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"OpenAI API Error in convert_summary_to_kv: {error_type} - {error_msg}")
        return {}

def policy_boolean_extraction(bot_question: str, human_response: str) -> str:
    """
    Determines whether the human response is positive or negative based on the bot's question.

    Args:
        bot_question (str): The full question asked by the bot.
        human_response (str): The full input text provided by the user.

    Returns:
        str: "yes" if positive, "no" if negative.
    """
    prompt = f"""

    You are a precise AI assistant that determines if the human's response is positive or negative in the given context.
 
    ### GOAL:

    Output only "yes" or "no" — nothing else.
 
    ### RULES:

    1. **CRITICAL**: If the response is exactly "skip" (or variations like "skipped", "Skip"), output → "no".
       Skip responses should NEVER be treated as affirmative.

    2. If the response indicates agreement, confirmation, or that something **exists / applies / is needed**, output → "yes".

    3. If the response expresses denial, negation, absence, or refusal, output → "no".

    4. For answers that refer to **multiple dependents**:

       - If the response says "both", "all", "everyone", "each of them" → treat as **yes**.

       - If the response says "none", "neither", "no one" → treat as **no**.

    5. If the response is a partial or conditional affirmative (e.g., "sometimes", "occasionally", "rarely", "at times", "not always", "depends"), output → "yes".
       These confirm the condition exists at least partially, so follow-up questions are relevant.

    6. If unsure, default to **"no"**.

    7. Ignore punctuation or case differences.
 
    ### EXAMPLES:

    Q: How much does your care receiver spend on groceries?

    A: skip

    → no

    Q: Please select the person who needs help with dressing.

    A: Both need help.

    → yes

    Q: Please select the person who needs help with dressing.

    A: None of them.

    → no

    Q: Does Sara need help with bathing?

    A: Yes.

    → yes

    Q: Do advocates have a copy of the will document?

    A: No.

    → no

    Q: Where is the original HIPAA release located?

    A: In the bag.

    → yes

    Q: Does your care receiver store this vehicle offsite?

    A: sometimes

    → yes

    ### TASK:

    Now process this:

    Q: {bot_question}

    A: {human_response}

    →

    """

    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}]
        )

        answer = completion.choices[0].message.content.strip().lower()

        if "yes" in answer:
            return "yes"
        elif "no" in answer:
            return "no"
        else:
            return "no"
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"OpenAI API Error in policy_boolean_extraction: {error_type} - {error_msg}")
        return "no"

def parse_free_text_response(text: str, care_receivers: list, question: str) -> dict:
    optimized_prompt = f"""You are extracting structured information from a user's response to a question about multiple care receivers.
        QUESTION ASKED: "{question}"
        USER'S RESPONSE: "{text}"
        CARE RECEIVERS: {care_receivers}

        TASK:
        Extract information for each care receiver from the user's response. Handle the following cases carefully:

        1. **Information provided**: Extract all relevant details mentioned (names, phone numbers, emails, addresses, etc.)
        - When multiple care receivers are mentioned together (e.g., "John and Jane have X"), extract ONLY the information portion for each (both get "have X", not "John and Jane have X")
        2. **Universal/Shared answer**: If the user provides information WITHOUT specifying individual care receivers, apply that information to ALL care receivers (e.g., "in the safe" means all care receivers' items are in the safe)
        3. **Skip**: User is being evasive, avoiding the question or explicitly says "skip", "later", "provide later", "I don't know", "not sure", or indicates uncertainty/deferral
        4. **No**: User explicitly states they definitively don't have the information, don't require to, or it doesn't exist (e.g., "don't need to", "don't have", "doesn't have one", "none", "N/A")
        5. **Implicit skip/no**: If a care receiver is mentioned in context (e.g., "for the rest", "the others") but no information is given, infer whether it's a skip or no based on context clues

        IMPORTANT DISTINCTIONS:
        - **Universal answer THEN specific details**: If user gives a universal answer (e.g., "yes") followed by specific details for only some care receivers, the universal answer still applies to ALL, and the specific details are ADDITIONAL information for those mentioned
            Example: "yes. Madison's tax returns are in her bag" = ALL have tax returns, Madison's location is specified
        - **Multiple care receivers together**: Extract just the information portion for each individually
        - "skip" = evasive, deferring/postponing, or will provide later (includes "I don't know", "not sure", "unsure")
        - "no" = definitive absence or doesn't exist (includes "don't have one", "doesn't have", "none", "don't need to", "don't require to")
        - When user says "I don't know about X" or "not sure about X", this is "skip" (uncertainty)
        - When user says "X doesn't have one" or "don't have it for X", this is "no" (definitive)
        - When user says "doesn't need to do" or "don't need for" for X, this is "no" (definitive)
        
        EXAMPLES:
        Example 1:
        Question Asked = "Please provide the high school home room teachers name and work details."
        User response: "Marissa's is Karen Brown and teaches Monday through Thursday but i don't have it for the rest"
        Care receivers: ["marissa", "jackson", "blade"]
        Output: {{"marissa": "Karen Brown and teaches Monday through Thursday", "jackson": "Don't have", "blade": "Don't have", "reason": "User provided home room teacher name and work details for Marissa. User explicitly stated they don't have information for the rest (jackson, blade)."}}

        Example 2:
        Question Asked = "Please provide the high school home room teachers name and work details."
        User response: "Marissa's is Jerry Lee, his contact info is 212-055-2032 and his email address is jerrylee123@gmail.com while I don't have any info for the others"
        Care receivers: ["marissa", "jackson", "blade"]
        Output: {{"marissa": "Jerry Lee and phone: 212-055-2032, email: jerrylee123@gmail.com", "jackson": "Don't have", "blade": "Don't have", "reason": "User provided home room teacher name and work details for Marissa. User explicitly stated they don't have information for the rest (jackson, blade)."}}

        Example 3:
        Question Asked = "Please provide the high school home room teachers name and work details."
        User response: "I'll provide this later"
        Care receivers: ["marissa", "jackson", "blade"]
        Output: {{"marissa": "skip", "jackson": "skip", "blade": "skip", "reason": "User wants to defer providing information for all care receivers."}}

        Example 4:
        Question Asked = "Please provide the high school home room teachers name and work details."
        User response: "Jackson's home room teacher is Sarah Smith 555-1234, for Marissa I'll get back to you, and Blade doesn't have one"
        Care receivers: ["marissa", "jackson", "blade"]
        Output: {{"marissa": "skip", "jackson": "Sarah Smith, phone: 555-1234", "blade": "Doesn't have", "reason": "User provided home room teacher name and work details for Jackson. User will provide Marissa's later (skip), and confirmed Blade doesn't have an home room teacher."}}

        Example 5:
        Question Asked = "Does your dependent have a savings account?"
        User response: "Yes.  Blade also have a checking account"
        Care receivers: ["marissa", "jackson", "blade"]
        Output: {{"marissa": "yes", "jackson": "yes", "blade": "yes", "reason": "Ignoring the additional information about Blade's checking account, user provided an affirmative answer for all dependents."}}

        Output the exact text portions for each dependent, preserving the full relevant text rather than simplifying to yes/no responses.
        format {{"dependent1": "text1", "dependent2": "text2", ..., "reason":"reason"}}
        """
    
    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "user", "content": optimized_prompt}
            ]
        )
        raw = completion.choices[0].message.content.strip()

        print(json.dumps({
            "log_type": "parse_free_text_response",
            "question": question,
            "text": text,
            "care_receivers": care_receivers,
            "raw": raw
        }), flush=True)

        # 5) Parse JSON - clean markdown code fences first
        try:
            raw = clean_llm_json_response(raw)
            data = json.loads(raw)
            # Normalize names to handle partial name matching
            from src.utils.api_helper import normalize_parsed_names
            normalized_data = normalize_parsed_names(data, care_receivers)
            return normalized_data
        except json.JSONDecodeError:
            return {dep.lower(): 'skip' for dep in care_receivers}
        except Exception as e:
            print(f"Unexpected error: {e}")
            return {dep.lower(): 'skip' for dep in care_receivers}
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"OpenAI API Error in parse_free_text_response: {error_type} - {error_msg}")
        return {dep.lower(): 'skip' for dep in care_receivers}

def parse_multidependent_policy_answer(raw_text: str, dependent_names: list) -> dict:
    """
    Parses a raw text string containing answers for multiple dependents into a structured dictionary.

    Args:
        raw_text (str): The user's unstructured response.
        dependent_names (list): A list of dependent names to look for in the text.

    Returns:
        dict: A dictionary mapping each dependent name to their extracted answer. Returns an empty dict on failure .
    """
    prompt = f"""
    You are an expert data extraction AI. Your task is to parse a single text string that contains answers for multiple people (dependents).

    **RULES:**
    1.  You will be given a list of `dependent_names` to look for.
    2.  You will be given the `raw_text` from the user.
    3.  Analyze the `raw_text` and extract the answer provided for each dependent. The dependent name and their answer might be separated by a colon (:), an equals sign (=), or just by context and newlines.
    4.  Return a JSON object where the keys are the dependent names (in lowercase) from the provided list, and the values are their corresponding answers.
    5.  If a dependent from the list is not mentioned in the `raw_text`, do not include them in the output.

    **EXAMPLE 1:**
    `dependent_names`: ["Ben", "Dan", "Vicky"]
    `raw_text`: "Ben is in the safe, dan: in the red box"
    **Expected JSON Output:**
    {{
        "responses": {{
            "ben": "in the safe",
            "dan": "in the red box"
        }}
    }}

    **EXAMPLE 2:**
    `dependent_names`: ["aaa", "bbb", "ccc"]
    `raw_text`: "aaa: in the safe ccc: in the box"
    **Expected JSON Output:**
    {{
        "responses": {{
            "aaa": "in the safe",
            "ccc": "in the box"
        }}
    }}

    ---
    **TASK:**
    `dependent_names`: {dependent_names}
    `raw_text`: "{raw_text}"

    Now, generate the JSON output.
    """

    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a data extraction expert that only outputs valid, structured JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format=MultiDependentResponse,
        )

        parsed_message = completion.choices[0].message.parsed
        # Return the dictionary of responses, or an empty one if parsing fails
        return parsed_message.responses if parsed_message else {}
    except Exception as e:
        # In case of any error during the AI call or parsing, return an empty dictionary
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"OpenAI API Error in parse_multidependent_policy_answer: {error_type} - {error_msg}")
        return {}

def extract_item_name_from_response(user_response: str, question_context: str = "", chapter_name: str = "") -> dict:
    """
    Extracts the specific item name from a user's response that may contain additional context.
    Works generically across any chapter/category type by intelligently adapting to the context.
    The returned item_name preserves the user's original capitalization/format whenever possible.
    
    Args:
        user_response (str): The full user response (e.g., "I am using Domperidone", "I see Dr. Smith", "I track my blood pressure")
        question_context (str): Optional context about what was asked
        chapter_name (str): The chapter/category context (e.g., "Medication", "Medical Provider", "Habits", "Symptoms", 
                           "Vital Logs", "Medical Records", "Respite Providers", "Assisted Daily Living", etc.)
    
    Returns:
        dict: {"item_name": str, "success": bool, "confidence": str, "error_message": str}
              - item_name: The extracted name or None if extraction failed
              - success: True if extraction was successful, False otherwise
              - confidence: "high", "medium", or "low"
              - error_message: User-friendly message to show if extraction failed
    """
    
    prompt = f"""
    You are an expert at extracting specific item names from user responses across any context or category.
    
    **Current Context/Category**: {chapter_name if chapter_name else "General"}
    
    **Task**: Extract the core item name from the user's response by:
    1. Understanding what type of information is being collected based on the chapter/category name
    2. Removing conversational fluff while preserving the essential identifying information
    3. Adapting your extraction logic to fit the specific domain
    
    **Universal Extraction Rules**:
    1. **Remove conversational phrases**: Strip out phrases like "I am using", "I have", "I'm taking", "I see", "I go to", 
       "It's", "It's called", "The", "My", "We use", "I track", "I log", "I experience", etc.
    
    2. **Preserve core identifiers**: Keep the specific name, title, or description that identifies the item/person/service/concept.
       - For people: Keep names and titles (e.g., "Dr. Smith", "John Anderson", "Springfield Medical Center")
       - For medications: Keep COMPLETE drug names including dosage, strength, or form information (e.g., "Aspirin-500", "Ibuprofen 200mg", "Domperidone", "Axen-800", "Metformin 500mg", "Tylenol Extra Strength").
         IMPORTANT: Always include numbers, hyphens, or dosage indicators that are part of the medication name.
       - For activities/habits: Keep the activity name or behavior (e.g., "jogging", "smoking cigarettes", "meditation")
       - For symptoms: Keep the symptom description (e.g., "headache", "chest pain", "shortness of breath")
       - For measurements/vitals: Keep the vital type or measurement (e.g., "blood pressure", "heart rate", "glucose levels")
       - For documents/records: Keep the document type or name (e.g., "MRI results", "X-ray", "birth certificate")
       - For services: Keep the service name or type (e.g., "Visiting Angels", "bathing assistance", "meal preparation")
       - For ANY other category: Extract the most relevant specific identifier
    
    3. **Maintain proper formatting**:
       - Keep proper nouns capitalized correctly
       - Preserve medical/technical terminology
       - Keep multi-word names together if they form a single identifier
       - For medications: ALWAYS preserve numbers, hyphens, dosage values (mg, ml, etc.) as they are critical identifiers
    
    4. **Handle edge cases**:
       - If response is already just a name with no extra words → return it as-is
       - If response contains multiple items → extract only the first/main one
       - If response is too vague with no specific identifier → return null
       - If response is a non-answer (yes/no/skip/I don't know) → return null
    
    5. **Confidence scoring**:
       - Use "high" confidence when you identify a clear, specific name or identifier that fits the category context
       - Use "medium" confidence when the extraction is reasonable but somewhat ambiguous or unconventional
       - Use "low" confidence when the response is vague, unclear, or doesn't provide a specific identifier
    
    **Context Adaptation**:
    Based on the chapter name "{chapter_name}", intelligently determine:
    - What type of entity is being collected (person, thing, activity, measurement, service, etc.)
    - What constitutes a valid name/identifier in this domain
    - How specific or detailed the extraction should be
    - Whether to include qualifiers, descriptions, or keep it minimal
    
    **Examples Across Different Contexts**:

    Medication context:
    - "I am using Domperidone" → "Domperidone" (high confidence)
    - "I take Ibuprofen for pain" → "Ibuprofen" (high confidence)
    - "Axen-800" → "Axen-800" (high confidence)
    - "I'm taking Metformin 500mg twice daily" → "Metformin 500mg" (high confidence)
    - "My medication is Tylenol Extra Strength" → "Tylenol Extra Strength" (high confidence)
    
    Medical Provider context:
    - "I see Dr. Smith" → "Dr. Smith" (high confidence)
    - "My doctor is John Anderson" → "John Anderson" (high confidence)
    - "I go to Springfield Medical Center" → "Springfield Medical Center" (high confidence)
    - "Joseph" → "Joseph" (high confidence) - plain names without prefixes are acceptable
    - "Nancy" → "Nancy" (high confidence) - plain names without prefixes are acceptable
    - "Mr. Joseph" → "Mr. Joseph" (high confidence) - but will be validated separately
    - "Advocate Nancy" → "Advocate Nancy" (high confidence) - but will be validated separately
    
    Habits context:
    - "I smoke cigarettes" → "smoking cigarettes" (high confidence)
    - "I go jogging every morning" → "jogging" (high confidence)
    
    Symptoms context:
    - "I have terrible headaches" → "headaches" (high confidence)
    - "I'm experiencing chest pain" → "chest pain" (high confidence)
    
    Vital Logs context:
    - "I track my blood pressure" → "blood pressure" (high confidence)
    - "I monitor my glucose levels daily" → "glucose levels" (high confidence)

    Medical Records context:
    - Any valid medical terminology is acceptable. The word "Record" is optional — never required.
    - CRITICAL: Extract the record TYPE from the user's response ONLY — never extract person names from the question context.
    - Q: "What is the medical record type for Dad?" + A: "Diabetes Report" → "Diabetes Report" (NOT "Dad")
    - "Blood Pressure" → "Blood Pressure" (high confidence)
    - "I had an MRI done" → "MRI" (high confidence)

    **Invalid Responses (always return null with low confidence)**:
    - "skip", "yes", "no", "I don't know", "maybe", "not sure"
    - Empty or meaningless responses
    - Overly vague descriptions without specific identifiers (e.g., "a red car" without a model/name)
    
    ---
    
    **Question Context**: {question_context if question_context else "Not provided"}
    **User Response**: {user_response}
    
    **Output Format**: Return ONLY a JSON object with these exact fields:
    {{
        "item_name": "extracted name or null",
        "confidence": "high, medium, or low"
    }}
    
    Think about the chapter context "{chapter_name}", determine what type of item should be extracted, 
    and extract accordingly. Be intelligent and adaptive to any domain.
    """
    
    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )

        # Clean response - remove markdown code fences if present
        raw_content = clean_llm_json_response(completion.choices[0].message.content)
        response_data = json.loads(raw_content)
        item_name = response_data.get("item_name")
        confidence = response_data.get("confidence", "low")
        
        # Preserve user's original casing by finding the substring in their response
        if item_name:
            idx = user_response.lower().find(item_name.lower())
            if idx != -1:
                item_name = user_response[idx:idx + len(item_name)]
        
        # Special validation for Medical Provider context
        if chapter_name and "medical provider" in chapter_name.lower():
            if item_name and item_name.strip():
                item_name_lower = item_name.strip().lower()
                
                # Define medical prefixes (acceptable - keep as is)
                medical_prefixes = ["dr.", "doctor", "doc.", "physician", "md", "do"]
                
                # Define non-medical prefixes that should be stripped
                non_medical_prefixes = ["advocate", "adv.", "attorney", "lawyer", "mr.", "mrs.", "miss", "ms.", "prof.", "professor"]
                
                # Check if name starts with any non-medical prefix and strip it
                for prefix in non_medical_prefixes:
                    prefix_with_space = prefix + " "
                    if item_name_lower.startswith(prefix_with_space):
                        # Find the actual prefix in the original string (case-insensitive)
                        # Strip the prefix and any following space, keep the rest
                        # Use the length of the prefix with space to slice correctly
                        prefix_length = len(prefix_with_space)
                        item_name = item_name[prefix_length:].strip()
                        # Update the lower version for further checks
                        item_name_lower = item_name.lower()
                        break
                    elif item_name_lower == prefix:
                        # If the entire name is just the prefix, reject it
                        return {
                            "item_name": None,
                            "success": False,
                            "confidence": "low",
                            "error_message": f"Thank you for your response, but '{item_name}' does not specifically answer the question regarding the name of the medical provider. Please provide the name of the medical provider specifically."
                        }
                
                # After stripping non-medical prefixes, ensure we still have a valid name
                if not item_name or not item_name.strip():
                    return {
                        "item_name": None,
                        "success": False,
                        "confidence": "low",
                        "error_message": f"Thank you for your response, but '{item_name}' does not specifically answer the question regarding the name of the medical provider. Please provide the name of the medical provider specifically."
                    }
                
                # Accept if it has a medical prefix OR if it's just a plain name (no prefix)
                # Plain names without any prefix are acceptable (e.g., "John Anderson", "Joseph", "Nancy")
                # Medical prefixes are also acceptable (e.g., "Dr. Smith", "Doctor Johnson")
        
        # Only accept high and medium confidence results
        if item_name and item_name.strip() and confidence in ["high", "medium"]:
            return {
                "item_name": item_name.strip(),
                "success": True,
                "confidence": confidence,
                "error_message": ""
            }
        else:
            return {
                "item_name": None,
                "success": False,
                "confidence": confidence,
                "error_message": "I couldn't identify a specific name in your response. Could you please provide just the name?"
            }
    
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"OpenAI API Error in extract_item_name_from_response: {error_type} - {error_msg}")
        return {
            "item_name": None,
            "success": False,
            "error_message": "I had trouble understanding your response. Could you please provide just the name?"
        }


def validate_multiple_user_response(question: str, answer: str, context_info, story_type: str, invalid_count: int = 0, caregiver_name: str | None = None) -> dict:
    
    subject_line = f"{context_info}" if context_info else  "(e.g., a care receiver, a named person, a pet, a vehicle, or a property) are"

    try:
        profile_line = f'The Profile answering is "{caregiver_name}". ' if caregiver_name else "Profile"
        prompt = f"""
            You are an AI assistant validating human responses during a Q&A session.
            {profile_line} The person answering is always the Profile(first person).
            Any first-person references in the response ("I", "me", "my", "mine", etc.)
            ALWAYS refer to the Profile{f' "{caregiver_name}"' if caregiver_name else "Profile"}.
            The question subject {subject_line}
            SEPARATE entity that the Profile is responsible for.

            Your job is to classify the Profile's answer to a question into one of these five categories.

            ---
            ### STEP-BY-STEP INSTRUCTIONS

            1. **Split responses**:
                - If multiple users are included (format: "User=Answer, User=Answer, ..."), split each pair.
                - If no user is mentioned, treat the entire answer as one response.

            2. **Evaluate EVERY response and collect ALL classifications**:
                For each individual response, determine its classification:
                
                - "question" → response is a question, asks for clarification, requests help/examples  
                Examples: "What do you mean?", "Can you explain?", "Where should I store it?", "What's the best way to...?"
                **CRITICAL - REQUESTS FOR HELP/EXAMPLES**: Phrases requesting help, examples, ideas, or suggestions should be classified as "question":
                * "get me some ideas", "get me more ideas", "give me ideas", "show me ideas"
                * "get me examples", "give me examples", "show me examples", "can you give examples"
                * "what are some examples", "what are some ideas", "what should I say"
                * "help me understand", "can you help", "what do you suggest", "I need help"
                * Any variation requesting assistance, examples, or guidance
                Note: Requests for help/examples are NOT "skip" responses - they are valid questions that need addressing
                **Important: "help" used as a descriptive word in answers (e.g., "help wearing shirts", "help walking") 
                should NOT be classified as "question" - these are descriptions, not asking for clarification

                - "error" → response is:
                * Gibberish or random letters (e.g., "ysiwof", "skdjfhwef")
                * Clearly irrelevant to the question (e.g., "the weather is sunny" when asked about documents)
                * Incomplete or doesn't address what was asked (e.g., "yes I know where it is" when asked WHERE something is located - this doesn't actually answer the question)
                * Placeholder or test data that is clearly not real information
                    - Sequential letters/numbers (e.g., "GHI", "LLL", "345")
                    - Obviously fake names (e.g., "Test", "Name", "Person")
                    - Invalid phone numbers (e.g., "123", "000", repeating digits, less than 7 digits)

                - "yes" → response is an affirmative, relevant, and COMPLETE answer that actually addresses the question
                * For location question WHERE THE ITEM EXISTS: must specify an actual location or an individual, group, entity, etc
                        e.g., "in the safe", "drawer", "lockbox", "with her cousin", "at the lawyer"
                * For selection questions: can include "both", "all", "everyone", or specific names
                * For yes/no questions: ANY response that starts with "yes", "yeah", "I do", "I have","we have it", "everyone has it" or contains an affirmative answer should be classified as "yes", EVEN IF it includes additional information or details. Examples:
                    - Q: "Does this dependent have a primary care doctor?" A: "Yes, Mitchel is the name of the doctor but I don't have his number" → "yes" (affirmative answer with additional context)
                    - Q: "Do you have insurance?" A: "Yes, I have Blue Cross" → "yes" (affirmative with details)
                    - Q: "Does she attend school?" A: "Yes, she goes to Lincoln Elementary" → "yes" (affirmative with school name)
                    - Additional information, names, or missing details do NOT make it "error" - if it starts with "yes" or affirms the question, it's "yes"
                * If the response describes or confirms the condition asked about WITHOUT saying "yes" explicitly
                (e.g., Q: "Does Zohan need help?" A: "need help with turning on computer"), this is still "yes" - the answer confirms the premise by describing the need
                * Only classify as "no" if the response explicitly denies (e.g., "no", "doesn't need", "no help needed")
                * For detail requests: provides actual details or relevant information
                * Account numbers and financial details are VALID "yes" answers when requested (different care receivers having different account statuses is normal)
                * Phone numbers with 7 or more digits are VALID "yes" answers when the question asks for a phone number — do not require the entity name to be restated.
                * For questions asking if there is a preferred or primary **service/provider** (e.g., preferred cleaning service, primary doctor, preferred mechanic, preferred vet, preferred insurer, preferred pharmacy, property manager, etc.), an answer that is primarily the **name of a person, business, or service** (optionally with a short confirming phrase such as "is there", "comes in", "handles it", "takes care of it") MUST be treated as a VALID "yes" answer, not "error", as long as the name is plausibly a provider in the question's domain.
                
                - "no" → response clearly denies the premise (e.g., "no", "we don't have it", "none", "i don't have", "not received yet", "still waiting for")
                    Note: If a response starts with "yes" but includes conditions that CONTRADICT the core answer:
                    * The condition must directly negate what was asked
                    * Examples that ARE "no": 
                    - Q: "Do you have gym membership?" A: "yes if I can afford it next month" (they don't currently have it)
                    - Q: "Can you walk independently?" A: "yes but only with a walker" (contradicts "independently")
                    - Q: "Do you have the document?" A: "yes but I haven't received it yet" (contradiction - can't have it if not received)
                    * Examples that are still "yes":
                    - Q: "Do you have gym membership?" A: "yes but this month payment is late" (they still have gym membership)
                    - Q: "Do you have gym membership?" A: "yes but it's expensive" (they still have gym membership)
                    - Q: "Who has the key?" A: "John, but Mary can access it too" (still answers WHO)
                    * Rule: Additional details, payment methods, sources, or non-contradictory conditions do NOT change "yes" to "no"

                **CRITICAL - MIXED RESPONSES AND EXCEPT/ONLY PHRASES**:
                - When evaluating responses that mention multiple people (care receivers) or items in a single sentence:
                    * If the response indicates that **at least one** named individual DOES have / DOES need / DOES receive the thing being asked about,
                      you MUST include **"yes"** in `classifications` for that response, even if the sentence also mentions others who do not.
                    * Phrases like **"only X"**, **"only X and Y"**, **"no one has except X"**, **"all except X"**, or similar MUST be treated as
                      containing at least one affirmative answer. In these cases, you MUST treat the response as having a **"yes"** classification.
                    * Only when the response clearly states that **none** of the mentioned individuals have/need/receive the thing (for example:
                      "no one has it", "none of them", "nobody needs that") and there is **no exception** (no "except X" / "only X") should the
                      response be classified purely as **"no"** (without any "yes").
                    * If the user clearly skips or defers answering for **all** individuals (for example: "skip for everyone", "I don't know for anyone"),
                      then classify that response as **"skip"**.
                
                - "skip" → response is skipped, deferred, or avoided (e.g., "don't know", "I'll answer later", "pass", "skip", "i don't want to", "let's talk about someething else")
                    **CRITICAL — "I don't know" / "not sure" / "unsure" is ALWAYS "skip", never "no"**. "no" means the thing does not exist. "skip" means the person cannot or will not answer. Lack of knowledge ≠ denial of existence.

                **CRITICAL EVALUATION RULES**:
                - **FOR YES/NO QUESTIONS** (questions asking "Does X have Y?", "Do you have X?", "Is X available?", "Does X need help/assistance with Y?", etc.):
                    * If the response starts with "Yes", "Yeah", "I do", "I have", or contains any affirmative, classify as "yes" REGARDLESS of additional information provided.
                    * For questions about whether someone **needs help / needs assistance / requires help** with something (e.g., "Does Bala need help cutting food?"):
                        - Any response that clearly states that the person **needs help/assistance/support** (for example, "need help with cutting food", "she needs help with that", "requires assistance with cutting") MUST be classified as **"yes"**, even if the word "yes" is not present.
                        - Do NOT classify such responses as "no" just because they lack an explicit "yes"; the presence of "need help", "needs assistance", or similar phrases IS the affirmative signal.
                    * Additional details (names, missing information, context) do NOT make it "error" - they are just extra context.
                    * Example: Q: "Does this dependent have a primary care doctor?" A: "Yes, Mitchel is the name of the doctor but I don't have his number" → MUST be classified as "yes" (not "error").
                    * Example: Q: "Do you have insurance?" A: "Yes, I have Blue Cross" → "yes" (even though question only asked yes/no, not which company).
                - If a question asks "WHERE is X located?", the response MUST specify a location unless that classification is a "no". Responses like "I know where it is" or "yes" are "error" (evasive).
                - If a question asks "WHO" or "select the person", responses like "both", "all", "everyone" are valid "yes" answers.
                - **FIRST-PERSON ACTION ON BEHALF OF SUBJECT**: When the Profile uses "I" or "we" to describe performing an action that the question asks whether the subject has or needs, classify as "yes". The Profile doing X for/on behalf of the subject implies the subject has or needs X — regardless of the entity type (person, pet, property, etc.).
                    * Q: "Does [subject] need assistance with meals?" A: "I prepare the meals" → "yes"
                    * Q: "Who manages the finances?" A: "I handle it all" → "yes"
                **CRITICAL - FIRST-PERSON AS VALID ANSWER FOR "WHO" QUESTIONS**:
                - When the question asks "who" (e.g. "Who are the owners?", "Who has the key?", "Who is responsible?") and the profile's answer uses first-person references (I, me, my, I'm, I am, we, our) to indicate they themselves are the answer, classify as "yes".
                - The profile is a valid identity; do NOT classify as "error" for being "vague" when they are clearly stating they are the one. Examples:
                    * Q: "Who are the owners listed on the certificate of title?" A: "I'm the owner" or "Me" → "yes"
                    * Q: "Who has the key?" A: "I do" or "Me" → "yes"
                    * Q: "Who is responsible?" A: "I am" or "Just me" → "yes"
                - If ANY response contains a question mark or is asking something, classify it as "question", not "error".
                - You MUST evaluate ALL responses before proceeding to step 3. Do not stop after finding a "yes".
                - If the question asks about days, time periods, supply duration, frequency, or "how often/how long",
                    then time period expressions are VALID answers and should be classified as "yes":
                    * "weekly", "monthly", "for a month", "for a week", "twice a day", "daily", "3 months", "a year", etc. are all VALID
                    * These expressions answer the question even if not in exact "days" format
                    * Example: Q: "How many days of supply is prescribed?" A: "for a month" → classify as "yes" (valid answer)
                - Conditional affirmatives like "sometimes", "occasionally", "at times" are valid "yes" answers — they confirm the condition exists at least partially.
                - **IMPORTANT - PARTIAL BUT RELEVANT ANSWERS**: For open-ended questions that ask for details, instructions, descriptions, or plans
                    (e.g., "What care instructions should be provided?", "Describe the daily routine", "What arrangements have been made?"):
                    * ANY response that is relevant and on-topic should be classified as "yes", even if it only addresses one aspect of the question
                    * A partial but meaningful answer is still a valid answer — do NOT classify it as "error" just because it doesn't cover everything
                    * Example: Q: "What permanent care instructions should be provided for Jojo?" A: "He needs to take his medications on time" → classify as "yes" (valid partial answer about medication)
                    * Only classify as "error" if the response is truly irrelevant, gibberish, or nonsensical
                - **DOMAIN-RELEVANT TERMS**: If the answer uses terminology naturally associated with the question's domain, classify as "yes" even if phrased differently from the examples given. Examples in questions are illustrative only, not exhaustive.
                * Q: "What is the medical record type? (e.g., Doctor visit, Lab result)" A: "diabetes", "thyroid", "MRI", "I went for MRI" → "yes" (names the subject of the record)
                * For provider/service preference questions, a provider name (e.g., a cleaning company, doctor, pharmacy, mechanic, vet, insurance company, home care agency, property manager), by itself or in a short confirming phrase (e.g., "X is there", "X comes in", "X handles it"), is domain-relevant and SHOULD be treated as "yes", not "error".
                
            ---

            **EDGE CASE NOTE** For the question "What is the family code word to Pause and Verify?", 
                any user-provided phrase should be treated as a valid affirmative answer even if it appears to be gibberish, 
                unless the user explicitly skips or asks a question; always return "yes" for this specific question.

            Always return a single JSON object: {{ "classifications": ["classification1", "classification2", ...], "user_answers": ["user_answer1", "user_answer2", ...], "reason": "reason" }}

            **Context Info: {context_info}
            **Question:** {question}
            **Answer:** {answer}
            **Invalid Count:** {invalid_count}    
            """

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "user", "content": prompt}
            ],
            # logprobs=True,
        )
        raw = clean_llm_json_response(completion.choices[0].message.content)
        # classification_logprobs = completion.choices[0].logprobs

        try:
            # first piece of breaking up the validation process, get the classifications and the reason
            classifications = json.loads(raw)["classifications"]
            bot_reason = json.loads(raw)["reason"]

            # stores the final classification based on the logic below            
            classification = ""
            bot_reply = ""

            # Process classifications in priority order: question > error > skip > yes > no
            if "question" in classifications:
                classification = "question"
            elif "error" in classifications:
                # SENDING INTO LLM INSTEAD for more detailed explanation
                # # Handle error case
                # error_indices = [i for i, cls in enumerate(classifications) if cls == "error"]
                
                # if len(classifications) == 1:
                #     # Single element - print generic message
                #     bot_reply = f"Your response '{answer}' is not relevant or lack the information requested"
                # else:
                #     # Multiple elements - extract names from answer matching error positions
                #     # Parse answer to extract key/value pairs (e.g., "Mom=skip, Jane=skip, Ashok=error")
                #     answer_parts = [part.strip() for part in answer.split(",")]
                #     error_names = []
                    
                #     for idx in error_indices:
                #         if idx < len(answer_parts):
                #             part = answer_parts[idx]
                #             # Extract name before "="
                #             if "=" in part:
                #                 name = part.split("=")[0].strip()
                #                 error_names.append(name)
                    
                #     if error_names:
                #         names_str = ", ".join(error_names)
                #         bot_reply = f"Your response for {names_str} is not relevant or lack the information requested"
                #     else:
                #         bot_reply = f"Your response '{answer}' is not relevant or lack the information requested"
                
                classification = "error"
            elif "yes" in classifications:
                classification = "yes"
            elif "no" in classifications:
                classification = "no"
            elif "skip" in classifications:
                bot_reply = "It looks like you'd like to skip this question. No worries — you can update this information anytime. Let's move on."
                classification = "skip"

            # Only call prompt2 when classification is "yes", "no", or "question"
            if classification in ["yes", "no", "question", "error"]:

                # TEMP DISABLED
                caregiver_name = None  # purposedly disabled for now until the bot replies are consistently correct

                profile_reply_instruction = f'''
                    **PROFILE NAME IN REPLY**:
                    The profile (the person using this application) is "{caregiver_name}". {context_info}
                    - Mention "{caregiver_name}" in your reply ONLY when the profile's answer contains first-person references (I, me, myself, my, we, our, etc.). In that case, replace first-person with the profile name so the reply clearly states what {caregiver_name} does or provides. Do NOT use passive voice that omits the name (e.g. avoid "the policy is kept in the bag" when the answer was "I kept it in the bag"—use "{caregiver_name} keeps the policy in the bag").
                    Examples: "I help" → "Your response indicates that {caregiver_name} helps [care receiver(s)]"; "I help all of them" → "Your response indicates that {caregiver_name} helps Jessi, Jake, Dad, Mom, and Bala with home safety assistance"; "He needs me" → "Bala needs {caregiver_name}'s help." For WHERE/location questions with first-person: "I kept insurance policy in Bag" → "Your response indicates that {caregiver_name} keeps the insurance policy in the bag."; "I kept in bag" → "Your response indicates that {caregiver_name} keeps it in the bag."
                    - When the profile's answer does NOT contain first-person references (e.g. "yes he can", "Bala can"), NEVER mention "{caregiver_name}" or the user profile name in your reply—use only {context_info}. Or needs, Bussiness etc. 
                ''' if caregiver_name else ""
                prompt2 = f"""
                    **Story Type:** {story_type}
                    **Question:** {question}
                    **Answer:** {answer}
                    **Classification:** {classification}

                    IMPORTANT RULES:
                    - Refer to the subject as the {story_type}.
                    - Do not repeat or mention any names that appear in the answer.
                    - Keep the reply short and clear.
                    - Do not ask follow-up questions.

                    Execute only the section matching the classification.

                    ===== CLASSIFICATION: "question" =====
                    {f'''   
                    Explain the clarification requested in the user's response. Provide a short helpful explanation.
                    Never ask for follow up and don't always start with "That's a greate question..."
                    ''' if classification == "question" else "SKIP THIS SECTION"}

                    ===== CLASSIFICATION: "error" =====

                    {f'''
                    Provide a short explanation for the error in the user's answer and do not ask for a follow up or clarification.
                    Always start with "It looks like your response...".
                    ''' if classification == "error" else "SKIP THIS SECTION"}
                                            
                    ===== CLASSIFICATION: "no" =====

                    {f'''
                    If appropriate, start with an appreciation to the user's answer and always follow by "Your response indicates...". 
                    return a response specifying there is not existence, ownership, etc of the question asked.
                    ''' if classification == "no" else "SKIP THIS SECTION"}
                    
                    ===== CLASSIFICATION: "yes" =====
                    Using the question and answer context, generate a short acknowledgement reply.

                    Rules:
                    - If the topic is sensitive or concerning, respond calmly and respectfully.
                    - Avoid celebratory phrases such as "great", "glad", or "happy to hear".
                    - Account numbers or financial details are valid answers when the question asks for them.
                    - Keep the reply strictly factual and neutral. Do NOT infer or describe willingness, preferences, emotions, or motivations beyond what is explicitly stated in the user's answer or quesitons.

                    If appropriate, start with an appreciation to the user's answer and always follow by "Your response indicates...".
                    """
                completion = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "user", "content": prompt2}
                    ],
                    # logprobs=True,
                )
                bot_reply = completion.choices[0].message.content.strip()

            # create the data to return
            data = {
                "result": classification,
                "reply": bot_reply,
                "rephrased_question": "",
                "reason": bot_reason,
                "classifications": classifications
            }

            # print the data to the console (GCP log)
            print(json.dumps({
                "log_type": "validate_multiple_user_response",
                "question": question,
                "answer": answer,
                "raw": data, 
                "context_info": context_info,
                "story_stype": story_type,
                # "classification_logprobs": logprobs_to_dict(classification_logprobs),
                # "bot_reply_logprobs": logprobs_to_dict(completion.choices[0].logprobs),
            }), flush=True)

            return data
        except json.JSONDecodeError:
            return {
                "result": "error",
                "reason": "Failed to parse validation response",
                "reply": "I'm having trouble processing your response. Please try again.",
                "rephrased_question": question
            }
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"OpenAI API Error in validate_multiple_user_response: {error_type} - {error_msg}")
        
        # Return a graceful fallback response
        return {
            "result": "error",
            "reason": f"Service temporarily unavailable: {error_type}",
            "reply": "I'm experiencing technical difficulties. Please try again in a moment.",
            "rephrased_question": question
        }
        
def extract_policy_answers_cluster_mode(input_data: dict) -> dict:
    """
    Extract policy answers from user response in CLUSTER MODE.

    Handles TWO scenarios:
    1. WITH Dynamic Function: user_response is dict {"Dep1": "ans", "Dep2": "ans"}
       Returns arrays: [{"Dep1": "ans"}, {"Dep2": "ans"}]

    2. WITHOUT Dynamic Function: user_response is string
       Returns simple strings: "extracted answer"

    Args:
        input_data: {
            "user_response": dict OR str,  # Dict for dynamic, string for non-dynamic
            "seed_question": str,
            "policy_questions": list
        }

    Returns WITH Dynamic Function:
        {
            "user_response": {"Dep1": "ans", "Dep2": "ans"},
            "seed_question": {"question": [{"Dep1": "ans"}, {"Dep2": "ans"}]},
            "policy_questions": [
                {"policy_q1": [{"Dep1": "ans"}, {"Dep2": "ans"}]},
                {"policy_q2": []}
            ],
            "found": bool
        }

    Returns WITHOUT Dynamic Function:
        {
            "user_response": "str",
            "seed_question": {"question": "extracted answer"},
            "policy_questions": [
                {"policy_q1": "extracted answer"},
                {"policy_q2": ""}
            ],
            "found": bool
        }
    """
    # Extract parameters
    user_response = input_data.get("user_response", "")
    seed_question = input_data.get("seed_question", "")
    policy_questions = input_data.get("policy_questions", [])

    # Detect if this is dynamic function mode (dict) or non-dynamic (string)
    is_dynamic = isinstance(user_response, dict)

    if not policy_questions:
        if is_dynamic:
            return {
                "user_response": user_response,
                "seed_question": {seed_question: []},
                "policy_questions": [],
                "found": False
            }
        else:
            return {
                "user_response": user_response,
                "seed_question": {seed_question: ""},
                "policy_questions": [],
                "found": False
            }

    # Build policy questions list
    policy_questions_list = "\n".join(f"{i+1}. {q}" for i, q in enumerate(policy_questions))

    # Build prompt based on dynamic vs non-dynamic mode
    if is_dynamic:
        # Dynamic function mode - user_response is dict with dependent names as keys
        dependents = list(user_response.keys())
        dependent_responses = json.dumps(user_response, indent=2)

        prompt = f"""You are analyzing dependent-specific responses to extract policy information in CLUSTER MODE (WITH Dynamic Function).

            CONTEXT:
            - Question Asked: "{seed_question}"
            - Per-Dependent Responses (already parsed):
            {dependent_responses}
            - Policy Questions to Check:
            {policy_questions_list}

            YOUR TASK:
            Extract answers for each policy question from the dependent-specific responses. Return as ARRAYS of dependent objects.
            ALSO extract any additional information that doesn't match policy questions - this should be preserved in the seed_question answer.

            CRITICAL RULES:

            1. **Output Format** - Arrays of Objects:
            - Return: [{{"Dep1": "answer"}}, {{"Dep2": "answer"}}]
            - Each policy question gets an ARRAY of dependent objects
            - Include ALL dependents in the array
            - If no info for a dependent, include them with empty string: {{"Dep1": ""}}

            2. **Empty Array**:
            - If NO information found for a policy question, return empty array []
            - Don't guess or infer beyond what's stated

            3. **Answer Types**:
            - Specific information: Extract exact text from the dependent's response
            - Skip: "skip" (user says they'll provide later, not sure)
            - No: "no" (definitive absence)
            - Yes: "yes" (simple affirmation)

            4. **CRITICAL - Preserve Additional Information**:
            - For seed_question: Extract the FULL original response including ALL information provided by the user
            - Include information that doesn't match any policy question - this is important context that should be preserved
            - Example: If user says "Yes, I have insurance through Blue Cross, policy number BC123456, and I pay $450 per month, but I keep the papers with my agent"
              - Policy Q1: "What is the insurance provider?" → Extract "Blue Cross"
              - Policy Q2: "What is the policy number?" → Extract "BC123456"
              - Policy Q3: "What is the monthly premium?" → Extract "$450 per month"
              - seed_question: Should include FULL response: "Yes, I have insurance through Blue Cross, policy number BC123456, and I pay $450 per month, but I keep the papers with my agent"
            - The seed_question answer should preserve ALL user-provided information, not just what matches policy questions

            5. **Validation Requirements**:
            - Location questions: Must specify actual location
            - Contact questions: Must have actual phone/email
            - Extract only what's explicitly stated in each dependent's response

            EXAMPLES:

            Example 1:
            User Response: {{"Ben": "Yes, in the safe at home", "Mary": "No, don't have one"}}
            Policy Q1: "Where is it located?"
            Output: {{"Where is it located?": [{{"Ben": "in the safe at home"}}, {{"Mary": "no"}}]}}

            Example 2:
            User Response: {{"Ben": "Yes", "Mary": "Yes"}}
            Policy Q1: "What is the box number?"
            Output: {{"What is the box number?": []}}
            (No box numbers provided, so empty array)

            Example 3:
            User Response: {{"Ben": "Chase Bank, box 123", "Mary": "I'll check later"}}
            Policy Q1: "What is the box number?"
            Output: {{"What is the box number?": [{{"Ben": "123"}}, {{"Mary": "skip"}}]}}

            OUTPUT FORMAT:
            Return JSON with this EXACT structure:
            {{
                "user_response": {dependent_responses},
                "seed_question": {{"{seed_question}": [list of dependent objects with FULL responses]}},
                "policy_questions": [
                    {{"actual_policy_question_1": [{{"Dep1": "answer"}}, {{"Dep2": "answer"}}]}},
                    {{"actual_policy_question_2": []}}
                ],
                "found": true/false
            }}

            IMPORTANT: For seed_question, include the FULL original response for each dependent, preserving ALL information they provided, not just what matches policy questions.
            Set "found" to true if ANY policy question has a non-empty array with at least one non-empty value.
            The keys in policy_questions MUST be the exact question text provided above.
            """
    else:
        # Non-dynamic mode - user_response is simple string
        prompt = f"""You are analyzing a user's response to extract policy information in CLUSTER MODE (WITHOUT Dynamic Function).

            CONTEXT:
            - Question Asked: "{seed_question}"
            - User's Response: "{user_response}"
            - Policy Questions to Check:
            {policy_questions_list}

            YOUR TASK:
            Extract answers for each policy question from the user's response. Return as SIMPLE STRINGS.
            ALSO preserve any additional information that doesn't match policy questions in the seed_question answer.

            CRITICAL RULES:

            1. **Simple String Format**:
            - Return just the extracted answer text as a string
            - Example: "in the safe" or "yes" or "skip"
            - NO arrays, NO objects, just plain strings

            2. **Empty String**:
            - ONLY return empty string "" if the user's response has ZERO information about that policy question
            - If user explicitly states they DON'T KNOW, CAN'T REMEMBER, or DON'T HAVE the information → DO NOT return empty string, extract the negative statement
            - Don't guess or infer beyond what's stated

            3. **Answer Types**:
            - Specific information: Extract exact text ("Chase Bank", "BC123456", "$450/month")
            - Skip: "skip" (user expresses uncertainty, will provide later)
            - No: "no" (definitive absence)
            - Yes: "yes" (simple affirmation)
            - Unknown/Negative: Extract statements indicating lack of knowledge ("don't know", "not in a specific location", "location unknown")

            4. **CRITICAL - Preserve Additional Information**:
            - For seed_question: Return the FULL original user response including ALL information provided
            - Include information that doesn't match any policy question - this is important context that should be preserved
            - Example: If user says "Yes, I have insurance through Blue Cross, policy number BC123456, and I pay $450 per month, but I keep the papers with my agent"
              - Policy Q1: "What is the insurance provider?" → Extract "Blue Cross"
              - Policy Q2: "What is the policy number?" → Extract "BC123456"
              - Policy Q3: "What is the monthly premium?" → Extract "$450 per month"
              - seed_question: Should include FULL response: "Yes, I have insurance through Blue Cross, policy number BC123456, and I pay $450 per month, but I keep the papers with my agent"
            - The seed_question answer should preserve ALL user-provided information, not just what matches policy questions

            5. **CRITICAL - Negative/Unknown Information Extraction**:
            - MUST extract when user explicitly states lack of knowledge or negative information
            - "not in a specific location" / "not stored in a known location" → EXTRACT as "Unknown location"
            - "don't know where" / "unsure of location" → EXTRACT as "Unknown"
            - "I don't have that information" → EXTRACT as "skip"
            - "don't have" / "doesn't exist" → EXTRACT as "no"
            - Empty string ONLY when response has zero relevance to the policy question

            EXAMPLES:

            Example 1 - Simple Extraction:
            User Response: "Yes, I have insurance through Blue Cross"
            Policy Q1: "What is the insurance provider?"
            Output: {{"What is the insurance provider?": "Blue Cross"}}

            Example 2 - No Extraction:
            User Response: "Yes"
            Policy Q1: "Where is it located?"
            Output: {{"Where is it located?": ""}}
            (No location provided, so empty string)

            Example 3 - Skip Handling:
            User Response: "I'll need to check on that later"
            Policy Q1: "What is the box number?"
            Output: {{"What is the box number?": "skip"}}

            Example 4 - Multiple Policies:
            User Response: "It's in the safe at home, box number 456"
            Policy Q1: "Where is it located?"
            Policy Q2: "What is the box number?"
            Output:
            {{
                "policy_questions": [
                    {{"Where is it located?": "in the safe at home"}},
                    {{"What is the box number?": "456"}}
                ]
            }}

            Example 5 - Unknown/Negative Information:
            User Response: "Yes, the divorce papers are available, but they are not stored in a specific or known location."
            Policy Q1: "Where are the divorce/separation papers located?"
            Output:
            {{
                "policy_questions": [
                    {{"Where are the divorce/separation papers located?": "Unknown location"}}
                ],
                "found": true
            }}

            OUTPUT FORMAT:
            Return JSON with this EXACT structure:
            {{
                "user_response": "{user_response}",
                "seed_question": {{"{seed_question}": "FULL original user response preserving ALL information"}},
                "policy_questions": [
                    {{"actual_policy_question_1": "extracted answer text"}},
                    {{"actual_policy_question_2": ""}}
                ],
                "found": true/false
            }}

            IMPORTANT: For seed_question, return the FULL original user response preserving ALL information provided, not just what matches policy questions.
            Set "found" to true if ANY policy question has a non-empty string answer, otherwise false.
            The keys in policy_questions MUST be the exact question text provided above.
            """

    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        raw = completion.choices[0].message.content.strip()

        

        try:
            data = json.loads(raw)

            # Validate structure based on mode
            if "found" not in data:
                data["found"] = False
            if "user_response" not in data:
                data["user_response"] = user_response

            # Handle seed_question validation
            if "seed_question" not in data:
                if is_dynamic:
                    data["seed_question"] = {seed_question: []}
                else:
                    data["seed_question"] = {seed_question: ""}

            # Handle policy_questions validation
            if "policy_questions" not in data or not isinstance(data["policy_questions"], list):
                if is_dynamic:
                    data["policy_questions"] = [{q: []} for q in policy_questions]
                else:
                    data["policy_questions"] = [{q: ""} for q in policy_questions]

            # Validate found flag based on mode
            has_extraction = False

            if is_dynamic:
                # For dynamic mode: check if any array has non-empty objects
                # Check seed_question
                for value in data["seed_question"].values():
                    if isinstance(value, list) and len(value) > 0:
                        # Check if any object in array has non-empty values
                        for obj in value:
                            if isinstance(obj, dict):
                                for v in obj.values():
                                    if v and str(v).strip() not in ["", "none", "n/a"]:
                                        has_extraction = True
                                        break
                            if has_extraction:
                                break
                    if has_extraction:
                        break

                # Check policy_questions
                if not has_extraction:
                    for policy_dict in data["policy_questions"]:
                        if isinstance(policy_dict, dict):
                            for value in policy_dict.values():
                                if isinstance(value, list) and len(value) > 0:
                                    for obj in value:
                                        if isinstance(obj, dict):
                                            for v in obj.values():
                                                if v and str(v).strip() not in ["", "none", "n/a"]:
                                                    has_extraction = True
                                                    break
                                        if has_extraction:
                                            break
                                if has_extraction:
                                    break
                        if has_extraction:
                            break
            else:
                # For non-dynamic mode: check if any string is non-empty
                # Check seed_question
                for value in data["seed_question"].values():
                    if isinstance(value, str) and value.strip() not in ["", "none", "n/a"]:
                        has_extraction = True
                        break

                # Check policy_questions
                if not has_extraction:
                    for policy_dict in data["policy_questions"]:
                        if isinstance(policy_dict, dict):
                            for value in policy_dict.values():
                                if isinstance(value, str) and value.strip() not in ["", "none", "n/a"]:
                                    has_extraction = True
                                    break
                        if has_extraction:
                            break

            data["found"] = has_extraction
            print(json.dumps({
                "log_type": "extract_policy_cluster",
                "mode": "dynamic" if is_dynamic else "non-dynamic",
                "seed_question": seed_question,
                "user_response": user_response,
                "policy_questions": policy_questions,
                "raw_extraction": raw,
                "has_extraction": has_extraction,
            }), flush=True)

            return data

        except (json.JSONDecodeError, ValueError) as e:
            print(f"JSON decode error in extract_policy_cluster: {e}")
            # Return fallback structure based on mode
            if is_dynamic:
                return {
                    "user_response": user_response,
                    "seed_question": {seed_question: []},
                    "policy_questions": [{q: []} for q in policy_questions],
                    "found": False
                }
            else:
                return {
                    "user_response": user_response,
                    "seed_question": {seed_question: ""},
                    "policy_questions": [{q: ""} for q in policy_questions],
                    "found": False
                }

    except Exception as e:
        print(f"OpenAI API Error in extract_policy_cluster: {type(e).__name__} - {e}")
        # Return fallback structure based on mode
        if is_dynamic:
            return {
                "user_response": user_response,
                "seed_question": {seed_question: []},
                "policy_questions": [{q: []} for q in policy_questions],
                "found": False
            }
        else:
            return {
                "user_response": user_response,
                "seed_question": {seed_question: ""},
                "policy_questions": [{q: ""} for q in policy_questions],
                "found": False
            }

def extract_policy_answers_cluster_mode_v2(input_data: dict) -> dict:
    """
    Unified extraction function for cluster mode that uses a single prompt for both scenarios.
    Processes each user individually when user_response is a dict, or processes a single response when it's a string.
    
    Uses a single unified prompt that combines all questions (seed + policy) into a list.
    The prompt adapts automatically based on whether a specific user is provided.
    Extracts results for both seed and policy questions from the LLM response.
    
    Handles TWO scenarios with unified logic:
    1. WITH Dynamic Function: user_response is dict {"Dep1": "ans", "Dep2": "ans", "reason": "..."}
       - Filters out "reason" key automatically
       - Processes each user individually
       - Returns arrays: [{"Dep1": "ans"}, {"Dep2": "ans"}]
    
    2. WITHOUT Dynamic Function: user_response is string
       - Processes single response
       - Returns simple strings: "extracted answer"
    
    Args:
        input_data: {
            "user_response": dict OR str,  # Dict for dynamic, string for non-dynamic
            "seed_question": str,
            "policy_questions": list[str],
            "all_users": list[str]  # Optional: list of all user names for context
        }
    
    Returns WITH Dynamic Function:
        {
            "user_response": {"Dep1": "ans", "Dep2": "ans"},
            "extraction_results": {
                "seed_question": {"question": [{"Dep1": "ans"}, {"Dep2": "ans"}]},
                "policy_questions": [
                    {"policy_q1": [{"Dep1": "ans"}, {"Dep2": "ans"}]},
                    {"policy_q2": []}
                ]
            },
            "found": bool
        }
    
    Returns WITHOUT Dynamic Function:
        {
            "user_response": "str",
            "extraction_results": {
                "seed_question": {"question": "extracted answer"},
                "policy_questions": [
                    {"policy_q1": "extracted answer"},
                    {"policy_q2": ""}
                ]
            },
            "found": bool
        }
    """
    user_response = input_data.get("user_response", "")
    seed_question = input_data.get("seed_question", "")
    policy_questions = input_data.get("policy_questions", [])
    all_users = input_data.get("all_users", [])
    current_question = input_data.get("current_question", "")

    # Detect if this is dynamic function mode (dict) or non-dynamic (string)
    is_dynamic = isinstance(user_response, dict)
    
    if not policy_questions:
        combined_results = {
            "seed_question": {seed_question: [] if is_dynamic else ""},
            "policy_questions": []
        }
        return {
            "user_response": user_response,
            "extraction_results": combined_results,
            "found": False
        }
    
    # Format questions list for the prompt (combine seed question and policy questions)
    all_questions = [seed_question] + policy_questions
    questions_list = "\n".join([f"{i+1}. {q}" for i, q in enumerate(all_questions)])
    
    # Normalize input: convert both dict and string to a unified list structure
    if is_dynamic:
        # Dynamic mode: Filter out 'reason' key and create list of (user, response) tuples
        entries = [(key, user_response.get(key, "")) for key in user_response.keys() if key != "reason"]
    else:
        # Non-dynamic mode: Treat as single entry with no specific user
        entries = [(None, user_response)]
    
    # Results structure - use list for dynamic mode, dict for non-dynamic mode
    seed_results = [] if is_dynamic else ""
    policy_results = {q: [] for q in policy_questions} if is_dynamic else {}
    extra_info = {}  # person key -> list of strings (preserve LLM keys e.g. {"selena": ["..."]})
    found = False
    # logprobs_array = []  # Store logprobs per user
    
    # Process each entry using unified prompt
    for user, response_text in entries:
        # Build unified prompt that works for both scenarios
        # don't really need the user name since one user at a time
        # user_section = f"\nUser: {user}\n" if user else ""

        prompt = f"""
        User: {user}

        Questions:
        {questions_list}

        Current Question Being Asked: {current_question}

        Answer: {response_text}

        **SCOPE DETERMINATION:**
        First, determine if this answer addresses ONLY the current question, or if it contains additional information for other questions.
        
        - Simple acknowledgments (yes/no/I do/there is one/there are) → ONLY extract for the current question
        - Answer contains "and", "also", multiple clauses, or additional specific details (dates, locations, quantities, names) → May address multiple questions

        **INSTRUCTIONS:**
        Process each question individually and extract relevant information from the answer for each question

        **FOR NON-CURRENT QUESTIONS:**
        - If the question is NOT the current question, return "" UNLESS the answer contains specific information (names, numbers, locations, dates, yes/no confirmations, or descriptive phrases whose key terms match the question's topic) that directly addresses it.
        - Simple yes/no/acknowledgment answers with NO topic keywords apply ONLY to the current question.
        - **NEGATION RULE**: If the response explicitly states that the care recipient does NOT need / doesn't need [something] and that something matches a non-current question's topic, extract "no" for that question. Example: "yes but they don't need help with carrying groceries" → current question gets "yes", the carrying-groceries question gets "no".
        - If specific information IS present for a non-current question, EXTRACT it into that question's result — do NOT put it in extra_info.

        **CRITICAL EXTRACTION RULES:**
        - Extract ONLY information that is EXPLICITLY stated in the answer that directly addresses the question
        - DO NOT fabricate facts, make unsupported logical deductions, or draw conclusions not present in the response
        - **TOPIC KEYWORD MATCHING** is allowed and is NOT inference: if a phrase uses a key term from a question, extract it for that question — regardless of whether the phrase expresses a limitation ("cannot drive"), a capability ("can get to appointments"), an action ("uses buses"), or a preference. Do NOT skip a phrase solely because it says the care recipient CAN do something rather than explicitly NEEDS help; how they manage an activity is still a direct answer to the question about that activity.
        - If the answer does not explicitly state information that directly addresses the question, return "" for the result
        - Being "reviewed" or "amended" does NOT mean something is "up to date" unless explicitly stated
        - Related information that seems relevant but doesn't directly answer the question should be ignored
        - **SPECIAL CASE:** If the response_text is "no" or "skip" (case-insensitive, exact match or standalone), return that exact value as the result for the current question. Do NOT return "" for these responses - they are valid answers that should be preserved.
        - **THIRD-PARTY HELP/CARE RULE (CRITICAL):** When the answer says that a third person or organization *takes care of*, *handles*, *manages*, *drives*, *stores*, *maintains*, *pays for*, *assists with*, or otherwise provides help/support for the subject/entity being asked about, and that help clearly matches a question's topic, you MUST treat this as an explicit positive signal for that question.
            - In these cases, you MUST NOT return "no" for that question.
            - Prefer a short, concrete phrase describing who provides the help and what they help with, instead of returning "no" or leaving it blank.
            - If multiple subjects/entities share the same help statement, apply the same positive result to each applicable subject/entity for the matching question, and NEVER mark them as "no".

        **EXTRA INFORMATION Rules:**
        - In extra_info, ALWAYS use the actual user name as the key and include only those concrete details from the answer that are not included in any question's result; never duplicate in extra_info any wording that already appears in a result.
        - If a piece of information directly answers any question (current or policies), it MUST appear in that question's result for that user and MUST NOT appear only in extra_info.
        - If there is no such leftover information that does not answer any question, set "extra_info" to "".

        Return a JSON object with:
        - "results": an array where each element corresponds to a question in the same order
        - "extra_info": any additional context or information that doesn't directly answer the questions

        Each element in "results" should have:
        - "question": the question text
        - "result": the extracted information (or "" if no relevant information)
        - "reason": brief explanation of why this result was extracted

        OUTPUT RULES (critical):
        - Return ONLY the raw JSON object. No markdown, no code fences, no explanation before or after.
        - Use strictly valid JSON.
        Output format:
        {{
            "results": [
                {{"question": "question 1", "result": "result 1", "reason": "reason 1"}}, 
                {{"question": "question 2", "result": "result 2", "reason": "reason 2"}}
            ],
            "extra_info": {{"{user}": "additional context that doesn't answer specific questions"}}
        }}
        """

        try:
            groq_client = groq.Client(api_key=os.getenv("GROQ_API_KEY"))
            completion = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            raw = completion.choices[0].message.content.strip()
            
            # Store logprobs for this user
            # logprobs_array.append({
            #     "user": user if user else "single_response",
            #     "logprobs": logprobs_to_dict(completion.choices[0].logprobs)
            # })
            
            # Clean up the response
            raw = clean_llm_json_response(raw)
            
            # Parse JSON response
            results = json.loads(raw)
            # print(f"{user}: {prompt}\n{results}\n")
            
            # Process results - extract both seed and policy question results
            seed_answer = ""
            _results = results.get("results", [])
            extracted_extra = results.get("extra_info", "")
            # LLM returns extra_info as dict e.g. {"selena": "Kelly hired..."}; keep person as key
            if isinstance(extracted_extra, dict):
                for person_key, val in extracted_extra.items():
                    if person_key is not None and val is not None and str(val).strip():
                        extra_info.setdefault(str(person_key), []).append(str(val).strip())
            elif extracted_extra is not None and str(extracted_extra).strip():
                person_key = user if user else ""
                extra_info.setdefault(person_key, []).append(str(extracted_extra).strip())

            for i, result in enumerate(_results):
                question_text = result.get("question", "")
                extracted_result = result.get("result", "")
                reason = result.get("reason", "")
                
                if i == 0:
                    # Seed question (index 0)
                    seed_answer = extracted_result if extracted_result and extracted_result.strip() not in ["", "none", "n/a"] else ""
                    if seed_answer:
                        found = True
                else:
                        # Policy questions (index 1 onwards)
                        policy_idx = i - 1
                        if policy_idx < len(policy_questions):
                            policy_q = policy_questions[policy_idx]
                            if extracted_result and extracted_result.strip() not in ["", "none", "n/a"]:
                                if is_dynamic:
                                    policy_results[policy_q].append({user: extracted_result})
                                else:
                                    policy_results[policy_q] = extracted_result
                                found = True
                            else:
                                # Include empty entry to maintain structure
                                if is_dynamic:
                                    policy_results[policy_q].append({user: ""})
                                else:
                                    policy_results[policy_q] = ""
            
            # Store seed answer from extraction
            if is_dynamic:
                seed_results.append({user: seed_answer})
            else:
                seed_results = seed_answer
                
        except (json.JSONDecodeError, ValueError) as e:
            error_msg = f"JSON decode error for {user}" if user else "JSON decode error"
            print(f"{error_msg}: {e}")
            # Fallback: use empty string for seed answer (extraction failed)
            if is_dynamic:
                seed_results.append({user: ""})
                # Add empty entries for all policy questions
                for policy_q in policy_questions:
                    policy_results[policy_q].append({user: ""})
            else:
                seed_results = ""
                for policy_q in policy_questions:
                    policy_results[policy_q] = ""
        except Exception as e:
            error_msg = f"Error processing {user}" if user else "Error processing"
            print(f"{error_msg}: {type(e).__name__} - {e}")
            # Fallback: use empty string for seed answer (extraction failed)
            if is_dynamic:
                seed_results.append({user: ""})
                # Add empty entries for all policy questions
                for policy_q in policy_questions:
                    policy_results[policy_q].append({user: ""})
            else:
                seed_results = ""
                for policy_q in policy_questions:
                    policy_results[policy_q] = ""
    
    # Build final structure - combine seed and policy results
    if is_dynamic:
        policy_questions_list = [{q: policy_results[q]} for q in policy_questions]
    else:
        policy_questions_list = [{q: policy_results.get(q, "")} for q in policy_questions]
    
    # Combine seed and policy extraction results; extra_info is dict person -> list (handler merges by key)
    combined_results = {
        "seed_question": {seed_question: seed_results},
        "policy_questions": policy_questions_list,
        "extra_info": extra_info
    }

    print(json.dumps({
        "log_type": "extract_policy_answers_cluster_mode_v2",
        "input_data": input_data,
        "mode": "dynamic" if is_dynamic else "non-dynamic",
        "extraction_results": combined_results,
        "found": found,
        # "logprobs": logprobs_array,
    }), flush=True)
    
    return {
        "user_response": user_response,
        "extraction_results": combined_results,
        "found": found
    }

def extract_policy_answers_personal_mode(input_data: dict) -> dict:
    """
    Extract policy answers from user response in PERSONAL MODE (single user).

    Args:
        input_data: {
            "user_response": str,      # Actual user response
            "seed_question": str,      # Actual seed question
            "policy_questions": list   # List of policy questions
        }

    Returns:
        {
            "user_response": str,
            "seed_question": {"actual_seed_question": ""},  # Usually empty
            "policy_questions": [
                {"actual_policy_q1": "simple answer text"},
                {"actual_policy_q2": ""}
            ],
            "found": bool
        }
    """
    # Extract parameters
    user_response = input_data.get("user_response", "")
    seed_question = input_data.get("seed_question", "")
    policy_questions = input_data.get("policy_questions", [])

    if not policy_questions:
        return {
            "user_response": user_response,
            "seed_question": {seed_question: ""},
            "policy_questions": [],
            "found": False
        }

    # Build policy questions list
    policy_questions_list = "\n".join(f"{i+1}. {q}" for i, q in enumerate(policy_questions))

    prompt = f"""You are analyzing a user's response to extract policy information in PERSONAL MODE (single user).

                CONTEXT:
                - Question Asked: "{seed_question}"
                - User's Response: "{user_response}"
                - Policy Questions to Check:
                {policy_questions_list}

                YOUR TASK:
                Extract answers for each policy question from the user's response. Return simple answer strings.

                RULES FOR PERSONAL MODE:

                1. **Simple Format**:
                - Return just the answer text: "in the safe" or "yes" or "skip"
                - NO dependent names needed
                - Example: Just "Blue Cross Blue Shield", not "User: Blue Cross Blue Shield"

                2. **Empty String**:
                - ONLY return empty string "" if the user's response has ZERO information about that policy question
                - If user explicitly states they DON'T KNOW, CAN'T REMEMBER, or DON'T HAVE the information → DO NOT return empty string, extract the negative statement
                - Don't guess or infer beyond what's stated

                3. **Answer Types**:
                - Specific information: Extract exact text ("Chase Bank", "BC123456", "$450/month")
                - Skip: User expresses uncertainty ("skip", "I'll provide later", "not sure")
                - No: Definitive absence ("no", "don't have", "N/A")
                - Yes: Simple affirmation for yes/no questions
                - Unknown/Negative: Extract statements indicating lack of knowledge ("don't know", "not in a specific location", "location unknown")

                4. **CRITICAL - Negative/Unknown Information Extraction**:
                - MUST extract when user explicitly states lack of knowledge or negative information
                - "not in a specific location" / "not stored in a known location" → EXTRACT as "Unknown location"
                - "don't know where" / "unsure of location" → EXTRACT as "Unknown"
                - "I don't have that information" → EXTRACT as "skip"
                - "don't have" / "doesn't exist" → EXTRACT as "No"
                - Empty string ONLY when response has zero relevance to the policy question
                - **SCOPE RULE**: A generic uncertainty ("I don't remember", "not sure", "I'll check later") applies ONLY to the policy question it is directly about — return the uncertainty value for that one question only, and return "" (empty string, not "Unknown" or "skip") for ALL other policy questions. Do NOT propagate the uncertainty to questions that were not directly asked.
                - **MULTI-CLAUSE RULE**: When a response contains multiple distinct pieces of information (e.g. "It's in the safe. Sarah is the beneficiary. Yes, my attorney has a copy."), map each piece to the specific policy question it answers — do NOT skip or leave any answered question as "".

                5. **Keep It Concise**:
                - Extract only relevant portion that answers the question
                - Remove conversational fluff
                - Example: "Yes, it's Blue Cross" → extract "Blue Cross"

                EXAMPLES:

                Example 1 - Full Extraction:
                User Response: "Yes, through Blue Cross Blue Shield. Policy number BC123456 and I pay $450 per month"
                Policy Questions:
                1. "What is the insurance provider name?"
                2. "What is the policy number?"
                3. "What is the monthly premium?"

                Output:
                {{
                    "policy_questions": [
                        {{"What is the insurance provider name?": "Blue Cross Blue Shield"}},
                        {{"What is the policy number?": "BC123456"}},
                        {{"What is the monthly premium?": "$450 per month"}}
                    ],
                    "found": true
                }}

                Example 2 - Partial Extraction:
                User Response: "I have insurance through Aetna but I'll need to check the policy number"
                Policy Questions:
                1. "What is the insurance provider?"
                2. "What is the policy number?"

                Output:
                {{
                    "policy_questions": [
                        {{"What is the insurance provider?": "Aetna"}},
                        {{"What is the policy number?": "skip"}}
                    ],
                    "found": true
                }}

                Example 3 - No Extraction:
                User Response: "Yes"
                Policy Questions:
                1. "Where is it located?"
                2. "What is the account number?"

                Output:
                {{
                    "policy_questions": [
                        {{"Where is it located?": ""}},
                        {{"What is the account number?": ""}}
                    ],
                    "found": false
                }}

                Example 4 - Skip Handling:
                User Response: "I'll need to check on that later"
                Policy Questions:
                1. "Is the passport current or expired?"

                Output:
                {{
                    "policy_questions": [
                        {{"Is the passport current or expired?": "skip"}}
                    ],
                    "found": true
                }}

                Example 5 - Unknown/Negative Information:
                User Response: "Yes, the divorce papers are available, but they are not stored in a specific or known location."
                Policy Questions:
                1. "Where are the divorce/separation papers located?"

                Output:
                {{
                    "policy_questions": [
                        {{"Where are the divorce/separation papers located?": "Unknown location"}}
                    ],
                    "found": true
                }}

                Example 6 - Multi-clause covering multiple policy questions:
                User Response: "It's in the safe deposit box at Chase Bank. My kids Sarah and Tom are the beneficiaries. Yes, my attorney Robert has a copy."
                Policy Questions:
                1. "Where is the will located?"
                2. "Who are the beneficiaries?"
                3. "Does your attorney have a copy of the will?"

                Output:
                {{
                    "policy_questions": [
                        {{"Where is the will located?": "safe deposit box at Chase Bank"}},
                        {{"Who are the beneficiaries?": "Sarah and Tom"}},
                        {{"Does your attorney have a copy of the will?": "yes"}}
                    ],
                    "found": true
                }}

                Example 7 - Yes/No policy question answered alongside location:
                User Response: "Yes she has a copy. The original is locked in the bedroom safe."
                Policy Questions:
                1. "Where is the will located?"
                2. "Who are the beneficiaries?"
                3. "Does your attorney have a copy of the will?"

                Output:
                {{
                    "policy_questions": [
                        {{"Where is the will located?": "bedroom safe"}},
                        {{"Who are the beneficiaries?": ""}},
                        {{"Does your attorney have a copy of the will?": "yes"}}
                    ],
                    "found": true
                }}

                OUTPUT FORMAT:
                Return JSON with this EXACT structure:
                {{
                    "user_response": "{user_response}",
                    "seed_question": {{"{seed_question}": ""}},
                    "policy_questions": [
                        {{"actual_policy_question_1": "answer_text"}},
                        {{"actual_policy_question_2": ""}}
                    ],
                    "found": true/false
                }}

                Set "found" to true if ANY policy question has a non-empty answer, otherwise false.
                The keys in policy_questions MUST be the exact question text provided above.
                """

    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        raw = completion.choices[0].message.content.strip()

        try:
            data = json.loads(raw)

            # Validate structure
            if "found" not in data:
                data["found"] = False
            if "user_response" not in data:
                data["user_response"] = user_response
            if "seed_question" not in data:
                data["seed_question"] = {seed_question: ""}
            if "policy_questions" not in data or not isinstance(data["policy_questions"], list):
                data["policy_questions"] = [{q: ""} for q in policy_questions]

            # Validate found flag
            has_extraction = False
            for policy_dict in data["policy_questions"]:
                if isinstance(policy_dict, dict):
                    for value in policy_dict.values():
                        if value and value != "":
                            has_extraction = True
                            break

            data["found"] = has_extraction

            print(json.dumps({
                "log_type": "extract_policy_personal",
                "seed_question": seed_question,
                "user_response": user_response,
                "policy_questions": policy_questions,
                "raw_extraction": raw,
                "has_extraction": has_extraction,
            }), flush=True)
            
            return data

        except (json.JSONDecodeError, ValueError) as e:
            print(f"JSON decode error in extract_policy_personal: {e}")
            return {
                "user_response": user_response,
                "seed_question": {seed_question: ""},
                "policy_questions": [{q: ""} for q in policy_questions],
                "found": False
            }

    except Exception as e:
        print(f"OpenAI API Error in extract_policy_personal: {type(e).__name__} - {e}")
        return {
            "user_response": user_response,
            "seed_question": {seed_question: ""},
            "policy_questions": [{q: ""} for q in policy_questions],
            "found": False
        }

def extract_data_by_user(input_data: dict) -> dict:
    users = input_data.get("users", [])
    user_response = input_data.get("user_response", "")
    question = input_data.get("question", "")
    prompt = f"""
        Users: {users}
        question: {question}
        Context: "I"/"me"/"my" refers to the person answering the question
        IMPORTANT: Use the step-by-step process below to THINK through the problem, but your FINAL OUTPUT must be ONLY a JSON object with no steps, reasoning, or explanations.

        CRITICAL RULES - Follow these EXACTLY:

        0. KEY/VALUE PAIR RULE: If the text contains "User1=value, User2=value" format, parse these FIRST:
        - Split by user name assignments (User=)
        - Extract each user's specific value
        - Then process any remaining text that applies to ALL users
        - Example: "Kelly=yes, Bobby=yes and Judith Brown, 212 555-1233 is the executor of the will"
            → Kelly: yes
            → Bobby: yes, Judith Brown 212 555-1233 is the executor of the will

        0b. USER NAME AS SOLE RESPONSE: If the ENTIRE response is ONLY a single word or name with no other content:

            CASE A — Name IS in the Users list:
            - Return "yes" for that user and "no" for all other users.
            - Naming a user is an affirmation for that user only.
            - Example: users=["sarah","tom","lisa"], question="Who volunteered to coordinate the move?", response="Sarah"
            → sarah: "yes", tom: "no", lisa: "no"

            CASE B — Name/word is NOT in the Users list:
            - This is a third-party name answering the question for everyone.
            - Apply the response as-is to ALL users. Do NOT assign "no" to any user.
            - Fall through to Rule 1 (Standalone Answer Rule).
            - Example: users=["living room","bedroom","garage","basement"], question="Who is the designated contractor for repairs?", response="Mike Torrino"
            → living room: "Mike Torrino"
            → bedroom: "Mike Torrino"
            → garage: "Mike Torrino"
            → basement: "Mike Torrino"

            CASE C — Yes/No existence question + name response:
            - If the question asks about existence or preference (e.g., "Does your dependent have a preferred pool service?", "Do you have a lawn service?", "Does X have a preferred Y?") AND the response is a single name/word that is NOT in the Users list:
            - The name IS an affirmative answer — giving the name means "yes, we have one, and here is the name."
            - Return "yes, [name]" for ALL users. Do NOT assign "no" to any user.
            - Example: users=["East Rockaway", "Sayville"], question="Does your dependent have a preferred pool service?", response="Jimmy"
            → East Rockaway: "yes, Jimmy"
            → Sayville: "yes, Jimmy"

        1. STANDALONE ANSWER RULE: If NO user name from the Users list appears anywhere in the response, apply the entire response as-is to ALL users. Do NOT interpret, infer, or map it to "yes"/"no" — preserve the exact text. STOP — do NOT apply Rules 1c/1d/1e.
        EXCEPTION: If the response contains "everyone", "all", or "both", skip this rule and apply Rule 1b instead.
        IMPORTANT: A name NOT in the Users list is a third party (e.g. a service provider) — it does NOT disqualify this rule. Apply the entire response to ALL users regardless of other names present.
        CRITICAL: When applying the response to users, include EVERY clause—do not drop or omit parts such as "I don't know their name", "don't know the name", "not sure about X", etc. Preserve both uncertain/negative parts and positive details (e.g. "don't know name, can be contacted at 85474125653").

        1b. "EVERYONE" KEYWORD RULE: When you see "everyone", "all", "both":
        - Extract the main fact (e.g., "has an estate plan")
        - Check for exceptions: "except for [User]", "but not [User]"
        - CRITICAL: Create two lists:
        * EXCLUDED users = [users mentioned in exception]
        * INCLUDED users = [ALL other users from the Users list]
        - Apply main fact + descriptive info to EVERY SINGLE user in INCLUDED list
        - Example: Users=[A,B,C], "everyone has X but not A and stored in Y"
        * EXCLUDED=[A], INCLUDED=[B,C]
        * B gets: has X, stored in Y
        * C gets: has X, stored in Y
        * A gets: no

        1c. INCOMPLETE VERB PHRASE / SKIP / NEGATIVE RULE:
            
            Process each sentence/clause separately. Look for patterns where users are mentioned:
            
            a) SKIP/DEFER phrases - apply "skip" to that specific user:
            Patterns to recognize:
            - "[user] skip/pass/later"
            - "don't know about [user]"
            - "not sure about [user]"
            - "come back to [user] later"
            - "let's move on from [user]"
            - "[user] I'll answer later"
            
            Examples: "don't know", "I'll answer later", "pass", "skip", "i don't want to", 
            "let's talk about something else", "let's move on", "i am not sure", 
            "come back to me later", "come back to [user] later", "not ready to answer",
            "not sure about [user]", "don't know about [user]"
            
            * "Zohan skip" → "Zohan":"skip", others:"no"
            * "let's come back to Zohan later" → "Zohan":"skip", others:"no"
            * "not sure about Carol" → "Carol":"skip", others:"no"
            * "I am not sure about Carol" → "Carol":"skip", others:"no"
            * "Zimmon skip. Zohan later" → "Zimmon":"skip", "Zohan":"skip"
            
            b) NEGATIVE phrases - apply "no" to that specific user:
            Patterns to recognize:
            - "[user] no/nope/cannot/doesn't"
            - "[user] does not"
            - "[user] will not"
            
            Examples: "no", "nope", "cannot", "does not", "doesn't", "can't", 
            "will not", "won't", "negative", "false"
            
            * "Zohan cannot" → "Zohan":"no", others:"no"
            * "Bob nope" → "Bob":"no", others:"no"
            * "Bob does not" → "Bob":"no", others:"no"
            
            c) INCOMPLETE VERB phrases - apply the verb phrase to that user:
            * "Zohan does" → "Zohan":"does", others:"no"
            * "Zohan will" → "Zohan":"will", others:"no"
            
            d) MULTIPLE USERS IN ONE RESPONSE (compound sentences):
            * "Zehran does not and I am not sure about Zohan" → "Zohan":"no", "Zehran":"skip"
            * "Zehran cannot. Let's come back to Zohan later" → "Zohan":"no", "Zehran":"skip"
            * "Zohan skip. Zimmon skip" → "Zohan":"skip", "Zimmon":"skip"
            * "Alice has one but not sure about Bob" → "Alice":"has one", "Bob":"skip"
            
            e) If NO user names are mentioned in the entire response:
            - SKIP/DEFER phrase → apply "skip" + the entire response to ALL users
            - NEGATIVE phrase → apply "no" + the entire response to ALL users
              EXCEPTION: If the response starts with "yes"/"yeah" followed by "but"/"however"/"although" + a negation, the answer is still affirmative — apply the full response as-is to ALL users.
              Example: "yes but doesn't need help carrying groceries" → apply as-is to ALL users

        1d. LITERAL/DESCRIPTIVE TEXT RULE:
            If the text doesn't match any skip/defer, negative, or verb phrase patterns,
            preserve it exactly as written.
            
            Examples:
            - "9 packages" → "9 packages"
            - "blue folder" → "blue folder"
            - "safety deposit box 147" → "safety deposit box 147"
            
        1e. EXPLICIT USER MENTION RULE:
        - If specific user(s) from the Users list are mentioned by name with descriptive information (not skip/negative/verb phrases)
        - And other users from the list are NOT mentioned anywhere in the text
        - Mentioned users get the descriptive information
        - Unmentioned users get "no"
        - Only apply this rule when the mentioned name is IN the Users list. Names NOT in the Users list are third parties (service providers or other unrelated parties) — supporting context only. Do NOT apply "no" to users because a third party was mentioned. Use Rule 2 or Step 3 instead.
        - Do NOT apply this rule if a prior generic/group clause ("needs help", "needs assistance", "they do/they don't", "everyone/all/both") already answers the question for all users. In that case, keep the generic clause for every user and treat later user-specific mentions as extra details only.

        1f. THIRD-PARTY RESPONDENT RULE:
            If the question asks whether [user] needs assistance with X
            and the response is "I do X" / "I handle X" / "I prepare X" / "I provide X" → extract "yes" for that user,
            since the respondent doing it on their behalf means the user needs that assistance.
            Example: Question="Does Mom need help with meals?" + "I prepare the meals" → {{"mom": "yes"}}

        1g. GLOBAL GROUP FACT RULE:
        - If the answer begins with a generic statement about the group (for example: "needs help", "needs assistance", "they do", "they don't have their own car", "they need help with laundry", "they do store it offsite") and later adds user-specific details, treat the generic part as a base fact for ALL users and append the extra details only to the mentioned users. Do NOT drop or contradict the earlier group fact unless the text explicitly says an exception (for example: "except for [user]", "but not [user]").

        1h. GROUP YES/NO ANCHOR RULE:
        - For yes/no questions that apply to each user, treat the first clear group-level yes/no phrase ("yes", "no", "they do", "they don't", "it's not", "no, they are not") as the default answer for ALL users. Later user-specific clauses add description but MUST NOT flip that yes/no unless the text explicitly states an exception (for example: "except for [user] who does not", "everyone except [user] has X").

        1i. OWNER NAME ORDER RULE ("respectively"):
        - When the answer lists multiple owner names together with the word "respectively" (for example: "Jenna and Jake are listed as owners ... respectively", "Lisa and Pam are listed as owners ... respectively"), IGNORE the order of the property/vehicle names in that phrase and simply map owner names to the Users list IN ORDER.
        - For each user, you MUST explicitly include the corresponding owner name. Attach text like "listed as owner is [Name]" (or equivalent wording) to each user, and keep any group-level "they do"/"they have" information together with these owner details. Never drop or omit the owner names when they are provided in the response.

        1j. TARGETED "VALUE FOR USER" RULE:
        - If the response contains the pattern "<value> for <User>" where <User> matches one of the provided `Users` items (case-insensitive), apply that <value> as an affirmative answer ONLY to that <User>.
        - All other users should be "no" unless they are mentioned elsewhere with additional explicit facts.

        2. PRONOUN/UNSPECIFIED SUBJECT RULE:
        - If a clause uses "they/them/their" (but does NOT say "them both"/"both of them"/"all of them") and is referring back to an explicitly mentioned subset of Users in the response (for example: "yes David and Jake ... they ...", where David and Jake are in the Users list), scope that pronoun clause ONLY to that explicitly mentioned subset (not the whole Users list).
        - When a sentence uses only group pronouns like "he", "she", "it", "they", "them", "them both", "both of them", "all of them", "the will", or "the document" without naming any specific user from the Users list, treat that entire clause as applying to the whole group. You MUST attach that clause to EVERY user in the Users list.
        - When such a clause describes a helper or service provider doing something for "them"/"them both"/"all of them", you MUST include the helper's name and action in each user's final value. If any user receives this helper clause, you MUST ensure that every other user in the Users list also includes the same helper clause (never leave one user with only "yes" while another has the full helper description).
        - If a clause contains an explicit user name from the Users list in possessive/relationship form (e.g., "[Name]'s [noun]" or "[Person] is [Name]'s [relation]"), then the ENTIRE clause segment that contains that possessive/relationship MUST be assigned ONLY to that named user. Do NOT copy that relationship/possessive clause to any other user, even if other parts of the same sentence use group pronouns (e.g., "Jamie assists them").
        - If NO names from the Users list appear anywhere in the response (including when users are identifiers like car brands), apply the ENTIRE response to ALL users. Do NOT assign "no" to any user - they all get the full descriptive answer.
        - Example: "it's stored in the safe. Steven's will has been reviewed." → Steven gets BOTH facts: "stored in safe" AND "will reviewed"
        - Example: Users=["honda","kia"], "once a year from Jake mechanics, costs 300-500 usd, they are taken to Ben dealership when Jake is not available" → honda: serviced once a year from Jake mechanics..., kia: serviced once a year from Jake mechanics... (BOTH get the full answer; Jake/Ben are third parties, not users)

        3. POSSESSIVE PATTERN: When you see "User1 and User2's [item]", ALL following information about that [item] applies to BOTH User1 and User2.

        4. THIRD PARTY PATTERN: When you see "the [person1] and [person2] both have a copy of [item]", you MUST:
        - List [person1] separately: "[person1] has a copy of [item]"
        - List [person2] separately: "[person2] has a copy of [item]"

        5. STEP-BY-STEP PROCESS (use this to think through the problem, but do NOT include these steps in your output):
        Step 0b: Is the ENTIRE response a single word or name with no other content?
        → CASE A: Is it in the Users list? → "yes" for that user, "no" for all others
        → CASE B: Is it NOT in the Users list? → Check CASE C first.
        → CASE C: Is the question a yes/no existence/preference question (e.g., "Does X have a preferred Y?")? → Return "yes, [name]" for ALL users
        → CASE B (fallback): Otherwise, it's a third-party answer. Apply it as-is to ALL users. Continue to Rule 1.
        Step 0: Check for key/value pairs (User=value) → Parse these first, then process remaining text
        Step 1: Check for "everyone"/"all" keywords → Extract ALL information from that sentence/clause, including compound sentences with "and"
        Step 1g: Check for "they do"/"they need"/affirmative + third party (service provider, contractor, etc.) → Apply positive answer to ALL users; third party is context only
        Step 2: Is this a standalone answer (yes/no/etc) with no names? → Apply to ALL users
        Step 3: Check if NO names from Users list appear in the response → applies to ALL users (do NOT assign "no" to any user)
        Step 4: Check if sentence uses "it" or "the [item]" (NOT group pronouns like "they"/"them") → applies to users mentioned in surrounding sentences. Group pronouns ("they", "them", "them both", "both of them", "all of them") are handled by Rule 2 above and must be applied to EVERY user in the Users list.
        Step 5: Identify whose item is being discussed (look for 's or possessive)
        Step 6: Find ALL facts about that item
        Step 7: Assign ALL facts to the correct owner(s)
        Step 8: CONSISTENCY CHECK FOR SHARED HELPERS:
            - After building the JSON for all users, scan for any helper/service-provider facts that use group pronouns ("they", "them", "them both", "both of them", "all of them") or clearly refer to helping "them both".
            - If at least one user has such a helper fact, you MUST ensure that every user in the Users list includes that same helper fact text in their value (do NOT leave any user with only "yes" while others have the full helper description).

        WORKED EXAMPLES:

        Example A - Group "they do" + specific user detail:
        users: ["kia", "honda"]
        question: "Does your care receiver store this vehicle offsite?"
        input: "they do honda is stored at the parking lot outside midtown"
        → kia: "yes"
        → honda: "yes, stored at the parking lot outside midtown"
            NOTE: This also applies when the specific mention uses "specially" — e.g., "they do specially Mom as she doesn't track her appointments, 
                her daughter Sara does that for her" with users ["aman", "mom"] still means ALL users get "yes", with the mentioned user getting the extra detail:
            → aman: "yes"
            → mom: "yes, doesn't track her appointments, her daughter Sara does that for her"

        Example A2 -  "yes" + specific users named (not everyone):
        users: ["USER1", "USER2", "USER3"]
        question: "Does the care recipient need any assistance with shopping or preparing shopping lists?"
        input: "yes USER1 and USER2 sometimes uses buses"
        → USER1: "yes, sometimes uses buses"
        → USER2: "yes, sometimes uses buses"
        → USER3: "no"  ← not mentioned, so gets "no" despite "yes" at the start
        
        Example B - Group "it's not" + specific user detail:
        users: ["kia", "honda"]
        question: "Are the owners listed on the certificate of title joint?"
        input: "its not but for honda it is setup in a trust"
        → kia: "no"
        → honda: "no, setup in a trust"

        Example C - Group "they do" + owner names with "respectively":
        users: ["house", "villa"]
        question: "Does your care receiver have the deed to this property"
        input: "they do and Jenna and Jake are listed as owners for villa and house respectively"
        → house: "yes, listed as owner is Jake"
        → villa: "yes, listed as owner is Jenna"

        Example 0b - Single third-party name (Case B):
        users: ["sailboat", "jet ski"]
        question: "Who is the registered owner on the watercraft title?"
        Input: "Marco Delgado"

        Step 0b: "Marco Delgado" is a single name with no other content.
        → Is "Marco Delgado" in the Users list? No → CASE B: third-party answer, apply to ALL users.

        Output:
        sailboat: Marco Delgado
        jet ski: Marco Delgado

        Example 0 - Key/Value pairs:
        Input: "Madison=yes, Silvia=yes and Judith Brown, 212 555-1233 is the executor of the will"

        Step 0: Found key/value pairs!
        - Madison=yes → Madison gets "yes"
        - Silvia=yes → Silvia gets "yes"
        - Remaining text: "and Judith Brown, 212 555-1233 is the executor of the will"
        Step 2: Remaining text has no user names → applies to ALL users who were mentioned
        Output:
        Madison: yes, Judith Brown 212 555-1233 is the executor of the will
        Silvia: yes, Judith Brown 212 555-1233 is the executor of the will

        Example 1 - Standalone answer:
        Input: "yes"
        Output:
        Steven: yes
        Cameron: yes
        Madison: yes

        Example 2 - Possessive with third parties:
        Input: "Steven and Cameron's will have been reviewed by an attorney; the doctor and advocates both have a copy of the living will"

        Step 0-3: Not applicable
        Step 4: Whose item? "Steven and Cameron's will" → belongs to Steven AND Cameron
        Step 5: What facts?
        - "have been reviewed by an attorney"
        - "the doctor...have a copy of the living will"
        - "advocates...have a copy of the living will"
        Step 6: Assign:
        Steven: will reviewed by attorney, doctor has a copy of the living will, advocates have a copy of the living will
        Cameron: will reviewed by attorney, doctor has a copy of the living will, advocates have a copy of the living will

        Example 3 - Pronoun reference:
        Users: ["Steven", "Madison"]
        Input: "it's stored in the safe. Steven's will has been reviewed by an attorney. Madison's will is up to date"

        Step 2: First sentence "it's stored in the safe" has no user names
        Step 3: "it" refers to the topic being discussed (wills) - applies to ALL users
        Step 4: Second sentence - Steven's will
        Step 5: Steven's facts: "stored in safe" (from sentence 1) + "will reviewed by attorney"
        Step 6: Assign:
        Steven: stored in the safe, will reviewed by attorney
        Madison: stored in the safe, will is up to date

        Example 4 - "Everyone" keyword:
        users: ["Steven", "Cameron", "Madison"]
        Input: "everyone has a living will and the will is stored in the safe at home"

        Step 2: "everyone" explicitly means ALL users
        Steven: has a living will, will stored in the safe at home
        Cameron: has a living will, will stored in the safe at home
        Madison: has a living will, will stored in the safe at home

        Example 4b - "Everyone" with compound sentence:
        users: ["Joey", "Madison", "Silvia"]
        Input: "everyone has a Financial Power of Attorney and is stored in the bank vault"

        Step 2: "everyone" explicitly means ALL users
        - "everyone has a Financial Power of Attorney" → ALL users have it
        - "and is stored in the bank vault" → "is" refers to the Financial Power of Attorney, so ALL users' FPOA are stored in the bank vault
        Joey: has a Financial Power of Attorney, stored in the bank vault
        Madison: has a Financial Power of Attorney, stored in the bank vault
        Silvia: has a Financial Power of Attorney, stored in the bank vault

        Example 5 - "Everyone" with exception:
        Users: ["Mildred", "Casey", "Cindy"]
        Input: "everyone has an estate plan except for Casey and stored in the safe. Mildred has the beneficiaries and investment accounts distribution listed in the plan"

        Step 1: "everyone has an estate plan except for Casey and stored in the safe"
        - Exception found! "except for Casey"
        - "and stored in the safe" describes WHERE the estate plan is (describes main subject)
        - So it follows the exception rule: only applies to users who have an estate plan
        - Mildred: has an estate plan, stored in the safe
        - Cindy: has an estate plan, stored in the safe
        - Casey: does NOT have an estate plan (no storage location since no plan)

        Step 2: "Mildred has the beneficiaries and investment accounts distribution listed in the plan"
        - This is specific to Mildred only

        Output:
        Cindy: has an estate plan, stored in the safe
        Mildred: has an estate plan, stored in the safe, has the beneficiaries and investment accounts distribution listed in the plan
        Casey: no

        Now process this text using the same steps (think through it step-by-step internally):

        Text: "{user_response}"

        CRITICAL OUTPUT REQUIREMENTS:
        - Think through the steps internally, but DO NOT include any steps, reasoning, or explanations in your response
        - Make sure to utilize the question to provide context to the user response
        - Return ONLY the final JSON object
        - Do NOT include any text before or after the JSON
        - Do NOT include markdown formatting (no ```json```)
        - Do NOT show the step-by-step process in your output
        - Do NOT summarize or generalize away concrete details. Whenever the text lists specific facts, actions, items, people, places, or reasons (for example: tasks, locations, providers' names, times, conditions, or extra notes), you MUST preserve every one of those details in the relevant users' values and MUST NOT drop, merge, or omit any of them.

        Return ONLY this format (no other text):
        {{"user1": "fact1, fact2, fact3", "user2": "fact1, fact2, fact3", ...}}
        """
 

    try:
        # Groq version
        groq_client = groq.Client(api_key=os.getenv("GROQ_API_KEY"))
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
        )

        ## OpenAI version
        # completion = client.chat.completions.create(
        #     model="gpt-4o-mini",
        #     messages=[{"role": "user", "content": prompt}],
        #     temperature=0.1,
        # )
        raw = completion.choices[0].message.content
        
        # Clean up the response
        raw = clean_llm_json_response(raw)
        
        # Parse JSON response
        results = json.loads(raw)
        print(json.dumps({
            "log_type": "extract_data_by_user",
            "users": users,
            "question": question,
            "user_response": user_response,
            "results": results
        }), flush=True)
        return results
        
    except Exception as e:
        error_msg = f"Error processing extract_data_by_user"
        print(f"{error_msg}: {type(e).__name__} - {e}")
        # Fallback: assign user_response to each user in users
        return {user: user_response for user in users}

def extract_compound_sentence(input_data: dict) -> dict:
    users = input_data.get("users", [])
    sentence = input_data.get("sentence", "")

    prompt = f"""
        Users: {users}
        Text: "{sentence}"

        Extract what is true for EACH individual user. Parse the sentence carefully:

        Examples:
        - "Kelly and Bobby's report card has been reviewed by the principal; the teacher and counselor both have a copy of the report card"
            This is about Kelly and Bobby's report card, so BOTH facts apply to them:
            - Kelly: report card reviewed by principal, teacher has a copy of the report card, counselor has a copy of the report card
            - Bobby: report card reviewed by principal, teacher has a copy of the report card, counselor has a copy of the report card

        - "Kelly and Bobby's homework are in the drawer and Michael's is in the metal box"
            - Kelly: homework in drawer
            - Bobby: homework in drawer
            - Michael: homework in metal box

        - "Kelly's report card came back and the teacher and principal both have a copy"
            - Kelly: report card came back, teacher has a copy, principal has a copy

        - "everyone has a living will and the will is stored in the safe"
            - Kelly: has living will, will stored in safe
            - Bobby: has living will, will stored in safe
            - Michael: has living will, will stored in safe

        Parse carefully:
        - "both Kelly and Bobby" means those two only
        - "Kelly and Bobby but not Michael" means Kelly: yes, Bobby: yes, Michael: no
        - When you see "X and Y both have a copy of [user's item]", list X and Y separately

        Return ONLY valid JSON with each user's specific information:
        {{"user1": "their specific detail", "user2": "their specific detail", ...}}

        If nothing applies to a user, return empty string "".
        """

    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        logprobs=True,
    )

    raw = clean_llm_json_response(completion.choices[0].message.content.strip())
    results = json.loads(raw)
    print(json.dumps({
        "log_type": "extract_compound_sentence",
        "users": users,
        "sentence": sentence,
        "raw": raw,
        "results": results,
        # "logprobs": logprobs_to_dict(completion.choices[0].logprobs),
    }), flush=True)
    return results

# This is the old version for validation
def validate_multiple_user_response_old(question: str, answer: str, context_info, invalid_count: int = 0, caregiver_name: str | None = None) -> dict:
    
    subject_line = f"{context_info}" if context_info else  "(e.g., a care receiver, a named person, a pet, a vehicle, or a property) are"

    try:
        profile_line = f'The Profile answering is "{caregiver_name}". ' if caregiver_name else "Profile"
        prompt = f"""
            You are an AI assistant validating human responses during a Q&A session.
            {profile_line} The person answering is always the Profile(first person).
            Any first-person references in the response ("I", "me", "my", "mine", etc.)
            ALWAYS refer to the Profile{f' "{caregiver_name}"' if caregiver_name else "Profile"}.
            The question subject {subject_line}
            SEPARATE entity that the Profile is responsible for.

            Your job is to classify the Profile's answer to a question into one of these five categories.

            ---
            ### STEP-BY-STEP INSTRUCTIONS

            1. **Split responses**:
                - If multiple users are included (format: "User=Answer, User=Answer, ..."), split each pair.
                - If no user is mentioned, treat the entire answer as one response.

            2. **Evaluate EVERY response and collect ALL classifications**:
                For each individual response, determine its classification:
                
                - "question" → response is a question, asks for clarification, requests help/examples  
                Examples: "What do you mean?", "Can you explain?", "Where should I store it?", "What's the best way to...?"
                **CRITICAL - REQUESTS FOR HELP/EXAMPLES**: Phrases requesting help, examples, ideas, or suggestions should be classified as "question":
                * "get me some ideas", "get me more ideas", "give me ideas", "show me ideas"
                * "get me examples", "give me examples", "show me examples", "can you give examples"
                * "what are some examples", "what are some ideas", "what should I say"
                * "help me understand", "can you help", "what do you suggest", "I need help"
                * Any variation requesting assistance, examples, or guidance
                Note: Requests for help/examples are NOT "skip" responses - they are valid questions that need addressing
                **Important: "help" used as a descriptive word in answers (e.g., "help wearing shirts", "help walking") 
                should NOT be classified as "question" - these are descriptions, not asking for clarification

                - "error" → response is:
                * Gibberish or random letters (e.g., "ysiwof", "skdjfhwef")
                * Clearly irrelevant to the question (e.g., "the weather is sunny" when asked about documents)
                * Incomplete or doesn't address what was asked (e.g., "yes I know where it is" when asked WHERE something is located - this doesn't actually answer the question)
                * Placeholder or test data that is clearly not real information
                    - Sequential letters/numbers (e.g., "GHI", "LLL", "345")
                    - Obviously fake names (e.g., "Test", "Name", "Person")
                    - Invalid phone numbers (e.g., "123", "000", repeating digits, less than 7 digits)

                - "yes" → response is an affirmative, relevant, and COMPLETE answer that actually addresses the question
                * For location question WHERE THE ITEM EXISTS: must specify an actual location or an individual, group, entity, etc
                        e.g., "in the safe", "drawer", "lockbox", "with her cousin", "at the lawyer"
                * For selection questions: can include "both", "all", "everyone", or specific names
                * For yes/no questions: ANY response that starts with "yes", "yeah", "I do", "I have","we have it", "everyone has it" or contains an affirmative answer should be classified as "yes", EVEN IF it includes additional information or details. Examples:
                    - Q: "Does this dependent have a primary care doctor?" A: "Yes, Mitchel is the name of the doctor but I don't have his number" → "yes" (affirmative answer with additional context)
                    - Q: "Do you have insurance?" A: "Yes, I have Blue Cross" → "yes" (affirmative with details)
                    - Q: "Does she attend school?" A: "Yes, she goes to Lincoln Elementary" → "yes" (affirmative with school name)
                    - Additional information, names, or missing details do NOT make it "error" - if it starts with "yes" or affirms the question, it's "yes"
                * If the response describes or confirms the condition asked about WITHOUT saying "yes" explicitly
                (e.g., Q: "Does Zohan need help?" A: "need help with turning on computer"), this is still "yes" - the answer confirms the premise by describing the need
                * Only classify as "no" if the response explicitly denies (e.g., "no", "doesn't need", "no help needed")
                * For detail requests: provides actual details or relevant information
                * Account numbers and financial details are VALID "yes" answers when requested (different care receivers having different account statuses is normal)
                * Phone numbers with 7 or more digits are VALID "yes" answers when the question asks for a phone number — do not require the entity name to be restated.
                
                - "no" → response clearly denies the premise (e.g., "no", "we don't have it", "none", "i don't have", "not received yet", "still waiting for")
                    Note: If a response starts with "yes" but includes conditions that CONTRADICT the core answer:
                    * The condition must directly negate what was asked
                    * Examples that ARE "no": 
                    - Q: "Do you have gym membership?" A: "yes if I can afford it next month" (they don't currently have it)
                    - Q: "Can you walk independently?" A: "yes but only with a walker" (contradicts "independently")
                    - Q: "Do you have the document?" A: "yes but I haven't received it yet" (contradiction - can't have it if not received)
                    * Examples that are still "yes":
                    - Q: "Do you have gym membership?" A: "yes but this month payment is late" (they still have gym membership)
                    - Q: "Do you have gym membership?" A: "yes but it's expensive" (they still have gym membership)
                    - Q: "Who has the key?" A: "John, but Mary can access it too" (still answers WHO)
                    * Rule: Additional details, payment methods, sources, or non-contradictory conditions do NOT change "yes" to "no"

                **CRITICAL - MIXED RESPONSES AND EXCEPT/ONLY PHRASES**:
                - When evaluating responses that mention multiple people (care receivers) or items in a single sentence:
                    * If the response indicates that **at least one** named individual DOES have / DOES need / DOES receive the thing being asked about,
                      you MUST include **"yes"** in `classifications` for that response, even if the sentence also mentions others who do not.
                    * Phrases like **"only X"**, **"only X and Y"**, **"no one has except X"**, **"all except X"**, or similar MUST be treated as
                      containing at least one affirmative answer. In these cases, you MUST treat the response as having a **"yes"** classification.
                    * Only when the response clearly states that **none** of the mentioned individuals have/need/receive the thing (for example:
                      "no one has it", "none of them", "nobody needs that") and there is **no exception** (no "except X" / "only X") should the
                      response be classified purely as **"no"** (without any "yes").
                    * If the user clearly skips or defers answering for **all** individuals (for example: "skip for everyone", "I don't know for anyone"),
                      then classify that response as **"skip"**.
                
                - "skip" → response is skipped, deferred, or avoided (e.g., "don't know", "I'll answer later", "pass", "skip", "i don't want to", "let's talk about someething else")
                    **CRITICAL — "I don't know" / "not sure" / "unsure" is ALWAYS "skip", never "no"**. "no" means the thing does not exist. "skip" means the person cannot or will not answer. Lack of knowledge ≠ denial of existence.

                **CRITICAL EVALUATION RULES**:
                - **FOR YES/NO QUESTIONS** (questions asking "Does X have Y?", "Do you have X?", "Is X available?", "Does X need help/assistance with Y?", etc.):
                    * If the response starts with "Yes", "Yeah", "I do", "I have", or contains any affirmative, classify as "yes" REGARDLESS of additional information provided.
                    * For questions about whether someone **needs help / needs assistance / requires help** with something (e.g., "Does Bala need help cutting food?"):
                        - Any response that clearly states that the person **needs help/assistance/support** (for example, "need help with cutting food", "she needs help with that", "requires assistance with cutting") MUST be classified as **"yes"**, even if the word "yes" is not present.
                        - Do NOT classify such responses as "no" just because they lack an explicit "yes"; the presence of "need help", "needs assistance", or similar phrases IS the affirmative signal.
                    * Additional details (names, missing information, context) do NOT make it "error" - they are just extra context.
                    * Example: Q: "Does this dependent have a primary care doctor?" A: "Yes, Mitchel is the name of the doctor but I don't have his number" → MUST be classified as "yes" (not "error").
                    * Example: Q: "Do you have insurance?" A: "Yes, I have Blue Cross" → "yes" (even though question only asked yes/no, not which company).
                - If a question asks "WHERE is X located?", the response MUST specify a location unless that classification is a "no". Responses like "I know where it is" or "yes" are "error" (evasive).
                - If a question asks "WHO" or "select the person", responses like "both", "all", "everyone" are valid "yes" answers.
                - **FIRST-PERSON ACTION ON BEHALF OF SUBJECT**: When the Profile uses "I" or "we" to describe performing an action that the question asks whether the subject has or needs, classify as "yes". The Profile doing X for/on behalf of the subject implies the subject has or needs X — regardless of the entity type (person, pet, property, etc.).
                    * Q: "Does [subject] need assistance with meals?" A: "I prepare the meals" → "yes"
                    * Q: "Who manages the finances?" A: "I handle it all" → "yes"
                **CRITICAL - FIRST-PERSON AS VALID ANSWER FOR "WHO" QUESTIONS**:
                - When the question asks "who" (e.g. "Who are the owners?", "Who has the key?", "Who is responsible?") and the profile's answer uses first-person references (I, me, my, I'm, I am, we, our) to indicate they themselves are the answer, classify as "yes".
                - The profile is a valid identity; do NOT classify as "error" for being "vague" when they are clearly stating they are the one. Examples:
                    * Q: "Who are the owners listed on the certificate of title?" A: "I'm the owner" or "Me" → "yes"
                    * Q: "Who has the key?" A: "I do" or "Me" → "yes"
                    * Q: "Who is responsible?" A: "I am" or "Just me" → "yes"
                - If ANY response contains a question mark or is asking something, classify it as "question", not "error".
                - You MUST evaluate ALL responses before proceeding to step 3. Do not stop after finding a "yes".
                - If the question asks about days, time periods, supply duration, frequency, or "how often/how long",
                    then time period expressions are VALID answers and should be classified as "yes":
                    * "weekly", "monthly", "for a month", "for a week", "twice a day", "daily", "3 months", "a year", etc. are all VALID
                    * These expressions answer the question even if not in exact "days" format
                    * Example: Q: "How many days of supply is prescribed?" A: "for a month" → classify as "yes" (valid answer)
                - Conditional affirmatives like "sometimes", "occasionally", "at times" are valid "yes" answers — they confirm the condition exists at least partially.
                - **IMPORTANT - PARTIAL BUT RELEVANT ANSWERS**: For open-ended questions that ask for details, instructions, descriptions, or plans
                    (e.g., "What care instructions should be provided?", "Describe the daily routine", "What arrangements have been made?"):
                    * ANY response that is relevant and on-topic should be classified as "yes", even if it only addresses one aspect of the question
                    * A partial but meaningful answer is still a valid answer — do NOT classify it as "error" just because it doesn't cover everything
                    * Example: Q: "What permanent care instructions should be provided for Jojo?" A: "He needs to take his medications on time" → classify as "yes" (valid partial answer about medication)
                    * Only classify as "error" if the response is truly irrelevant, gibberish, or nonsensical
                - **DOMAIN-RELEVANT TERMS**: If the answer uses terminology naturally associated with the question's domain, classify as "yes" even if phrased differently from the examples given. Examples in questions are illustrative only, not exhaustive.
                    * Q: "What is the medical record type? (e.g., Doctor visit, Lab result)" A: "diabetes", "thyroid", "MRI", "I went for MRI" → "yes" (names the subject of the record)
                
            ---

            **EDGE CASE NOTE** For the question "What is the family code word to Pause and Verify?", 
                any user-provided phrase should be treated as a valid affirmative answer even if it appears to be gibberish, 
                unless the user explicitly skips or asks a question; always return "yes" for this specific question.

            Always return a single JSON object: {{ "classifications": ["classification1", "classification2", ...], "user_answers": ["user_answer1", "user_answer2", ...], "reason": "reason" }}

            **Context Info: {context_info}
            **Question:** {question}
            **Answer:** {answer}
            **Invalid Count:** {invalid_count}    
            """

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "user", "content": prompt}
            ],
            # logprobs=True,
        )
        raw = clean_llm_json_response(completion.choices[0].message.content)
        # classification_logprobs = completion.choices[0].logprobs

        try:
            # first piece of breaking up the validation process, get the classifications and the reason
            classifications = json.loads(raw)["classifications"]
            bot_reason = json.loads(raw)["reason"]

            # stores the final classification based on the logic below            
            classification = ""
            bot_reply = ""

            # Process classifications in priority order: question > error > skip > yes > no
            if "question" in classifications:
                classification = "question"
            elif "error" in classifications:
                # SENDING INTO LLM INSTEAD for more detailed explanation
                # # Handle error case
                # error_indices = [i for i, cls in enumerate(classifications) if cls == "error"]
                
                # if len(classifications) == 1:
                #     # Single element - print generic message
                #     bot_reply = f"Your response '{answer}' is not relevant or lack the information requested"
                # else:
                #     # Multiple elements - extract names from answer matching error positions
                #     # Parse answer to extract key/value pairs (e.g., "Mom=skip, Jane=skip, Ashok=error")
                #     answer_parts = [part.strip() for part in answer.split(",")]
                #     error_names = []
                    
                #     for idx in error_indices:
                #         if idx < len(answer_parts):
                #             part = answer_parts[idx]
                #             # Extract name before "="
                #             if "=" in part:
                #                 name = part.split("=")[0].strip()
                #                 error_names.append(name)
                    
                #     if error_names:
                #         names_str = ", ".join(error_names)
                #         bot_reply = f"Your response for {names_str} is not relevant or lack the information requested"
                #     else:
                #         bot_reply = f"Your response '{answer}' is not relevant or lack the information requested"
                
                classification = "error"
            elif "yes" in classifications:
                classification = "yes"
            elif "no" in classifications:
                classification = "no"
            elif "skip" in classifications:
                bot_reply = "It looks like you'd like to skip this question. No worries — you can update this information anytime. Let's move on."
                classification = "skip"

            # Only call prompt2 when classification is "yes", "no", or "question"
            if classification in ["yes", "no", "question", "error"]:

                # TEMP DISABLED
                caregiver_name = None  # purposedly disabled for now until the bot replies are consistently correct

                profile_reply_instruction = f'''
                    **PROFILE NAME IN REPLY**:
                    The profile (the person using this application) is "{caregiver_name}". {context_info}
                    - Mention "{caregiver_name}" in your reply ONLY when the profile's answer contains first-person references (I, me, myself, my, we, our, etc.). In that case, replace first-person with the profile name so the reply clearly states what {caregiver_name} does or provides. Do NOT use passive voice that omits the name (e.g. avoid "the policy is kept in the bag" when the answer was "I kept it in the bag"—use "{caregiver_name} keeps the policy in the bag").
                    Examples: "I help" → "Your response indicates that {caregiver_name} helps [care receiver(s)]"; "I help all of them" → "Your response indicates that {caregiver_name} helps Jessi, Jake, Dad, Mom, and Bala with home safety assistance"; "He needs me" → "Bala needs {caregiver_name}'s help." For WHERE/location questions with first-person: "I kept insurance policy in Bag" → "Your response indicates that {caregiver_name} keeps the insurance policy in the bag."; "I kept in bag" → "Your response indicates that {caregiver_name} keeps it in the bag."
                    - When the profile's answer does NOT contain first-person references (e.g. "yes he can", "Bala can"), NEVER mention "{caregiver_name}" or the user profile name in your reply—use only {context_info}. Or needs, Bussiness etc. 
                ''' if caregiver_name else ""
                prompt2 = f"""
                    **Context Info: {context_info}
                    **Question:** {question}
                    **Answer:** {answer}
                    **Classification**: {classification}
                    {profile_reply_instruction}

                        IMPORTANT: Only execute the instructions for the classification type provided. Ignore all other sections.

                        {"**CRITICAL RULE:  Always, MENTION context_info names in reply**: When context_info lists multiple names, your reply MUST mention ALL of them by name. Do NOT mention only one name when context_info contains multiple names." if "pets" not in (context_info or "").lower() and  classification not in  ["error"] else ""}
                    ===== CLASSIFICATION: "question" =====
                    {f'''   
                    reply with a helpful one paragraph explanation that addresses the "question" asked in the answer.
                                Do not ask for follow up and don't always start with "That's a great question..."
                    ''' if classification == "question" else "SKIP THIS SECTION"}

                    ===== CLASSIFICATION: "error" =====

                    {f'''
                    Provide a short explanation for the error in the user's answer and do not ask for a follow up or clarification.
                    Always start with "It looks like your response...".
                    ''' if classification == "error" else "SKIP THIS SECTION"}
                                            
                    ===== CLASSIFICATION: "no" =====

                    {f'''
                    If appropriate, start with an appreciation to the user's answer and always follow by "Your response indicates...". 
                    return a response specifying there is not existence, ownership, etc of the question asked.
                    ''' if classification == "no" else "SKIP THIS SECTION"}
                    
                    ===== CLASSIFICATION: "yes" =====
                    {f'''
                        - Using the context of the question and the user's answer, provide a short sentence reply to the user;
                            - If the question is sensitive or concerning, respond with acknowledgement and/or sympathy only, in a calm and respectful tone.
                            Do not use any wording that implies positivity, approval, celebration, happiness, or benefit
                            (e.g., avoid phrases like "good to know", "great to see", "happy to hear").
                            - If the situation is neutral or positive, respond with acknowledgement, encouragement, or praise in a conversational tone.

                        **CRITICAL - ACCOUNT NUMBERS AND FINANCIAL DETAILS**:
                            - When the question explicitly asks for account numbers, financial details, or similar information, the provided account numbers are APPROPRIATE and EXPECTED responses
                            - DO NOT flag account numbers as "sensitive information" or raise "data privacy concerns" when they are direct answers to financial account questions
                            - Different care receivers having different account statuses (some with accounts, some without) is completely normal and valid
                            - Simply acknowledge the information provided without mentioning privacy or sensitivity concerns

                        **CRITICAL SUBJECT IDENTIFICATION**: 
                            - The names in the answer correspond to the role specified in context info
                            - Carefully identify WHO is expressing the opinion based on the question wording:
                            * If the question asks what the "care receiver thinks" or similar phrasing, the care receiver is the subject expressing opinions
                            * If the role in context info is non-human (pets, objects, etc.), they CANNOT express thoughts/beliefs - the care receiver or another human role is expressing opinions ABOUT them
                            * The names are identifiers for the entities being discussed, NOT necessarily the ones expressing opinions
                            
                            Example 1: 
                                Q: "How important does your daycare worker think having nap time for the children?"
                                A: "Shelley=Very important, Paulie=not important, Julie=Very important"
                                Context: "Shelley, Paulie, Julie are children"
                                Reply: "Your response indicates the daycare worker thinks Shelley and Julie need to have nap time, while Paulie does not."
                                Reason: Question asks what "daycare worker thinks", so daycare worker is expressing opinions ABOUT the children
                            
                            Example 2:
                                Q: "Do your children receive interest income for the mutual funds?"
                                A: "Charles Schwab=yes, Fidelity=no, Vanguard=once a quarter, Goldman Sachs=skip"
                                Context: "Charles Schwab, Fidelity, Vanguard, Goldman Sachs are mutual funds"
                                Reply: "Your response indicates the children are receiving interest income from Charles Schwab and Vanguard."
                                Reason: Question asks if "children are", so children are receiving interest income for the mutual funds.

                        **IMPORTANT for yes classification**
                        If appropriate, start with an appreciation to the user's answer and always follow by "Your response indicates...".
                        When the Answer contains first-person (I, me, my, we, our), your reply MUST use the profile name—e.g. "Your response indicates that [profile name] keeps the insurance policy in the bag", not passive "the policy is kept in the bag".
                        **FIRST-PERSON ANSWERS**: When the answer uses "I [do/handle/prepare/manage] X", simply acknowledge what the Profile does — e.g. "Your response indicates that you [verb] X for [subject]." Do NOT add causal clauses like "as you do it" or "since you handle it"; these create contradictory phrasing.
                    ''' if classification == "yes" and "pets" not in context_info.lower() else "SKIP THIS SECTION"}
                    
                    ===== CLASSIFICATION: "yes" and pets =====
                    {f''' 
                        - Return a simple, brief message using the context of the question acknowledging that the information has been captured. 
                        - Do not mention any names or specific details from the answer. Keep it concise and professional.
                        - If appropriate, start with an appreciation to the user's answer and always follow by "Your response indicates...". 

                        Example: Question: "Does your care receiver pay recurring boarding expenses?"
                                 Answer: "Doodu=Yes, Moomu=Yes"
                                Context: "Doodu, Moomu are pets"
                                Reply: "Your response indicates your care receiver is paying recurring boarding expenses for their pets."
                                Reason: Pets names are not included in the reply, they are simply stated as "pets".
                    ''' if classification == "yes" and "pets" in context_info.lower() else "SKIP THIS SECTION"}
                    """

                completion = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "user", "content": prompt2}
                    ],
                    # logprobs=True,
                )
                bot_reply = completion.choices[0].message.content.strip()

            # create the data to return
            data = {
                "result": classification,
                "reply": bot_reply,
                "rephrased_question": "",
                "reason": bot_reason,
                "classifications": classifications
            }

            # print the data to the console (GCP log)
            print(json.dumps({
                "log_type": "validate_multiple_user_response",
                "question": question,
                "answer": answer,
                "raw": data, 
                "context_info": context_info,
                # "classification_logprobs": logprobs_to_dict(classification_logprobs),
                # "bot_reply_logprobs": logprobs_to_dict(completion.choices[0].logprobs),
            }), flush=True)

            return data
        except json.JSONDecodeError:
            return {
                "result": "error",
                "reason": "Failed to parse validation response",
                "reply": "I'm having trouble processing your response. Please try again.",
                "rephrased_question": question
            }
    except Exception as e:
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"OpenAI API Error in validate_multiple_user_response: {error_type} - {error_msg}")
        
        # Return a graceful fallback response
        return {
            "result": "error",
            "reason": f"Service temporarily unavailable: {error_type}",
            "reply": "I'm experiencing technical difficulties. Please try again in a moment.",
            "rephrased_question": question
        }