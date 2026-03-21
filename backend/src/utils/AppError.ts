/* ======================================
🔥 APP ERROR CLASS (ELITE VERSION)
====================================== */

export class AppError extends Error {
  statusCode: number
  isOperational: boolean
  code?: string
  details?: any

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: any
  ) {
    super(message)

    this.statusCode = statusCode
    this.isOperational = true // 🔥 trusted error
    this.code = code
    this.details = details

    Error.captureStackTrace(this, this.constructor)
  }
}

/* ======================================
🔥 HELPER FUNCTIONS (PRO LEVEL)
====================================== */

export const badRequest = (message = "Bad Request", details?: any) =>
  new AppError(message, 400, "BAD_REQUEST", details)

export const unauthorized = (message = "Unauthorized") =>
  new AppError(message, 401, "UNAUTHORIZED")

export const forbidden = (message = "Forbidden") =>
  new AppError(message, 403, "FORBIDDEN")

export const notFound = (message = "Not Found") =>
  new AppError(message, 404, "NOT_FOUND")

export const conflict = (message = "Conflict") =>
  new AppError(message, 409, "CONFLICT")

export const tooManyRequests = (message = "Too many requests") =>
  new AppError(message, 429, "RATE_LIMIT")

export const internalError = (message = "Internal Server Error") =>
  new AppError(message, 500, "INTERNAL_ERROR")

/* ======================================
🔥 TYPE GUARD
====================================== */

export const isAppError = (err: any): err is AppError => {
  return err instanceof AppError
}