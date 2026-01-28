"""Groq client adapter for AI assistant."""
import os
import requests
from typing import Tuple

DEFAULT_MODEL = 'llama-3.3-70b-versatile'
API_URL = 'https://api.groq.com/openai/v1/chat/completions'
TIMEOUT = 30


def generate(prompt: str) -> Tuple[str, int]:
    """Call Groq chat completion and return text and token estimate."""
    api_key = os.environ.get('GROQ_API_KEY')
    if not api_key:
        raise RuntimeError('GROQ_API_KEY missing')

    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }
    payload = {
        'model': DEFAULT_MODEL,
        'messages': [
            {'role': 'system', 'content': 'You are a concise, action-oriented event copilot. Keep answers brief and safe.'},
            {'role': 'user', 'content': prompt},
        ],
        'temperature': 0.3,
        'max_tokens': 600,
    }
    resp = requests.post(API_URL, json=payload, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    content = (data.get('choices') or [{}])[0].get('message', {}).get('content', '') or ''
    usage = data.get('usage') or {}
    tokens_est = int(usage.get('total_tokens') or usage.get('prompt_tokens') or 0)
    return content.strip(), tokens_est
