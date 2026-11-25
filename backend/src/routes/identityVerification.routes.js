import { Router } from 'express';
import { z } from 'zod';
import { createIdentityVerificationController } from '../controllers/identityVerification.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { strictWriteRateLimiter } from '../middleware/rateLimiter.js';
import { uploadSingleIdentityDocument } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { emptyObjectSchema, slugParamSchema } from '../validators/workers.schema.js';

const id = z.object({ id: z.uuid() }).strict();
const pagination = {
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
};
const queueQuery = z.object({
  ...pagination, status: z.enum(['active', 'verified', 'rejected', 'resubmission_required']).default('active'),
}).strict();
const reviewBody = z.discriminatedUnion('status', [
  z.object({ status: z.enum(['under_review', 'verified']) }).strict(),
  z.object({ status: z.enum(['rejected', 'resubmission_required']), reason: z.string().trim().min(1).max(1000) }).strict(),
]);
const documentBody = z.object({ document_type: z.enum(['national_id', 'passport', 'drivers_license', 'voter_card']) }).strict();

export function createIdentityVerificationRouter({ storage, writeLimiter = strictWriteRateLimiter }) {
  const controller = createIdentityVerificationController({ storage });
  const router = Router();
  const worker = '/workers/:slug/verification/identity';
  const admin = '/admin/verification/identity/submissions';
  const noStore = (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  };
  router.get(worker, noStore, requireAuth,
    validate({ params: slugParamSchema, query: z.object(pagination).strict() }), asyncHandler(controller.getStatus));
  router.post(worker, noStore, requireAuth, writeLimiter,
    validate({ params: slugParamSchema, query: emptyObjectSchema }), asyncHandler(controller.authorizeSubmission),
    uploadSingleIdentityDocument, validate({ body: documentBody }), asyncHandler(controller.submit));
  router.get(admin, noStore, requireAuth, validate({ query: queueQuery }), asyncHandler(controller.listQueue));
  router.get(admin + '/:id/document', noStore, requireAuth,
    validate({ params: id, query: emptyObjectSchema }), asyncHandler(controller.getDocument));
  router.patch(admin + '/:id', noStore, requireAuth, writeLimiter,
    validate({ params: id, query: emptyObjectSchema, body: reviewBody }), asyncHandler(controller.review));
  return router;
}
