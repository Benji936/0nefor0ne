/**
 * Helpers shared by the announce UI for the two announce kinds.
 *
 * `sell`        — the original listing: a specific card, with a price.
 * `looking_for` — a buyer stating an archetype plus a qualifier
 *                 ("Darklord deck base"), with an optional budget.
 *
 * Everything here is pure so it can be unit tested without a DOM or network.
 * The Discord bot has its own copy of the prefix/archetype logic in
 * discord-bot/lib/parseAnnounce.js — the two packages ship separately and
 * share no build, so the duplication is deliberate. Keep them in sync.
 */

export const ANNOUNCE_KIND = {
  SELL: 'sell',
  LOOKING_FOR: 'looking_for',
};

// "LF", "LF:", "LF -" at the very start, but not "LFP" or "Golfer".
const LF_PREFIX_RE = /^\s*LF\b\s*[:\-–]?\s*/i;

// The prefixes the bot has always stripped, plus LF.
const ANY_PREFIX_RE = /^\s*(LF|WTS|WTT|WTB)\b\s*[:\-–]?\s*/i;

/** True when this announce row is a Looking For post. */
export function isLookingFor(announce) {
  return announce?.kind === ANNOUNCE_KIND.LOOKING_FOR;
}

/** Remove a leading LF/WTS/WTT/WTB marker from a headline. */
export function stripKindPrefix(text) {
  return String(text ?? '').replace(ANY_PREFIX_RE, '').trim();
}

/** Which kind a raw message/title represents, based on its prefix. */
export function detectKindFromText(text) {
  return LF_PREFIX_RE.test(String(text ?? ''))
    ? ANNOUNCE_KIND.LOOKING_FOR
    : ANNOUNCE_KIND.SELL;
}

/** Escape a string for literal use inside a RegExp. */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whole-word pattern for an archetype name, tolerating a plural suffix.
 *
 * Bounded at both ends, or a short name like the real "P" archetype matches
 * the start of "playset". The optional plural keeps "Darklords" matching
 * "Darklord". The trailing guard is `(?!\w)` rather than `\b` because names
 * such as "D.D." end in a non-word character, where `\b` would demand a
 * following word character and never match.
 */
function archetypeRe(name) {
  return new RegExp(`\\b${escapeRe(name)}(?:s|es)?(?!\\w)`, 'i');
}

/**
 * Find the first archetype from `archetypes` that appears in `text`.
 * Longest-first so "Dark Magician" beats a bare "Dark" style entry, and
 * word-bounded so "superhero" does not match "HERO".
 * @param {string} text
 * @param {string[]} archetypes  canonical names, e.g. from api.js getArchetypes()
 * @returns {string|null}
 */
export function matchArchetype(text, archetypes) {
  const haystack = String(text ?? '').trim();
  if (!haystack || !Array.isArray(archetypes) || archetypes.length === 0) return null;

  const sorted = [...archetypes].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (archetypeRe(name).test(haystack)) return name;
  }
  return null;
}

/** Human headline for an LF post: "Darklord deck base". */
export function composeWantHeadline(archetype, wantDetail) {
  return [archetype, wantDetail]
    .map(part => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');
}
