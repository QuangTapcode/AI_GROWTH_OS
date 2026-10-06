"""Shared document model, provenance and output helpers for corpus builders."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid5

import httpx


CORPUS_ROOT = Path(__file__).resolve().parent
OUT_DIR = CORPUS_ROOT / "out"
# Wikimedia and Overpass ask for a descriptive User-Agent.
USER_AGENT = "AI-Growth-OS-corpus/0.1 (TripC Da Nang pilot; https://aigrowthos-staging.pages.dev/)"
_SOURCE_NAMESPACE = UUID("3b8f2c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b")

# Prices in third-party guides are stale and unverified; only partner/TripC facts may state prices.
_PRICE = re.compile(
    r"(?:US\$|\$|₫|VND|USD)\s?\d[\d.,]*(?:\s?(?:k|K|million|mil))?"
    r"|\d[\d.,]*\s?(?:k|K)?\s?(?:VND|USD|dong|đồng|₫|đ)(?![\w])"
    r"|\b\d[\d.,]*\s?[kK]\b",
)


@dataclass
class Document:
    doc_id: str
    title: str
    text: str
    topics: list[str]
    license: str
    attribution: str
    source_url: str
    upstream_version: str | None = None
    retrieved_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds"))
    language: str = "en"
    notes: list[str] = field(default_factory=list)

    @property
    def source_id(self) -> str:
        return str(uuid5(_SOURCE_NAMESPACE, self.doc_id))

    def provenance(self) -> dict:
        return {
            "license": self.license,
            "attribution": self.attribution,
            "source_url": self.source_url,
            "upstream_version": self.upstream_version,
            "retrieved_at": self.retrieved_at,
        }


def client() -> httpx.Client:
    return httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=120, follow_redirects=True)


def redact_prices(text: str) -> tuple[str, int]:
    return _PRICE.subn("[price removed]", text)


def write_corpus(documents: list[Document], out_dir: Path = OUT_DIR) -> Path:
    """Write one UTF-8 text file per document plus a manifest that BE/ingest tooling reads."""

    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "manifest.json"
    existing = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"documents": []}
    by_id = {item["doc_id"]: item for item in existing["documents"]}
    for document in documents:
        path = out_dir / f"{document.doc_id}.txt"
        path.write_text(document.text, encoding="utf-8")
        entry = asdict(document)
        entry.pop("text")
        entry.update(
            {
                "source_id": document.source_id,
                "file": path.name,
                "sha256": hashlib.sha256(document.text.encode("utf-8")).hexdigest(),
                "chars": len(document.text),
            }
        )
        by_id[document.doc_id] = entry
    manifest = {
        "generated_by": "services/ai/corpus/build.py",
        "documents": sorted(by_id.values(), key=lambda item: item["doc_id"]),
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest_path
