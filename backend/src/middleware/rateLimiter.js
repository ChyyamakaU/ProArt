import rateLimit from 'express-rate-limit';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

/**
 * Creates a standardized JSON rate-limiter handler.
 *
 * @param {string} message - Safe user-facing rate-limit message.
 * @returns {import('express-rate-limit').RateLimitExceededEventHandler}
 */
function createLimitHandler(message) {
  return (_req, res) => {
    res.status(429).json({
      error: message,
      code: 'RATE_LIMIT_EXCEEDED',
    });
  };
}

/**
 * Factory for generating configurable rate-limiter middleware groups.
 * Useful for both production defaults and isolated automated tests.
 *
 * @param {{
 *   apiMax?: number,
 *   strictMax?: number,
 *   authMax?: number,
 *   windowMs?: number,
 * }} [options]
 */
export function createRateLimiters(options = {}) {
  const windowMs = options.windowMs ?? FIFTEEN_MINUTES_MS;
  const apiMax = options.apiMax ?? 100;
  const strictMax = options.strictMax ?? 10;
  const authMax = options.authMax ?? 10;

  /**
   * General API rate limiter: 100 requests per 15 minutes per IP.
   */
  const apiLimiter = rateLimit({
    windowMs,
    limit: apiMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: createLimitHandler('Too many API requests. Please try again later.'),
  });

  /**
   * Strict write/submission rate limiter: 10 requests per 15 minutes per IP.
   * Applied to worker creation, updates, work sample uploads, and review submissions.
   */
  const strictWriteLimiter = rateLimit({
    windowMs,
    limit: strictMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: createLimitHandler(
      'Too many submissions from this IP. Please wait 15 minutes before trying again.',
    ),
  });

  /**
   * Strict authentication rate limiter: 10 requests per 15 minutes per IP.
   * Protects /api/auth/login and /api/auth/register against brute-force and stuffing.
   */
  const authLimiter = rateLimit({
    windowMs,
    limit: authMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: createLimitHandler(
      'Too many authentication attempts from this IP. Please wait 15 minutes before trying again.',
    ),
  });

  return { apiLimiter, strictWriteLimiter, authLimiter };
}

const defaultLimiters = createRateLimiters();

/** General API rate limiter (100 req / 15 min per IP). */
export const apiRateLimiter = defaultLimiters.apiLimiter;

/** Strict write/submission rate limiter (10 req / 15 min per IP). */
export const strictWriteRateLimiter = defaultLimiters.strictWriteLimiter;

/** Strict auth rate limiter (10 req / 15 min per IP). */
export const authRateLimiter = defaultLimiters.authLimiter;
