/**
 * Announce expiry helpers.
 *
 * An announce is visible for a fixed window after it is posted or renewed.
 * The database is authoritative (see the announce_expiry_guard trigger in
 * supabase/migrations/20260722_announce_expiry.sql); everything here is for
 * display and for building the read-time filter.
 */

/**
 * Days an announce stays visible. Mirrors the interval in the migration - if
 * you change one, change the other.
 */
export const ANNOUNCE_TTL_DAYS = 30;

/** Show the "expires soon" warning once a listing is inside this many days. */
export const EXPIRY_SOON_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Parse expires_at into epoch millis.
 * @returns {number|null} null when absent or unparseable
 */
function expiryMs(announce) {
  const raw = announce?.expires_at;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Whether an announce has passed its window.
 *
 * A row with no expires_at is treated as live, not expired. That covers rows
 * inserted optimistically in the client before the server value comes back;
 * the column itself is NOT NULL, so it never happens for persisted rows.
 *
 * @param {object} announce
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function isExpired(announce, now = Date.now()) {
  const ms = expiryMs(announce);
  return ms !== null && ms <= now;
}

/**
 * Whole days left before expiry, rounded up so that "less than 24h" reads as
 * 1 rather than 0.
 *
 * @param {object} announce
 * @param {number} [now=Date.now()]
 * @returns {number|null} null when there is no expiry date; 0 once expired
 */
export function daysUntilExpiry(announce, now = Date.now()) {
  const ms = expiryMs(announce);
  if (ms === null) return null;
  return Math.max(0, Math.ceil((ms - now) / DAY_MS));
}

/**
 * Whether an announce is live but close enough to expiry to warn its owner.
 *
 * @param {object} announce
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function isExpiringSoon(announce, now = Date.now()) {
  if (isExpired(announce, now)) return false;
  const days = daysUntilExpiry(announce, now);
  return days !== null && days <= EXPIRY_SOON_DAYS;
}
