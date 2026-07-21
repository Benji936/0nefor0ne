// Pure parsing of a Discord message into announce fields.
//
// Extracted from index.js so it can be unit tested without a Discord client.
// Mirrors frontend/src/lib/announceKind.js — the two packages ship separately
// and share no build, so the duplication is deliberate. Keep them in sync.

const ANNOUNCE_KIND = {
  SELL: 'sell',
  LOOKING_FOR: 'looking_for',
};

// "LF", "LF:", "LF -" at the very start, but not "LFP" or "Golfer".
const LF_PREFIX_RE = /^\s*LF\b\s*[:\-–]?\s*/i;
const ANY_PREFIX_RE = /^\s*(LF|WTS|WTT|WTB)\b\s*[:\-–]?\s*/i;
const PRICE_RE = /(\d+(?:[.,]\d{1,2})?)\s*(€|EUR|USD|GBP|\$|£)/i;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** First archetype appearing in `text`, longest name first. */
function matchArchetype(text, archetypes) {
  const haystack = String(text ?? '').trim();
  if (!haystack || !Array.isArray(archetypes) || archetypes.length === 0) return null;

  const sorted = [...archetypes].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const re = new RegExp(`\\b${escapeRe(name)}`, 'i');
    if (re.test(haystack)) return name;
  }
  return null;
}

/**
 * Parse a Discord message into announce fields.
 *
 * Sell:
 *   WTS: Blue-Eyes White Dragon PSA 9
 *   Mint condition, bought from TCGplayer.
 *   Price: 45€
 *
 * Looking For:
 *   LF: Darklord deck base
 *   Budget 120€
 *
 * @param {string}   content
 * @param {string[]} [archetypes=[]] canonical YGOPRODeck archetype names
 */
function parseAnnounce(content, archetypes = []) {
  const lines = String(content ?? '').trim().split('\n').map(l => l.trim()).filter(Boolean);
  const first = lines[0] ?? '';

  const kind = LF_PREFIX_RE.test(first) ? ANNOUNCE_KIND.LOOKING_FOR : ANNOUNCE_KIND.SELL;

  // 'Untitled' is only a fallback for a message with no content lines at
  // all (e.g. an image-only post). A message whose text strips down to the
  // empty string (e.g. "WTS:") must yield an empty title so the caller's
  // "could not read a title" guard can fire, matching the original inline
  // parseAnnounce's `lines[0] ?? 'Untitled'` semantics.
  let headline = first.replace(ANY_PREFIX_RE, '').trim();
  if (lines.length === 0) headline = 'Untitled';

  // Price is optional everywhere now: an LF post may name no budget, and a
  // missing price is stored as NULL rather than a misleading 0.
  let price = null;
  let currency = 'EUR';
  for (const line of lines) {
    const m = line.match(PRICE_RE);
    if (m) {
      price = parseFloat(m[1].replace(',', '.'));
      const sym = m[2].toUpperCase();
      if (sym === '€' || sym === 'EUR') currency = 'EUR';
      else if (sym === '$' || sym === 'USD') currency = 'USD';
      else if (sym === '£' || sym === 'GBP') currency = 'GBP';
      break;
    }
  }

  let archetype = null;
  let wantDetail = null;
  if (kind === ANNOUNCE_KIND.LOOKING_FOR) {
    archetype = matchArchetype(headline, archetypes);
    // Whatever is left after removing the archetype is the qualifier
    // ("deck base"). With no archetype match the whole headline is the detail.
    wantDetail = archetype
      ? headline.replace(new RegExp(`\\b${escapeRe(archetype)}\\w*`, 'i'), '').replace(/\s+/g, ' ').trim()
      : headline;
    if (!wantDetail) wantDetail = null;
  }

  let title = headline;
  if (title.length > 120) title = title.slice(0, 117) + '…';

  const description = lines.slice(1).join('\n').trim().slice(0, 1000);

  return { kind, title, description, price, currency, archetype, wantDetail };
}

module.exports = { parseAnnounce, matchArchetype, ANNOUNCE_KIND };
