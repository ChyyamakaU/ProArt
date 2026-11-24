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
 * Optional nullable guild endorsement string schema.
 */
const optionalGuildEndorsementSchema = z
  .string()
  .trim()
  .max(150, 'Guild endorsement must be at most 150 characters')
  .nullable()
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return null;
    return val;
  });

/**
 * Optional nullable Instagram handle schema (validates safe handle characters).
 */
const optionalInstagramHandleSchema = z
  .string()
  .trim()
  .max(80, 'Instagram handle must be at most 80 characters')
  .nullable()
  .optional()
  .transform((val, ctx) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return null;
    const normalized = val.replace(/^@+/, '');
    if (!/^[a-zA-Z0-9._]{1,79}$/.test(normalized)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Instagram handle may only contain letters, numbers, periods, and underscores',
      });
      return z.NEVER;
    }
    return `@${normalized}`;
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
    verified_only: z
      .enum(['true', 'false'])
      .optional()
      .transform((val) => val === 'true'),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
    offset: z.coerce.number().int().min(0).max(10_000).optional().default(0),
  })
  .strict();

/**
 * Request body schema for POST /api/workers.
 * Strictly forbids privileged/internal fields like `id`, `slug`, `user_id`, or `is_verified`.
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
    guild_endorsement: optionalGuildEndorsementSchema,
    instagram_handle: optionalInstagramHandleSchema,
  })
  .strict();

/**
 * Request body schema for PATCH /api/workers/:slug.
 * Only permits explicit owner-editable profile fields.
 */
export const updateWorkerBodySchema = z
  .object({
    bio: z
      .string()
      .trim()
      .max(1000, 'Bio must be at most 1000 characters')
      .optional(),
    location: z
      .string()
      .trim()
      .min(2, 'Location must be at least 2 characters')
      .max(120, 'Location must be at most 120 characters')
      .optional(),
    years_experience: z.coerce
      .number()
      .int('Years of experience must be a whole number')
      .min(0, 'Years of experience cannot be negative')
      .max(70, 'Years of experience cannot exceed 70')
      .optional(),
    guild_endorsement: optionalGuildEndorsementSchema,
    instagram_handle: optionalInstagramHandleSchema,
    phone: sanitizedPhoneSchema.optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one updatable field must be provided.',
  });

/**
 * Request body schema for PATCH /api/workers/:slug/verify (Admin only).
 */
export const verifyWorkerBodySchema = z
  .object({
    is_verified: z.boolean({ error: 'is_verified must be a boolean' }),
    guild_endorsement: optionalGuildEndorsementSchema,
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
    job_description: z
      .string()
      .trim()
      .max(300, 'Job description must be at most 300 characters')
      .nullable()
      .optional()
      .transform((val) => {
        if (val === undefined || val === null || val === '') return null;
        return val;
      }),
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
