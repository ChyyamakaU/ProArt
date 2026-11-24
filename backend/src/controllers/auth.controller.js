import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { signAccessToken } from '../utils/jwt.js';
import { buildVerificationSummary } from '../utils/trustScore.js';
import { buildWhatsAppLinks } from '../utils/whatsapp.js';

const BCRYPT_ROUNDS = 12;

/**
 * Valid cost-12 bcrypt hash used for constant-time dummy verification when a
 * login phone number does not exist, mitigating timing-based user enumeration.
 */
const DUMMY_PASSWORD_HASH =
  '$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';

/**
 * Formats a linked worker profile for GET /api/auth/me without exposing
 * internal IDs, user_id, or reviewer phone numbers.
 *
 * @param {Record<string, any>} row
 * @param {Array<Record<string, any>>} samples
 * @param {Array<Record<string, any>>} reviews
 */
function formatOwnedWorkerProfile(row, samples, reviews) {
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
    verification: buildVerificationSummary(row, samples.length, reviewCount, avgRating),
    work_samples: samples.map((sample) => ({
      image_url: sample.image_url,
      caption: sample.caption,
      created_at: sample.created_at,
    })),
    reviews: reviews.map((review) => ({
      client_name: review.client_name,
      job_description: review.job_description ?? null,
      rating: Number(review.rating),
      comment: review.comment,
      created_at: review.created_at,
    })),
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
 * Creates authentication controller handlers with injectable dependencies for tests.
 *
 * @param {{
 *   dbQuery?: typeof query,
 *   bcryptRounds?: number,
 * }} [deps]
 */
export function createAuthController(deps = {}) {
  const dbQuery = deps.dbQuery ?? query;
  const bcryptRounds = deps.bcryptRounds ?? BCRYPT_ROUNDS;

  /**
   * POST /api/auth/register
   * Registers a new worker account with bcrypt-hashed password and issues a JWT.
   *
   * @type {import('express').RequestHandler}
   */
  async function register(req, res) {
    const { phone, password, role } = req.validated.body;

    const passwordHash = await bcrypt.hash(password, bcryptRounds);

    try {
      const insertResult = await dbQuery(
        `
        INSERT INTO users (phone, password_hash, role)
        VALUES ($1, $2, $3)
        RETURNING id, phone, role, created_at
        `,
        [phone, passwordHash, role],
      );

      const user = insertResult.rows[0];
      const userDto = {
        id: Number(user.id),
        phone: user.phone,
        role: user.role,
      };

      const token = signAccessToken(userDto);

      res.status(201).json({
        token,
        user: userDto,
      });
    } catch (err) {
      if (err?.code === '23505') {
        throw new AppError(
          409,
          'Phone number is already registered.',
          'PHONE_ALREADY_REGISTERED',
        );
      }
      throw err;
    }
  }

  /**
   * POST /api/auth/login
   * Authenticates a user with constant-time bcrypt verification and generic
   * 401 failure messages to prevent account enumeration.
   *
   * @type {import('express').RequestHandler}
   */
  async function login(req, res) {
    const { phone, password } = req.validated.body;

    const result = await dbQuery(
      `
      SELECT id, phone, password_hash, role
      FROM users
      WHERE phone = $1
      LIMIT 1
      `,
      [phone],
    );

    const user = result.rows[0];
    const hashToCompare = user?.password_hash ?? DUMMY_PASSWORD_HASH;
    const isPasswordValid = await bcrypt.compare(password, hashToCompare);

    if (!user || !isPasswordValid) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const userDto = {
      id: Number(user.id),
      phone: user.phone,
      role: user.role,
    };

    const token = signAccessToken(userDto);

    res.status(200).json({
      token,
      user: userDto,
    });
  }

  /**
   * GET /api/auth/me
   * Returns the authenticated user's identity and linked worker profile (if any).
   *
   * @type {import('express').RequestHandler}
   */
  async function me(req, res) {
    const userResult = await dbQuery(
      `
      SELECT id, phone, role, created_at
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [req.user.id],
    );

    const user = userResult.rows[0];
    if (!user) {
      throw new AppError(401, 'Authentication session is no longer valid.', 'UNAUTHORIZED');
    }

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
      WHERE w.user_id = $1
      ORDER BY w.created_at DESC
      LIMIT 1
      `,
      [user.id],
    );

    let worker = null;
    const workerRow = workerResult.rows[0];
    if (workerRow) {
      const [samplesResult, reviewsResult] = await Promise.all([
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

      worker = formatOwnedWorkerProfile(
        workerRow,
        samplesResult.rows,
        reviewsResult.rows,
      );
    }

    res.status(200).json({
      user: {
        id: Number(user.id),
        phone: user.phone,
        role: user.role,
        created_at: user.created_at,
      },
      worker,
    });
  }

  return {
    register,
    login,
    me,
  };
}

export const authController = createAuthController();
