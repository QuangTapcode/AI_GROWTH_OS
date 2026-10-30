"""Input Validator for Content Marketing Agent (CM-04).

Enforces preflight checks before calling LLMs:
(a) Article exists and belongs to the current workspace (Tenant isolation - TC-08)
(b) parent_version matches the current article version (Version lock - TC-06)
(c) Recomputes SEO Worker content_hash and verifies integrity (Tamper protection - TC-07)
(d) body_markdown is not empty
(e) Target channels are valid and within allowed distribution scope (TC-09)
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence
from uuid import UUID

from ..contracts import EvidenceRef
from ..seo.schemas import SeoArticle
from .seo_consumer import parse_seo_article


# Bộ kênh phân phối được hỗ trợ chính thức theo Spec v2.0
SUPPORTED_CHANNELS = frozenset({"facebook", "tiktok"})


@dataclass(frozen=True)
class ValidationErrorDetail:
    code: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)


class InputValidationError(Exception):
    """Lỗi chặn đầu vào trước khi thực thi AI pipeline."""

    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message
        self.details = details or {}


@dataclass
class ValidationResult:
    is_valid: bool
    errors: list[ValidationErrorDetail] = field(default_factory=list)
    article: SeoArticle | None = None

    def raise_if_invalid(self) -> None:
        """Ném ngoại lệ InputValidationError với lỗi đầu tiên nếu không hợp lệ."""
        if not self.is_valid and self.errors:
            err = self.errors[0]
            raise InputValidationError(err.code, err.message, err.details)


def compute_seo_artifact_hash(
    article: SeoArticle | Mapping[str, Any],
    evidence: Sequence[EvidenceRef | Mapping[str, Any]] = (),
) -> str:
    """Tính toán mã băm SHA-256 chuẩn hóa của bài viết SEO theo đúng thuật toán SEO Worker.

    Thuật toán kế thừa từ services/ai/src/app/main.py và services/ai/src/agents/contracts.py:
    digest = sha256(json.dumps({"result": result, "evidence": evidence}, sort_keys=True, ensure_ascii=False, separators=(',', ':')))
    """
    parsed_article = parse_seo_article(article)
    result_dict = parsed_article.model_dump(mode="json")
    ev_list = [e.model_dump(mode="json") for e in parsed_article.citations] if not evidence else [
        e.model_dump(mode="json") if hasattr(e, "model_dump") else dict(e) for e in evidence
    ]

    canonical_payload = {
        "result": result_dict,
        "evidence": ev_list,
    }

    canonical_json = json.dumps(
        canonical_payload,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":")
    )
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()



def validate_content_marketing_input(
    workspace_id: UUID | str,
    article_input: SeoArticle | Mapping[str, Any],
    parent_version: int,
    expected_content_hash: str | None = None,
    target_channels: Sequence[str] = ("facebook", "tiktok"),
    allowed_channels: Sequence[str] | None = None,
    evidence: Sequence[EvidenceRef | Mapping[str, Any]] = (),
) -> ValidationResult:
    """Hàm kiểm tra toàn diện đầu vào cho Agent Content Marketing.

    Quy tắc kiểm tra:
    (a) Tenant Scope: article.workspace_id == workspace_id (TC-08)
    (b) Version Lock: parent_version == article.version (TC-06)
    (c) Hash Verification: tính lại hash và so sánh với expected_content_hash (TC-07)
    (d) Body Content: body_markdown không được rỗng hoặc chỉ toàn khoảng trắng
    (e) Target Channels: các kênh yêu cầu phải nằm trong SUPPORTED_CHANNELS và allowed_channels (TC-09)
    """
    errors: list[ValidationErrorDetail] = []
    ws_str = str(workspace_id)

    # 1. Parse bài viết
    try:
        article = parse_seo_article(article_input)
    except Exception as exc:
        errors.append(
            ValidationErrorDetail(
                code="INVALID_SEO_ARTICLE",
                message=f"Bài viết đầu vào không hợp lệ: {exc}",
                details={"raw_error": str(exc)}
            )
        )
        return ValidationResult(is_valid=False, errors=errors, article=None)

    # 2. Kiểm tra (a): Đúng tenant (TC-08)
    art_ws = str(article.workspace_id)
    if art_ws != ws_str:
        errors.append(
            ValidationErrorDetail(
                code="TENANT_SCOPE_VIOLATION",
                message=f"Bài viết thuộc tenant '{art_ws}', từ chối truy cập từ workspace '{ws_str}'.",
                details={"article_workspace_id": art_ws, "request_workspace_id": ws_str}
            )
        )

    # 3. Kiểm tra (b): parent_version khớp version hiện tại của bài (TC-06)
    if parent_version != article.version:
        errors.append(
            ValidationErrorDetail(
                code="ARTIFACT_VERSION_MISMATCH",
                message=(
                    f"parent_version ({parent_version}) không khớp với phiên bản hiện tại "
                    f"của bài viết SEO ({article.version})."
                ),
                details={"parent_version": parent_version, "article_version": article.version}
            )
        )

    # 4. Kiểm tra (c): Tính lại content_hash và so sánh với expected_content_hash (TC-07)
    if expected_content_hash:
        computed_hash = compute_seo_artifact_hash(article, evidence=evidence)
        if computed_hash != expected_content_hash:
            errors.append(
                ValidationErrorDetail(
                    code="ARTIFACT_HASH_MISMATCH",
                    message="Mã băm nội dung bài viết không khớp, nội dung đã bị thay đổi ngầm sau khi duyệt.",
                    details={"expected_hash": expected_content_hash, "computed_hash": computed_hash}
                )
            )

    # 5. Kiểm tra (d): body_markdown không được rỗng
    if not article.body_markdown or not article.body_markdown.strip():
        errors.append(
            ValidationErrorDetail(
                code="EMPTY_BODY_MARKDOWN",
                message="Nội dung bài viết SEO (body_markdown) rỗng, không đủ dữ liệu để tái chế.",
                details={"article_id": str(article.article_id)}
            )
        )

    # 6. Kiểm tra (e): channels hợp lệ và nằm trong phạm vi cho phép (TC-09)
    if not target_channels:
        errors.append(
            ValidationErrorDetail(
                code="EMPTY_CHANNELS",
                message="Danh sách kênh phân phối mục tiêu không được để rỗng.",
                details={}
            )
        )
    else:
        for ch in target_channels:
            if ch not in SUPPORTED_CHANNELS:
                errors.append(
                    ValidationErrorDetail(
                        code="UNSUPPORTED_CHANNEL",
                        message=f"Kênh '{ch}' không được hệ thống hỗ trợ. Chỉ chấp nhận: {sorted(SUPPORTED_CHANNELS)}.",
                        details={"channel": ch}
                    )
                )
            if allowed_channels is not None and ch not in allowed_channels:
                errors.append(
                    ValidationErrorDetail(
                        code="INVALID_TARGET_CHANNEL",
                        message=f"Kênh '{ch}' không nằm trong danh sách kênh được cấp phép/chọn ({list(allowed_channels)}).",
                        details={"channel": ch, "allowed_channels": list(allowed_channels)}
                    )
                )

    is_valid = len(errors) == 0
    return ValidationResult(is_valid=is_valid, errors=errors, article=article)
