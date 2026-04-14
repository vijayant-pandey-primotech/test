"""
Simple script to fetch and display Redis context data

Usage:
    python fetch_redis_data.py <user_id> <assistant_id>

Example:
    python fetch_redis_data.py 123 my_assistant
"""

import json
import sys

# Import Redis client
try:
    from src.services.redis_service import redis_client
    from src.services.assistant_context_service import (
        get_optimized_context,
        get_optimized_context_key
    )
except ImportError as e:
    print(f"Error importing modules: {e}")
    print("Make sure you're running from the project root directory")
    sys.exit(1)


def fetch_and_display(user_id: int, assistant_id: str):
    """Fetch and display Redis context for a user/assistant."""

    print("\n" + "="*80)
    print(f"REDIS DATA FOR USER {user_id}, ASSISTANT {assistant_id}")
    print("="*80)

    # Test Redis connection
    try:
        redis_client.ping()
        print("\n✅ Redis connection successful\n")
    except Exception as e:
        print(f"\n❌ Redis connection failed: {e}\n")
        return

    # Get the context
    context = get_optimized_context(user_id, assistant_id)

    if not context:
        print(f"❌ No context found for user {user_id}, assistant {assistant_id}\n")
        return

    # Display seed question
    print("-" * 80)
    print("SEED QUESTION:")
    print("-" * 80)
    seed = context.get("seed_question", {})
    if seed:
        print(f"Original Template:  {seed.get('original', 'N/A')}")
        print(f"Personalized:       {seed.get('personalized', 'N/A')}")
        print(f"Item Name:          {seed.get('item_name', 'N/A')}")
        print(f"User Answer:        {seed.get('answer', 'N/A')}")
    else:
        print("No seed question stored yet")

    # Display policy questions
    print("\n" + "-" * 80)
    print("POLICY QUESTIONS:")
    print("-" * 80)
    policies = context.get("policies", [])

    if policies:
        for i, policy in enumerate(policies, 1):
            print(f"\n[Policy {i}]")
            print(f"  Tag:              {policy.get('policy_tag', 'N/A')}")
            print(f"  Original:         {policy.get('original_question', 'N/A')}")
            print(f"  Personalized:     {policy.get('personalized_question', 'N/A')}")

            # Check if it's cluster mode (has multiple answers) or personal mode (single answer)
            if "answers" in policy:
                print(f"  Mode:             CLUSTER")
                print(f"  Answers:")
                for dep_name, answer in policy.get('answers', {}).items():
                    print(f"    - {dep_name}: {answer}")
            elif "answer" in policy:
                print(f"  Mode:             PERSONAL")
                print(f"  Answer:           {policy.get('answer')}")
    else:
        print("No policy questions stored yet")

    # Display metadata
    print("\n" + "-" * 80)
    print("METADATA:")
    print("-" * 80)
    metadata = context.get("metadata", {})
    print(f"Question Count:     {metadata.get('question_count', 0)}")
    print(f"Last Updated:       {metadata.get('last_updated', 'N/A')}")

    # Display raw JSON
    print("\n" + "-" * 80)
    print("FULL RAW DATA:")
    print("-" * 80)
    print(json.dumps(context, indent=2, ensure_ascii=False))

    # Display Redis key and size
    print("\n" + "-" * 80)
    print("STORAGE INFO:")
    print("-" * 80)
    key = get_optimized_context_key(user_id, assistant_id)
    try:
        raw_data = redis_client.get(key)
        if raw_data:
            size = len(raw_data)
            print(f"Redis Key:          {key}")
            print(f"Storage Size:       {size} bytes ({size/1024:.2f} KB)")
        else:
            print("No raw data found in Redis")
    except Exception as e:
        print(f"Error getting storage info: {e}")

    print("\n" + "="*80 + "\n")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)

    try:
        user_id = int(sys.argv[1])
        assistant_id = sys.argv[2]
        fetch_and_display(user_id, assistant_id)
    except ValueError:
        print("Error: user_id must be an integer")
        print(__doc__)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
