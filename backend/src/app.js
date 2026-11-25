import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createWorkersRouter } from './routes/workers.routes.js';
import { createSkillVerificationRouter } from './routes/skillVerification.routes.js';
import { createIdentityVerificationRouter } from './routes/identityVerification.routes.js';
import { AppError } from './utils/AppError.js';
import { createIdentityStorage, protectPublicUploadRoot } from './utils/identityStorage.js';

/**
 * Constructs a hardened Express application instance.
 * Accepts optional overrides for dependency injection in automated tests.
 *
 * @param {{
 *   allowedOrigins?: string[],
 *   uploadDir?: string,
 *   identityUploadDir?: string,
 *   identityEncryptionKey?: string,
 *   trustProxy?: number,
 *   apiLimiter?: import('express').RequestHandler,
 *   writeLimiter?: import('express').RequestHandler,
 *   authLimiter?: import('express').RequestHandler,
 *   controller?: ReturnType<import('./controllers/workers.controller.js').createWorkersController>,
 *   authController?: ReturnType<import('./controllers/auth.controller.js').createAuthController>,
 *   skillVerificationController?: ReturnType<import('./controllers/skillVerification.controller.js').createSkillVerificationController>,
 * }} [options]
 * @returns {import('express').Express}
 */
export function createApp(options = {}) {
  const allowedOrigins = options.allowedOrigins ?? env.ALLOWED_ORIGINS;
  const uploadDir = options.uploadDir ?? env.UPLOAD_DIR;
  const identityStorage = createIdentityStorage({
    publicDir: uploadDir,
    directory: options.identityUploadDir ?? env.IDENTITY_UPLOAD_DIR,
    encryptionKey: options.identityEncryptionKey ?? env.IDENTITY_ENCRYPTION_KEY,
  });
  const trustProxy = options.trustProxy ?? env.TRUST_PROXY;
  const generalLimiter = options.apiLimiter ?? apiRateLimiter;

  const app = express();

  // Trust the first reverse proxy hop (Render/Railway/Fly/Nginx) for accurate client IP rate limiting.
  app.set('trust proxy', 1);

  // Disable framework fingerprinting header explicitly.
  app.disable('x-powered-by');

  // Allow explicit override if configured via options or non-default TRUST_PROXY env.
  if (options.trustProxy !== undefined) {
    app.set('trust proxy', options.trustProxy);
  } else if (trustProxy > 1) {
    app.set('trust proxy', trustProxy);
  }

  // Strict HTTP security headers + CSP.
  app.use(
    helmet({
      xPoweredBy: false,
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          imgSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          objectSrc: ["'none'"],
          scriptSrc: ["'none'"],
          styleSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts:
        env.NODE_ENV === 'production'
          ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
          : false,
    }),
  );

  // Strict CORS whitelist (explicit origins & methods only — never '*').
  const allowedOriginSet = new Set(allowedOrigins);
  const corsOptions = {
    origin(origin, callback) {
      // Allow non-browser clients (curl, server health probes) that omit Origin.
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOriginSet.has(origin)) {
        return callback(null, true);
      }
      return callback(
        new AppError(403, 'Origin is not permitted by CORS policy.', 'CORS_NOT_ALLOWED'),
      );
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 600,
    optionsSuccessStatus: 204,
  };

  app.use(cors(corsOptions));

  // Constrained request body parsers to defend against large-payload DoS.
  app.use(express.json({ limit: '50kb', strict: true }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));

  // Serve verified work sample images safely with hardened headers.
  app.use(
    '/uploads',
    protectPublicUploadRoot(uploadDir),
    express.static(uploadDir, {
      dotfiles: 'deny',
      etag: true,
      fallthrough: false,
      index: false,
      maxAge: '365d',
      immutable: true,
      setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      },
    }),
  );

  // Apply general API rate limiter across all /api routes.
  app.use('/api', generalLimiter);

  // Mount authentication routes.
  app.use(
    '/api/auth',
    createAuthRouter({
      controller: options.authController,
      authLimiter: options.authLimiter,
    }),
  );

  // Mount worker & health domain routes.
  app.use(
    '/api',
    createWorkersRouter({
      controller: options.controller,
      writeLimiter: options.writeLimiter,
    }),
  );

  app.use('/api', createSkillVerificationRouter({
    controller: options.skillVerificationController,
    writeLimiter: options.writeLimiter,
  }));
  app.use('/api', createIdentityVerificationRouter({ storage: identityStorage, writeLimiter: options.writeLimiter }));

  // Centralized 404 and error handling boundary.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
