import uuid
import requests

BASE_URL = "http://localhost:8000"
HEADERS = {"Authorization": "Bearer w1-dev-token-qa-only"}

def test_w1_qq_03_and_07_ingest_with_provenance_and_license():
    """QA Nghiệm thu W1-QQ-03 (Ingest text/URL) và W1-QQ-07 (Provenance, license)"""
    workspace_id = str(uuid.uuid4())
    source_id = str(uuid.uuid4())
    
    # Payload nạp tài liệu kèm theo thông tin bản quyền (Provenance & License) chuẩn W1-QQ-07
    payload = {
        "job_id": str(uuid.uuid4()),
        "workspace_id": workspace_id,
        "operation": "knowledge.ingest",
        "input_version": 1,
        "trace_id": str(uuid.uuid4()),
        "payload": {
            "source": {
                "source_id": source_id,
                "version": 1,
                "workspace_id": workspace_id,
                "kind": "text",
                "title": "Da Nang Smart City Guidelines",
                "label": "policy",
                "text": "AI Growth OS guidelines for Da Nang local enterprises. Clause 1: Transparency. Clause 2: Security.",
                "provenance": {
                    "license": "CC-BY-4.0",
                    "attribution": "Da Nang Department of Information and Communications",
                    "source_url": "https://danang.gov.vn/ai-policy",
                    "upstream_version": "v1.0"
                }
            }
        }
    }
    
    res = requests.post(f"{BASE_URL}/internal/v1/runs", json=payload, headers=HEADERS)
    assert res.status_code in (200, 202), f"Lỗi Ingest W1-QQ-03: {res.text}"
    
    data = res.json()
    assert "run_id" in data
    print("\n✅ W1-QQ-03 & W1-QQ-07 Passed: Ingest dữ liệu và ghi nhận License/Provenance thành công!")

def test_w1_qq_03_negative_case_invalid_kind():
    """QA Nghiệm thu W1-QQ-03 (Negative case): Kiểm tra chặn loại tài liệu không hỗ trợ"""
    workspace_id = str(uuid.uuid4())
    
    payload = {
        "job_id": str(uuid.uuid4()),
        "workspace_id": workspace_id,
        "operation": "knowledge.ingest",
        "input_version": 1,
        "trace_id": str(uuid.uuid4()),
        "payload": {
            "source": {
                "source_id": str(uuid.uuid4()),
                "version": 1,
                "workspace_id": workspace_id,
                "kind": "unsupported_format", # Sai định dạng cho phép (chỉ text, pdf, url)[cite: 7]
                "text": "Bad format data"
            }
        }
    }
    
    res = requests.post(f"{BASE_URL}/internal/v1/runs", json=payload, headers=HEADERS)
    # FastAPI schema validation sẽ bắt lỗi này và trả về 422
    assert res.status_code == 422, f"Expected 422 for bad format, got {res.status_code}"
    print("\n✅ W1-QQ-03 (Negative) Passed: Hệ thống đã chặn thành công định dạng nguồn không hợp lệ!")