import { Router } from 'express';
import { workersController } from '../controllers/workers.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { strictWriteRateLimiter } from '../middleware/rateLimiter.js';
import { uploadSingleAvatar, uploadSinglePhoto } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import {
  createReviewBodySchema,
  createSampleBodySchema,
  createWorkerBodySchema,
  emptyObjectSchema,
  listWorkersQuerySchema,
  slugParamSchema,
  updateWorkerBodySchema,
  verifyWorkerBodySchema,
} from '../validators/workers.schema.js';

/**
 * Builds the API router for health, metadata filters, and worker Trust Card endpoints.
 *
 * @param {{
 *   controller?: ReturnType<import('../controllers/workers.controller.js').createWorkersController>,
 *   writeLimiter?: import('express').RequestHandler,
 * }} [options]
 * @returns {import('express').Router}
 */
export function createWorkersRouter(options = {}) {
  const controller = options.controller ?? workersController;
  const writeLimiter = options.writeLimiter ?? strictWriteRateLimiter;

  const router = Router();

  // Health & DB readiness probe (Public)
  router.get(
    '/health',
    validate({ params: emptyObjectSchema, query: emptyObjectSchema }),
    asyncHandler(controller.getHealth),
  );

  // Dynamic platform filter dropdowns & live hero stats (Public)
  router.get(
    '/meta/filters',
    validate({ params: emptyObjectSchema, query: emptyObjectSchema }),
    asyncHandler(controller.getMetaFilters),
  );

  // List / search workers with pagination & optional ?verified_only=true (Public)
  router.get(
    '/workers',
    validate({ params: emptyObjectSchema, query: listWorkersQuerySchema }),
    asyncHandler(controller.listWorkers),
  );

  // Create worker profile (Protected by JWT + strict write rate limit)
  router.post(
    '/workers',
    requireAuth,
    writeLimiter,
    validate({
      params: emptyObjectSchema,
      query: emptyObjectSchema,
      body: createWorkerBodySchema,
    }),
    asyncHandler(controller.createWorker),
  );

  // Fetch full worker Trust Card profile by slug (Public)
  router.get(
    '/workers/:slug',
    validate({ params: slugParamSchema, query: emptyObjectSchema }),
    asyncHandler(controller.getWorkerBySlug),
  );

  // Update worker profile (Protected by JWT + ownership/admin check + strict write rate limit)
  router.patch(
    '/workers/:slug',
    requireAuth,
    writeLimiter,
    validate({
      params: slugParamSchema,
      query: emptyObjectSchema,
      body: updateWorkerBodySchema,
    }),
    asyncHandler(controller.updateWorker),
  );

  // Admin verification toggle & guild endorsement update (Protected by JWT + Admin role)
  router.patch(
    '/workers/:slug/verify',
    requireAuth,
    writeLimiter,
    validate({
      params: slugParamSchema,
      query: emptyObjectSchema,
      body: verifyWorkerBodySchema,
    }),
    asyncHandler(controller.verifyWorker),
  );

  // Upload profile avatar photo (Protected by JWT + ownership/admin check)
  router.post(
    '/workers/:slug/avatar',
    requireAuth,
    writeLimiter,
    validate({ params: slugParamSchema, query: emptyObjectSchema }),
    uploadSingleAvatar,
    validate({ body: emptyObjectSchema }),
    asyncHandler(controller.uploadAvatar),
  );

  // Upload verified work sample photo + caption (Protected by JWT + ownership/admin check)
  router.post(
    '/workers/:slug/samples',
    requireAuth,
    writeLimiter,
    validate({ params: slugParamSchema, query: emptyObjectSchema }),
    uploadSinglePhoto,
    validate({ body: createSampleBodySchema }),
    asyncHandler(controller.uploadWorkSample),
  );

  // Submit client review (Public + strict write rate limit + duplicate-phone guard)
  router.post(
    '/workers/:slug/reviews',
    writeLimiter,
    validate({
      params: slugParamSchema,
      query: emptyObjectSchema,
      body: createReviewBodySchema,
    }),
    asyncHandler(controller.createReview),
  );

  return router;
}

export const workersRouter = createWorkersRouter();
