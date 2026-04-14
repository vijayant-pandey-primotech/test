"""
Context Builder Service

Reads context config from Redis, computes all signals per scope by
fetching data from Firestore, and writes results back to Redis.

Firestore schema:
  user_stories/{storyDocId}
    ├── userId (int), story (string = entity), storyName, storyType
    └── chapters/{chapterDocId}
          └── items: [{ itemId, isAnswered, isSkipped, <field_name>: <value>, ... }]

Signal output format (stored in Redis, returned by API):

  Single-document signal with attributes:
    "Has Will": {
      "Will": "yes",
      "Executor_name": "John Smith",
      "Instructions_up_to_date": "yes",
      "Number_of_amendments": 2,
      ...
    }

  Repeating-collection with method=sum → scalar:
    "Monthly Medication Expenses": 75.0

  Repeating-collection with method=count → scalar:
    "Number of Medical Providers": 3

  Repeating-collection without method → list of attribute dicts:
    "Medications": [
      {"Medication": "Metformin", "Dosage": "500mg"},
      {"Medication": "Lisinopril", "Dosage": "10mg"}
    ]

  User-level aggregate:
    "Total Care Receivers": 2
    "Care Receivers": {"Child": 1, "Parent": 1}

Redis output (per story doc):
  context:user:{userId}:story:{storyDocId}:scope:{scopeName}
    → { "domains": [...], "signals": { signal_name: value } }

Redis output (user-level — "User Profile" scope only):
  context:user:{userId}:scope:{scopeName}
    → { "domains": [...], "signals": {...}, "level": "user" }

Redis story index:
  context:user:{userId}:stories
    → [{ storyDocId, entity, storyName, storyType }]
"""

import json
import threading
from datetime import date, datetime

from context.logger import log_info, log_error

CONFIG_KEY          = "context:config"
ENTITY_TO_SCOPES_KEY = "context:index:entity_to_scopes"


# ── Entry points ─────────────────────────────────────────────────────────────

def recompute_story_scopes(
    user_id: str,
    story_doc_id: str,
    entity: str,
    after_items: list,
    redis_client,
    db,
    story_id: int = None,
) -> dict:
    """
    Targeted recompute for one specific story doc, triggered by a Pub/Sub event.

    - Only computes scopes relevant to this story's entity type / storyId.
    - Uses after_items payload for single_document signals — no Firestore read.
    - Falls back to Firestore for repeating_collection signals.
    - User-level scopes (entity_count/breakdown) are also refreshed on every event.
    - Updates the story index in Redis so the fetch endpoint always finds this story.

    Args:
        story_id: Optional numeric storyId from Firestore. Used for more reliable
                  signal matching when config signals include storyId. Falls back
                  to entity string match when None.

    Returns:
        { scope_name | storyDocId:scope_name: "ok" | "error: ..." }
    """
    raw_config = redis_client.get(CONFIG_KEY)
    if not raw_config:
        raise RuntimeError(
            "Context config not loaded. Call POST /api/context/load-config first."
        )

    clear_chapter_cache()
    config     = json.loads(raw_config)
    all_scopes = config.get("context_scopes", [])
    item_lookup = {item["itemId"]: item for item in after_items if "itemId" in item}
    results     = {}

    for scope in all_scopes:
        scope_name = scope["scope_name"]

        # User-level scope: aggregate across all stories
        if scope.get("level") == "user":
            try:
                computed = _compute_user_scope(user_id, scope, db)
                key = f"context:user:{user_id}:scope:{scope_name}"
                redis_client.set(key, json.dumps({
                    "domains": scope.get("domains", []),
                    "signals": computed,
                    "level":   "user",
                }))
                results[scope_name] = "ok"
            except Exception as e:
                log_error(f"Failed user-level scope '{scope_name}' for user {user_id}: {e}")
                results[scope_name] = f"error: {e}"
            continue

        # Story-level scope: only compute if relevant to this entity/storyId
        try:
            computed = _compute_scope_for_story(
                story_doc_id, entity, scope, db, item_lookup, story_id=story_id
            )
            if computed is None:
                continue  # No signals in this scope reference this story

            key = f"context:user:{user_id}:story:{story_doc_id}:scope:{scope_name}"
            redis_client.set(key, json.dumps({
                "domains": scope.get("domains", []),
                "signals": computed,
            }))
            results[f"{story_doc_id}:{scope_name}"] = "ok"
        except Exception as e:
            log_error(f"Failed scope '{scope_name}' for story {story_doc_id}: {e}")
            results[f"{story_doc_id}:{scope_name}"] = f"error: {e}"

    _update_story_index(user_id, story_doc_id, entity, redis_client, db)

    # Do NOT stamp config_version here — recompute_story_scopes only covers one
    # story (+ same-entity siblings). Other-entity stories with dirty config scopes
    # must still be picked up by the next recompute_delta_stories call.
    # config_version is only stamped when all stories are covered:
    #   recompute_all_stories  → full coverage  → stamps
    #   recompute_delta_stories → dirty-scope coverage → stamps

    ok = sum(1 for v in results.values() if v == "ok")
    log_info(
        f"Recompute story done — user={user_id}, storyDocId={story_doc_id}, "
        f"entity={entity}, storyId={story_id}, {ok}/{len(results)} scopes ok"
    )
    return results


def recompute_delta_stories(
    user_id: str,
    redis_client,
    db,
    item_ids: list = None,
) -> dict:
    """
    Fast delta recompute — only recomputes scopes that actually changed.

    Two sources of "dirty" scopes are unioned:

    1. item_ids (from the Pub/Sub after_items payload or API call):
       item_to_scopes index maps each changed itemId → affected scope names.

    2. context:config:dirty_scopes (set by load_config on every config reload):
       Scopes whose signals content changed since the last config load.
       This catches admin-added signals that existing users would otherwise miss
       until they happen to trigger a Pub/Sub event for that story.

    After computing, stamps context:user:{userId}:config_version with the current
    config version so future delta runs only pick up *new* dirty scopes.

    Returns:
        { scope_name | storyDocId:scope_name: "ok" | "error: ..." | "skipped" }
    """
    raw_config = redis_client.get(CONFIG_KEY)
    if not raw_config:
        raise RuntimeError(
            "Context config not loaded. Call POST /api/context/load-config first."
        )

    config     = json.loads(raw_config)
    all_scopes = config.get("context_scopes", [])
    scope_map  = {s["scope_name"]: s for s in all_scopes}

    # ── 1. Scopes affected by changed item IDs ────────────────────────────────
    dirty_scope_names: set = set()

    if item_ids:
        raw_item_idx = redis_client.get("context:index:item_to_scopes")
        item_to_scopes = json.loads(raw_item_idx) if raw_item_idx else {}
        for iid in item_ids:
            for sname in item_to_scopes.get(str(iid), []):
                dirty_scope_names.add(sname)

    # ── 2. Scopes changed by admin config reload ──────────────────────────────
    raw_dirty = redis_client.get("context:config:dirty_scopes")
    config_dirty: list = json.loads(raw_dirty) if raw_dirty else []

    # Only include config-dirty scopes the user hasn't seen yet
    current_version   = int(redis_client.get("context:config:version") or 0)
    user_version_key  = f"context:user:{user_id}:config_version"
    raw_user_ver      = redis_client.get(user_version_key)
    user_version      = int(raw_user_ver) if raw_user_ver else 0

    if user_version < current_version:
        dirty_scope_names.update(config_dirty)

    if not dirty_scope_names:
        log_info(f"Delta recompute — user={user_id}, nothing dirty, skipping")
        return {}

    # ── 3. Recompute only dirty scopes across all user stories ────────────────
    clear_chapter_cache()
    stories = _get_all_user_stories(user_id, db)
    results = {}

    # Update story index while we have the story list
    story_index = [
        {
            "storyDocId": s["_doc_id"],
            "entity":     s.get("story", ""),
            "storyName":  s.get("storyName", ""),
            "storyType":  s.get("storyType", ""),
            "storyId":    s.get("storyId"),
        }
        for s in stories
    ]
    redis_client.set(f"context:user:{user_id}:stories", json.dumps(story_index))

    for scope_name in dirty_scope_names:
        scope = scope_map.get(scope_name)
        if scope is None:
            # Scope removed from config — delete stale Redis keys for all stories
            for story in stories:
                key = f"context:user:{user_id}:story:{story['_doc_id']}:scope:{scope_name}"
                redis_client.delete(key)
            results[scope_name] = "removed"
            continue

        # User-level scope (entity_count/breakdown etc.)
        if scope.get("level") == "user":
            try:
                computed = _compute_user_scope(user_id, scope, db)
                redis_client.set(
                    f"context:user:{user_id}:scope:{scope_name}",
                    json.dumps({"domains": scope.get("domains", []), "signals": computed, "level": "user"})
                )
                results[scope_name] = "ok"
            except Exception as e:
                log_error(f"Delta: failed user-level scope '{scope_name}' for user {user_id}: {e}")
                results[scope_name] = f"error: {e}"
            continue

        # Story-level scope — recompute for every story
        for story in stories:
            story_doc_id = story["_doc_id"]
            entity       = story.get("story", "")
            story_id     = story.get("storyId")
            result_key   = f"{story_doc_id}:{scope_name}"
            try:
                computed = _compute_scope_for_story(story_doc_id, entity, scope, db, story_id=story_id)
                if computed is None:
                    results[result_key] = "skipped"
                    continue
                redis_client.set(
                    f"context:user:{user_id}:story:{story_doc_id}:scope:{scope_name}",
                    json.dumps({"domains": scope.get("domains", []), "signals": computed})
                )
                results[result_key] = "ok"
            except Exception as e:
                log_error(f"Delta: failed scope '{scope_name}' for story {story_doc_id}: {e}")
                results[result_key] = f"error: {e}"

    # ── 4. Stamp user config version ─────────────────────────────────────────
    redis_client.set(user_version_key, str(current_version))

    ok = sum(1 for v in results.values() if v == "ok")
    log_info(
        f"Delta recompute done — user={user_id}, dirty_scopes={len(dirty_scope_names)}, "
        f"{ok}/{len(results)} ok"
    )
    return results


def recompute_all_stories(user_id: str, redis_client, db) -> dict:
    """
    Full recompute for a user — iterates every story doc across all entity types.
    Used by the manual /recompute endpoint and as a Pub/Sub fallback (no storyDocId).

    Returns:
        { scope_name | storyDocId:scope_name: "ok" | "error: ..." }
    """
    raw_config = redis_client.get(CONFIG_KEY)
    if not raw_config:
        raise RuntimeError(
            "Context config not loaded. Call POST /api/context/load-config first."
        )

    clear_chapter_cache()
    config       = json.loads(raw_config)
    all_scopes   = config.get("context_scopes", [])
    story_scopes = [s for s in all_scopes if s.get("level") != "user"]
    user_scopes  = [s for s in all_scopes if s.get("level") == "user"]
    results      = {}

    stories = _get_all_user_stories(user_id, db)
    if not stories:
        log_info(f"No stories found for user {user_id}")

    # Write story index to Redis
    story_index = [
        {
            "storyDocId": s["_doc_id"],
            "entity":     s.get("story", ""),
            "storyName":  s.get("storyName", ""),
            "storyType":  s.get("storyType", ""),
            "storyId":    s.get("storyId"),
        }
        for s in stories
    ]
    redis_client.set(f"context:user:{user_id}:stories", json.dumps(story_index))

    # User-level scopes once
    for scope in user_scopes:
        scope_name = scope["scope_name"]
        try:
            computed = _compute_user_scope(user_id, scope, db)
            key = f"context:user:{user_id}:scope:{scope_name}"
            redis_client.set(key, json.dumps({
                "domains": scope.get("domains", []),
                "signals": computed,
                "level":   "user",
            }))
            results[scope_name] = "ok"
        except Exception as e:
            log_error(f"Failed user-level scope '{scope_name}' for user {user_id}: {e}")
            results[scope_name] = f"error: {e}"

    # Per-story scopes
    for story in stories:
        story_doc_id = story["_doc_id"]
        entity       = story.get("story", "")
        story_id     = story.get("storyId")

        for scope in story_scopes:
            scope_name = scope["scope_name"]
            try:
                computed = _compute_scope_for_story(story_doc_id, entity, scope, db, story_id=story_id)
                if computed is None:
                    continue

                key = f"context:user:{user_id}:story:{story_doc_id}:scope:{scope_name}"
                redis_client.set(key, json.dumps({
                    "domains": scope.get("domains", []),
                    "signals": computed,
                }))
                results[f"{story_doc_id}:{scope_name}"] = "ok"
            except Exception as e:
                log_error(f"Failed scope '{scope_name}' for story {story_doc_id}: {e}")
                results[f"{story_doc_id}:{scope_name}"] = f"error: {e}"

    # Stamp user config version so future delta runs don't re-apply already-seen dirty scopes
    current_version = redis_client.get("context:config:version")
    if current_version:
        redis_client.set(f"context:user:{user_id}:config_version", current_version)

    ok = sum(1 for v in results.values() if v == "ok")
    log_info(
        f"Recompute all stories done — user={user_id}, "
        f"{len(stories)} stories, {ok}/{len(results)} scopes ok"
    )
    return results


# ── Scope computation ─────────────────────────────────────────────────────────

def _compute_scope_for_story(
    story_doc_id: str,
    story_entity: str,
    scope: dict,
    db,
    item_lookup: dict = None,
    story_id: int = None,
) -> dict | None:
    """
    Compute all signals in a scope for one specific story doc.

    Returns None if no signal in this scope references story_entity/story_id
    (scope is not applicable to this story type).
    """
    computed     = {}
    has_relevant = False

    for signal_name, signal_def in scope.get("signals", {}).items():
        if not _signal_matches_entity(signal_def, story_entity, story_id):
            continue
        has_relevant = True
        try:
            computed[signal_name] = _compute_signal(
                story_doc_id, story_entity, signal_def, db, item_lookup
            )
        except Exception as e:
            log_error(f"Signal '{signal_name}' failed for story {story_doc_id}: {e}")
            computed[signal_name] = None

    return computed if has_relevant else None


def _signal_matches_entity(signal_def: dict, story_entity: str, story_id: int = None) -> bool:
    """
    Return True if this signal applies to the given story.

    Matching priority:
      1. storyId (int) — preferred, unambiguous numeric match
      2. entity (str)  — fallback for signals without storyId, or old config
    Both fields stay in the config for readability. storyId takes precedence when present.
    """
    if "sources" in signal_def:  # multi_source
        for s in signal_def["sources"]:
            sig_story_id = s.get("storyId")
            if sig_story_id is not None and story_id is not None:
                if sig_story_id == story_id:
                    return True
            elif s.get("entity") == story_entity:
                return True
        return False

    sig_story_id = signal_def.get("storyId")
    if sig_story_id is not None and story_id is not None:
        return sig_story_id == story_id
    return signal_def.get("entity") == story_entity


# ── Signal computation ────────────────────────────────────────────────────────

def _compute_signal(
    story_doc_id: str,
    story_entity: str,
    signal_def: dict,
    db,
    item_lookup: dict = None,
):
    """
    Compute one signal value using the new flat schema.

    Returns:
      - dict  { attr: value }  for single_document attribute signals
      - list  [{ attr: value }]  for repeating_collection without method
      - float  for repeating_collection with method="sum"
      - int    for repeating_collection with method="count"
      - None   if item not answered or not found
    """
    dep_scope  = signal_def.get("dependencyScope", "single_document")
    method     = signal_def.get("method")

    # ── multi_source ──────────────────────────────────────────────────────────
    if dep_scope == "multi_source":
        for source in signal_def.get("sources", []):
            if source.get("entity") != story_entity:
                continue
            item_id    = source.get("itemId")
            attributes = source.get("attributes", [])
            items      = _find_item_in_story(story_doc_id, item_id, db)
            for item in items:
                if _is_positively_answered(item):
                    return _resolve_item_attributes(item, attributes)
        return None

    item_id    = signal_def.get("itemId")
    attributes = signal_def.get("attributes", [])

    # ── single_document ───────────────────────────────────────────────────────
    if dep_scope == "single_document":
        # Payload optimisation: use after_items dict when available
        if item_lookup is not None and item_id in item_lookup:
            item = item_lookup[item_id]
            if _is_positively_answered(item):
                result = _resolve_item_attributes(item, attributes)
                # Age calculation (User Profile scope calls this via recompute_story_scopes)
                if method == "age":
                    return _compute_age_from_attributes(result, attributes)
                return result
            return None
        # Firestore read
        items = _find_item_in_story(story_doc_id, item_id, db)
        for item in items:
            if _is_positively_answered(item):
                result = _resolve_item_attributes(item, attributes)
                if method == "age":
                    return _compute_age_from_attributes(result, attributes)
                return result
        return None

    # ── repeating_collection ──────────────────────────────────────────────────
    if dep_scope == "repeating_collection":
        items = _find_item_in_story(story_doc_id, item_id, db)

        if method == "sum":
            primary = attributes[0] if attributes else None
            return _compute_sum_from_items(items, primary)

        if method == "count":
            return sum(1 for item in items if _is_positively_answered(item))

        # No method → return full list of attribute maps
        result = []
        for item in items:
            if _is_positively_answered(item):
                entry = _resolve_item_attributes(item, attributes)
                if entry:
                    result.append(entry)
        return result

    return None


# ── User-level scope ──────────────────────────────────────────────────────────

def _compute_user_scope(user_id: str, scope: dict, db) -> dict:
    """
    Compute user-level signals (User Profile scope).

    Handles:
      - entity_count / entity_breakdown — aggregate counts across all stories
      - age                             — compute age from DOB field
      - static (ZipCode etc.)          — read field value from personal story
    """
    computed         = {}
    story_doc_cache  = {}

    def _get_story_doc_id(entity: str):
        if entity not in story_doc_cache:
            query = (
                db.collection("user_stories")
                .where("userId", "==", int(user_id))
                .where("story",  "==", entity)
                .limit(1)
            )
            docs = list(query.stream())
            story_doc_cache[entity] = docs[0].id if docs else None
        return story_doc_cache[entity]

    for signal_name, signal_def in scope.get("signals", {}).items():
        method     = signal_def.get("method")
        entity     = signal_def.get("entity")
        item_id    = signal_def.get("itemId")
        attributes = signal_def.get("attributes", [])

        try:
            if method == "entity_count":
                computed[signal_name] = _count_user_stories(user_id, entity, db)

            elif method == "entity_breakdown":
                computed[signal_name] = _get_entity_breakdown(user_id, entity, db)

            elif method == "age":
                doc_id = _get_story_doc_id(entity)
                if doc_id is None:
                    computed[signal_name] = None
                    continue
                items = _find_item_in_story(doc_id, item_id, db)
                computed[signal_name] = _compute_age_from_items(items, attributes)

            else:
                # Static signal (e.g. ZipCode)
                doc_id = _get_story_doc_id(entity)
                if doc_id is None:
                    computed[signal_name] = None
                    continue
                items = _find_item_in_story(doc_id, item_id, db)
                computed[signal_name] = None
                for item in items:
                    resolved = _resolve_item_attributes(item, attributes)
                    if resolved:
                        # Return the first non-null attribute value (static = single field)
                        computed[signal_name] = next(iter(resolved.values()), None)
                        break

        except Exception as e:
            log_error(f"User-level signal '{signal_name}' failed for user {user_id}: {e}")
            computed[signal_name] = None

    return computed


# ── Attribute resolution ──────────────────────────────────────────────────────

def _is_positively_answered(item: dict) -> bool:
    """
    Returns True only if the item was answered positively.
    isAnswered=1 alone is not enough — it is also set for "no" and "skip".
    isSkipped=1 (or True) is set for "no" and "skip" responses.
    A positive answer is: isAnswered=1 AND isSkipped is falsy (0, False, None, or missing).
    """
    answered = item.get("isAnswered")
    skipped  = item.get("isSkipped")
    return (answered == 1 or answered is True) and not skipped


def _resolve_item_attributes(item: dict, attributes: list) -> dict:
    """
    Map attribute names to their actual Firestore values from one item.

    Boolean/int flags (0/1/True/False) are normalised to "yes"/"no".
    Numeric and string values are returned as-is.
    None/missing attributes are omitted from the result.
    """
    result = {}
    for attr in attributes:
        val = item.get(attr)
        if val is None:
            continue
        if isinstance(val, bool):
            result[attr] = "yes" if val else "no"
        elif val == 1 and not isinstance(val, float):
            result[attr] = "yes"
        elif val == 0 and not isinstance(val, float):
            result[attr] = "no"
        else:
            result[attr] = val
    return result


# ── Calculation helpers ───────────────────────────────────────────────────────

def _compute_sum_from_items(items: list, primary_field: str | None) -> float:
    """Sum a numeric field across all positively-answered items."""
    if not primary_field:
        return 0.0
    total = 0.0
    for item in items:
        if not _is_positively_answered(item):
            continue
        val = _parse_numeric(item.get(primary_field))
        if val is not None:
            total += val
    return total


def _compute_age_from_items(items: list, attributes: list):
    """Compute age from a DOB field across items. Returns int or None."""
    primary_field = attributes[0] if attributes else None
    if not primary_field:
        return None
    for item in items:
        dob_val = item.get(primary_field)
        age = _parse_age(dob_val)
        if age is not None:
            return age
    return None


def _compute_age_from_attributes(resolved: dict, attributes: list):
    """Compute age from an already-resolved attribute dict."""
    primary_field = attributes[0] if attributes else None
    if not primary_field:
        return None
    return _parse_age(resolved.get(primary_field))


def _parse_age(dob_val) -> int | None:
    """Parse a date-of-birth value and return the current age."""
    if dob_val is None:
        return None
    try:
        if isinstance(dob_val, str):
            for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%m-%d-%Y"):
                try:
                    dob = datetime.strptime(dob_val, fmt).date()
                    break
                except ValueError:
                    continue
            else:
                return None
        elif hasattr(dob_val, "date"):
            dob = dob_val.date()
        elif isinstance(dob_val, date):
            dob = dob_val
        else:
            return None
        today = date.today()
        return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
    except Exception:
        return None


# ── Firestore helpers ─────────────────────────────────────────────────────────

def _get_all_user_stories(user_id: str, db) -> list:
    """Get ALL story docs for a user across every entity type."""
    query   = db.collection("user_stories").where("userId", "==", int(user_id))
    results = []
    for doc in query.stream():
        data           = doc.to_dict()
        data["_doc_id"] = doc.id
        results.append(data)
    return results


_thread_local = threading.local()


def _load_story_chapters(story_doc_id: str, db) -> dict:
    """
    Read all chapters for a story doc once and return a dict keyed by itemId.
    Cached in thread-local storage so concurrent Pub/Sub callbacks don't interfere.
    """
    cache = _thread_local.__dict__.setdefault("chapter_cache", {})
    if story_doc_id in cache:
        return cache[story_doc_id]

    item_map: dict = {}
    chapters_ref = db.collection(f"user_stories/{story_doc_id}/chapters")
    for chapter_doc in chapters_ref.stream():
        for item in chapter_doc.to_dict().get("items", []):
            iid = item.get("itemId")
            if iid is not None:
                item_map.setdefault(iid, []).append(item)

    cache[story_doc_id] = item_map
    return item_map


def clear_chapter_cache():
    """Clear this thread's chapter cache at the start of each recompute call."""
    _thread_local.__dict__["chapter_cache"] = {}


def _find_item_in_story(story_doc_id: str, item_id: int, db) -> list:
    """Find all instances of an itemId across all chapters of one story doc."""
    if item_id is None:
        return []
    return _load_story_chapters(story_doc_id, db).get(item_id, [])


def _count_user_stories(user_id: str, entity: str, db) -> int:
    """Count story documents for user+entity."""
    query = (
        db.collection("user_stories")
        .where("userId", "==", int(user_id))
        .where("story",  "==", entity)
    )
    return sum(1 for _ in query.stream())


def _get_entity_breakdown(user_id: str, entity: str, db) -> dict:
    """Count stories grouped by storyType."""
    query = (
        db.collection("user_stories")
        .where("userId", "==", int(user_id))
        .where("story",  "==", entity)
    )
    breakdown = {}
    for doc in query.stream():
        story_type = doc.to_dict().get("storyType", "Unknown")
        breakdown[story_type] = breakdown.get(story_type, 0) + 1
    return breakdown


def _update_story_index(user_id: str, story_doc_id: str, entity: str, redis_client, db):
    """Ensure this story doc appears in the user's Redis story index."""
    key    = f"context:user:{user_id}:stories"
    raw    = redis_client.get(key)
    stories = json.loads(raw) if raw else []

    if any(s["storyDocId"] == story_doc_id for s in stories):
        return

    try:
        doc = db.collection("user_stories").document(story_doc_id).get()
        if doc.exists:
            data = doc.to_dict()
            stories.append({
                "storyDocId": story_doc_id,
                "entity":     data.get("story", entity),
                "storyName":  data.get("storyName", ""),
                "storyType":  data.get("storyType", ""),
                "storyId":    data.get("storyId"),
            })
            redis_client.set(key, json.dumps(stories))
            log_info(
                f"Story index updated — user={user_id}, "
                f"storyDocId={story_doc_id}, entity={entity}"
            )
    except Exception as e:
        log_error(f"Failed to update story index for story {story_doc_id}: {e}")


# ── Numeric parsing (for sum signals) ────────────────────────────────────────

def _extract_amount_with_llm(text: str) -> float | None:
    """
    Use Groq to extract a financial amount from a natural language summary.
    Returns the numeric value or None if no financial amount is present.
    Only called when direct float parsing of the field value fails.
    """
    try:
        import groq as groq_sdk
        from core.config import LLM_CONFIGS

        groq_config = next(
            (c for c in LLM_CONFIGS if c.get("provider", "").lower() == "groq"),
            None,
        )
        if not groq_config or not groq_config.get("apikey"):
            log_error("[parse_numeric] No Groq config found — cannot extract amount")
            return None

        client = groq_sdk.Groq(api_key=groq_config["apikey"])
        prompt = (
            f"Extract the financial amount (expense, income, cost, or payment) "
            f"from this text as a plain number with no units or symbols. "
            f"If the text gives a range (e.g. 'between $100 and $200'), return the average (e.g. 150). "
            f"If there is no financial amount — for example if the text contains "
            f"a phone number, contact name, or non-financial information — reply with null.\n\n"
            f"Text: {text}\n\n"
            f"Reply with ONLY a number (e.g. 150) or the word null. Nothing else."
        )
        response = client.chat.completions.create(
            model=groq_config.get("model", "llama-3.3-70b-versatile"),
            max_tokens=20,
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.choices[0].message.content.strip().lower()
        log_info(f"[parse_numeric] LLM extracted '{raw}' from text: {text[:80]!r}")

        if raw == "null" or not raw:
            return None
        return float(raw.replace(",", "").replace("$", ""))

    except Exception as e:
        log_error(f"[parse_numeric] LLM extraction failed: {e}")
        return None


def _parse_numeric(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip().replace("$", "").replace(",", "").strip()
        if cleaned:
            try:
                return float(cleaned)
            except ValueError:
                pass
        return _extract_amount_with_llm(value)
    return None
