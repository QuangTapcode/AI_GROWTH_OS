"""How well the Community bot finds the passage that answers a question, on the real TripC corpus.

    python -m evals.community_retrieval export          # read the approved corpus (read-only) into var/
    python -m evals.community_retrieval export --include-review   # what approving the waiting sources would add
    python -m evals.community_retrieval run --label X   # score evals/datasets/community_retrieval_v1.json

A question is a hit when one of the first 3 chosen passages matches its 'gold' regex. Abuse and
unanswerable questions are right when nothing is chosen. Query vectors come from the local Ollama,
with the same prefix the service uses, so the numbers match what the bot does live.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "var" / "community_corpus.json"
DATASET = ROOT / "evals" / "datasets" / "community_retrieval_v1.json"
REPORTS = ROOT / "evals" / "reports"
OLLAMA = "http://127.0.0.1:11434"
EMBED_MODEL = "embeddinggemma:latest"

EXPORT_SQL = """
SELECT json_agg(json_build_object(
  'source_id', s.id, 'title', s.title, 'url', COALESCE(s.source_url, s.url_or_blob),
  'chunk_id', c.id, 'index', c.chunk_index, 'text', c.text_content, 'embedding', c.embedding::text)
  ORDER BY s.title, c.chunk_index)
FROM source_chunks c JOIN sources s ON s.id = c.source_id AND s.version = c.source_version
WHERE s.status IN ({statuses}) AND s.deleted_at IS NULL AND c.embedding IS NOT NULL
"""


@dataclass(frozen=True)
class Source:
    source_id: str
    title: str
    url: str


@dataclass
class Chunk:
    chunk_id: str
    text: str
    embedding: list[float] = field(repr=False)
    source: Source | None = None


def export(include_review: bool = False) -> None:
    statuses = "'approved', 'needs_review'" if include_review else "'approved'"
    raw = subprocess.run(
        ["docker", "exec", "-e", "PGOPTIONS=-cdefault_transaction_read_only=on", "ai-growth-os-local-postgres-1",
         "psql", "-U", "ai_growth_dev", "-d", "ai_growth_os", "-At", "-c", EXPORT_SQL.format(statuses=statuses)],
        check=True, capture_output=True, text=True, encoding="utf-8").stdout
    rows = json.loads(raw)
    CORPUS.parent.mkdir(parents=True, exist_ok=True)
    CORPUS.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"exported {len(rows)} chunks from {len({r['source_id'] for r in rows})} sources -> {CORPUS}")


def load_corpus() -> list[tuple[Source, Chunk]]:
    rows = json.loads(CORPUS.read_text(encoding="utf-8"))
    sources: dict[str, Source] = {}
    out = []
    for r in rows:
        src = sources.setdefault(r["source_id"], Source(r["source_id"], r["title"] or "", r["url"] or ""))
        out.append((src, Chunk(r["chunk_id"], r["text"], json.loads(r["embedding"]), src)))
    return out


def embed(texts: list[str]) -> list[list[float]]:
    req = urllib.request.Request(f"{OLLAMA}/api/embed", data=json.dumps({"model": EMBED_MODEL, "input": texts}).encode(),
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.loads(res.read())["embeddings"]


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    n = math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))
    return dot / n if n else 0.0


def run(label: str) -> dict:
    sys.path.insert(0, str(ROOT))
    from src.agents.community.pipeline import choose_passages  # noqa: E402
    from src.rag.ingest import query_embedding_input  # noqa: E402

    corpus = load_corpus()
    questions = json.loads(DATASET.read_text(encoding="utf-8"))["questions"]
    vectors = embed([query_embedding_input(q["q"]) for q in questions])
    # With history, the service also searches the last earlier question together with this one.
    joined = embed([query_embedding_input(f"{q['history'][-1]} {q['q']}" if q.get("history") else q["q"]) for q in questions])
    results, hits, scored = [], 0, 0
    for q, vector, joined_vector in zip(questions, vectors, joined):
        similarity = {c.chunk_id: cosine(vector, c.embedding) for _, c in corpus}
        in_context = {c.chunk_id: cosine(joined_vector, c.embedding) for _, c in corpus}
        history = [type("Turn", (), {"question": h})() for h in q.get("history", [])]
        chosen = choose_passages(q["q"], history, corpus, similarity, in_context, "live")[:3]
        kind = q.get("kind", "answer")
        if kind == "answer":
            gold = re.compile(q["gold"])
            available = sum(1 for _, c in corpus if gold.search(c.text))
            ok = any(gold.search(c.text) for _, c in chosen)
            scored += 1
        elif kind in ("abuse", "unanswerable"):
            available, ok = None, not chosen
            scored += 1
        else:
            available, ok = None, None
        hits += bool(ok)
        results.append({"q": q["q"], "kind": kind, "ok": ok, "gold_in_corpus": available,
                        "top": [f"{s.title[:40]} #{c.chunk_id[:6]}: {c.text[:70]!r}" for s, c in chosen]})
    report = {"label": label, "score": f"{hits}/{scored}", "hit_rate": round(hits / scored, 3), "results": results}
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / f"community_retrieval_{label}.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    for r in results:
        mark = {True: "OK  ", False: "MISS", None: "--  "}[r["ok"]]
        gold = "" if r["gold_in_corpus"] is None else f" (gold in corpus: {r['gold_in_corpus']})"
        print(f"{mark} [{r['kind']}] {r['q']}{gold}")
        for t in r["top"][:1 if r["ok"] else 3]:
            print(f"       {t}")
    print(f"\n{label}: {report['score']} = {report['hit_rate']:.0%}")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["export", "run"])
    parser.add_argument("--label", default="current")
    parser.add_argument("--include-review", action="store_true", help="also export sources waiting for the owner's review")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    export(args.include_review) if args.command == "export" else run(args.label)
