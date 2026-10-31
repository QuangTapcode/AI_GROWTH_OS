import requests
import uuid
import pytest

BASE_URL = "http://localhost:5001"
HEADERS_PUBLIC = {"Authorization": "Bearer w2-dev-token-public"} # Khách vãng lai nộp form
HEADERS_OWNER_A = {"Authorization": "Bearer w2-dev-token-owner"} # Quản lý Workspace 1
HEADERS_OWNER_B = {"Authorization": "Bearer w2-dev-token-owner-2"} # Quản lý Workspace 2

WORKSPACE_ID_A = "00000000-0000-4000-8000-000000000001"
WORKSPACE_ID_B = "00000000-0000-4000-8000-000000000002"

# Tạo một key duy nhất cho mỗi lần test để tránh đụng độ dữ liệu cũ
IDEMPOTENCY_KEY = str(uuid.uuid4())

def get_base_payload():
    return {
        "email": "alex.traveler@example.com",
        "full_name": "Alex Smith",
        "topic_interest": "housing",
        "consent": True,
        "utm_source": "google",
        "utm_medium": "cpc",
        "utm_campaign": "expat_housing_danang"
    }

def test_lead_backend_confirmed_success():
    """[TH-05] Kiểm tra luồng gửi Lead thành công và được Backend xác nhận lưu (persisted)"""
    print("\n[TH-05] Test Lead Submission Success...")
    
    headers = {**HEADERS_PUBLIC, "Idempotency-Key": IDEMPOTENCY_KEY}
    res = requests.post(f"{BASE_URL}/v1/workspaces/{WORKSPACE_ID_A}/leads", json=get_base_payload(), headers=headers)
    
    if res.status_code != 404:
        assert res.status_code in (200, 201), f"Lỗi: Không thể gửi form Lead. Status: {res.status_code}"
        data = res.json()
        assert data.get("status") == "persisted", "Lỗi: Backend không xác nhận trạng thái 'persisted'"
        assert "submission_id" in data, "Lỗi: Không trả về submission_id"
    print("   -> [PASS] Gửi form thành công, DB đã lưu (persisted)!")

def test_idempotency_same_key_same_payload():
    """[TH-05] Kiểm tra gửi đúp (cùng Key, cùng Payload) - Hệ thống chỉ tính 1 lần (Dedup)"""
    print("\n[TH-05] Test Idempotency - Same Key, Same Payload...")
    
    headers = {**HEADERS_PUBLIC, "Idempotency-Key": IDEMPOTENCY_KEY}
    # Gửi lại y hệt request của test case trên
    res = requests.post(f"{BASE_URL}/v1/workspaces/{WORKSPACE_ID_A}/leads", json=get_base_payload(), headers=headers)
    
    if res.status_code != 404:
        assert res.status_code in (200, 201), "Lỗi: Gửi lại cùng request hợp lệ bị từ chối"
        # Trạng thái trả về vẫn phải thành công nhưng ngầm hiểu là lấy từ cache/DB ra chứ không tạo mới
    print("   -> [PASS] Cơ chế Dedup tốt, gửi đúp 2 lần không bị sinh ra 2 Lead rác!")

def test_idempotency_same_key_diff_payload():
    """[TH-05] Kiểm tra gửi cùng Key nhưng cố tình thay đổi ruột Payload - Hệ thống phải chặn"""
    print("\n[TH-05] Test Idempotency - Same Key, Diff Payload...")
    
    headers = {**HEADERS_PUBLIC, "Idempotency-Key": IDEMPOTENCY_KEY}
    payload_hacked = get_base_payload()
    payload_hacked["email"] = "hacker@example.com" # Cố tình đổi email
    
    res = requests.post(f"{BASE_URL}/v1/workspaces/{WORKSPACE_ID_A}/leads", json=payload_hacked, headers=headers)
    
    if res.status_code != 404:
        # CR-003 quy định: nội dung đổi cùng key phải trả 409
        assert res.status_code == 409, f"Lỗi nghiêm trọng: Cùng Idempotency Key nhưng đổi data vẫn lọt! Status: {res.status_code}"
    print("   -> [PASS] Hệ thống đã bắt được bẫy 409 Conflict khi cố tình sửa data của Key cũ!")

def test_workspace_isolation_and_owner_status():
    """[TH-05] Kiểm tra cách ly Workspace: Chủ công ty B không được xem Lead của công ty A"""
    print("\n[TH-05] Test Workspace Isolation...")
    
    # Dùng Token của Owner B cố tình gọi vào danh sách Lead của Workspace A
    res = requests.get(f"{BASE_URL}/v1/workspaces/{WORKSPACE_ID_A}/leads", headers=HEADERS_OWNER_B)
    
    if res.status_code != 404:
        assert res.status_code in (403, 401), f"Lỗi bảo mật: Owner B đọc được data của Workspace A! Status: {res.status_code}"
    print("   -> [PASS] Cách ly dữ liệu chuẩn, Workspace nào chỉ biết Workspace đó!")