"""Sentence-Fact Mapper & NLI Verification Engine (CM-08).

Implements Section 6 and Section 15.4 of 'Ke_hoach_Agent_Content_Marketing_v2.docx':
1. Vietnamese sentence splitting handling:
   - Currency/decimal dots (e.g. 8.500.000, 2.5km)
   - Abbreviations (e.g. TP., Tp., v.v., đ/tháng)
   - Emoji and social media punctuation
   - Linebreaks and multi-paragraph captions
2. Classification of sentence_type: 'factual' / 'hook' / 'cta'.
3. Zero-Claim Rule verification for hook/cta:
   - Prohibits numbers, prices, percentages, absolute claims, foreign entity names.
   - Enforces verbatim CTA from request.
4. Entailment verification for factual sentences:
   - 'supported': Grounded completely in linked facts.
   - 'partial': Subjective puffery / expansion:
     * Degree adjectives ('cao cấp', 'hiện đại', 'sang trọng', 'đẳng cấp'...)
     * Scope expansion ('toàn bộ', 'tất cả mọi...', 'toàn thành phố'...)
     * Result inference ('luôn thông suốt', 'chắc chắn hài lòng'...)
     * Temporal addition ('mỗi ngày', 'vĩnh viễn', '24/7 mọi lúc'...)
   - 'unsupported': Numeric mismatch, contradiction, or fabricated claims.
"""

from __future__ import annotations

import difflib
import re
from typing import Any, Mapping, Sequence
from uuid import UUID

from .social_pack_v2 import EntailmentStatusType, FactItem, SentenceMap, SentenceType


# ============================================================================
# CÁC TỪ KHÓA ĐẶC BIỆT CHO NLI VÀ ZERO-CLAIM
# ============================================================================

DEGREE_ADJECTIVES: tuple[str, ...] = (
    "cao cấp",
    "hiện đại",
    "sang trọng",
    "đẳng cấp",
    "xa hoa",
    "bậc nhất",
    "hàng đầu",
    "tuyệt hảo",
    "siêu đẹp",
    "thời thượng",
    "đỉnh cao",
    "hoàn hảo",
)

SCOPE_EXPANSION_WORDS: tuple[str, ...] = (
    "toàn bộ",
    "tất cả mọi",
    "tất cả các",
    "tất cả",
    "mọi phòng",
    "mọi căn hộ",
    "toàn thành phố",
    "bất kỳ ai",
    "toàn diện",
    "không giới hạn",
)

RESULT_INFERENCE_PHRASES: tuple[str, ...] = (
    "luôn thông suốt",
    "chắc chắn hài lòng",
    "không bao giờ gián đoạn",
    "tăng gấp đôi năng suất",
    "đem lại trải nghiệm hoàn hảo",
    "chắc chắn làm hài lòng",
    "không lo nghẽn mạng",
)

TEMPORAL_ADDITIONS: tuple[str, ...] = (
    "mỗi ngày",
    "hàng ngày",
    "suốt ngày đêm",
    "24/7 mọi lúc",
    "vĩnh viễn",
    "trọn đời",
    "bất kể lúc nào",
)

ABSOLUTE_SUPERLATIVES: tuple[str, ...] = (
    "nhất",
    "duy nhất",
    "100%",
    "tuyệt đối",
    "rẻ nhất",
    "tốt nhất",
    "số 1",
    "hoàn hảo nhất",
    "bảo đảm",
    "cam kết 100%",
)

PRICE_OR_NUMBER_PATTERNS: tuple[str, ...] = (
    r"\d+",
    r"%",
    r"vnđ",
    r"vnd",
    r"đồng",
    r"triệu",
    r"usd",
    r"tr/tháng",
    r"k/tháng",
)


# ============================================================================
# 1. BỘ TÁCH CÂU TIẾNG VIỆT (VIETNAMESE SENTENCE SPLITTER)
# ============================================================================

def split_vietnamese_sentences(text: str) -> list[str]:
    """Tách câu tiếng Việt chuẩn hóa cho nội dung mạng xã hội:
    
    - Bảo toàn số có dấu chấm phân cách hàng nghìn / thập phân (8.500.000, 2.5km).
    - Bảo toàn các từ viết tắt phổ biến (Tp., TP., v.v., đ/tháng).
    - Bảo toàn emoji và ngắt câu theo dấu ?, !, ., ..., xuống dòng.
    """
    if not text or not text.strip():
        return []

    s = text.strip()

    # 1. Bảo vệ số thập phân và phân cách hàng nghìn: ví dụ 8.500.000 -> 8__DOT__500__DOT__000
    def protect_number_dots(m: re.Match[str]) -> str:
        return m.group(1) + "__NUMDOT__" + m.group(2)

    # Chạy lặp để bắt chuỗi số dài như 8.500.000
    while re.search(r"(\d)\.(\d)", s):
        s = re.sub(r"(\d)\.(\d)", protect_number_dots, s)

    # 2. Bảo vệ các từ viết tắt phổ biến
    abbr_patterns = [
        (r"\b([Tt][Pp])\.", r"\1__ABBRDOT__"),
        (r"\b([Tt]h[Ss])\.", r"\1__ABBRDOT__"),
        (r"\b([Tt][Ss])\.", r"\1__ABBRDOT__"),
        (r"\b([Bb][Ss])\.", r"\1__ABBRDOT__"),
        (r"\bv\.v\.", r"v__ABBRDOT__v__ABBRDOT__"),
        (r"\be\.g\.", r"e__ABBRDOT__g__ABBRDOT__"),
        (r"\bi\.e\.", r"i__ABBRDOT__e__ABBRDOT__"),
    ]
    for pat, rep in abbr_patterns:
        s = re.sub(pat, rep, s, flags=re.IGNORECASE)

    # 3. Bảo vệ dấu 3 chấm (...) và (…)
    s = s.replace("...", "__ELLIPSIS__").replace("…", "__ELLIPSIS__")

    # 4. Tách câu theo dấu kết thúc (. ? !) kèm khoảng trắng, hoặc xuống dòng kép \n+
    parts = re.split(r"(?<=[.?!])\s+|\n+", s)

    raw_sentences: list[str] = []
    for p in parts:
        clean = (
            p.replace("__NUMDOT__", ".")
            .replace("__ABBRDOT__", ".")
            .replace("__ELLIPSIS__", "...")
            .strip()
        )
        if clean:
            raw_sentences.append(clean)

    # Gộp các phân đoạn chỉ chứa emoji hoặc ký tự đặc biệt (không chứa chữ/số) vào câu đứng trước
    merged_sentences: list[str] = []
    for sent in raw_sentences:
        clean_no_tags = re.sub(r"#\w+", "", sent).strip()
        is_pure_non_claim = not re.search(r"[\w]", sent) or not clean_no_tags
        if is_pure_non_claim and merged_sentences:
            merged_sentences[-1] = f"{merged_sentences[-1]} {sent}".strip()
        else:
            merged_sentences.append(sent)

    # Chuyển các emoji đứng đầu câu sau dấu ngắt câu về cuối câu trước
    # Ví dụ: "TripC! 🌊 Căn hộ..." -> Câu 1: "TripC! 🌊", Câu 2: "Căn hộ..."
    sentences: list[str] = []
    for s in merged_sentences:
        m = re.match(r"^([^\w\s]+)\s+(.+)$", s)
        if m and sentences:
            emoji_prefix = m.group(1)
            rest = m.group(2)
            sentences[-1] = f"{sentences[-1]} {emoji_prefix}".strip()
            sentences.append(rest)
        else:
            sentences.append(s)

    return sentences


# ============================================================================
# 2. PHÂN LOẠI SENTENCE TYPE
# ============================================================================

def classify_sentence_type(
    sentence: str,
    index: int,
    total_sentences: int,
    expected_cta: str | None = None,
) -> SentenceType:
    """Phân loại sentence_type: 'hook', 'cta', hoặc 'factual'."""
    clean = sentence.strip().lower()

    # 1. Kiểm tra CTA (Ưu tiên khớp CTA chỉ định hoặc câu hành động cuối bài)
    if expected_cta:
        exp_clean = expected_cta.strip().lower()
        if clean == exp_clean or exp_clean in clean:
            return "cta"

    cta_action_keywords = (
        "liên hệ",
        "nhắn tin",
        "đặt phòng",
        "đặt lịch",
        "inbox",
        "gọi ngay",
        "đăng ký",
        "xem phòng",
        "truy cập",
        "book ngay",
        "fanpage",
    )
    # Nếu là câu cuối bài hoặc chứa cụm từ kêu gọi hành động rõ ràng
    if any(k in clean for k in cta_action_keywords):
        if index >= max(0, total_sentences - 2):
            return "cta"

    # 2. Kiểm tra Hook (Thường là câu mở đầu hoặc câu hỏi kích thích tương tác)
    hook_opening_phrases = (
        "bạn đang tìm kiếm",
        "bạn có biết",
        "khám phá ngay",
        "đừng bỏ lỡ",
        "có bao giờ bạn",
        "lý do vì sao",
        "điểm hẹn lý tưởng",
    )
    if index == 0:
        if clean.endswith("?") or any(phrase in clean for phrase in hook_opening_phrases):
            return "hook"
        # Câu mở đầu không chứa số liệu cụ thể cũng là hook
        if not re.search(r"\d+", clean):
            return "hook"

    if clean.endswith("?") and index == 0:
        return "hook"

    # 3. Mặc định các câu mang thông tin sản phẩm là factual
    return "factual"


# ============================================================================
# 3. LUẬT ZERO-CLAIM CHO HOOK & CTA
# ============================================================================

def check_zero_claim(
    sentence: str,
    sentence_type: SentenceType,
    expected_cta: str | None = None,
) -> tuple[bool, list[str]]:
    """Kiểm tra tuân thủ luật Zero-Claim cho câu Hook và CTA:
    
    Quy tắc:
    - Không được chứa số liệu cụ thể, giá tiền, tỷ lệ %.
    - Không được chứa từ tuyệt đối ('nhất', 'duy nhất', '100%', 'tuyệt đối', 'rẻ nhất'...).
    - CTA phải lấy nguyên văn từ request (nếu có cung cấp expected_cta).
    """
    if sentence_type not in ("hook", "cta"):
        return True, []

    violations: list[str] = []
    clean = sentence.strip().lower()

    # Kiểm tra số và giá tiền (Bỏ qua số điện thoại hotline và URL trong CTA)
    text_to_check = clean
    if sentence_type == "cta":
        text_to_check = re.sub(r"https?://\S+", "", text_to_check)
        text_to_check = re.sub(r"\b0\d{1,4}[.\s-]?\d{3,4}[.\s-]?\d{3,4}\b", "", text_to_check)

    if re.search(r"\d+", text_to_check):
        violations.append(f"Câu {sentence_type} vi phạm Zero-Claim: chứa số liệu cụ thể.")
    if "%" in clean or "phần trăm" in clean:
        violations.append(f"Câu {sentence_type} vi phạm Zero-Claim: chứa tỷ lệ phần trăm.")
    for p_pat in ("vnđ", "vnd", "usd", "đồng", "triệu"):
        if p_pat in clean:
            violations.append(f"Câu {sentence_type} vi phạm Zero-Claim: chứa thông tin giá tiền ('{p_pat}').")

    # Kiểm tra từ tuyệt đối
    for sup in ABSOLUTE_SUPERLATIVES:
        pattern = r"(?<!\w)" + re.escape(sup) + r"(?!\w)"
        if re.search(pattern, clean):
            violations.append(f"Câu {sentence_type} vi phạm Zero-Claim: chứa từ tuyệt đối/cam kết ('{sup}').")

    # Kiểm tra CTA nguyên văn
    if sentence_type == "cta" and expected_cta:
        if clean != expected_cta.strip().lower():
            violations.append("CTA không khớp nguyên văn với CTA được cung cấp trong yêu cầu.")

    is_compliant = len(violations) == 0
    return is_compliant, violations


# ============================================================================
# 4. BỘ KIỂM TRA ENTAILMENT CHO CÂU FACTUAL
# ============================================================================

def check_factual_entailment(
    sentence: str,
    linked_fact_ids: list[str] | Any,
    facts_map: Mapping[str, Any],
) -> tuple[EntailmentStatusType, list[str]]:
    """Kiểm tra tính suy diễn logic (Entailment) của câu factual so với facts được liên kết:
    
    - 'supported': Được hậu thuẫn đầy đủ, con số, thuộc tính và nội dung hoàn toàn khớp.
    - 'partial': Thổi phồng tính từ mức độ, mở rộng phạm vi, thêm kết quả hoặc thêm thời gian.
    - 'unsupported': Mâu thuẫn số liệu, bịa đặt thuộc tính, hoặc gắn fact_id không tồn tại.
    """
    # 1. Kiểm tra tính hợp lệ của fact_id
    if not isinstance(linked_fact_ids, (list, tuple)) or len(linked_fact_ids) == 0:
        return "unsupported", ["Câu factual bắt buộc phải liên kết ít nhất 1 fact_id hợp lệ."]

    combined_facts_list: list[str] = []
    for fid in linked_fact_ids:
        if fid not in facts_map:
            return "unsupported", [f"fact_id '{fid}' không tồn tại trong danh sách sự thật."]
        fact_obj = facts_map[fid]
        fact_text = getattr(fact_obj, "text", "") if hasattr(fact_obj, "text") else str(fact_obj.get("text", ""))
        combined_facts_list.append(fact_text)

    combined_facts = " ".join(combined_facts_list).lower()
    sent_clean = sentence.strip().lower()

    # --------------------------------------------------------------------------
    # BƯỚC 1: KIỂM TRA LỖI BỊA ĐẶT / SAI LỆCH SỐ LIỆU (UNSUPPORTED)
    # --------------------------------------------------------------------------
    # Bỏ qua cụm từ thời gian đặc biệt như 24/7 khi kiểm tra số liệu (xử lý ở bước partial)
    sent_clean_for_nums = re.sub(r"\b24/7\b", " ", sent_clean)
    fact_clean_for_nums = re.sub(r"\b24/7\b", " ", combined_facts)

    sent_numbers = re.findall(r"\d+(?:[.,]\d+)*", sent_clean_for_nums)
    fact_numbers = re.findall(r"\d+(?:[.,]\d+)*", fact_clean_for_nums)

    for num in sent_numbers:
        norm_num = num.replace(",", ".")
        matched = any(norm_num == fn.replace(",", ".") for fn in fact_numbers)
        if not matched:
            return "unsupported", [f"Sai lệch số liệu hoặc số liệu bịa đặt: '{num}' không có trong fact gốc."]

    # Kiểm tra các tiện ích/thuộc tính bịa đặt hoàn toàn
    hallucinated_claims = (
        "bồn sục",
        "jacuzzi",
        "xông hơi",
        "hồ bơi trên mây",
        "đưa đón sân bay",
        "miễn phí trọn đời",
    )
    for claim in hallucinated_claims:
        if claim in sent_clean and claim not in combined_facts:
            return "unsupported", [f"Khẳng định tiện ích bịa đặt hoàn toàn không có trong fact gốc: '{claim}'."]

    # --------------------------------------------------------------------------
    # BƯỚC 2: KIỂM TRA CÁC CA PARTIAL (THỔI PHỒNG / MỞ RỘNG / THÊM TÍNH TỪ)
    # --------------------------------------------------------------------------
    partial_reasons: list[str] = []

    # 2.1. Thêm tính từ mức độ (Degree Adjectives)
    for adj in DEGREE_ADJECTIVES:
        pattern = r"(?<!\w)" + re.escape(adj) + r"(?!\w)"
        if re.search(pattern, sent_clean) and not re.search(pattern, combined_facts):
            partial_reasons.append(f"Thêm tính từ mức độ không có trong fact gốc: '{adj}'.")

    # 2.2. Mở rộng phạm vi (Scope Expansion)
    for scope in SCOPE_EXPANSION_WORDS:
        pattern = r"(?<!\w)" + re.escape(scope) + r"(?!\w)"
        if re.search(pattern, sent_clean) and not re.search(pattern, combined_facts):
            partial_reasons.append(f"Mở rộng phạm vi không có trong fact gốc: '{scope}'.")

    # 2.3. Thêm kết quả suy diễn (Result Inference)
    for res_phrase in RESULT_INFERENCE_PHRASES:
        pattern = r"(?<!\w)" + re.escape(res_phrase) + r"(?!\w)"
        if re.search(pattern, sent_clean) and not re.search(pattern, combined_facts):
            partial_reasons.append(f"Thêm kết quả suy diễn không có căn cứ: '{res_phrase}'.")

    # 2.4. Thêm thời gian / tần suất (Temporal Addition)
    for temp in TEMPORAL_ADDITIONS:
        pattern = r"(?<!\w)" + re.escape(temp) + r"(?!\w)"
        if re.search(pattern, sent_clean) and not re.search(pattern, combined_facts):
            partial_reasons.append(f"Thêm thời gian hoặc tần suất không có trong fact gốc: '{temp}'.")

    if partial_reasons:
        return "partial", partial_reasons

    # --------------------------------------------------------------------------
    # BƯỚC 3: SUPPORTED NẾU HOÀN TOÀN TRUNG THỰC VÀ ĐỦ CĂN CỨ
    # --------------------------------------------------------------------------
    return "supported", []


# ============================================================================
# 5. PIPELINE ÁNH XẠ CÂU TOÀN DIỆN (SENTENCE-FACT MAPPER)
# ============================================================================

def auto_associate_facts(
    sentence: str,
    facts_map: Mapping[str, Any],
) -> list[str]:
    """Tự động tìm kiếm các fact_id phù hợp nhất cho câu factual dựa trên từ khóa và số liệu."""
    matched_ids: list[str] = []
    sent_clean = sentence.strip().lower()

    for fid, fact_obj in facts_map.items():
        fact_text = getattr(fact_obj, "text", "") if hasattr(fact_obj, "text") else str(fact_obj.get("text", ""))
        fact_lower = fact_text.lower()

        # Kiểm tra trùng khớp số liệu
        f_numbers = re.findall(r"\d+(?:[.,]\d+)*", fact_lower)
        s_numbers = re.findall(r"\d+(?:[.,]\d+)*", sent_clean)
        num_overlap = set(f_numbers) & set(s_numbers)

        # Kiểm tra trùng khớp từ khóa
        f_words = set(re.findall(r"\w{3,}", fact_lower))
        s_words = set(re.findall(r"\w{3,}", sent_clean))
        word_overlap = f_words & s_words

        if num_overlap or len(word_overlap) >= 3:
            matched_ids.append(fid)

    return matched_ids


def map_caption_to_sentence_fact_map(
    caption: str,
    facts: Sequence[FactItem | Mapping[str, Any]],
    expected_cta: str | None = None,
    explicit_mappings: Sequence[Mapping[str, Any]] | None = None,
) -> list[SentenceMap]:
    """Hàm toàn trình bóc tách câu, phân loại và ánh xạ fact cho caption bài đăng:
    
    1. Tách câu chuẩn tiếng Việt (bảo toàn số 8.500.000, viết tắt, emoji).
    2. Phân loại sentence_type: 'hook', 'cta', 'factual'.
    3. Kiểm tra luật Zero-Claim cho hook và cta.
    4. Kiểm tra entailment: supported, partial, unsupported cho câu factual.
    5. Đóng gói danh sách SentenceMap tuân thủ schema SocialPack v2.
    """
    facts_dict: dict[str, Any] = {}
    for f in facts:
        fid = getattr(f, "fact_id", "") if hasattr(f, "fact_id") else str(f.get("fact_id", ""))
        facts_dict[fid] = f

    sentences = split_vietnamese_sentences(caption)
    total_sents = len(sentences)
    result_maps: list[SentenceMap] = []

    # Map nếu có chỉ định rõ ràng từ trước
    explicit_dict: dict[int, Mapping[str, Any]] = {}
    if explicit_mappings:
        for em in explicit_mappings:
            s_idx = em.get("sentence_index", -1)
            if s_idx >= 0:
                explicit_dict[s_idx] = em

    for idx, sent_text in enumerate(sentences):
        # 1. Phân loại sentence_type
        if idx in explicit_dict and "sentence_type" in explicit_dict[idx]:
            stype: SentenceType = explicit_dict[idx]["sentence_type"]
        else:
            stype = classify_sentence_type(sent_text, idx, total_sents, expected_cta=expected_cta)

        # 2. Xử lý câu Hook
        if stype == "hook":
            is_zero_claim, _ = check_zero_claim(sent_text, "hook")
            entail_status: EntailmentStatusType = "supported" if is_zero_claim else "unsupported"
            result_maps.append(
                SentenceMap(
                    sentence_index=idx,
                    text=sent_text,
                    sentence_type="hook",
                    fact_id="NONE",
                    is_factual=False,
                    entailment_status=entail_status,
                )
            )

        # 3. Xử lý câu CTA
        elif stype == "cta":
            is_zero_claim, _ = check_zero_claim(sent_text, "cta", expected_cta=expected_cta)
            entail_status = "supported" if is_zero_claim else "unsupported"
            result_maps.append(
                SentenceMap(
                    sentence_index=idx,
                    text=sent_text,
                    sentence_type="cta",
                    fact_id="SYSTEM_CTA",
                    is_factual=False,
                    entailment_status=entail_status,
                )
            )

        # 4. Xử lý câu Factual
        else:
            # Xác định danh sách fact_ids
            if idx in explicit_dict and "fact_id" in explicit_dict[idx]:
                linked_ids = explicit_dict[idx]["fact_id"]
                if isinstance(linked_ids, str):
                    linked_ids = [linked_ids]
            else:
                linked_ids = auto_associate_facts(sent_text, facts_dict)

            # Kiểm tra entailment
            entail_status, _ = check_factual_entailment(sent_text, linked_ids, facts_dict)

            # Fallback nếu câu factual chưa gắn được fact hợp lệ
            if not linked_ids:
                linked_ids = ["f_unmapped"]

            result_maps.append(
                SentenceMap(
                    sentence_index=idx,
                    text=sent_text,
                    sentence_type="factual",
                    fact_id=linked_ids,
                    is_factual=True,
                    entailment_status=entail_status,
                )
            )

    return result_maps
