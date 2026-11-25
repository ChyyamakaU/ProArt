import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

/**
 * Validates and parses a comma-separated list of explicit HTTP(S) origins.
 * Wildcards ('*') are strictly forbidden to enforce explicit CORS allow-listing.
 *
 * @param {string} rawOrigins - Comma-separated list of origin URLs.
 * @param {z.RefinementCtx} ctx - Zod refinement context.
 * @returns {string[]} Normalized origin list without trailing slashes.
 */
function parseAllowedOrigins(rawOrigins, ctx) {
  const origins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'ALLOWED_ORIGINS must contain at least one explicit origin URL',
    });
    return z.NEVER;
  }

  const normalized = [];
  for (const origin of origins) {
    if (origin === '*' || origin.includes('*')) {
      ctx.addIssue({
        code: 'custom',
        message: 'Wildcard origins (*) are prohibited in ALLOWED_ORIGINS',
      });
      return z.NEVER;
    }

    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        ctx.addIssue({
          code: 'custom',
          message: `Origin "${origin}" must use http:// or https://`,
        });
        return z.NEVER;
      }
      normalized.push(parsed.origin);
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid origin URL in ALLOWED_ORIGINS: "${origin}"`,
      });
      return z.NEVER;
    }
  }

  return [...new Set(normalized)];
}

/**
 * Parses boolean-like environment variables cleanly.
 */
const booleanFlagSchema = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .default('false')
  .transform((value) => value === 'true' || value === '1');

/**
 * Strict startup environment schema.
 * Crashes the process immediately if required configuration is missing or malformed.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce
    .number()
    .int()
    .min(1, 'PORT must be >= 1')
    .max(65535, 'PORT must be <= 65535'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine(
      (val) => val.startsWith('postgres://') || val.startsWith('postgresql://'),
      'DATABASE_URL must be a valid postgres:// or postgresql:// connection string',
    ),
  DATABASE_SSL: booleanFlagSchema,
  DATABASE_SSL_REJECT_UNAUTHORIZED: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .default('true')
    .transform((value) => value === 'true' || value === '1'),
  ALLOWED_ORIGINS: z
    .string()
    .min(1, 'ALLOWED_ORIGINS is required')
    .transform(parseAllowedOrigins),
  FRONTEND_URL: z
    .string()
    .url('FRONTEND_URL must be a valid URL')
    .refine(
      (val) => val.startsWith('http://') || val.startsWith('https://'),
      'FRONTEND_URL must use http:// or https://',
    )
    .transform((val) => val.replace(/\/+$/, '')),
  JWT_SECRET: z
    .string({ error: 'JWT_SECRET is required' })
    .trim()
    .min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRES_IN: z
    .string()
    .trim()
    .regex(
      /^\d+[smhdw]?$/,
      'JWT_EXPIRES_IN must be a valid duration string (e.g., 7d, 24h, 3600)',
    )
    .optional()
    .default('7d'),
  UPLOAD_DIR: z
    .string()
    .trim()
    .min(1)
    .optional()
    .default('./uploads')
    .transform((dir) => path.resolve(process.cwd(), dir)),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).optional().default(0),
  IDENTITY_UPLOAD_DIR: z.string().trim().min(1).default('./private-identity')
    .transform(dir => path.resolve(process.cwd(), dir)),
  IDENTITY_ENCRYPTION_KEY: z.preprocess(value => value === '' ? undefined : value,
    z.string().regex(/^[0-9a-fA-F]{64}$/, 'Use a 32-byte hex key').optional()),
});

/**
 * Parses and validates environment variables from an arbitrary source object.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} source
 * @returns {Readonly<z.infer<typeof envSchema>>}
 */
export function loadEnv(source = process.env) {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    console.error(`[FATAL] Invalid environment configuration:\n${formatted}`);
    process.exit(1);
  }

  return Object.freeze(result.data);
}

/**
 * Validated, frozen application configuration.
 */
export const env = loadEnv();
