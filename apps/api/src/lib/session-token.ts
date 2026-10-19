import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";

/**
 * Access token đăng nhập: JWT HS256 ký bằng AUTH_SECRET (node:crypto, không thêm dependency).
 * Token stateless, hết hạn sau AUTH_TOKEN_TTL_SECONDS (mặc định 8 giờ).
 */
const ISSUER = "ai-growth-os-api";
const AUDIENCE = "ai-growth-os-web";
const DEFAULT_TTL_SECONDS = 8 * 60 * 60;
const MIN_SECRET_LENGTH = 32;
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export interface SessionClaims {
  sub: string;
  email: string;
  name: string;
  /** auth_sessions.id — cho phép logout/đổi mật khẩu thu hồi token trước hạn */
  sid?: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface IssuedSessionToken {
  token: string;
  expiresAt: string;
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new AppError(500, "AUTH_NOT_CONFIGURED", "AUTH_SECRET must be set to at least 32 characters");
  }
  return secret;
}

function getTtlSeconds(): number {
  const ttl = Number(process.env.AUTH_TOKEN_TTL_SECONDS);
  return Number.isInteger(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_SECONDS;
}

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function looksLikeSessionToken(token: string): boolean {
  return JWT_SHAPE.test(token);
}

export function sessionExpiry(now: Date = new Date()): Date {
  return new Date((Math.floor(now.getTime() / 1000) + getTtlSeconds()) * 1000);
}

export function issueSessionToken(
  user: { id: string; email: string; name: string },
  now: Date = new Date(),
  sessionId?: string
): IssuedSessionToken {
  const secret = getSecret();
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + getTtlSeconds();
  const claims: SessionClaims = { sub: user.id, email: user.email, name: user.name, iat, exp, iss: ISSUER, aud: AUDIENCE };
  if (sessionId) claims.sid = sessionId;
  const unsigned = `${encodeSegment({ alg: "HS256", typ: "JWT" })}.${encodeSegment(claims)}`;
  return { token: `${unsigned}.${sign(unsigned, secret)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifySessionToken(token: string, now: Date = new Date()): SessionClaims {
  const invalid = (message: string) => new AppError(401, "UNAUTHORIZED", message);
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    throw invalid("Signed token verification is not configured");
  }

  const [headerB64, payloadB64, signature] = token.split(".");
  const expected = Buffer.from(sign(`${headerB64}.${payloadB64}`, secret));
  const actual = Buffer.from(signature ?? "");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw invalid("Invalid token signature");
  }

  let header: { alg?: string; typ?: string };
  let claims: Partial<SessionClaims>;
  try {
    header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    throw invalid("Malformed token");
  }

  if (header.alg !== "HS256" || header.typ !== "JWT") throw invalid("Unsupported token algorithm");
  if (claims.iss !== ISSUER || claims.aud !== AUDIENCE) throw invalid("Token issuer or audience mismatch");
  if (typeof claims.sub !== "string" || typeof claims.exp !== "number") throw invalid("Malformed token claims");
  if (claims.exp <= Math.floor(now.getTime() / 1000)) throw invalid("Token expired");

  return claims as SessionClaims;
}
