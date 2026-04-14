# Rejara AI Core Architecture

## Overview
This directory contains the refactored conversation system with a clean, modular architecture that replaces the original monolithic `cbot_controller.py`

## File Structure

```
src/core/
├── README.md                    # This file
├── REFACTOR_ANALYSIS.md        # Detailed refactoring analysis and mapping
├── test_refactor_validation.py # Validation tests
├── models.py                   # Data classes, enums, and structured types
├── utils.py                    # Pure helper functions
├── services.py                 # Business logic and service calls
├── personal_handler.py         # Personal mode conversation handler
├── cluster_handler.py          # Cluster mode conversation handler
└── handlers.py                 # Main orchestration logic
```

## Quick Start

### Using the Entry Point (Backwards Compatible)
```python
from src.controller.cbot_controller import handle_user_response

result = handle_user_response(
    user_response="Yes, I have an estate plan",
    bearer_token="your_token",
    uuid="session_uuid",
    type="story",
    user_unique_id=12345,
    mode="personal"
)
```

### Using the New Architecture Directly
```python
from src.core.handlers import ResponseHandler

handler = ResponseHandler()
result = handler.handle_user_response(
    user_response="John=Yes, Mary=No",
    bearer_token="your_token",
    uuid="session_uuid", 
    type="assistant",
    user_unique_id=12345,
    mode="cluster",
    assistant_id="assist_123"
)
```

### Using Individual Services
```python
from src.core.services import ValidationService, QuestionService
from src.core.models import ConversationMode

# Validate a user response
validator = ValidationService()
result = validator.validate_user_response("Do you have a will?", "Yes I do")

# Fetch next question
questions = QuestionService()
policy, question = questions.fetch_next_question(
    ConversationMode.PERSONAL, 
    user_story_id=123, 
    bearer_token="token"
)
```

## Key Components

### Models (`models.py`)
- **Data Classes**: Structured data with type safety
- **Enums**: Type-safe constants for states, modes, validation results
- **Constants**: Centralized configuration values

### Services (`services.py`)
- **QuestionService**: Question fetching and management
- **ValidationService**: User response validation
- **SessionService**: Session data management
- **DatabaseService**: Database operations
- **LoggingService**: Conversation logging
- **PolicyService**: Policy-related operations
- **SummaryService**: Summary generation

### Handlers
- **PersonalModeHandler**: Individual user conversations
- **ClusterModeHandler**: Multi-dependent conversations  
- **ResponseHandler**: Main orchestration and routing

### Utils (`utils.py`)
- Pure functions for data manipulation
- Response building utilities
- Navigation helpers
- Input cleaning and validation

## Architecture Principles

### Separation of Concerns
- **Models**: Data structures only, no business logic
- **Utils**: Pure functions without side effects
- **Services**: Business logic with external dependencies
- **Handlers**: Conversation flow orchestration
- **Controllers**: Entry points and API interfaces

### Type Safety
- Comprehensive type hints throughout
- Structured data classes replace dictionaries
- Enums prevent invalid state values

### Testability
- Small, focused functions easy to unit test
- Dependency injection through service classes
- Mock-friendly interfaces

### Scalability
- Easy to add new conversation modes
- Plugin architecture ready
- Service-based design allows swapping implementations

## Migration Guide

### For Existing Code
No changes required - the original `handle_user_response()` function signature is preserved and works identically.

### For New Development
1. Import from `src.core.handlers` for full control
2. Use service classes for business logic
3. Leverage data classes for type safety

### Adding New Conversation Modes
1. Create a new handler class in `src/core/`
2. Implement the required interface methods
3. Register in `handlers.py:ResponseHandler`

## Testing

Run the validation tests to ensure everything works:

```bash
python src/core/test_refactor_validation.py
```

## Performance

The refactored architecture provides:
- **Faster loading**: Smaller modules load quicker
- **Better memory usage**: No monolithic functions in memory
- **Efficient caching**: Services can be reused across requests
- **Lazy loading**: Only load what's needed

## Error Handling

All error scenarios from the original implementation are preserved:
- Invalid user responses (3-strike system)
- Network failures (graceful degradation)
- Missing data (safe defaults)
- Session timeouts (automatic recovery)

## Logging and Monitoring

Centralized logging through `LoggingService` provides:
- Consistent log format
- Easy to filter and search
- Integration with monitoring systems
- Performance metrics

## Configuration

Configuration is centralized in `models.py`:
- Maximum invalid count
- Default response messages  
- State transition rules
- API endpoints and timeouts

## Future Enhancements

The architecture is designed to easily support:
- Multiple LLM providers
- Custom validation rules
- Advanced session management
- Real-time conversation analytics
- A/B testing of conversation flows

## Support

For questions about the refactored architecture:
1. Check `REFACTOR_ANALYSIS.md` for detailed mapping
2. Review the unit tests for usage examples
3. Examine the service interfaces for extension points