import { createWorkspace, addWorkspaceMember } from "../src/modules/workspaces/service";
import { ensureUserExists } from "../src/modules/workspaces/repository";
import {
  createWorkspaceSource,
  listWorkspaceSources,
  getWorkspaceSourceDetail,
  reviewWorkspaceSource,
  deleteWorkspaceSource,
} from "../src/modules/sources/service";
import { AuthUser } from "../src/lib/auth";
import { AppError } from "../src/lib/errors";

const ownerA: AuthUser = {
  id: "aaaa1111-1111-4000-8000-000000000001",
  email: "owner.danang@tripc.local",
  name: "Owner Da Nang",
};

const editorB: AuthUser = {
  id: "bbbb2222-2222-4000-8000-000000000002",
  email: "editor.danang@tripc.local",
  name: "Editor Da Nang",
};

const viewerC: AuthUser = {
  id: "cccc3333-3333-4000-8000-000000000003",
  email: "viewer.danang@tripc.local",
  name: "Viewer Da Nang",
};

const foreignUserD: AuthUser = {
  id: "dddd4444-4444-4000-8000-000000000004",
  email: "foreign.tenant@other.local",
  name: "Foreign Tenant User",
};

async function runTests() {
  console.log("=== BẮT ĐẦU KIỂM THỬ TÍCH HỢP M02 SOURCES & KNOWLEDGE BASE ===");

  const timestamp = Date.now();

  // 1. Tạo Workspace A (TripC) và thiết lập các vai trò
  console.log("\n[Setup] Tạo Workspace A và gán roles...");
  const wsA = await createWorkspace(ownerA, {
    name: `TripC Knowledge Test ${timestamp}`,
    slug: `tripc-knowledge-${timestamp}`,
    timezone: "Asia/Bangkok",
    default_language: "en",
  });

  const memberB = await addWorkspaceMember(ownerA, wsA.id, {
    email: editorB.email,
    role: "editor",
    full_name: editorB.name,
  });
  editorB.id = memberB.user_id;

  const memberC = await addWorkspaceMember(ownerA, wsA.id, {
    email: viewerC.email,
    role: "viewer",
    full_name: viewerC.name,
  });
  viewerC.id = memberC.user_id;

  // Tạo Workspace B cho Foreign User D
  const wsB = await createWorkspace(foreignUserD, {
    name: `Competitor Workspace ${timestamp}`,
    slug: `competitor-${timestamp}`,
    timezone: "Asia/Bangkok",
    default_language: "en",
  });
  console.log("✅ Setup hoàn tất Workspace A và Workspace B.");

  // Test 1: Editor tải lên tài liệu mới
  console.log("\n[Test 1] Editor B tải lên tài liệu mới (danh mục 'locations')...");
  const source = await createWorkspaceSource(editorB, wsA.id, {
    title: "Son Tra Expat Housing & Living Areas Guide",
    kind: "text",
    url_or_blob: "https://tripc.vn/guides/son-tra-housing.pdf",
    category: "locations",
    content_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  });
  console.log("✅ Tạo thành công source:", source.id, "| Status:", source.status, "| Version:", source.version);
  if (source.status !== "imported" || source.version !== 1) {
    throw new Error("FAIL: Source ban đầu phải có status='imported' và version=1");
  }

  // Test 2: Viewer cố tình tải lên tài liệu -> Chặn 403
  console.log("\n[Test 2] RBAC: Viewer C cố tải lên tài liệu...");
  try {
    await createWorkspaceSource(viewerC, wsA.id, {
      title: "Viewer Unauthorized Upload",
      kind: "url",
      url_or_blob: "https://spam.com",
      category: "pricing",
    });
    throw new Error("FAIL: Viewer không được phép upload nhưng vẫn thành công!");
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 403) {
      console.log("✅ Viewer bị chặn đúng 403:", err.message);
    } else {
      throw err;
    }
  }

  // Test 3: Cross-tenant isolation: User D (Workspace B) cố truy cập source của Workspace A
  console.log("\n[Test 3] Tenant Isolation: User D (thuộc Workspace B) cố đọc source của Workspace A...");
  try {
    await getWorkspaceSourceDetail(foreignUserD, wsA.id, source.id);
    throw new Error("FAIL: Cross-tenant leak! User D đọc được dữ liệu Workspace A!");
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 403) {
      console.log("✅ Bị chặn đúng 403 Forbidden:", err.message);
    } else {
      throw err;
    }
  }

  // Test 4: RBAC: Editor cố duyệt tài liệu -> Chặn 403
  console.log("\n[Test 4] RBAC: Editor B cố duyệt tài liệu...");
  try {
    await reviewWorkspaceSource(editorB, wsA.id, source.id, {
      decision: "approved",
      expected_version: 1,
    });
    throw new Error("FAIL: Editor không được phép duyệt nhưng vẫn thành công!");
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 403) {
      console.log("✅ Editor bị chặn duyệt đúng 403:", err.message);
    } else {
      throw err;
    }
  }

  // Test 5: Optimistic Concurrency Control: Owner duyệt với stale expected_version
  console.log("\n[Test 5] Concurrency: Owner A duyệt với stale expected_version = 99...");
  try {
    await reviewWorkspaceSource(ownerA, wsA.id, source.id, {
      decision: "approved",
      expected_version: 99,
    });
    throw new Error("FAIL: Sai version nhưng không bị chặn 409!");
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 409 && err.code === "VERSION_CONFLICT") {
      console.log("✅ Chặn đúng 409 Conflict:", err.message);
    } else {
      throw err;
    }
  }

  // Test 6: Owner duyệt thành công với expected_version = 1
  console.log("\n[Test 6] Owner A duyệt hợp lệ với expected_version = 1...");
  const approvedSource = await reviewWorkspaceSource(ownerA, wsA.id, source.id, {
    decision: "approved",
    expected_version: 1,
    review_reason: "Verified by TripC local experts",
  });
  console.log("✅ Duyệt thành công! New Status:", approvedSource.status, "| New Version:", approvedSource.version);
  if (approvedSource.status !== "approved" || approvedSource.version !== 2) {
    throw new Error("FAIL: Sau khi duyệt status phải là 'approved' và version phải là 2!");
  }

  // Test 7: Owner thu hồi tài liệu đã duyệt (revoked)
  console.log("\n[Test 7] Owner A thu hồi tài liệu (revoked) với expected_version = 2...");
  const revokedSource = await reviewWorkspaceSource(ownerA, wsA.id, source.id, {
    decision: "revoked",
    expected_version: 2,
    review_reason: "Pricing outdated in 2026",
  });
  console.log("✅ Thu hồi thành công! New Status:", revokedSource.status, "| New Version:", revokedSource.version);
  if (revokedSource.status !== "revoked" || revokedSource.version !== 3) {
    throw new Error("FAIL: Sau khi revoke status phải là 'revoked' và version phải là 3!");
  }

  // Test 8: Xóa tài liệu (Soft-delete)
  console.log("\n[Test 8] Owner A xóa tài liệu...");
  const delRes = await deleteWorkspaceSource(ownerA, wsA.id, source.id);
  console.log("✅ Xóa thành công:", delRes.message);

  // Test 9: Kiểm tra tài liệu đã xóa không còn xuất hiện trong danh sách active
  console.log("\n[Test 9] Liệt kê tài liệu active sau khi xóa...");
  const list = await listWorkspaceSources(ownerA, wsA.id);
  const found = list.items.find((item) => item.id === source.id);
  if (found) {
    throw new Error("FAIL: Tài liệu đã xóa mềm vẫn hiển thị trong danh sách active!");
  }
  console.log("✅ Tài liệu đã bị ẩn khỏi danh sách active (Soft delete OK).");

  console.log("\n========================================================");
  console.log("🎉 TẤT CẢ TEST CASES CỦA W1-TQ-04 ĐỀU ĐẠT CHUẨN 100%!");
  console.log("========================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("❌ LỖI KIỂM THỬ:", err);
  process.exit(1);
});
