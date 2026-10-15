"""2025 Da Nang ward aliases used for retrieval query expansion."""

from __future__ import annotations

import json

from src.rag.places import DATA_PATH, fold, place_notes


def test_fold_removes_vietnamese_diacritics() -> None:
    assert fold("Ngũ Hành Sơn") == "ngu hanh son"
    assert fold("Điện Bàn Đông") == "dien ban dong"


def test_table_has_23_wards_with_former_units() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    assert len(data["wards"]) == 23
    assert all(ward["former_units"] for ward in data["wards"])
    an_hai = next(ward for ward in data["wards"] if ward["ward"] == "An Hải")
    assert an_hai["former_units"] == ["Phước Mỹ", "An Hải Bắc", "An Hải Nam"]


def test_old_district_and_new_ward_notes() -> None:
    notes = place_notes("Apartments in Son Tra district?")
    assert notes[0].startswith("former Sơn Trà district")
    assert "An Hải" in notes[0]
    assert any("Phước Mỹ" in note for note in place_notes("Is My Khe beach in An Hai?"))
    assert place_notes("former My An ward") == ["former Mỹ An is now part of Ngũ Hành Sơn ward"]


def test_no_notes_without_place_names() -> None:
    assert place_notes("What is the monthly rent?") == []
