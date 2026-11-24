import crypto from 'node:crypto';

/**
 * Converts free text into a clean ASCII URL slug segment.
 *
 * @param {string} value - Raw text input.
 * @param {number} [maxLength=40] - Maximum character length for the segment.
 * @returns {string}
 */
function slugifySegment(value, maxLength = 40) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

/**
 * Generates a collision-safe, human-readable URL slug for a worker profile.
 * Format: "<name>-<trade>-<6-char-random-hex>" (e.g., "chinedu-okafor-electrician-a3f91c").
 *
 * @param {string} fullName - Worker's full name.
 * @param {string} trade - Worker's primary trade.
 * @returns {string} URL-safe, collision-resistant slug.
 */
export function generateWorkerSlug(fullName, trade) {
  const namePart = slugifySegment(fullName, 45) || 'artisan';
  const tradePart = slugifySegment(trade, 30) || 'pro';
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${namePart}-${tradePart}-${suffix}`;
}
