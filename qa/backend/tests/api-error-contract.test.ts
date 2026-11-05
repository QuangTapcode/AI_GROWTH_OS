import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError, handleApiError } from "../../../apps/api/src/lib/errors";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Backend API error contract", () => {
  it("keeps the application error status, code, field errors, and request ID", async () => {
    const response = handleApiError(
      new AppError(422, "VALIDATION_FAILED", "Invalid input", { email: ["Invalid email"] }),
      "qa-request-001",
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid input",
        request_id: "qa-request-001",
        field_errors: { email: ["Invalid email"] },
      },
    });
  });

  it("converts Zod validation failures into a stable 422 response", async () => {
    const result = z.object({ email: z.string().email() }).safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
    if (result.success) return;

    const response = handleApiError(result.error, "qa-request-002");

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_FAILED",
        request_id: "qa-request-002",
        field_errors: { email: expect.any(Array) },
      },
    });
  });

  it.each([
    ["22P02", 400, "BAD_REQUEST"],
    ["23503", 422, "FOREIGN_KEY_VIOLATION"],
    ["23505", 409, "CONFLICT"],
  ] as Array<[string, number, string]>)("normalizes PostgreSQL error %s", async (code, status, expectedCode) => {
    const response = handleApiError({ code }, "qa-request-db");

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: expectedCode, request_id: "qa-request-db" },
    });
  });

  it("sanitizes unexpected failures in the response while logging the error", async () => {
    const error = new Error("sensitive database connection detail");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = handleApiError(error, "qa-request-500");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        request_id: "qa-request-500",
      },
    });
    expect(log).toHaveBeenCalledWith("[qa-request-500] Unhandled Error", error);
  });
});
