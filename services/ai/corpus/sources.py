"""One builder per licensed source. Each returns ready-to-ingest Documents.

Licences (checked 2026-10-06, see docs/coordination/SOURCES.md):
- Wikivoyage: CC BY-SA 4.0 (attribution + share-alike for adapted text).
- GOV.UK FCDO travel advice: Open Government Licence v3.0.
- OpenStreetMap: ODbL 1.0; the cards form a derivative database kept separate from TripC facts.
- Resolution 1659/NQ-UBTVQH15: legal text, not protected by copyright (IP Law Art. 15).
"""

from __future__ import annotations

import json
import re
import time
import unicodedata

from src.rag.parsing import parse_html
from src.rag.places import DATA_PATH, fold

from .common import Document, client, redact_prices


def _section_text(html: str, url: str) -> str:
    segments, _ = parse_html(html, url)
    return "\n\n".join(segment.text for segment in segments)


# --- Wikivoyage ---------------------------------------------------------------------------

WIKIVOYAGE_PAGE = "Da_Nang"


def wikivoyage() -> list[Document]:
    api = "https://en.wikivoyage.org/w/api.php"
    with client() as http:
        meta = http.get(
            api,
            params={"action": "query", "prop": "revisions", "rvprop": "ids|timestamp", "titles": WIKIVOYAGE_PAGE, "format": "json"},
        ).json()
        revision = next(iter(meta["query"]["pages"].values()))["revisions"][0]
        html = http.get(f"https://en.wikivoyage.org/api/rest_v1/page/html/{WIKIVOYAGE_PAGE}").text

    url = f"https://en.wikivoyage.org/wiki/{WIKIVOYAGE_PAGE}"
    text = _section_text(html, url)
    # Drop the listing-editor chrome Parsoid renders around each listing.
    text = re.sub(r"\n\n(edit|Edit)\n\n", "\n\n", text)
    text, removed = redact_prices(text)
    header = (
        "Wikivoyage travel guide: Da Nang (English). Place names in this guide may predate the "
        "1 July 2025 reorganisation that abolished Da Nang's districts. Prices were removed; "
        "listed hours and contact details are third-party and unverified."
    )
    return [
        Document(
            doc_id="wikivoyage-da-nang",
            title="Wikivoyage: Da Nang",
            text=f"{header}\n\n{text}",
            topics=["living_areas", "food", "transport", "safety", "events"],
            license="CC BY-SA 4.0",
            attribution=f'"Da Nang" by Wikivoyage contributors, revision {revision["revid"]}, CC BY-SA 4.0, {url}',
            source_url=url,
            upstream_version=str(revision["revid"]),
            notes=[f"edited {revision['timestamp']}", f"{removed} price mentions removed"],
        )
    ]


# --- GOV.UK FCDO travel advice ------------------------------------------------------------

GOVUK_PATH = "foreign-travel-advice/vietnam"


def govuk_vietnam() -> list[Document]:
    with client() as http:
        data = http.get(f"https://www.gov.uk/api/content/{GOVUK_PATH}").json()
    documents = []
    for part in data["details"]["parts"]:
        url = f"https://www.gov.uk/{GOVUK_PATH}/{part['slug']}"
        body = _section_text(part["body"], url)
        documents.append(
            Document(
                doc_id=f"govuk-vietnam-{part['slug']}",
                title=f"UK FCDO travel advice for British nationals, Vietnam: {part['title']}",
                # FCDO advice is written for British nationals; entry rules differ by nationality.
                text=(
                    f"UK government travel advice for Vietnam, section: {part['title']}. This advice is written "
                    "for British nationals; visa and entry rules differ by nationality, so other nationalities "
                    "must check the official Vietnam e-visa portal (evisa.gov.vn) or a Vietnamese embassy.\n\n"
                    f"{body}"
                ),
                topics=["practical_living", "visa", "safety", "health"],
                license="OGL-UK-3.0",
                attribution=(
                    "Contains public sector information licensed under the Open Government Licence v3.0. "
                    f"Source: FCDO, {url}"
                ),
                source_url=url,
                upstream_version=data.get("public_updated_at"),
                notes=[f"public_updated_at {data.get('public_updated_at')}"],
            )
        )
    return documents


# --- OpenStreetMap POIs -------------------------------------------------------------------

DA_NANG_AREA = 3600000000 + 1891418  # OSM relation 1891418, already the merged post-2025 city
OVERPASS_ENDPOINTS = ("https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter")
CATEGORIES = {
    "gyms": ("gym / fitness centre", ['nwr(area.w)["leisure"="fitness_centre"];']),
    "coworking": ("coworking space", ['nwr(area.w)["amenity"="coworking_space"];', 'nwr(area.w)["office"="coworking"];']),
    "markets": ("market", ['nwr(area.w)["amenity"="marketplace"];']),
    "healthcare": ("hospital or clinic", ['nwr(area.w)["amenity"~"^(hospital|clinic)$"];']),
}


def _poi_query() -> str:
    selectors = "\n  ".join(selector.replace("area.w", "area.dn") for _, items in CATEGORIES.values() for selector in items)
    return f"""[out:json][timeout:120];
area(id:{DA_NANG_AREA})->.dn;
(
  {selectors}
);
out center tags;"""


WARD_QUERY = f"""[out:json][timeout:120];
area(id:{DA_NANG_AREA})->.dn;
rel(area.dn)["boundary"="administrative"]["admin_level"="6"]["name"~"^Phường "];
out geom;"""


def _overpass(http, query: str) -> dict:
    """A couple of small requests with backoff; the public instances are often busy."""

    last_error: Exception | None = None
    for attempt in range(3):
        for endpoint in OVERPASS_ENDPOINTS:
            try:
                response = http.post(endpoint, data={"data": query})
                response.raise_for_status()
                return response.json()
            except Exception as exc:  # noqa: BLE001 - try the next instance / attempt
                last_error = exc
        time.sleep(20 * (attempt + 1))
    raise RuntimeError(f"Overpass unavailable: {last_error}")


def _ward_segments(data: dict) -> list[tuple[str, list[tuple[float, float, float, float]]]]:
    wards = []
    for relation in data.get("elements", []):
        name = relation.get("tags", {}).get("name", "").removeprefix("Phường ").strip()
        segments = []
        for member in relation.get("members", []):
            points = member.get("geometry") or []
            segments.extend(
                (a["lon"], a["lat"], b["lon"], b["lat"]) for a, b in zip(points, points[1:])
            )
        if name and segments:
            wards.append((name, segments))
    return wards


def _inside(lon: float, lat: float, segments: list[tuple[float, float, float, float]]) -> bool:
    """Even-odd ray casting over all member segments (outer and inner rings alike)."""

    inside = False
    for x1, y1, x2, y2 in segments:
        if (y1 > lat) != (y2 > lat):
            if lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
                inside = not inside
    return inside


def _category_of(tags: dict) -> str | None:
    if tags.get("leisure") == "fitness_centre":
        return "gyms"
    if tags.get("amenity") == "coworking_space" or tags.get("office") == "coworking":
        return "coworking"
    if tags.get("amenity") == "marketplace":
        return "markets"
    if tags.get("amenity") in {"hospital", "clinic"}:
        return "healthcare"
    return None


def _ascii(name: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", name.replace("đ", "d").replace("Đ", "D")) if not unicodedata.combining(c))


def _card(element: dict, ward: str, label: str, osm_base: str) -> str | None:
    tags = element.get("tags", {})
    name = tags.get("name:en") or tags.get("name")
    if not name:
        return None
    local = tags.get("name")
    display = f"{name} ({local})" if local and local != name else name
    ward_en = _ascii(ward)
    lines = [f"{display} is listed in OpenStreetMap as a {label} in {ward} ward ({ward_en} ward, 2025 boundaries)."]
    address = ", ".join(
        tags[key] for key in ("addr:housenumber", "addr:street", "addr:full") if tags.get(key)
    )
    if address:
        lines.append(f"Address as tagged by OSM contributors (may use pre-July-2025 names): {address}.")
    if tags.get("website") or tags.get("contact:website"):
        lines.append(f"Website listed by contributors: {tags.get('website') or tags.get('contact:website')}.")
    center = element.get("center") or {"lat": element.get("lat"), "lon": element.get("lon")}
    if center.get("lat") is not None:
        lines.append(f"Map location: {center['lat']:.5f}, {center['lon']:.5f}.")
    # Opening hours and phone numbers are deliberately omitted: third-party, often stale.
    lines.append(f"Source: OpenStreetMap {element['type']}/{element['id']}, data as of {osm_base}.")
    return " ".join(lines)


def osm_pois() -> list[Document]:
    with client() as http:
        pois = _overpass(http, _poi_query())
        wards = _ward_segments(_overpass(http, WARD_QUERY))
    osm_base = pois.get("osm3s", {}).get("timestamp_osm_base", "unknown")

    cards: dict[str, list[tuple[str, str]]] = {key: [] for key in CATEGORIES}
    outside_wards = 0
    for element in pois.get("elements", []):
        category = _category_of(element.get("tags", {}))
        center = element.get("center") or {"lat": element.get("lat"), "lon": element.get("lon")}
        if category is None or center.get("lat") is None:
            continue
        ward = next((name for name, segments in wards if _inside(center["lon"], center["lat"], segments)), None)
        if ward is None:
            # Communes (xa) and the special zone are outside the expat-focused ward set.
            outside_wards += 1
            continue
        card = _card(element, ward, CATEGORIES[category][0], osm_base)
        if card:
            cards[category].append((ward, card))

    documents = []
    for category, items in cards.items():
        if not items:
            continue
        label = CATEGORIES[category][0]
        header = (
            f"OpenStreetMap listings of {label} places in Da Nang wards (2025 boundaries). "
            "These are community-mapped records: names, addresses and websites are third-party and unverified, "
            "and opening hours, prices and phone numbers are intentionally not included."
        )
        # Group by ward with a heading paragraph so one chunk answers "which ... in <ward>".
        paragraphs = [header]
        current_ward = None
        for ward, card in sorted(items):
            if ward != current_ward:
                count = sum(1 for item_ward, _ in items if item_ward == ward)
                paragraphs.append(f"{label.capitalize()} listings in {ward} ward ({_ascii(ward)} ward): {count} place(s).")
                current_ward = ward
            paragraphs.append(card)
        documents.append(
            Document(
                doc_id=f"osm-da-nang-{category}",
                title=f"OpenStreetMap: {label} in Da Nang",
                text="\n\n".join(paragraphs),
                topics=[{"gyms": "gym", "coworking": "coworking", "markets": "food", "healthcare": "practical_living"}[category]],
                license="ODbL-1.0",
                attribution="© OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright",
                source_url="https://www.openstreetmap.org/relation/1891418",
                upstream_version=osm_base,
                notes=[f"{len(items)} named places", f"{outside_wards} POIs outside wards skipped", "derivative database: keep separate from TripC facts"],
            )
        )
    return documents


# --- 2025 ward reorganisation -------------------------------------------------------------


def ward_reorganisation() -> list[Document]:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    paragraphs = [
        "Da Nang administrative reorganisation, effective 1 July 2025. Quang Nam province was merged into "
        "Da Nang city and the district level was abolished. Da Nang now has 94 commune-level units: "
        "23 wards (phường), 70 communes (xã) and 1 special zone. The wards below are listed with the former "
        f"wards and communes merged into them, per {data['legal_basis']}."
    ]
    for ward in data["wards"]:
        former = ", ".join(ward["former_units"])
        paragraphs.append(
            f"{ward['ward']} ward ({ward['ward_en']} ward) was formed from the former units {former} "
            f"(Article 1, clause {ward['clause']})."
        )
    for district, wards in data["former_districts"].items():
        paragraphs.append(
            f"Search hint, not legal text: most of the former {district} district ({fold(district).title()} district) "
            f"now lies in {', '.join(wards)} ward(s)."
        )
    for landmark, wards in data["landmarks"].items():
        paragraphs.append(f"Search hint, not legal text: {landmark} lies in {', '.join(wards)} ward(s).")
    return [
        Document(
            doc_id="danang-wards-2025",
            title="Da Nang wards after the 2025 reorganisation",
            text="\n\n".join(paragraphs),
            topics=["living_areas"],
            license="public-legal-text",
            attribution="Compiled by TripC from Resolution 1659/NQ-UBTVQH15 (not copyright-protected, IP Law Art. 15)",
            source_url=data["checked_against"][0],
            upstream_version="1659/NQ-UBTVQH15",
            notes=["district and landmark hints need BA confirmation before display"],
        )
    ]


BUILDERS = {
    "wikivoyage": wikivoyage,
    "govuk": govuk_vietnam,
    "osm": osm_pois,
    "wards": ward_reorganisation,
}
