import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';

/**
 * Express authentication middleware that verifies `Authorization: Bearer <token>`
 * and attaches `req.user = { id, phone, role }`.
 * Rejects missing, malformed, invalid, or expired tokens with `401 UNAUTHORIZED`.
 *
 * @type {import('express').RequestHandler}
 */
export function requireAuth(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return next(
      new AppError(401, 'Authentication token is required.', 'UNAUTHORIZED'),
    );
  }

  const token = authHeader.slice(7).trim();
  if (!token || token.includes(' ')) {
    return next(
      new AppError(401, 'Invalid authorization header format.', 'UNAUTHORIZED'),
    );
  }

  const claims = verifyAccessToken(token);
  if (!claims) {
    return next(
      new AppError(401, 'Invalid or expired authentication token.', 'UNAUTHORIZED'),
    );
  }

  req.user = claims;
  return next();
}
