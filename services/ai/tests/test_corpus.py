"""Offline checks for the corpus builders (no network)."""

from __future__ import annotations

import json

from corpus.common import Document, redact_prices, write_corpus
from corpus.sources import _card, _inside, ward_reorganisation


def test_redact_prices_removes_amounts_but_keeps_times_and_counts() -> None:
    text, removed = redact_prices("Pho costs 40,000 VND or 40k; rooms from US$25. Open 06:00-15:00, 3 meeting rooms.")
    assert removed == 3
    assert "40,000" not in text and "40k" not in text and "25" not in text
    assert "06:00-15:00" in text and "3 meeting rooms" in text


def test_point_in_polygon_even_odd() -> None:
    square = [(0, 0, 1, 0), (1, 0, 1, 1), (1, 1, 0, 1), (0, 1, 0, 0)]
    assert _inside(0.5, 0.5, square)
    assert not _inside(1.5, 0.5, square)


def test_osm_card_omits_hours_and_phone() -> None:
    element = {
        "type": "node",
        "id": 1,
        "lat": 16.04,
        "lon": 108.25,
        "tags": {
            "name": "Phòng gym A",
            "name:en": "Gym A",
            "opening_hours": "Mo-Su 05:00-22:00",
            "phone": "+84 900 000 000",
            "addr:street": "Võ Nguyên Giáp",
            "website": "https://example.org",
        },
    }
    card = _card(element, "Ngũ Hành Sơn", "gym / fitness centre", "2026-10-06T00:00:00Z")
    assert card.startswith("Gym A (Phòng gym A) is listed in OpenStreetMap")
    assert "Ngu Hanh Son ward" in card and "node/1" in card
    assert "05:00" not in card and "+84" not in card


def test_ward_document_lists_all_wards() -> None:
    [document] = ward_reorganisation()
    assert document.text.count(" ward (") == 23
    assert "Phước Mỹ, An Hải Bắc, An Hải Nam" in document.text
    assert document.license == "public-legal-text"


def test_manifest_records_provenance(tmp_path) -> None:
    document = Document(
        doc_id="sample",
        title="Sample",
        text="Hello",
        topics=["food"],
        license="CC BY-SA 4.0",
        attribution="Sample attribution",
        source_url="https://example.org",
    )
    manifest = json.loads(write_corpus([document], tmp_path).read_text(encoding="utf-8"))
    [entry] = manifest["documents"]
    assert entry["source_id"] == document.source_id
    assert entry["license"] == "CC BY-SA 4.0" and entry["file"] == "sample.txt"
    assert (tmp_path / "sample.txt").read_text(encoding="utf-8") == "Hello"
