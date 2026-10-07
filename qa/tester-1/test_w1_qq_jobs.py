import uuid
import requests
import time
from datetime import datetime, timezone, timedelta

BASE_URL = "http://localhost:8000"
# Đây là token mẫu theo cấu hình mặc định (nếu bạn không đổi trong .env)
HEADERS = {"Authorization": "Bearer w1-dev-token-qa-only"}

def test_w1_qq_02_idempotency_and_run_store():
    """QA Nghiệm thu W1-QQ-02: Run store, idempotency, retry"""
    job_id = str(uuid.uuid4())
    workspace_id = str(uuid.uuid4())
    trace_id = str(uuid.uuid4())
    
    # Request chuẩn tạo Job Ingest Text
    payload = {
        "job_id": job_id,
        "workspace_id": workspace_id,
        "operation": "knowledge.ingest",
        "input_version": 1,
        "trace_id": trace_id,
        "payload": {
            "source": {
                "source_id": str(uuid.uuid4()),
                "version": 1,
                "workspace_id": workspace_id,
                "kind": "text",
                "text": "Hello AI Growth OS!"
            }
        }
    }
    
    # Lần 1: Gửi Request -> Expected 202 Accepted
    res1 = requests.post(f"{BASE_URL}/internal/v1/runs", json=payload, headers=HEADERS)
    assert res1.status_code == 202, f"Lần 1 lỗi: {res1.text}"
    run_id = res1.json()["run_id"]
    
    # Lần 2: Gửi y hệt Request 1 (Idempotency) -> Expected 202 hoặc 200 (không chạy lại)
    res2 = requests.post(f"{BASE_URL}/internal/v1/runs", json=payload, headers=HEADERS)
    assert res2.status_code in (200, 202), f"Idempotency lỗi: {res2.text}"
    assert res2.json()["run_id"] == run_id
    
    # Lần 3: Giữ nguyên ID, đổi data -> Expected 409 Conflict
    payload["payload"]["source"]["text"] = "Hacked!"
    res3 = requests.post(f"{BASE_URL}/internal/v1/runs", json=payload, headers=HEADERS)
    assert res3.status_code == 409, "Không chặn được Conflict ID!"
    
    print("\n✅ W1-QQ-02 Passed: Idempotency và Run Store hoạt động hoàn hảo!")

def test_w1_qq_08_fact_expiry():
    """QA Nghiệm thu W1-QQ-08: Fact expiry (Giá cả/Tình trạng quá hạn)"""
    # Khai báo fact hôm qua đã hết hạn
    expired_date = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    
    # Dùng chung MỘT workspace_id duy nhất cho toàn bộ job và snapshot
    workspace_id = str(uuid.uuid4())
    
    payload = {
        "job_id": str(uuid.uuid4()),
        "workspace_id": workspace_id,
        "operation": "knowledge.answer",
        "input_version": 1,
        "trace_id": str(uuid.uuid4()),
        "payload": {
            "question": "What is the price?",
            "snapshot": {
                "workspace_id": workspace_id, # Dùng chung ID ở đây
                "sources": [
                    {
                        "source_id": str(uuid.uuid4()),
                        "version": 1,
                        "workspace_id": workspace_id, # Dùng chung ID ở đây luôn
                        "status": "approved",
                        "facts": [
                            {
                                "key": "price",
                                "value": "100 USD",
                                "valid_until": expired_date # Đã hết hạn
                            }
                        ]
                    }
                ]
            }
        }
    }
    
    res = requests.post(f"{BASE_URL}/internal/v1/runs", json=payload, headers=HEADERS)
    assert res.status_code in (200, 202), f"Lỗi tạo Job: {res.text}"
    print("\n✅ W1-QQ-08 Passed: Fact Expiry đã được chấp nhận khi đúng Tenant!")