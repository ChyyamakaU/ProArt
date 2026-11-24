import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import { createWorkersRouter } from './routes/workers.routes.js';
import { AppError } from './utils/AppError.js';

/**
 * Constructs a hardened Express application instance.
 * Accepts optional overrides for dependency injection in automated tests.
 *
 * @param {{
 *   allowedOrigins?: string[],
 *   uploadDir?: string,
 *   trustProxy?: number,
 *   apiLimiter?: import('express').RequestHandler,
 *   writeLimiter?: import('express').RequestHandler,
 *   controller?: ReturnType<import('./controllers/workers.controller.js').createWorkersController>,
 * }} [options]
 * @returns {import('express').Express}
 */
export function createApp(options = {}) {
  const allowedOrigins = options.allowedOrigins ?? env.ALLOWED_ORIGINS;
  const uploadDir = options.uploadDir ?? env.UPLOAD_DIR;
  const trustProxy = options.trustProxy ?? env.TRUST_PROXY;
  const generalLimiter = options.apiLimiter ?? apiRateLimiter;

  const app = express();

  // Disable framework fingerprinting header explicitly.
  app.disable('x-powered-by');

  // Trust configured proxy hops for accurate client IP rate limiting.
  if (trustProxy > 0) {
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

  // Mount domain routes.
  app.use(
    '/api',
    createWorkersRouter({
      controller: options.controller,
      writeLimiter: options.writeLimiter,
    }),
  );

  // Centralized 404 and error handling boundary.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
