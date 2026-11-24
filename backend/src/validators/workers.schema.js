import { z } from 'zod';
import { sanitizePhoneNumber } from '../utils/phone.js';

/**
 * Rejects any unexpected properties on routes that do not accept a given section.
 */
export const emptyObjectSchema = z.object({}).strict();

/**
 * Reusable phone schema that sanitizes Nigerian and international phone inputs
 * into a strict digits-only format.
 */
const sanitizedPhoneSchema = z
  .string({ error: 'Phone number is required' })
  .trim()
  .min(7, 'Phone number is too short')
  .max(25, 'Phone number is too long')
  .transform((value, ctx) => {
    const normalized = sanitizePhoneNumber(value);
    if (!normalized) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide a valid Nigerian (e.g., 08031234567) or international phone number',
      });
      return z.NEVER;
    }
    return normalized;
  });

/**
 * Route params schema for endpoints addressed by worker slug.
 */
export const slugParamSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(3, 'Worker slug is too short')
      .max(120, 'Worker slug is too long')
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid worker slug format'),
  })
  .strict();

/**
 * Query schema for GET /api/workers search, filtering, and pagination.
 */
export const listWorkersQuerySchema = z
  .object({
    trade: z.string().trim().min(1).max(80).optional(),
    location: z.string().trim().min(1).max(120).optional(),
    q: z.string().trim().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    offset: z.coerce.number().int().min(0).max(10_000).optional().default(0),
  })
  .strict();

/**
 * Request body schema for POST /api/workers.
 * Strictly forbids privileged/internal fields like `id`, `slug`, or `is_verified`.
 */
export const createWorkerBodySchema = z
  .object({
    full_name: z
      .string({ error: 'Full name is required' })
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .max(120, 'Full name must be at most 120 characters'),
    trade: z
      .string({ error: 'Trade is required' })
      .trim()
      .min(2, 'Trade must be at least 2 characters')
      .max(80, 'Trade must be at most 80 characters'),
    location: z
      .string({ error: 'Location is required' })
      .trim()
      .min(2, 'Location must be at least 2 characters')
      .max(120, 'Location must be at most 120 characters'),
    phone: sanitizedPhoneSchema,
    bio: z
      .string()
      .trim()
      .max(1000, 'Bio must be at most 1000 characters')
      .optional()
      .default(''),
    years_experience: z.coerce
      .number()
      .int('Years of experience must be a whole number')
      .min(0, 'Years of experience cannot be negative')
      .max(70, 'Years of experience cannot exceed 70')
      .optional()
      .default(0),
  })
  .strict();

/**
 * Request body schema for POST /api/workers/:slug/samples (multipart fields).
 */
export const createSampleBodySchema = z
  .object({
    caption: z
      .string()
      .trim()
      .max(300, 'Caption must be at most 300 characters')
      .optional()
      .default(''),
  })
  .strict();

/**
 * Request body schema for POST /api/workers/:slug/reviews.
 */
export const createReviewBodySchema = z
  .object({
    client_name: z
      .string({ error: 'Client name is required' })
      .trim()
      .min(2, 'Client name must be at least 2 characters')
      .max(100, 'Client name must be at most 100 characters'),
    client_phone: sanitizedPhoneSchema,
    rating: z.coerce
      .number({ error: 'Rating is required' })
      .int('Rating must be a whole number between 1 and 5')
      .min(1, 'Rating must be at least 1')
      .max(5, 'Rating must be at most 5'),
    comment: z
      .string()
      .trim()
      .max(1000, 'Comment must be at most 1000 characters')
      .optional()
      .default(''),
  })
  .strict();
