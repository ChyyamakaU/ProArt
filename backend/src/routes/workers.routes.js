import { Router } from 'express';
import { workersController } from '../controllers/workers.controller.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { strictWriteRateLimiter } from '../middleware/rateLimiter.js';
import { uploadSinglePhoto } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import {
  createReviewBodySchema,
  createSampleBodySchema,
  createWorkerBodySchema,
  emptyObjectSchema,
  listWorkersQuerySchema,
  slugParamSchema,
} from '../validators/workers.schema.js';

/**
 * Builds the API router for health and worker Trust Card endpoints.
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

  // Health & DB readiness probe
  router.get(
    '/health',
    validate({ params: emptyObjectSchema, query: emptyObjectSchema }),
    asyncHandler(controller.getHealth),
  );

  // List / search workers with pagination
  router.get(
    '/workers',
    validate({ params: emptyObjectSchema, query: listWorkersQuerySchema }),
    asyncHandler(controller.listWorkers),
  );

  // Create worker profile (strict write rate limit)
  router.post(
    '/workers',
    writeLimiter,
    validate({
      params: emptyObjectSchema,
      query: emptyObjectSchema,
      body: createWorkerBodySchema,
    }),
    asyncHandler(controller.createWorker),
  );

  // Fetch full worker Trust Card profile by slug
  router.get(
    '/workers/:slug',
    validate({ params: slugParamSchema, query: emptyObjectSchema }),
    asyncHandler(controller.getWorkerBySlug),
  );

  // Upload verified work sample photo + caption (strict write rate limit)
  router.post(
    '/workers/:slug/samples',
    writeLimiter,
    validate({ params: slugParamSchema, query: emptyObjectSchema }),
    uploadSinglePhoto,
    validate({ body: createSampleBodySchema }),
    asyncHandler(controller.uploadWorkSample),
  );

  // Submit client review (strict write rate limit)
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
