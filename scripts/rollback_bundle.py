#!/usr/bin/env python3
"""CLI script to execute instant rollback of AI Content Marketing Agent bundle in < 60s."""

import argparse
import json
import sys
import time
from pathlib import Path

# Add services/ai to sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
AI_DIR = ROOT_DIR / "services" / "ai"
if str(AI_DIR) not in sys.path:
    sys.path.insert(0, str(AI_DIR))

# Safe UTF-8 console output for Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from src.agents.content.bundle_manager import (
    get_active_bundle_id,
    rollback_to_previous_bundle,
    switch_bundle,
)


def main():
    parser = argparse.ArgumentParser(description="Rollback AI Content Agent to previous bundle in < 60s")
    parser.add_argument("--target", type=str, default=None, help="Specific bundle ID to switch to (default: previous bundle)")
    parser.add_argument("--reason", type=str, default="Manual CLI trigger / Alert mitigation", help="Reason for rollback")
    parser.add_argument("--json", action="store_true", help="Output JSON format")
    args = parser.parse_args()

    before_bundle = get_active_bundle_id()

    if args.target:
        result = switch_bundle(args.target, reason=args.reason)
    else:
        result = rollback_to_previous_bundle(reason=args.reason)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print("=" * 60)
        print("  AI GROWTH OS — BUNDLE ROLLBACK CONTROLLER")
        print("=" * 60)
        print(f"Previous Active Bundle: {result.get('previous_active_bundle', before_bundle)}")
        print(f"New Active Bundle:      {result.get('new_active_bundle')}")
        print(f"Reason:                 {result.get('reason')}")
        print(f"Actual Elapsed Time:    {result.get('elapsed_seconds'):.6f} seconds ({result.get('elapsed_ms'):.2f} ms)")
        print(f"SLA Check (< 60.0s):    {'PASS (COMPLIANT)' if result.get('under_60_seconds') else 'FAIL'}")
        print("=" * 60)

    if not result.get("under_60_seconds"):
        sys.exit(1)


if __name__ == "__main__":
    main()
