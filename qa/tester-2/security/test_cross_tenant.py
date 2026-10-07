import requests
import pytest
import json
import os

BASE_URL = "http://localhost:3000/api"

# Đọc file test_data.json từ thư mục qa/fixtures/
fixture_path = os.path.join(os.path.dirname(__file__), '../../fixtures/test_data.json')
with open(fixture_path, 'r', encoding='utf-8') as f:
    TEST_DATA = json.load(f)

# Lấy dữ liệu động từ JSON
WORKSPACE_A_ID = TEST_DATA["workspaces"][0]["id"]
WORKSPACE_B_ID = TEST_DATA["workspaces"][1]["id"]
TOKEN_USER_A = TEST_DATA["users"][WORKSPACE_A_ID]["owner"]["token"]
TOKEN_VIEWER_A = TEST_DATA["users"][WORKSPACE_A_ID]["viewer"]["token"]

def test_cross_tenant_cannot_read_goals():
    """
    Kiểm thử: User ở Workspace A KHÔNG ĐƯỢC PHÉP đọc dữ liệu Goals của Workspace B.
    """
    headers = {
        "Authorization": TOKEN_USER_A,
        "Content-Type": "application/json"
    }

    # Kịch bản tồi tệ: User A cố tình sửa URL để lấy trộm data của Workspace B
    endpoint = f"{BASE_URL}/workspaces/{WORKSPACE_B_ID}/goals"

    try:
        response = requests.get(endpoint, headers=headers)

        # BẮT BUỘC HTTP Status trả về phải là 403 (Forbidden) hoặc 404 (Not Found)
        # Nếu trả về 200 (OK), hệ thống đang bị thủng lỗ hổng lộ dữ liệu chéo!
        assert response.status_code in [403, 404], f"BÁO ĐỘNG LỘ DỮ LIỆU: API trả về status {response.status_code}"

    except requests.exceptions.ConnectionError:
        # Tạm thời skip bài test nếu BE Thiệu Quang chưa bật server local
        pytest.skip("Server API chưa bật, tự động bỏ qua assertion.")

def test_viewer_role_cannot_delete_source():
    """
    Kiểm thử: Tài khoản mang quyền Viewer không được phép xóa tài liệu (Knowledge Source).
    """
    headers = {
        "Authorization": TOKEN_VIEWER_A,
        "Content-Type": "application/json"
    }

    endpoint = f"{BASE_URL}/workspaces/{WORKSPACE_A_ID}/knowledge/source_123"

    try:
        response = requests.delete(endpoint, headers=headers)
        # Quyền Viewer thực hiện hàm DELETE phải bị chặn (403)
        assert response.status_code == 403, f"LỖI PHÂN QUYỀN: Viewer có thể xóa tài liệu! Status: {response.status_code}"
    except requests.exceptions.ConnectionError:
        pytest.skip("Server API chưa bật.")