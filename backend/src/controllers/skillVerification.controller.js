import { query, withTransaction } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { requireCurrentAdmin, getOwnedWorker } from '../middleware/verificationAccess.js';

function submission(row) {
  return {
    id: row.id,
    trade: row.trade,
    status: row.status,
    submitted_at: row.submitted_at,
    review_started_at: row.review_started_at,
    decided_at: row.decided_at,
    reason: row.reason,
    sample: { id: row.work_sample_id, image_url: row.image_url, caption: row.caption },
  };
}

const historyOrder = 'ORDER BY s.submitted_at DESC, s.id DESC';
const submissionColumns = 's.*, sample.image_url, sample.caption';
const sampleJoin = 'JOIN work_samples sample ON sample.id = s.work_sample_id AND sample.worker_id = s.worker_id';

export function createSkillVerificationController({ dbQuery = query, transaction = withTransaction } = {}) {
  async function getStatus(req, res) {
    const { limit, offset } = req.validated.query;
    const worker = await getOwnedWorker(req.validated.params.slug, req.user, dbQuery);
    const [latest, history, samples] = await Promise.all([
      dbQuery(`SELECT ${submissionColumns} FROM skill_submissions s ${sampleJoin}
               WHERE s.worker_id = $1 ${historyOrder} LIMIT 1`, [worker.id]),
      dbQuery(`SELECT ${submissionColumns} FROM skill_submissions s ${sampleJoin}
               WHERE s.worker_id = $1 ${historyOrder} LIMIT $2 OFFSET $3`, [worker.id, limit + 1, offset]),
      dbQuery('SELECT id, image_url, caption FROM work_samples WHERE worker_id = $1 ORDER BY created_at DESC, id DESC', [worker.id]),
    ]);
    const current = latest.rows[0] ? submission(latest.rows[0]) : null;
    res.set('Cache-Control', 'no-store').json({
      status: current?.status ?? 'not_started',
      current,
      history: history.rows.slice(0, limit).map(submission),
      samples: samples.rows,
      pagination: { limit, offset, has_more: history.rows.length > limit },
    });
  }

  async function submit(req, res) {
    const { slug } = req.validated.params;
    const { work_sample_id: sampleId } = req.validated.body;
    let created;
    try {
      created = await transaction(async db => {
        const worker = await getOwnedWorker(slug, req.user, db, true);
        const evidence = await db('SELECT id, image_url, caption FROM work_samples WHERE id = $1 AND worker_id = $2', [sampleId, worker.id]);
        if (!evidence.rows[0]) throw new AppError(404, 'Choose a work sample from your profile.', 'SKILL_SAMPLE_NOT_FOUND');

        const latest = await db(
          `SELECT status FROM skill_submissions s WHERE s.worker_id = $1 ${historyOrder} LIMIT 1`, [worker.id],
        );
        const status = latest.rows[0]?.status;
        if (status && !['rejected', 'resubmission_required'].includes(status)) {
          throw new AppError(409, 'This profile already has an active or verified skill submission.', 'SKILL_SUBMISSION_CONFLICT');
        }
        const result = await db(
          'INSERT INTO skill_submissions (worker_id, work_sample_id, trade) VALUES ($1, $2, $3) RETURNING *',
          [worker.id, sampleId, worker.trade],
        );
        return submission({ ...result.rows[0], image_url: evidence.rows[0].image_url, caption: evidence.rows[0].caption });
      });
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'uq_skill_submissions_active_worker') {
        throw new AppError(409, 'This profile already has an active skill submission.', 'SKILL_SUBMISSION_CONFLICT');
      }
      throw error;
    }
    res.set('Cache-Control', 'no-store').status(201).json({ data: created });
  }

  async function listQueue(req, res) {
    await requireCurrentAdmin(req.user, dbQuery);
    const { status, limit, offset } = req.validated.query;
    const statuses = status === 'active' ? ['submitted', 'under_review'] : [status];
    const result = await dbQuery(
      `SELECT ${submissionColumns}, w.slug, w.full_name, w.user_id FROM skill_submissions s
       ${sampleJoin} JOIN workers w ON w.id = s.worker_id
       WHERE s.status = ANY($1::text[]) ORDER BY s.submitted_at ASC, s.id ASC LIMIT $2 OFFSET $3`,
      [statuses, limit + 1, offset],
    );
    res.set('Cache-Control', 'no-store').json({
      data: result.rows.slice(0, limit).map(row => ({
        ...submission(row), worker: { slug: row.slug, full_name: row.full_name },
        can_review: row.user_id !== req.user.id && ['submitted', 'under_review'].includes(row.status),
      })),
      pagination: { limit, offset, has_more: result.rows.length > limit },
    });
  }

  async function review(req, res) {
    const { status, reason = null } = req.validated.body;
    const { id } = req.validated.params;
    const data = await transaction(async db => {
      await requireCurrentAdmin(req.user, db, true);
      const expected = status === 'under_review' ? 'submitted' : 'under_review';
      const selected = await db(
        `SELECT ${submissionColumns}, w.user_id FROM skill_submissions s
         ${sampleJoin} JOIN workers w ON w.id = s.worker_id WHERE s.id = $1 FOR UPDATE OF s FOR SHARE OF w`,
        [id],
      );
      const row = selected.rows[0];
      if (!row) throw new AppError(404, 'Skill submission not found.', 'SKILL_SUBMISSION_NOT_FOUND');
      if (row.user_id === req.user.id) throw new AppError(403, 'You cannot review your own worker profile.', 'SKILL_SELF_REVIEW');
      if (row.status !== expected) throw new AppError(409, 'This submission has changed. Refresh the review queue.', 'SKILL_STATUS_CONFLICT');

      const updated = await db(
        `UPDATE skill_submissions SET status = $2, reviewer_id = $3,
         review_started_at = CASE WHEN $2 = 'under_review' THEN clock_timestamp() ELSE review_started_at END,
         decided_at = CASE WHEN $2 = 'under_review' THEN NULL ELSE clock_timestamp() END,
         reason = $4 WHERE id = $1 AND status = $5 RETURNING *`,
        [id, status, req.user.id, reason, expected],
      );
      if (!updated.rows[0]) throw new AppError(409, 'This submission has changed. Refresh the review queue.', 'SKILL_STATUS_CONFLICT');
      return submission({ ...row, ...updated.rows[0] });
    });
    res.set('Cache-Control', 'no-store').json({ data });
  }

  return { getStatus, submit, listQueue, review };
}
