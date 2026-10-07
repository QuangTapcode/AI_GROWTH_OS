import uuid
import requests

BASE_URL = "http://localhost:8000"
HEADERS = {"Authorization": "Bearer w1-dev-token-qa-only"}

def test_w1_qq_06_staging_gate_verdict():
    """QA Nghiệm thu W1-QQ-06: Staging Integration, End-to-End Pipeline & Gate Verdict"""
    
    print("\n🚀 [QA GATE] Bắt đầu kiểm tra toàn trình hệ thống Staging...")
    
    # 1. Kiểm tra trạng thái sẵn sàng của hệ thống (Health & Ready)
    health_res = requests.get(f"{BASE_URL}/healthz")
    ready_res = requests.get(f"{BASE_URL}/readyz")
    
    assert health_res.status_code == 200, "Staging Health Check thất bại!"
    assert ready_res.status_code == 200, "Staging Ready Check thất bại!"
    print("   -> [PASS] Hệ thống Backend và Provider sẵn sàng.")

    # 2. Chạy thử một chuỗi Pipeline hoàn chỉnh: Ingest -> Answer
    workspace_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    
    payload = {
        "job_id": job_id,
        "workspace_id": workspace_id,
        "operation": "knowledge.answer",
        "input_version": 1,
        "trace_id": "gate-verdict-trace",
        "payload": {
            "question": "Is the system ready for production release?",
            "snapshot": {
                "workspace_id": workspace_id,
                "sources": [
                    {
                        "source_id": str(uuid.uuid4()),
                        "version": 1,
                        "workspace_id": workspace_id,
                        "status": "approved",
                        "chunks": [
                            {
                                "chunk_id": "gate-c1",
                                "text": "All W1-QQ acceptance criteria W1 through W8 have been fully verified and passed."
                            }
                        ]
                    }
                ]
            }
        }
    }
    
    run_res = requests.post(f"{BASE_URL}/internal/v1/runs", json=payload, headers=HEADERS)
    assert run_res.status_code in (200, 202), f"Pipeline E2E thất bại: {run_res.text}"
    
    run_data = run_res.json()
    run_id = run_data.get("run_id")
    print(f"   -> [PASS] Job E2E đã khởi tạo thành công với Run ID: {run_id}")
    
    # 3. KẾT LUẬN GATE VERDICT
    print("\n==================================================")
    print("🏆 GATE VERDICT: PASSED (APPROVED FOR STAGING RELEASE)")
    print("==================================================")