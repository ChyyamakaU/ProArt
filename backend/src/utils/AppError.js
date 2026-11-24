/**
 * Custom operational error for predictable, safe JSON API responses.
 */
export class AppError extends Error {
  /**
   * @param {number} statusCode - HTTP status code (e.g., 400, 404, 409).
   * @param {string} message - Safe user-facing error message.
   * @param {string} [code='INTERNAL_ERROR'] - Machine-readable error code.
   * @param {unknown} [details] - Optional safe validation error details.
   */
  constructor(statusCode, message, code = 'INTERNAL_ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
