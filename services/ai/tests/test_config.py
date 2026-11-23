"""Unit tests for service configuration and environment settings (config.py)."""

from __future__ import annotations

import pytest
from src.app.config import Settings, _float_env, _int_env


def test_settings_defaults():
    """Verify default settings match plan specifications."""
    s = Settings()
    # Image generation defaults
    assert s.ai_image_generation is False
    assert s.ai_image_provider == "flux"
    assert s.image_storage_provider == "local"
    assert s.local_storage_base_url == "http://localhost:3000"

    # Default settings must pass validate()
    s.validate()


def test_settings_from_env_defaults(monkeypatch):
    """Verify Settings.from_env() respects defaults when env vars are unset."""
    for env_var in [
        "AI_IMAGE_GENERATION",
        "AI_IMAGE_PROVIDER",
        "IMAGE_STORAGE_PROVIDER",
        "LOCAL_STORAGE_BASE_URL",
    ]:
        monkeypatch.delenv(env_var, raising=False)

    s = Settings.from_env()
    assert s.ai_image_generation is False
    assert s.ai_image_provider == "flux"
    assert s.image_storage_provider == "local"
    assert s.local_storage_base_url == "http://localhost:3000"


def test_settings_from_env_custom_values(monkeypatch):
    """Verify Settings.from_env() parses custom environment variables correctly."""
    monkeypatch.setenv("AI_IMAGE_GENERATION", "true")
    monkeypatch.setenv("AI_IMAGE_PROVIDER", "gpu_worker")
    monkeypatch.setenv("IMAGE_STORAGE_PROVIDER", "r2")
    monkeypatch.setenv("LOCAL_STORAGE_BASE_URL", "http://localhost:4000/")

    s = Settings.from_env()
    assert s.ai_image_generation is True
    assert s.ai_image_provider == "gpu_worker"
    assert s.image_storage_provider == "r2"
    assert s.local_storage_base_url == "http://localhost:4000"


def test_invalid_ai_image_provider(monkeypatch):
    """Ensure invalid AI_IMAGE_PROVIDER raises ValueError on validate."""
    s = Settings(ai_image_provider="midjourney")
    with pytest.raises(ValueError, match="AI_IMAGE_PROVIDER must be flux, fake, or gpu_worker"):
        s.validate()

    monkeypatch.setenv("AI_IMAGE_PROVIDER", "invalid_provider")
    with pytest.raises(ValueError, match="AI_IMAGE_PROVIDER must be flux, fake, or gpu_worker"):
        Settings.from_env()


def test_gpu_worker_ai_image_provider(monkeypatch):
    """Ensure gpu_worker is a valid AI_IMAGE_PROVIDER."""
    s = Settings(ai_image_provider="gpu_worker")
    s.validate()

    monkeypatch.setenv("AI_IMAGE_PROVIDER", "gpu_worker")
    s2 = Settings.from_env()
    assert s2.ai_image_provider == "gpu_worker"


def test_invalid_image_storage_provider(monkeypatch):
    """Ensure invalid IMAGE_STORAGE_PROVIDER raises ValueError on validate."""
    s = Settings(image_storage_provider="s3")
    with pytest.raises(ValueError, match="IMAGE_STORAGE_PROVIDER must be local, r2 or fake"):
        s.validate()

    monkeypatch.setenv("IMAGE_STORAGE_PROVIDER", "unsupported_storage")
    with pytest.raises(ValueError, match="IMAGE_STORAGE_PROVIDER must be local, r2 or fake"):
        Settings.from_env()


def test_float_and_int_env_helpers(monkeypatch):
    """Unit tests for _int_env and _float_env helpers."""
    monkeypatch.delenv("TEST_INT", raising=False)
    assert _int_env("TEST_INT", 10) == 10
    monkeypatch.setenv("TEST_INT", "42")
    assert _int_env("TEST_INT", 10) == 42
    monkeypatch.setenv("TEST_INT", "abc")
    with pytest.raises(ValueError, match="TEST_INT must be an integer"):
        _int_env("TEST_INT", 10)

    monkeypatch.delenv("TEST_FLOAT", raising=False)
    assert _float_env("TEST_FLOAT", 3.14) == 3.14
    monkeypatch.setenv("TEST_FLOAT", "7.25")
    assert _float_env("TEST_FLOAT", 3.14) == 7.25
    monkeypatch.setenv("TEST_FLOAT", "xyz")
    with pytest.raises(ValueError, match="TEST_FLOAT must be a float"):
        _float_env("TEST_FLOAT", 3.14)

