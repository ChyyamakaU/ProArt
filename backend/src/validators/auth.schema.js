import { z } from 'zod';
import { sanitizePhoneNumber } from '../utils/phone.js';

/**
 * Reusable phone schema normalizing Nigerian and international phone inputs.
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
 * Request body schema for POST /api/auth/register.
 * Public self-registration only permits the `'worker'` role to prevent privilege escalation.
 */
export const registerBodySchema = z
  .object({
    phone: sanitizedPhoneSchema,
    password: z
      .string({ error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters long')
      .max(128, 'Password must be at most 128 characters long'),
    role: z.enum(['worker']).optional().default('worker'),
  })
  .strict();

/**
 * Request body schema for POST /api/auth/login.
 */
export const loginBodySchema = z
  .object({
    phone: sanitizedPhoneSchema,
    password: z
      .string({ error: 'Password is required' })
      .min(1, 'Password is required')
      .max(128, 'Password is too long'),
  })
  .strict();
