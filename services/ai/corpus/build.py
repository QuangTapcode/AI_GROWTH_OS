"""Build the pilot corpus from licensed public sources.

From services/ai:
    python -m corpus.build                     # all sources
    python -m corpus.build --only wards govuk  # selected sources

Output (git-ignored): corpus/out/<doc_id>.txt + corpus/out/manifest.json.
"""

from __future__ import annotations

import argparse
import sys

from .common import OUT_DIR, write_corpus
from .sources import BUILDERS


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", choices=sorted(BUILDERS))
    args = parser.parse_args()

    failures = 0
    for name in args.only or sorted(BUILDERS):
        try:
            documents = BUILDERS[name]()
        except Exception as exc:  # noqa: BLE001 - report and continue with other sources
            failures += 1
            print(f"{name:10} FAILED: {exc}", file=sys.stderr)
            continue
        write_corpus(documents)
        for document in documents:
            print(f"{name:10} {document.doc_id:40} {len(document.text):7} chars  {document.license}  {'; '.join(document.notes)}")
    print(f"manifest: {OUT_DIR / 'manifest.json'}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
