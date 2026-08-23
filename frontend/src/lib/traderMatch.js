// The two sides of a trade with one person.
//
// A trader's page has always answered half the question. It showed the cards
// they hold that you are hunting, and said nothing at all about the cards you
// hold that they are hunting — even though their wishlist is fetched on the
// same load and rendered in a tab twelve pixels lower. In this database three
// of the six live matching relationships run in that unshown direction, so for
// half of them the page reports no overlap while the Trade Center reports one.
//
// This is the derivation both directions share, kept pure so it can be tested
// against the rules the `find_matches` Postgres function actually applies:
//
//   - matching is by exact card name, the same join find_matches makes;
//   - a side is counted in DISTINCT names, so a trader holding two copies of a
//     card you want is one card you want, not two. The page used to count rows
//     and therefore disagreed with the matches list wherever anybody held a
//     duplicate — which three (trader, card) pairs in this database do;
//   - traded and locked cards are out on both sides. Filtering them is the
//     caller's job, because it belongs in the query.
//
// Colour follows DESIGN.md: amethyst is the pile coming toward you, pink is the
// pile they want from you, and teal appears only when both are live — that is
// the mutual match, and it is the only thing teal ever marks (The Agreement
// Rule). UserCard maps the same three states the same way; this names them so
// the two surfaces cannot drift.

export const MUTUAL   = "mutual";
export const YOU_GET  = "you_get";
export const YOU_GIVE = "you_give";
export const NONE     = "none";

/**
 * The rows of `cards` whose name appears in `names`, one row per name.
 *
 * First row wins, which keeps the pile's own ordering (fetchUserTradePile sorts
 * by name) and gives each name a single image to draw.
 *
 * @param {Array<{name?: string}>} cards
 * @param {Iterable<string>} names
 * @returns {Array<Object>} at most one row per distinct name
 */
export function overlapByName(cards, names) {
  const want = names instanceof Set ? names : new Set(names ?? []);
  if (!want.size) return [];
  const seen = new Set();
  const out = [];
  for (const card of cards ?? []) {
    const name = card?.name;
    if (!name || seen.has(name) || !want.has(name)) continue;
    seen.add(name);
    out.push(card);
  }
  return out;
}

/**
 * What a trade with this person would look like, from the viewer's side.
 *
 * @param {Object}   args
 * @param {Array}    args.theirPile      their trade pile (already status-filtered)
 * @param {Array}    args.theirWishlist  their wishlist
 * @param {string[]} args.myWishNames    names on the viewer's wishlist
 * @param {string[]} args.myPileNames    names in the viewer's trade pile
 * @returns {{ youGet: Array, youGive: Array, kind: string }}
 */
export function tradeTable({
  theirPile = [],
  theirWishlist = [],
  myWishNames = [],
  myPileNames = [],
} = {}) {
  const youGet  = overlapByName(theirPile, myWishNames);
  const youGive = overlapByName(theirWishlist, myPileNames);
  return { youGet, youGive, kind: tableKind(youGet.length, youGive.length) };
}

/**
 * Which of the four states a table is in. Split out because the empty case has
 * to be namable: "no overlap" is an answer to the page's question, and drawing
 * nothing at all would leave the reader to guess whether it had been asked.
 */
export function tableKind(getCount = 0, giveCount = 0) {
  if (getCount > 0 && giveCount > 0) return MUTUAL;
  if (getCount > 0) return YOU_GET;
  if (giveCount > 0) return YOU_GIVE;
  return NONE;
}
