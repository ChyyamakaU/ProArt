import { checkDatabaseHealth, query } from '../config/db.js';
import { env } from '../config/env.js';
import { cleanupUploadedFile, verifyAndSaveImage } from '../middleware/upload.js';
import { AppError } from '../utils/AppError.js';
import { generateWorkerSlug } from '../utils/slug.js';
import { buildWhatsAppLinks } from '../utils/whatsapp.js';

const MAX_SLUG_RETRIES = 5;

/**
 * Escapes SQL LIKE wildcards so user input is treated as literal characters.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

/**
 * Maps a raw worker row to a public, PII-minimized DTO.
 * Never exposes internal database IDs or raw phone columns directly.
 *
 * @param {Record<string, any>} row
 */
function toPublicWorkerSummary(row) {
  return {
    slug: row.slug,
    full_name: row.full_name,
    trade: row.trade,
    location: row.location,
    bio: row.bio,
    years_experience: Number(row.years_experience),
    is_verified: Boolean(row.is_verified),
    avg_rating: row.avg_rating !== null && row.avg_rating !== undefined ? Number(row.avg_rating) : null,
    review_count: Number(row.review_count ?? 0),
    sample_count: Number(row.sample_count ?? 0),
    cover_image_url: row.cover_image_url ?? null,
    whatsapp_links: buildWhatsAppLinks({
      slug: row.slug,
      full_name: row.full_name,
      trade: row.trade,
      location: row.location,
      phone: row.phone,
    }),
    created_at: row.created_at,
  };
}

/**
 * Creates worker controller handlers with injectable dependencies for clean
 * unit/integration testing while defaulting to live production modules.
 *
 * @param {{
 *   dbQuery?: typeof query,
 *   checkHealth?: typeof checkDatabaseHealth,
 *   uploadDir?: string,
 * }} [deps]
 */
export function createWorkersController(deps = {}) {
  const dbQuery = deps.dbQuery ?? query;
  const checkHealth = deps.checkHealth ?? checkDatabaseHealth;
  const uploadDir = deps.uploadDir ?? env.UPLOAD_DIR;

  /**
   * GET /api/health
   * Verifies live PostgreSQL connectivity without exposing internals.
   *
   * @type {import('express').RequestHandler}
   */
  async function getHealth(_req, res) {
    try {
      const health = await checkHealth();
      res.status(200).json({
        status: 'ok',
        database: 'connected',
        latency_ms: health.latencyMs,
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        error: 'Database connectivity check failed.',
        code: 'SERVICE_UNAVAILABLE',
      });
    }
  }

  /**
   * GET /api/workers
   * Parameterized search and filtering by `trade`, `location`, and free-text `q`,
   * with bounded pagination (`limit`, `offset`).
   *
   * @type {import('express').RequestHandler}
   */
  async function listWorkers(req, res) {
    const { trade, location, q, limit, offset } = req.validated.query;

    const whereClauses = [];
    const filterParams = [];

    if (trade) {
      filterParams.push(`%${escapeLikePattern(trade)}%`);
      whereClauses.push(`w.trade ILIKE $${filterParams.length} ESCAPE '\\'`);
    }

    if (location) {
      filterParams.push(`%${escapeLikePattern(location)}%`);
      whereClauses.push(`w.location ILIKE $${filterParams.length} ESCAPE '\\'`);
    }

    if (q) {
      filterParams.push(`%${escapeLikePattern(q)}%`);
      const idx = filterParams.length;
      whereClauses.push(
        `(w.full_name ILIKE $${idx} ESCAPE '\\' OR w.trade ILIKE $${idx} ESCAPE '\\' OR w.location ILIKE $${idx} ESCAPE '\\' OR w.bio ILIKE $${idx} ESCAPE '\\')`,
      );
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM workers w
      ${whereSql}
    `;

    const limitParamIndex = filterParams.length + 1;
    const offsetParamIndex = filterParams.length + 2;

    const listSql = `
      SELECT
        w.slug,
        w.full_name,
        w.trade,
        w.location,
        w.phone,
        w.bio,
        w.years_experience,
        w.is_verified,
        w.created_at,
        COALESCE(rev.review_count, 0)::int AS review_count,
        rev.avg_rating,
        COALESCE(ws.sample_count, 0)::int AS sample_count,
        ws.cover_image_url
      FROM workers w
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS review_count,
          ROUND(AVG(r.rating)::numeric, 2) AS avg_rating
        FROM reviews r
        WHERE r.worker_id = w.id
      ) rev ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS sample_count,
          (
            SELECT s.image_url
            FROM work_samples s
            WHERE s.worker_id = w.id
            ORDER BY s.created_at DESC
            LIMIT 1
          ) AS cover_image_url
        FROM work_samples s
        WHERE s.worker_id = w.id
      ) ws ON TRUE
      ${whereSql}
      ORDER BY w.is_verified DESC, rev.avg_rating DESC NULLS LAST, w.created_at DESC
      LIMIT $${limitParamIndex}
      OFFSET $${offsetParamIndex}
    `;

    const [countResult, listResult] = await Promise.all([
      dbQuery(countSql, filterParams),
      dbQuery(listSql, [...filterParams, limit, offset]),
    ]);

    const total = Number(countResult.rows[0]?.total ?? 0);

    res.status(200).json({
      data: listResult.rows.map(toPublicWorkerSummary),
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + listResult.rows.length < total,
      },
    });
  }

  /**
   * GET /api/workers/:slug
   * Returns the full public Trust Card profile with aggregated ratings,
   * verified work samples, PII-minimized public reviews, and WhatsApp links.
   *
   * @type {import('express').RequestHandler}
   */
  async function getWorkerBySlug(req, res) {
    const { slug } = req.validated.params;

    const workerResult = await dbQuery(
      `
      SELECT
        w.id,
        w.slug,
        w.full_name,
        w.trade,
        w.location,
        w.phone,
        w.bio,
        w.years_experience,
        w.is_verified,
        w.created_at,
        COALESCE(rev.review_count, 0)::int AS review_count,
        rev.avg_rating
      FROM workers w
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS review_count,
          ROUND(AVG(r.rating)::numeric, 2) AS avg_rating
        FROM reviews r
        WHERE r.worker_id = w.id
      ) rev ON TRUE
      WHERE w.slug = $1
      LIMIT 1
      `,
      [slug],
    );

    const worker = workerResult.rows[0];
    if (!worker) {
      throw new AppError(404, 'Worker profile not found.', 'WORKER_NOT_FOUND');
    }

    const [samplesResult, reviewsResult] = await Promise.all([
      dbQuery(
        `
        SELECT image_url, caption, created_at
        FROM work_samples
        WHERE worker_id = $1
        ORDER BY created_at DESC
        `,
        [worker.id],
      ),
      dbQuery(
        `
        SELECT client_name, rating, comment, created_at
        FROM reviews
        WHERE worker_id = $1
        ORDER BY created_at DESC
        `,
        [worker.id],
      ),
    ]);

    res.status(200).json({
      data: {
        slug: worker.slug,
        full_name: worker.full_name,
        trade: worker.trade,
        location: worker.location,
        bio: worker.bio,
        years_experience: Number(worker.years_experience),
        is_verified: Boolean(worker.is_verified),
        avg_rating:
          worker.avg_rating !== null && worker.avg_rating !== undefined
            ? Number(worker.avg_rating)
            : null,
        review_count: Number(worker.review_count ?? 0),
        work_samples: samplesResult.rows.map((sample) => ({
          image_url: sample.image_url,
          caption: sample.caption,
          created_at: sample.created_at,
        })),
        reviews: reviewsResult.rows.map((review) => ({
          client_name: review.client_name,
          rating: Number(review.rating),
          comment: review.comment,
          created_at: review.created_at,
        })),
        whatsapp_links: buildWhatsAppLinks({
          slug: worker.slug,
          full_name: worker.full_name,
          trade: worker.trade,
          location: worker.location,
          phone: worker.phone,
        }),
        created_at: worker.created_at,
      },
    });
  }

  /**
   * POST /api/workers
   * Creates a new worker profile with sanitized phone number and collision-safe slug.
   *
   * @type {import('express').RequestHandler}
   */
  async function createWorker(req, res) {
    const { full_name, trade, location, phone, bio, years_experience } = req.validated.body;

    let created = null;
    for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt += 1) {
      const slug = generateWorkerSlug(full_name, trade);
      try {
        const result = await dbQuery(
          `
          INSERT INTO workers (slug, full_name, trade, location, phone, bio, years_experience)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING
            slug,
            full_name,
            trade,
            location,
            phone,
            bio,
            years_experience,
            is_verified,
            created_at
          `,
          [slug, full_name, trade, location, phone, bio, years_experience],
        );
        created = result.rows[0];
        break;
      } catch (err) {
        // Retry only on rare random slug collision.
        if (err?.code === '23505' && attempt < MAX_SLUG_RETRIES - 1) {
          continue;
        }
        throw err;
      }
    }

    if (!created) {
      throw new AppError(
        500,
        'Could not generate a unique profile slug. Please try again.',
        'SLUG_GENERATION_FAILED',
      );
    }

    res.status(201).json({
      data: {
        slug: created.slug,
        full_name: created.full_name,
        trade: created.trade,
        location: created.location,
        bio: created.bio,
        years_experience: Number(created.years_experience),
        is_verified: Boolean(created.is_verified),
        whatsapp_links: buildWhatsAppLinks({
          slug: created.slug,
          full_name: created.full_name,
          trade: created.trade,
          location: created.location,
          phone: created.phone,
        }),
        created_at: created.created_at,
      },
    });
  }

  /**
   * POST /api/workers/:slug/samples
   * Verifies uploaded photo magic bytes, stores under a randomized UUID filename,
   * and links the work sample to the target worker.
   *
   * @type {import('express').RequestHandler}
   */
  async function uploadWorkSample(req, res) {
    const { slug } = req.validated.params;
    const { caption } = req.validated.body;

    const workerResult = await dbQuery(
      'SELECT id FROM workers WHERE slug = $1 LIMIT 1',
      [slug],
    );
    const worker = workerResult.rows[0];

    if (!worker) {
      throw new AppError(404, 'Worker profile not found.', 'WORKER_NOT_FOUND');
    }

    const savedFile = await verifyAndSaveImage(req.file, uploadDir);

    try {
      const insertResult = await dbQuery(
        `
        INSERT INTO work_samples (worker_id, image_url, caption)
        VALUES ($1, $2, $3)
        RETURNING image_url, caption, created_at
        `,
        [worker.id, savedFile.imageUrl, caption],
      );

      const sample = insertResult.rows[0];

      res.status(201).json({
        data: {
          image_url: sample.image_url,
          caption: sample.caption,
          created_at: sample.created_at,
        },
      });
    } catch (err) {
      await cleanupUploadedFile(savedFile.absolutePath);
      throw err;
    }
  }

  /**
   * POST /api/workers/:slug/reviews
   * Submits a verified client review (rating 1-5) while preventing duplicate
   * review spam from the same client phone number on the same worker.
   *
   * @type {import('express').RequestHandler}
   */
  async function createReview(req, res) {
    const { slug } = req.validated.params;
    const { client_name, client_phone, rating, comment } = req.validated.body;

    const workerResult = await dbQuery(
      'SELECT id FROM workers WHERE slug = $1 LIMIT 1',
      [slug],
    );
    const worker = workerResult.rows[0];

    if (!worker) {
      throw new AppError(404, 'Worker profile not found.', 'WORKER_NOT_FOUND');
    }

    try {
      const insertResult = await dbQuery(
        `
        INSERT INTO reviews (worker_id, client_name, client_phone, rating, comment)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING client_name, rating, comment, created_at
        `,
        [worker.id, client_name, client_phone, rating, comment],
      );

      const review = insertResult.rows[0];

      res.status(201).json({
        data: {
          client_name: review.client_name,
          rating: Number(review.rating),
          comment: review.comment,
          created_at: review.created_at,
        },
      });
    } catch (err) {
      if (err?.code === '23505') {
        throw new AppError(
          409,
          'You have already submitted a review for this worker.',
          'DUPLICATE_REVIEW',
        );
      }
      throw err;
    }
  }

  return {
    getHealth,
    listWorkers,
    getWorkerBySlug,
    createWorker,
    uploadWorkSample,
    createReview,
  };
}

export const workersController = createWorkersController();
