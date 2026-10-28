"""Script tạo 50 bản nháp Seed Golden Set cho Agent Content Marketing (CM-20).

Phân bổ 50 bản nháp:
- 30 bản nháp vào data/golden/dev/ (dùng cho Dev Set)
- 20 bản nháp vào data/golden/test/ (dùng cho Held-out Test Set)

Từ 5 bài viết SEO mẫu của TripC Da Nang kết hợp đa kênh (Facebook, TikTok)
và các phong cách thương hiệu khác nhau.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any

# Thêm services/ai vào sys.path để import các module nghiệp vụ
ROOT_DIR = Path(__file__).resolve().parents[1]
SERVICES_AI_DIR = ROOT_DIR / "services" / "ai"
if str(SERVICES_AI_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICES_AI_DIR))

from src.agents.content.fb_repurposer import generate_deterministic_facebook_post
from src.agents.content.tiktok_repurposer import (
    count_script_words,
    generate_deterministic_tiktok_script,
)
from src.agents.content.social_pack_v2 import FactItem
from tests.fixtures.sample_articles import SAMPLE_ARTICLES

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("make_seed_drafts")


BRAND_VOICES = [
    "Hiện đại, tự do, chuyên nghiệp và truyền cảm hứng digital nomad",
    "Năng động, tiện nghi, linh hoạt và gần gũi với giới trẻ",
    "Thư thái, an nhiên, hòa mình cùng thiên nhiên và biển cả",
    "Sôi nổi, hào hứng, kích thích tinh thần khám phá địa phương",
    "Chuẩn mực, tinh tế, sang trọng và chú trọng chiều sâu trải nghiệm",
]

CALL_TO_ACTIONS = [
    "Liên hệ Fanpage để đặt lịch xem phòng thực tế.",
    "Tải app TripC ngay hôm nay để nhận tư vấn không gian làm việc.",
    "Nhắn tin cho TripC để nhận thông tin chi tiết về căn hộ.",
    "Truy cập website tripc.vn để tìm kiếm không gian lưu trú lý tưởng.",
    "Gọi ngay hotline TripC để được hỗ trợ kiểm tra tình trạng phòng.",
]


def create_seed_item(
    sample_id: str,
    dataset_split: str,
    article_fixture: Any,
    channel: str,
    brand_voice: str,
    verbatim_cta: str,
) -> dict[str, Any]:
    """Tạo một bản ghi Seed Draft hoàn chỉnh chuẩn schema Golden Set."""
    # Chuyển đổi ground_truth_facts sang FactItem
    facts = [
        FactItem(
            fact_id=f"f{idx+1:02d}",
            text=gt.assertion,
            source_type="seo_body",
        )
        for idx, gt in enumerate(article_fixture.ground_truth_facts)
    ]

    if channel == "facebook":
        draft_res = generate_deterministic_facebook_post(
            title=article_fixture.title,
            facts=facts,
            brand_voice=brand_voice,
            verbatim_cta=verbatim_cta,
        )
        caption = draft_res["caption"]
        sentence_map = draft_res["explicit_mappings"]
        hashtags = [
            f"#{article_fixture.primary_keyword.replace(' ', '').title()}",
            "#TripCDaNang",
            "#KhongGianSong",
            "#DigitalNomad",
        ]
        storyboard = None
        spoken_words = None
    else:  # tiktok
        draft_res = generate_deterministic_tiktok_script(
            title=article_fixture.title,
            facts=facts,
            brand_voice=brand_voice,
            verbatim_cta=verbatim_cta,
        )
        caption = draft_res["caption"]
        sentence_map = draft_res["explicit_mappings"]
        hashtags = ["#TripCDaNang", "#DuLichDaNang", "#TikTokTravel", "#Workation"]
        storyboard = draft_res["storyboard"]
        spoken_words = draft_res["spoken_word_count"]

    item = {
        "sample_id": sample_id,
        "dataset_split": dataset_split,
        "workspace_id": "00000000-0000-4000-8000-000000000001",
        "source_article": {
            "article_id": article_fixture.article_id,
            "title": article_fixture.title,
            "primary_keyword": article_fixture.primary_keyword,
            "body_markdown": article_fixture.body_markdown,
            "extracted_facts": [f.model_dump() for f in facts],
            "has_injection": getattr(article_fixture, "has_injection", False),
        },
        "target_channel": channel,
        "brand_voice": brand_voice,
        "verbatim_cta": verbatim_cta,
        "draft_pack": {
            "caption": caption,
            "sentence_fact_map": sentence_map,
            "hashtags": hashtags,
            "storyboard": storyboard,
            "spoken_word_count": spoken_words,
        },
        "annotation": {
            "annotator_a": {
                "annotator_name": "Chuyên viên A",
                "status": None,  # "PASS" hoặc "FAIL"
                "edited_caption": "",
                "edited_sentence_fact_map": [],
                "violations_found": [],
                "notes": "",
            },
            "annotator_b": {
                "annotator_name": "Chuyên viên B",
                "status": None,
                "edited_caption": "",
                "edited_sentence_fact_map": [],
                "violations_found": [],
                "notes": "",
            },
            "adjudication": {
                "final_decision": None,
                "notes": "",
            },
        },
    }
    return item


def generate_all_drafts() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Sinh toàn bộ 30 mẫu dev và 20 mẫu test."""
    dev_drafts: list[dict[str, Any]] = []
    test_drafts: list[dict[str, Any]] = []

    # 1. Sinh 30 mẫu Dev Set (gs_dev_001 -> gs_dev_030)
    # 5 bài viết x 6 biến thể = 30 mẫu (15 Facebook, 15 TikTok)
    dev_idx = 1
    for article in SAMPLE_ARTICLES:
        for var_idx in range(6):
            channel = "facebook" if var_idx % 2 == 0 else "tiktok"
            voice = BRAND_VOICES[(dev_idx + var_idx) % len(BRAND_VOICES)]
            cta = CALL_TO_ACTIONS[(dev_idx + var_idx) % len(CALL_TO_ACTIONS)]
            sample_id = f"gs_dev_{dev_idx:03d}"
            item = create_seed_item(
                sample_id=sample_id,
                dataset_split="dev",
                article_fixture=article,
                channel=channel,
                brand_voice=voice,
                verbatim_cta=cta,
            )
            dev_drafts.append(item)
            dev_idx += 1

    # 2. Sinh 20 mẫu Held-out Test Set (gs_test_001 -> gs_test_020)
    # 5 bài viết x 4 biến thể = 20 mẫu (10 Facebook, 10 TikTok)
    test_idx = 1
    for article in SAMPLE_ARTICLES:
        for var_idx in range(4):
            channel = "facebook" if var_idx % 2 == 0 else "tiktok"
            voice = BRAND_VOICES[(test_idx * 2 + var_idx) % len(BRAND_VOICES)]
            cta = CALL_TO_ACTIONS[(test_idx * 2 + var_idx) % len(CALL_TO_ACTIONS)]
            sample_id = f"gs_test_{test_idx:03d}"
            item = create_seed_item(
                sample_id=sample_id,
                dataset_split="test",
                article_fixture=article,
                channel=channel,
                brand_voice=voice,
                verbatim_cta=cta,
            )
            test_drafts.append(item)
            test_idx += 1

    return dev_drafts, test_drafts


def save_drafts() -> None:
    """Lưu trữ dữ liệu vào data/golden/dev và data/golden/test."""
    dev_dir = ROOT_DIR / "data" / "golden" / "dev"
    test_dir = ROOT_DIR / "data" / "golden" / "test"

    dev_dir.mkdir(parents=True, exist_ok=True)
    test_dir.mkdir(parents=True, exist_ok=True)

    dev_drafts, test_drafts = generate_all_drafts()

    # Lưu file gộp cho dev
    dev_all_file = dev_dir / "dev_seed_drafts.json"
    with open(dev_all_file, "w", encoding="utf-8") as f:
        json.dump(dev_drafts, f, ensure_ascii=False, indent=2)
    logger.info("Đã ghi %d mẫu vào %s", len(dev_drafts), dev_all_file)

    # Lưu từng file đơn lẻ cho dev
    for d in dev_drafts:
        single_file = dev_dir / f"{d['sample_id']}.json"
        with open(single_file, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)

    # Lưu file gộp cho test
    test_all_file = test_dir / "test_seed_drafts.json"
    with open(test_all_file, "w", encoding="utf-8") as f:
        json.dump(test_drafts, f, ensure_ascii=False, indent=2)
    logger.info("Đã ghi %d mẫu vào %s", len(test_drafts), test_all_file)

    # Lưu từng file đơn lẻ cho test
    for d in test_drafts:
        single_file = test_dir / f"{d['sample_id']}.json"
        with open(single_file, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)

    logger.info("Hoàn tất tạo 50 bản nháp Seed Golden Set: 30 Dev + 20 Test.")


if __name__ == "__main__":
    save_drafts()
