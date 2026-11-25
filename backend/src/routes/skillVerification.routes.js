import { Router } from 'express';
import { z } from 'zod';
import { createSkillVerificationController } from '../controllers/skillVerification.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { strictWriteRateLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { emptyObjectSchema, slugParamSchema } from '../validators/workers.schema.js';

const submissionBody = z.object({ work_sample_id: z.uuid() }).strict();
const submissionParams = z.object({ id: z.uuid() }).strict();
const pagination = {
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
};
const queueQuery = z.object({
  ...pagination,
  status: z.enum(['active', 'verified', 'rejected', 'resubmission_required']).default('active'),
}).strict();
const reviewBody = z.discriminatedUnion('status', [
  z.object({ status: z.enum(['under_review', 'verified']) }).strict(),
  z.object({
    status: z.enum(['rejected', 'resubmission_required']),
    reason: z.string().trim().min(1).max(1000),
  }).strict(),
]);

export function createSkillVerificationRouter({
  controller = createSkillVerificationController(), writeLimiter = strictWriteRateLimiter,
} = {}) {
  const router = Router();
  const workerPath = '/workers/:slug/verification/skill';
  const queuePath = '/admin/verification/skill/submissions';

  router.get(workerPath, requireAuth,
    validate({ params: slugParamSchema, query: z.object(pagination).strict() }),
    asyncHandler(controller.getStatus));
  router.post(workerPath, requireAuth, writeLimiter,
    validate({ params: slugParamSchema, query: emptyObjectSchema, body: submissionBody }),
    asyncHandler(controller.submit));
  router.get(queuePath, requireAuth,
    validate({ query: queueQuery }), asyncHandler(controller.listQueue));
  router.patch(queuePath + '/:id', requireAuth, writeLimiter,
    validate({ params: submissionParams, query: emptyObjectSchema, body: reviewBody }),
    asyncHandler(controller.review));
  return router;
}
