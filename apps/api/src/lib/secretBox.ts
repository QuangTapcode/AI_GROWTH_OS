import crypto from "node:crypto";

/**
 * Mã hóa bí mật (API key LLM, token kênh) trước khi lưu DB: AES-256-GCM, khóa lấy từ
 * TOKEN_ENCRYPTION_KEY (bắt buộc ở production). Định dạng: `enc:v1:<iv>:<tag>:<cipher>` (hex).
 */
const PREFIX = "enc:v1:";

function encryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY || (process.env.NODE_ENV === "production" ? "" : process.env.AUTH_SECRET || "");
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be set to store secrets");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function sealSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
}

/** Trả plaintext. Giá trị cũ chưa mã hóa (dữ liệu trước migration 029) được trả nguyên trạng. */
export function openSecret(stored: string | null | undefined): string | undefined {
  if (!stored) return undefined;
  if (!stored.startsWith(PREFIX)) return stored;
  const [ivHex, tagHex, dataHex] = stored.slice(PREFIX.length).split(":");
  if (!ivHex || !tagHex || dataHex === undefined) throw new Error("Malformed sealed secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

/** Hiển thị an toàn trên UI: không bao giờ trả khóa thật về trình duyệt. */
export function maskSecret(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  const tail = plaintext.slice(-4);
  return `••••${tail}`;
}
