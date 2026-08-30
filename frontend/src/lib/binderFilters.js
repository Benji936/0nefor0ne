// Narrowing a binder down to the cards you are looking for.
//
// Split out of CardBinder.vue because the controls no longer sit inside the
// binder: the proposal dialog puts them in its side rail while the trader
// profile keeps them above the pages. Two placements, one behaviour -- so the
// behaviour lives here rather than in either of them.

/** Rarity is stored with inconsistent casing ("common" next to "Ultra Rare"),
 *  so everything groups on a lowercased key. */
export const rarityKey = (card) => String(card?.rarity ?? "").trim().toLowerCase();

/** The empty filter. Anything falsy passed as a filter set means this. */
export const NO_FILTERS = Object.freeze({ query: "", rarity: "", wantedOnly: false });

/** Whether anything in the pile is on the viewer's wishlist.
 *
 *  Gates the "only what I want" toggle: a control that can only ever return
 *  nothing is worse than no control. */
export function hasWishlistMatches(cards) {
  return Array.isArray(cards) && cards.some((c) => c?.matchesMyWishlist);
}

/** The rarities actually present, as `{ value, label }`, sorted by label.
 *
 *  Capitalised per word rather than title-cased, because a full title-case
 *  turns "Collector's Rare" into "Collector'S Rare".
 *
 *  Rarity and not `extension`: an extension is a print code (MZMU-EN001) that
 *  identifies one printing of one card, so filtering by it returns a single
 *  card, and it is blank on most rows -- which made the control disappear on
 *  exactly the biggest collections. Rarity is present on every card. */
export function rarityOptions(cards) {
  if (!Array.isArray(cards)) return [];
  const byKey = new Map();
  for (const card of cards) {
    const key = rarityKey(card);
    if (!key || byKey.has(key)) continue;
    byKey.set(
      key,
      key.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" "),
    );
  }
  return [...byKey]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The cards a filter set leaves standing.
 *
 *  Client-side on purpose: the whole pile already arrives in one query, so a
 *  round trip per keystroke would be slower and would break while offline. If
 *  piles ever outgrow that, the swap is to server-side search here and nowhere
 *  else. */
export function applyFilters(cards, filters) {
  if (!Array.isArray(cards)) return [];
  const { query = "", rarity = "", wantedOnly = false } = filters ?? NO_FILTERS;
  const q = String(query).trim().toLowerCase();

  return cards.filter((card) => {
    if (wantedOnly && !card?.matchesMyWishlist) return false;
    if (rarity && rarityKey(card) !== rarity) return false;
    if (q && !String(card?.name ?? "").toLowerCase().includes(q)) return false;
    return true;
  });
}

/** Whether a filter set is doing anything at all.
 *
 *  Used to decide between "this collection is empty" and "your search found
 *  nothing", which are different problems with different fixes. */
export function isFiltering(filters) {
  const { query = "", rarity = "", wantedOnly = false } = filters ?? NO_FILTERS;
  return Boolean(String(query).trim() || rarity || wantedOnly);
}
