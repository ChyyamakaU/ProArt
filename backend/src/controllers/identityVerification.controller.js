import { query, withTransaction } from '../config/db.js';
import { getOwnedWorker, requireCurrentAdmin } from '../middleware/verificationAccess.js';
import { AppError } from '../utils/AppError.js';

const columns = 's.id, s.status, s.document_type, s.submitted_at, s.review_started_at, s.decided_at, s.reason';
const history = 'ORDER BY s.submitted_at DESC, s.id DESC';

function format(row) {
  return {
    id: row.id, status: row.status, document_type: row.document_type,
    submitted_at: row.submitted_at, review_started_at: row.review_started_at,
    decided_at: row.decided_at, reason: row.reason,
  };
}

export function createIdentityVerificationController({ storage, dbQuery = query, transaction = withTransaction }) {
  async function authorizeSubmission(req, _res, next) {
    await getOwnedWorker(req.validated.params.slug, req.user, dbQuery);
    storage.requireAvailable();
    next();
  }

  async function getStatus(req, res) {
    const { limit, offset } = req.validated.query;
    const worker = await getOwnedWorker(req.validated.params.slug, req.user, dbQuery);
    const [latest, page] = await Promise.all([
      dbQuery(`SELECT ${columns} FROM identity_submissions s WHERE s.worker_id = $1 ${history} LIMIT 1`, [worker.id]),
      dbQuery(`SELECT ${columns} FROM identity_submissions s WHERE s.worker_id = $1 ${history} LIMIT $2 OFFSET $3`,
        [worker.id, limit + 1, offset]),
    ]);
    const current = latest.rows[0] ? format(latest.rows[0]) : null;
    res.json({
      available: storage.available, status: current?.status ?? 'not_started', current,
      history: page.rows.slice(0, limit).map(format), pagination: { limit, offset, has_more: page.rows.length > limit },
    });
  }

  async function submit(req, res) {
    const bytes = await storage.prepare(req.file);
    let storageKey;
    let inserted = false;
    try {
      const result = await transaction(async db => {
        const worker = await getOwnedWorker(req.validated.params.slug, req.user, db, true);
        const latest = await db(`SELECT status FROM identity_submissions s WHERE s.worker_id = $1 ${history} LIMIT 1`, [worker.id]);
        const status = latest.rows[0]?.status;
        if (status && !['rejected', 'resubmission_required'].includes(status)) {
          throw new AppError(409, 'This profile already has an active or verified identity submission.', 'IDENTITY_SUBMISSION_CONFLICT');
        }
        storageKey = await storage.save(bytes);
        const created = await db(
          'INSERT INTO identity_submissions (worker_id, full_name, document_type, storage_key) VALUES ($1, $2, $3, $4) RETURNING *',
          [worker.id, worker.full_name, req.validated.body.document_type, storageKey],
        );
        inserted = true;
        return format(created.rows[0]);
      });
      res.status(201).json({ data: result });
    } catch (error) {
      // If the commit result is uncertain, keep the file so a committed row never points to a deleted document.
      if (storageKey && !inserted) await storage.discard(storageKey);
      if (error.code === '23505' && error.constraint === 'uq_identity_submissions_active_worker') {
        throw new AppError(409, 'This profile already has an active identity submission.', 'IDENTITY_SUBMISSION_CONFLICT');
      }
      throw error;
    }
  }

  async function listQueue(req, res) {
    await requireCurrentAdmin(req.user, dbQuery);
    const { status, limit, offset } = req.validated.query;
    const statuses = status === 'active' ? ['submitted', 'under_review'] : [status];
    const result = await dbQuery(
      `SELECT ${columns}, s.full_name, w.user_id FROM identity_submissions s
       JOIN workers w ON w.id = s.worker_id WHERE s.status = ANY($1::text[])
       ORDER BY s.submitted_at ASC, s.id ASC LIMIT $2 OFFSET $3`,
      [statuses, limit + 1, offset],
    );
    res.json({
      data: result.rows.slice(0, limit).map(row => ({
        ...format(row), full_name: row.full_name,
        can_review: row.user_id !== req.user.id && ['submitted', 'under_review'].includes(row.status),
        can_view_document: row.user_id !== req.user.id && storage.available,
      })),
      pagination: { limit, offset, has_more: result.rows.length > limit },
    });
  }

  async function selectForAdmin(id, user, db, lockSubmission = false) {
    await requireCurrentAdmin(user, db, true);
    const result = await db(
      `SELECT s.*, w.user_id FROM identity_submissions s JOIN workers w ON w.id = s.worker_id
       WHERE s.id = $1 ${lockSubmission ? 'FOR UPDATE OF s' : 'FOR SHARE OF s'} FOR SHARE OF w`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new AppError(404, 'Identity submission not found.', 'IDENTITY_SUBMISSION_NOT_FOUND');
    if (row.user_id === user.id) throw new AppError(403, 'You cannot review your own worker profile.', 'IDENTITY_SELF_REVIEW');
    return row;
  }

  async function getDocument(req, res) {
    const bytes = await transaction(async db => {
      const row = await selectForAdmin(req.validated.params.id, req.user, db);
      const file = await storage.read(row.storage_key);
      await db('INSERT INTO identity_document_access (submission_id, administrator_id) VALUES ($1, $2)', [row.id, req.user.id]);
      return file;
    });
    res.set({
      'Content-Type': 'image/jpeg', 'Content-Length': String(bytes.length),
      'Content-Disposition': 'attachment; filename="identity-document.jpg"',
      'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff',
    }).end(bytes);
  }

  async function review(req, res) {
    const { id } = req.validated.params;
    const { status, reason = null } = req.validated.body;
    const data = await transaction(async db => {
      const row = await selectForAdmin(id, req.user, db, true);
      const expected = status === 'under_review' ? 'submitted' : 'under_review';
      if (row.status !== expected) {
        throw new AppError(409, 'This submission has changed. Refresh the review queue.', 'IDENTITY_STATUS_CONFLICT');
      }
      if (status === 'verified') {
        const access = await db(
          'SELECT 1 FROM identity_document_access WHERE submission_id = $1 AND administrator_id = $2 LIMIT 1', [id, req.user.id],
        );
        if (!access.rowCount) throw new AppError(409, 'Open the document before approving it.', 'IDENTITY_DOCUMENT_REVIEW_REQUIRED');
      }
      const changed = await db(
        `UPDATE identity_submissions SET status = $2, reviewer_id = $3,
          review_started_at = CASE WHEN $2 = 'under_review' THEN clock_timestamp() ELSE review_started_at END,
          decided_at = CASE WHEN $2 = 'under_review' THEN NULL ELSE clock_timestamp() END,
          reason = $4 WHERE id = $1 AND status = $5 RETURNING *`,
        [id, status, req.user.id, reason, expected],
      );
      if (!changed.rows[0]) throw new AppError(409, 'This submission has changed.', 'IDENTITY_STATUS_CONFLICT');
      return format(changed.rows[0]);
    });
    res.json({ data });
  }

  return { authorizeSubmission, getStatus, submit, listQueue, getDocument, review };
}
