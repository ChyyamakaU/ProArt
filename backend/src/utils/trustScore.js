/**
 * Computes a transparent 0-100 Trust Score and structured verification breakdown
 * for a worker Trust Card profile.
 *
 * Scoring weights (max 100):
 * - Phone / Account registered (Boolean(worker.user_id)): +20 pts
 * - Profile Photo uploaded (Boolean(worker.avatar_url)): +10 pts
 * - Field / Admin Verified (Boolean(worker.is_verified)): +25 pts
 * - Guild / Cooperative Endorsed (Boolean(worker.guild_endorsement)): +20 pts
 * - Proof-of-Work Samples: +5 pts per sample, capped at +15 pts (3+ samples)
 * - Client Reviews: +5 pts if reviewCount >= 1, plus +5 pts if avgRating >= 4.0 (max +10 pts)
 *
 * @param {{
 *   user_id?: number | string | null,
 *   avatar_url?: string | null,
 *   is_verified?: boolean | null,
 *   guild_endorsement?: string | null,
 * }} worker
 * @param {number} [sampleCount=0]
 * @param {number} [reviewCount=0]
 * @param {number | string | null} [avgRating=null]
 * @returns {{
 *   is_verified: boolean,
 *   badge_label: 'Guild & Field Verified' | 'Field Verified' | 'Guild Endorsed' | 'Unverified',
 *   trust_score: number,
 *   checklist: {
 *     phone_verified: boolean,
 *     photo_uploaded: boolean,
 *     field_verified: boolean,
 *     guild_endorsed: boolean,
 *     has_work_samples: boolean,
 *     has_client_reviews: boolean,
 *   },
 * }}
 */
export function buildVerificationSummary(
  worker,
  sampleCount = 0,
  reviewCount = 0,
  avgRating = null,
) {
  const phoneVerified = Boolean(worker?.user_id);
  const photoUploaded = Boolean(worker?.avatar_url);
  const fieldVerified = Boolean(worker?.is_verified);
  const guildEndorsed = Boolean(worker?.guild_endorsement);

  const safeSampleCount = Math.max(0, Number(sampleCount) || 0);
  const safeReviewCount = Math.max(0, Number(reviewCount) || 0);
  const parsedRating =
    avgRating !== null && avgRating !== undefined && avgRating !== ''
      ? Number(avgRating)
      : null;
  const safeAvgRating =
    parsedRating !== null && Number.isFinite(parsedRating) ? parsedRating : null;

  let trustScore = 0;
  if (phoneVerified) trustScore += 20;
  if (photoUploaded) trustScore += 10;
  if (fieldVerified) trustScore += 25;
  if (guildEndorsed) trustScore += 20;

  // Proof-of-work samples: +5 per sample, capped at +15 (3+ samples).
  trustScore += Math.min(safeSampleCount * 5, 15);

  // Client reviews: +5 for having at least 1 review, +5 if average rating >= 4.0.
  if (safeReviewCount >= 1) {
    trustScore += 5;
    if (safeAvgRating !== null && safeAvgRating >= 4.0) {
      trustScore += 5;
    }
  }

  let badgeLabel = 'Unverified';
  if (fieldVerified && guildEndorsed) {
    badgeLabel = 'Guild & Field Verified';
  } else if (fieldVerified) {
    badgeLabel = 'Field Verified';
  } else if (guildEndorsed) {
    badgeLabel = 'Guild Endorsed';
  }

  return {
    is_verified: fieldVerified,
    badge_label: badgeLabel,
    trust_score: Math.min(100, Math.max(0, trustScore)),
    checklist: {
      phone_verified: phoneVerified,
      photo_uploaded: photoUploaded,
      field_verified: fieldVerified,
      guild_endorsed: guildEndorsed,
      has_work_samples: safeSampleCount >= 1,
      has_client_reviews: safeReviewCount >= 1,
    },
  };
}
