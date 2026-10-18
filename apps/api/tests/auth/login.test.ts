import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const repoState = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; full_name: string; avatar_url: null; password_hash: string | null },
  logins: [] as string[],
}));

vi.mock("../../src/modules/auth/repository", () => ({
  findCredentialsByEmail: vi.fn(async (email: string) =>
    repoState.user && repoState.user.email === email.toLowerCase() ? repoState.user : null
  ),
  recordLogin: vi.fn(async (id: string) => {
    repoState.logins.push(id);
  }),
  getUserProfile: vi.fn(),
  listActiveMemberships: vi.fn(),
  setPasswordHash: vi.fn(),
}));

import { hashPassword, verifyPassword } from "../../src/lib/password";
import { issueSessionToken, verifySessionToken } from "../../src/lib/session-token";
import { authenticateUser } from "../../src/lib/auth";
import { login, resetLoginThrottle } from "../../src/modules/auth/service";

const SECRET = "test_secret_value_that_is_long_enough_for_hs256";
const USER_ID = "a0000000-0000-4000-8000-000000000001";

function bearer(token: string) {
  return new NextRequest("http://localhost:4000/v1/workspaces", { headers: { authorization: `Bearer ${token}` } });
}

describe("Auth: password hashing", () => {
  it("hash không chứa plaintext và verify đúng/sai", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("từ chối mật khẩu ngắn hơn 8 ký tự và hash hỏng", async () => {
    await expect(hashPassword("short")).rejects.toThrow(/at least 8/);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
  });
});

describe("Auth: signed session token", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
  });

  it("token hợp lệ được authenticateUser chấp nhận cả ở production", () => {
    const { token } = issueSessionToken({ id: USER_ID, email: "owner@gmail.com", name: "Owner" });
    const prevEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = "production";
    delete process.env.ALLOW_INSECURE_DEV_AUTH;
    try {
      expect(authenticateUser(bearer(token))).toEqual({ id: USER_ID, email: "owner@gmail.com", name: "Owner" });
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
    }
  });

  it("chặn token bị sửa payload, sai secret và hết hạn", () => {
    const { token } = issueSessionToken({ id: USER_ID, email: "owner@gmail.com", name: "Owner" });
    const [header, , signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: "attacker", email: "x", name: "x", iat: 0, exp: 9999999999, iss: "ai-growth-os-api", aud: "ai-growth-os-web" })
    ).toString("base64url");
    expect(() => authenticateUser(bearer(`${header}.${forgedPayload}.${signature}`))).toThrowError(
      expect.objectContaining({ statusCode: 401, code: "UNAUTHORIZED" })
    );

    process.env.AUTH_SECRET = "another_secret_value_that_is_also_long_enough";
    expect(() => verifySessionToken(token)).toThrowError(/signature/);

    process.env.AUTH_SECRET = SECRET;
    const old = issueSessionToken({ id: USER_ID, email: "o@gmail.com", name: "O" }, new Date(Date.now() - 9 * 3600 * 1000));
    expect(() => verifySessionToken(old.token)).toThrowError(/expired/);
  });

  it("không có AUTH_SECRET thì token có dạng JWT bị từ chối 401", () => {
    const { token } = issueSessionToken({ id: USER_ID, email: "o@gmail.com", name: "O" });
    delete process.env.AUTH_SECRET;
    expect(() => authenticateUser(bearer(token))).toThrowError(
      expect.objectContaining({ statusCode: 401, code: "UNAUTHORIZED" })
    );
  });
});

describe("Auth: POST /v1/auth/login service", () => {
  beforeAll(async () => {
    process.env.AUTH_SECRET = SECRET;
    repoState.user = {
      id: USER_ID,
      email: "owner.tripc.demo@gmail.com",
      full_name: "Linh Tran",
      avatar_url: null,
      password_hash: await hashPassword("s3cret-pass"),
    };
  });

  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
    resetLoginThrottle();
    repoState.logins = [];
  });

  afterEach(() => {
    resetLoginThrottle();
  });

  it("đúng email (không phân biệt hoa thường) + mật khẩu → trả token dùng được", async () => {
    const res = await login({ email: "Owner.TripC.Demo@gmail.com", password: "s3cret-pass" }, "127.0.0.1");
    expect(res.token_type).toBe("Bearer");
    expect(res.user).toMatchObject({ id: USER_ID, email: "owner.tripc.demo@gmail.com" });
    expect(new Date(res.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(verifySessionToken(res.access_token).sub).toBe(USER_ID);
    expect(repoState.logins).toEqual([USER_ID]);
  });

  it("sai mật khẩu và email không tồn tại trả cùng lỗi 401 INVALID_CREDENTIALS", async () => {
    for (const body of [
      { email: "owner.tripc.demo@gmail.com", password: "wrong" },
      { email: "nobody@gmail.com", password: "s3cret-pass" },
    ]) {
      await expect(login(body, "127.0.0.1")).rejects.toMatchObject({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
    }
    expect(repoState.logins).toEqual([]);
  });

  it("user chưa đặt mật khẩu không đăng nhập được", async () => {
    const saved = repoState.user!.password_hash;
    repoState.user!.password_hash = null;
    try {
      await expect(login({ email: "owner.tripc.demo@gmail.com", password: "" + saved }, "127.0.0.1")).rejects.toMatchObject({
        code: "INVALID_CREDENTIALS",
      });
    } finally {
      repoState.user!.password_hash = saved;
    }
  });

  it("payload sai định dạng → 422 VALIDATION_FAILED", async () => {
    await expect(login({ email: "not-an-email" }, "127.0.0.1")).rejects.toMatchObject({
      statusCode: 422,
      code: "VALIDATION_FAILED",
    });
  });

  it("khóa 15 phút sau 10 lần sai liên tiếp, kể cả khi lần sau đúng mật khẩu", async () => {
    for (let i = 0; i < 10; i++) {
      await expect(login({ email: "owner.tripc.demo@gmail.com", password: "wrong" }, "10.0.0.1")).rejects.toMatchObject({
        code: "INVALID_CREDENTIALS",
      });
    }
    await expect(login({ email: "owner.tripc.demo@gmail.com", password: "s3cret-pass" }, "10.0.0.2")).rejects.toMatchObject({
      statusCode: 429,
      code: "TOO_MANY_ATTEMPTS",
    });
  });
});
