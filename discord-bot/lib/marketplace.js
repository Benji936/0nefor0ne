// Marketplace lookups for the slash commands.
//
// Kept free of discord.js so it can be unit tested with a stubbed Supabase
// client. Every query goes through `.ilike()` rather than `.or()` so the user's
// search text is encoded by supabase-js instead of being spliced into a
// PostgREST filter expression (card names contain commas, quotes and parens).

const SELL_KIND = 'sell';
const LF_KIND = 'looking_for';

/** Trims and caps the search text. Returns null when there is nothing to search. */
function normalizeQuery(raw) {
  const q = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (q.length < 2) return null;
  return q.slice(0, 100);
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
 * Finds who is selling and who is looking for a card.
 *
 * Most sell announces only carry the card name in `title` (card_name is set
 * only when a set code was detected), so both columns are searched.
 *
 * @returns {Promise<{query: string, sells: object[], wants: object[]}>}
 */
async function searchListings(supabase, rawQuery, { limit = 8 } = {}) {
  const query = normalizeQuery(rawQuery);
  if (!query) return { query: '', sells: [], wants: [] };

  const like = `%${query}%`;
  const cols = 'id, title, card_name, price, currency, seller, created_at';
  const base = () => supabase.from('announce').select(cols).eq('status', 'active').eq('kind', SELL_KIND);

  const [byCard, byTitle, wantRows] = await Promise.all([
    base().ilike('card_name', like).limit(limit * 2),
    base().ilike('title', like).limit(limit * 2),
    supabase
      .from('announce_want_card')
      .select('announce, card_name, qty')
      .ilike('card_name', like)
      .limit(limit * 3),
  ]);

  for (const res of [byCard, byTitle, wantRows]) if (res.error) throw res.error;

  const sells = dedupeById([...(byCard.data ?? []), ...(byTitle.data ?? [])])
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);

  // A Looking For post can match two ways: a specific want-card row, or the
  // post itself (archetype-only posts carry no want rows at all).
  const lfBase = () =>
    supabase
      .from('announce')
      .select('id, seller, created_at, title, archetype')
      .eq('status', 'active')
      .eq('kind', LF_KIND);

  const wantAnnounceIds = [...new Set((wantRows.data ?? []).map((r) => r.announce))];
  const [lfParents, lfByArchetype, lfByTitle] = await Promise.all([
    wantAnnounceIds.length > 0 ? lfBase().in('id', wantAnnounceIds) : { data: [], error: null },
    lfBase().ilike('archetype', like).limit(limit * 2),
    lfBase().ilike('title', like).limit(limit * 2),
  ]);
  for (const res of [lfParents, lfByArchetype, lfByTitle]) if (res.error) throw res.error;

  const wants = [];
  const seenAnnounce = new Set();
  const pushWant = (announce, label, qty) => {
    if (!announce || seenAnnounce.has(announce.id)) return;
    seenAnnounce.add(announce.id);
    wants.push({
      id: announce.id,
      seller: announce.seller,
      created_at: announce.created_at,
      label,
      qty: qty ?? null,
    });
  };

  // Specific card matches read better, so they win over a whole-post match.
  const lfById = new Map((lfParents.data ?? []).map((p) => [p.id, p]));
  for (const row of wantRows.data ?? []) pushWant(lfById.get(row.announce), row.card_name, row.qty);
  for (const a of [...(lfByArchetype.data ?? []), ...(lfByTitle.data ?? [])]) {
    pushWant(a, a.archetype || a.title, null);
  }

  wants.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  wants.length = Math.min(wants.length, limit);

  const names = await fetchTraderNames(supabase, [
    ...sells.map((s) => s.seller),
    ...wants.map((w) => w.seller),
  ]);

  const withName = (row) => ({ ...row, traderName: names.get(row.seller) ?? 'Unknown trader' });
  return { query, sells: sells.map(withName), wants: wants.map(withName) };
}

module.exports = { searchListings, normalizeQuery };
