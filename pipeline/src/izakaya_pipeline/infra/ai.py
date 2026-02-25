"""Minimal Anthropic AI client for the pipeline."""
import json
import os
import re

from anthropic import Anthropic

_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    return _client


def chat_json(
    system: str,
    user_message: str,
    max_tokens: int = 4096,
    temperature: float = 0.0,
) -> dict | list:
    """Send a message to Claude and parse the response as JSON."""
    client = _get_client()
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system,
        messages=[{"role": "user", "content": user_message}],
    )
    text = response.content[0].text.strip()

    # Strip markdown code fences if present
    match = re.match(r"^```(?:json)?\s*\n?(.*?)```\s*$", text, re.DOTALL)
    if match:
        text = match.group(1).strip()

    return json.loads(text)
