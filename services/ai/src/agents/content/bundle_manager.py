"""Bundle Manager & Instant Rollback System (CM-31).

Manages active AI Agent release bundles and allows instant configuration-based
rollback in < 60 seconds without redeploying code or restarting the service.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

CONTENT_DIR = Path(__file__).resolve().parent
ACTIVE_BUNDLE_CONFIG_PATH = CONTENT_DIR / "active_bundle.json"

# In-memory cache
_CACHED_CONFIG: dict[str, Any] | None = None
_LAST_CONFIG_MTIME: float = 0.0


def _load_config() -> dict[str, Any]:
    """Loads active_bundle.json with mtime checking for hot reload."""
    global _CACHED_CONFIG, _LAST_CONFIG_MTIME

    if not ACTIVE_BUNDLE_CONFIG_PATH.exists():
        # Fallback default
        return {
            "active_bundle_id": "content_agent_release_v2",
            "active_version": "2.0.0",
            "previous_bundle_id": "content_agent_release_v1",
            "previous_version": "1.0.0",
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "reason": "Default fallback",
        }

    try:
        current_mtime = ACTIVE_BUNDLE_CONFIG_PATH.stat().st_mtime
        if _CACHED_CONFIG is None or current_mtime != _LAST_CONFIG_MTIME:
            with open(ACTIVE_BUNDLE_CONFIG_PATH, "r", encoding="utf-8") as f:
                _CACHED_CONFIG = json.load(f)
            _LAST_CONFIG_MTIME = current_mtime
    except Exception as exc:
        logger.warning("Error reading active_bundle.json: %s. Using cached config.", exc)
        if _CACHED_CONFIG is None:
            _CACHED_CONFIG = {
                "active_bundle_id": "content_agent_release_v2",
                "active_version": "2.0.0",
                "previous_bundle_id": "content_agent_release_v1",
                "previous_version": "1.0.0",
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "reason": "Emergency fallback",
            }

    return _CACHED_CONFIG or {}


def get_active_bundle_id() -> str:
    """Returns currently active bundle ID. Checks ENV first, then active_bundle.json."""
    env_override = os.getenv("ACTIVE_CONTENT_BUNDLE_ID")
    if env_override and env_override.strip():
        return env_override.strip()

    config = _load_config()
    return config.get("active_bundle_id", "content_agent_release_v2")


def get_active_bundle() -> dict[str, Any]:
    """Retrieves full JSON metadata of currently active bundle."""
    bundle_id = get_active_bundle_id()
    # Map bundle_id to filename
    if bundle_id == "content_agent_release_v2":
        bundle_file = CONTENT_DIR / "agent_release_v2.json"
    elif bundle_id == "content_agent_release_v1":
        bundle_file = CONTENT_DIR / "agent_release_v1.json"
    else:
        bundle_file = CONTENT_DIR / f"{bundle_id}.json"

    if bundle_file.exists():
        try:
            with open(bundle_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logger.error("Failed to load bundle file %s: %s", bundle_file, exc)

    return {
        "bundle_id": bundle_id,
        "bundle_version": "unknown",
        "status": "LOAD_ERROR",
    }


def rollback_to_previous_bundle(reason: str = "P1 alert triggered rollback") -> dict[str, Any]:
    """Performs instant rollback to previous bundle via configuration in < 60 seconds.

    Returns telemetry dict with execution time, previous bundle, and new active bundle.
    """
    start_time = time.perf_counter()
    config = _load_config()

    current_active = config.get("active_bundle_id", "content_agent_release_v2")
    previous = config.get("previous_bundle_id", "content_agent_release_v1")

    # Target bundle to roll back to
    new_active = previous
    new_previous = current_active

    # Determine versions
    v2_version = "2.0.0" if "v2" in new_active else "1.0.0"
    prev_version = "2.0.0" if "v2" in new_previous else "1.0.0"

    now_iso = datetime.now(timezone.utc).isoformat()
    new_config = {
        "active_bundle_id": new_active,
        "active_version": v2_version,
        "previous_bundle_id": new_previous,
        "previous_version": prev_version,
        "updated_at": now_iso,
        "reason": f"Rollback executed: {reason}",
    }

    # Atomic write
    tmp_path = ACTIVE_BUNDLE_CONFIG_PATH.with_suffix(".tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(new_config, f, indent=2, ensure_ascii=False)
    tmp_path.replace(ACTIVE_BUNDLE_CONFIG_PATH)

    # Force cache reload
    global _CACHED_CONFIG, _LAST_CONFIG_MTIME
    _CACHED_CONFIG = new_config
    _LAST_CONFIG_MTIME = ACTIVE_BUNDLE_CONFIG_PATH.stat().st_mtime

    elapsed_seconds = time.perf_counter() - start_time

    logger.warning(
        "ROLLBACK COMPLETED in %.4f seconds: Switched from %s to %s. Reason: %s",
        elapsed_seconds,
        current_active,
        new_active,
        reason,
    )

    return {
        "success": True,
        "previous_active_bundle": current_active,
        "new_active_bundle": new_active,
        "elapsed_seconds": elapsed_seconds,
        "elapsed_ms": elapsed_seconds * 1000,
        "under_60_seconds": elapsed_seconds < 60.0,
        "reason": reason,
        "timestamp": now_iso,
    }


def switch_bundle(target_bundle_id: str, reason: str = "Manual bundle switch") -> dict[str, Any]:
    """Switches active bundle to any specified valid bundle ID in < 60 seconds."""
    start_time = time.perf_counter()
    config = _load_config()

    current_active = config.get("active_bundle_id", "content_agent_release_v2")
    if current_active == target_bundle_id:
        return {
            "success": True,
            "message": f"Bundle {target_bundle_id} is already active.",
            "active_bundle_id": target_bundle_id,
            "elapsed_seconds": time.perf_counter() - start_time,
            "under_60_seconds": True,
        }

    now_iso = datetime.now(timezone.utc).isoformat()
    new_config = {
        "active_bundle_id": target_bundle_id,
        "active_version": "2.0.0" if "v2" in target_bundle_id else "1.0.0",
        "previous_bundle_id": current_active,
        "previous_version": config.get("active_version", "unknown"),
        "updated_at": now_iso,
        "reason": reason,
    }

    tmp_path = ACTIVE_BUNDLE_CONFIG_PATH.with_suffix(".tmp")
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(new_config, f, indent=2, ensure_ascii=False)
    tmp_path.replace(ACTIVE_BUNDLE_CONFIG_PATH)

    global _CACHED_CONFIG, _LAST_CONFIG_MTIME
    _CACHED_CONFIG = new_config
    _LAST_CONFIG_MTIME = ACTIVE_BUNDLE_CONFIG_PATH.stat().st_mtime

    elapsed_seconds = time.perf_counter() - start_time
    return {
        "success": True,
        "previous_active_bundle": current_active,
        "new_active_bundle": target_bundle_id,
        "elapsed_seconds": elapsed_seconds,
        "elapsed_ms": elapsed_seconds * 1000,
        "under_60_seconds": elapsed_seconds < 60.0,
        "reason": reason,
        "timestamp": now_iso,
    }
