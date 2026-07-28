import os


def get_secret(secret_name: str) -> str | None:
    """
    Retrieve a secret from environment variables.
    In future versions, this can be replaced with AWS Secrets Manager
    or other secret managers.
    """
    return os.getenv(secret_name)


def get_api_key(service: str) -> str | None:
    """
    Get API key for a given service from environment variables.
    """
    # Example: service='openai' -> OPENAI_API_KEY
    env_var = f"{service.upper()}_API_KEY"
    return os.getenv(env_var)
