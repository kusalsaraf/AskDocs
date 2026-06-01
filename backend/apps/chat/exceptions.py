from apps.core.exceptions import AskDocsError


class RateLimitExceeded(AskDocsError):
    status_code = 429
    default_code = "rate_limit_exceeded"
    default_detail = "Daily message limit reached. Please try again tomorrow."


class BudgetExceeded(AskDocsError):
    status_code = 429
    default_code = "budget_exceeded"
    default_detail = "Platform daily budget has been reached. Please try again tomorrow."


class ConversationNotFound(AskDocsError):
    status_code = 404
    default_code = "conversation_not_found"
    default_detail = "Conversation not found."


class InvalidConversationState(AskDocsError):
    status_code = 400
    default_code = "invalid_conversation_state"
    default_detail = "This conversation is in an invalid state for this operation."


class EmptyMessageContent(AskDocsError):
    status_code = 400
    default_code = "empty_message_content"
    default_detail = "Message content cannot be empty."
