import { AppError } from '../utils/AppError.js';

export async function requireCurrentAdmin(user, db, lock = false) {
  if (user.role !== 'admin') {
    throw new AppError(403, 'Administrator access is required.', 'FORBIDDEN');
  }
  const result = await db('SELECT role FROM users WHERE id = $1' + (lock ? ' FOR SHARE' : ''), [user.id]);
  if (result.rows[0]?.role !== 'admin') {
    throw new AppError(403, 'Administrator access is required.', 'FORBIDDEN');
  }
}

export async function getOwnedWorker(slug, user, db, lock = false) {
  const result = await db(
    `SELECT w.id, w.trade, w.full_name FROM workers w JOIN users u ON u.id = w.user_id
     WHERE w.slug = $1 AND w.user_id = $2 AND u.role = 'worker'${lock ? ' FOR UPDATE OF w FOR SHARE OF u' : ''}`,
    [slug, user.id],
  );
  if (!result.rows[0]) throw new AppError(404, 'Worker profile not found.', 'WORKER_NOT_FOUND');
  return result.rows[0];
}
