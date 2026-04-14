"""
Context Fetcher — Internal helper for service-to-service use.

Called directly by the stochastic planning module (no HTTP round-trip).
Reads per-story scope signals from Redis and formats them for LLM injection.

Redis keys read:
  context:user:{userId}:stories                         → story index
  context:user:{userId}:story:{storyDocId}:scope:*      → per-story signals
  context:user:{userId}:scope:*  (level=user only)      → User Profile aggregates
"""

import json

from context.redis_client import get_redis


def fetch_context_for_user(user_id: str, scopes: list, domains: list) -> dict:
    """
    Fetch computed context signals from Redis for a user.

    Args:
        user_id:  Numeric user ID string (e.g. "2039").
        scopes:   Specific scope names to include (e.g. ["Aging", "Income"]).
        domains:  Domain names to expand (e.g. ["Health", "Finance"]).

    Returns:
        {
            "stories": [
                {
                    "storyDocId": ...,
                    "entity": ...,
                    "storyName": ...,
                    "storyType": ...,
                    "context_scopes": [ { "scope_name", "domains", "signals" } ]
                }
            ],
            "user_profile": { "scope_name", "domains", "signals" } | None
        }
        Returns empty stories list if no context found (non-fatal).
    """
    redis = get_redis()

    # Resolve allowed scope names from domains + explicit scopes
    allowed_scopes = _resolve_allowed_scopes(redis, scopes, domains)

    # ── Per-story scopes ──────────────────────────────────────────────────────
    raw_index = redis.get(f"context:user:{user_id}:stories")
    story_index = json.loads(raw_index) if raw_index else []

    stories_out = []
    for story in story_index:
        story_doc_id = story["storyDocId"]
        keys = redis.keys(f"context:user:{user_id}:story:{story_doc_id}:scope:*")
        scopes_out = []
        for key in keys:
            scope_name = key.split(":scope:")[-1]
            if allowed_scopes is not None and scope_name not in allowed_scopes:
                continue
            raw = redis.get(key)
            if raw:
                data = json.loads(raw)
                scopes_out.append({
                    "scope_name": scope_name,
                    "domains": data.get("domains", []),
                    "signals": data.get("signals", {}),
                })
        if scopes_out:
            stories_out.append({
                "storyDocId": story_doc_id,
                "entity": story.get("entity", ""),
                "storyName": story.get("storyName", ""),
                "storyType": story.get("storyType", ""),
                "context_scopes": scopes_out,
            })

    # ── User Profile (user-level aggregate) ───────────────────────────────────
    user_profile_scope = None
    user_keys = redis.keys(f"context:user:{user_id}:scope:*")
    for key in user_keys:
        raw = redis.get(key)
        if raw:
            data = json.loads(raw)
            if data.get("level") == "user":
                scope_name = key.split(":scope:")[-1]
                if allowed_scopes is None or scope_name in allowed_scopes:
                    user_profile_scope = {
                        "scope_name": scope_name,
                        "domains": data.get("domains", []),
                        "signals": data.get("signals", {}),
                    }
                break  # Only one user-level scope exists (User Profile)

    return {"stories": stories_out, "user_profile": user_profile_scope}


def format_context_for_prompt(context: dict) -> str:
    """
    Format the fetched context dict into a structured string for LLM injection.

    Each story (care receiver, pet, property, auto) is shown separately so the
    LLM can reason about individuals, not aggregated blobs.

    Signal value formats handled:
      - dict  { attr: value }        → indented attribute list under signal name
      - list  [{ attr: value }, ...] → numbered entries (repeating collections)
      - scalar (int/float/str)       → single line

    Example output:
        User Profile:
          - Total Care Receivers: 2
          - Total Pets: 1

        Care Receiver — Mom (Parent):
          Legal & Estate Planning Documents:
            Has Will:
              - Will: yes
              - Executor_name: John Smith
              - Signed_&_witnessed: yes
          Healthcare & Medical Care Expenses:
            - Monthly Medication Expenses: 75.0
          Medication:
            Medications:
              [1] Medication: Metformin | Dosage: 500mg
              [2] Medication: Lisinopril | Dosage: 10mg
    """
    if not context:
        return ""

    lines = []

    # User Profile summary first
    user_profile = context.get("user_profile")
    if user_profile:
        lines.append("User Profile:")
        for signal, value in user_profile.get("signals", {}).items():
            lines.append(f"  - {signal}: {_format_scalar(value)}")

    # Per-story context grouped by individual
    for story in context.get("stories", []):
        entity     = story.get("entity", "")
        story_name = story.get("storyName", "")
        story_type = story.get("storyType", "")

        label = entity
        if story_name:
            label += f" — {story_name}"
        if story_type:
            label += f" ({story_type})"

        lines.append(f"\n{label}:")
        for scope in story.get("context_scopes", []):
            lines.append(f"  {scope['scope_name']}:")
            for signal, value in scope.get("signals", {}).items():
                _format_signal_line(lines, signal, value, indent="    ")

    return "\n".join(lines)


def _format_signal_line(lines: list, signal: str, value, indent: str = "    ") -> None:
    """Append formatted signal line(s) to lines list."""
    if value is None:
        return  # Omit unanswered signals from prompt

    if isinstance(value, list):
        # Repeating collection — list of attribute dicts
        if not value:
            return
        lines.append(f"{indent}{signal}:")
        for i, entry in enumerate(value, 1):
            if isinstance(entry, dict):
                parts = " | ".join(
                    f"{k}: {v}" for k, v in entry.items() if v is not None
                )
                lines.append(f"{indent}  [{i}] {parts}")
            else:
                lines.append(f"{indent}  [{i}] {entry}")

    elif isinstance(value, dict):
        # Attribute map — single_document with multiple fields
        if not value:
            return
        lines.append(f"{indent}{signal}:")
        for attr, v in value.items():
            if v is not None:
                lines.append(f"{indent}  - {attr}: {v}")

    else:
        # Scalar — sum, count, age, entity_count, breakdown, etc.
        if isinstance(value, dict):  # entity_breakdown is a dict
            lines.append(f"{indent}{signal}:")
            for k, v in value.items():
                lines.append(f"{indent}  - {k}: {v}")
        else:
            lines.append(f"{indent}- {signal}: {_format_scalar(value)}")


def _format_scalar(value) -> str:
    """Convert a scalar signal value to a display string."""
    if isinstance(value, float) and value == int(value):
        return str(int(value))
    return str(value)


# ── Internal helper ───────────────────────────────────────────────────────────

def _resolve_allowed_scopes(redis, scopes: list, domains: list):
    """Return set of allowed scope names, or None (= all scopes allowed)."""
    allowed = None

    if domains:
        raw = redis.get("context:index:domain_to_scopes")
        domain_to_scopes = json.loads(raw) if raw else {}
        allowed = set()
        for domain in domains:
            allowed.update(domain_to_scopes.get(domain, []))

    if scopes:
        scope_set = set(scopes)
        allowed = (allowed & scope_set) if allowed is not None else scope_set

    return allowed
