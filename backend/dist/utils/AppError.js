"use strict";
/* ======================================
🔥 APP ERROR CLASS (ELITE VERSION)
====================================== */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAppError = exports.internalError = exports.tooManyRequests = exports.conflict = exports.notFound = exports.forbidden = exports.unauthorized = exports.badRequest = exports.AppError = void 0;
class AppError extends Error {
    constructor(message, statusCode = 500, code, details) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true; // 🔥 trusted error
        this.code = code;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
/* ======================================
🔥 HELPER FUNCTIONS (PRO LEVEL)
====================================== */
const badRequest = (message = "Bad Request", details) => new AppError(message, 400, "BAD_REQUEST", details);
exports.badRequest = badRequest;
const unauthorized = (message = "Unauthorized") => new AppError(message, 401, "UNAUTHORIZED");
exports.unauthorized = unauthorized;
const forbidden = (message = "Forbidden") => new AppError(message, 403, "FORBIDDEN");
exports.forbidden = forbidden;
const notFound = (message = "Not Found") => new AppError(message, 404, "NOT_FOUND");
exports.notFound = notFound;
const conflict = (message = "Conflict") => new AppError(message, 409, "CONFLICT");
exports.conflict = conflict;
const tooManyRequests = (message = "Too many requests") => new AppError(message, 429, "RATE_LIMIT");
exports.tooManyRequests = tooManyRequests;
const internalError = (message = "Internal Server Error") => new AppError(message, 500, "INTERNAL_ERROR");
exports.internalError = internalError;
/* ======================================
🔥 TYPE GUARD
====================================== */
const isAppError = (err) => {
    return err instanceof AppError;
};
exports.isAppError = isAppError;
