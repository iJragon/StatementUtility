import os
from dotenv import load_dotenv

load_dotenv()

MODEL_PROVIDER = os.getenv("MODEL_PROVIDER", "ollama")

# Ollama (free/local)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "ollama")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")

# Anthropic (upgrade path)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")


def get_llm_client():
    """Return an OpenAI-compatible client pointed at the configured provider."""
    from openai import OpenAI

    if MODEL_PROVIDER == "anthropic":
        # Use Anthropic's OpenAI-compatible endpoint
        return OpenAI(
            base_url="https://api.anthropic.com/v1",
            api_key=ANTHROPIC_API_KEY,
        ), ANTHROPIC_MODEL

    # Default: Ollama
    return OpenAI(
        base_url=OLLAMA_BASE_URL,
        api_key=OLLAMA_API_KEY,
    ), OLLAMA_MODEL


def is_ai_available() -> bool:
    """Check whether the configured LLM backend is reachable."""
    import httpx

    if MODEL_PROVIDER == "anthropic":
        return bool(ANTHROPIC_API_KEY)

    try:
        r = httpx.get(OLLAMA_BASE_URL.replace("/v1", "/api/tags"), timeout=3)
        return r.status_code == 200
    except Exception:
        return False
