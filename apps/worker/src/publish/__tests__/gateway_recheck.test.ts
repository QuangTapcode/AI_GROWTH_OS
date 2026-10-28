import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSha256Hex,
  isAuthorizedReviewer,
  recheckBeforeOutbox,
  type GatewayRecheckRequest,
} from '../gateway_recheck.ts';

describe('CM-26 / TC-07 Gateway Recheck & Content Hash Lock', () => {
  const baseContent = {
    title: 'Top 5 địa điểm du lịch Đà Nẵng 2026',
    hook: 'Bạn đã từng trải nghiệm bình minh trên đỉnh Sơn Trà chưa?',
    body: [
      'Bán đảo Sơn Trà với cung đường uốn lượn ven biển tuyệt đẹp.',
      'Bà Nà Hills mát mẻ quanh năm cùng cây Cầu Vàng trứ danh.',
      'Bãi biển Mỹ Khê cát trắng mịn màng thích hợp tắm biển buổi sớm.',
    ],
    cta: 'Lưu ngay lịch trình này để chuẩn bị cho chuyến đi Đà Nẵng sắp tới!',
    hashtags: ['#DaNang2026', '#DuLichDaNang', '#TripCDaNang'],
    channel: 'facebook',
  };

  const originalHash = computeSha256Hex(baseContent);

  const baseRequest: GatewayRecheckRequest = {
    workspace_id: 'ws_danang_01',
    post_id: 'post_fb_101',
    channel: 'Facebook',
    approval_id: 'appr_789',
    approval_status: 'approved',
    expected_version: 1,
    current_version: 1,
    expected_hash: originalHash,
    current_content: baseContent,
    expected_parent_version: 1,
    current_parent_version: 1,
    actor_role: 'editor',
  };

  it('1. Cho phép xuất bản khi mọi điều kiện hash, version, approval và parent SEO version đều khớp', async () => {
    const result = await recheckBeforeOutbox(baseRequest);
    assert.equal(result.authorized, true);
    assert.equal(result.action, 'ALLOW_PUBLISH');
    assert.equal(result.calculated_hash, originalHash);
  });

  it('2. TC-07: Phát hiện 100% khi nội dung bị sửa lén dù chỉ 1 ký tự sau duyệt (Content Hash Mismatch)', async () => {
    // Sửa lén 1 ký tự: đổi "2026" thành "2027" trong title
    const tamperedContent = {
      ...baseContent,
      title: 'Top 5 địa điểm du lịch Đà Nẵng 2027',
    };

    const tamperedReq: GatewayRecheckRequest = {
      ...baseRequest,
      current_content: tamperedContent,
    };

    const result = await recheckBeforeOutbox(tamperedReq);
    assert.equal(result.authorized, false);
    assert.equal(result.action, 'DENY');
    assert.equal(result.error_code, 'CONTENT_HASH_MISMATCH');
    assert.notEqual(result.calculated_hash, originalHash);
    assert.match(result.reason, /CONTENT_HASH_MISMATCH/);
  });

  it('3. TC-07: Phát hiện sửa lén dấu chấm hoặc khoảng trắng trong hook', async () => {
    const tamperedHookContent = {
      ...baseContent,
      hook: 'Bạn đã từng trải nghiệm bình minh trên đỉnh Sơn Trà chưa? ', // thêm 1 khoảng trắng
    };

    const result = await recheckBeforeOutbox({
      ...baseRequest,
      current_content: tamperedHookContent,
    });

    assert.equal(result.authorized, false);
    assert.equal(result.action, 'DENY');
    assert.equal(result.error_code, 'CONTENT_HASH_MISMATCH');
  });

  it('4. Phát hiện lệch version bài viết sau duyệt (Post Version Mismatch)', async () => {
    const staleVersionReq: GatewayRecheckRequest = {
      ...baseRequest,
      current_version: 2, // Post đã bị ai đó tăng version mà chưa duyệt lại
      expected_version: 1,
    };

    const result = await recheckBeforeOutbox(staleVersionReq);
    assert.equal(result.authorized, false);
    assert.equal(result.action, 'DENY');
    assert.equal(result.error_code, 'VERSION_MISMATCH');
    assert.match(result.reason, /VERSION_MISMATCH/);
  });

  it('5. Bài SEO nguồn đổi version sau duyệt -> Thu hồi approval và hủy lịch đăng ngay lập tức', async () => {
    let approvalRevoked = false;
    let scheduleCancelled = false;
    let revokeReasonCaptured = '';

    const staleParentReq: GatewayRecheckRequest = {
      ...baseRequest,
      expected_parent_version: 1,
      current_parent_version: 2, // Bài SEO gốc đã được cập nhật lên v2
    };

    const mockRevoke = async (approvalId: string, reason: string) => {
      approvalRevoked = true;
      revokeReasonCaptured = reason;
      assert.equal(approvalId, 'appr_789');
    };

    const mockCancel = async (postId: string, reason: string) => {
      scheduleCancelled = true;
      assert.equal(postId, 'post_fb_101');
    };

    const result = await recheckBeforeOutbox(staleParentReq, mockRevoke, mockCancel);

    assert.equal(result.authorized, false);
    assert.equal(result.action, 'REVOKE_AND_CANCEL');
    assert.equal(result.error_code, 'PARENT_VERSION_CHANGED');
    assert.equal(result.revocation_triggered, true);
    assert.equal(result.cancelled_publish, true);
    assert.equal(approvalRevoked, true);
    assert.equal(scheduleCancelled, true);
    assert.match(revokeReasonCaptured, /STALE_PARENT_SEO_VERSION/);
  });

  it('6. Từ chối khi trạng thái phê duyệt chưa phải là approved (pending, rejected, revoked)', async () => {
    for (const invalidStatus of ['pending', 'rejected', 'revoked'] as const) {
      const unapprovedReq: GatewayRecheckRequest = {
        ...baseRequest,
        approval_status: invalidStatus,
      };

      const result = await recheckBeforeOutbox(unapprovedReq);
      assert.equal(result.authorized, false);
      assert.equal(result.action, 'DENY');
      assert.equal(result.error_code, 'APPROVAL_NOT_GRANTED');
    }
  });

  it('7. RBAC: Chỉ Owner và Editor được phép duyệt, chặn Viewer và các role khác', () => {
    assert.equal(isAuthorizedReviewer('owner'), true);
    assert.equal(isAuthorizedReviewer('OWNER'), true);
    assert.equal(isAuthorizedReviewer('editor'), true);
    assert.equal(isAuthorizedReviewer('Editor'), true);

    // Bị chặn
    assert.equal(isAuthorizedReviewer('viewer'), false);
    assert.equal(isAuthorizedReviewer('member'), false);
    assert.equal(isAuthorizedReviewer('guest'), false);
    assert.equal(isAuthorizedReviewer(undefined), false);
    assert.equal(isAuthorizedReviewer(null), false);
  });
});
