// Marketplace lookups for the slash commands.
//
// "Who trades this card" lives in the `Card` table (each trader's binder), not
// in `announce` — announces are the classifieds and are far sparser. A search
// therefore covers three sources:
//
//   1. trading  — Card rows with wish = false, status = 'available'
//   2. wanted   — Card rows with wish = true, plus Looking For announces
//   3. listings — active sell announces (these carry a price and a link)
//
// Kept free of discord.js so it can be unit tested with a stubbed Supabase
// client. Every filter goes through `.ilike()` / `.in()` rather than `.or()` so
// the user's text is encoded by supabase-js instead of being spliced into a
// PostgREST filter expression (card names contain commas, quotes and parens).

const SELL_KIND = 'sell';
const LF_KIND = 'looking_for';
const AVAILABLE = 'available';

/** Trims and caps the search text. Returns null when there is nothing to search. */
function normalizeQuery(raw) {
  const q = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (q.length < 2) return null;
  return q.slice(0, 100);
}

/**
 * `%ash%` also matches "Kashtira" and "Unleashing", so rank matches instead of
 * showing them in arbitrary order: exact, then prefix, then word-start, then
 * any substring. Lower is better.
 */
function relevance(name, query) {
  const n = String(name ?? '').toLowerCase();
  const q = query.toLowerCase();
  if (!n) return 4;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}`).test(n) ? 2 : 3;
}

function dedupeById(rows) {
  const seen = new Map();
  for (const row of rows) if (!seen.has(row.id)) seen.set(row.id, row);
  return [...seen.values()];
}

/** seller uuid -> display name, in one round trip. */
async function fetchTraderNames(supabase, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from('Trader').select('id, Name').in('id', unique);
  if (error) throw error;
  return new Map((data ?? []).map((t) => [t.id, t.Name || 'Unknown trader']));
}

/**
 * One trader can hold several rows of the same card (different rarity, edition
 * or condition), so collapse them per trader+name and sum the copies.
 */
function groupCollection(rows, query = '') {
  const byKey = new Map();
  for (const row of rows) {
    const name = row.name ?? '';
    const key = `${row.trader}::${name.toLowerCase()}`;
    const qty = Number(row.quantity) || 1;
    const existing = byKey.get(key);
    if (existing) {
      existing.qty += qty;
      existing.variants += 1;
      continue;
    }
    byKey.set(key, {
      name,
      qty,
      variants: 1,
      condition: row.condition ?? null,
      rarity: row.rarity || null,
      language: row.language || null,
      firstEdition: row.first_edition === true,
      trader: row.trader,
    });
  }
  return [...byKey.values()].sort(
    (a, b) =>
      relevance(a.name, query) - relevance(b.name, query) ||
      b.qty - a.qty ||
      a.name.localeCompare(b.name),
  );
}

/**
 * Finds who trades, who wants, and what is listed for a card.
 *
 * @returns {Promise<{query: string, trading: object[], wanted: object[], listings: object[]}>}
 */
async function searchListings(supabase, rawQuery, { limit = 8 } = {}) {
  const query = normalizeQuery(rawQuery);
  if (!query) return { query: '', trading: [], wanted: [], listings: [] };

  const like = `%${query}%`;
  const announceCols = 'id, title, card_name, price, currency, seller, created_at';
  const sellBase = () =>
    supabase.from('announce').select(announceCols).eq('status', 'active').eq('kind', SELL_KIND);
  const lfBase = () =>
    supabase
      .from('announce')
      .select('id, seller, created_at, title, archetype')
      .eq('status', 'active')
      .eq('kind', LF_KIND);

  const [collection, byCard, byTitle, wantRows] = await Promise.all([
    supabase
      .from('Card')
      .select('name, quantity, rarity, condition, language, first_edition, trader, wish')
      .eq('status', AVAILABLE)
      .ilike('name', like)
      .limit(200),
    sellBase().ilike('card_name', like).limit(limit * 2),
    sellBase().ilike('title', like).limit(limit * 2),
    supabase.from('announce_want_card').select('announce, card_name, qty').ilike('card_name', like).limit(limit * 3),
  ]);
  for (const res of [collection, byCard, byTitle, wantRows]) if (res.error) throw res.error;

  const cardRows = collection.data ?? [];
  const trading = groupCollection(cardRows.filter((r) => r.wish !== true), query).slice(0, limit);
  const wishlist = groupCollection(cardRows.filter((r) => r.wish === true), query).slice(0, limit);

  // Sell announces: most only carry the card name in `title`, so match both.
  const listings = dedupeById([...(byCard.data ?? []), ...(byTitle.data ?? [])])
    .sort(
      (a, b) =>
        relevance(a.card_name || a.title, query) - relevance(b.card_name || b.title, query) ||
        new Date(b.created_at) - new Date(a.created_at),
    )
    .slice(0, limit);

  // A Looking For post matches either through a want-card row or through the
  // post itself (archetype-only posts carry no want rows at all).
  const wantAnnounceIds = [...new Set((wantRows.data ?? []).map((r) => r.announce))];
  const [lfParents, lfByArchetype, lfByTitle] = await Promise.all([
    wantAnnounceIds.length > 0 ? lfBase().in('id', wantAnnounceIds) : { data: [], error: null },
    lfBase().ilike('archetype', like).limit(limit * 2),
    lfBase().ilike('title', like).limit(limit * 2),
  ]);
  for (const res of [lfParents, lfByArchetype, lfByTitle]) if (res.error) throw res.error;

  const wanted = [];
  const seenAnnounce = new Set();
  const pushAnnounceWant = (announce, label, qty) => {
    if (!announce || seenAnnounce.has(announce.id)) return;
    seenAnnounce.add(announce.id);
    wanted.push({
      source: 'announce',
      id: announce.id,
      seller: announce.seller,
      created_at: announce.created_at,
      label,
      qty: qty ?? null,
    });
  };

  const lfById = new Map((lfParents.data ?? []).map((p) => [p.id, p]));
  for (const row of wantRows.data ?? []) pushAnnounceWant(lfById.get(row.announce), row.card_name, row.qty);
  for (const a of [...(lfByArchetype.data ?? []), ...(lfByTitle.data ?? [])]) {
    pushAnnounceWant(a, a.archetype || a.title, null);
  }
  for (const w of wishlist) {
    wanted.push({ source: 'collection', seller: w.trader, label: w.name, qty: w.qty });
  }

  const names = await fetchTraderNames(supabase, [
    ...trading.map((t) => t.trader),
    ...listings.map((l) => l.seller),
    ...wanted.map((w) => w.seller),
  ]);
  const nameOf = (id) => names.get(id) ?? 'Unknown trader';

  return {
    query,
    trading: trading.map((t) => ({ ...t, traderName: nameOf(t.trader) })),
    wanted: wanted.slice(0, limit * 2).map((w) => ({ ...w, traderName: nameOf(w.seller) })),
    listings: listings.map((l) => ({ ...l, traderName: nameOf(l.seller) })),
  };
}

module.exports = { searchListings, normalizeQuery, groupCollection, relevance };
