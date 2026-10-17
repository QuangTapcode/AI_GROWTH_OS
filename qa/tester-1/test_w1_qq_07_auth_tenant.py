import uuid
import requests
import json
import os
import pytest

BASE_URL = "http://localhost:5001"
HEADERS = {"Authorization": "Bearer w1-dev-token-qa-only"}

@pytest.fixture(scope="module")
def fixtures():
    """Đọc dữ liệu 2 Workspace và 6 Role từ file JSON"""
    fixture_path = os.path.join(os.path.dirname(__file__), "w1_tenant_fixtures.json")
    with open(fixture_path, "r", encoding="utf-8") as f:
        return json.load(f)

def test_cross_tenant_isolation(fixtures):
    """Kiểm tra: User Tenant 1 không thể truy cập snapshot data của Tenant 2"""
    print("\n[TH-02] Test Cross-Tenant Isolation...")
    
    # Lấy ID của TripC và Global Expat
    tripc_id = fixtures["tenants"][0]["tenant_id"]
    global_id = fixtures["tenants"][1]["tenant_id"]
    job_id = str(uuid.uuid4())
    
    # Payload cố tình gài "râu ông nọ cắm cằm bà kia": 
    # Job thuộc TripC nhưng snapshot lại chứa data của Global Expat
    payload = {
        "job_id": job_id,
        "workspace_id": tripc_id, 
        "operation": "knowledge.answer",
        "input_version": 1,
        "payload": {
            "question": "What is the budget?",
            "snapshot": {
                "workspace_id": tripc_id,
                "sources": [
                    {
                        "source_id": str(uuid.uuid4()),
                        "version": 1,
                        "workspace_id": global_id, # CỐ TÌNH GÀI ID CỦA TENANT KHÁC
                        "status": "approved",
                        "chunks": []
                    }
                ]
            }
        }
    }
    
    res = requests.post(f"{BASE_URL}/internal/v1/runs", json=payload, headers=HEADERS)
    
    # Theo CR-001, lỗi này phải bị chặn ngay từ vòng gửi xe với mã 422
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"
    
    error_data = res.json().get("error", {})
    assert error_data.get("code") in ["INVALID_REQUEST", "TENANT_SCOPE_VIOLATION"], f"Sai mã lỗi: {error_data}"
    print("   -> [PASS] Hệ thống đã chặn thành công việc truy cập chéo Tenant!")

def test_idempotency_engine(fixtures):
    """Kiểm tra: Gửi lại cùng một request (cùng job_id, operation, input_version) chỉ trả về kết quả cũ"""
    print("\n[TH-02] Test Idempotency Engine...")
    tripc_id = fixtures["tenants"][0]["tenant_id"]
    job_id = str(uuid.uuid4())
    
    payload = {
        "job_id": job_id,
        "workspace_id": tripc_id,
        "operation": "growth_map.suggest",
        "input_version": 1,
        "trace_id": "idempotency-trace-001",
        "payload": {
            "workspace_id": tripc_id,
            "business_profile": {"company_name": "TripC"},
            "approved_facts": []
        }
    }
    
    # Gửi lần 1: Mong đợi mã 202 (Accepted - Tạo mới)
    res_1 = requests.post(f"{BASE_URL}/internal/v1/runs", json=payload, headers=HEADERS)
    assert res_1.status_code in (200, 202), f"Lần 1 gửi thất bại: {res_1.text}"
    
    # Gửi lần 2: Giữ nguyên y hệt Payload. Mong đợi mã 200 (Trả về bản cũ) hoặc 202, tuyệt đối không lỗi 409
    res_2 = requests.post(f"{BASE_URL}/internal/v1/runs", json=payload, headers=HEADERS)
    assert res_2.status_code in (200, 202), f"Lần 2 (Idempotency) thất bại, trả về {res_2.status_code}"
    
    # Đảm bảo run_id của cả 2 lần trả về là MỘT (không bị tạo job trùng lặp)
    run_id_1 = res_1.json().get("run_id")
    run_id_2 = res_2.json().get("run_id")
    assert run_id_1 == run_id_2, "Idempotency sai: Hệ thống sinh ra 2 Run ID khác nhau cho cùng một Job!"
    print("   -> [PASS] Cơ chế Idempotency hoạt động chuẩn xác!")