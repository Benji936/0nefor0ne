// Match-finding helpers built on top of the find_matches Postgres function.
//
// The RPC returns one row per matching trader, with they_have / they_want
// already aggregated as JSON. We just bucket and sort here.
//
// Proposal management (create, accept, decline, …) lives in proposals.js.

import { getClient } from "@/lib/supabaseClient";

/** Shared row-to-MatchedUser mapper used by both RPCs. */
function mapMatchRow(row) {
  const theyHaveCount = Number(row.they_have_count ?? 0);
  const theyWantCount = Number(row.they_want_count ?? 0);
  const kind =
    theyHaveCount > 0 && theyWantCount > 0
      ? "mutual"
      : theyHaveCount > 0
      ? "they_have"
      : "they_want";
  return {
    id:            row.match_user_id,
    name:          row.match_user_name,
    city:          row.match_user_city,
    country:       row.match_user_country,
    avatarUrl:     row.match_avatar_url ?? null,
    avgRating:     row.avg_rating ?? null,
    theyHaveCount,
    theyWantCount,
    theyHave:      row.they_have ?? [],
    theyWant:      row.they_want ?? [],
    kind,
  };
}

/** Returns the current user's ID from the local session cache (no network). */
async function currentUserId() {
  return (await getClient().auth.getSession()).data?.session?.user?.id ?? null;
}

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

// ── Match finding ──────────────────────────────────────────────────────────

/**
 * Fetch all match groups for the currently authenticated user.
 * Returns MatchedUser[] sorted: mutual first, then by total overlap desc.
 */
export async function fetchMatches() {
  const { data, error } = await getClient().rpc("find_matches");
  if (error) {
    console.error("find_matches RPC failed", error);
    throw error;
  }

  const users = (data ?? []).map(mapMatchRow);
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
 * Fetch ALL traders who have a specific card in their trade pile.
 * Not limited to current user's matches — returns every trader with that card.
 *
 * @param {string} cardName
 * @returns {Promise<MatchedUser[]>}
 */
export async function fetchTradersWithCard(cardName) {
  const { data, error } = await getClient().rpc("find_traders_with_card", { p_card_name: cardName });
  if (error) {
    console.error("find_traders_with_card RPC failed", error);
    throw error;
  }

  const users = (data ?? []).map(mapMatchRow);
  const order = { mutual: 0, they_have: 1, they_want: 2 };
  users.sort((a, b) => {
    if (order[a.kind] !== order[b.kind]) return order[a.kind] - order[b.kind];
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

/** Bucket a MatchedUser[] into the three display sections. */
export function bucketMatches(users) {
  return {
    mutual:   users.filter((u) => u.kind === "mutual"),
    theyHave: users.filter((u) => u.kind === "they_have"),
    theyWant: users.filter((u) => u.kind === "they_want"),
  };
}

// ── Current-user library ───────────────────────────────────────────────────

/**
 * Fetch the current user's available trade pile.
 * Cards are tagged with theyWantThis (name in counterparty wishlist passed as theyWant).
 * Sort: trade pile first → they-want-this first → alpha.
 */
export async function fetchMyLibrary(theyWant = []) {
  const me = await currentUserId();
  if (!me) return [];

  const { data, error } = await getClient()
    .from("Card")
    .select("id, name, image_id, extension, condition, language, quantity, first_edition, rarity, status, wish")
    .eq("trader", me)
    .eq("wish", false)
    .neq("status", "traded")
    .neq("status", "locked")
    .order("name", { ascending: true });

  if (error) {
    console.error("fetchMyLibrary failed", error);
    return [];
  }

  const wantedNames = new Set((theyWant ?? []).map((c) => c.name).filter(Boolean));
  const rows = (data ?? []).map((c) => ({
    ...c,
    theyWantThis: wantedNames.has(c.name),
    isWishlist:   c.wish === true,
  }));

  rows.sort((a, b) => {
    if (a.isWishlist !== b.isWishlist) return a.isWishlist ? 1 : -1;
    if (a.theyWantThis !== b.theyWantThis) return a.theyWantThis ? -1 : 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
  return rows;
}

/**
 * Fetch the card names on the current user's wishlist.
 * Used to tag the counterparty's trade pile in edit/counter mode.
 */
export async function fetchMyWishlistNames() {
  const me = await currentUserId();
  if (!me) return [];
  const { data } = await getClient()
    .from("Card")
    .select("name")
    .eq("trader", me)
    .eq("wish", true);
  return (data ?? []).map(c => c.name).filter(Boolean);
}

// ── Other-user library ─────────────────────────────────────────────────────

/**
 * Fetch the full trade pile of any user.
 * Cards matching myWishNames are tagged matchesMyWishlist: true and sorted first.
 *
 * @param {string}   userId
 * @param {string[]} myWishNames
 */
export async function fetchUserTradePile(userId, myWishNames = []) {
  const { data, error } = await getClient()
    .from("Card")
    .select("id, name, image_id, extension, condition, language, quantity, first_edition, rarity, status")
    .eq("trader", userId)
    .eq("wish", false)
    .neq("status", "traded")
    .neq("status", "locked")
    .order("name", { ascending: true });

  if (error) {
    console.error("fetchUserTradePile failed", error);
    return [];
  }

  const wishSet = new Set(myWishNames.filter(Boolean));
  const rows = (data ?? []).map((c) => ({
    ...c,
    matchesMyWishlist: wishSet.has(c.name),
  }));

  rows.sort((a, b) => {
    if (a.matchesMyWishlist !== b.matchesMyWishlist) return a.matchesMyWishlist ? -1 : 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
  return rows;
}

// ── Trending cards ─────────────────────────────────────────────────────────

/**
 * Fetch the cards appearing most often in recent trade proposals (last 30 days).
 * @param {number} limit
 * @returns {Promise<Array<{image_id: number, name: string, extension: string, trade_count: number}>>}
 */
export async function fetchTrendingCards(limit = 8) {
  const { data, error } = await getClient().rpc("get_trending_cards", { p_limit: limit });
  if (error) {
    console.error("get_trending_cards RPC failed", error);
    return [];
  }
  return data ?? [];
}

/** Fetch the full wishlist of any user. */
export async function fetchUserWishlist(userId) {
  const { data, error } = await getClient()
    .from("Card")
    .select("id, name, image_id, extension, rarity, condition, language, quantity")
    .eq("trader", userId)
    .eq("wish", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("fetchUserWishlist failed", error);
    return [];
  }
  return data ?? [];
}
