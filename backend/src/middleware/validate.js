import { AppError } from '../utils/AppError.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively inspects an untrusted payload for prototype-pollution keys.
 *
 * @param {unknown} value - Untrusted value from request body, query, or params.
 * @returns {boolean} True if a dangerous prototype key is detected.
 */
function hasPrototypePollutionKey(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some(hasPrototypePollutionKey);
  }

  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return true;
    }
    if (hasPrototypePollutionKey(value[key])) {
      return true;
    }
  }

  return false;
}

/**
 * Safely replaces a request property (`body`, `query`, or `params`) with the
 * validated and sanitized object.
 *
 * @param {import('express').Request} req
 * @param {'body' | 'query' | 'params'} target
 * @param {unknown} parsedValue
 */
function assignValidatedTarget(req, target, parsedValue) {
  try {
    req[target] = parsedValue;
  } catch {
    Object.defineProperty(req, target, {
      value: parsedValue,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
}

/**
 * Reusable Zod validation middleware factory.
 * Validates `req.body`, `req.query`, and `req.params`, blocks prototype-pollution
 * keys, and rejects unexpected fields when paired with `.strict()` schemas.
 *
 * @param {{
 *   body?: import('zod').ZodTypeAny,
 *   query?: import('zod').ZodTypeAny,
 *   params?: import('zod').ZodTypeAny,
 * }} schemas
 * @returns {import('express').RequestHandler}
 */
export function validate(schemas = {}) {
  return (req, _res, next) => {
    req.validated = req.validated || {};

    /** @type {Array<'params' | 'query' | 'body'>} */
    const sections = ['params', 'query', 'body'];
    const issues = [];

    for (const section of sections) {
      const schema = schemas[section];
      if (!schema) {
        continue;
      }

      const rawValue = req[section] ?? {};

      if (hasPrototypePollutionKey(rawValue)) {
        return next(
          new AppError(
            400,
            'Request contains forbidden property names.',
            'FORBIDDEN_PROPERTY',
          ),
        );
      }

      const result = schema.safeParse(rawValue);
      if (!result.success) {
        for (const issue of result.error.issues) {
          issues.push({
            location: section,
            path: issue.path.join('.') || section,
            message: issue.message,
          });
        }
      } else {
        req.validated[section] = result.data;
        assignValidatedTarget(req, section, result.data);
      }
    }

    if (issues.length > 0) {
      return next(
        new AppError(400, 'Request validation failed.', 'VALIDATION_ERROR', issues),
      );
    }

    return next();
  };
}
