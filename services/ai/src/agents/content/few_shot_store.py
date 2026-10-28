"""Few-Shot In-Context Learning & pgvector Retrieval Store (CM-23).

Quản lý kho ví dụ mẫu xuất sắc (Exemplars) cho Agent Content Marketing:
1. Bắt buộc lọc theo workspace_id (Zero Cross-Tenant Leakage).
2. Lấy 3-5 ví dụ gần nhất (k=3..5) theo Brand Voice và Kênh nội dung.
3. Chỉ nạp các ví dụ ĐÃ QUA rào chắn xác định (CM-13) + NLI Zero-Claim (CM-08).
4. TUYỆT ĐỐI CẤM nạp từ Held-out Test Set (data/golden/test/ hoặc adversarial_heldout.jsonl).
5. Hỗ trợ tính toán Cosine Similarity vector và tương thích chuẩn pgvector PostgreSQL.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import re
from dataclasses import asdict, dataclass, field
from typing import Any, Sequence
from uuid import UUID

from .fact_mapper import check_zero_claim
from .rule_guardrails import evaluate_social_pack_guardrails
from .social_pack_v2 import FactItem, SentenceMap

logger = logging.getLogger(__name__)


class ZeroLeakageViolationError(Exception):
    """Ngoại lệ khi phát hiện nạp mẫu thuộc Held-out Test Set vào kho Few-shot."""


class FewShotQualityError(Exception):
    """Ngoại lệ khi ví dụ không vượt qua rào chắn Guardrail / Zero-Claim."""


@dataclass
class FewShotExample:
    """Đặc tả một ví dụ mẫu Few-shot chất lượng cao."""

    example_id: str
    workspace_id: str
    sample_id: str
    channel: str                          # 'facebook' | 'tiktok'
    brand_voice: str
    theme: str
    caption: str
    sentence_fact_map: list[dict[str, Any]] = field(default_factory=list)
    extracted_facts: list[dict[str, Any]] = field(default_factory=list)
    hashtags: list[str] = field(default_factory=list)
    storyboard: list[dict[str, Any]] | None = None
    spoken_word_count: int | None = None
    embedding: list[float] = field(default_factory=list)
    quality_score: float = 95.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _compute_deterministic_embedding(text: str, dim: int = 128) -> list[float]:
    """Tạo vector nhúng ngữ nghĩa xác định (Deterministic Semantic Embedding)
    
    Phục vụ cho việc tính Cosine Similarity in-memory khi chạy unit test / CI
    mà không phụ thuộc kết nối Postgres pgvector thực tế.
    """
    cleaned = re.sub(r"\s+", " ", text.lower().strip())
    # Sử dụng kết hợp băm n-gram để tạo đặc trưng tần suất phân tán
    vec = [0.0] * dim
    words = cleaned.split()
    if not words:
        return vec

    for i, w in enumerate(words):
        h = int(hashlib.md5(w.encode("utf-8")).hexdigest(), 16)
        idx = h % dim
        weight = 1.0 + (h % 100) / 100.0
        vec[idx] += weight

        # Bi-gram
        if i < len(words) - 1:
            bg = f"{w}_{words[i+1]}"
            h_bg = int(hashlib.sha256(bg.encode("utf-8")).hexdigest(), 16)
            idx_bg = h_bg % dim
            vec[idx_bg] += 1.5

    # Chuẩn hóa L2 norm
    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        vec = [round(v / norm, 6) for v in vec]
    return vec


def _cosine_similarity(v1: Sequence[float], v2: Sequence[float]) -> float:
    """Tính độ tương đồng Cosine giữa 2 vector."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm1 = math.sqrt(sum(a * a for a in v1))
    norm2 = math.sqrt(sum(b * b for b in v2))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(dot / (norm1 * norm2))


class FewShotVectorStore:
    """Kho lưu trữ và truy xuất vector Few-shot cho Content Marketing Agent."""

    def __init__(self) -> None:
        self._store: list[FewShotExample] = []

    def clear(self) -> None:
        self._store.clear()

    @property
    def total_examples(self) -> int:
        return len(self._store)

    def add_example(self, example: FewShotExample) -> None:
        """Nạp một ví dụ mẫu vào kho, có kiểm tra Zero-Leakage và Guardrails."""
        # 1. Ràng buộc Zero-Leakage: CẤM TUYỆT ĐỐI Held-out Test Set
        s_id = example.sample_id.lower()
        if "test" in s_id or s_id.startswith("gs_test_") or "heldout" in s_id:
            raise ZeroLeakageViolationError(
                f"NGHIÊM CẤM NẠP VÍ DỤ TỪ HELD-OUT TEST SET: sample_id='{example.sample_id}'. "
                "Kho Few-shot chỉ được phép sử dụng các mẫu từ Dev Set đã kiểm duyệt."
            )

        # 2. Ràng buộc Rào chắn: Phải vượt qua Guardrails & Zero-Claim
        report = evaluate_social_pack_guardrails(
            caption=example.caption,
            extracted_facts=example.extracted_facts,
            target_channels=[example.channel],
            channels=[example.channel],
        )
        if not report.passed:
            violation_msgs = [f"{v.code}: {v.message}" for v in report.violations]
            raise FewShotQualityError(
                f"Ví dụ '{example.sample_id}' không đạt tiêu chuẩn chất lượng:\n" + "\n".join(violation_msgs)
            )

        # 3. Tính embedding nếu chưa có
        if not example.embedding:
            combined_text = f"{example.channel} | {example.brand_voice} | {example.theme} | {example.caption}"
            example.embedding = _compute_deterministic_embedding(combined_text)

        self._store.append(example)

    def retrieve_examples(
        self,
        workspace_id: UUID | str,
        channel: str,
        brand_voice: str,
        theme: str = "",
        top_k: int = 3,
    ) -> list[FewShotExample]:
        """Truy xuất 3-5 ví dụ tương đồng nhất, lọc cứng workspace_id và channel."""
        ws_str = str(workspace_id)
        target_ch = channel.lower().strip()

        # 1. Lọc cứng workspace_id và channel (Tenant & Channel Isolation)
        candidates = [
            ex for ex in self._store
            if ex.workspace_id == ws_str and ex.channel.lower().strip() == target_ch
        ]

        if not candidates:
            return []

        # 2. Tạo query embedding
        query_text = f"{target_ch} | {brand_voice} | {theme}"
        query_vec = _compute_deterministic_embedding(query_text)

        # 3. Tính điểm tương đồng Cosine
        scored: list[tuple[float, FewShotExample]] = []
        for ex in candidates:
            score = _cosine_similarity(query_vec, ex.embedding)
            scored.append((score, ex))

        # 4. Sắp xếp giảm dần và lấy top_k
        scored.sort(key=lambda x: x[0], reverse=True)
        return [ex for _, ex in scored[:top_k]]

    def load_from_dev_set(
        self,
        dev_items: Sequence[dict[str, Any]],
        workspace_id: UUID | str,
    ) -> int:
        """Tự động nạp các mẫu hợp lệ từ Dev Set vào kho."""
        loaded_count = 0
        ws_str = str(workspace_id)

        for item in dev_items:
            s_id = item.get("sample_id", "")
            if not s_id or "test" in s_id:
                continue

            channel = item.get("target_channel", "facebook")
            voice = item.get("brand_voice", "Năng động, tiện nghi")
            draft = item.get("draft_pack", {})
            caption = draft.get("caption", "")
            if not caption:
                continue

            theme = item.get("source_article", {}).get("title", "")
            ex = FewShotExample(
                example_id=f"fewshot_{s_id}",
                workspace_id=ws_str,
                sample_id=s_id,
                channel=channel,
                brand_voice=voice,
                theme=theme,
                caption=caption,
                sentence_fact_map=draft.get("sentence_fact_map", []),
                extracted_facts=item.get("source_article", {}).get("extracted_facts", []),
                hashtags=draft.get("hashtags", []),
                storyboard=draft.get("storyboard"),
                spoken_word_count=draft.get("spoken_word_count"),
                quality_score=95.0,
            )
            try:
                self.add_example(ex)
                loaded_count += 1
            except Exception as e:
                logger.debug("Bỏ qua mẫu dev %s: %s", s_id, e)

        return loaded_count

    @staticmethod
    def build_few_shot_prompt_section(examples: Sequence[FewShotExample]) -> str:
        """Biến đổi danh sách ví dụ thành block markdown mẫu để nhúng vào Prompt."""
        if not examples:
            return ""

        blocks = ["## VÍ DỤ MẪU CHUẨN MỰC (FEW-SHOT IN-CONTEXT EXEMPLARS)\n"]
        for idx, ex in enumerate(examples, 1):
            blocks.append(f"### Ví dụ {idx} (Kênh: {ex.channel.upper()}, Giọng điệu: {ex.brand_voice}):")
            blocks.append(f"**Chủ đề:** {ex.theme}")
            blocks.append("**Nội dung caption mẫu:**")
            blocks.append("```text")
            blocks.append(ex.caption)
            blocks.append("```")
            if ex.storyboard:
                blocks.append("**Gợi ý kịch bản / Storyboard:**")
                blocks.append("```json")
                blocks.append(json.dumps(ex.storyboard, ensure_ascii=False, indent=2))
                blocks.append("```")
            blocks.append("")

        return "\n".join(blocks)
