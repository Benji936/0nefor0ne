/**
 * Trade proposal management — create, update, accept, decline, cancel, complete.
 * Photo uploads and trade chat live here too.
 *
 * Match-finding helpers (fetchMatches, fetchTradersWithCard, etc.) are in matches.js.
 */

import { getClient } from "@/lib/supabaseClient";

// ── Proposals ──────────────────────────────────────────────────────────────

/**
 * Send a trade proposal. Wraps the create_trade_proposal RPC.
 *
 * @param {string} counterpartyId
 * @param {Array<{card_id: number, quantity: number}>} give
 * @param {Array<{card_id: number, quantity: number}>} receive
 * @param {{ trade_method?, cash_amount?, cash_payer?, notes?, meetup_location? }} settlement
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
    p_meetup_location: settlement.meetup_location ?? null,
  });
  if (error) {
    throw error;
  }
  return data;
}

/**
 * Fetch all proposals for the current user (sent and received).
 * Returns an array sorted by created_at desc.
 */
export async function fetchMyProposals() {
  const { data, error } = await getClient().rpc("fetch_my_proposals");
  if (error) {
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
 * @param {{ trade_method?, cash_amount?, cash_payer?, notes?, meetup_location? }} settlement
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
    p_meetup_location: settlement.meetup_location ?? null,
  });
  if (error) {
    throw error;
  }
}

/**
 * Accept an incoming pending proposal (counterparty only).
 * Uses the accept_trade RPC which enforces server-side that the caller
 * is the counterparty and the trade is still pending.
 *
 * @param {number} tradeId
 */
export async function acceptTradeProposal(tradeId) {
  const { error } = await getClient().rpc("accept_trade", { p_trade_id: tradeId });
  if (error) {
    throw error;
  }
}

/**
 * Cancel a trade (pending or accepted).
 */
export async function cancelTradeProposal(tradeId) {
  const { error } = await getClient().rpc("cancel_trade", { p_trade_id: tradeId });
  if (error) {
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
    throw error;
  }
}

/**
 * Counter an incoming pending proposal.
 *
 * @param {number} originalTradeId
 * @param {Array<{card_id: number, quantity: number}>} give
 * @param {Array<{card_id: number, quantity: number}>} receive
 * @param {{ trade_method?, cash_amount?, cash_payer?, meetup_location? }} settlement
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
    p_meetup_location: settlement.meetup_location ?? null,
  });
  if (error) {
    throw error;
  }
  return data;
}

/**
 * Confirm your side of an accepted trade.
 * Returns { status: 'confirmed' } when only one side has confirmed,
 * or { status: 'completed' } when both sides have confirmed.
 *
 * @param {number} tradeId
 * @returns {Promise<{ status: 'confirmed' | 'completed' }>}
 */
export async function completeTradeProposal(tradeId) {
  const { data, error } = await getClient().rpc("complete_trade", { p_trade_id: tradeId });
  if (error) {
    throw error;
  }
  return data ?? { status: "confirmed" };
}

// ── Photos ─────────────────────────────────────────────────────────────────

/**
 * Fetch all verification photos for a trade, sorted oldest-first.
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
    throw error;
  }
  return data ?? [];
}

/**
 * Upload a verification photo for a trade.
 *
 * @param {number} tradeId
 * @param {string} uploaderId — auth.uid()
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
 *
 * @param {number} photoId
 */
export async function deleteTradePhoto(photoId) {
  const { error } = await getClient()
    .from("trade_photo")
    .delete()
    .eq("id", photoId);
  if (error) {
    throw error;
  }
}

// ── Messages ───────────────────────────────────────────────────────────────

/**
 * Fetch all messages for a trade, sorted oldest-first.
 *
 * @param {number} tradeId
 */
export async function fetchTradeMessages(tradeId) {
  const { data, error } = await getClient()
    .from("trade_message")
    .select("id, created_at, sender, content")
    .eq("trade", tradeId)
    .order("created_at", { ascending: true });
  if (error) {
    throw error;
  }
  return data ?? [];
}

// ── Activity log ───────────────────────────────────────────────────────────

/**
 * Fetch the full audit log for a trade, oldest-first.
 * Uses the fetch_trade_events RPC which enforces participant-only access.
 *
 * @param {number} tradeId
 * @returns {Promise<Array<{id, event_type, actor_id, from_status, to_status, notes, created_at}>>}
 */
export async function fetchTradeEvents(tradeId) {
  const { data, error } = await getClient().rpc("fetch_trade_events", {
    p_trade_id: tradeId,
  });
  if (error) {
    return [];
  }
  return data ?? [];
}

// ── Messages ───────────────────────────────────────────────────────────────

/**
 * Send a message in a trade conversation.
 *
 * @param {number} tradeId
 * @param {string} content
 */
export async function sendTradeMessage(tradeId, content) {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id ?? null;
  if (!me) throw new Error("Not authenticated");

  const { error } = await getClient()
    .from("trade_message")
    .insert({ trade: tradeId, sender: me, content: content.trim() });
  if (error) {
    throw error;
  }
}
