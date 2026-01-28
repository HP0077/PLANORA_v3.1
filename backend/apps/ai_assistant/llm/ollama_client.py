"""Ollama client adapter for AI assistant."""
import requests
from typing import Tuple

API_URL = 'http://localhost:11434/api/generate'
DEFAULT_MODEL = 'llama3'
# Give the local Ollama server more time to return for longer prompts/cold starts.
TIMEOUT = 180


def generate(prompt: str) -> Tuple[str, int]:
    """Call local Ollama generate endpoint and return text and token estimate."""
    payload = {
        'model': DEFAULT_MODEL,
        'prompt': prompt,
        'stream': False,
        # Constrain response length to avoid long-running generations that can time out locally.
        'options': {
            'num_predict': 128,
            'num_ctx': 2048,
            'temperature': 0.2,
            'top_p': 0.9,
        },
    }
    resp = requests.post(API_URL, json=payload, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json() if resp.content else {}
    content = data.get('response') or ''
    tokens_est = len(prompt) // 4 + len(content) // 4
    return content.strip(), tokens_est
