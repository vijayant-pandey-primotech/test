#!/usr/bin/env python3
"""
Context Scope Config Updater

Connects to MySQL directly, runs the recommendation_master query to discover
all current scopes and items, diffs against the existing config, and uses
Groq to generate config only for what is NEW — without touching anything
that already exists.

Two kinds of additions:
  1. Brand-new scope  → generate full scope config and append it
  2. New item(s) in an existing scope → generate only the new signals
                                         and merge them into that scope

The updated config is:
  - Written to context/config/context_scopes.json
  - Inserted into the MySQL context_config table (latest row is used by the app)

Usage:
    python generate_context_config.py               # full diff + update
    python generate_context_config.py --dry-run     # show what would change, no LLM
    python generate_context_config.py --scope "Income"  # force re-process one scope
    python generate_context_config.py --no-save     # print result only, don't write files
"""

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import groq
import mysql.connector
from mysql.connector import Error

# ── Paths ─────────────────────────────────────────────────────────────────────
_SCRIPT_DIR   = Path(__file__).parent
_CONFIG_FILE  = _SCRIPT_DIR / "context" / "config" / "context_scopes.json"

# ── MySQL query — same SQL that produced context-mem-input.txt ────────────────
_ITEMS_QUERY = """
SELECT
    x.assistantName    AS scope,
    sm.storyName       AS entity,
    sm.storyId         AS story_id,
    im.itemId          AS item_id,
    im.itemName        AS item_name,
    x.policy_name      AS policy
FROM (
    SELECT
        id,
        assistantName,
        clusteredItems.itemId,
        clusteredItems.question AS main_question,
        policies.policy         AS policy_name,
        policies.question       AS policy_question,
        targetValue,
        platforms
    FROM recommendation_master
    CROSS JOIN JSON_TABLE(
        JSON_EXTRACT(targetValue, '$.clusteredItems'),
        '$[*]' COLUMNS (
            storyId   INT  PATH '$.storyId',
            chapterId INT  PATH '$.chapterId',
            itemId    INT  PATH '$.itemId',
            question  TEXT PATH '$.question',
            policies  JSON PATH '$.policies'
        )
    ) AS clusteredItems
    LEFT JOIN JSON_TABLE(
        clusteredItems.policies,
        '$[*]' COLUMNS (
            policy   VARCHAR(100) PATH '$.policy',
            question TEXT         PATH '$.question'
        )
    ) AS policies ON TRUE
) x
JOIN items_masters  im ON im.itemId   = x.itemId
JOIN chapter_masters cm ON im.chapterId = cm.chapterId
JOIN stories_masters sm ON sm.storyId   = cm.storyId
ORDER BY x.assistantName, im.itemId
"""

# ── Domain assignments per scope ──────────────────────────────────────────────
SCOPE_DOMAIN_MAP = {
    "Additional Recurring Income":           ["Finance"],
    "Aging":                                 ["Caregiving", "Health"],
    "Assets":                                ["Finance"],
    "Assisted Daily Living":                 ["Caregiving", "Health"],
    "Auto Expenses":                         ["Finance", "Transportation"],
    "Care Providers":                        ["Health", "Caregiving"],
    "Child & Dependent-Related Expenses":    ["Finance", "Caregiving"],
    "Cloud Storage & Digital File Locations":["Digital"],
    "Digital Identity & Security":           ["Digital"],
    "Digital Legacy & End-of-Life Accounts": ["Digital", "Legal"],
    "Digital Transaction Accounts":          ["Digital", "Finance"],
    "Everyday Practical Items":              ["Caregiving"],
    "Financial & Tax Documents":             ["Finance", "Legal"],
    "Financial, Legal, & Estate Contacts":   ["Finance", "Legal"],
    "Healthcare & Medical Care Expenses":    ["Health", "Finance"],
    "High-Value Physical Assets":            ["Finance"],
    "Home & Property Service Providers":     ["Housing"],
    "Household & Daily Living":              ["Caregiving", "Health"],
    "Household & Essential Living Expenses": ["Finance", "Housing"],
    "Identity & Vital Records":              ["Legal"],
    "Income":                                ["Finance"],
    "Income-Related Obligations":            ["Finance"],
    "Insurance & Risk Protection":           ["Finance", "Legal"],
    "Legacy":                                ["Legal"],
    "Legal & Estate Planning Documents":     ["Legal", "Finance"],
    "Legally Relevant / Estate-Linked Items":["Legal"],
    "Medical & Health Care Contacts":        ["Health"],
    "Medical & Health Care Documents":       ["Health", "Legal"],
    "Medical Records":                       ["Health"],
    "Medical Records - Older Version":       ["Health"],
    "Medication":                            ["Health"],
    "Personal Care and Lifestyle":           ["Finance"],
    "Personal Support & Trusted Contacts":   ["Support Network"],
    "Pet-Related Contacts":                  ["Pets"],
    "Pet-Related Financial Obligations":     ["Pets", "Finance"],
    "Pet-Specific Legal & Ownership Records":["Pets", "Legal"],
    "Property & Housing Expenses":           ["Finance", "Housing"],
    "Real Estate & Property Records":        ["Housing", "Legal"],
    "Sentimental & Personal Items":          ["Caregiving"],
    "Social & Communication Accounts":       ["Digital"],
    "Technology & Digital Storage Devices":  ["Digital"],
    "Transportation & Mobility":             ["Finance", "Transportation"],
    "Utilities":                             ["Finance", "Housing"],
}


# ── MySQL helpers ─────────────────────────────────────────────────────────────

def _get_mysql_config() -> dict:
    """Load MySQL connection config from .env via the app's config module."""
    try:
        sys.path.insert(0, str(_SCRIPT_DIR))
        from core.config import MYSQL_CONFIG
        return MYSQL_CONFIG
    except Exception:
        # Fallback: read env vars directly (useful when running standalone)
        from dotenv import load_dotenv
        load_dotenv(_SCRIPT_DIR / ".env")
        return {
            "user":     os.getenv("MYSQL_USER"),
            "password": os.getenv("MYSQL_PASSWORD"),
            "host":     os.getenv("MYSQL_HOST", "localhost"),
            "port":     int(os.getenv("MYSQL_PORT", "3306")),
            "database": os.getenv("MYSQL_DATABASE"),
        }


def fetch_rows_from_mysql() -> list[dict]:
    """
    Run the recommendation_master query and return flat rows:
      [{ scope, entity, item_id, item_name, policy }, ...]
    """
    config = _get_mysql_config()
    rows = []
    connection = None
    try:
        connection = mysql.connector.connect(**config)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(_ITEMS_QUERY)
        for row in cursor.fetchall():
            rows.append({
                "scope":     (row["scope"]     or "").strip(),
                "entity":    (row["entity"]    or "").strip(),
                "story_id":  row["story_id"],
                "item_id":   row["item_id"],
                "item_name": (row["item_name"] or "").strip(),
                "policy":    (row["policy"]    or "").strip(),
            })
        cursor.close()
        return rows
    except Error as e:
        print(f"MySQL error while fetching items: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        if connection and connection.is_connected():
            connection.close()


def fetch_current_config_from_mysql() -> dict | None:
    """
    Fetch the latest seed_data from context_config table.
    Returns None if the table is empty or doesn't exist yet.
    """
    config = _get_mysql_config()
    connection = None
    try:
        connection = mysql.connector.connect(**config)
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT seed_data FROM context_config ORDER BY id DESC LIMIT 1"
        )
        row = cursor.fetchone()
        cursor.close()
        if row and row.get("seed_data"):
            return json.loads(row["seed_data"])
        return None
    except Error:
        return None  # Table may not exist yet; fall back to JSON file
    finally:
        if connection and connection.is_connected():
            connection.close()


def save_config_to_mysql(config: dict) -> None:
    """INSERT the updated config as a new row in context_config."""
    db_config = _get_mysql_config()
    connection = None
    try:
        connection = mysql.connector.connect(**db_config)
        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO context_config (seed_data) VALUES (%s)",
            (json.dumps(config),),
        )
        connection.commit()
        cursor.close()
        print("  Saved to MySQL context_config table.")
    except Error as e:
        print(f"  MySQL save failed: {e}", file=sys.stderr)
    finally:
        if connection and connection.is_connected():
            connection.close()


# ── Config file helpers ───────────────────────────────────────────────────────

def load_current_config() -> dict:
    """
    Load the current config. Priority:
      1. MySQL context_config table (latest row)
      2. context/config/context_scopes.json on disk
      3. Empty config (first run)
    """
    # Try MySQL first
    config = fetch_current_config_from_mysql()
    if config:
        print("  Loaded current config from MySQL context_config table.")
        return config

    # Fall back to JSON file
    if _CONFIG_FILE.exists():
        with open(_CONFIG_FILE, "r", encoding="utf-8") as f:
            config = json.load(f)
        print(f"  Loaded current config from {_CONFIG_FILE}.")
        return config

    print("  No existing config found — starting fresh.")
    return {"domains": [], "context_scopes": []}


def save_config_to_file(config: dict) -> None:
    """Write the updated config to context_scopes.json."""
    _CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    print(f"  Saved to {_CONFIG_FILE}.")


# ── Grouping ──────────────────────────────────────────────────────────────────

def group_by_scope(rows: list[dict]) -> dict:
    """
    Build nested structure from flat rows:
      { scope_name: { entity: { item_id: { item_name, policies: [...] } } } }
    Multiple rows with the same scope+entity+item_id are merged (policies collected).
    """
    grouped = defaultdict(lambda: defaultdict(dict))

    for row in rows:
        scope   = row["scope"]
        entity  = row["entity"]
        item_id = row["item_id"]

        if not scope or item_id is None:
            continue

        if item_id not in grouped[scope][entity]:
            grouped[scope][entity][item_id] = {
                "item_name": row["item_name"],
                "policies":  [],
            }

        policy = row["policy"]
        if policy and policy not in grouped[scope][entity][item_id]["policies"]:
            grouped[scope][entity][item_id]["policies"].append(policy)

    return grouped


# ── Entity → storyId map ─────────────────────────────────────────────────────

def build_entity_story_id_map(rows: list[dict]) -> dict:
    """
    Build { entity_name: storyId } from MySQL rows.
    One storyId per entity name (stories_masters is the source of truth).
    """
    entity_map = {}
    for row in rows:
        entity   = row["entity"]
        story_id = row["story_id"]
        if entity and story_id is not None:
            entity_map[entity] = story_id
    return entity_map


def inject_story_ids(signals: dict, entity_story_id_map: dict) -> dict:
    """
    Post-process a signals dict (from LLM or existing config) and inject
    storyId into every signal based on its entity field.

    Handles:
      - New flat schema:      { "entity": "Autos", "itemId": 32, ... }
      - New multi_source:     { "sources": [{ "entity": "...", ... }], ... }
      - Old source[] schema:  { "source": [{ "entity": "...", "itemId": ... }], ... }

    Does not overwrite storyId if already present.
    """
    for signal_def in signals.values():
        # New schema — multi_source
        if "sources" in signal_def:
            for source in signal_def["sources"]:
                if not source.get("storyId"):
                    entity = source.get("entity")
                    if entity and entity in entity_story_id_map:
                        source["storyId"] = entity_story_id_map[entity]

        # Old schema — source[] array
        elif "source" in signal_def:
            for source in signal_def["source"]:
                if not source.get("storyId"):
                    entity = source.get("entity")
                    if entity and entity in entity_story_id_map:
                        source["storyId"] = entity_story_id_map[entity]

        # New flat schema — entity at top level
        else:
            if not signal_def.get("storyId"):
                entity = signal_def.get("entity")
                if entity and entity in entity_story_id_map:
                    signal_def["storyId"] = entity_story_id_map[entity]

    return signals


# ── Config diffing ────────────────────────────────────────────────────────────

def index_existing_config(config: dict) -> tuple[dict, dict]:
    """
    Returns:
      existing_scopes  : { scope_name: scope_dict }
      existing_item_ids: { scope_name: set(itemIds) }

    Handles both new flat schema and old source[] schema for backward compat.
    """
    existing_scopes   = {}
    existing_item_ids = defaultdict(set)

    for scope in config.get("context_scopes", []):
        name = scope["scope_name"]
        existing_scopes[name] = scope

        for signal_def in scope.get("signals", {}).values():
            # New schema — multi_source: sources array
            if "sources" in signal_def:
                for src in signal_def["sources"]:
                    iid = src.get("itemId")
                    if iid is not None:
                        existing_item_ids[name].add(iid)
            # New schema — flat itemId at top level
            elif "itemId" in signal_def:
                iid = signal_def["itemId"]
                if iid is not None:
                    existing_item_ids[name].add(iid)
            # Old schema fallback — source[] array
            else:
                for src in signal_def.get("source", []):
                    iid = src.get("itemId")
                    if iid is not None:
                        existing_item_ids[name].add(iid)

    return existing_scopes, existing_item_ids


def compute_diff(
    mysql_grouped: dict,
    existing_scopes: dict,
    existing_item_ids: dict,
    force_scope: str | None = None,
) -> tuple[list, dict]:
    """
    Returns:
      new_scope_names        : [scope_name, ...]   — fully new scopes
      scopes_with_new_items  : { scope_name: { entity: { item_id: data } } }
                               — existing scopes that have new item IDs from MySQL
    """
    new_scope_names       = []
    scopes_with_new_items = {}

    for scope_name, scope_data in mysql_grouped.items():

        # Force mode: treat one specific scope as if it has all new items
        if force_scope and scope_name != force_scope:
            continue

        if scope_name not in existing_scopes:
            new_scope_names.append(scope_name)
            continue

        # Scope exists — check for new item IDs
        known_ids = existing_item_ids.get(scope_name, set())
        new_items_for_scope = {}

        for entity, items in scope_data.items():
            new_items = {
                iid: data
                for iid, data in items.items()
                if iid not in known_ids
            }
            if new_items:
                new_items_for_scope[entity] = new_items

        if new_items_for_scope:
            scopes_with_new_items[scope_name] = new_items_for_scope

    return new_scope_names, scopes_with_new_items


# ── LLM ──────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert at designing context scope configurations for a caregiving AI platform called Rejara.

The context config drives a signal computation engine that reads user data from Firestore (via itemId + field names) and caches structured signals in Redis for use by downstream AI workflows.

--- New flat signal schema ---

Simple signal (single or repeating item, one entity):
{
  "itemId":          <integer>,
  "entity":          "<entity name exactly as provided>",
  "attributes":      ["<policy_field_name>", ...],   // ALL policy fields for this item
  "dependencyScope": "single_document" | "repeating_collection",
  "method":          "sum" | "count"                 // ONLY for numeric aggregation
}

Multi-source signal (same concept, multiple entity types):
{
  "sources": [
    { "itemId": <int>, "entity": "<entity>", "attributes": ["<field>", ...] },
    ...
  ],
  "dependencyScope": "multi_source"
}

--- dependencyScope rules ---
- "single_document"      : item appears at most once per story (documents, personal details)
- "repeating_collection" : item repeats across chapters (bank accounts, medications, contacts)
- "multi_source"         : same logical signal from multiple entity types simultaneously

--- method rules (only for repeating_collection) ---
- "sum"   : numeric field totalled across all positively-answered items (expenses, income)
- "count" : count of positively-answered items (number of accounts, providers, etc.)
- omit    : return the full list of attribute maps for each answered item (rich detail)

--- attributes rules ---
- Include ALL policy field names for the item (they become the output attribute keys)
- For sum signals, the FIRST attribute must be the numeric field
- For single-attribute items, attributes = ["<field_name>"]

--- General rules ---
1. One signal per logical concept per item. Do NOT create separate signals for sub-attributes.
   All related fields belong in the same signal's attributes list.
2. Signal names must be clear, human-readable, title case.
3. When an item appears under multiple entities with the same semantic meaning, use multi_source.
4. Repeating items (accounts, medications, contacts, records) use repeating_collection.
5. Output ONLY valid raw JSON — no markdown, no code fences, no explanation.
"""


def _format_items_block(scope_data: dict) -> str:
    """Format grouped items for the LLM prompt."""
    lines = ["Items grouped by entity (entity → itemId → item_name | policies):"]
    for entity, items in scope_data.items():
        lines.append(f"\nEntity: {entity}")
        for item_id, data in items.items():
            policies_str = ", ".join(data["policies"]) if data["policies"] else "(no sub-fields)"
            lines.append(f"  itemId={item_id} | {data['item_name']} | policies: {policies_str}")
    return "\n".join(lines)


def build_new_scope_prompt(scope_name: str, scope_data: dict) -> str:
    domains = SCOPE_DOMAIN_MAP.get(scope_name, ["General"])
    return "\n".join([
        f'Generate the FULL context scope config JSON for scope: "{scope_name}"',
        f"Assigned domains: {json.dumps(domains)}",
        "",
        _format_items_block(scope_data),
        "",
        "Output a single JSON object with this shape (new flat schema):",
        '{ "scope_name": "...", "domains": [...], "signals": { "<Signal Name>": { "itemId": <int>, "entity": "...", "attributes": [...], "dependencyScope": "..." } } }',
        "",
        "For multi-source signals use: { \"sources\": [{\"itemId\": <int>, \"entity\": \"...\", \"attributes\": [...]},...], \"dependencyScope\": \"multi_source\" }",
        "For sum/count signals add: \"method\": \"sum\" or \"method\": \"count\"",
        "Do NOT use the old 'source', 'type', or 'item_names' keys.",
    ])


def build_new_signals_prompt(scope_name: str, new_items: dict) -> str:
    """Prompt for generating only the NEW signals to add to an existing scope."""
    return "\n".join([
        f'The scope "{scope_name}" already exists. Generate ONLY the new signals for the NEW items listed below.',
        "Do NOT include any signals for items not listed here.",
        "",
        _format_items_block(new_items),
        "",
        "Output ONLY a JSON object of signals (no scope_name/domains wrapper), using the new flat schema:",
        '{ "<Signal Name>": { "itemId": <int>, "entity": "...", "attributes": [...], "dependencyScope": "..." } }',
        "",
        "For multi-source signals use: { \"sources\": [{\"itemId\": <int>, \"entity\": \"...\", \"attributes\": [...]},...], \"dependencyScope\": \"multi_source\" }",
        "For sum/count signals add: \"method\": \"sum\" or \"method\": \"count\"",
        "Do NOT use the old 'source', 'type', or 'item_names' keys.",
    ])


def extract_json(text: str) -> str:
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    return match.group(1).strip() if match else text.strip()


def call_groq(client: groq.Groq, model: str, prompt: str) -> str | None:
    try:
        response = client.chat.completions.create(
            model=model,
            max_tokens=4096,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": prompt},
            ],
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"\n  Groq API error: {e}", file=sys.stderr)
        return None


def generate_new_scope(client, model, scope_name, scope_data) -> dict | None:
    raw_text = call_groq(client, model, build_new_scope_prompt(scope_name, scope_data))
    if not raw_text:
        return None
    try:
        return json.loads(extract_json(raw_text))
    except json.JSONDecodeError as e:
        print(f"\n  JSON parse error for scope '{scope_name}': {e}", file=sys.stderr)
        print(f"  Raw:\n{raw_text[:400]}", file=sys.stderr)
        return None


def generate_new_signals(client, model, scope_name, new_items) -> dict | None:
    """Returns a signals dict { signal_name: signal_def } or None on failure."""
    raw_text = call_groq(client, model, build_new_signals_prompt(scope_name, new_items))
    if not raw_text:
        return None
    try:
        return json.loads(extract_json(raw_text))
    except json.JSONDecodeError as e:
        print(f"\n  JSON parse error for new signals in '{scope_name}': {e}", file=sys.stderr)
        print(f"  Raw:\n{raw_text[:400]}", file=sys.stderr)
        return None


# ── Config assembly ───────────────────────────────────────────────────────────

def merge_new_signals_into_scope(scope: dict, new_signals: dict) -> dict:
    """Add new_signals into scope['signals'] without overwriting existing ones."""
    existing_signals = scope.get("signals", {})
    for signal_name, signal_def in new_signals.items():
        if signal_name not in existing_signals:
            existing_signals[signal_name] = signal_def
        else:
            # Signal name collision — prefix with "New " to avoid silent overwrite
            existing_signals[f"New {signal_name}"] = signal_def
    scope["signals"] = existing_signals
    return scope


def rebuild_domains(scopes: list[dict]) -> list[str]:
    return sorted({
        domain
        for scope in scopes
        for domain in scope.get("domains", [])
    })


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sync context scope config with MySQL recommendation_master data.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--scope",
        help="Force re-process a single scope by name (even if it already exists)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show what would change — no LLM calls, no file writes",
    )
    parser.add_argument(
        "--no-save", action="store_true",
        help="Run LLM generation but do not write files or MySQL",
    )
    parser.add_argument(
        "--model", default="llama-3.3-70b-versatile",
        help="Groq model to use (default: llama-3.3-70b-versatile)",
    )
    parser.add_argument(
        "--backfill-story-ids", action="store_true",
        help="One-time: inject storyId into all existing signals from MySQL, no LLM calls",
    )
    args = parser.parse_args()

    # ── Backfill mode ─────────────────────────────────────────────────────────
    if args.backfill_story_ids:
        print("── Backfill mode: injecting storyId into existing config ──")
        print("\n── Step 1: Fetching entity→storyId map from MySQL ──")
        rows = fetch_rows_from_mysql()
        entity_story_id_map = build_entity_story_id_map(rows)
        print(f"  {len(entity_story_id_map)} entities found: {list(entity_story_id_map.keys())}")

        print("\n── Step 2: Loading current config from JSON file ──")
        # Backfill always reads from the JSON file — MySQL may have an older schema
        if not _CONFIG_FILE.exists():
            print(f"  Error: {_CONFIG_FILE} not found.", file=sys.stderr)
            sys.exit(1)
        with open(_CONFIG_FILE, "r", encoding="utf-8") as f:
            current_config = json.load(f)
        print(f"  Loaded from {_CONFIG_FILE}.")

        print("\n── Step 3: Injecting storyId into all signals ──")
        updated = 0

        # Diagnostic: collect all entity names used across signals in the config
        config_entities = set()
        for scope in current_config.get("context_scopes", []):
            for signal_def in scope.get("signals", {}).values():
                if "sources" in signal_def:
                    for src in signal_def["sources"]:
                        if src.get("entity"):
                            config_entities.add(src["entity"])
                elif "source" in signal_def:
                    for src in signal_def["source"]:
                        if src.get("entity"):
                            config_entities.add(src["entity"])
                else:
                    if signal_def.get("entity"):
                        config_entities.add(signal_def["entity"])

        unmatched = config_entities - set(entity_story_id_map.keys())
        matched   = config_entities & set(entity_story_id_map.keys())
        print(f"  Entities in config   : {sorted(config_entities)}")
        print(f"  Matched in MySQL map : {sorted(matched)}")
        print(f"  Unmatched (no storyId): {sorted(unmatched)}")

        for scope in current_config.get("context_scopes", []):
            before = json.dumps(scope.get("signals", {}))
            inject_story_ids(scope.get("signals", {}), entity_story_id_map)
            if json.dumps(scope.get("signals", {})) != before:
                updated += 1
                print(f"  Updated: {scope['scope_name']}")
        print(f"\n  {updated} scopes updated with storyId")

        if args.no_save:
            print("\n[no-save] Skipping file/DB writes.")
            return

        print("\n── Step 4: Saving ──")
        save_config_to_file(current_config)
        save_config_to_mysql(current_config)
        print("\nDone. Run POST /api/context/reload-config to activate.")
        return

    print("── Step 1: Fetching items from MySQL recommendation_master ──")
    rows = fetch_rows_from_mysql()
    print(f"  {len(rows)} rows fetched")

    mysql_grouped       = group_by_scope(rows)
    entity_story_id_map = build_entity_story_id_map(rows)
    print(f"  {len(mysql_grouped)} distinct scopes in MySQL")
    print(f"  {len(entity_story_id_map)} distinct entities with storyId")

    print("\n── Step 2: Loading current config ──")
    current_config  = load_current_config()
    existing_scopes, existing_item_ids = index_existing_config(current_config)
    print(f"  {len(existing_scopes)} scopes already in config")

    print("\n── Step 3: Computing diff ──")
    new_scope_names, scopes_with_new_items = compute_diff(
        mysql_grouped, existing_scopes, existing_item_ids, force_scope=args.scope
    )

    if args.scope and args.scope not in new_scope_names and args.scope not in scopes_with_new_items:
        # Force mode: treat the scope as fully new regardless
        if args.scope in mysql_grouped:
            new_scope_names.append(args.scope)
            print(f"  Force mode: '{args.scope}' will be fully regenerated.")
        else:
            print(f"Error: scope '{args.scope}' not found in MySQL data.", file=sys.stderr)
            sys.exit(1)

    print(f"  New scopes          : {len(new_scope_names)}")
    print(f"  Scopes with new items: {len(scopes_with_new_items)}")

    if new_scope_names:
        print(f"\n  New scopes to add:")
        for s in new_scope_names:
            print(f"    + {s}")

    if scopes_with_new_items:
        print(f"\n  Existing scopes with new items:")
        for scope_name, new_items in scopes_with_new_items.items():
            total_new = sum(len(items) for items in new_items.values())
            print(f"    ~ {scope_name}  (+{total_new} item(s))")
            for _, items in new_items.items():
                for iid, data in items.items():
                    print(f"        itemId={iid} | {data['item_name']}")

    if not new_scope_names and not scopes_with_new_items:
        print("\nConfig is already up to date — nothing to add.")
        return

    if args.dry_run:
        print("\n[dry-run] No changes made.")
        return

    # ── Step 4: Generate via Groq ─────────────────────────────────────────────
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        print("Error: GROQ_API_KEY environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    client = groq.Groq(api_key=api_key)
    updated_config = json.loads(json.dumps(current_config))  # deep copy
    failed = []

    total = len(new_scope_names) + len(scopes_with_new_items)
    i = 0

    print(f"\n── Step 4: Generating with Groq/{args.model} ──")

    # 4a. New scopes
    for scope_name in new_scope_names:
        i += 1
        print(f"  [{i:>2}/{total}] NEW scope '{scope_name}' ...", end=" ", flush=True)
        result = generate_new_scope(client, args.model, scope_name, mysql_grouped[scope_name])
        if result:
            result["signals"] = inject_story_ids(result.get("signals", {}), entity_story_id_map)
            updated_config["context_scopes"].append(result)
            print("ok")
        else:
            failed.append(scope_name)
            print("FAILED")

    # 4b. New items in existing scopes
    for scope_name, new_items in scopes_with_new_items.items():
        i += 1
        total_new = sum(len(v) for v in new_items.values())
        print(f"  [{i:>2}/{total}] UPDATING '{scope_name}' (+{total_new} items) ...", end=" ", flush=True)
        new_signals = generate_new_signals(client, args.model, scope_name, new_items)
        if new_signals:
            new_signals = inject_story_ids(new_signals, entity_story_id_map)
            # Find and update this scope in updated_config
            for scope in updated_config["context_scopes"]:
                if scope["scope_name"] == scope_name:
                    merge_new_signals_into_scope(scope, new_signals)
                    break
            print("ok")
        else:
            failed.append(scope_name)
            print("FAILED")

    # ── Step 5: Rebuild domain list & save ────────────────────────────────────
    updated_config["domains"] = rebuild_domains(updated_config["context_scopes"])

    new_added    = len(new_scope_names) - sum(1 for s in failed if s in new_scope_names)
    items_updated = len(scopes_with_new_items) - sum(1 for s in failed if s in scopes_with_new_items)

    print(f"\n── Summary ──────────────────────────────────────────────────")
    print(f"  New scopes added     : {new_added}")
    print(f"  Scopes updated       : {items_updated}")
    print(f"  Total scopes in config: {len(updated_config['context_scopes'])}")
    if failed:
        print(f"  Failed               : {', '.join(failed)}")

    if args.no_save:
        print("\n[no-save] Skipping file/DB writes.")
        print(json.dumps(updated_config, indent=2))
        return

    print("\n── Step 5: Saving ──")
    save_config_to_file(updated_config)
    save_config_to_mysql(updated_config)

    print("\nDone. Run POST /api/context/reload-config to activate the new config.")


if __name__ == "__main__":
    main()
