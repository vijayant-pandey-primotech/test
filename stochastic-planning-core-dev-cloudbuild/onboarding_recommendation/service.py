"""
Business logic service for Onboarding Recommendation.
Orchestrates LLM calls and response formatting.
"""
import json
import uuid
from typing import Dict, Any, Optional, Tuple, List, Set

from core.logger import log_info, log_error
from .schemas import (
    OnboardingRecommendationRequest,
    OnboardingRecommendationData,
    RecommendedFunction,
    RecommendedAssistant,
    RecommendedTaskItem,
    RecommendedTaskGroup,
    UnselectedFunction,
    UnselectedAssistant,
    UnselectedTaskItem,
    UnselectedTaskGroup,
)
from .llm_client import OnboardingLLMClient
from .prompt_builder import (
    build_recommendation_prompt,
    build_entity_match_prompt,
    build_priority_sequence_prompt,
    _format_user_profile,
)
from .constants import (
    ERROR_LLM_FAILURE,
    ERROR_INVALID_RESPONSE,
    PRIORITY_HIGH,
    PRIORITY_MEDIUM
)


class OnboardingRecommendationService:
    """
    Service class for onboarding recommendation logic.
    Orchestrates LLM calls and response formatting.
    """

    def __init__(self):
        """Initialize the service."""
        self.llm_client = OnboardingLLMClient()

    async def generate_recommendation(
        self,
        request: OnboardingRecommendationRequest,
        request_id: str = None
    ) -> Tuple[bool, Optional[OnboardingRecommendationData], Optional[str]]:
        """
        Generate recommendation by selecting relevant functions, assistants, and tasks.

        Args:
            request: The validated request object
            request_id: Unique request identifier for logging

        Returns:
            Tuple of (success, data, error_message)
        """
        request_id = request_id or str(uuid.uuid4())
        log_info(f"[{request_id}] Starting onboarding recommendation generation")

        try:
            # Extract data from request
            tasks = self._extract_tasks(request)
            onboarding_data = self._extract_onboarding_data(request)
            functions_with_assistants = self._extract_functions(request)

            log_info(f"[{request_id}] Found {len(tasks)} tasks, {len(functions_with_assistants)} functions in payload")

            if not functions_with_assistants and not tasks:
                log_error(f"[{request_id}] No functions or tasks in payload")
                return False, None, "No functions or tasks provided"

            # For prompt only: remove activities matching onBoard2 "No" or "Skip" descriptions and those onBoard2 entries; keep originals for downstream
            functions_for_prompt, matched_onboard2_keys = self._filter_functions_by_onboard2_no_match(
                functions_with_assistants, onboarding_data
            )
            if matched_onboard2_keys:
                log_info(f"[{request_id}] For prompt: excluding {len(matched_onboard2_keys)} onBoard2 'No'/'Skip' entries and matching activities (exact description match)")
            onboarding_data_for_prompt = self._copy_onboarding_data_without_onboard2_keys(
                onboarding_data, matched_onboard2_keys
            )

            # Build llm_response from entity-match flow: run build_entity_match_prompt for each remaining function (onBoard2 not needed)
            llm_response = {
                "functions": [],
                "tasks": [],
                "excluded assistants": [],
                "excluded functions": [],
            }
            appended_count = 0
            if functions_for_prompt:
                profile_text = _format_user_profile(onboarding_data)
                has_pets = self._user_has_entity(onboarding_data, ("pets",), ("pet",))
                has_vehicles = self._user_has_entity(
                    onboarding_data,
                    ("autoslist", "autos", "vehicles"),
                    ("auto", "vehicle"),
                )
                has_real_estate = self._user_has_entity(
                    onboarding_data,
                    ("realestatelist", "realEstate", "realestate", "properties"),
                    ("realestate", "real estate", "property", "home"),
                )
                next_seq = 0
                for func in functions_for_prompt:
                    # Enforce hard entity exclusions in Python before LLM matching.
                    filtered_assistants = []
                    for asst in func.get("assistants", []) or []:
                        if not isinstance(asst, dict):
                            continue
                        assistant_name = asst.get("assistantName", "")
                        reason = self._get_prefilter_exclusion_reason(
                            assistant_name=assistant_name,
                            has_pets=has_pets,
                            has_vehicles=has_vehicles,
                            has_real_estate=has_real_estate,
                        )
                        if reason:
                            llm_response["excluded assistants"].append({
                                "assistantName": assistant_name,
                                "assistantId": asst.get("assistantId"),
                                "reason": reason,
                            })
                            continue
                        filtered_assistants.append(asst)

                    if not filtered_assistants:
                        continue

                    func_for_prompt = dict(func)
                    func_for_prompt["assistants"] = filtered_assistants

                    entity_prompt = build_entity_match_prompt(func_for_prompt, profile_text)
                    entity_response = await self.llm_client.generate_entity_match(entity_prompt)
                    if not entity_response:
                        continue
                    matched = entity_response.get("matched_assistants") or []
                    # Merge excluded_assistants into llm_response
                    for a in entity_response.get("excluded_assistants") or []:
                        if isinstance(a, dict) and (a.get("assistantId") is not None or a.get("assistantName")):
                            llm_response["excluded assistants"].append({
                                "assistantName": a.get("assistantName", ""),
                                "assistantId": a.get("assistantId"),
                                "reason": a.get("reason"),
                            })
                    if not matched:
                        continue
                    # Validate assistantIds exist in this function
                    asst_ids = {a.get("assistantId") for a in filtered_assistants}
                    valid_assistants = [
                        {
                            "assistantId": a.get("assistantId"),
                            "assistantName": a.get("assistantName", ""),
                            "reason": a.get("reason", ""),
                            "priority": PRIORITY_MEDIUM,
                        }
                        for a in matched
                        if isinstance(a, dict) and a.get("assistantId") in asst_ids
                    ]
                    if not valid_assistants:
                        continue
                    llm_response.setdefault("functions", []).append({
                        "activityId": func.get("activityId"),
                        "activityName": func.get("activityName", ""),
                        "sequence": next_seq,
                        "assistants": valid_assistants,
                    })
                    next_seq += 1
                    appended_count += 1
                if appended_count:
                    log_info(f"[{request_id}] Entity-match: {appended_count} function(s) with matched assistants")

            # Add tasks directly to llm_response for now.
            # TODO: We will use LLM to do task matching later,
            # based on Persona (experience mode) and Primary Caregiving Goals.
            for task in tasks:
                if not isinstance(task, dict):
                    continue
                title = task.get("title")
                if not title:
                    continue
                llm_response["tasks"].append({
                    "title": title,
                    "metaData": task.get("metaData"),
                    "reason": "",
                    "priority": PRIORITY_MEDIUM,
                    "sequence": 0,
                })

            # Assign priority and sequence using onBoard2 (Primary Caregiving Goals, Experience Mode)
            if llm_response["functions"] or llm_response["tasks"]:
                seq_prompt = build_priority_sequence_prompt(
                    llm_response["functions"],
                    llm_response["tasks"],
                    onboarding_data,
                )
                seq_response = await self.llm_client.generate_priority_sequence(seq_prompt)
                if seq_response:
                    self._merge_priority_sequence_into_llm_response(llm_response, seq_response)

            # Validate and format response
            log_info(f"[{request_id}] Validating LLM response")
            validated_data = self._validate_and_format_response(
                llm_response,
                tasks,
                functions_with_assistants
            )

            if not validated_data:
                log_error(f"[{request_id}] Failed to validate LLM response")
                return False, None, ERROR_INVALID_RESPONSE

            log_info(f"[{request_id}] Recommendation generated - {len(validated_data.functions)} functions, {len(validated_data.tasks)} task groups")

            # Structured log for debugging input/output
            self._log_recommendation_summary(onboarding_data, validated_data, llm_response)

            return True, validated_data, None

        except Exception as e:
            log_error(f"[{request_id}] Error in recommendation generation: {e}")
            return False, None, str(e)

    def _extract_tasks(self, request: OnboardingRecommendationRequest) -> List[Dict[str, Any]]:
        """
        Extract flat task list from onboardingRecommendation.
        Handles two formats:
        - Nested: each item is an activity with activityId + tasks[]
        - Flat: each item is a task directly with title
        """
        tasks = []
        for item in (request.onboardingRecommendation or []):
            item_dict = item.model_dump()
            nested = item_dict.get('tasks')
            if nested and isinstance(nested, list):
                # Nested format: flatten tasks, carry parent activity info on each task
                parent_activity_id = item_dict.get('activityId')
                parent_activity_name = item_dict.get('activityName') or ''
                parent_description = item_dict.get('description') or ''
                for task in nested:
                    if isinstance(task, dict) and task.get('title'):
                        task_copy = dict(task)
                        if task_copy.get('activityId') is None:
                            task_copy['activityId'] = parent_activity_id
                        task_copy['_activityName'] = parent_activity_name
                        task_copy['_activityDescription'] = parent_description
                        tasks.append(task_copy)
            elif item_dict.get('title'):
                # Flat format: item is a task directly
                tasks.append(item_dict)
        return tasks

    def _extract_onboarding_data(self, request: OnboardingRecommendationRequest) -> Dict[str, Any]:
        """Extract onboarding data from request."""
        return request.onboardingData.model_dump()

    def _extract_functions(self, request: OnboardingRecommendationRequest) -> List[Dict[str, Any]]:
        """Extract functions with assistants from request."""
        functions = request.allFunctionsWithAssistants
        return [func.model_dump() for func in functions] if functions else []

    def _filter_functions_by_onboard2_no_match(
        self,
        functions_with_assistants: List[Dict[str, Any]],
        onboarding_data: Dict[str, Any],
    ) -> Tuple[List[Dict[str, Any]], Set[str]]:
        """
        Find activities whose activity-level description exactly matches an onBoard2
        step description where that step has answer "No" or "Skip". Return (filtered_functions,
        set of onBoard2 keys to remove).
        """
        onboard2 = onboarding_data.get("onBoard2") or {}
        no_entries: List[Tuple[str, str]] = []
        for key, value in onboard2.items():
            if key == "currentStep":
                continue
            if not isinstance(value, dict):
                continue
            answer = value.get("answer")
            if not (isinstance(answer, str) and answer.strip().lower() in ("no", "skip")):
                continue
            desc = value.get("description")
            if desc and isinstance(desc, str) and desc.strip():
                no_entries.append((key, desc.strip()))

        no_descriptions = {ob_desc for _, ob_desc in no_entries}
        keys_by_desc: Dict[str, Set[str]] = {}
        for key, ob_desc in no_entries:
            keys_by_desc.setdefault(ob_desc, set()).add(key)

        if not no_descriptions:
            return list(functions_with_assistants), set()

        matched_onboard2_keys: Set[str] = set()
        kept: List[Dict[str, Any]] = []
        for activity in functions_with_assistants:
            activity_desc = activity.get("description")
            if not activity_desc or not isinstance(activity_desc, str):
                kept.append(activity)
                continue
            activity_desc = activity_desc.strip()
            if not activity_desc:
                kept.append(activity)
                continue
            if activity_desc in no_descriptions:
                matched_onboard2_keys.update(keys_by_desc[activity_desc])
                continue
            kept.append(activity)
        return kept, matched_onboard2_keys

    def _copy_onboarding_data_without_onboard2_keys(
        self, onboarding_data: Dict[str, Any], keys_to_remove: Set[str]
    ) -> Dict[str, Any]:
        """Return a copy of onboarding_data with the given keys removed from onBoard2 (original unchanged)."""
        result = dict(onboarding_data)
        onboard2 = result.get("onBoard2") or {}
        result["onBoard2"] = {k: v for k, v in onboard2.items() if k not in keys_to_remove}
        return result

    # onBoard1 list rows sometimes use only category labels (storyType / storySubCategoryType)
    # with empty storyName — same pattern as autoslist + storyType "Autos".
    _GENERIC_ONBOARD1_ENTITY_PLACEHOLDERS = frozenset({
        # Vehicles
        "auto",
        "autos",
        "vehicle",
        "vehicles",
        "car",
        "cars",
        # Pets
        "pet",
        "pets",
        "animal",
        "animals",
        # Real estate / home (and keys that mirror realestatelist / display names)
        "property",
        "properties",
        "real estate",
        "realestate",
        "home",
        "home & property",
        "utilities",
        "house",
        "condo",
        "apartment",
    })

    @classmethod
    def _onboard1_value_is_generic_entity_placeholder(cls, text: Optional[str]) -> bool:
        """True if text is empty or only a generic category label (not a concrete entity)."""
        if text is None:
            return True
        normalized = " ".join(str(text).strip().lower().split())
        if not normalized:
            return True
        return normalized in cls._GENERIC_ONBOARD1_ENTITY_PLACEHOLDERS

    def _onboard1_entity_list_has_items(self, value: Any) -> bool:
        """
        True only if this is a non-empty list with at least one meaningful entry.

        Keys like pets / autoslist may be present with [] — that means no entities.
        Also ignore lists of empty dicts (e.g. [{}]) which should not count as having a pet/vehicle/home.
        """
        if not isinstance(value, list) or len(value) == 0:
            return False

        for item in value:
            if not isinstance(item, dict):
                return True

            story_name = (item.get("storyName") or "").strip()
            if story_name:
                return True

            # Same placeholder pattern as storyType — e.g. storySubCategoryType "Pets" with empty name.
            story_subcategory = item.get("storySubCategoryType")
            if not self._onboard1_value_is_generic_entity_placeholder(story_subcategory):
                return True

            story_type = item.get("storyType")
            if not self._onboard1_value_is_generic_entity_placeholder(story_type):
                return True

            # Any other meaningful field on the item counts as present.
            for key, field_value in item.items():
                if key in ("storyName", "storySubCategoryType", "storyType"):
                    continue
                if field_value is None:
                    continue
                if isinstance(field_value, str) and not field_value.strip():
                    continue
                if isinstance(field_value, list) and len(field_value) == 0:
                    continue
                if isinstance(field_value, dict) and len(field_value) == 0:
                    continue
                return True
        return False

    def _user_has_entity(
        self,
        onboarding_data: Dict[str, Any],
        explicit_keys: Tuple[str, ...],
        key_tokens: Tuple[str, ...],
    ) -> bool:
        """Check if user has at least one entity from onBoard1 list fields."""
        onboard1 = onboarding_data.get("onBoard1") or {}
        if not isinstance(onboard1, dict):
            return False

        for key in explicit_keys:
            value = onboard1.get(key)
            if self._onboard1_entity_list_has_items(value):
                return True

        lowered_tokens = tuple(token.lower() for token in key_tokens)
        for key, value in onboard1.items():
            if not self._onboard1_entity_list_has_items(value):
                continue
            key_lower = str(key).lower()
            if any(token in key_lower for token in lowered_tokens):
                return True

        return False

    def _get_prefilter_exclusion_reason(
        self,
        assistant_name: str,
        has_pets: bool,
        has_vehicles: bool,
        has_real_estate: bool,
    ) -> Optional[str]:
        """Return hard pre-filter exclusion reason based on assistant name and user entities."""
        name = (assistant_name or "").lower()

        if "pet" in name and not has_pets:
            return "User has no pets"

        if ("vehicle" in name or "auto" in name) and not has_vehicles:
            return "User has no vehicles"

        real_estate_keywords = ("property", "real estate", "home & property", "utilities")
        if any(keyword in name for keyword in real_estate_keywords) and not has_real_estate:
            return "User has no real estate"

        return None

    def _merge_priority_sequence_into_llm_response(
        self, llm_response: Dict[str, Any], seq_response: Dict[str, Any]
    ) -> None:
        """Update llm_response functions and tasks with sequence and priority from seq_response."""
        by_activity_id = {
            item.get("activityId"): item
            for item in (seq_response.get("functions") or [])
            if isinstance(item, dict) and item.get("activityId") is not None
        }
        by_title = {
            (item.get("title") or "").strip().lower(): item
            for item in (seq_response.get("tasks") or [])
            if isinstance(item, dict) and item.get("title")
        }
        for func in llm_response.get("functions") or []:
            if not isinstance(func, dict):
                continue
            aid = func.get("activityId")
            if aid in by_activity_id:
                func["sequence"] = by_activity_id[aid].get("sequence", func.get("sequence"))
                func["priority"] = by_activity_id[aid].get("priority", func.get("priority"))
        for task in llm_response.get("tasks") or []:
            if not isinstance(task, dict):
                continue
            title_key = (task.get("title") or "").strip().lower()
            if title_key in by_title:
                task["sequence"] = by_title[title_key].get("sequence", task.get("sequence"))
                task["priority"] = by_title[title_key].get("priority", task.get("priority"))

    def _validate_and_format_response(
        self,
        llm_response: Dict[str, Any],
        available_tasks: List[Dict[str, Any]],
        available_functions: List[Dict[str, Any]]
    ) -> Optional[OnboardingRecommendationData]:
        """
        Validate LLM response and format into response model.
        Ensures all returned items exist in the original payload.
        Also calculates unselected functions and tasks.
        """
        try:
            # Build lookup maps for validation
            task_map = {task.get('title', '').lower(): task for task in available_tasks}
            function_map = {func.get('activityId'): func for func in available_functions}

            # Track selected IDs for unselected calculation
            selected_function_ids = set()
            selected_assistant_ids_by_function = {}  # activityId -> set of assistantIds
            selected_task_titles = set()

            # Process functions from LLM response
            validated_functions = []
            for func_data in llm_response.get('functions', []):
                try:
                    activity_id = func_data.get('activityId')

                    if activity_id not in function_map:
                        log_error(f"Function with activityId {activity_id} not found in payload")
                        continue

                    if activity_id in selected_function_ids:
                        log_info(f"Skipping duplicate function with activityId: {activity_id}")
                        continue

                    original_func = function_map[activity_id]

                    func_assistant_map = {
                        asst.get('assistantId'): asst
                        for asst in original_func.get('assistants', [])
                    }

                    validated_assistants = []
                    selected_asst_ids = set()
                    for asst_data in func_data.get('assistants', []):
                        asst_id = asst_data.get('assistantId')

                        if asst_id not in func_assistant_map:
                            log_error(f"Assistant with assistantId {asst_id} not found in function {activity_id}")
                            continue

                        original_asst = func_assistant_map[asst_id]
                        selected_asst_ids.add(asst_id)

                        validated_assistants.append(RecommendedAssistant(
                            assistantName=original_asst.get('assistantName', asst_data.get('assistantName', '')),
                            assistantId=asst_id,
                            reason=asst_data.get('reason', ''),
                            priority=asst_data.get('priority', PRIORITY_MEDIUM)
                        ))

                    if validated_assistants:
                        selected_function_ids.add(activity_id)
                        selected_assistant_ids_by_function[activity_id] = selected_asst_ids
                        validated_functions.append(RecommendedFunction(
                            id=str(uuid.uuid4()),
                            activityId=activity_id,
                            activityName=original_func.get('activityName', func_data.get('activityName', '')),
                            sequence=func_data.get('sequence', 999),
                            assistants=validated_assistants
                        ))

                except Exception as func_error:
                    log_error(f"Error parsing function: {func_error}")
                    continue

            # Track selected task titles from LLM response
            for task_data in llm_response.get('tasks', []):
                try:
                    title = task_data.get('title', '')
                    title_lower = title.lower()
                    if title_lower not in task_map:
                        log_error(f"Task '{title}' not found in payload")
                        continue
                    if title_lower in selected_task_titles:
                        continue
                    selected_task_titles.add(title_lower)
                except Exception as task_error:
                    log_error(f"Error parsing task: {task_error}")
                    continue

            # Sort functions by sequence
            validated_functions.sort(key=lambda x: x.sequence)

            # Sequence for task groups starts after functions
            next_sequence = max((f.sequence for f in validated_functions), default=0) + 1

            # Group available_tasks by activityId (preserving order)
            task_groups_by_activity: Dict[Any, List[Dict[str, Any]]] = {}
            for task in available_tasks:
                activity_id = task.get('activityId')
                if activity_id not in task_groups_by_activity:
                    task_groups_by_activity[activity_id] = []
                task_groups_by_activity[activity_id].append(task)

            # Build selected and unselected task groups
            validated_task_groups: List[RecommendedTaskGroup] = []
            pending_unselected: List[tuple] = []  # (activity_id, activity_info, [UnselectedTaskItem, ...])

            for activity_id, group_tasks in task_groups_by_activity.items():
                activity_info = function_map.get(activity_id) or {}
                # Prefer parent activity info stored on tasks (nested format), fall back to function_map
                first_task = group_tasks[0] if group_tasks else {}
                activity_name = first_task.get('_activityName') or activity_info.get('activityName', '')
                activity_description = first_task.get('_activityDescription') or activity_info.get('description') or ''
                selected_items = []
                unselected_items = []

                for task in group_tasks:
                    title = task.get('title', '')
                    if not title:
                        continue
                    task_master_id = task.get('taskMasterId') or task.get('activityId')
                    if title.lower() in selected_task_titles:
                        selected_items.append(RecommendedTaskItem(
                            taskId=task.get('taskId'),
                            title=title,
                            metaData=task.get('metaData'),
                            description=task.get('description') or '',
                            taskMasterId=task_master_id,
                        ))
                    else:
                        unselected_items.append(UnselectedTaskItem(
                            taskId=task.get('taskId'),
                            title=title,
                            metaData=task.get('metaData'),
                            description=task.get('description') or '',
                            taskMasterId=task_master_id,
                        ))

                if selected_items:
                    validated_task_groups.append(RecommendedTaskGroup(
                        id=str(uuid.uuid4()),
                        activityId=activity_id,
                        activityName=activity_name,
                        description=activity_description,
                        sequence=next_sequence,
                        tasks=selected_items,
                    ))
                    next_sequence += 1

                if unselected_items:
                    pending_unselected.append((activity_id, activity_name, activity_description, unselected_items))

            # If LLM returned nothing and no tasks were found, use fallback
            if not validated_functions and not validated_task_groups:
                log_info("No items from LLM, using fallback from payload")
                validated_functions, validated_task_groups = self._create_fallback(
                    available_tasks, available_functions
                )
                for func in validated_functions:
                    selected_function_ids.add(func.activityId)
                    selected_assistant_ids_by_function[func.activityId] = {
                        asst.assistantId for asst in func.assistants
                    }
                if validated_functions or validated_task_groups:
                    max_func_seq = max((f.sequence for f in validated_functions), default=0)
                    max_grp_seq = max((g.sequence for g in validated_task_groups), default=max_func_seq)
                    next_sequence = max(max_func_seq, max_grp_seq) + 1

            # Calculate unselected functions (exclude those with empty assistants after filtering)
            unselected_functions, next_sequence = self._calculate_unselected_functions(
                available_functions,
                selected_function_ids,
                selected_assistant_ids_by_function,
                next_sequence
            )
            unselected_functions = [f for f in unselected_functions if f.assistants]

            # Build unselected task groups (non-empty only)
            unselected_task_groups: List[UnselectedTaskGroup] = []
            for activity_id, activity_name, activity_description, items in pending_unselected:
                unselected_task_groups.append(UnselectedTaskGroup(
                    id=str(uuid.uuid4()),
                    activityId=activity_id,
                    activityName=activity_name,
                    description=activity_description,
                    sequence=next_sequence,
                    tasks=items,
                ))
                next_sequence += 1

            # Log counts
            total_payload_functions = len(available_functions)
            total_payload_assistants = sum(len(f.get('assistants', [])) for f in available_functions)
            total_payload_tasks = len(available_tasks)
            selected_assistants_count = sum(len(f.assistants) for f in validated_functions)
            unselected_assistants_count = sum(len(f.assistants) for f in unselected_functions)

            log_info(f"Functions - Payload: {total_payload_functions}, Selected: {len(validated_functions)}, Unselected: {len(unselected_functions)}")
            log_info(f"Assistants - Payload: {total_payload_assistants}, Selected: {selected_assistants_count}, Unselected: {unselected_assistants_count}")
            log_info(f"Tasks - Payload: {total_payload_tasks}, Selected groups: {len(validated_task_groups)}, Unselected groups: {len(unselected_task_groups)}")

            return OnboardingRecommendationData(
                functions=validated_functions,
                tasks=validated_task_groups,
                unselectedFunctions=unselected_functions,
                unselectedTasks=unselected_task_groups,
            )

        except Exception as e:
            log_error(f"Error formatting response: {e}")
            return None

    def _calculate_unselected_functions(
        self,
        available_functions: List[Dict[str, Any]],
        selected_function_ids: set,
        selected_assistant_ids_by_function: Dict[int, set],
        next_sequence: int
    ) -> Tuple[List[UnselectedFunction], int]:
        """Calculate unselected functions and assistants."""
        unselected_functions = []

        for func in available_functions:
            activity_id = func.get('activityId')
            all_assistants = func.get('assistants', [])

            if activity_id not in selected_function_ids:
                unselected_assistants = [
                    UnselectedAssistant(
                        assistantName=asst.get('assistantName', ''),
                        assistantId=asst.get('assistantId', 0),
                        reason='Not selected for this user profile'
                    )
                    for asst in all_assistants
                ]
                unselected_functions.append(UnselectedFunction(
                    id=str(uuid.uuid4()),
                    activityId=activity_id,
                    activityName=func.get('activityName', ''),
                    sequence=next_sequence,
                    assistants=unselected_assistants
                ))
                next_sequence += 1
            else:
                selected_asst_ids = selected_assistant_ids_by_function.get(activity_id, set())
                unselected_assistants = [
                    UnselectedAssistant(
                        assistantName=asst.get('assistantName', ''),
                        assistantId=asst.get('assistantId', 0),
                        reason='Not selected for this user profile'
                    )
                    for asst in all_assistants
                    if asst.get('assistantId') not in selected_asst_ids
                ]
                if unselected_assistants:
                    unselected_functions.append(UnselectedFunction(
                        id=str(uuid.uuid4()),
                        activityId=activity_id,
                        activityName=func.get('activityName', ''),
                        sequence=next_sequence,
                        assistants=unselected_assistants
                    ))
                    next_sequence += 1

        return unselected_functions, next_sequence

    def _create_fallback(
        self,
        available_tasks: List[Dict[str, Any]],
        available_functions: List[Dict[str, Any]]
    ) -> Tuple[List[RecommendedFunction], List[RecommendedTaskGroup]]:
        """Create fallback items from payload when LLM returns nothing."""
        functions = []

        for i, func in enumerate(available_functions[:3], 1):
            assistants = []
            for asst in func.get('assistants', [])[:2]:
                assistants.append(RecommendedAssistant(
                    assistantName=asst.get('assistantName', ''),
                    assistantId=asst.get('assistantId', 0),
                    reason='Recommended based on your onboarding profile.',
                    priority=PRIORITY_HIGH
                ))
            if assistants:
                functions.append(RecommendedFunction(
                    id=str(uuid.uuid4()),
                    activityId=func.get('activityId', 0),
                    activityName=func.get('activityName', ''),
                    sequence=i,
                    assistants=assistants
                ))

        # Group first 3 tasks by activityId into task groups
        groups_by_activity: Dict[Any, Dict[str, Any]] = {}
        for task in available_tasks[:3]:
            activity_id = task.get('activityId')
            if activity_id not in groups_by_activity:
                groups_by_activity[activity_id] = {
                    'activityName': task.get('_activityName', ''),
                    'description': task.get('_activityDescription', ''),
                    'tasks': [],
                }
            groups_by_activity[activity_id]['tasks'].append(task)

        task_groups = []
        seq = len(functions) + 1
        for activity_id, group_data in groups_by_activity.items():
            items = [
                RecommendedTaskItem(
                    taskId=t.get('taskId'),
                    title=t.get('title', ''),
                    metaData=t.get('metaData'),
                    description=t.get('description') or '',
                    taskMasterId=t.get('taskMasterId') or t.get('activityId'),
                )
                for t in group_data['tasks']
                if t.get('title')
            ]
            if items:
                task_groups.append(RecommendedTaskGroup(
                    id=str(uuid.uuid4()),
                    activityId=activity_id,
                    activityName=group_data['activityName'],
                    description=group_data['description'],
                    sequence=seq,
                    tasks=items,
                ))
                seq += 1

        return functions, task_groups

    def _log_recommendation_summary(
        self,
        onboarding_data: Dict[str, Any],
        validated_data: OnboardingRecommendationData,
        llm_response: Dict[str, Any]
    ) -> None:
        """Log structured summary of input onboardingData and output recommendations."""
        try:
            onboard1 = onboarding_data.get('onBoard1', {})
            onboard2 = onboarding_data.get('onBoard2', {})

            input_summary = {
                "onBoard1": {
                    key: [
                        {
                            "storyName": item.get("storyName", ""),
                            "storyType": item.get("storyType", ""),
                            "storySubCategoryType": item.get("storySubCategoryType", "")
                        }
                        for item in value
                    ]
                    for key, value in onboard1.items()
                    if isinstance(value, list) and value and isinstance(value[0], dict)
                },
                "onBoard2": {
                    key: value.get("answer", value) if isinstance(value, dict) else value
                    for key, value in onboard2.items()
                    if key != "currentStep"
                }
            }

            if onboard1.get("dateOfBirth"):
                input_summary["onBoard1"]["dateOfBirth"] = onboard1["dateOfBirth"]

            output_functions = [
                {
                    "activityName": func.activityName,
                    "sequence": func.sequence,
                    "assistants": [asst.model_dump() for asst in func.assistants]
                }
                for func in validated_data.functions
            ]

            output_tasks = [
                {
                    "activityId": group.activityId,
                    "activityName": group.activityName,
                    "sequence": group.sequence,
                    "tasks": [{"taskId": t.taskId, "title": t.title} for t in group.tasks],
                }
                for group in validated_data.tasks
            ]

            excluded_assistants = [
                {
                    "assistantName": asst.get("assistantName", ""),
                    "reason": asst.get("reason")
                }
                for asst in llm_response.get('excluded assistants', [])
                if isinstance(asst, dict)
            ]

            excluded_functions = [
                {
                    "activityName": fn.get("activityName", ""),
                    "reason": fn.get("reason")
                }
                for fn in llm_response.get('excluded functions', [])
                if isinstance(fn, dict)
            ]

            log_entry = {
                "log_type": "onboarding_recommendations",
                "input": input_summary,
                "output": {
                    "functions": output_functions,
                    "tasks": output_tasks
                },
                "excluded assistants": excluded_assistants,
                "excluded functions": excluded_functions
            }

            print(json.dumps(log_entry), flush=True)

        except Exception as e:
            log_error(f"Error logging recommendation summary: {e}")
