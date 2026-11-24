import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const JWT_ALGORITHM = 'HS256';
const VALID_ROLES = new Set(['worker', 'admin']);

/**
 * Signs a short/medium-lived HS256 JWT access token for an authenticated user.
 *
 * @param {{ id: number, phone: string, role: 'worker' | 'admin' }} user
 * @returns {string} Signed JWT token.
 */
export function signAccessToken(user) {
  return jwt.sign(
    {
      phone: user.phone,
      role: user.role,
    },
    env.JWT_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      subject: String(user.id),
      expiresIn: env.JWT_EXPIRES_IN,
    },
  );
}

/**
 * Verifies an HS256 JWT access token and extracts the normalized user claims.
 *
 * @param {string} token - Raw Bearer token string.
 * @returns {{ id: number, phone: string, role: 'worker' | 'admin' } | null}
 */
export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    });

    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const id = Number(payload.sub);
    const phone = payload.phone;
    const role = payload.role;

    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      typeof phone !== 'string' ||
      phone.length === 0 ||
      typeof role !== 'string' ||
      !VALID_ROLES.has(role)
    ) {
      return null;
    }

    return { id, phone, role };
  } catch {
    return null;
  }
}
