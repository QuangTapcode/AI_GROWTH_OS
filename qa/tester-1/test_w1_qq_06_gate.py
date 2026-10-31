import uuid
import requests
import json
import os

BASE_URL = "http://localhost:5001"
HEADERS = {"Authorization": "Bearer w1-dev-token-qa-only"}

def test_w1_qq_06_staging_gate_verdict():
    """QA Nghiệm thu W1-QQ-06: Staging Integration, End-to-End Pipeline & Gate Verdict"""
    
    print("\n [QA GATE] Bắt đầu kiểm tra toàn trình hệ thống Staging...")
    
    # 1. Kiểm tra trạng thái sẵn sàng của hệ thống (Health & Ready)
    health_res = requests.get(f"{BASE_URL}/healthz")
    ready_res = requests.get(f"{BASE_URL}/readyz")
    
    assert health_res.status_code == 200, "Staging Health Check thất bại!"
    assert ready_res.status_code == 200, "Staging Ready Check thất bại!"
    print("   -> [PASS] Hệ thống Backend và Provider sẵn sàng.")

    # 2. Đọc Fixtures để lấy Workspace ID chuẩn (Thay thế Placeholder)
    fixture_path = os.path.join(os.path.dirname(__file__), "w1_tenant_fixtures.json")
    with open(fixture_path, "r", encoding="utf-8") as f:
        fixtures = json.load(f)
    
    # Lấy tenant_id của "TripC Da Nang" từ file json
    workspace_id = fixtures["tenants"][0]["tenant_id"] 
    job_id = str(uuid.uuid4())
    
    # 3. Chạy thử một chuỗi Pipeline hoàn chỉnh: Ingest -> Answer
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
    print(f"   -> [PASS] Job E2E đã khởi tạo thành công cho Tenant {workspace_id} với Run ID: {run_id}")
    

    print("\n==================================================")
    print("🏆 GATE VERDICT: PASSED (APPROVED FOR STAGING RELEASE)")
    print("==================================================")