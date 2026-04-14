"""
Context Config Service

Loads context_scopes.json config into Redis and builds reverse indexes
required by the context builder for scope routing and signal computation.

Redis keys written:
  context:config                  → full JSON config (all scopes + signals)
  context:config:version          → integer version counter
  context:config:loaded_at        → ISO timestamp of last load
  context:config:scope_hashes     → { scope_name: md5_of_signals } for dirty detection
  context:config:dirty_scopes     → JSON list of scope names changed since last load
  context:index:item_to_scopes    → { itemId: [scope_names] }
  context:index:entity_to_scopes  → { entity: [scope_names] }
  context:index:story_id_to_scopes → { storyId: [scope_names] }
  context:index:domain_to_scopes  → { domain: [scope_names] }
"""

import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone

from context.logger import log_info

CONFIG_KEY             = "context:config"
VERSION_KEY            = "context:config:version"
LOADED_AT_KEY          = "context:config:loaded_at"
SCOPE_HASHES_KEY       = "context:config:scope_hashes"
DIRTY_SCOPES_KEY       = "context:config:dirty_scopes"
ITEM_TO_SCOPES_KEY     = "context:index:item_to_scopes"
ENTITY_TO_SCOPES_KEY   = "context:index:entity_to_scopes"
DOMAIN_TO_SCOPES_KEY   = "context:index:domain_to_scopes"
STORY_ID_TO_SCOPES_KEY = "context:index:story_id_to_scopes"


def _hash_scope(scope: dict) -> str:
    """
    Stable MD5 fingerprint of a scope's signals content.
    Used to detect which scopes changed between config reloads.
    """
    payload = json.dumps(scope.get("signals", {}), sort_keys=True)
    return hashlib.md5(payload.encode()).hexdigest()


def _extract_entity_itemids(signal_def: dict) -> list[tuple]:
    """
    Return (entity, itemId, storyId) triples from a signal definition.
    Handles new flat schema, new multi_source schema, and old source[] schema.
    storyId is the numeric ID of the story type (optional, None if not set).
    """
    # New schema — multi_source: sources array
    if "sources" in signal_def:
        return [
            (s.get("entity"), s.get("itemId"), s.get("storyId"))
            for s in signal_def["sources"]
        ]
    # New schema — simple or aggregate: entity/itemId/storyId at top level
    if "entity" in signal_def or "itemId" in signal_def:
        return [(signal_def.get("entity"), signal_def.get("itemId"), signal_def.get("storyId"))]
    # Old schema fallback: source[] array
    return [
        (src.get("entity"), src.get("itemId"), src.get("storyId"))
        for src in signal_def.get("source", [])
    ]


def load_config(config: dict, redis_client) -> dict:
    """
    Validate config, build indexes, and write everything to Redis atomically.

    Args:
        config: Parsed context_scopes.json as a dict
        redis_client: Redis connection

    Returns:
        Summary dict: { version, scopes, signals, entities }
    """
    scopes = config.get("context_scopes", [])
    if not scopes:
        raise ValueError("Config has no context_scopes defined.")

    item_to_scopes = defaultdict(list)
    entity_to_scopes = defaultdict(list)
    domain_to_scopes = defaultdict(list)
    story_id_to_scopes = defaultdict(list)
    new_scope_hashes = {}
    total_signals = 0

    for scope in scopes:
        scope_name = scope["scope_name"]
        new_scope_hashes[scope_name] = _hash_scope(scope)

        for domain in scope.get("domains", []):
            if scope_name not in domain_to_scopes[domain]:
                domain_to_scopes[domain].append(scope_name)

        for _, signal_def in scope.get("signals", {}).items():
            total_signals += 1
            for entity, item_id, story_id in _extract_entity_itemids(signal_def):
                if entity:
                    if scope_name not in entity_to_scopes[entity]:
                        entity_to_scopes[entity].append(scope_name)
                if item_id is not None:
                    item_key = str(item_id)
                    if scope_name not in item_to_scopes[item_key]:
                        item_to_scopes[item_key].append(scope_name)
                if story_id is not None:
                    sid_key = str(story_id)
                    if scope_name not in story_id_to_scopes[sid_key]:
                        story_id_to_scopes[sid_key].append(scope_name)

    # Diff new hashes against stored hashes to find changed scopes
    raw_old_hashes = redis_client.get(SCOPE_HASHES_KEY)
    old_scope_hashes = json.loads(raw_old_hashes) if raw_old_hashes else {}
    dirty_scopes = [
        name for name, h in new_scope_hashes.items()
        if old_scope_hashes.get(name) != h
    ]
    # Also mark scopes removed from config as dirty so stale Redis keys get cleared
    dirty_scopes += [name for name in old_scope_hashes if name not in new_scope_hashes]

    version = int(redis_client.incr(VERSION_KEY))
    loaded_at = datetime.now(timezone.utc).isoformat()

    pipe = redis_client.pipeline()
    pipe.set(CONFIG_KEY, json.dumps(config))
    pipe.set(LOADED_AT_KEY, loaded_at)
    pipe.set(SCOPE_HASHES_KEY, json.dumps(new_scope_hashes))
    pipe.set(DIRTY_SCOPES_KEY, json.dumps(dirty_scopes))
    pipe.set(ITEM_TO_SCOPES_KEY, json.dumps(dict(item_to_scopes)))
    pipe.set(ENTITY_TO_SCOPES_KEY, json.dumps(dict(entity_to_scopes)))
    pipe.set(DOMAIN_TO_SCOPES_KEY, json.dumps(dict(domain_to_scopes)))
    pipe.set(STORY_ID_TO_SCOPES_KEY, json.dumps(dict(story_id_to_scopes)))
    pipe.execute()

    log_info(
        f"Context config loaded — version={version}, "
        f"scopes={len(scopes)}, signals={total_signals}, "
        f"entities={len(entity_to_scopes)}, story_ids={len(story_id_to_scopes)}, "
        f"dirty_scopes={len(dirty_scopes)}"
    )

    return {
        "version": version,
        "scopes": len(scopes),
        "signals": total_signals,
        "entities": list(entity_to_scopes.keys()),
        "story_ids": list(story_id_to_scopes.keys()),
        "dirty_scopes": dirty_scopes,
        "loaded_at": loaded_at,
    }


def get_or_load_config(redis_client) -> dict:
    """
    Return config from Redis.
    If Redis config is missing, fetch from MySQL and load into Redis first.

    Used as an auto-fallback so no manual /load-config call is needed after a
    Cloud Run restart or Redis flush.
    """
    raw = redis_client.get(CONFIG_KEY)
    if raw:
        return json.loads(raw)

    log_info("Config not found in Redis — auto-loading from MySQL...")
    from context.mysql_client import fetch_config_from_mysql
    config = fetch_config_from_mysql()
    load_config(config, redis_client)
    return config


def get_status(redis_client) -> dict | None:
    """Return current config metadata from Redis, or None if not loaded."""
    version = redis_client.get(VERSION_KEY)
    if not version:
        return None

    config_raw = redis_client.get(CONFIG_KEY)
    scopes = 0
    signals = 0
    if config_raw:
        config = json.loads(config_raw)
        scope_list = config.get("context_scopes", [])
        scopes = len(scope_list)
        signals = sum(len(s.get("signals", {})) for s in scope_list)

    return {
        "version": int(version),
        "scopes": scopes,
        "signals": signals,
        "loaded_at": redis_client.get(LOADED_AT_KEY),
    }
