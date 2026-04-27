// Match-finding helpers built on top of the find_matches Postgres function.
//
// The RPC returns one row per matching trader, with they_have / they_want
// already aggregated as JSON. We just bucket and sort here.

import { getClient } from "@/lib/supabaseClient";

/**
 * @typedef {Object} MatchedCard
 * @property {string} name
 * @property {number} image_id
 * @property {string|null} extension
 * @property {string|null} condition
 * @property {string|null} language
 * @property {number|null} quantity
 * @property {boolean|null} first_edition
 * @property {string|null} rarity
 */

/**
 * @typedef {Object} MatchedUser
 * @property {string} id
 * @property {string|null} name
 * @property {string|null} city
 * @property {string|null} country
 * @property {number} theyHaveCount  cards I want that they have
 * @property {number} theyWantCount  cards I have that they want
 * @property {MatchedCard[]} theyHave
 * @property {MatchedCard[]} theyWant
 * @property {'mutual'|'they_have'|'they_want'} kind
 */

/**
 * Fetch all match groups for the currently authenticated user.
 * Returns an array of MatchedUser sorted with mutual first, then by total
 * overlap descending.
 */
export async function fetchMatches() {
  const { data, error } = await getClient().rpc("find_matches");
  if (error) {
    console.error("find_matches RPC failed", error);
    throw error;
  }

  /** @type {MatchedUser[]} */
  const users = (data ?? []).map((row) => {
    const theyHaveCount = Number(row.they_have_count ?? 0);
    const theyWantCount = Number(row.they_want_count ?? 0);
    const kind =
      theyHaveCount > 0 && theyWantCount > 0
        ? "mutual"
        : theyHaveCount > 0
        ? "they_have"
        : "they_want";
    return {
      id: row.match_user_id,
      name: row.match_user_name,
      city: row.match_user_city,
      country: row.match_user_country,
      theyHaveCount,
      theyWantCount,
      theyHave: row.they_have ?? [],
      theyWant: row.they_want ?? [],
      kind,
    };
  });

  // Mutual first, then total overlap, then name as tiebreaker.
  const order = { mutual: 0, they_have: 1, they_want: 2 };
  users.sort((a, b) => {
    if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
    const totalA = a.theyHaveCount + a.theyWantCount;
    const totalB = b.theyHaveCount + b.theyWantCount;
    if (totalA !== totalB) return totalB - totalA;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  return users;
}

/**
 * Filter a match list to only entries that involve a given card name.
 * Used when arriving from the per-card "See traders" flow.
 */
export function filterByCardName(users, cardName) {
  if (!cardName) return users;
  return users
    .map((u) => {
      const theyHave = u.theyHave.filter((c) => c.name === cardName);
      const theyWant = u.theyWant.filter((c) => c.name === cardName);
      return {
        ...u,
        theyHave,
        theyWant,
        theyHaveCount: theyHave.length > 0 ? 1 : 0,
        theyWantCount: theyWant.length > 0 ? 1 : 0,
        kind:
          theyHave.length > 0 && theyWant.length > 0
            ? "mutual"
            : theyHave.length > 0
            ? "they_have"
            : "they_want",
      };
    })
    .filter((u) => u.theyHave.length > 0 || u.theyWant.length > 0);
}

/**
 * Bucket a list of matched users into the three sections the UI renders.
 */
export function bucketMatches(users) {
  return {
    mutual: users.filter((u) => u.kind === "mutual"),
    theyHave: users.filter((u) => u.kind === "they_have"),
    theyWant: users.filter((u) => u.kind === "they_want"),
  };
}

/**
 * For the "You give" side of the trade dialog: fetch all of MY cards in
 * the trade pile (wish=false) so the user can offer anything, not just
 * cards matching the counterparty's wishlist.
 *
 * If `theyWant` is provided we tag matched rows with `theyWantThis: true`
 * so the UI can highlight them, and sort matches first.
 */
export async function fetchMyTradePile(theyWant = []) {
  const me = (await getClient().auth.getUser()).data?.user?.id;
  if (!me) return [];

  const { data, error } = await getClient()
    .from("Card")
    .select("id, name, image_id, extension, condition, language, quantity, first_edition, rarity")
    .eq("trader", me)
    .eq("wish", false)
    .order("name", { ascending: true });

  if (error) {
    console.error("fetchMyTradePile failed", error);
    return [];
  }

  const wantedNames = new Set((theyWant ?? []).map((c) => c.name).filter(Boolean));
  const rows = (data ?? []).map((c) => ({
    ...c,
    theyWantThis: wantedNames.has(c.name),
  }));
  // Matched first, then alpha. Stable sort by relying on the prior order.
  rows.sort((a, b) => {
    if (a.theyWantThis !== b.theyWantThis) return a.theyWantThis ? -1 : 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
  return rows;
}

/**
 * Send a trade proposal. Wraps the create_trade_proposal RPC.
 *
 * @param {string} counterpartyId
 * @param {Array<{card_id: number, quantity: number}>} give
 * @param {Array<{card_id: number, quantity: number}>} receive
 * @returns {Promise<number>} the new Trade.id
 */
export async function createTradeProposal(counterpartyId, give, receive) {
  const { data, error } = await getClient().rpc("create_trade_proposal", {
    counterparty: counterpartyId,
    give,
    receive,
  });
  if (error) {
    console.error("create_trade_proposal failed", error);
    throw error;
  }
  return data;
}
