"""
LLM prompt construction for Onboarding Recommendation.
Builds structured prompts for selecting relevant functions, assistants, and tasks.
"""
from typing import List, Dict, Any


def get_system_prompt() -> str:
    return """You are an AI that creates complete, personalized onboarding plans for caregiving users.

    Your job is to:
    - Understand the user's profile, responsibilities, and preferences
    - Select relevant functions, assistants, and tasks ONLY from the provided options
    - Build a coherent, prioritized onboarding plan

    CRITICAL RULES:
    - Any task the user explicitly marked YES MUST be included
    - Any task the user explicitly marked NO MUST be excluded
    - Selections must be comprehensive, not minimal
    - Sequence numbers must be UNIQUE, PRIORITY-BASED, and INTERLEAVED across functions and tasks

    You must reason carefully but output ONLY valid JSON.
    No markdown. No explanations. No comments."""

def build_recommendation_prompt(
    tasks: List[Dict[str, Any]],
    onboarding_data: Dict[str, Any],
    functions_with_assistants: List[Dict[str, Any]]
) -> str:
    """
    Build the LLM prompt for selecting relevant functions, assistants, and tasks.

    Args:
        tasks: List of task items from onboardingRecommendation
        onboarding_data: User's onboarding selections
        functions_with_assistants: All available functions with their assistants
    """
    profile_text = _format_user_profile(onboarding_data)
    preferences_text = _format_user_preferences(onboarding_data)
    functions_text = _format_functions_with_assistants(functions_with_assistants)
    tasks_text = _format_tasks(tasks)

    # Count totals
    total_functions = len(functions_with_assistants)
    total_assistants = sum(len(f.get('assistants', [])) for f in functions_with_assistants)
    total_tasks = len(tasks)

    prompt = f"""CREATE A PERSONALIZED ONBOARDING PLAN FOR THIS USER:
    
    ### USER PROFILE AND PREFERENCES ###
    {profile_text}

    {preferences_text}
    ### END OF USER PROFILE AND PREFERENCES ###

    ### POTENTIAL RECOMMENDATIONS ###
    AVAILABLE FUNCTIONS WITH ASSISTANTS ({total_functions} functions, {total_assistants} assistants):

    {functions_text}

    AVAILABLE TASKS ({total_tasks} tasks):

    {tasks_text}
    ### END OF POTENTIAL RECOMMENDATIONS ###

    YOUR OBJECTIVE:
    Create a COMPLETE onboarding plan that helps this user manage ALL relevant aspects of their situation.

    KEY CONCEPTS:
    - Entity Categories: The types of entities the user manages
        Examples: Care Receivers, Pets, Real Estate, Vehicles
    - Entity Types: Sub-categories within each category
        Examples: Care Receiver → Parent, Child, Spouse, Sibling
                Pet → Dog, Cat
                Vehicle → Car, Motorcycle
                Real Estate → Primary, Vacation, Rental
    - Functions: Major assistance areas (e.g., Medical & Health Management, Financial Management & Banking)
    - Assistants: Specific tools within each function
    - Tasks: Supplementary activities that can potentially assist the user situation

    FILTERING RULES (Apply in this exact order):

    ### START RULE 1 ###
    RULE 1: INCLUDE ASSISTANTS RELEVANT TO USER'S ENTITIES

    FOCUS ONLY ON: Does the user have the entity category and entity type this assistant requires?

    Process each assistant individually:
    - Determine if the assistant is relevant to the user's entity categories/types
    - Use BOTH explicit mentions AND logical relevance
    - DEFAULT: If uncertain whether an assistant is relevant → INCLUDE it (err on the side of inclusion)
    - Do not compare against assistants awaiting or already processed; focus only on the current assistant

    EXPLICIT MATCH: 
    - Assistant mentions "for pets" and user has pets → INCLUDE
    - Assistant mentions "for vehicles, autos, etc" and user has vehicles → INCLUDE
    - Assistant mentions "for real estate, property, home, etc" and user has real estate → INCLUDE

    LOGICAL RELEVANCE: Think about the PURPOSE and CONTEXT
    - Would someone managing care receivers need this assistant? → INCLUDE
    - Would someone with pets need this assistant? → INCLUDE  
    - Would someone with real estate need this assistant? → INCLUDE
    - Example: "Financial & Tax Documents" + user has care receivers 
            → INCLUDE (managing parent finances requires tax documents)
    - Example: "Digital Legacy & End-of-Life Accounts" + user has care receivers (aging parents)
            → INCLUDE (end-of-life planning is relevant for elderly parents)

    VALID EXCLUSION CRITERIA:
    Examples:
    - User has NO pets AND assistant is for "Pet specific" → EXCLUDE (reason: "User has no pets")
    - User has NO real estate AND assistant is for "Rental, Property, Home etc" → EXCLUDE (reason: "User has no real estate")
    - User has NO autos AND assistant is for "Auto, Vehicle, etc" → EXCLUDE (reason: "User has no autos")
    - User has NO children and assistant is for "Child or Dependent" → EXCLUDE (reason: "User has no children")

    IMPORTANT INCLUSION CRITERIA:
    - If the assistant does NOT meet one of the above exclusion criteria, you MUST include it.
    - If the assistant is not created for a specific entity category or entity type, you MUST include it.
    - No subjective relevance, priority, or applicability is allowed to exclude an assistant.

    EVERY excluded assistant MUST appear in "excluded assistants" output with specific reason.
    ### END OF RULE 1 ###

    ### START RULE 2 ###
    RULE 2: REMOVE EMPTY FUNCTIONS
    - If a function has NO assistants remaining after Rule 1 → EXCLUDE the function
    ### END OF RULE 2 ###

    SEQUENCING RULES:
    - Functions and tasks share ONE unified sequence (1, 2, 3, ...)
    - Sequence is based on USER PRIORITY, not item type
    - Interleave functions and tasks naturally
    - Sequence numbers must be UNIQUE — no two items share a number
    - Higher priority items must have lower sequence numbers

    NO DUPLICATES RULE (CRITICAL):
    - Each FUNCTION may appear only ONCE in the output
    - Each TASK may appear only ONCE in the output
    - Do NOT repeat the same function or task with different sequence numbers
    - If an item is relevant, include it ONCE with the appropriate priority and sequence

    SELF-CHECK (DO NOT OUTPUT THIS STEP):
    Before producing the final JSON, confirm that:
    - All available assistants are accounted for (in either selected or "excluded assistants")
    - EVERY excluded assistant has a reason in "excluded assistants" output
    - No exclusion reason mentions task preferences (only entity mismatches allowed)
    - No selected function has missing relevant assistants
    - Sequence numbers are unique and ordered correctly
    - NO duplicate functions or tasks exist in the output

    RESPONSE FORMAT (JSON ONLY — STRICT):
    - Output ONLY the JSON object below
    - Do NOT include explanations, reasoning, comments, or validation text
    - Do NOT include markdown
    - Do not include any other text or comments

    {{
    "functions": [
        {{
        "activityId": <id>,
        "activityName": "<exact name>",
        "sequence": <number>,
        "assistants": [
            {{
            "assistantName": "<exact name>",
            "assistantId": <id>,
            "reason": "<why this assistant helps the user's entities>",
            "priority": "high | medium | low"
            }}
        ]
        }}
    ],
    "tasks": [
        {{
        "title": "<exact title>",
        "metaData": {{ "url": "<url>", "type": "<type if present>" }},
        "reason": "<why this task helps the user>",
        "priority": "high | medium | low",
        "sequence": <number>
        }}
    ],
    "excluded assistants": [
        {{
        "assistantName": "<exact name>",
        "assistantId": <id>,
        "reason": "<detail explanation why this assistant was excluded from the selection>",
        }}
    ],
    "excluded functions": [
        {{
        "activityId": <id>,
        "activityName": "<exact name>",
        "reason": "<detail explanation why this function was excluded from the selection>"
        }}
    ]
    }}

    FINAL CONSTRAINTS:
    - ONLY select from the provided functions, assistants, and tasks
    - DO NOT invent new items
    - Preserve exact names and IDs
    - Use real entity names from the profile where helpful
    """

    return prompt


def build_entity_match_prompt(
    function_with_assistants: Dict[str, Any],
    profile_text: str,
) -> str:
    """
    Build a simplified prompt to check each assistant in the given function against
    the user profile: include only assistants whose required entity is present
    (e.g. pet assistant → user has pets). Caller should pass profile_text from
    _format_user_profile(onboarding_data) once. Returns prompt string.
    """
    functions_text = _format_functions_with_assistants([function_with_assistants])
    activity_name = function_with_assistants.get("activityName", "Unknown")

    prompt = f"""You are an AI that checks whether each assistant is relevant to a user's profile based on REQUIRED ENTITIES.

        ### USER PROFILE (from onboarding) ###
        {profile_text}
        ### END USER PROFILE ###

        ### SINGLE FUNCTION AND ITS ASSISTANTS ###
        {functions_text}
        ### END ###

        TASK:
        For the function "{activity_name}", look at each assistant. Each assistant may be designed 
        for a specific entity type (e.g. pets, autos, real estate, care receivers, children).

        RULES:
        *** STEP 1 — ENTITY PRE-FILTER (run this first, before any other rule) ***
        - If the assistant name contains "Pet" AND user has no pets → EXCLUDE immediately. Do not apply inclusion rules.
        - If the assistant name contains "Vehicle" or "Auto" AND user has no vehicles → EXCLUDE immediately.
        - If the assistant name contains "Property" or "Real Estate" AND user has no real estate → EXCLUDE immediately.

        *** STEP 2 — INCLUSION LOGIC (only for assistants that passed Step 1) ***
        - ERR ON THE SIDE OF INCLUSION: When an assistant has no explicit entity requirement...
        (rest of your existing rules unchanged)

        EVERY excluded assistant MUST appear in "excluded_assistants" with a specific reason (e.g. "User has no pets", "User has no real estate"). Only exclude when the mismatch is clear.

        Output ONLY valid JSON. No markdown. No explanations outside JSON.

        {{
        "matched_assistants": [
            {{
            "assistantId": <id>,
            "assistantName": "<exact name>",
            "reason": "<brief reason why this assistant matches the user profile>"
            }}
        ],
        "excluded_assistants": [
            {{
            "assistantId": <id>,
            "assistantName": "<exact name>",
            "reason": "<detail explanation why this assistant was excluded from the selection>"
            }}
        ]
        }}

        Include in "matched_assistants" all assistants that either match the user's entities or have no clear 
        entity requirement (err on the side of inclusion). Include in "excluded_assistants" ONLY assistants 
        with a clear entity mismatch (e.g. pet assistant but user has no pets). 
        Use exact assistantId and assistantName from the list above.
        """

    return prompt


def _key_to_display_name(key: str) -> str:
    """Convert a camelCase or suffixed key to a readable display name.
    e.g. 'businesslist' -> 'Business', 'careReceivers' -> 'Care Receivers'
    """
    import re
    # Remove common suffixes like 'list'
    name = re.sub(r'(?i)list$', '', key)
    # Split on camelCase boundaries
    parts = re.sub(r'([a-z])([A-Z])', r'\1 \2', name).split()
    return ' '.join(p.capitalize() for p in parts) if parts else key


def _format_entity(entity: Dict[str, Any]) -> str:
    """Format a single entity (care receiver, pet, real estate, auto) for display."""
    name = entity.get('storyName', '')
    # Use storySubCategoryType first, fall back to storyType
    entity_type = entity.get('storySubCategoryType') or entity.get('storyType') or ''
    if name and entity_type:
        return f"{name} ({entity_type})"
    elif name:
        return name
    elif entity_type:
        return entity_type
    return "Unnamed"


def _format_user_profile(onboarding_data: Dict[str, Any]) -> str:
    """Format user's profile from onboardingData."""
    if not onboarding_data:
        return "USER PROFILE: Not provided"

    # Display names for known entity keys; new list-of-dict keys are auto-detected
    ENTITY_DISPLAY_NAMES = {
        'careReceivers': 'Care Receivers',
        'pets': 'Pets',
        'realestatelist': 'Real Estate',
        'autoslist': 'Vehicles',
        'dependents': 'Dependents',
        'realEstate': 'Real Estate',
        'autos': 'Vehicles',
    }

    # Scalar fields handled separately (not entity lists)
    SCALAR_FIELDS = {'currentStep', 'dateOfBirth'}

    lines = ["USER PROFILE:"]
    onboard1 = onboarding_data.get('onBoard1', {})

    if onboard1:
        for key, value in onboard1.items():
            # Handle scalar fields separately
            if key in SCALAR_FIELDS:
                if key == 'dateOfBirth' and value:
                    lines.append(f"- Date of Birth: {value}")
                continue

            # Auto-detect entity lists: must be a non-empty list of dicts
            if isinstance(value, list) and value and isinstance(value[0], dict):
                display_name = ENTITY_DISPLAY_NAMES.get(key, _key_to_display_name(key))
                names = [_format_entity(item) for item in value]
                lines.append(f"- {display_name}: {', '.join(names)}")

    return "\n".join(lines)


def _format_user_preferences(onboarding_data: Dict[str, Any]) -> str:
    """Format user's preferences from onboardingData."""
    lines = ["USER PREFERENCES:"]
    onboard2 = onboarding_data.get('onBoard2', {})

    if onboard2:
        yes_no_prefs = []
        other_prefs = []

        for key, value in onboard2.items():
            # Skip internal tracking fields
            if key in ['currentStep']:
                continue

            # Handle object with answer/description (new format)
            if isinstance(value, dict) and 'answer' in value:
                answer = value.get('answer', '')
                description = value.get('description', '')

                # Check if answer is yes/no
                if isinstance(answer, str) and answer.lower() in ['yes', 'no']:
                    yes_no_prefs.append((key, answer.upper(), description))
                # Skip "skip" answers — they indicate no preference, not exclusion
                elif isinstance(answer, str) and answer.lower() == 'skip':
                    continue
                # Handle list/array answers
                elif isinstance(answer, list):
                    formatted_answer = ', '.join(str(v) for v in answer)
                    other_prefs.append((key, formatted_answer, description))
                # Handle other answer types (strings, etc.)
                elif answer:
                    other_prefs.append((key, str(answer), description))
                continue

            # Handle simple yes/no string (legacy format)
            if isinstance(value, str) and value.lower() in ['yes', 'no']:
                yes_no_prefs.append((key, value.upper(), ''))
                continue

            # Skip "skip" answers in legacy format
            if isinstance(value, str) and value.lower() == 'skip':
                continue

            # Handle other non-empty values (lists, strings, etc.)
            if value:
                if isinstance(value, list):
                    formatted_value = ', '.join(str(v) for v in value)
                    other_prefs.append((key, formatted_value, ''))
                else:
                    other_prefs.append((key, str(value), ''))

        # Format other preferences (goals, persona, experience mode, etc.)
        for item in other_prefs:
            key, answer, description = item
            if description:
                lines.append(f"- {key}: {answer}")
                lines.append(f"  (Context: {description})")
            else:
                lines.append(f"- {key}: {answer}")

        # Format explicit task preferences with descriptions for context
        if yes_no_prefs:
            lines.append("\nEXPLICIT TASK PREFERENCES:")
            for item in yes_no_prefs:
                key, answer, description = item
                if description:
                    lines.append(f"- {key}: {answer}")
                    lines.append(f"  (Context: {description})")
                else:
                    lines.append(f"- {key}: {answer}")

    return "\n".join(lines)


def _format_functions_with_assistants(functions: List[Dict[str, Any]]) -> str:
    """Format all functions with their assistants."""
    if not functions:
        return "No functions available."

    lines = []

    for func in functions:
        activity_name = func.get('activityName', 'Unknown')
        activity_id = func.get('activityId', 0)
        func_desc = func.get('description', '')
        assistants = func.get('assistants', [])

        lines.append(f"FUNCTION: {activity_name} (activityId: {activity_id})")
        if func_desc:
            lines.append(f"  Description: {func_desc}")
        lines.append(f"  Assistants ({len(assistants)}):")

        for asst in assistants:
            asst_name = asst.get('assistantName', 'Unknown')
            asst_id = asst.get('assistantId', 0)
            asst_desc = asst.get('description', '')

            # Truncate description (400 chars for better context)
            desc = asst_desc[:400] + "..." if len(asst_desc) > 400 else asst_desc
            desc = ' '.join(desc.split())  # Clean whitespace

            lines.append(f"    - {asst_name} (assistantId: {asst_id})")
            if desc:
                lines.append(f"      Description: {desc}")

        lines.append("")

    return "\n".join(lines)


def _format_tasks(tasks: List[Dict[str, Any]]) -> str:
    """Format task items from onboardingRecommendation."""
    if not tasks:
        return "No tasks available."

    lines = []

    for i, task in enumerate(tasks, 1):
        title = task.get('title', 'Untitled')
        description = task.get('description', '')
        metadata = task.get('metaData') or {}

        # Truncate description (400 chars for better context)
        desc = description[:400] + "..." if len(description) > 400 else description
        desc = ' '.join(desc.split())  # Clean whitespace

        lines.append(f"[{i}] {title}")
        if desc:
            lines.append(f"    Description: {desc}")

        url = metadata.get('url', '')
        meta_type = metadata.get('type', '')
        if url:
            lines.append(f"    URL: {url}")
        if meta_type:
            lines.append(f"    Type: {meta_type}")

        lines.append("")

    return "\n".join(lines)


def _format_onboard2_goals_and_mode(onboarding_data: Dict[str, Any]) -> str:
    """Format Primary Caregiving Goals and Experience Mode from onBoard2 for priority/sequence context."""
    onboard2 = onboarding_data.get("onBoard2") or {}
    lines = []
    # Common key names (case-insensitive match)
    for key, value in onboard2.items():
        if key == "currentStep":
            continue
        key_lower = key.lower()
        if "experience" in key_lower and "mode" in key_lower:
            if isinstance(value, dict):
                lines.append(f"Experience Mode: {value.get('answer', value)}")
            else:
                lines.append(f"Experience Mode: {value}")
        elif "primary" in key_lower and "caregiving" in key_lower and "goal" in key_lower:
            if isinstance(value, dict):
                lines.append(f"Primary Caregiving Goals: {value.get('answer', value)}")
            else:
                lines.append(f"Primary Caregiving Goals: {value}")
    return "\n".join(lines) if lines else "Not provided"


def build_priority_sequence_prompt(
    functions: List[Dict[str, Any]],
    tasks: List[Dict[str, Any]],
    onboarding_data: Dict[str, Any],
) -> str:
    """
    Build prompt to assign priority and unified sequence to functions and tasks
    using onBoard2 Primary Caregiving Goals and Experience Mode. Follows
    sequencing rules: one sequence (1, 2, 3, ...), interleave, unique, higher priority = lower sequence.
    """
    goals_mode_text = _format_onboard2_goals_and_mode(onboarding_data)
    func_lines = []
    for f in functions:
        func_lines.append(
            f"- activityId: {f.get('activityId')}, activityName: {f.get('activityName', '')}, "
            f"current sequence: {f.get('sequence', '?')}, priority: {f.get('priority', '?')}"
        )
    task_lines = []
    for t in tasks:
        task_lines.append(
            f"- title: \"{t.get('title', '')}\", current sequence: {t.get('sequence', '?')}, priority: {t.get('priority', '?')}"
        )
    functions_text = "\n".join(func_lines) if func_lines else "None"
    tasks_text = "\n".join(task_lines) if task_lines else "None"

    prompt = f"""You are an AI that assigns priority and sequence to a list of functions and tasks for a caregiving user.

### USER CONTEXT (from onboarding) ###
{goals_mode_text}
### END USER CONTEXT ###

### CURRENT FUNCTIONS ###
{functions_text}

### CURRENT TASKS ###
{tasks_text}
### END ###

SEQUENCING RULES (apply exactly):
- Functions and tasks share ONE unified sequence (1, 2, 3, ...)
- Sequence is based on USER PRIORITY, not item type
- Interleave functions and tasks naturally
- Sequence numbers must be UNIQUE — no two items share a number
- Higher priority items must have lower sequence numbers

Assign each function and each task a "priority" (high | medium | low) and a unique "sequence" number (1, 2, 3, ...) so that the full list is ordered by user priority. Use the user's Experience Mode and Primary Caregiving Goals to decide order.

Output ONLY valid JSON. No markdown. No explanations.

{{
  "functions": [
    {{ "activityId": <id>, "sequence": <number>, "priority": "high | medium | low" }}
  ],
  "tasks": [
    {{ "title": "<exact title from list above>", "sequence": <number>, "priority": "high | medium | low" }}
  ]
}}

Include every function and every task exactly once. Use exact activityId and title to identify items.
"""
    return prompt
