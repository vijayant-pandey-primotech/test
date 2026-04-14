from typing import Optional
from src.middleware.function_logger import *
from src.services.google_service import *
from src.utils.prompt_functions import *
from src.utils.api_helper import *


# Extract keys from the data
def extract_keys(data):
    return [[item.get('location', None), item.get('mandatory', None)] for item in data]


# Clean the input text by removing special characters
def clean_input(text: str) -> str:
    return re.sub(r'[{}[\]()<>\|#*~`"\\]', '', text).strip()


# Validate the user response against the question
def update_policy_data(new_q: str, user_response: str, all_policies: list, current_policy_data: list, current_policy: str) -> list:
    primary_data_policy, _ = policy_data_extraction(new_q, user_response, all_policies, current_policy)

    for policy, value in primary_data_policy.items():
        if value is not None and value != "":
            for current_item in current_policy_data:
                # Match extracted policy with known list; 
                # if current_item['policy'].lower() == policy.lower() or 
                    # current_item['value'] = value
                # need to account for LLM sometimes changes the policy name slightly
                if policy.lower() in current_item['policy'].lower():
                    current_item['value'] = 'Answered'  #no need to store actual value; LLM also sometimes changes the structure

    return current_policy_data


# Handle user response based on the current session state
def handle_user_response(user_response: str,
    bearer_token: str,
    uuid: str,
    type:str,
    user_unique_id: int,
    userStoryId: Optional[int] = None,
    chapterId: Optional[str] = None,
    chapterName: Optional[str] = None,
    assistantId: Optional[str] = None,
    mode: str = "personal",
    selected_items_details: Optional[list] = None,
    itemId: Optional[str] = None
    )-> dict:

    """
    Handles the user response based on the current session state, policy verification,
    and provides the next steps.

    Args:
        state (str): The current state of the conversation (e.g., "awaiting_answer").
        last_question (str): The last question asked by the bot.
        user_response (str): The user's response to the last question.
        invalid_count (int): The number of invalid responses provided by the user.
        userStoryId (int): The unique identifier for the user's story or session.
        bearer_token (str): The authorization token for database updates.
        polict(str) : the policy that we need to check for 
        selected_items_details (list, optional): Details of items in a cluster question.
    Returns:
        dict: A dictionary containing bot responses and the next question (if any).
    """

    if mode == 'cluster':
        session_data = get_cluster_session(uuid, user_unique_id, user_response, assistantId)
    else:     
        session_data = get_gather_assist_session(uuid, userStoryId, user_unique_id, user_response, chapterId)

    last_question = session_data.get("last_question")
    last_question_unchanged = session_data.get("last_question")
    invalid_count = session_data.get("invalid_count", 0)
    repeat_policy_count = session_data.get("repeat_policy_count", 0)
    state = session_data.get("state", "awaiting_question")
    count = session_data.get("count", 0)
    policy_specific_data = session_data.get("policy_log", {})
    bot_seed_data = "context : Bot : {}, User : {}".format(last_question, user_response)
    policy_done = session_data.get("policy_done", 0)
    all_answer = session_data.get("answer_log", " ")
    previous_conversation = session_data.get("conversation_history", "")
    prev_question_storage = session_data.get("prev_question")
    chapterId = session_data.get("chapterId", chapterId)
    chapterName = session_data.get("chapterName", chapterName)
    main_question_response = session_data.get("main_question_response", "")
    assistantId = session_data.get("assistantId", assistantId)
    full_items = session_data.get("full_items_details", [])
    questions = session_data.get("questions_obj", [])
    collected_pairs_dependent = session_data.get("collected_policy_pairs", {})
    collected      = session_data.get("collected_answers", {})
    pending_policy = session_data.get("pending_policy_questions", [])
    affirmative_dependents = session_data.get("affirmative_dependents", [])

    max_invalid_count = 3
    const_move_on_to_next_question = "Let's move on to the next question: "

    ####################################################################################################################
    def do_update_bulk_cluster_assistant_data_to_database():
        nonlocal full_items
        structured_kv_response = {}

        for detail in full_items:
            story_name = detail["storyName"].lower()
            initial_answer = collected.get(story_name, "No")
            is_affirmative = policy_boolean_extraction(main_question_text, initial_answer) == "yes"
            item_name = questions[0]["itemName"]
            
            if not is_affirmative:
                # Handle negative initial answers
                negative_responses = []
                for pair in collected_pairs_dependent.get(story_name, []):
                    if "no" in pair["answer"].lower() or "not" in pair["answer"].lower():
                        negative_responses.append(f"{pair['question']}: {pair['answer']}")
                if negative_responses:
                    summary = f"No {item_name}.\n" + "\n".join(negative_responses)
                else:
                    summary = f"No {item_name}."
                structured_kv_response[story_name] = summary
                continue
            
            # Build conversation string for affirmative answers
            mini_conversation_str = f"Bot: {main_question_text}\nUser: {initial_answer}\n"
            dependent_policy_pairs = collected_pairs_dependent.get(story_name, [])

            for pair in dependent_policy_pairs:
                mini_conversation_str += f"Bot: {pair['question']}\nUser: {pair['answer']}\n"

            # Generate comprehensive summary
            final_summary = summary_generation(mini_conversation_str, item_name=item_name)
            structured_kv_response[story_name] = final_summary.strip("- ").strip()

        # Update database with all summaries
        update_response = update_bulk_cluster_assistant_data_to_database(
            user_response=structured_kv_response,
            selected_items_details=full_items,
            assistantId=assistantId,
            bearer_token=bearer_token,
            itemId=itemId
        )

        full_items = None   #reset for next question
        return update_response
    ####################################################################################################################

    ####################################################################################################################
    def log_user_bot_exchange(question_text, user_text, summary="", selected_items_details=None):
        if mode == 'cluster':
            save_cluster_logs(
            user_id=user_unique_id,
            story_data={
                "userStoryDocId": first_question.get("userStoryDocId"),
                "chapterDocId": first_question.get("chapterDocId"),
                "assistantId": first_question.get("assistantId"),
                "itemId": itemId,
            },
            ai_message=question_text,
            user_message=user_text,
            rephrase_text=summary or "-",
            selected_items_details=selected_items_details
        )
        else:    
            save_gather_assist_recent_logs(
                user_id=user_unique_id,
                story_data={
                    "userStoryId": first_question.get("userStoryId"),
                    "storyId": first_question.get("storyId"),
                    "itemId": first_question.get("itemId"),
                    "itemName": first_question.get("itemName"),
                    "docId": first_question.get("docId"),
                    "chapterId": first_question.get("chapterId"),
                    "chapterName": first_question.get("chapterName"),
                    "storyName": first_question.get("storyName"),
                    "storyType": first_question.get("storyType")
                },
                ai_message=question_text,
                user_message=user_text,
                rephrase_text=summary or "-"
            )
    ####################################################################################################################

    ####################################################################################################################
    def force_skip_and_move_on(skipped_question, item_summary="Skipped", question_type="seed", mode="personal"):
        base_message = "It seems I've had some difficulty with this one"
        retry_message = ". Let's move on to the next question. "
        complete_message = "; although all questions have been completed. Feel free to return to this question through the organizer if you'd like to revise your response."
        return_question = ""
        assistant_completed = False

        if question_type == "seed":
            if mode == "cluster" and full_items:
                log_user_bot_exchange_multiple(skipped_question, item_summary, f"Force skipped after {max_invalid_count} invalid attempts", selected_items_details=full_items)
                update_response = do_update_bulk_cluster_assistant_data_to_database()
            else:    
                log_user_bot_exchange(questions, item_summary, f"Force skipped after {max_invalid_count} invalid attempts", selected_items_details=full_items)

                if mode == "cluster":
                    update_cluster_assistant_data_to_database(item_summary, assistantId, bearer_token, itemId)
                else:
                    update_gather_assist_data_to_database(item_summary, userStoryId, bearer_token, "", chapterId)

            policy, next_q = fetch_next_question()
            if next_q:
                response_to_user["next_question"] = f"{base_message} {retry_message} {next_q}"
                return_question = next_q
                assistant_completed = True if next_q.startswith("All assistant items completed successfully") else False
            else:
                response_to_user["bot_response"] = f"{base_message} {complete_message}"
                assistant_completed = True

        else:
            log_user_bot_exchange(skipped_question, item_summary, f"Force skipped after {max_invalid_count} invalid attempts", selected_items_details=full_items)

            policy_question = ""
            if mode == "cluster":
                policy_question = pending_policy.pop(0) if pending_policy else ""            
            else:
                policies = questions[0].get("policiesQuestion", [])
                next_policy_index = next((i for i, item in enumerate(policy_specific_data) if item['value'] is None), len(policies))           
                if next_policy_index < len(policies):
                    policy_question = policies[next_policy_index].get("question", "")

            if policy_question != "":
                response_to_user["next_question"] = f"{base_message} {retry_message} {policy_question}"
                return_question = policy_question
            else:
                if mode == "cluster" and full_items:
                    update_response = do_update_bulk_cluster_assistant_data_to_database()
                else:    
                    bullet_summary = "\n".join([line.strip() for line in summary_generation(previous_conversation).split("\n") if line.strip()])
                    final_new_summary = preprocess_features(bullet_summary)

                    if mode == "cluster":
                        update_cluster_assistant_data_to_database(final_new_summary, assistantId, bearer_token, itemId)
                    else:
                        update_gather_assist_data_to_database(final_new_summary, userStoryId, bearer_token, "", chapterId)

                policy, next_q = fetch_next_question()
                if next_q:
                    response_to_user["next_question"] = f"{base_message} {retry_message} {next_q}"
                    return_question = next_q
                    question_type = "seed"  # Force seed mode on fallback
                    assistant_completed = True if next_q.startswith("All assistant items completed successfully") else False
                else:
                    response_to_user["bot_response"] = f"{base_message} {complete_message}"
                    assistant_completed = True

        return {
            "state": "awaiting_answer" if question_type == "seed" else "policy",
            "invalid_count": 0,
            "last_question": return_question or None,
            "assistant_completed": assistant_completed
        }
    ####################################################################################################################

    ####################################################################################################################
    def fetch_next_question(mode=mode):
        nonlocal questions, first_question, itemId, new_q, policy
        
        if mode == "cluster":
            result = get_unfilled_cluster_assistant_question(assistantId, bearer_token)

            if result.get("completed", False):
                return None, "All assistant items completed successfully"

            questions = result.get("questions", [])
            if not questions:
                return None, "All assistant items completed successfully"

            q = questions[0]
            first_question = q
            itemId = q.get("itemId")
            item_name = q.get("itemName", "")
            context = q.get("context", "")
            default_question = q.get("backendQuestions")
            question = default_question if default_question else generate_question(item_name, context)

            try:
                policy = list(q.get("policy", [{}])[0].keys())
            except:
                policy = []

            new_q = question
            return policy, question
        else:  
            questions = get_unfilled_gather_assist_question(userStoryId, bearer_token, chapterId)
            if questions and not questions[0].get("empty", False):
                first_question = questions[0]
                item_name = questions[0]["itemName"]
                context = questions[0]["context"]
                default_question = questions[0].get("backendQuestions")
                question = default_question if default_question else generate_question(item_name, context)
                if not question:
                    log_function_call("Your response for this chapter has been recorded. Do you want to move to the next chapter?")
                    return None, "✅ Your response has been recorded.\n\n➡️ Do you want to move to the next chapter?"
                try:
                    policy = list(questions[0]["policy"][0].keys())
                except:
                    policy = []
                new_q = question
                return policy, question
            else:
                log_function_call("Your response for this chapter has been recorded. Do you want to move to the next chapter? No unfilled personal questions found for userStoryId: {}".format(userStoryId))
                return None, "Your response for this chapter has been recorded. Do you want to move to the next chapter?"
    ####################################################################################################################

    ####################################################################################################################
    def check_policy_conditions(policy_question: dict, policy_specific_data: list, all_policies: list) -> bool:
        """
        Evaluates if a policy question's conditions are met based on policy_specific_data.
        Uses boolean_extraction to interpret complex answers as True/False.

        Args:
            policy_question (dict): The policy question with a 'conditions' field.
            policy_specific_data (list): List of policy answers [{policy, value}, ...].
            all_policies (list): Full list of all policy questions.

        Returns:
            bool: True if all conditions are met, False otherwise.
        """
        conditions = policy_question.get("conditions", [])
        if not conditions:
            return True  # No conditions = always valid

        for condition in conditions:
            depends_on = condition.get("dependsOn")
            expected_value = str(condition.get("value", "")).strip().lower()
            operator = condition.get("operator", "Equal")

            # Find the actual answer for the dependsOn policy
            policy_data = next((item for item in policy_specific_data if item["policy"] == depends_on), None)

            if not policy_data or not policy_data.get("value"):
                return False  # Can't evaluate condition

            user_answer = str(policy_data["value"]).strip()

            # Get the original question for the dependsOn policy
            bot_question_data = next((item for item in all_policies if item.get("policy") == depends_on), None)
            bot_question_text = bot_question_data.get("question", "") if bot_question_data else ""

            # Normalize user answer using policy_boolean_extraction
            try:
                normalized_bool = policy_boolean_extraction(bot_question_text, user_answer)
                normalized_value = "yes" if normalized_bool == "yes" else "no"
            except:
                normalized_value = user_answer.lower()  # fallback

            # Evaluate the condition
            if operator == "Equal" and normalized_value != expected_value:
                return False

        return True
#################################################################################################################################

    response_to_user = {}

    # Initialize questions and related variables - will be populated by fetch_next_question
    # questions = []
    first_question = {}
    itemId = None
    new_q = None
    policy = [] # <-- not really used anywhere
    # pending_policy = []

    if mode == 'cluster' and state != "awaiting_question": #and selected_items_details:
        # 1 Pull in the session data
        # qs = session_data.get("questions_obj", [])
        # session        = get_cluster_session(uuid, user_unique_id, user_response, assistantId)  #already done at the beginning
        # collected      = session.get("collected_answers", {})
        # pending_policy = session.get("pending_policy_questions", [])
        # full_items     = session.get("full_items_details")
        # affirmative_dependents = session.get("affirmative_dependents", {})

        qs = questions # keep it consistent with downstream variables

        this_item = qs[0] if qs else {}
        policy_qs = this_item.get("policiesQuestion", [])
        main_question_text = this_item.get("backendQuestions") 
        first_question = qs[0] if qs else {}

        itemId = qs[0]["itemId"]

        done = False
        
        # This flag will allow us to trigger a better bot response:
        #   under 3 invalid attempts, the bot will say "Let's try again: " with the same question
        #   at 3 invalid attempts, the bot will say "Let's move on to the next question: " with the next question
        force_skip_executed = False

        prompt = ""
        assistant_completed = False

        # this call validates the user_response, "yes", "no", "question", "error", "skip"
        # it also returns the bot response that can
        # 1. answer the user question - no need to call query_resolver
        # 2. provide a follow up response to make conversation more natural; the follow up response can be for a valid or invalid user input
        #    so we should always display it before asking the same or next question
        # 3. The rules defined in the validate_multiple_user_response function; basically, 
        #   "question" or "error" is handled first, bot provides response and we re-ask the question.
        #   if there is a positive response (yes), we want this this supersede any skip or no, so we can move on to the next question.
        #   we will be properly storing any "skip" or "no" along with the "yes" response
        # 4. validation_rephrased_question is not used at the moment - we don't need to rephrase the question
        raw_result = validate_multiple_user_response(last_question, clean_input(user_response))
        validation_status = raw_result["result"].lower()
        validation_reply = raw_result["reply"]
        validation_rephrased_question = raw_result["rephrased_question"]


        # these two flags generally controls the flow of questions
        # if either one is true, then we will display the "validation_reply" before asking the same question again
        has_question = True if validation_status == "question" else False
        invalid_user_response = validation_status == "error"


        # if the user chooses to answer "skip" or "no" to a seed or policy question, this block will handle the flow:
        # 1. if the question contains a dynamic function, we will "selected_items_details" but the user response will just be 
        # if it's a seed question, we will not get "selected_items_details" from the front end
        #    we need to establish the "full_items"
        if validation_status in ("skip", "no"):
            if state == "policy":
                if affirmative_dependents:
                    user_response = ", ".join(f'{item["storyName"]}={validation_status}' for item in affirmative_dependents)
                else:
                    previous_conversation += f"Bot: {last_question}/User: {user_response}\n"


        # setup full_items and collected_pairs_dependent
        if not full_items:
            # if there is dynamic function data, then setup full items and collected_pairs_dependent
            if selected_items_details:
                pending_policy = [p["question"] for p in policy_qs]
    
                full_items = selected_items_details if selected_items_details else []
                collected = {
                    item["storyName"].lower(): validation_status if validation_status in ("skip", "no") else "No"
                    for item in full_items
                }
                collected_pairs_dependent = {item["storyName"].lower(): [] for item in (full_items or [])}
            else:
                # this part will always run if it's not a dynamic function question
                # so only set the pending policy once; otherwise, the pending policy will not pop properly
                if state == "awaiting_answer":
                    pending_policy = [p["question"] for p in policy_qs]

                # save the valid user response for final summarization using previous_conversation
                if not has_question and not invalid_user_response:
                    previous_conversation += f"Bot: {last_question}/User: {user_response}\n"


        def log_user_bot_exchange_multiple(question_text, user_text, summary="", selected_items_details=None):
            first_q = qs[0] if qs else {}

            save_cluster_logs(
                user_id=user_unique_id,
                story_data={
                    "userStoryDocId": first_q.get("userStoryDocId"),
                    "chapterDocId": first_q.get("chapterDocId"),
                    "assistantId": first_q.get("assistantId"),
                    "itemId": first_q.get("itemId"),
                },
                ai_message=question_text,
                user_message=user_text,
                rephrase_text=summary or "-",
                selected_items_details=selected_items_details
            )


        # setup affirmative_dependents if there is dynamic function data
        if full_items:
            # this part processes the user response. at the same time, setup the affirmative_dependents, if applicable.
            # NOTE, besides dependents, this code also works for pets, autos ,care receivers - anything with multiples
            #    we should rename the variable to something more generic than dependents, affirmative_dependents, collected_pairs_dependent
            # the parse_free_text_response function will parse the user response and assign the appropriate value to the appropriate dependent
            dependents = [item["storyName"].lower() for item in affirmative_dependents] if affirmative_dependents else [item["storyName"].lower() for item in full_items]
            answers_map = parse_free_text_response(clean_input(user_response), dependents, last_question)
    
            # a fail safe step to ensure there is indeed no "question" or "error" contained in the user response
            # where validate_multiple_user_response did not capture

            # having this error check can become inconsistent with the validate_multiple_user_response function
            # letting the validate_multiple_user_response function handle the error check
            if not invalid_user_response:
                invalid_user_response = any(value == "error" for key, value in answers_map.items() if key != "reason")
                if invalid_user_response:
                    validation_reply = "Hmm, my apologies. I was having trouble processing your response."

            if not has_question:
                has_question = any(value == "question" for key, value in answers_map.items() if key != "reason")

            # setup the affirmative_dependents from seed question
            if not affirmative_dependents and len(affirmative_dependents) == 0 and validation_status not in ("skip", "no"):
                for detail in full_items:
                    story_name = detail["storyName"].lower()
                    detail["error"] = False
                    user_answer = answers_map.get(story_name, "No")

                    # originally setup to allow Front End to re-enable the dynamic flow data (so not used)
                    # but we resorted to just repeat the same question with the dynamic flow data instead
                    if user_answer == "error":
                        detail["error"] = True

                    if policy_boolean_extraction(main_question_text, user_answer) == "yes":
                        affirmative_dependents.append(detail)



        # this block of code logs the user response for the workbench
        # NOTE, logging for "cluster" mode doesn't seem to allow multiple ones for the same question;
        # therefore, only log when successful
#        if not invalid_user_response:  # this is temporary until issue is resolved on why logging doesn't allow multipe on same question
        if state == "policy":
            log_user_bot_exchange(last_question, user_response, "", selected_items_details=affirmative_dependents)
        else:
            if not has_question:
                # if there is dynamic function data, then log the user response
                if full_items:
                    if not invalid_user_response:
                        for detail in full_items:
                            story_name = detail["storyName"].lower()
                            user_value = answers_map.get(story_name, "No")
                            user_value = "skip" if user_value == "error" else user_value
                            collected[story_name] = user_value
                            log_user_bot_exchange_multiple(qs, user_value, "Response to main question; triggering policy.", selected_items_details=[detail])
                else:
                    # initial logging requires the whole "questions" object
                    # using last_question will fail to log
                    log_user_bot_exchange(questions, user_response,"")


        # handle invalid user answers
        # if it's under 3 invalid attempts, we will explain the error and re-ask the same question
        # otherwise, we will force a skip - which will either load the next seed question or the next policy question
        if invalid_user_response:
            invalid_count += 1
            if invalid_count >= max_invalid_count:

                # save last policy question and answer
                # also, when the answers is "error", it will be saved as "skip"
                # this is a fail safe step to ensure the user response is saved
                if policy_qs:
                    # if there is dynamic function data, then add to collected_pairs_dependent
                    if full_items:
                        for item in affirmative_dependents:
                            current_dependent = item["storyName"].lower()
                            _answer = answers_map.get(current_dependent, "No")
                            collected_pairs_dependent[current_dependent].append({
                                "question": last_question,
                                "answer": "skip" if _answer == "error" else _answer # if the answer is "error", then it will be saved as "skip"
                            })
                    # otherwise, just add to previous conversation
                    else:
                        previous_conversation += f"Bot: {last_question}/User: Skipped\n"

                # when max invalid threshold is reached, always marked as "skipped"
                # the logging and saving will happen inside this function
                force_skip_response = force_skip_and_move_on(last_question, "Skipped", "policy" if state == "policy" else "seed", mode=mode)
                
                state = force_skip_response["state"]
                invalid_count = force_skip_response["invalid_count"]
                last_question = force_skip_response["last_question"]
                assistant_completed = force_skip_response["assistant_completed"]
                prompt = "All assistant items completed" if assistant_completed else last_question
                force_skip_executed = True
                
                # if it's a new seed question, variables are reset
                if state == "awaiting_answer" and not assistant_completed:
                    previous_conversation = ""
                    main_question_response = ""
                    full_items = []
                    pending_policy = []
                    affirmative_dependents = []
                    collected_pairs_dependent = {}
                    collected = {}


        #########################
        # this call may not be needed, reduce unnecessary calls - need confirmatiion (testing so far confirms)
        # next_res = get_unfilled_cluster_assistant_question(assistantId, bearer_token)
        # this call may not be needed, reduce unnecessary calls - need confirmatiion (testing so far confirms)
        #########################


        # this block of code only executes when there is no question or error
        # 1. if there are more policy questions, it will load the next policy question
        # 2. if there are no more policy questions, ready to save the data to firestore
        if not invalid_user_response and not has_question:
            # save the policy answer first before moving on
            if policy_qs and state == "policy":
                if full_items and affirmative_dependents:
                    for item in affirmative_dependents:
                        current_dependent = item["storyName"].lower()
                        _answer = answers_map.get(current_dependent, "No")
                        collected_pairs_dependent[current_dependent].append({
                            "question": last_question,
                            "answer": "skip" if _answer == "error" else _answer
                        })

            if pending_policy and (validation_status not in ("skip", "no") or (validation_status in ("skip", "no") and state == "policy")):
                prompt = pending_policy.pop(0) if pending_policy else "Policy questions completed, but something went wrong. Moving on."
                invalid_count = 0
                state = "policy"                
            else:
                # some questions do not have a dynamic function, save the data with the proper save to firestore function
                # Has dynamic function data
                if full_items:
                    structured_kv_response = {}
                    conversation_str = ""

                    for detail in full_items:
                        story_name = detail['storyName']
                        user_answer = collected[story_name.lower()]
                        bot_question = qs[0]["backendQuestions"]
                        item_name = qs[0]["itemName"]
                        conversation_str = f"Bot:{bot_question}/User: {user_answer}\n"

                        if policy_qs:
                            dependent_policy_pairs = collected_pairs_dependent.get(story_name.lower(), [])
                            for pair in dependent_policy_pairs:
                                conversation_str += f"Bot: {pair['question']}/User: {pair['answer']}\n"

                        item_summary = summary_generation(conversation_str, item_name="")
                        structured_kv_response[story_name] = item_summary.strip("- ").strip()

                    update_bulk_cluster_assistant_data_to_database(
                        user_response=structured_kv_response,
                        selected_items_details=full_items,
                        assistantId=assistantId,
                        bearer_token=bearer_token,
                        itemId=itemId
                    )

                # no dynamic function data
                else:
                    bullet_summary = summary_generation(previous_conversation, "")

                    update_response = update_cluster_assistant_data_to_database(
                        bullet_summary,
                        assistantId,
                        bearer_token,
                        itemId
                    )

                next_res = get_unfilled_cluster_assistant_question(assistantId, bearer_token)
                
                # check if no more questions and reset the variables
                invalid_count = 0
                previous_conversation = ""
                if next_res.get("completed"):
                    prompt = "All assistant items completed successfully"
                    state = "awaiting_answer"
                    collected = {}
                    pending_policy = []
                    full_items = []
                    collected_pairs_dependent = {}
                    itemId = None
                else:
                    questions = next_res["questions"]
                    nq = questions[0]
                    prompt = nq.get("backendQuestions") or generate_question(nq["itemName"], nq["context"])
                    state = "awaiting_answer"
                    affirmative_dependents = []
                    full_items = []
                    collected_pairs_dependent = {}


        #########################
        # this block of code may not be needed, reduce unnecessary calls - need confirmatiion (testing so far confirms)
        # nq_question_data = {}
        # if next_res and isinstance(next_res, dict):
        #     questions = next_res.get("questions", [])
        #     if isinstance(questions, list) and questions:
        #         nq_question_data = questions[0]
        #         itemId = nq_question_data.get("itemId")
        # this block of code may not be needed - need confirmatiion (testing so far confirms)
        #########################


        done = prompt.startswith("All assistant items completed")

        # this block of code setups the proper messaging for invalid answers or user asked a question - "error" or "question"
        # NOTE, even though the answer was invalid but if it reached 3 invalid attempts (force_skip_executed == True), then we will move on to the next question
        if (invalid_user_response or has_question) and not force_skip_executed:
            prompt = f"{validation_reply} Let's try again: {last_question}" if not force_skip_executed else validation_reply
            if has_question:
                prompt = f"{validation_reply} To continue: {last_question}"

        # the "question" key is the actual data sent back to the user, there are 3 use cases here:
        # 1. when all questions are answered
        # 2. when there is a question or error
        # 3. when the answer is invalid and there are more questions
        resp = {
            "prev_option": [],
            "question": "✅ Your response has been recorded in the organizer." if done 
                                                                        else prompt if has_question or (invalid_user_response and not force_skip_executed)
                                                                        else f"{validation_reply} Let's move on to the next question: {prompt}",
            # "itemId": nq_question_data.get("itemId"),
            "itemId": itemId,
            "functionFlow": None,
            "dynamicFunctionData": None
        }

        # setup the function data for the policy question
        if state == "policy":
            current_policy_question = prompt if (not has_question and not invalid_user_response) else last_question
            this_item = qs[0] if qs else {}
            policyData = this_item.get("policiesQuestion", [])
            if current_policy_question:
                current_policy_obj = next(
                    (p for p in policyData if p.get("question", "").strip().lower() == current_policy_question.strip().lower()),
                    {}
                )
                policy_function_flow = current_policy_obj.get("functionFlow", [])
                resp["functionFlow"] = policy_function_flow
                
                if policy_function_flow and len(affirmative_dependents) > 1:
                    # FIXED: Use affirmative_dependents instead of full_items for policy questions
                    resp["dynamicFunctionData"] = {
                        "result": affirmative_dependents  # Only dependents who answered "yes" to main question
                    }
                else:
                    # Check if there's executionResult in the policy object or in any function
                    # execution_result = current_policy_obj.get("executionResult")
                    # if not execution_result:
                    #     # Check in function flow items
                    #     for func in policy_function_flow:
                    #         if isinstance(func, dict) and func.get("executionResult"):
                    #             execution_result = func.get("executionResult")
                    #             break
                    # resp["dynamicFunctionData"] = execution_result
                    resp["dynamicFunctionData"] = []
                    resp["functionFlow"] = []
        
            resp["itemId"] = this_item.get("itemId")
            
        if not done and state == "awaiting_answer":
            ff = questions[0].get("functionFlow")
            df = questions[0].get("dynamicFunctionData")
            resp.update(functionFlow=ff, dynamicFunctionData=df)

        update_cluster_session(uuid, assistantId, {
            "last_question": (prompt if not invalid_user_response and not has_question else last_question),
            "state": state,
            "collected_answers": collected,
            "pending_policy_questions": pending_policy,
            "full_items_details": full_items,
            "affirmative_dependents": affirmative_dependents,
            "collected_policy_pairs": collected_pairs_dependent,
            # "current_dependent": full_items[0]["storyName"].lower() if full_items else None,
            "invalid_count": invalid_count,
            "repeat_policy_count": 0,
            "questions_obj": questions,
            # "policy_log": policy_specific_data,
            "conversation_history": previous_conversation,
        })
        
        return resp

    def fetch_question_again(mode=mode):
        # Reuse fetch_next_question logic to avoid duplication
        return fetch_next_question(mode)

    # Initial fetch - this populates questions, first_question, itemId, new_q, and policy
    if state == "awaiting_question":
        policy, new_q = fetch_next_question()
    else:
        questions = session_data.get("questions_obj", [])
        first_question = questions[0] if questions else {}
        itemId = first_question.get("itemId") if questions else None
        new_q = first_question.get("backendQuestions") if questions else None
        try:
            policy = list(first_question.get("policy", [{}])[0].keys()) if questions else []
        except:
            policy = []

    # policy, new_q = fetch_next_question()          
   
    # print("**************************")
    print("* CLUSTERED CROSSED HERE *")
    print("**************************")
    
    if mode == 'personal':
        # Cache navigation metadata once
        is_last_chapter_raw = questions[0].get("isLastChapter", False)
        is_last_chapter = (
            True if is_last_chapter_raw is True
            else str(is_last_chapter_raw).strip().lower() == "true"
        )
        next_chapter = questions[0].get("nextChapter")
        next_chapter_id = questions[0].get("nextChapterId")


    if not questions:  # Check if questions is empty
        log_function_call("Your response for this chapter has been recorded. Do you want to move to the next chapter?No unfilled personal questions found for userStoryId:")
        return {
            "status": "error",
            "message": "Your response for this chapter has been recorded. Do you want to move to the next chapter?"
        }
    
    if mode == 'cluster':
        policies = questions[0].get("policiesQuestion") or []
        policy_topic = [item['policy'] for item in policies if item and 'policy' in item]
    else:    
        policy_topic = [item['policy'] for item in questions[0].get("policiesQuestion", [])]

    if policy_specific_data == {} or policy_specific_data == [] or policy_specific_data[0] == 'documentLocation': #handle older format with documentLocation
        policy_specific_data =  [{'policy': p, 'value': None} for p in policy_topic]

    try:
        item_name = questions[0]["itemName"]
        context = questions[0]["context"]
    except Exception as e:
        item_name = None
        context = None

    if not new_q:  # If no new question is found, return the message
        return {
            "status": "success",
            "message": new_q
        }

    if state == "awaiting_answer" and invalid_count < 4:
        if not user_response:
            response_to_user["bot_response"] = "I didn't catch that. Could you please clarify?"
        else:
            raw_result = validate_user_response(new_q, clean_input(user_response))

            if isinstance(raw_result, str):
                validator_result = raw_result
                validator_reason = "No reason provided" 
                validator_reply = ""
            else:
                validator_result = str(raw_result.output)
                validator_reason = str(raw_result.reason)
                validator_reply = f"{str(raw_result.reply)} "

            if validator_result == "error":
                invalid_count += 1
                if invalid_count >= max_invalid_count:
                    log_user_bot_exchange(last_question, user_response, "Force skipped after 3 invalid attempts")
                    update = force_skip_and_move_on(new_q, "Skipped", mode=mode)
                    state = update["state"]
                    invalid_count = update["invalid_count"]
                    last_question = update["last_question"]
                    previous_conversation = " "
                    main_question_response = ""
                    policy_specific_data = []
                    response_to_user["next_question"] = f"{validator_reply}{const_move_on_to_next_question}{new_q}"
                else:
                    log_user_bot_exchange(questions + ([policy_question] if state == "policy" else []), user_response, "Invalid response - retry prompt")
                    policy, new_q = fetch_question_again(mode=mode)
                    response_to_user["next_question"] = f"{validator_reply}Let's try that again: {new_q}"
                    last_question = new_q
                    state = "awaiting_answer"       

            elif "answer" in validator_result:
                previous_conversation = str(previous_conversation) + "\n" + "Bot : {}, User : {}".format(new_q, user_response)
                rephrase_text = summary_generation(user_response, questions[0]["itemName"]) 
                log_user_bot_exchange(questions + ([policy_question] if state == "policy" else []), user_response,rephrase_text,  selected_items_details=full_items)
                
                # Save the initial response to the main question for potential use in policy section
                main_question_response = user_response

                if policy_topic != []:
                    policy_specific_data = update_policy_data(new_q, user_response, policy_topic, policy_specific_data, "")
                    
                    try:
                        if sum(1 for item in policy_specific_data if item['value'] is None) == 0:
                            new_summary = summary_generation(previous_conversation)
                            new_summary = preprocess_features(new_summary)
                            if mode == "cluster":
                                update_result = update_cluster_assistant_data_to_database(new_summary, assistantId, bearer_token, itemId)
                            else:    
                                update_result = update_gather_assist_data_to_database(new_summary, userStoryId, bearer_token, "",chapterId)

                            policy, new_q = fetch_next_question(mode=mode)
                            response_to_user["next_question"] = f"{validator_reply}{const_move_on_to_next_question}{new_q}"
                            all_answer = " "
                            previous_conversation = " "
                            policy_specific_data = []
                            invalid_count = 0 

                        else:
                            policies = questions[0].get("policiesQuestion", [])
                            next_policy_index = next((i for i, item in enumerate(policy_specific_data) if item['value'] is None), len(policies))
                            
                            if next_policy_index < len(policies):
                                policy_question = policies[next_policy_index].get("question", "")
                            else:
                                policy_question = ""

                            response_to_user["next_question"] = f"{validator_reply}{const_move_on_to_next_question}{policy_question}"
                            invalid_count = 0
                            state = "policy"
                            last_question = policy_question

                    except Exception as e:
                        policies = questions[0].get("policiesQuestion", [])
                        next_policy_index = next((i for i, item in enumerate(policy_specific_data) if item['value'] is None), len(policies))

                        if next_policy_index < len(policies):
                            policy_question = policies[next_policy_index].get("question", "")
                        else:
                            policy_question = ""

                        response_to_user["next_question"] = f"{validator_reply}{const_move_on_to_next_question}{policy_question}"
                        invalid_count = 0
                        state = "policy"
                        last_question = policy_question

                else:
                    new_summary = summary_generation(previous_conversation)
                    new_summary = preprocess_features(new_summary)
                    if mode == "cluster":
                        update_result = update_cluster_assistant_data_to_database(new_summary, assistantId, bearer_token, itemId)
                    else:    
                        update_result = update_gather_assist_data_to_database(new_summary, userStoryId, bearer_token, all_answer, chapterId)

                    all_answer = " "
                    previous_conversation = " "
                    policy_specific_data = []
                    policy, new_q = fetch_next_question(mode=mode)

                    if new_q:
                        if not new_q.startswith("Your response for this"):
                            response_to_user["bot_response"] = update_result
                        else:
                            response_to_user['bot_response']=''
                        response_to_user["next_question"] = f"{validator_reply}{const_move_on_to_next_question}{new_q}"
                        invalid_count = 0
                        state = "awaiting_answer"
                        last_question = new_q
                    else:
                        response_to_user["bot_response"] = f"Thank you! {update_result} All questions have been answered."
                        last_question = None
                        state = "done"

            elif validator_result == "skip" or validator_result == "no":
                # Clean and normalize raw user input
                cleaned_user_input = clean_input(user_response.strip().lower())
                if validator_result == "skip":
                    final_summary = "Skipped"
                else:
                    final_summary = summary_generation(cleaned_user_input, questions[0]["itemName"]).strip()

                collected_pairs_dependent = session_data.get("collected_policy_pairs", {})
                initial_answers = session_data.get("collected_answers", {})

                # Handle negative responses - store in session for cluster mode
                if mode == "cluster":
                    if full_items is None:
                        full_items = selected_items_details if selected_items_details else []
                        collected = {
                            item["storyName"].lower(): "No"
                            for item in full_items
                        }
                    
                    # Update the session with the new data
                    update_cluster_session(uuid, assistantId, {
                        "collected_policy_pairs": collected_pairs_dependent,
                        "last_question": last_question,
                        "state": state,
                        "invalid_count": invalid_count,
                        "repeat_policy_count": repeat_policy_count,
                        "policy_log": policy_specific_data,
                        "collected_answers": initial_answers,
                        "full_items_details": full_items,
                        "conversation_history": previous_conversation,
                        "questions_obj": questions
                    })

                log_user_bot_exchange(
                    questions + ([policy_question] if state == "policy" else []),
                    user_response,
                    final_summary,
                    selected_items_details=full_items
                )
                previous_conversation = str(previous_conversation) + "\n" + "Bot : {}, User : {}".format(new_q, user_response)
                if mode == "cluster":
                    update_cluster_assistant_data_to_database(final_summary, assistantId, bearer_token, itemId)
                else:
                    update_gather_assist_data_to_database(final_summary, userStoryId, bearer_token, "None", chapterId)

                # Reset state
                previous_conversation = " "
                all_answer = " "
                main_question_response = ""
                policy_specific_data = []
                policy, new_q = fetch_next_question(mode=mode)

                if new_q:
                    response_to_user["next_question"] = f"{validator_reply}{const_move_on_to_next_question}{new_q}"
                    invalid_count = 0
                    last_question = new_q
                    state = "awaiting_answer"
                else:
                    response_to_user["bot_response"] = "No more questions remain."
                    last_question = None
                    state = "done"

            elif 'question' in validator_result:
                response_to_user["bot_response"] = f"{validator_reply} To continue: {last_question}"
                log_user_bot_exchange(questions + ([policy_question] if state == "policy" else []), user_response, validator_reply)
            else:
                policy, new_q = fetch_question_again(mode=mode)
                rephrased_answer = rephrase_sentence("Your answer was invalid " + new_q) 
                log_user_bot_exchange(questions + ([policy_question] if state == "policy" else []), user_response, rephrase_text,  selected_items_details=full_items)

                if new_q:
                    response_to_user["next_question"] = rephrased_answer
                    invalid_count += 1
                    last_question = new_q
                    state = "awaiting_answer"
                else:
                    response_to_user["bot_response"] += " No more questions remaining."
                    last_question = None
                    state = "done"

    elif state == "policy":
        if mode == 'cluster':
            # Use existing data instead of making another database call
            # first_question already contains the same data as questions[0]
            this_item = first_question
        raw_result = validate_user_response(last_question, clean_input(user_response))

        if isinstance(raw_result, str):
            validator_result_policy = raw_result
            validator_reason_policy = "No reason provided"
            validator_reply_policy = ""
        else:
            validator_result_policy = str(raw_result.output)
            validator_reason_policy = str(raw_result.reason)
            validator_reply_policy = f"{str(raw_result.reply)} "

        if mode == 'cluster':
            # Get policies from CURRENT question, not from old session data
            current_question_obj = questions[0] if questions else {}
            policies = current_question_obj.get("policiesQuestion", [])
        else:
            policies = questions[0].get("policiesQuestion", [])
    # Get session data for cluster mode
        if mode == 'cluster':
            session = get_cluster_session(uuid, user_unique_id, user_response, assistantId)
            collected = session.get("collected_answers", {})
            pending_policy = session.get("pending_policy_questions", [])
            collected_pairs = session.get("collected_policy_pairs", {})
            full_items = session.get("full_items_details", [])
            collected_pairs_dependent = session.get("collected_policy_pairs", {})
            initial_answers = session.get("collected_answers", {})
            main_question_text = questions[0].get("backendQuestions")
            affirmative_dependents = session.get("affirmative_dependents", [])
        else:
            collected = {}
            pending_policy = []
            collected_pairs = []
            full_items = session_data.get("full_items_details", [])
            collected_pairs_dependent = {}
            initial_answers = {}
            main_question_text = ""
            affirmative_dependents = [] 

        if validator_result_policy == "error":
            invalid_count += 1
            if invalid_count >= max_invalid_count:
                new_summary = "Skipped"

                # Handle negative responses - store in session for cluster mode
                if mode == "cluster":
                    # Apply the negative response to all affirmative dependents
                    for item in affirmative_dependents:
                        current_dependent = item["storyName"].lower()
                        collected_pairs_dependent[current_dependent].append({
                            "question": last_question,
                            "answer": "Skip"
                        })
                    
                    # Update the session with the new data
                    update_cluster_session(uuid, assistantId, {
                        "collected_policy_pairs": collected_pairs_dependent,
                        "last_question": last_question,
                        "state": state,
                        "invalid_count": invalid_count,
                        "repeat_policy_count": repeat_policy_count,
                        "policy_log": policy_specific_data,
                        "collected_answers": initial_answers,
                        "full_items_details": full_items,
                        "conversation_history": previous_conversation,
                        "questions_obj": questions
                    })

                log_user_bot_exchange(last_question, user_response, "Force skipped after 3 invalid attempts")
                for i, item in enumerate(policy_specific_data):
                    if item["value"] is None:
                        policy_specific_data[i]["value"] = new_summary
                        break
                previous_conversation += f"\nBot : {last_question}, User : {new_summary}"
                update = force_skip_and_move_on(last_question, new_summary, "policy", mode=mode)
                state = update["state"]
                invalid_count = update["invalid_count"]
                last_question = update["last_question"]
                if state == "awaiting_answer":
                    previous_conversation = " "
                    main_question_response = ""
                    policy_specific_data = []
                # response_to_user["next_question"] = f"{validator_reply_policy}{const_move_on_to_next_question}{next_question}"
                response_to_user["next_question"] = f"{validator_reply_policy}{const_move_on_to_next_question}{last_question}"
            else:
                next_question = last_question
                log_user_bot_exchange(last_question, user_response, "Invalid response - retry prompt") 
                response_to_user["next_question"] = f"{validator_reply_policy}Let's try that again: {next_question}"

        elif "answer" in validator_result_policy:
            # Handle positive responses - store in session for cluster mode
            if mode == 'cluster':

                affirmative_dependents_details = session.get("affirmative_dependents", [])
                affirmative_dependent_names = [dep["storyName"] for dep in affirmative_dependents_details]

                policy_answers = parse_free_text_response(clean_input(user_response), affirmative_dependent_names, last_question)
                for dependent_name, specific_answer in policy_answers.items():
                    lower_dep_name = dependent_name.lower()
                    # Check if this dependent is in our session log before updating
                    if lower_dep_name in collected_pairs_dependent:
                        collected_pairs_dependent[lower_dep_name].append({
                            "question": last_question,
                            "answer": specific_answer
                        })

                # Update the session with the new data
                update_cluster_session(uuid, assistantId, {
                    "collected_policy_pairs": collected_pairs_dependent,
                    "last_question": last_question,
                    "state": state,
                    "invalid_count": invalid_count,
                    "repeat_policy_count": repeat_policy_count,
                    "policy_log": policy_specific_data,
                    "collected_answers": initial_answers,
                    "full_items_details": full_items,
                    "conversation_history": previous_conversation,
                    "questions_obj": questions
                })

            # Save current response to policy_specific_data
            for i, item in enumerate(policy_specific_data):
                if item["value"] is None:
                    policy_specific_data = update_policy_data(
                        last_question, user_response, policy_topic,
                        policy_specific_data, policies[i]["policy"]
                    )
                    break

            rephrase_text = summary_generation(user_response)
            log_user_bot_exchange(last_question, user_response, rephrase_text, selected_items_details=full_items)
            previous_conversation += f"\nBot : {last_question}, User : {user_response}"

            # Check if all policy questions answered
            if all(item["value"] is not None for item in policy_specific_data):
                # Handle summary generation and database update
                if mode == "cluster" and full_items:
                    update_response = do_update_bulk_cluster_assistant_data_to_database()

                elif mode == "cluster":
                    bullet_summary = "\n".join(
                        line.strip()
                        for line in summary_generation(previous_conversation).split("\n")
                        if line.strip()
                    )
                    update_response = update_cluster_assistant_data_to_database(
                        bullet_summary,
                        assistantId,
                        bearer_token,
                        itemId
                    )
                else:
                    final_summary = "\n".join(
                    line.strip()
                    for line in summary_generation(previous_conversation).split("\n")
                    if line.strip()
                    )
                    update_response = update_gather_assist_data_to_database(
                        final_summary,
                        userStoryId,
                        bearer_token,
                        all_answer,
                        chapterId
                    )

                # Reset for next question
                all_answer = " "
                previous_conversation = " "
                main_question_response = ""
                policy_specific_data = []

                policy, new_q = fetch_next_question(mode=mode)
                response_to_user["next_question"] = f"{validator_reply_policy}{const_move_on_to_next_question}{new_q}"
                state = "awaiting_answer"
                invalid_count = 0
            else:
                # Find next eligible policy question with conditions met
                next_policy_index = None
                for i, policy_obj in enumerate(policies):
                    if policy_specific_data[i]["value"] is not None:
                        continue
                    if not check_policy_conditions(policy_obj, policy_specific_data, policies):
                        policy_specific_data[i]["value"] = "Skipped (condition not met)"
                        continue
                    next_policy_index = i
                    break   

                if next_policy_index is not None:
                    policy_question = policies[next_policy_index].get("question", "Let's continue.").replace('"', "")
                    cleaned_question = policy_question.replace('\"', '') if policy_question else ""
                    response_to_user["next_question"] = f"{validator_reply_policy}{const_move_on_to_next_question}{cleaned_question}" if policy_question else "Let's continue."
                    last_question = policy_question
                    state = "policy"
                else:
                    # All questions answered or blocked by conditions
                    summaries = summary_generation(previous_conversation).strip()
                    bullet_summary = "\n".join(line.strip() for line in summaries.split("\n") if line.strip())

                    if mode == "cluster":
                        update_response = update_cluster_assistant_data_to_database(bullet_summary, assistantId, bearer_token, itemId)
                    else:
                        update_response = update_gather_assist_data_to_database(bullet_summary, userStoryId, bearer_token, all_answer, chapterId)

                    all_answer = " "
                    previous_conversation = " "
                    main_question_response = ""
                    policy_specific_data = []

                    policy, new_q = fetch_next_question(mode=mode)
                    response_to_user["next_question"] = f"{validator_reply_policy}{const_move_on_to_next_question}{new_q}"
                    state = "awaiting_answer"
                    invalid_count = 0
        elif "skip" in validator_result_policy or "no" in validator_result_policy:
            skip_val = "Skipped" if "skip" in validator_result_policy else "No"
            
            # Handle negative responses - store in session for cluster mode
            if mode == "cluster":
                affirmative_dependents_details = session.get("affirmative_dependents", [])
                affirmative_dependent_names = [dep["storyName"] for dep in affirmative_dependents_details]

                policy_answers = parse_free_text_response(clean_input(user_response), affirmative_dependent_names, last_question)
                for dependent_name, specific_answer in policy_answers.items():
                    lower_dep_name = dependent_name.lower()
                    # Check if this dependent is in our session log before updating
                    if lower_dep_name in collected_pairs_dependent:
                        collected_pairs_dependent[lower_dep_name].append({
                            "question": last_question,
                            "answer": specific_answer
                        })

                # Update the session with the new data
                update_cluster_session(uuid, assistantId, {
                    "collected_policy_pairs": collected_pairs_dependent,
                    "last_question": last_question,
                    "state": state,
                    "invalid_count": invalid_count,
                    "repeat_policy_count": repeat_policy_count,
                    "policy_log": policy_specific_data,
                    "collected_answers": initial_answers,
                    "full_items_details": full_items,
                    "conversation_history": previous_conversation,
                    "questions_obj": questions
                })

            for i, item in enumerate(policy_specific_data):
                if item["value"] is None:
                    policy_specific_data[i]["value"] = skip_val
                    break

            previous_conversation += f"\nBot : {last_question}, User : {user_response}"
            log_user_bot_exchange(last_question, user_response, skip_val, selected_items_details=full_items)

            # Same logic as above: check for next valid question
            if all(item["value"] is not None for item in policy_specific_data):
                if mode == "cluster" and full_items:
                    update_response = do_update_bulk_cluster_assistant_data_to_database()
                else:
                    bullet_summary = "\n".join(line.strip() for line in summary_generation(previous_conversation).split("\n") if line.strip())
                    final_summary = preprocess_features(bullet_summary)

                    if mode == "cluster":
                        update_response = update_cluster_assistant_data_to_database(final_summary, assistantId, bearer_token, itemId)
                    else:
                        update_response = update_gather_assist_data_to_database(final_summary, userStoryId, bearer_token, all_answer, chapterId)

                all_answer = " "
                previous_conversation = " "
                main_question_response = ""
                policy_specific_data = []

                policy, new_q = fetch_next_question(mode=mode)
                response_to_user["next_question"] = new_q
                state = "awaiting_answer"
            else:
                next_policy_index = None
                for i, policy_obj in enumerate(policies):
                    if policy_specific_data[i]["value"] is not None:
                        continue
                    if not check_policy_conditions(policy_obj, policy_specific_data, policies):
                        policy_specific_data[i]["value"] = "Skipped (condition not met)"
                        continue
                    next_policy_index = i
                    break

                if next_policy_index is not None:
                    policy_question = policies[next_policy_index].get("question", "").replace('"', "")
                    response_to_user["next_question"] = f"{validator_reply_policy}{const_move_on_to_next_question}{policy_question}"
                    last_question = policy_question
                    state = "policy"
                else:
                    policy_question = "Continuing to the next section..."
                    response_to_user["next_question"] = f"{validator_reply_policy}{const_move_on_to_next_question}{policy_question}"
                    last_question = policy_question
                    state = "policy"
            
        elif 'question' in validator_result_policy:
            response_to_user["bot_response"] = f"{validator_reply_policy} To continue: {last_question}"
            log_user_bot_exchange(last_question, user_response, validator_reply_policy)

        else:
            next_policy_index = None
            for i, policy_obj in enumerate(policies):
                if policy_specific_data[i]["value"] is not None:
                    continue
                if not check_policy_conditions(policy_obj, policy_specific_data, policies):
                    policy_specific_data[i]["value"] = "Skipped (condition not met)"
                    continue
                next_policy_index = i
                break

            if next_policy_index is not None:
                policy_question = policies[next_policy_index].get("question", "").replace('"', "")
            else:
                policy_specific_data[i]["value"] = "Skipped (condition not met)"
                last_question = policy_question

            rephrased_policy_question = last_question
            rephrased_answer = summary_generation(validator_reason_policy + " " + rephrased_policy_question)
            response_to_user["next_question"] = rephrased_answer
            state = "policy"
            log_user_bot_exchange(last_question, user_response, validator_reason_policy, selected_items_details=full_items)

    elif state == "awaiting_answer" and invalid_count > max_invalid_count:
        response_to_user["bot_response"] = "Response skipped or invalid please fill in the details manually, Let's move to the next Question "

        if mode == 'cluster':
            update_response = update_cluster_assistant_data_to_database("Skipped", assistantId, bearer_token, itemId)
        else:    
            update_response = update_gather_assist_data_to_database("Skipped", userStoryId, bearer_token, "", chapterId)

        if isinstance(update_response, dict) and "body" in update_response:
            newDescription = update_response["body"].get("newDescription", user_response)
        else:
            newDescription = user_response

        log_user_bot_exchange(last_question, user_response, newDescription,  selected_items_details=full_items)
        all_answer = " "
        previous_conversation = " "
        policy, new_q = fetch_next_question(mode=mode)
        if new_q:
            response_to_user["next_question"] = new_q
            invalid_count = 0
            last_question = new_q
            state = "awaiting_answer"
        else:
            response_to_user["bot_response"] += " No more questions remain."
            last_question = None
            state = "done"
    else:
        # Use existing question data instead of making another database call
        # new_q is already populated from the initial fetch_next_question() call
        if new_q:
            response_to_user["bot_response"] = f"Alright, let's get started! {new_q}"
            state = "awaiting_answer"
            last_question = new_q
            invalid_count = 0
        else:
            response_to_user["bot_response"] = "All questions have been answered."
            last_question = None
            state = "done"

    # Use existing questions data instead of making another database call
    # questions and first_question are already populated from the initial fetch_next_question() call
    current_question_obj = first_question  # Use the first_question we already have

    bot_response = response_to_user.get("bot_response", "")
    next_question = response_to_user.get("next_question", "")
    current_question = new_q if state != "policy" else last_question
    previous_question = last_question_unchanged 

    function_flow = None
    dynamic_function_data = None
    if mode == 'cluster':
        function_flow = current_question_obj.get("functionFlow")
        dynamic_function_data = current_question_obj.get("dynamicFunctionData")

    update_data = {
        "last_question": current_question,
        "prev_question": previous_question,
        "user_response": user_response,
        "main_question_response": main_question_response if state == "policy" else user_response,
        "invalid_count": invalid_count,
        "repeat_policy_count": repeat_policy_count,
        "state": state,
        'answer_log': all_answer,
        "policy_done": policy_done,
        "conversation_history": previous_conversation, 
        "policy_log": policy_specific_data,
        "functionFlow": function_flow,
        "dynamicFunctionData": dynamic_function_data,
        "questions_obj": questions,
        "full_items_details": full_items
    }
    
    if mode == 'cluster':
        # Use existing data instead of reassigning
        # function_flow and dynamic_function_data are already populated from fetch_next_question()
        update_cluster_session(uuid, assistantId, update_data)
    else:    
        update_gather_assist_session(uuid, chapterId, update_data)

    non_final_phrases = [
        "Moving to the next question.",
        "Let's continue.",
        "Proceeding to the next step.",
        "Moving on."
    ]

    if mode == 'cluster':
        default_like_phrases = [
        "Your response for this chapter has been recorded.",
        ]

        _type = (type or "").lower()
        is_assistant = _type == "assistant"

        # Combine bot_response and next_question checks
        is_completion_message = (
            "All assistant items completed successfully" in (bot_response or "") or
            "All assistant items completed successfully" in (next_question or "")
        )

        # STEP 2: Final fallback message logic (refactored)
        if state == "done" or (is_completion_message and is_assistant):
            final_response = "✅ Your response has been recorded in the organizer."
        elif next_question and not any(phrase in next_question for phrase in default_like_phrases + non_final_phrases):
            final_response = next_question
        elif bot_response and not any(phrase in bot_response for phrase in default_like_phrases + non_final_phrases):
            final_response = bot_response
        else:
            final_response = "✅ Your response has been recorded in the organizer." if is_assistant else "Your response for this chapter has been recorded."

        # Clean and fallback
        final_response = (final_response or "").replace('"', "")
        
        if not final_response:
            final_response = "Sorry, something went wrong. Please restart or refresh the conversation." 

        # Use existing questions data instead of making another database call
        # The questions, first_question, and itemId are already populated from the initial fetch_next_question() call
        current_question_itemId = itemId  # Use the itemId we already have

        response = {
            "prev_option": ["random1", "random2"],
            "question": final_response,
            "itemId": current_question_itemId,
        }
        
        if not is_completion_message and state != "policy":
            # Use existing data instead of making another database call
            function_flow = first_question.get("functionFlow") if first_question else None
            dynamic_function_data = first_question.get("dynamicFunctionData") if first_question else None
            response["functionFlow"] = function_flow
            response["dynamicFunctionData"] = dynamic_function_data
            response["itemId"] = current_question_itemId

        return response
    else:

        default_like_phrases = [
            "Your response for this chapter has been recorded.",
            "Your response for this chapter has been recorded. Do you want to move to the next chapter?",
            "Your response for this chapter has been recorded. Do you want to move to the Assistant screen?"
        ]
        
        if next_question and all(phrase not in next_question for phrase in default_like_phrases + non_final_phrases):
            final_response = next_question
        elif bot_response and all(phrase not in bot_response for phrase in default_like_phrases + non_final_phrases):
            final_response = bot_response
        else:
            _type = (type or "").lower()
            if _type == "story" and not is_last_chapter:
                final_response = "✅ Your response has been recorded.\n\n➡️ Do you want to move to the next chapter?"
            elif _type == "story" and is_last_chapter:
                final_response = "✅ Your response has been recorded."
            elif _type == "assistant" and not is_last_chapter:
                final_response = "Your response for this chapter has been recorded. Do you want to move to the Assistant screen?"
            elif _type == "assistant" and is_last_chapter:
                final_response = "Your response for this chapter has been recorded. Do you want to move to the Assistant screen?"
            else:
                final_response = "✅ Your response has been recorded."

        # Clean and format
        final_response = (final_response or "").replace('"', "")

        if not final_response:
            final_response = "Sorry, something went wrong. Please restart or refresh the conversation."

        all_questions_done = any(
            phrase in final_response.strip() for phrase in default_like_phrases
        )

        response = {
            "prev_option": ["random1", "random2"], 
            "question": final_response, 
            "userStoryId": userStoryId, 
            "allQuestionsAnswered": all_questions_done, 
            "is_last_chapter": is_last_chapter,
            "nextChapter": next_chapter,
            "nextChapterId": next_chapter_id
            }

        return response