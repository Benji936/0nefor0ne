// Pure parsing + row-building for a bulk "Looking For" want list.
//
// An LF message is treated as a pasted list: EVERY non-empty line is a wanted
// card, except three specials — an `archetype:` line, a standalone budget line,
// and `#` comments. This mirrors the website's paste-a-list flow
// (frontend/src/lib/bulkAddParser.js + announceWantCards.js) so the bot writes
// the same announce_want_card rows. Keep the qty/clamp/cap rules in sync.
//
// Resolution (name/set-code -> passcode) lives in index.js, since it needs the
// network; this module is pure so it can be unit tested without a Discord client.

// "LF", "LF:", "LF -" at the very start of line 1 — same marker parseAnnounce uses.
const LF_PREFIX_RE = /^\s*LF\b\s*[:\-–]?\s*/i;

// Quantity prefixes: `3x Name`, `x3 Name`, `3 Name` (mirror bulkAddParser QTY_PREFIX_RE).
const QTY_PREFIX_RE = /^(?:(\d+)[xX]\s*|[xX](\d+)\s*|(\d+)\s+)/;

// `archetype: Darklord`, `archetype - Darklord`, `archetype Darklord`.
const ARCHETYPE_LINE_RE = /^archetype\b\s*[:\-–]?\s*(.+)$/i;

// A line that is ONLY a budget: an optional "budget" label + a price, nothing
// else. Anchored at both ends so a real card line ("Ash Blossom 45€") is never
// swallowed — only "120€" / "budget 120€" / "budget: 30 GBP" count.
const BUDGET_LINE_RE = /^(?:budget\b\s*[:\-–]?\s*)?(\d+(?:[.,]\d{1,2})?)\s*(€|EUR|USD|GBP|\$|£)$/i;

const MIN_QTY = 1;
const MAX_QTY = 99;
const MAX_NAME_LEN = 120; // announce_want_card.card_name CHECK
const MAX_TITLE_LEN = 120; // announce.title

function clampQty(qty) {
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n)) return MIN_QTY;
  return Math.min(MAX_QTY, Math.max(MIN_QTY, n));
}

function capName(name) {
  const s = String(name ?? '').trim().replace(/\s+/g, ' ');
  return s.length > MAX_NAME_LEN ? s.slice(0, MAX_NAME_LEN - 1) + '…' : s;
}

function currencyOf(sym) {
  const s = String(sym).toUpperCase();
  if (s === '€' || s === 'EUR') return 'EUR';
  if (s === '$' || s === 'USD') return 'USD';
  if (s === '£' || s === 'GBP') return 'GBP';
  return 'EUR';
}

/** Strip a leading quantity prefix from one line -> { qty, query }. */
function parseQtyLine(line) {
  const m = line.match(QTY_PREFIX_RE);
  const rawQty = m ? (m[1] ?? m[2] ?? m[3]) : null;
  let qty = rawQty != null ? parseInt(rawQty, 10) : 1;
  if (!Number.isInteger(qty) || qty < 1) qty = 1;
  const query = m ? line.slice(m[0].length).trim() : line;
  return { qty, query };
}

/**
 * Parse an LF message body into its parts. The `LF:` marker on line 1 is
 * stripped; whatever remains on that line is itself a card line.
 *
 * @param {string} content
 * @returns {{ archetype: string|null, price: number|null, currency: string,
 *             wantLines: {qty:number, query:string}[] }}
 */
function parseWantList(content) {
  const rawLines = String(content ?? '').split(/\r?\n/);
  let archetype = null;
  let price = null;
  let currency = 'EUR';
  const wantLines = [];

  rawLines.forEach((raw, i) => {
    let line = raw.trim();
    if (i === 0) line = line.replace(LF_PREFIX_RE, '').trim();
    if (line === '' || line.startsWith('#')) return;

    const am = line.match(ARCHETYPE_LINE_RE);
    if (am) { if (archetype == null) archetype = am[1].trim(); return; }

    const bm = line.match(BUDGET_LINE_RE);
    if (bm) {
      if (price == null) { price = parseFloat(bm[1].replace(',', '.')); currency = currencyOf(bm[2]); }
      return;
    }

    const { qty, query } = parseQtyLine(line);
    if (query === '') return;
    wantLines.push({ qty, query });
  });

  if (archetype === '') archetype = null;
  return { archetype, price, currency, wantLines };
}

/**
 * Build announce_want_card rows from resolved want lines. A line that did not
 * resolve is KEPT with a null ygo_card_id (mirror announceWantCards.buildWantRows):
 * a human reading the post can still act on "Kashtira Fenrir (alt art)".
 *
 * @param {{ qty:number, query:string, card:{id:number,name:string}|null }[]} resolved
 * @returns {{ ygo_card_id:number|null, card_name:string, qty:number, sort_order:number }[]}
 */
function buildWantRows(resolved) {
  if (!Array.isArray(resolved)) return [];
  const rows = [];
  for (const line of resolved) {
    if (!line) continue;
    const card = line.card ?? null;
    const card_name = capName(card?.name ?? line.query);
    if (!card_name) continue;
    rows.push({
      ygo_card_id: card?.id != null ? Number(card.id) : null,
      card_name,
      qty: clampQty(line.qty),
      sort_order: rows.length,
    });
  }
  return rows;
}

/** "Ash Blossom +2 more" style announce title from built rows. '' if none. */
function wantListTitle(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const more = rows.length - 1;
  const title = more > 0 ? `${rows[0].card_name} +${more} more` : rows[0].card_name;
  return title.length > MAX_TITLE_LEN ? title.slice(0, MAX_TITLE_LEN - 1) + '…' : title;
}

module.exports = {
  parseWantList,
  buildWantRows,
  wantListTitle,
  MIN_QTY,
  MAX_QTY,
  MAX_NAME_LEN,
};
