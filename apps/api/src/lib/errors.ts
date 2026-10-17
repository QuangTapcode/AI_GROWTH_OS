import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { ZodError } from "zod";

export interface FieldErrors {
    [field: string]: string[];
}

export interface ApiErrorResponse {
    error: {
        code: string;
        message: string;
        request_id: string;
        field_errors?: FieldErrors;
        detail?: unknown;
    };
}

export class AppError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly code: string, message: string,
        public readonly fieldErrors?: FieldErrors,
        public readonly detail?: unknown
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export class NotFoundError extends AppError {
    constructor(message = "Resource not found") {
        super(404, "NOT_FOUND", message);
    }
}

export class ForbiddenError extends AppError {
    constructor(message = "Forbidden") {
        super(403, "FORBIDDEN", message);
    }
}

export class ConflictError extends AppError {
    constructor(message = "Conflict") {
        super(409, "CONFLICT", message);
    }
}

export class ValidationError extends AppError {
    constructor(message = "Validation failed", fieldErrors?: FieldErrors) {
        super(422, "VALIDATION_ERROR", message, fieldErrors);
    }
}

export function createErrorResponse(
    statusCode: number,
    code: string,
    message: string,
    fieldErrors?: FieldErrors,
    detail?: unknown,
    requestId: string = uuidv4()
): NextResponse<ApiErrorResponse> {
    return NextResponse.json(
        {
            error: {
                code,
                message,
                request_id: requestId,
                ...(fieldErrors ? { field_errors: fieldErrors } : {}),
                ...(detail ? { detail } : {}),
            },
        },
        { status: statusCode }
    );
}

export function handleApiError(err: unknown, requestId: string = uuidv4()): NextResponse<ApiErrorResponse> {
    if (err instanceof AppError) {
        return createErrorResponse(
            err.statusCode,
            err.code,
            err.message,
            err.fieldErrors,
            err.detail,
            requestId
        );
    }

    if (err instanceof ZodError) {
        const fieldErrors: FieldErrors = {};
        for (const issue of err.issues) {
            const field = issue.path.join(".") || "(root)";
            fieldErrors[field] = fieldErrors[field] || [];
            fieldErrors[field].push(issue.message);
        }
        return createErrorResponse(
            422,
            "VALIDATION_FAILED",
            "Invalid request parameters or payload",
            fieldErrors,
            undefined,
            requestId
        );
    }

    // Bắt và chuẩn hóa các mã lỗi thường gặp từ Database Driver (PostgreSQL)
    const dbErrCode = (err as any)?.code;
    if (dbErrCode === "22P02") {
        return createErrorResponse(
            400,
            "BAD_REQUEST",
            "Invalid parameter format or UUID syntax",
            undefined,
            undefined,
            requestId
        );
    }
    if (dbErrCode === "23503") {
        return createErrorResponse(
            422,
            "FOREIGN_KEY_VIOLATION",
            "Referenced foreign entity does not exist",
            undefined,
            undefined,
            requestId
        );
    }
    if (dbErrCode === "23505") {
        return createErrorResponse(
            409,
            "CONFLICT",
            "Resource already exists",
            undefined,
            undefined,
            requestId
        );
    }

    // Lỗi không lường trước (Internal Server Error)
    console.error(`[${requestId}] Unhandled Error`, err);
    return createErrorResponse(
        500,
        "INTERNAL_ERROR",
        "An unexpected error occurred.",
        undefined,
        undefined,
        requestId
    );
}