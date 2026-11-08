"""What the AI service asks of the local Ollama model."""
import asyncio
import json

import httpx

from src.app import providers
from src.app.providers import OllamaProvider


def test_a_thinking_model_spends_its_tokens_on_the_answer(settings, monkeypatch):
    # qwen3 thinks by default: on 06/11 an SEO draft used all 2048 tokens thinking and returned empty content.
    sent = []

    def reply(request):
        sent.append(json.loads(request.content))
        return httpx.Response(200, json={"message": {"content": '{"answer": "My Khe"}'}, "eval_count": 9})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(providers.httpx, "AsyncClient",
                        lambda **kwargs: real_client(transport=httpx.MockTransport(reply), **kwargs))
    content, _ = asyncio.run(OllamaProvider(settings).chat_json(
        system="s", user="u", schema={"type": "object"}, max_output_tokens=2048, fake=dict))
    assert content == '{"answer": "My Khe"}'
    assert sent[0]["think"] is False
