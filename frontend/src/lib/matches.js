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
      avatarUrl: row.match_avatar_url ?? null,
      avgRating: row.avg_rating ?? null,
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
 * Fetch ALL traders who have a specific card in their trade pile.
 * Unlike fetchMatches(), this is not limited to the current user's matches —
 * it returns every trader with that card available, plus detects "they want"
 * overlap with the current user's trade pile.
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

  const users = (data ?? []).map((row) => {
    const theyHaveCount = Number(row.they_have_count ?? 0);
    const theyWantCount = Number(row.they_want_count ?? 0);
    const kind =
      theyHaveCount > 0 && theyWantCount > 0 ? "mutual"
      : theyWantCount > 0 ? "they_want"
      : "they_have";
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
  });

  // Mutual first (they have the card AND want something back), then by name
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
 * Fetch ALL non-traded cards from the current user's library (trade pile + wishlist).
 * Tagged with:
 *   theyWantThis — card name appears in the counterparty's wishlist (passed as theyWant)
 *   isWishlist   — card is marked wish=true (user wants it / hasn't listed it for trade)
 *
 * Sort order: trade pile first → "they want this" first within each group → alpha.
 */
export async function fetchMyLibrary(theyWant = []) {
  const me = (await getClient().auth.getUser()).data?.user?.id;
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
    // Trade pile before wishlist
    if (a.isWishlist !== b.isWishlist) return a.isWishlist ? 1 : -1;
    // Counterparty-wanted first within each group
    if (a.theyWantThis !== b.theyWantThis) return a.theyWantThis ? -1 : 1;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
  return rows;
}

/**
 * Fetch the full trade pile of any user by their ID.
 * Used in the trade dialog so the proposer can browse ALL available cards,
 * not just the ones that happen to match their wishlist.
 *
 * Cards whose name appears in `myWishNames` are tagged `matchesMyWishlist: true`
 * and sorted to the top.
 *
 * @param {string} userId
 * @param {string[]} myWishNames  — card names from the current user's wishlist
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

/**
 * Fetch the full wishlist of any user by their ID.
 * Used in the trade dialog to show ALL cards they want, not just the intersection.
 */
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

/**
 * Send a trade proposal. Wraps the create_trade_proposal RPC.
 *
 * @param {string} counterpartyId
 * @param {Array<{card_id: number, quantity: number}>} give
 * @param {Array<{card_id: number, quantity: number}>} receive
 * @returns {Promise<number>} the new Trade.id
 */
export async function createTradeProposal(counterpartyId, give, receive, settlement = {}) {
  const { data, error } = await getClient().rpc("create_trade_proposal", {
    counterparty:   counterpartyId,
    give,
    receive,
    p_trade_method: settlement.trade_method ?? null,
    p_cash_amount:  settlement.cash_amount  ?? null,
    p_cash_payer:   settlement.cash_payer   ?? null,
    p_notes:        settlement.notes        ?? null,
  });
  if (error) {
    console.error("create_trade_proposal failed", error);
    throw error;
  }
  return data;
}

/**
 * Fetch all proposals for the current user (sent and received).
 * Returns an array sorted by created_at desc, each row shaped as:
 *   { id, status, created_at, counterparty_id, counterparty_name,
 *     i_am_proposer, i_give: [...cards], i_receive: [...cards] }
 */
export async function fetchMyProposals() {
  const { data, error } = await getClient().rpc("fetch_my_proposals");
  if (error) {
    console.error("fetch_my_proposals failed", error);
    throw error;
  }
  return data ?? [];
}

/**
 * Update the cards and settlement details of a pending proposal (proposer only).
 *
 * @param {number} tradeId
 * @param {Array<{card_id: number, quantity: number}>} give
 * @param {Array<{card_id: number, quantity: number}>} receive
 * @param {{ trade_method?, cash_amount?, cash_payer?, notes? }} settlement
 */
export async function updateTradeProposal(tradeId, give, receive, settlement = {}) {
  const { error } = await getClient().rpc("update_trade_proposal", {
    p_trade_id:     tradeId,
    give,
    receive,
    p_trade_method: settlement.trade_method ?? null,
    p_cash_amount:  settlement.cash_amount  ?? null,
    p_cash_payer:   settlement.cash_payer   ?? null,
    p_notes:        settlement.notes        ?? null,
  });
  if (error) {
    console.error("update_trade_proposal failed", error);
    throw error;
  }
}

export async function updateProposalStatus(tradeId, status) {
  const { error } = await getClient()
    .from("Trade")
    .update({ status })
    .eq("id", tradeId);
  if (error) {
    console.error("updateProposalStatus failed", error);
    throw error;
  }
}

/**
 * Cancel a trade (pending or accepted). Records the canceller so only
 * the other party gets a notification.
 */
export async function cancelTradeProposal(tradeId) {
  const { error } = await getClient().rpc("cancel_trade", { p_trade_id: tradeId });
  if (error) {
    console.error("cancel_trade failed", error);
    throw error;
  }
}

/**
 * Decline an incoming pending proposal with an optional reason.
 *
 * @param {number} tradeId
 * @param {string|null} reason
 */
export async function declineTradeProposal(tradeId, reason = null) {
  const { error } = await getClient().rpc("decline_trade", {
    p_trade_id: tradeId,
    p_reason:   reason || null,
  });
  if (error) {
    console.error("decline_trade failed", error);
    throw error;
  }
}

/**
 * Fetch all verification photos for a trade.
 * Returns [{ id, created_at, uploader, url }] sorted oldest-first.
 *
 * @param {number} tradeId
 */
export async function fetchTradePhotos(tradeId) {
  const { data, error } = await getClient()
    .from("trade_photo")
    .select("id, created_at, uploader, url")
    .eq("trade", tradeId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchTradePhotos failed", error);
    throw error;
  }
  return data ?? [];
}

/**
 * Upload a verification photo for an accepted trade.
 * Stores the file in the trade-verifications bucket and records the URL.
 *
 * @param {number} tradeId
 * @param {string} uploaderId  — auth.uid()
 * @param {File}   file
 */
export async function uploadTradePhoto(tradeId, uploaderId, file) {
  const ext  = file.name.split(".").pop() ?? "jpg";
  const path = `${tradeId}/${uploaderId}/${Date.now()}.${ext}`;

  const { error: storageError } = await getClient()
    .storage.from("trade-verifications")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (storageError) throw storageError;

  const { data: urlData } = getClient()
    .storage.from("trade-verifications")
    .getPublicUrl(path);

  const { error: dbError } = await getClient()
    .from("trade_photo")
    .insert({ trade: tradeId, uploader: uploaderId, url: urlData.publicUrl });
  if (dbError) throw dbError;
}

/**
 * Delete a verification photo by its DB id.
 * The storage object is removed automatically via the bucket lifecycle,
 * or the user can clear it via the dashboard. DB record is deleted here.
 *
 * @param {number} photoId
 */
export async function deleteTradePhoto(photoId) {
  const { error } = await getClient()
    .from("trade_photo")
    .delete()
    .eq("id", photoId);
  if (error) {
    console.error("deleteTradePhoto failed", error);
    throw error;
  }
}

/**
 * Confirm (complete) an accepted trade.
 * Reduces card quantities; cards that reach 0 are marked 'traded'.
 * Sets Trade.status to 'completed'.
 *
 * @param {number} tradeId
 */
/**
 * Confirm your side of an accepted trade.
 * Returns { status: 'confirmed' } when only one side has confirmed,
 * or { status: 'completed' } when both sides have confirmed and the
 * trade was finalized.
 *
 * @param {number} tradeId
 * @returns {Promise<{ status: 'confirmed' | 'completed' }>}
 */
export async function completeTradeProposal(tradeId) {
  const { data, error } = await getClient().rpc("complete_trade", { p_trade_id: tradeId });
  if (error) {
    console.error("complete_trade failed", error);
    throw error;
  }
  return data ?? { status: 'confirmed' };
}

/**
 * Fetch all messages for a trade, sorted oldest-first.
 *
 * @param {number} tradeId
 * @returns {Promise<Array<{id: number, created_at: string, sender: string, content: string}>>}
 */
export async function fetchTradeMessages(tradeId) {
  const { data, error } = await getClient()
    .from("trade_message")
    .select("id, created_at, sender, content")
    .eq("trade", tradeId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchTradeMessages failed", error);
    throw error;
  }
  return data ?? [];
}

/**
 * Fetch the card names on the current user's wishlist.
 * Used to correctly tag the counterparty's trade pile in edit / counter mode.
 *
 * @returns {Promise<string[]>}
 */
export async function fetchMyWishlistNames() {
  const me = (await getClient().auth.getUser()).data?.user?.id;
  if (!me) return [];
  const { data } = await getClient()
    .from("Card")
    .select("name")
    .eq("trader", me)
    .eq("wish", true);
  return (data ?? []).map(c => c.name).filter(Boolean);
}

/**
 * Counter an incoming pending proposal.
 * Cancels + deletes the original trade, then creates a new one in the opposite direction.
 *
 * @param {number} originalTradeId
 * @param {Array<{card_id: number, quantity: number}>} give
 * @param {Array<{card_id: number, quantity: number}>} receive
 * @param {{ trade_method?, cash_amount?, cash_payer? }} settlement
 * @returns {Promise<number>} the new Trade.id
 */
export async function counterTradeProposal(originalTradeId, give, receive, settlement = {}) {
  const { data, error } = await getClient().rpc("counter_trade_proposal", {
    p_original_id:  originalTradeId,
    give,
    receive,
    p_trade_method: settlement.trade_method ?? null,
    p_cash_amount:  settlement.cash_amount  ?? null,
    p_cash_payer:   settlement.cash_payer   ?? null,
  });
  if (error) {
    console.error("counter_trade_proposal failed", error);
    throw error;
  }
  return data;
}

/**
 * Send a message in a trade conversation.
 *
 * @param {number} tradeId
 * @param {string} content
 */
export async function sendTradeMessage(tradeId, content) {
  const me = (await getClient().auth.getUser()).data?.user?.id;
  if (!me) throw new Error("Not authenticated");

  const { error } = await getClient()
    .from("trade_message")
    .insert({ trade: tradeId, sender: me, content: content.trim() });
  if (error) {
    console.error("sendTradeMessage failed", error);
    throw error;
  }
}
