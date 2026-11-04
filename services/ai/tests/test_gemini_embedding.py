"""Gemini limits a request's size, so texts go in batches; a vector stored as meaning must come from the model."""
import asyncio
from types import SimpleNamespace

import pytest

from src.app.config import Settings
from src.app.providers import GeminiProvider, ProviderError


class Models:
    def __init__(self, fail_on_call=None):
        self.batches, self.fail_on_call = [], fail_on_call

    def embed_content(self, *, model, contents, config):
        self.batches.append(list(contents))
        if self.fail_on_call == len(self.batches):
            raise RuntimeError("429 quota exceeded")
        return SimpleNamespace(embeddings=[SimpleNamespace(values=[float(text.split()[-1])]) for text in contents])


def provider(models):
    gemini = GeminiProvider.__new__(GeminiProvider)
    gemini.settings = Settings()
    gemini.client = SimpleNamespace(models=models)
    return gemini


def test_a_long_list_is_sent_in_batches_and_comes_back_in_order():
    models = Models()
    vectors, usage = asyncio.run(provider(models).embed([f"text {n}" for n in range(170)]))
    assert [len(batch) for batch in models.batches] == [80, 80, 10]
    assert vectors == [[float(n)] for n in range(170)]
    assert usage.embedding_calls == 3


def test_a_failed_batch_fails_the_call_instead_of_storing_lexical_vectors_as_meaning():
    # A hashed vector compared with real ones is noise, and nothing would ever re-embed it.
    with pytest.raises(ProviderError) as error:
        asyncio.run(provider(Models(fail_on_call=2)).embed([f"text {n}" for n in range(170)]))
    assert error.value.code == "EMBEDDING_UNAVAILABLE" and error.value.retryable is True
