"""
Context Module — Router

Endpoints:
  POST /api/context/fetch          → Fetch context by userId + scopes/domains in request body
  POST /api/context/load-config    → Admin: manually load config JSON into Redis
  POST /api/context/reload-config  → Admin: reload config from MySQL into Redis
  GET  /api/context/status         → Admin: check config loaded in Redis
  POST /api/context/recompute      → Delta recompute (default) or full recompute (force=true)

Pub/Sub is handled via pull subscription in context/pubsub_subscriber.py.
"""

import json
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel

from context.builder_service import recompute_all_stories, recompute_delta_stories
from context.config_service import load_config, get_status
from context.firestore_client import get_db
from context.redis_client import get_redis
from context.logger import log_info, log_error
from middleware.rejara_auth_middleware import get_current_user

_admin_key_header = APIKeyHeader(name="X-Admin-Key", auto_error=False)

def _verify_admin_key(api_key: str = Security(_admin_key_header)):
    expected = os.getenv("ADMIN_API_KEY", "")
    if not expected or api_key != expected:
        raise HTTPException(status_code=403, detail="Invalid or missing admin API key.")

router = APIRouter(prefix="/context", tags=["context"], dependencies=[Depends(get_current_user)])
admin_router = APIRouter(prefix="/context", tags=["context"], dependencies=[Depends(_verify_admin_key)])


# ── Pydantic models ───────────────────────────────────────────────────────────

class LoadConfigRequest(BaseModel):
    context_scopes: list
    domains: list = []


class RecomputeRequest(BaseModel):
    userId: str
    force: bool = False
    itemIds: List[int] = []


class ContextFetchRequest(BaseModel):
    userId: str
    scopes: List[str] = []
    domains: List[str] = []


# ── Shared helpers ────────────────────────────────────────────────────────────

def _resolve_allowed_scopes(redis, scopes: List[str], domains: List[str]) -> Optional[set]:
    """
    Return the set of scope names to include, or None (= all scopes).
    Domains expand to their member scopes via the domain_to_scopes index.
    Explicit scopes intersect with domain results (filter down, not expand).
    """
    allowed = None

    if domains:
        raw = redis.get("context:index:domain_to_scopes")
        domain_to_scopes = json.loads(raw) if raw else {}
        allowed = set()
        for domain in domains:
            allowed.update(domain_to_scopes.get(domain, []))

    if scopes:
        scope_set = set(scopes)
        if allowed is not None:
            allowed = allowed & scope_set  # intersect: scopes filter down the domain results
        else:
            allowed = scope_set

    return allowed


def _fetch_context(user_id: str, allowed_scopes: Optional[set], redis) -> dict:
    """
    Read per-story and user-level scope keys from Redis.

    Returns:
        {
            "stories": [ { storyDocId, entity, storyName, storyType, scopes: [...] } ],
            "user_level_scopes": [ { scope_name, domains, signals } ],
        }
    """
    # ── Per-story scopes ──────────────────────────────────────────────────────
    raw_index = redis.get(f"context:user:{user_id}:stories")
    story_index = json.loads(raw_index) if raw_index else []

    stories_out = []
    for story in story_index:
        story_doc_id = story["storyDocId"]
        keys = redis.keys(f"context:user:{user_id}:story:{story_doc_id}:scope:*")
        scopes = []
        for key in keys:
            scope_name = key.split(":scope:")[-1]
            if allowed_scopes is not None and scope_name not in allowed_scopes:
                continue
            raw = redis.get(key)
            if raw:
                data = json.loads(raw)
                scopes.append({
                    "scope_name": scope_name,
                    "domains": data.get("domains", []),
                    "signals": data.get("signals", {}),
                })
        if scopes:
            stories_out.append({
                "storyDocId": story_doc_id,
                "entity": story.get("entity", ""),
                "storyName": story.get("storyName", ""),
                "storyType": story.get("storyType", ""),
                "scopes": len(scopes),
                "context_scopes": scopes,
            })

    # ── User-level scopes — only "User Profile" (level=user) ─────────────────
    # Filter strictly by level="user" to exclude any stale keys from the
    # old flat-scope system that share the same key prefix.
    user_keys = redis.keys(f"context:user:{user_id}:scope:*")
    user_scopes_out = []
    for key in user_keys:
        scope_name = key.split(":scope:")[-1]
        if allowed_scopes is not None and scope_name not in allowed_scopes:
            continue
        raw = redis.get(key)
        if raw:
            data = json.loads(raw)
            if data.get("level") != "user":
                continue  # Skip stale old-system keys
            user_scopes_out.append({
                "scope_name": scope_name,
                "domains": data.get("domains", []),
                "signals": data.get("signals", {}),
            })

    if not stories_out and not user_scopes_out:
        raise HTTPException(
            status_code=404,
            detail=f"No context found for user {user_id}. Trigger a change or call POST /api/context/recompute.",
        )

    return {"stories": stories_out, "user_level_scopes": user_scopes_out}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/load-config")
def load_context_config(request: LoadConfigRequest):
    """
    Load context_scopes.json into Redis.

    Paste the full content of context_scopes.json directly as the body:
      { "domains": [...], "context_scopes": [...] }

    Seeds:
      context:config
      context:index:item_to_scopes
      context:index:entity_to_scopes
    """
    try:
        summary = load_config(request.model_dump(), get_redis())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        log_error(f"Config load failed: {e}")
        raise HTTPException(status_code=503, detail=f"Redis error: {e}")

    return {"status": "ok", "message": "Config loaded successfully", **summary}


@router.get("/status")
def context_status():
    """Check whether context config is loaded in Redis."""
    status = get_status(get_redis())
    if not status:
        raise HTTPException(
            status_code=404,
            detail="Config not loaded. Call POST /api/context/load-config first.",
        )
    return {"status": "loaded", **status}


@admin_router.post("/reload-config")
def reload_config_from_mysql():
    """
    Reload scope config from MySQL into Redis.
    Called by Admin Panel after updating the config — no request body needed.
    Also used on startup if Redis config is missing.
    """
    try:
        from context.mysql_client import fetch_config_from_mysql
        config = fetch_config_from_mysql()
        summary = load_config(config, get_redis())
        log_info(f"Config reloaded from MySQL — version={summary['version']}, scopes={summary['scopes']}")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        log_error(f"Config reload from MySQL failed: {e}")
        raise HTTPException(status_code=503, detail=str(e))

    return {"status": "ok", "message": "Config reloaded from MySQL", **summary}


@router.post("/fetch")
def fetch_context(request: ContextFetchRequest):
    """
    Fetch context for a user by passing userId, scopes, and domains in the request body.
    Preferred endpoint for internal service-to-service calls (e.g. stochastic planning).

    Request body:
        { "userId": "999", "scopes": ["Aging", "Income"], "domains": ["Health"] }

    Returns:
        { "user_id": ..., "scopes": <count>, "context": { scope_name: { signal: value } } }
    """
    redis = get_redis()
    allowed_scopes = _resolve_allowed_scopes(redis, request.scopes, request.domains)
    try:
        result = _fetch_context(request.userId, allowed_scopes, redis)
    except HTTPException as e:
        if e.status_code == 404:
            # No context yet — auto-trigger recompute for new users
            log_info(f"No context found for user {request.userId} — auto-triggering recompute")
            recompute_all_stories(request.userId, redis, get_db())
            try:
                result = _fetch_context(request.userId, allowed_scopes, redis)
            except HTTPException:
                # User genuinely has no stories yet
                return {
                    "user_id": request.userId,
                    "total_stories": 0,
                    "context_scopes": [],
                    "user_level_scopes": [],
                }
        else:
            raise
    return {
        "user_id": request.userId,
        "total_stories": len(result["stories"]),
        "context_scopes": result["stories"],
        "user_level_scopes": result["user_level_scopes"],
    }



@router.post("/recompute")
def recompute_user(request: RecomputeRequest):
    """
    Recompute context signals for a user.

    - Default (force=false): delta recompute — only scopes affected by changed
      itemIds or admin config changes are recomputed. Fast path.
    - force=true: full recompute across all scopes and all stories. Use after
      onboarding, major config changes, or for debugging.
    - itemIds: list of item IDs that changed (used by delta to narrow scope
      selection via the item_to_scopes index). Optional — if omitted, delta
      only picks up config-dirty scopes.

    Request body:
        { "userId": "999" }                          ← delta, no specific items
        { "userId": "999", "itemIds": [2496, 101] }  ← delta for specific items
        { "userId": "999", "force": true }           ← full recompute
    """
    redis = get_redis()
    db    = get_db()
    try:
        if request.force:
            results = recompute_all_stories(request.userId, redis, db)
            mode = "full"
        else:
            results = recompute_delta_stories(request.userId, redis, db, item_ids=request.itemIds or [])
            mode = "delta"

        ok      = sum(1 for v in results.values() if v == "ok")
        skipped = sum(1 for v in results.values() if v == "skipped")
        errors  = {k: v for k, v in results.items() if v not in ("ok", "skipped", "removed")}
        return {
            "status": "ok",
            "mode": mode,
            "user_id": request.userId,
            "scopes_computed": ok,
            "scopes_skipped": skipped,
            "errors": errors,
        }
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log_error(f"Recompute failed for user {request.userId}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
