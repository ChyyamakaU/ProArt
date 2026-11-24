import { checkDatabaseHealth, query } from '../config/db.js';
import { env } from '../config/env.js';
import { cleanupUploadedFile, verifyAndSaveImage } from '../middleware/upload.js';
import { AppError } from '../utils/AppError.js';
import { generateWorkerSlug } from '../utils/slug.js';
import { buildVerificationSummary } from '../utils/trustScore.js';
import { buildWhatsAppLinks } from '../utils/whatsapp.js';

const MAX_SLUG_RETRIES = 5;

/**
 * Explicit allow-list mapping validated PATCH body keys to SQL column names.
 * Prevents dynamic column injection.
 */
const ALLOWED_PATCH_COLUMNS = Object.freeze({
  bio: 'bio',
  location: 'location',
  years_experience: 'years_experience',
  guild_endorsement: 'guild_endorsement',
  instagram_handle: 'instagram_handle',
  phone: 'phone',
});

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
 * Maps a raw work sample row to its public DTO.
 *
 * @param {Record<string, any>} sample
 */
function toPublicSample(sample) {
  return {
    image_url: sample.image_url,
    caption: sample.caption ?? '',
    created_at: sample.created_at,
  };
}

/**
 * Maps a raw review row to its PII-minimized public DTO (strips client_phone & internal IDs).
 *
 * @param {Record<string, any>} review
 */
function toPublicReview(review) {
  return {
    client_name: review.client_name,
    job_description: review.job_description ?? null,
    rating: Number(review.rating),
    comment: review.comment ?? '',
    created_at: review.created_at,
  };
}

/**
 * Maps a raw worker row to a public, PII-minimized Trust Card DTO including
 * the computed `verification` breakdown.
 * Never exposes internal database IDs, `user_id`, `password_hash`, or raw phone fields.
 *
 * @param {Record<string, any>} row
 * @param {{ workSamples?: Array<Record<string, any>>, reviews?: Array<Record<string, any>> }} [extras]
 */
function toPublicWorker(row, extras = {}) {
  const workSamples = Array.isArray(extras.workSamples)
    ? extras.workSamples.map(toPublicSample)
    : Array.isArray(row.work_samples)
      ? row.work_samples.map(toPublicSample)
      : [];

  const reviews = Array.isArray(extras.reviews)
    ? extras.reviews.map(toPublicReview)
    : Array.isArray(row.reviews)
      ? row.reviews.map(toPublicReview)
      : [];

  const avgRating =
    row.avg_rating !== null && row.avg_rating !== undefined
      ? Number(row.avg_rating)
      : null;
  const reviewCount = Number(row.review_count ?? reviews.length);

  return {
    slug: row.slug,
    full_name: row.full_name,
    trade: row.trade,
    location: row.location,
    bio: row.bio,
    years_experience: Number(row.years_experience),
    guild_endorsement: row.guild_endorsement ?? null,
    instagram_handle: row.instagram_handle ?? null,
    avatar_url: row.avatar_url ?? null,
    is_verified: Boolean(row.is_verified),
    avg_rating: avgRating,
    review_count: reviewCount,
    verification: buildVerificationSummary(
      row,
      workSamples.length,
      reviewCount,
      avgRating,
    ),
    work_samples: workSamples,
    reviews,
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
 * Verifies that the authenticated caller owns the target worker profile or holds
 * the `'admin'` role.
 *
 * @param {{ user_id: number | null }} worker
 * @param {{ id: number, role: string }} user
 */
function assertWorkerOwnership(worker, user) {
  const ownerId =
    worker.user_id !== null && worker.user_id !== undefined
      ? Number(worker.user_id)
      : null;

  if (ownerId !== user.id && user.role !== 'admin') {
    throw new AppError(
      403,
      'You do not have permission to modify this worker profile.',
      'FORBIDDEN',
    );
  }
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
   * Hydrates a worker row with its live review aggregates, work samples,
   * public reviews, and recalculated `verification` object.
   *
   * @param {Record<string, any>} workerRow
   */
  async function hydrateWorker(workerRow) {
    const [statsResult, samplesResult, reviewsResult] = await Promise.all([
      dbQuery(
        `
        SELECT
          COUNT(*)::int AS review_count,
          ROUND(AVG(rating)::numeric, 2) AS avg_rating
        FROM reviews
        WHERE worker_id = $1
        `,
        [workerRow.id],
      ),
      dbQuery(
        `
        SELECT image_url, caption, created_at
        FROM work_samples
        WHERE worker_id = $1
        ORDER BY created_at DESC
        `,
        [workerRow.id],
      ),
      dbQuery(
        `
        SELECT client_name, job_description, rating, comment, created_at
        FROM reviews
        WHERE worker_id = $1
        ORDER BY created_at DESC
        `,
        [workerRow.id],
      ),
    ]);

    const stats = statsResult.rows[0] ?? { review_count: 0, avg_rating: null };

    return toPublicWorker(
      {
        ...workerRow,
        review_count: stats.review_count,
        avg_rating: stats.avg_rating,
      },
      {
        workSamples: samplesResult.rows,
        reviews: reviewsResult.rows,
      },
    );
  }

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
   * GET /api/meta/filters (Public)
   * Returns distinct platform trades, locations, and live hero metrics for
   * dynamic frontend filter dropdowns and trust counters.
   *
   * @type {import('express').RequestHandler}
   */
  async function getMetaFilters(_req, res) {
    const [tradesResult, locationsResult, workerStatsResult, reviewStatsResult] =
      await Promise.all([
        dbQuery(
          `
          SELECT DISTINCT trade
          FROM workers
          WHERE trade IS NOT NULL AND TRIM(trade) <> ''
          ORDER BY trade ASC
          `,
        ),
        dbQuery(
          `
          SELECT DISTINCT location
          FROM workers
          WHERE location IS NOT NULL AND TRIM(location) <> ''
          ORDER BY location ASC
          `,
        ),
        dbQuery(
          `
          SELECT
            COUNT(*)::int AS total_workers,
            COUNT(*) FILTER (WHERE is_verified = TRUE)::int AS verified_workers
          FROM workers
          `,
        ),
        dbQuery(
          `
          SELECT COUNT(*)::int AS total_reviews
          FROM reviews
          `,
        ),
      ]);

    const workerStats = workerStatsResult.rows[0] ?? {
      total_workers: 0,
      verified_workers: 0,
    };
    const reviewStats = reviewStatsResult.rows[0] ?? { total_reviews: 0 };

    res.status(200).json({
      trades: tradesResult.rows.map((row) => row.trade),
      locations: locationsResult.rows.map((row) => row.location),
      stats: {
        total_workers: Number(workerStats.total_workers ?? 0),
        verified_workers: Number(workerStats.verified_workers ?? 0),
        total_reviews: Number(reviewStats.total_reviews ?? 0),
      },
    });
  }

  /**
   * GET /api/workers (Public)
   * Parameterized search and filtering by `trade`, `location`, `q`, and
   * `verified_only`, with bounded pagination (`limit`, `offset`) and complete
   * public Trust Card fields including `verification`.
   *
   * @type {import('express').RequestHandler}
   */
  async function listWorkers(req, res) {
    const { trade, location, q, verified_only, limit, offset } = req.validated.query;

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
        `(w.full_name ILIKE $${idx} ESCAPE '\\' OR w.trade ILIKE $${idx} ESCAPE '\\' OR w.location ILIKE $${idx} ESCAPE '\\' OR w.bio ILIKE $${idx} ESCAPE '\\' OR COALESCE(w.guild_endorsement, '') ILIKE $${idx} ESCAPE '\\')`,
      );
    }

    if (verified_only === true) {
      whereClauses.push('w.is_verified = TRUE');
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
        w.user_id,
        w.slug,
        w.full_name,
        w.trade,
        w.location,
        w.phone,
        w.bio,
        w.years_experience,
        w.guild_endorsement,
        w.instagram_handle,
        w.avatar_url,
        w.is_verified,
        w.created_at,
        COALESCE(rev.review_count, 0)::int AS review_count,
        rev.avg_rating,
        COALESCE(ws.work_samples, '[]'::json) AS work_samples,
        COALESCE(rev.reviews, '[]'::json) AS reviews
      FROM workers w
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS review_count,
          ROUND(AVG(r.rating)::numeric, 2) AS avg_rating,
          COALESCE(
            json_agg(
              json_build_object(
                'client_name', r.client_name,
                'job_description', r.job_description,
                'rating', r.rating,
                'comment', r.comment,
                'created_at', r.created_at
              )
              ORDER BY r.created_at DESC
            ) FILTER (WHERE r.id IS NOT NULL),
            '[]'::json
          ) AS reviews
        FROM reviews r
        WHERE r.worker_id = w.id
      ) rev ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            json_agg(
              json_build_object(
                'image_url', s.image_url,
                'caption', s.caption,
                'created_at', s.created_at
              )
              ORDER BY s.created_at DESC
            ) FILTER (WHERE s.id IS NOT NULL),
            '[]'::json
          ) AS work_samples
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
      data: listResult.rows.map((row) => toPublicWorker(row)),
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + listResult.rows.length < total,
      },
    });
  }

  /**
   * GET /api/workers/:slug (Public)
   * Returns the full public Trust Card profile with aggregated ratings,
   * dynamic verification breakdown, verified work samples, PII-minimized
   * public reviews, and WhatsApp links.
   *
   * @type {import('express').RequestHandler}
   */
  async function getWorkerBySlug(req, res) {
    const { slug } = req.validated.params;

    const workerResult = await dbQuery(
      `
      SELECT
        w.id,
        w.user_id,
        w.slug,
        w.full_name,
        w.trade,
        w.location,
        w.phone,
        w.bio,
        w.years_experience,
        w.guild_endorsement,
        w.instagram_handle,
        w.avatar_url,
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
        SELECT client_name, job_description, rating, comment, created_at
        FROM reviews
        WHERE worker_id = $1
        ORDER BY created_at DESC
        `,
        [worker.id],
      ),
    ]);

    res.status(200).json({
      data: toPublicWorker(worker, {
        workSamples: samplesResult.rows,
        reviews: reviewsResult.rows,
      }),
    });
  }

  /**
   * POST /api/workers (Protected by requireAuth)
   * Creates a new worker profile linked to the authenticated user (`req.user.id`),
   * preventing duplicate profiles per non-admin worker account.
   *
   * @type {import('express').RequestHandler}
   */
  async function createWorker(req, res) {
    const {
      full_name,
      trade,
      location,
      phone,
      bio,
      years_experience,
      guild_endorsement = null,
      instagram_handle = null,
    } = req.validated.body;

    if (req.user.role !== 'admin') {
      const existing = await dbQuery(
        'SELECT slug FROM workers WHERE user_id = $1 LIMIT 1',
        [req.user.id],
      );
      if (existing.rows.length > 0) {
        throw new AppError(
          409,
          'You already have a worker profile. Update your existing profile instead.',
          'WORKER_PROFILE_EXISTS',
        );
      }
    }

    let created = null;
    for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt += 1) {
      const slug = generateWorkerSlug(full_name, trade);
      try {
        const result = await dbQuery(
          `
          INSERT INTO workers (
            user_id,
            slug,
            full_name,
            trade,
            location,
            phone,
            bio,
            years_experience,
            guild_endorsement,
            instagram_handle
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING
            user_id,
            slug,
            full_name,
            trade,
            location,
            phone,
            bio,
            years_experience,
            guild_endorsement,
            instagram_handle,
            avatar_url,
            is_verified,
            created_at
          `,
          [
            req.user.id,
            slug,
            full_name,
            trade,
            location,
            phone,
            bio,
            years_experience,
            guild_endorsement,
            instagram_handle,
          ],
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
      data: toPublicWorker(created, { workSamples: [], reviews: [] }),
    });
  }

  /**
   * PATCH /api/workers/:slug (Protected by requireAuth)
   * Updates owner-editable worker profile fields after verifying ownership or admin role.
   *
   * @type {import('express').RequestHandler}
   */
  async function updateWorker(req, res) {
    const { slug } = req.validated.params;
    const updates = req.validated.body;

    const existingResult = await dbQuery(
      'SELECT id, user_id FROM workers WHERE slug = $1 LIMIT 1',
      [slug],
    );
    const worker = existingResult.rows[0];

    if (!worker) {
      throw new AppError(404, 'Worker profile not found.', 'WORKER_NOT_FOUND');
    }

    assertWorkerOwnership(worker, req.user);

    const setClauses = [];
    const params = [];

    for (const [key, columnName] of Object.entries(ALLOWED_PATCH_COLUMNS)) {
      if (updates[key] !== undefined) {
        params.push(updates[key]);
        setClauses.push(`${columnName} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      throw new AppError(400, 'At least one updatable field must be provided.', 'VALIDATION_ERROR');
    }

    params.push(worker.id);
    const idParamIndex = params.length;

    const updateResult = await dbQuery(
      `
      UPDATE workers
      SET ${setClauses.join(', ')}
      WHERE id = $${idParamIndex}
      RETURNING
        id,
        user_id,
        slug,
        full_name,
        trade,
        location,
        phone,
        bio,
        years_experience,
        guild_endorsement,
        instagram_handle,
        avatar_url,
        is_verified,
        created_at
      `,
      params,
    );

    const hydrated = await hydrateWorker(updateResult.rows[0]);

    res.status(200).json({
      data: hydrated,
    });
  }

  /**
   * POST /api/workers/:slug/avatar (Protected by requireAuth)
   * Verifies profile ownership (or admin role), checks image magic bytes, saves
   * under a randomized UUID filename, updates `workers.avatar_url`, and returns
   * `{ avatar_url, worker }` with the recalculated verification breakdown.
   *
   * @type {import('express').RequestHandler}
   */
  async function uploadAvatar(req, res) {
    const { slug } = req.validated.params;

    const workerResult = await dbQuery(
      'SELECT id, user_id FROM workers WHERE slug = $1 LIMIT 1',
      [slug],
    );
    const worker = workerResult.rows[0];

    if (!worker) {
      throw new AppError(404, 'Worker profile not found.', 'WORKER_NOT_FOUND');
    }

    assertWorkerOwnership(worker, req.user);

    const savedFile = await verifyAndSaveImage(req.file, uploadDir);

    try {
      const updateResult = await dbQuery(
        `
        UPDATE workers
        SET avatar_url = $1
        WHERE id = $2
        RETURNING
          id,
          user_id,
          slug,
          full_name,
          trade,
          location,
          phone,
          bio,
          years_experience,
          guild_endorsement,
          instagram_handle,
          avatar_url,
          is_verified,
          created_at
        `,
        [savedFile.imageUrl, worker.id],
      );

      const hydrated = await hydrateWorker(updateResult.rows[0]);

      res.status(200).json({
        avatar_url: savedFile.imageUrl,
        worker: hydrated,
      });
    } catch (err) {
      await cleanupUploadedFile(savedFile.absolutePath);
      throw err;
    }
  }

  /**
   * PATCH /api/workers/:slug/verify (Protected by requireAuth + Admin role)
   * Updates field verification status and optional guild endorsement, returning
   * the updated Trust Card with its recalculated `verification` object.
   *
   * @type {import('express').RequestHandler}
   */
  async function verifyWorker(req, res) {
    if (req.user.role !== 'admin') {
      throw new AppError(
        403,
        'Admin privileges are required to update worker verification status.',
        'FORBIDDEN',
      );
    }

    const { slug } = req.validated.params;
    const { is_verified, guild_endorsement } = req.validated.body;

    const existingResult = await dbQuery(
      'SELECT id FROM workers WHERE slug = $1 LIMIT 1',
      [slug],
    );
    const worker = existingResult.rows[0];

    if (!worker) {
      throw new AppError(404, 'Worker profile not found.', 'WORKER_NOT_FOUND');
    }

    const setClauses = ['is_verified = $1'];
    const params = [is_verified];

    if (guild_endorsement !== undefined) {
      params.push(guild_endorsement);
      setClauses.push(`guild_endorsement = $${params.length}`);
    }

    params.push(worker.id);
    const idParamIndex = params.length;

    const updateResult = await dbQuery(
      `
      UPDATE workers
      SET ${setClauses.join(', ')}
      WHERE id = $${idParamIndex}
      RETURNING
        id,
        user_id,
        slug,
        full_name,
        trade,
        location,
        phone,
        bio,
        years_experience,
        guild_endorsement,
        instagram_handle,
        avatar_url,
        is_verified,
        created_at
      `,
      params,
    );

    const hydrated = await hydrateWorker(updateResult.rows[0]);

    res.status(200).json({
      data: hydrated,
    });
  }

  /**
   * POST /api/workers/:slug/samples (Protected by requireAuth)
   * Verifies profile ownership (or admin role), checks magic bytes, stores under
   * a randomized UUID filename, and links the work sample to the target worker.
   *
   * @type {import('express').RequestHandler}
   */
  async function uploadWorkSample(req, res) {
    const { slug } = req.validated.params;
    const { caption } = req.validated.body;

    const workerResult = await dbQuery(
      'SELECT id, user_id FROM workers WHERE slug = $1 LIMIT 1',
      [slug],
    );
    const worker = workerResult.rows[0];

    if (!worker) {
      throw new AppError(404, 'Worker profile not found.', 'WORKER_NOT_FOUND');
    }

    assertWorkerOwnership(worker, req.user);

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
        data: toPublicSample(sample),
      });
    } catch (err) {
      await cleanupUploadedFile(savedFile.absolutePath);
      throw err;
    }
  }

  /**
   * POST /api/workers/:slug/reviews (Public)
   * Submits a verified client review (rating 1-5) with optional `job_description`
   * while preventing duplicate review spam from the same client phone per worker.
   *
   * @type {import('express').RequestHandler}
   */
  async function createReview(req, res) {
    const { slug } = req.validated.params;
    const {
      client_name,
      client_phone,
      job_description = null,
      rating,
      comment,
    } = req.validated.body;

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
        INSERT INTO reviews (worker_id, client_name, client_phone, job_description, rating, comment)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING client_name, job_description, rating, comment, created_at
        `,
        [worker.id, client_name, client_phone, job_description, rating, comment],
      );

      const review = insertResult.rows[0];

      res.status(201).json({
        data: toPublicReview(review),
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
    getMetaFilters,
    listWorkers,
    getWorkerBySlug,
    createWorker,
    updateWorker,
    uploadAvatar,
    verifyWorker,
    uploadWorkSample,
    createReview,
  };
}

export const workersController = createWorkersController();
