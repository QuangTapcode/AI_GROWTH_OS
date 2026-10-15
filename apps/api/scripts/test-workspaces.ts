import {
  createWorkspace,
  listUserWorkspaces,
  getWorkspaceDetail,
  listWorkspaceMembers,
  addWorkspaceMember,
  revokeWorkspaceMember,
} from "../src/modules/workspaces/service";
import { AuthUser } from "../src/lib/auth";
import { AppError } from "../src/lib/errors";

const userA: AuthUser = {
  id: "11111111-1111-4000-8000-000000000001",
  email: "owner.a@tripc.local",
  name: "Owner A",
};

const userB: AuthUser = {
  id: "22222222-2222-4000-8000-000000000002",
  email: "editor.b@tripc.local",
  name: "Editor B",
};

const userC: AuthUser = {
  id: "33333333-3333-4000-8000-000000000003",
  email: "viewer.c@tripc.local",
  name: "Viewer C",
};

async function runTests() {
  console.log("=== BẮT ĐẦU KIỂM THỬ TÍCH HỢP M01 WORKSPACES & MEMBERS ===");

  const timestamp = Date.now();
  const slug = `tripc-test-${timestamp}`;

  // 1. Tạo Workspace bởi User A
  console.log("\n[Test 1] User A tạo workspace mới...");
  const ws = await createWorkspace(userA, {
    name: `TripC Da Nang ${timestamp}`,
    slug,
    timezone: "Asia/Bangkok",
    default_language: "en",
  });
  console.log("✅ Tạo thành công workspace:", ws.id, ws.name, ws.slug);

  // 2. Kiểm tra danh sách workspace của User A
  console.log("\n[Test 2] User A liệt kê workspaces...");
  const listA = await listUserWorkspaces(userA);
  const foundA = listA.items.find((item) => item.id === ws.id);
  if (!foundA) throw new Error("User A không tìm thấy workspace vừa tạo!");
  console.log("✅ User A thấy workspace trong danh sách.");

  // 3. Kiểm tra Tenant Isolation với User B
  console.log("\n[Test 3] Kiểm tra Tenant Isolation: User B liệt kê workspaces...");
  const listB = await listUserWorkspaces(userB);
  const foundB = listB.items.find((item) => item.id === ws.id);
  if (foundB) throw new Error("FAIL: User B thấy workspace của User A!");
  console.log("✅ User B không thấy workspace của User A (Tenant Isolation OK).");

  console.log("\n[Test 4] User B truy cập chi tiết workspace của User A...");
  try {
    await getWorkspaceDetail(userB, ws.id);
    throw new Error("FAIL: User B truy cập được workspace mà không có quyền!");
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 403) {
      console.log("✅ Bị chặn đúng với mã 403 Forbidden:", err.message);
    } else {
      throw err;
    }
  }

  // 4. User A thêm User B với quyền 'editor'
  console.log("\n[Test 5] User A (Owner) thêm User B làm 'editor'...");
  const addRes = await addWorkspaceMember(userA, ws.id, {
    email: userB.email,
    role: "editor",
    full_name: userB.name,
  });
  console.log("✅ Thêm thành công member:", addRes.user_id, addRes.role);

  // 5. Kiểm tra User B giờ đây đã có quyền truy cập
  console.log("\n[Test 6] User B truy cập chi tiết sau khi được thêm...");
  const wsDetailB = await getWorkspaceDetail(userB, ws.id);
  console.log("✅ User B đọc được workspace chi tiết:", wsDetailB.name);

  // 6. User B (Editor) cố thêm User C -> Phải bị chặn 403
  console.log("\n[Test 7] RBAC: User B (Editor) cố thêm member...");
  try {
    await addWorkspaceMember(userB, ws.id, {
      email: userC.email,
      role: "viewer",
    });
    throw new Error("FAIL: Editor không được phép thêm member nhưng lại thành công!");
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 403) {
      console.log("✅ Editor bị chặn đúng với 403:", err.message);
    } else {
      throw err;
    }
  }

  // 7. User A thêm User C làm 'viewer'
  console.log("\n[Test 8] User A (Owner) thêm User C làm 'viewer'...");
  const memberC = await addWorkspaceMember(userA, ws.id, {
    email: userC.email,
    role: "viewer",
    full_name: userC.name,
  });
  // Gán id chính xác của User C theo cơ sở dữ liệu
  userC.id = memberC.user_id;

  const members = await listWorkspaceMembers(userA, ws.id);
  console.log(`✅ Danh sách thành viên hiện tại (${members.items.length}):`);
  members.items.forEach((m) => console.log(`   - ${m.user.full_name} (${m.user.email}) -> Role: ${m.role}`));

  // 8. User A thu hồi quyền của User C
  console.log("\n[Test 9] User A thu hồi quyền của User C...");
  await revokeWorkspaceMember(userA, ws.id, userC.id);
  console.log("✅ Đã thu hồi quyền của User C.");

  console.log("\n[Test 10] User C gửi request kế tiếp...");
  try {
    await getWorkspaceDetail(userC, ws.id);
    throw new Error("FAIL: User C sau khi bị revoke vẫn truy cập được!");
  } catch (err: any) {
    if (err instanceof AppError && err.statusCode === 403) {
      console.log("✅ User C bị chặn ngay lập tức ở request kế tiếp (403 Forbidden):", err.message);
    } else {
      throw err;
    }
  }

  // 9. Không cho phép thu hồi Owner duy nhất
  console.log("\n[Test 11] User A cố thu hồi chính mình (Owner duy nhất)...");
  try {
    await revokeWorkspaceMember(userA, ws.id, userA.id);
    throw new Error("FAIL: Cho phép thu hồi Owner cuối cùng!");
  } catch (err: any) {
    if (err instanceof AppError && err.code === "CANNOT_REVOKE_LAST_OWNER") {
      console.log("✅ Bị chặn đúng quy tắc nghiệp vụ:", err.message);
    } else {
      throw err;
    }
  }

  console.log("\n========================================================");
  console.log("🎉 TẤT CẢ 11 TEST CASES CỦA W1-TQ-03 ĐỀU ĐẠT CHUẨN 100%!");
  console.log("========================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("❌ LỖI KIỂM THỬ:", err);
  process.exit(1);
});
