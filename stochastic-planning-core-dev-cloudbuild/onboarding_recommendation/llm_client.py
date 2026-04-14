"""
LLM client for Onboarding Recommendation generation.
Uses Groq LLM from LLM_CONFIGS.
"""
import json
import re
import asyncio
import time
import os
from typing import Dict, Any, Optional

import groq

from core.logger import log_info, log_error, log_large_json
from core.config import LLM_CONFIGS
from .constants import MAX_TOKENS_RECOMMENDATION, LLM_TEMPERATURE, TOP_P
from .prompt_builder import get_system_prompt


def _get_groq_config() -> Optional[Dict[str, Any]]:
    """Get Groq configuration from LLM_CONFIGS."""
    for config in LLM_CONFIGS:
        if config.get('provider', '').lower() == 'groq':
            return config
    return None


class OnboardingLLMClient:
    """
    LLM client for onboarding recommendation generation.
    Uses Groq LLM service.
    """

    def __init__(self):
        """Initialize the Groq client from LLM_CONFIGS."""
        groq_config = _get_groq_config()

        if groq_config:
            self.api_key = groq_config.get('apikey', '')
            self.model = groq_config.get('model', 'llama-3.3-70b-versatile')
        else:
            self.api_key = ''
            self.model = 'llama-3.3-70b-versatile'
            log_error("No Groq configuration found in LLM_CONFIGS")

        if not self.api_key:
            log_error("Groq API key not set in LLM_CONFIGS")

    async def generate_recommendation(self, prompt: str) -> Optional[Dict[str, Any]]:
        """
        Generate recommendation using Groq LLM.

        Args:
            prompt: The formatted prompt for recommendation

        Returns:
            Parsed JSON response or None on failure
        """
        start_time = time.time()

        try:
            log_info(f"Calling Groq {self.model} for recommendation generation")

            client = groq.Groq(api_key=self.api_key)
            system_prompt = get_system_prompt()

            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=self.model,
                messages=[
                    # {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                temperature=LLM_TEMPERATURE,
                # top_p=TOP_P,
                # max_tokens=MAX_TOKENS_RECOMMENDATION
            )

            content = response.choices[0].message.content.strip()
            parsed = self._parse_response(content)

            if parsed:
                end_time = time.time()
                log_info(f"Recommendation generated successfully in {end_time - start_time:.2f}s")
                return parsed
            else:
                log_error("Failed to parse Groq response")
                return None

        except Exception as e:
            log_error(f"Groq API error: {e}")
            return None

    async def generate_entity_match(self, prompt: str) -> Optional[Dict[str, Any]]:
        """
        Call LLM with entity-match prompt; expect JSON with "matched_assistants" list.
        Returns parsed dict or None on failure.
        """
        start_time = time.time()
        try:
            log_info(f"Calling Groq {self.model} for entity-match (assistants vs user profile)")
            client = groq.Groq(api_key=self.api_key)
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=LLM_TEMPERATURE,
            )
            content = response.choices[0].message.content.strip()
            parsed = self._parse_entity_match_response(content)
            if parsed:
                end_time = time.time()
                log_info(f"Recommendation generated successfully in {end_time - start_time:.2f}s")
            return parsed
        except Exception as e:
            log_error(f"Groq API error (entity-match): {e}")
            return None

    def _parse_entity_match_response(self, content: str) -> Optional[Dict[str, Any]]:
        """Parse entity-match LLM response: expect {'matched_assistants': [...]}."""
        try:
            clean = self._extract_json_from_markdown(content)
            parsed = json.loads(clean)
            if isinstance(parsed.get("matched_assistants"), list):
                return parsed
            # Fallback: try extract from malformed content
            first_brace = content.find('{')
            last_brace = content.rfind('}')
            if first_brace != -1 and last_brace > first_brace:
                extracted = content[first_brace:last_brace + 1]
                parsed = json.loads(extracted)
                if isinstance(parsed.get("matched_assistants"), list):
                    return parsed
            log_error("Entity-match response missing 'matched_assistants' list")
            return None
        except json.JSONDecodeError as e:
            log_error(f"Entity-match JSON parse error: {e}")
            return None

    async def generate_priority_sequence(self, prompt: str) -> Optional[Dict[str, Any]]:
        """
        Call LLM to assign priority and sequence; expect JSON with "functions" and "tasks"
        (each item: activityId or title, sequence, priority).
        """
        start_time = time.time()
        try:
            log_info(f"Calling Groq {self.model} for priority/sequence assignment")
            client = groq.Groq(api_key=self.api_key)
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=LLM_TEMPERATURE,
            )
            content = response.choices[0].message.content.strip()
            parsed = self._parse_priority_sequence_response(content)
            if parsed:
                end_time = time.time()
                log_info(f"Recommendation generated successfully in {end_time - start_time:.2f}s")
            return parsed
        except Exception as e:
            log_error(f"Groq API error (priority-sequence): {e}")
            return None

    def _parse_priority_sequence_response(self, content: str) -> Optional[Dict[str, Any]]:
        """Parse priority/sequence LLM response: expect { functions: [...], tasks: [...] }."""
        try:
            clean = self._extract_json_from_markdown(content)
            parsed = json.loads(clean)
            if isinstance(parsed.get("functions"), list) and isinstance(parsed.get("tasks"), list):
                return parsed
            first_brace = content.find('{')
            last_brace = content.rfind('}')
            if first_brace != -1 and last_brace > first_brace:
                extracted = content[first_brace:last_brace + 1]
                parsed = json.loads(extracted)
                if isinstance(parsed.get("functions"), list) and isinstance(parsed.get("tasks"), list):
                    return parsed
            log_error("Priority-sequence response missing 'functions' or 'tasks' list")
            return None
        except json.JSONDecodeError as e:
            log_error(f"Priority-sequence JSON parse error: {e}")
            return None

    def _parse_response(self, content: str) -> Optional[Dict[str, Any]]:
        """Parse LLM response to JSON."""
        try:
            # Extract JSON from markdown code blocks if present
            clean_content = self._extract_json_from_markdown(content)
            parsed = json.loads(clean_content)

            # Validate required structure - functions and/or tasks
            if 'functions' in parsed or 'tasks' in parsed or 'excluded functions' in parsed or 'excluded assistants' in parsed or 'reason' in parsed:  
                # Ensure both keys exist
                if 'functions' not in parsed:
                    parsed['functions'] = []
                if 'tasks' not in parsed:
                    parsed['tasks'] = []
                if 'excluded functions' not in parsed:
                    parsed['excluded functions'] = []
                if 'excluded assistants' not in parsed:
                    parsed['excluded assistants'] = []
                return parsed
            else:
                log_error("Response missing required fields: functions or tasks")
                return None

        except json.JSONDecodeError as e:
            log_error(f"JSON parse error: {e}")
            log_large_json('error', 'Raw LLM response', content, max_length=2000)

            # Try to extract JSON from the content
            extracted = self._try_extract_json(content)
            if extracted:
                return extracted
            return None

    def _extract_json_from_markdown(self, content: str) -> str:
        """Extract JSON from markdown code blocks."""
        content = re.sub(r'^```json\s*', '', content, flags=re.MULTILINE)
        content = re.sub(r'^```\s*', '', content, flags=re.MULTILINE)
        content = re.sub(r'\s*```$', '', content, flags=re.MULTILINE)
        content = content.strip()
        return content

    def _try_extract_json(self, content: str) -> Optional[Dict[str, Any]]:
        """Try to extract valid JSON from potentially malformed content."""
        first_brace = content.find('{')
        last_brace = content.rfind('}')

        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            try:
                extracted = content[first_brace:last_brace + 1]
                parsed = json.loads(extracted)
                if 'functions' in parsed or 'tasks' in parsed:
                    if 'functions' not in parsed:
                        parsed['functions'] = []
                    if 'tasks' not in parsed:
                        parsed['tasks'] = []
                    log_info("Successfully extracted JSON from malformed response")
                    return parsed
            except json.JSONDecodeError:
                pass

        return None
