/**
 * Sanitizes Nigerian and international phone numbers into a strict digits-only
 * international format (E.164 digits without leading '+'), suitable for
 * WhatsApp wa.me links and consistent duplicate detection.
 *
 * Examples:
 * - "0803 123 4567"      -> "2348031234567"
 * - "+234 (0) 803-123-4567" -> "2348031234567"
 * - "00234 812 555 0199" -> "2348125550199"
 * - "+44 7700 900077"    -> "447700900077"
 *
 * @param {string} rawInput - Untrusted phone number string.
 * @returns {string | null} Normalized digits-only phone number, or null if invalid.
 */
export function sanitizePhoneNumber(rawInput) {
  if (typeof rawInput !== 'string') {
    return null;
  }

  let cleaned = rawInput.trim();
  if (!cleaned) {
    return null;
  }

  // Handle common formatting like "+234 (0) 803..." where trunk '0' is included after country code.
  cleaned = cleaned.replace(/^(\+|00)?234[\s-]*\(0\)/, '234');

  // Remove international dialing prefix '00' before stripping non-digits.
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.slice(2);
  }

  // Keep digits only.
  let digits = cleaned.replace(/\D/g, '');

  // Convert local Nigerian 11-digit mobile/landline format (0XXXXXXXXXX) -> 234XXXXXXXXXX.
  if (/^0[789][01]\d{8}$/.test(digits) || /^0\d{10}$/.test(digits)) {
    digits = `234${digits.slice(1)}`;
  } else if (/^2340\d{10}$/.test(digits)) {
    // Handle mistaken "234080..." format -> "23480..."
    digits = `234${digits.slice(4)}`;
  }

  // Enforce ITU-T E.164 bounds (10 to 15 digits, cannot start with 0).
  if (!/^[1-9]\d{9,14}$/.test(digits)) {
    return null;
  }

  // Additional length guard for Nigerian numbers (always 234 + 10 digits = 13 digits).
  if (digits.startsWith('234') && digits.length !== 13) {
    return null;
  }

  return digits;
}
