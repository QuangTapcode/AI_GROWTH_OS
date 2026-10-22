import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Hash mật khẩu bằng scrypt (node:crypto), định dạng lưu DB:
 *   scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>
 * Tham số nằm trong chuỗi hash để sau này tăng cost mà không vỡ hash cũ.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export const MIN_PASSWORD_LENGTH = 8;

function deriveKey(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored ?? "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64url");
  if (expected.length !== KEY_LENGTH) return false;
  const key = await deriveKey(password, Buffer.from(saltB64, "base64url"), Number(n), Number(r), Number(p));
  return timingSafeEqual(key, expected);
}

/**
 * Hash giả dùng khi email không tồn tại: vẫn chạy scrypt để thời gian phản hồi
 * không tiết lộ email nào có tài khoản.
 */
let dummyHash: Promise<string> | null = null;
export function getDummyPasswordHash(): Promise<string> {
  if (!dummyHash) dummyHash = hashPassword(randomBytes(24).toString("base64url"));
  return dummyHash;
}
