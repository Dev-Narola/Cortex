from src.shared.exceptions import CortexException

class EmbeddingError(CortexException):
    """Base class for all embedding errors."""
    pass

class TransientEmbeddingError(EmbeddingError):
    """
    Raised when an embedding operation fails but should be retried.
    Examples: rate limits, temporary network timeouts, 5xx server errors.
    """
    pass

class PermanentEmbeddingError(EmbeddingError):
    """
    Raised when an embedding operation fails and should NOT be retried.
    Examples: invalid API key, invalid model name, input text too long.
    """
    pass
