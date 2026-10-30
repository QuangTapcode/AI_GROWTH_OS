"""Script tính toán hệ số tương đồng Cohen's Kappa giữa 2 người gán nhãn độc lập (CM-20).

Hệ số Cohen's Kappa (κ) đo lường độ đồng thuận thực tế loại trừ yếu tố ngẫu nhiên:
    κ = (P_o - P_e) / (1 - P_e)

Tiêu chuẩn nghiệm thu dự án AI Growth OS:
    κ >= 0.85: ĐẠT CHUẨN (Xuất sắc) -> Chốt Golden Set
    κ < 0.85: KHÔNG ĐẠT -> Mở phiên hòa giải (Adjudication) dưới sự chủ trì của Content Lead.

LƯU Ý: Con số κ = 1.0 trong mục 15.4 của tài liệu v1.0 chỉ là minh họa giả định.
Bắt buộc phải chạy script này với nhãn thực tế của 2 chuyên viên để lấy số đo thật.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Sequence

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("compute_kappa")


def calculate_cohen_kappa(
    rater_a: Sequence[Any],
    rater_b: Sequence[Any],
) -> tuple[float, float, float]:
    """Tính Cohen's Kappa cho bài toán phân loại danh mục (hỗ trợ cả nhị phân và đa lớp).

    Returns:
        (kappa, observed_agreement, expected_agreement)
    """
    if len(rater_a) != len(rater_b):
        raise ValueError(
            f"Kích thước tập nhãn không khớp: Rater A có {len(rater_a)}, Rater B có {len(rater_b)}"
        )
    n = len(rater_a)
    if n == 0:
        return 0.0, 0.0, 0.0

    # Chuẩn hóa nhãn thành chuỗi ký tự viết thường
    labels_a = [str(x).strip().lower() for x in rater_a]
    labels_b = [str(x).strip().lower() for x in rater_b]

    # Tập hợp tất cả các nhãn xuất hiện
    categories = sorted(list(set(labels_a) | set(labels_b)))

    # 1. Tỷ lệ đồng thuận quan sát được (Observed Agreement P_o)
    matches = sum(1 for a, b in zip(labels_a, labels_b) if a == b)
    p_o = matches / n

    # 2. Tỷ lệ đồng thuận ngẫu nhiên kỳ vọng (Expected Agreement P_e)
    count_a = Counter(labels_a)
    count_b = Counter(labels_b)

    p_e = 0.0
    for cat in categories:
        prob_a = count_a[cat] / n
        prob_b = count_b[cat] / n
        p_e += prob_a * prob_b

    # 3. Tính Kappa
    if math.isclose(p_e, 1.0, abs_tol=1e-9):
        kappa = 1.0 if math.isclose(p_o, 1.0, abs_tol=1e-9) else 0.0
    else:
        kappa = (p_o - p_e) / (1.0 - p_e)

    return round(kappa, 4), round(p_o, 4), round(p_e, 4)


def build_confusion_matrix(
    rater_a: Sequence[Any],
    rater_b: Sequence[Any],
) -> dict[str, dict[str, int]]:
    """Tạo ma trận nhầm lẫn (Confusion Matrix) giữa 2 người gán nhãn."""
    labels_a = [str(x).strip().lower() for x in rater_a]
    labels_b = [str(x).strip().lower() for x in rater_b]
    categories = sorted(list(set(labels_a) | set(labels_b)))

    matrix: dict[str, dict[str, int]] = {cat_a: {cat_b: 0 for cat_b in categories} for cat_a in categories}
    for a, b in zip(labels_a, labels_b):
        matrix[a][b] += 1
    return matrix


def load_dataset_from_dir_or_file(path_str: str) -> list[dict[str, Any]]:
    """Đọc dữ liệu gán nhãn từ file đơn hoặc từ thư mục chứa các file JSON."""
    path = Path(path_str)
    items: list[dict[str, Any]] = []

    if not path.exists():
        raise FileNotFoundError(f"Không tìm thấy đường dẫn: {path}")

    if path.is_file():
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                items.extend(data)
            elif isinstance(data, dict):
                items.append(data)
    elif path.is_dir():
        for json_file in sorted(path.glob("*.json")):
            # Bỏ qua file gộp nếu có để tránh đếm trùng lặp
            if "seed_drafts" in json_file.name:
                continue
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    items.extend(data)
                elif isinstance(data, dict):
                    items.append(data)

    return items


def evaluate_dataset_annotations(
    items: list[dict[str, Any]],
    threshold: float = 0.85,
) -> dict[str, Any]:
    """Phân tích độ đồng thuận gán nhãn trên danh sách mẫu dữ liệu."""
    sample_ids: list[str] = []
    status_a: list[str] = []
    status_b: list[str] = []
    conflicts: list[dict[str, Any]] = []

    sentence_types_a: list[str] = []
    sentence_types_b: list[str] = []

    for item in items:
        sid = item.get("sample_id", "unknown")
        annot = item.get("annotation", {})
        a = annot.get("annotator_a", {})
        b = annot.get("annotator_b", {})

        st_a = a.get("status")
        st_b = b.get("status")

        # Bỏ qua nếu chuyên viên chưa điền nhãn
        if st_a is None or st_b is None:
            continue

        sample_ids.append(sid)
        status_a.append(st_a)
        status_b.append(st_b)

        if str(st_a).strip().lower() != str(st_b).strip().lower():
            conflicts.append({
                "sample_id": sid,
                "rater_a_status": st_a,
                "rater_b_status": st_b,
                "rater_a_violations": a.get("violations_found", []),
                "rater_b_violations": b.get("violations_found", []),
                "rater_a_notes": a.get("notes", ""),
                "rater_b_notes": b.get("notes", ""),
            })

        # Đánh giá câu (nếu có bản chỉnh sửa câu)
        sents_a = a.get("edited_sentence_fact_map") or item.get("draft_pack", {}).get("sentence_fact_map", [])
        sents_b = b.get("edited_sentence_fact_map") or item.get("draft_pack", {}).get("sentence_fact_map", [])
        for sa, sb in zip(sents_a, sents_b):
            if isinstance(sa, dict) and isinstance(sb, dict):
                sentence_types_a.append(sa.get("sentence_type", "factual"))
                sentence_types_b.append(sb.get("sentence_type", "factual"))

    if not status_a:
        return {
            "error": "Chưa có mẫu nào được điền nhãn bởi cả 2 người (status annotator_a và annotator_b đang rỗng)."
        }

    # 1. Cohen's Kappa trên quyết định duyệt tổng thể (PASS / FAIL)
    kappa_status, p_o_status, p_e_status = calculate_cohen_kappa(status_a, status_b)
    matrix_status = build_confusion_matrix(status_a, status_b)

    # 2. Cohen's Kappa trên phân loại câu (nếu có)
    kappa_sents, p_o_sents, p_e_sents = (None, None, None)
    if sentence_types_a and len(sentence_types_a) == len(sentence_types_b):
        kappa_sents, p_o_sents, p_e_sents = calculate_cohen_kappa(sentence_types_a, sentence_types_b)

    is_passed = kappa_status >= threshold

    return {
        "total_evaluated_samples": len(status_a),
        "target_threshold": threshold,
        "cohen_kappa": kappa_status,
        "observed_agreement_po": p_o_status,
        "expected_agreement_pe": p_e_status,
        "is_passed": is_passed,
        "decision": "ACCEPT - CHỐT GOLDEN SET" if is_passed else "REJECT - CẦN HÒA GIẢI ADJUDICATION",
        "confusion_matrix": matrix_status,
        "sentence_type_eval": {
            "total_sentences": len(sentence_types_a),
            "cohen_kappa": kappa_sents,
            "observed_agreement_po": p_o_sents,
            "expected_agreement_pe": p_e_sents,
        } if kappa_sents is not None else None,
        "conflicts_count": len(conflicts),
        "conflicts": conflicts,
    }


def generate_demo_simulation_data(is_pass_scenario: bool = False) -> list[dict[str, Any]]:
    """Tạo bộ dữ liệu mô phỏng 50 mẫu có nhãn của 2 người để kiểm tra thuật toán.

    - is_pass_scenario = False: Mô phỏng 6 ca lệch -> κ ~ 0.67 (< 0.85, REJECT cần hòa giải).
    - is_pass_scenario = True:  Mô phỏng 2 ca lệch trên phân bố cân bằng -> κ ~ 0.92 (>= 0.85, ACCEPT chốt Golden Set).
    """
    demo_items: list[dict[str, Any]] = []

    if is_pass_scenario:
        # 50 mẫu: 26 đồng thuận PASS, 22 đồng thuận FAIL, 2 ca lệch
        for i in range(1, 51):
            sid = f"gs_demo_{i:03d}"
            if i <= 26:
                st_a, st_b = "PASS", "PASS"
                v_a, v_b = [], []
            elif i <= 48:
                st_a, st_b = "FAIL", "FAIL"
                v_a, v_b = ["ERR_01"], ["ERR_01"]
            elif i == 49:
                st_a, st_b = "PASS", "FAIL"
                v_a, v_b = [], ["ERR_02"]
            else:
                st_a, st_b = "FAIL", "PASS"
                v_a, v_b = ["ERR_03"], []

            demo_items.append({
                "sample_id": sid,
                "annotation": {
                    "annotator_a": {
                        "annotator_name": "Annotator A (Chuyên viên nội dung 1)",
                        "status": st_a,
                        "violations_found": v_a,
                        "notes": "Đã kiểm tra fact mapping và Zero-Claim.",
                    },
                    "annotator_b": {
                        "annotator_name": "Annotator B (Chuyên viên nội dung 2)",
                        "status": st_b,
                        "violations_found": v_b,
                        "notes": "Đã kiểm tra độc lập.",
                    },
                },
            })
        return demo_items

    # Kịch bản mặc định: 50 mẫu, 6 ca lệch -> κ ~ 0.67
    for i in range(1, 51):
        sid = f"gs_demo_{i:03d}"
        if i <= 35:
            # Đồng thuận PASS
            st_a, st_b = "PASS", "PASS"
            v_a, v_b = [], []
        elif i <= 44:
            # Đồng thuận FAIL
            st_a, st_b = "FAIL", "FAIL"
            v_a, v_b = ["ERR_02"], ["ERR_02"]
        elif i <= 47:
            # Lệch: A cho PASS, B bắt lỗi suy diễn FAIL
            st_a, st_b = "PASS", "FAIL"
            v_a, v_b = [], ["ERR_02"]
        else:
            # Lệch: A bắt lỗi tính từ mức độ FAIL, B cho PASS
            st_a, st_b = "FAIL", "PASS"
            v_a, v_b = ["ERR_03"], []

        demo_items.append({
            "sample_id": sid,
            "annotation": {
                "annotator_a": {
                    "annotator_name": "Annotator A (Chuyên viên nội dung 1)",
                    "status": st_a,
                    "violations_found": v_a,
                    "notes": "Đã kiểm tra fact mapping và Zero-Claim.",
                },
                "annotator_b": {
                    "annotator_name": "Annotator B (Chuyên viên nội dung 2)",
                    "status": st_b,
                    "violations_found": v_b,
                    "notes": "Đã kiểm tra độc lập.",
                },
            },
        })
    return demo_items


def print_report(res: dict[str, Any]) -> None:
    """In báo cáo định dạng bảng rõ ràng."""
    if "error" in res:
        print("\n" + "=" * 70)
        print(" BÁO CÁO TÍNH COHEN'S KAPPA GIỮA 2 NGƯỜI GÁN NHÃN")
        print("=" * 70)
        print(f"⚠️  THÔNG BÁO: {res['error']}")
        print("=" * 70 + "\n")
        return

    print("\n" + "=" * 75)
    print(" BÁO CÁO ĐỘ ĐỒNG THUẬN COHEN'S KAPPA (INTER-RATER RELIABILITY)")
    print("=" * 75)
    print(f" Số lượng mẫu đánh giá:      {res['total_evaluated_samples']}")
    print(f" Tỷ lệ đồng thuận quan sát (P_o): {res['observed_agreement_po'] * 100:.2f}%")
    print(f" Tỷ lệ ngẫu nhiên kỳ vọng (P_e):  {res['expected_agreement_pe'] * 100:.2f}%")
    print(f" Hệ số Cohen's Kappa (κ):     {res['cohen_kappa']:.4f}")
    print(f" Ngưỡng yêu cầu tối thiểu:    >= {res['target_threshold']}")

    status_icon = "✅" if res["is_passed"] else "❌"
    print(f" Kết luận nghiệm thu:         {status_icon} {res['decision']}")
    print("-" * 75)

    print(" MA TRẬN NHẦM LẪN (CONFUSION MATRIX):")
    cats = list(res["confusion_matrix"].keys())
    header = " Rater A \\ Rater B | " + " | ".join(f"{c.upper():^10}" for c in cats) + " |"
    print(" " + "-" * len(header))
    print(header)
    print(" " + "-" * len(header))
    for r_a in cats:
        row = f" {r_a.upper():<17} | " + " | ".join(f"{res['confusion_matrix'][r_a][r_b]:^10}" for r_b in cats) + " |"
        print(row)
    print(" " + "-" * len(header))

    if res.get("sentence_type_eval"):
        s_eval = res["sentence_type_eval"]
        print("-" * 75)
        print(f" Độ đồng thuận phân loại câu (Sentence Type Kappa): {s_eval['cohen_kappa']:.4f} "
              f"(P_o: {s_eval['observed_agreement_po'] * 100:.1f}%) trên {s_eval['total_sentences']} câu")

    print("-" * 75)
    print(f" Số ca lệch cần hòa giải (Adjudication): {res['conflicts_count']} ca")
    if res["conflicts"]:
        print("\n DANH SÁCH CÁC CA LỆCH CẦN HÒA GIẢI:")
        for idx, conf in enumerate(res["conflicts"][:10], 1):
            print(f"  {idx}. [{conf['sample_id']}] Rater A: {conf['rater_a_status']} vs Rater B: {conf['rater_b_status']}")
            if conf["rater_a_violations"] or conf["rater_b_violations"]:
                print(f"     Vi phạm A: {conf['rater_a_violations']} | Vi phạm B: {conf['rater_b_violations']}")
        if len(res["conflicts"]) > 10:
            print(f"     ... và {len(res['conflicts']) - 10} ca lệch khác.")

    print("=" * 75 + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Tính Cohen's Kappa giữa 2 người gán nhãn cho Golden Set (CM-20).")
    parser.add_argument("--data-path", type=str, default="", help="Đường dẫn đến file JSON hoặc thư mục chứa các mẫu.")
    parser.add_argument("--rater-a", type=str, default="", help="Đường dẫn file JSON của Rater A (nếu tách riêng).")
    parser.add_argument("--rater-b", type=str, default="", help="Đường dẫn file JSON của Rater B (nếu tách riêng).")
    parser.add_argument("--threshold", type=float, default=0.85, help="Ngưỡng nghiệm thu tối thiểu cho Kappa (mặc định 0.85).")
    parser.add_argument("--demo", action="store_true", help="Chạy mô phỏng dữ liệu mẫu 50 ca (kịch bản lệch, κ ~ 0.67).")
    parser.add_argument("--demo-pass", action="store_true", help="Chạy mô phỏng dữ liệu mẫu 50 ca (kịch bản đạt chuẩn, κ ~ 0.92 >= 0.85).")
    parser.add_argument("--output", type=str, default="", help="Đường dẫn xuất file JSON báo cáo.")

    args = parser.parse_args()

    if args.demo or args.demo_pass:
        logger.info("Đang chạy mô phỏng đo Cohen's Kappa với 50 mẫu thực tế...")
        items = generate_demo_simulation_data(is_pass_scenario=args.demo_pass)
        res = evaluate_dataset_annotations(items, threshold=args.threshold)
        print_report(res)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(res, f, ensure_ascii=False, indent=2)
            logger.info("Đã xuất báo cáo ra %s", args.output)
        return

    if args.rater_a and args.rater_b:
        # Đọc 2 file riêng rẽ
        with open(args.rater_a, "r", encoding="utf-8") as f:
            data_a = json.load(f)
        with open(args.rater_b, "r", encoding="utf-8") as f:
            data_b = json.load(f)

        # Trích xuất danh sách status
        st_a = [item.get("status", item.get("annotation", {}).get("status")) for item in data_a]
        st_b = [item.get("status", item.get("annotation", {}).get("status")) for item in data_b]

        kappa, p_o, p_e = calculate_cohen_kappa(st_a, st_b)
        res = {
            "total_evaluated_samples": len(st_a),
            "target_threshold": args.threshold,
            "cohen_kappa": kappa,
            "observed_agreement_po": p_o,
            "expected_agreement_pe": p_e,
            "is_passed": kappa >= args.threshold,
            "decision": "ACCEPT - CHỐT GOLDEN SET" if kappa >= args.threshold else "REJECT - CẦN HÒA GIẢI ADJUDICATION",
            "confusion_matrix": build_confusion_matrix(st_a, st_b),
            "conflicts_count": sum(1 for a, b in zip(st_a, st_b) if a != b),
            "conflicts": [],
        }
        print_report(res)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(res, f, ensure_ascii=False, indent=2)
        return

    # Mặc định đọc từ data-path hoặc data/golden/dev
    target_path = args.data_path or "data/golden/dev"
    try:
        items = load_dataset_from_dir_or_file(target_path)
        res = evaluate_dataset_annotations(items, threshold=args.threshold)
        print_report(res)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(res, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error("Lỗi khi đọc và tính toán: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
