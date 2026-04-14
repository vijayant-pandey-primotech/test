"""
Constants and configuration for the Onboarding Recommendation module.
"""

# LLM Configuration
DEFAULT_LLM_PROVIDER = "openai"
MAX_TOKENS_RECOMMENDATION = 8000
LLM_TEMPERATURE = 0.1
TOP_P = 0.4
# Priority levels
PRIORITY_HIGH = "high"
PRIORITY_MEDIUM = "medium"
PRIORITY_LOW = "low"
VALID_PRIORITIES = [PRIORITY_HIGH, PRIORITY_MEDIUM, PRIORITY_LOW]

# Error messages
ERROR_NO_ASSISTANTS = "No assistants found in payload"
ERROR_LLM_FAILURE = "Failed to generate recommendation from LLM"
ERROR_INVALID_PAYLOAD = "Invalid request payload"
ERROR_INVALID_RESPONSE = "Invalid recommendation format from LLM"
