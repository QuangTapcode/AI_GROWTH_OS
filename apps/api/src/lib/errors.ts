import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

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
    
        //Lỗi không lường trước (Internal Server Error)
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