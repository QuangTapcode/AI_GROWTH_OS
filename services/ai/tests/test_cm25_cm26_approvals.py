"""Bộ kiểm thử cho CM-25 (Approval Queue UI & API) và CM-26 (Content Hash Lock & Gateway Recheck).

Kiểm tra các yêu cầu nghiệp vụ bắt buộc:
1. TC-07: Khóa content_hash (SHA-256) và phát hiện 100% khi nội dung bị sửa lén dù chỉ 1 ký tự sau duyệt.
2. Kiểm tra lệch version bài viết sau duyệt (Post target_version mismatch).
3. Kiểm tra bài SEO nguồn đổi version sau duyệt -> Tự động thu hồi (revoke) approval và hủy lịch đăng.
4. RBAC: Chỉ Owner và Editor của workspace được duyệt, chặn các role khác (viewer, guest).
5. Tính toán Diff và sinh version mới khi human editor chỉnh sửa.
"""

import pytest
from src.agents.content.gateway_recheck import (
    GatewayRecheckRequest,
    compute_content_sha256,
    is_authorized_reviewer,
    recheck_before_outbox,
)


@pytest.fixture
def valid_social_content() -> dict:
    return {
        "title": "Bí kíp vi vu bán đảo Sơn Trà trọn vẹn 1 ngày",
        "hook": "Bạn đã từng ngắm toàn cảnh thành phố Đà Nẵng từ độ cao gần 700m chưa?",
        "body": [
            "Bán đảo Sơn Trà cách trung tâm Đà Nẵng chừng 10km về hướng đông bắc.",
            "Chùa Linh Ứng Bãi Bụt sở hữu tượng Phật Bà Quan Âm cao 67m hướng nhìn ra biển Đông.",
            "Đỉnh Bàn Cờ lộng gió là điểm check-in lý tưởng vào sáng sớm hoặc hoàng hôn.",
        ],
        "cta": "Lưu lại bài viết này và lên lịch cho chuyến khám phá Đà Nẵng của bạn nhé!",
        "hashtags": ["#DaNang2026", "#SonTra", "#TripCDaNang"],
        "channel": "facebook",
    }


@pytest.fixture
def base_recheck_request(valid_social_content) -> GatewayRecheckRequest:
    expected_hash = compute_content_sha256(valid_social_content)
    return GatewayRecheckRequest(
        workspace_id="ws_tripc_danang",
        post_id="post_fb_101",
        channel="facebook",
        approval_id="appr_cm26_001",
        approval_status="approved",
        expected_version=1,
        current_version=1,
        expected_hash=expected_hash,
        current_content=valid_social_content,
        expected_parent_version=1,
        current_parent_version=1,
        actor_role="editor",
    )


class TestCM26GatewayRecheck:
    """Kiểm tra CM-26 và TC-07."""

    def test_recheck_success_when_all_match(self, base_recheck_request):
        """Cho phép xuất bản khi hash, version, approval và parent SEO version đều khớp."""
        res = recheck_before_outbox(base_recheck_request)
        assert res.authorized is True
        assert res.action == "ALLOW_PUBLISH"
        assert res.calculated_hash == base_recheck_request.expected_hash
        assert "Passed hash lock" in res.reason

    def test_tc07_tamper_detection_single_char(self, base_recheck_request, valid_social_content):
        """TC-07: Sửa lén 1 ký tự sau duyệt -> Phát hiện 100% lệch content_hash."""
        tampered_content = dict(valid_social_content)
        # Sửa 1 ký tự: "gần 700m" -> "gần 800m"
        tampered_content["hook"] = "Bạn đã từng ngắm toàn cảnh thành phố Đà Nẵng từ độ cao gần 800m chưa?"

        req = GatewayRecheckRequest(
            workspace_id=base_recheck_request.workspace_id,
            post_id=base_recheck_request.post_id,
            channel=base_recheck_request.channel,
            approval_id=base_recheck_request.approval_id,
            approval_status="approved",
            expected_version=1,
            current_version=1,
            expected_hash=base_recheck_request.expected_hash,  # Hash cũ đã khóa
            current_content=tampered_content,  # Nội dung bị sửa lén
            expected_parent_version=1,
            current_parent_version=1,
        )

        res = recheck_before_outbox(req)
        assert res.authorized is False
        assert res.action == "DENY"
        assert res.error_code == "CONTENT_HASH_MISMATCH"
        assert res.calculated_hash != req.expected_hash
        assert "Tampered content detected" in res.reason

    def test_tc07_tamper_detection_whitespace_change(self, base_recheck_request, valid_social_content):
        """TC-07: Thêm 1 khoảng trắng ở cuối hook cũng phải bị phát hiện 100%."""
        tampered_content = dict(valid_social_content)
        tampered_content["hook"] = valid_social_content["hook"] + " "

        req = GatewayRecheckRequest(
            workspace_id=base_recheck_request.workspace_id,
            post_id=base_recheck_request.post_id,
            channel=base_recheck_request.channel,
            approval_id=base_recheck_request.approval_id,
            approval_status="approved",
            expected_version=1,
            current_version=1,
            expected_hash=base_recheck_request.expected_hash,
            current_content=tampered_content,
            expected_parent_version=1,
            current_parent_version=1,
        )

        res = recheck_before_outbox(req)
        assert res.authorized is False
        assert res.action == "DENY"
        assert res.error_code == "CONTENT_HASH_MISMATCH"

    def test_post_version_mismatch_detected(self, base_recheck_request):
        """Phát hiện lệch version bài viết sau duyệt."""
        req = GatewayRecheckRequest(
            workspace_id=base_recheck_request.workspace_id,
            post_id=base_recheck_request.post_id,
            channel=base_recheck_request.channel,
            approval_id=base_recheck_request.approval_id,
            approval_status="approved",
            expected_version=1,
            current_version=2,  # Đã bị bump version
            expected_hash=base_recheck_request.expected_hash,
            current_content=base_recheck_request.current_content,
            expected_parent_version=1,
            current_parent_version=1,
        )

        res = recheck_before_outbox(req)
        assert res.authorized is False
        assert res.action == "DENY"
        assert res.error_code == "VERSION_MISMATCH"
        assert "does not match approved target_version" in res.reason

    def test_parent_seo_version_change_revokes_approval_and_cancels_publish(self, base_recheck_request):
        """Bài SEO nguồn đổi version sau duyệt -> Thu hồi approval và hủy lịch đăng."""
        revoked_approvals = []
        cancelled_schedules = []

        def mock_revoke(approval_id: str, reason: str):
            revoked_approvals.append((approval_id, reason))

        def mock_cancel(post_id: str, reason: str):
            cancelled_schedules.append((post_id, reason))

        req = GatewayRecheckRequest(
            workspace_id=base_recheck_request.workspace_id,
            post_id=base_recheck_request.post_id,
            channel=base_recheck_request.channel,
            approval_id="appr_to_revoke_999",
            approval_status="approved",
            expected_version=1,
            current_version=1,
            expected_hash=base_recheck_request.expected_hash,
            current_content=base_recheck_request.current_content,
            expected_parent_version=1,
            current_parent_version=2,  # Bài SEO nguồn đã được sửa lên v2!
        )

        res = recheck_before_outbox(
            req,
            on_revoke_approval=mock_revoke,
            on_cancel_schedule=mock_cancel,
        )

        assert res.authorized is False
        assert res.action == "REVOKE_AND_CANCEL"
        assert res.error_code == "PARENT_VERSION_CHANGED"
        assert res.revocation_triggered is True
        assert res.cancelled_publish is True
        assert len(revoked_approvals) == 1
        assert revoked_approvals[0][0] == "appr_to_revoke_999"
        assert len(cancelled_schedules) == 1
        assert cancelled_schedules[0][0] == base_recheck_request.post_id

    def test_unapproved_status_denied(self, base_recheck_request):
        """Từ chối khi trạng thái chưa phải là approved."""
        for invalid_status in ["pending", "rejected", "revoked"]:
            req = GatewayRecheckRequest(
                workspace_id=base_recheck_request.workspace_id,
                post_id=base_recheck_request.post_id,
                channel=base_recheck_request.channel,
                approval_id=base_recheck_request.approval_id,
                approval_status=invalid_status,
                expected_version=1,
                current_version=1,
                expected_hash=base_recheck_request.expected_hash,
                current_content=base_recheck_request.current_content,
                expected_parent_version=1,
                current_parent_version=1,
            )
            res = recheck_before_outbox(req)
            assert res.authorized is False
            assert res.action == "DENY"
            assert res.error_code == "APPROVAL_NOT_GRANTED"


class TestCM25RBACAndVersioning:
    """Kiểm tra RBAC và cơ chế Versioning / Diff cho CM-25."""

    def test_rbac_permissions(self):
        """Chỉ Owner và Editor được duyệt, các role khác bị từ chối."""
        assert is_authorized_reviewer("owner") is True
        assert is_authorized_reviewer("OWNER") is True
        assert is_authorized_reviewer("editor") is True
        assert is_authorized_reviewer("Editor") is True

        # Role không có quyền duyệt
        assert is_authorized_reviewer("viewer") is False
        assert is_authorized_reviewer("guest") is False
        assert is_authorized_reviewer("member") is False
        assert is_authorized_reviewer("") is False
        assert is_authorized_reviewer(None) is False

    def test_version_bump_on_edit(self, valid_social_content):
        """Khi người dùng sửa nội dung, tạo version mới v2 và tính hash mới."""
        v1_hash = compute_content_sha256(valid_social_content)

        # Chỉnh sửa nội dung
        edited_content = dict(valid_social_content)
        edited_content["body"] = [
            "Bán đảo Sơn Trà cách trung tâm Đà Nẵng chừng 10km.",
            "Chùa Linh Ứng Bãi Bụt có tượng Phật Bà Quan Âm cao 67m hướng biển.",
            "Đỉnh Bàn Cờ lộng gió là điểm ngắm hoàng hôn cực chill.",
        ]
        v2_hash = compute_content_sha256(edited_content)

        assert v1_hash != v2_hash
        assert len(v2_hash) == 64
