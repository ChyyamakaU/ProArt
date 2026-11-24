import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { loginBodySchema, registerBodySchema } from '../validators/auth.schema.js';
import { emptyObjectSchema } from '../validators/workers.schema.js';

/**
 * Builds the authentication router (`/api/auth`).
 *
 * @param {{
 *   controller?: ReturnType<import('../controllers/auth.controller.js').createAuthController>,
 *   authLimiter?: import('express').RequestHandler,
 * }} [options]
 * @returns {import('express').Router}
 */
export function createAuthRouter(options = {}) {
  const controller = options.controller ?? authController;
  const authLimiter = options.authLimiter ?? authRateLimiter;

  const router = Router();

  // Register a new worker account (strict auth rate limit)
  router.post(
    '/register',
    authLimiter,
    validate({
      params: emptyObjectSchema,
      query: emptyObjectSchema,
      body: registerBodySchema,
    }),
    asyncHandler(controller.register),
  );

  // Authenticate and issue JWT access token (strict auth rate limit)
  router.post(
    '/login',
    authLimiter,
    validate({
      params: emptyObjectSchema,
      query: emptyObjectSchema,
      body: loginBodySchema,
    }),
    asyncHandler(controller.login),
  );

  // Return authenticated user and linked worker Trust Card
  router.get(
    '/me',
    requireAuth,
    validate({
      params: emptyObjectSchema,
      query: emptyObjectSchema,
    }),
    asyncHandler(controller.me),
  );

  return router;
}

export const authRouter = createAuthRouter();
