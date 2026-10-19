import pool from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

/**
 * Đặt mật khẩu đăng nhập cho user đã tồn tại.
 *   NEW_PASSWORD=... npm run user:set-password -- someone@gmail.com
 * Mật khẩu đọc từ biến môi trường để không nằm trong tham số dòng lệnh.
 */
async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const password = process.env.NEW_PASSWORD || "";
  if (!email) throw new Error("Usage: NEW_PASSWORD=... npm run user:set-password -- <email>");
  if (!password) throw new Error("NEW_PASSWORD is not set");

  const hash = await hashPassword(password);
  const res = await pool.query(
    `UPDATE users SET password_hash = $1, password_updated_at = NOW(), updated_at = NOW()
     WHERE LOWER(email) = $2 RETURNING id`,
    [hash, email]
  );
  if (res.rowCount === 0) throw new Error(`No user with email ${email}`);
  console.log(`Password updated for ${email}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
