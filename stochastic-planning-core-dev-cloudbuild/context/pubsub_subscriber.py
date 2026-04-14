"""
Context Module — Pub/Sub Pull Subscriber

Runs as a background thread on server startup.
Pulls messages from GCP Pub/Sub and triggers recompute_all_scopes().

Config (env vars):
  CONTEXT_SERVICE_KEY_PATH   — path to GCP service account JSON
  PUBSUB_PROJECT_ID          — GCP project (default: rejara)
  PUBSUB_SUBSCRIPTION_ID     — subscription name (default: context-builder-local-sub)
"""

import json
import os
import threading

from google.cloud import pubsub_v1
from google.oauth2 import service_account

from context.builder_service import recompute_story_scopes, recompute_all_stories
from context.firestore_client import get_db
from context.redis_client import get_redis
from context.logger import log_info, log_error

_streaming_pull_future = None
_subscriber_client = None

# Per-user locks: prevents concurrent Pub/Sub callbacks for the same user from
# racing each other. Different users still process in parallel.
_user_locks: dict = {}
_user_locks_mutex = threading.Lock()


def _get_user_lock(user_id: str) -> threading.Lock:
    with _user_locks_mutex:
        if user_id not in _user_locks:
            _user_locks[user_id] = threading.Lock()
        return _user_locks[user_id]


def _get_sibling_story_doc_ids(user_id: str, triggered_doc_id: str, entity: str, redis) -> list[str]:
    """
    Return all story doc IDs for this user+entity from the Redis story index,
    excluding the already-processed triggered_doc_id.
    Returns empty list if the index doesn't exist yet (new user).
    """
    try:
        raw = redis.get(f"context:user:{user_id}:stories")
        if not raw:
            return []
        stories = json.loads(raw)
        return [
            s["storyDocId"]
            for s in stories
            if s.get("entity") == entity and s["storyDocId"] != triggered_doc_id
        ]
    except Exception as e:
        log_error(f"Pub/Sub: failed to fetch sibling story docs for user {user_id}: {e}")
        return []


def _callback(message):
    try:
        raw = message.data.decode("utf-8")
        event = json.loads(raw)
    except Exception as e:
        log_error(f"Pub/Sub: failed to decode message: {e}")
        message.ack()
        return

    user_id = event.get("userId")
    change_type = event.get("changeType", "unknown")
    entity = event.get("entity", "unknown")
    story_doc_id = event.get("storyDocId")
    story_id = event.get("storyId")  # numeric storyId — None for old message format

    if not user_id:
        log_error(f"Pub/Sub: missing userId in message: {event}")
        message.ack()
        return

    log_info(
        f"Pub/Sub pull received — userId={user_id}, "
        f"changeType={change_type}, entity={entity}, storyDocId={story_doc_id}, storyId={story_id}"
    )

    user_lock = _get_user_lock(user_id)
    with user_lock:
        try:
            if story_doc_id and entity and entity != "unknown":
                redis = get_redis()
                db    = get_db()

                # Recompute the triggered story doc first
                all_results = recompute_story_scopes(user_id, story_doc_id, entity, [], redis, db, story_id=story_id)

                # Find all sibling story docs with the same entity from the Redis
                # story index and recompute each one. This ensures that when one
                # care receiver's data changes, all care receivers of the same
                # entity type are kept in sync (Bug 2 fix).
                sibling_doc_ids = _get_sibling_story_doc_ids(user_id, story_doc_id, entity, redis)
                if sibling_doc_ids:
                    log_info(
                        f"Pub/Sub: recomputing {len(sibling_doc_ids)} sibling story doc(s) "
                        f"for entity='{entity}', user={user_id}"
                    )
                for sibling_doc_id in sibling_doc_ids:
                    # Siblings share the same entity/storyId — pass story_id for consistent matching
                    sibling_results = recompute_story_scopes(user_id, sibling_doc_id, entity, [], redis, db, story_id=story_id)
                    all_results.update(sibling_results)

            else:
                # Fallback: old message format without storyDocId — recompute all stories
                all_results = recompute_all_stories(user_id, get_redis(), get_db())

            ok = sum(1 for v in all_results.values() if v == "ok")
            log_info(f"Recompute done — user={user_id}, storyDocId={story_doc_id}, {ok}/{len(all_results)} scopes ok")
            message.ack()

        except RuntimeError as e:
            # Config not loaded — ack to avoid infinite retry, admin action required
            log_error(f"Pub/Sub: config error for user {user_id}: {e}")
            message.ack()

        except Exception as e:
            # Unknown error — nack so GCP retries with backoff
            log_error(f"Pub/Sub: recompute failed for user {user_id}: {e}")
            message.nack()


def start_subscriber():
    global _streaming_pull_future, _subscriber_client

    key_path = os.getenv("CONTEXT_SERVICE_KEY_PATH")
    project_id = os.getenv("PUBSUB_PROJECT_ID", "rejara")
    subscription_id = os.getenv("PUBSUB_SUBSCRIPTION_ID", "context-builder-local-sub")

    log_info(f"Pub/Sub config — project={project_id}, subscription={subscription_id}")

    try:
        if key_path and os.path.exists(key_path):
            # Local dev — use explicit service account key
            credentials = service_account.Credentials.from_service_account_file(key_path)
            _subscriber_client = pubsub_v1.SubscriberClient(credentials=credentials)
            log_info("Pub/Sub subscriber using service account key")
        else:
            # Cloud Run — use Application Default Credentials (ADC)
            _subscriber_client = pubsub_v1.SubscriberClient()
            log_info("Pub/Sub subscriber using ADC")
        subscription_path = _subscriber_client.subscription_path(project_id, subscription_id)

        _streaming_pull_future = _subscriber_client.subscribe(
            subscription_path, callback=_callback
        )
        log_info(f"Pub/Sub subscriber started — {subscription_path}")
        _streaming_pull_future.result()  # blocks thread until cancelled

    except Exception as e:
        log_error(f"Pub/Sub subscriber error: {e}")
        if _streaming_pull_future:
            _streaming_pull_future.cancel()


def stop_subscriber():
    global _streaming_pull_future, _subscriber_client
    if _streaming_pull_future:
        _streaming_pull_future.cancel()
        log_info("Pub/Sub subscriber stopped")
    if _subscriber_client:
        _subscriber_client.close()


def start_subscriber_thread():
    thread = threading.Thread(target=start_subscriber, daemon=True, name="pubsub-subscriber")
    thread.start()
