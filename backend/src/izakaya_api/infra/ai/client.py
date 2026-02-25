import json
import logging
import re

from anthropic import Anthropic

from izakaya_api.config import settings

logger = logging.getLogger(__name__)

_client: Anthropic | None = None


def get_client() -> Anthropic:
    global _client
    if _client is None:
        _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


def chat_json(
    system: str,
    user_message: str,
    model: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.0,
) -> dict | list:
    """Send a message to Claude and parse the response as JSON.

    Handles ```json``` code-fence wrapping that models sometimes add.
    """
    client = get_client()
    response = client.messages.create(
        model=model or settings.anthropic_model,
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
