"""
Debug Utility: Inspect Redis Conversation History

This script helps you inspect and debug conversation history stored in Redis.
Run this script to check if conversation history is being stored and retrieved correctly.

Usage:
    python scripts/debug_conversation_history.py --user_id <USER_ID> --assistant_id <ASSISTANT_ID>
    python scripts/debug_conversation_history.py --list_all --user_id <USER_ID>
    python scripts/debug_conversation_history.py --search <PATTERN>
"""

import os
import sys
import json
import argparse
from datetime import datetime, timedelta

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from src.services.redis_service import redis_client


def format_ttl(ttl_seconds: int) -> str:
    """Format TTL in human-readable format."""
    if ttl_seconds < 0:
        return "No expiration set"
    if ttl_seconds == 0:
        return "Expired or doesn't exist"

    hours = ttl_seconds // 3600
    minutes = (ttl_seconds % 3600) // 60
    seconds = ttl_seconds % 60

    if hours > 0:
        return f"{hours}h {minutes}m {seconds}s remaining"
    elif minutes > 0:
        return f"{minutes}m {seconds}s remaining"
    else:
        return f"{seconds}s remaining"


def get_legacy_conversation(user_id: int, assistant_id: str) -> dict:
    """Get conversation from legacy format (v1)."""
    key = f"assistant:context:{user_id}:{assistant_id}"

    result = {
        "key": key,
        "exists": False,
        "ttl": None,
        "ttl_formatted": None,
        "data": None,
        "message_count": 0
    }

    try:
        data = redis_client.get(key)
        ttl = redis_client.ttl(key)

        result["ttl"] = ttl
        result["ttl_formatted"] = format_ttl(ttl)

        if data:
            result["exists"] = True
            parsed_data = json.loads(data)
            result["data"] = parsed_data
            if isinstance(parsed_data, list):
                result["message_count"] = len(parsed_data)
    except Exception as e:
        result["error"] = str(e)

    return result


def get_optimized_conversation(user_id: int, assistant_id: str) -> dict:
    """Get conversation from optimized format (v2)."""
    key = f"assistant:context:v2:{user_id}:{assistant_id}"

    result = {
        "key": key,
        "exists": False,
        "ttl": None,
        "ttl_formatted": None,
        "data": None,
        "seed_question": None,
        "policy_count": 0
    }

    try:
        data = redis_client.get(key)
        ttl = redis_client.ttl(key)

        result["ttl"] = ttl
        result["ttl_formatted"] = format_ttl(ttl)

        if data:
            result["exists"] = True
            parsed_data = json.loads(data)
            result["data"] = parsed_data
            result["seed_question"] = parsed_data.get("seed_question")
            result["policy_count"] = len(parsed_data.get("policies", []))
            result["metadata"] = parsed_data.get("metadata")
    except Exception as e:
        result["error"] = str(e)

    return result


def list_all_conversations_for_user(user_id: int) -> list:
    """List all conversation keys for a specific user."""
    patterns = [
        f"assistant:context:{user_id}:*",      # Legacy format
        f"assistant:context:v2:{user_id}:*"    # Optimized format
    ]

    all_keys = []
    for pattern in patterns:
        keys = redis_client.keys(pattern)
        for key in keys:
            ttl = redis_client.ttl(key)
            all_keys.append({
                "key": key,
                "ttl": ttl,
                "ttl_formatted": format_ttl(ttl),
                "format": "v2 (optimized)" if ":v2:" in key else "v1 (legacy)"
            })

    return all_keys


def search_conversations(pattern: str) -> list:
    """Search for conversation keys matching a pattern."""
    # Search in both formats
    search_patterns = [
        f"assistant:context:*{pattern}*",
        f"assistant:context:v2:*{pattern}*"
    ]

    all_keys = []
    seen = set()

    for search_pattern in search_patterns:
        keys = redis_client.keys(search_pattern)
        for key in keys:
            if key not in seen:
                seen.add(key)
                ttl = redis_client.ttl(key)
                all_keys.append({
                    "key": key,
                    "ttl": ttl,
                    "ttl_formatted": format_ttl(ttl),
                    "format": "v2 (optimized)" if ":v2:" in key else "v1 (legacy)"
                })

    return all_keys


def print_separator(char="=", length=80):
    print(char * length)


def print_json(data, indent=2):
    """Pretty print JSON data."""
    print(json.dumps(data, indent=indent, default=str))


def main():
    parser = argparse.ArgumentParser(description="Debug Redis Conversation History")
    parser.add_argument("--user_id", type=int, help="User ID to query")
    parser.add_argument("--assistant_id", type=str, help="Assistant ID to query")
    parser.add_argument("--list_all", action="store_true", help="List all conversations for user")
    parser.add_argument("--search", type=str, help="Search pattern for keys")
    parser.add_argument("--raw", action="store_true", help="Output raw JSON only")

    args = parser.parse_args()

    # If no arguments, show interactive mode
    if not args.user_id and not args.search:
        print("\n" + "=" * 60)
        print("  Redis Conversation History Debug Tool")
        print("=" * 60)
        print("\nNo arguments provided. Running in interactive mode.\n")

        try:
            user_id_input = input("Enter user_id (or press Enter to search): ").strip()

            if not user_id_input:
                search_pattern = input("Enter search pattern: ").strip()
                if search_pattern:
                    args.search = search_pattern
            else:
                args.user_id = int(user_id_input)
                args.assistant_id = input("Enter assistant_id (or press Enter to list all): ").strip() or None
                if not args.assistant_id:
                    args.list_all = True
        except ValueError:
            print("Invalid user_id. Must be a number.")
            return
        except KeyboardInterrupt:
            print("\nExiting...")
            return

    # Search mode
    if args.search:
        print_separator()
        print(f"SEARCHING FOR PATTERN: *{args.search}*")
        print_separator()

        results = search_conversations(args.search)

        if not results:
            print("\nNo conversations found matching the pattern.")
        else:
            print(f"\nFound {len(results)} conversation(s):\n")
            for i, r in enumerate(results, 1):
                print(f"{i}. {r['key']}")
                print(f"   Format: {r['format']}")
                print(f"   TTL: {r['ttl_formatted']}")
                print()
        return

    # List all conversations for user
    if args.list_all and args.user_id:
        print_separator()
        print(f"ALL CONVERSATIONS FOR USER: {args.user_id}")
        print_separator()

        results = list_all_conversations_for_user(args.user_id)

        if not results:
            print("\nNo conversations found for this user.")
            print("This could mean:")
            print("  1. The user has never started a conversation")
            print("  2. All conversations have expired (12-hour TTL)")
            print("  3. Wrong user_id")
        else:
            print(f"\nFound {len(results)} conversation(s):\n")
            for i, r in enumerate(results, 1):
                print(f"{i}. {r['key']}")
                print(f"   Format: {r['format']}")
                print(f"   TTL: {r['ttl_formatted']}")
                print()

            # Ask if user wants details
            try:
                view_details = input("\nView details for a specific key? Enter number (or press Enter to skip): ").strip()
                if view_details:
                    idx = int(view_details) - 1
                    if 0 <= idx < len(results):
                        key = results[idx]["key"]
                        data = redis_client.get(key)
                        if data:
                            print(f"\n{'=' * 60}")
                            print(f"DATA FOR: {key}")
                            print("=" * 60)
                            print_json(json.loads(data))
            except (ValueError, KeyboardInterrupt):
                pass
        return

    # Get specific conversation
    if args.user_id and args.assistant_id:
        if args.raw:
            # Raw JSON output for programmatic use
            result = {
                "legacy_v1": get_legacy_conversation(args.user_id, args.assistant_id),
                "optimized_v2": get_optimized_conversation(args.user_id, args.assistant_id)
            }
            print_json(result)
            return

        print_separator()
        print(f"CONVERSATION HISTORY DEBUG")
        print(f"User ID: {args.user_id}")
        print(f"Assistant ID: {args.assistant_id}")
        print(f"Timestamp: {datetime.utcnow().isoformat()}")
        print_separator()

        # Check legacy format
        print("\n[1] LEGACY FORMAT (v1)")
        print("-" * 40)
        legacy = get_legacy_conversation(args.user_id, args.assistant_id)

        if legacy.get("error"):
            print(f"ERROR: {legacy['error']}")
        elif not legacy["exists"]:
            print(f"Key: {legacy['key']}")
            print("Status: NOT FOUND")
            print(f"TTL: {legacy['ttl_formatted']}")
        else:
            print(f"Key: {legacy['key']}")
            print(f"Status: EXISTS")
            print(f"TTL: {legacy['ttl_formatted']}")
            print(f"Message Count: {legacy['message_count']}")
            print("\nData:")
            print_json(legacy['data'])

        # Check optimized format
        print("\n" + "=" * 60)
        print("[2] OPTIMIZED FORMAT (v2) - Currently Used")
        print("-" * 40)
        optimized = get_optimized_conversation(args.user_id, args.assistant_id)

        if optimized.get("error"):
            print(f"ERROR: {optimized['error']}")
        elif not optimized["exists"]:
            print(f"Key: {optimized['key']}")
            print("Status: NOT FOUND")
            print(f"TTL: {optimized['ttl_formatted']}")
            print("\n⚠️  No conversation history found!")
            print("Possible reasons:")
            print("  1. Conversation expired (12-hour TTL)")
            print("  2. Conversation was never started")
            print("  3. Wrong user_id or assistant_id")
        else:
            print(f"Key: {optimized['key']}")
            print(f"Status: EXISTS")
            print(f"TTL: {optimized['ttl_formatted']}")
            print(f"Policy Count: {optimized['policy_count']}")

            if optimized.get("metadata"):
                print(f"\nMetadata:")
                print(f"  Last Updated: {optimized['metadata'].get('last_updated')}")
                print(f"  Question Count: {optimized['metadata'].get('question_count')}")

            if optimized.get("seed_question"):
                print(f"\nSeed Question:")
                seed = optimized["seed_question"]
                print(f"  Item: {seed.get('item_name', 'N/A')}")
                print(f"  Question: {seed.get('personalized', seed.get('original', 'N/A'))[:100]}...")
                print(f"  Answer: {seed.get('answer', 'N/A')}")

            if optimized["policy_count"] > 0:
                print(f"\nPolicy Answers ({optimized['policy_count']}):")
                for i, policy in enumerate(optimized["data"].get("policies", []), 1):
                    print(f"\n  [{i}] {policy.get('policy_tag', 'N/A')}")
                    print(f"      Question: {policy.get('personalized_question', policy.get('original_question', 'N/A'))[:80]}...")
                    if "answer" in policy:
                        print(f"      Answer: {policy.get('answer', 'N/A')}")
                    elif "answers" in policy:
                        print(f"      Answers: {policy.get('answers', {})}")

            print("\n" + "-" * 40)
            print("FULL RAW DATA:")
            print("-" * 40)
            print_json(optimized["data"])

        print_separator()


if __name__ == "__main__":
    main()
