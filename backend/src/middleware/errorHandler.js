import multer from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

/**
 * Wraps an async Express route handler so rejected promises are forwarded
 * cleanly to the centralized error boundary.
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<unknown>} fn
 * @returns {import('express').RequestHandler}
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Express 404 handler for unmatched routes.
 *
 * @type {import('express').RequestHandler}
 */
export function notFoundHandler(_req, res) {
  res.status(404).json({
    error: 'Route not found.',
    code: 'NOT_FOUND',
  });
}

/**
 * Maps known PostgreSQL SQLSTATE errors to safe, non-leaking HTTP responses.
 *
 * @param {any} err
 * @returns {{ statusCode: number, error: string, code: string } | null}
 */
function mapPostgresError(err) {
  if (!err || typeof err.code !== 'string') {
    return null;
  }

  switch (err.code) {
    case '23505':
      return {
        statusCode: 409,
        error: 'A conflicting record already exists.',
        code: 'CONFLICT',
      };
    case '23503':
      return {
        statusCode: 400,
        error: 'Referenced resource does not exist.',
        code: 'INVALID_REFERENCE',
      };
    case '22P02':
    case '23514':
      return {
        statusCode: 400,
        error: 'Invalid input value.',
        code: 'INVALID_INPUT',
      };
    case '57P01':
    case '57P02':
    case '57P03':
    case '53300':
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
      return {
        statusCode: 503,
        error: 'Service temporarily unavailable.',
        code: 'SERVICE_UNAVAILABLE',
      };
    default:
      return null;
  }
}

/**
 * Global Express error-handling boundary.
 * Guarantees standardized `{ error, code }` JSON responses without ever leaking
 * stack traces or raw SQL errors in production.
 *
 * @type {import('express').ErrorRequestHandler}
 */
export function errorHandler(err, _req, res, _next) {
  if (res.headersSent) {
    return;
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // 1. Operational application errors
  if (err instanceof AppError) {
    const payload = {
      error: err.message,
      code: err.code,
    };
    if (err.details !== undefined) {
      payload.details = err.details;
    }
    res.status(err.statusCode).json(payload);
    return;
  }

  // 2. Direct Zod validation errors (defense in depth)
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Request validation failed.',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  // 3. Multer file upload errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: 'Uploaded file exceeds the maximum allowed size of 5MB.',
        code: 'FILE_TOO_LARGE',
      });
      return;
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({
        error: 'Unexpected file field in upload request.',
        code: 'UNEXPECTED_FILE_FIELD',
      });
      return;
    }
    res.status(400).json({
      error: 'File upload failed.',
      code: 'UPLOAD_ERROR',
    });
    return;
  }

  // 4. Malformed JSON or oversized payload from express.json()
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({
      error: 'Malformed JSON payload.',
      code: 'INVALID_JSON',
    });
    return;
  }

  if (err?.type === 'entity.too.large') {
    res.status(413).json({
      error: 'Request payload is too large.',
      code: 'PAYLOAD_TOO_LARGE',
    });
    return;
  }

  // 4b. Static asset / HTTP errors (e.g., dotfile denial or missing upload)
  if (err?.status === 403 || err?.statusCode === 403) {
    res.status(403).json({
      error: 'Access forbidden.',
      code: 'FORBIDDEN',
    });
    return;
  }

  if (err?.status === 404 || err?.statusCode === 404) {
    res.status(404).json({
      error: 'Resource not found.',
      code: 'NOT_FOUND',
    });
    return;
  }

  // 5. Known PostgreSQL driver errors (never leak SQL text or constraint names)
  const pgMapped = mapPostgresError(err);
  if (pgMapped) {
    if (!isProduction) {
      console.error('[DB_ERROR]', err.code, err.message);
    }
    res.status(pgMapped.statusCode).json({
      error: pgMapped.error,
      code: pgMapped.code,
    });
    return;
  }

  // 6. Unexpected server error
  console.error('[UNHANDLED_ERROR]', isProduction ? err?.message : err);

  res.status(500).json({
    error: isProduction
      ? 'An unexpected internal error occurred.'
      : err?.message || 'An unexpected internal error occurred.',
    code: 'INTERNAL_SERVER_ERROR',
  });
}
