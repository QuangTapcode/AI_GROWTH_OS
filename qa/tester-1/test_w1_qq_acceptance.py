import pytest
import requests

BASE_URL = "http://localhost:8000"
RUNS_URL = f"{BASE_URL}/internal/v1/runs"
TIMEOUT = 10

VALID_PAYLOAD = {
    "job_id": "123e4567-e89b-12d3-a456-426614174000",
    "workspace_id": "123e4567-e89b-12d3-a456-426614174000",
    "operation": "knowledge.ingest",
    "input_version": 1,
    "trace_id": "test-trace",
    "payload": {"source": "test-source"},  # chỉnh theo schema thật của knowledge.ingest
}


def test_w1_qq_01_healthz_and_readyz():
    """QA Nghiệm thu W1-QQ-01: FastAPI, health, fake/live provider"""
    res_health = requests.get(f"{BASE_URL}/healthz", timeout=TIMEOUT)
    assert res_health.status_code == 200, f"Lỗi healthz: {res_health.text}"
    data_health = res_health.json()
    assert data_health["status"] == "ok", "Trạng thái không phải là ok"
    assert "service" in data_health
    assert "provider_mode" in data_health

    res_ready = requests.get(f"{BASE_URL}/readyz", timeout=TIMEOUT)
    assert res_ready.status_code == 200, f"Lỗi readyz: {res_ready.text}"
    assert res_ready.json()["status"] == "ok"

    print("\n✅ W1-QQ-01 Passed: API Health Check phản hồi chuẩn xác!")


def _assert_unauthorized(res):
    assert res.status_code == 401, (
        f"Bảo mật kém, expected 401, got {res.status_code}. Lỗi: {res.text}"
    )
    body = res.json()
    assert body["error"]["code"] == "UNAUTHORIZED"
    # 401 không được lộ thông tin schema nội bộ
    assert "details" not in body["error"], f"Lộ chi tiết schema: {body}"


@pytest.mark.parametrize(
    "body",
    [{}, {"operation": "knowledge.ingest"}, VALID_PAYLOAD],
    ids=["empty_body", "partial_body", "valid_body"],
)
def test_w1_qq_04_auth_rejection_no_token(body):
    """W1-QQ-04: không có Authorization thì luôn 401, bất kể body đúng hay sai"""
    res = requests.post(RUNS_URL, json=body, timeout=TIMEOUT)
    _assert_unauthorized(res)


def test_w1_qq_04_auth_rejection_invalid_token():
    """W1-QQ-04: token sai thì 401"""
    res = requests.post(
        RUNS_URL,
        json=VALID_PAYLOAD,
        headers={"Authorization": "Bearer invalid-token"},
        timeout=TIMEOUT,
    )
    _assert_unauthorized(res)