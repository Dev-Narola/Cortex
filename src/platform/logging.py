import json
import logging
import sys
from typing import Any

from .config import settings


def setup_logging():
    """
    Set up logging configuration.
    """
    log_level = logging.DEBUG if settings.DEBUG else logging.INFO

    # Remove any existing handlers
    for handler in logging.root.handlers[:]:
        logging.root.removeHandler(handler)

    # Configure root logger
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )

    # If we want JSON logging in production, we can customize further
    if not settings.DEBUG and getattr(settings, "LOG_FORMAT", "") == "json":
        # For simplicity, we'll use a basic JSON formatter here
        # In a real application, you might use a library like python-json-logger
        class JsonFormatter(logging.Formatter):
            def format(self, record: logging.LogRecord) -> str:
                log_record: dict[str, Any] = {
                    "timestamp": self.formatTime(record, self.datefmt),
                    "level": record.levelname,
                    "name": record.name,
                    "message": record.getMessage(),
                }
                if record.exc_info:
                    log_record["exception"] = self.formatException(record.exc_info)
                # Add extra attributes
                if hasattr(record, "extra"):
                    log_record.update(record.extra)
                return json.dumps(log_record)

        # Replace the handler's formatter
        for handler in logging.root.handlers:
            handler.setFormatter(JsonFormatter())


# Call setup_logging when this module is imported
setup_logging()

# Export a logger for use in other modules
logger = logging.getLogger("cortex")
