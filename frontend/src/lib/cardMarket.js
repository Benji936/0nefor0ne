// One card, two sides of a market.
//
// The card page could only ever draw half of this, and only for people who
// were already signed in. `find_traders_with_card` raises `must be
// authenticated` when auth.uid() is null, so every visitor arriving from a
// search engine — which is who this page is built for — got an empty section
// and no sign that anything had been withheld. And the half it did draw was
// the only half it could: the RPC selects `wish = false` rows, so
// they_have_count is 1 or more for every row it returns, `kind` is never
// "they_want", and the page's "traders looking for this card" block has never
// rendered a single trader.
//
// The counts below are the fact the page is actually for: how many people here
// hold this card, and how many are hunting it. `Card` carries a SELECT policy
// of `true`, so this needs no new server surface — the identities still come
// from the authenticated RPC, and a signed-out visitor is told the shape of the
// market rather than shown an empty box.
import { getClient } from "@/lib/supabaseClient";

/** Nobody on either side — the state of most cards, and an invitation. */
export const NONE = "none";
/** Somebody here holds it, nobody is hunting it. */
export const HELD = "held";
/** Somebody is hunting it, nobody here holds it. */
export const WANTED = "wanted";
/** Both sides are live: this card is a trade waiting for two names. */
export const BOTH = "both";

// The statuses that take a card out of circulation. Spelled the way
// find_matches spells them, including the COALESCE — `status <> 'traded'` is
// NULL for a NULL status, which silently drops the row instead of keeping it.
const RETIRED = new Set(["traded", "locked"]);
const statusOf = (row) => row?.status ?? "available";

export function marketKind(holders = 0, wanters = 0) {
  if (holders > 0 && wanters > 0) return BOTH;
  if (holders > 0) return HELD;
  if (wanters > 0) return WANTED;
  return NONE;
}

/**
 * Bucket raw Card rows into the two sides.
 *
 * Counts distinct traders, not rows: somebody with three copies of a card is
 * one person to trade with, and a page that says "3 have it" over one name is
 * wrong in the direction that wastes a visitor's time.
 *
 * The viewer is left out of their own market. The question the number answers
 * is "who could I trade with", and you cannot trade with yourself.
 */
export function countMarket(rows, viewerId = null) {
  const holders = new Set();
  const wanters = new Set();
  for (const row of rows ?? []) {
    const trader = row?.trader;
    if (!trader || trader === viewerId) continue;
    if (RETIRED.has(statusOf(row))) continue;
    (row.wish ? wanters : holders).add(trader);
  }
  return {
    holders: holders.size,
    wanters: wanters.size,
    kind: marketKind(holders.size, wanters.size),
  };
}

/**
 * The market for one card, by exact name.
 *
 * Name is the join key everywhere else in this app — find_matches, the trader
 * page's table, find_traders_with_card — so it is the join key here too, or the
 * card page would disagree with the pages it sends people to.
 *
 * Returns null when the query fails, which is not the same fact as an empty
 * market: "nobody here has this" is a claim, and a failed request cannot make it.
 */
export async function fetchCardMarket(cardName, viewerId = null) {
  if (!cardName) return { holders: 0, wanters: 0, kind: NONE };
  const { data, error } = await getClient()
    .from("Card")
    .select("trader, wish, status")
    .eq("name", cardName);
  if (error) {
    console.error("fetchCardMarket failed", error);
    return null;
  }
  return countMarket(data, viewerId);
}
