import { env } from '../config/env.js';

/**
 * Builds pre-encoded WhatsApp deep links and public Trust Card URL for direct
 * hiring and profile sharing.
 *
 * @param {object} worker
 * @param {string} worker.slug - Worker public slug.
 * @param {string} worker.full_name - Worker display name.
 * @param {string} worker.trade - Worker trade/specialty.
 * @param {string} worker.location - Worker location.
 * @param {string} worker.phone - Sanitized digits-only phone number (E.164 digits).
 * @returns {{ hire_url: string, share_url: string, card_url: string }}
 */
export function buildWhatsAppLinks(worker) {
  const cardUrl = `${env.FRONTEND_URL}/workers/${encodeURIComponent(worker.slug)}`;

  const hireMessage = [
    `Hello ${worker.full_name},`,
    `I found your verified SkillVerify Trust Card for ${worker.trade} in ${worker.location}.`,
    'Are you available to discuss a job?',
  ].join(' ');

  const shareMessage = [
    `Check out ${worker.full_name} (${worker.trade} in ${worker.location}) on SkillVerify:`,
    cardUrl,
  ].join(' ');

  return {
    hire_url: `https://wa.me/${encodeURIComponent(worker.phone)}?text=${encodeURIComponent(hireMessage)}`,
    share_url: `https://wa.me/?text=${encodeURIComponent(shareMessage)}`,
    card_url: cardUrl,
  };
}
