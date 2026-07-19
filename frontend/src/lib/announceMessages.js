// Announce chat helpers — lightweight buyer ↔ seller messaging on a listing.
// Backed by the announce_message table (see 20260707_announce_chat.sql).
//
// A "thread" is all messages on one announce between the seller and one other
// user. A buyer has exactly one thread (with the seller); a seller may have many
// (one per interested buyer).

import { getClient } from "@/lib/supabaseClient";

/** Current user's id from the cached session, or null. */
async function myId() {
  return (await getClient().auth.getSession()).data?.session?.user?.id ?? null;
}

/**
 * Fetch one thread: all messages on `announceId` between the current user and
 * `otherUserId`, oldest-first.
 * @param {number} announceId
 * @param {string} otherUserId
 * @returns {Promise<Array<{id, created_at, sender, recipient, content}>>}
 */
export async function fetchAnnounceThread(announceId, otherUserId) {
  const me = await myId();
  if (!me || !otherUserId) return [];

  const { data, error } = await getClient()
    .from("announce_message")
    .select("id, created_at, sender, recipient, content")
    .eq("announce", announceId)
    .or(
      `and(sender.eq.${me},recipient.eq.${otherUserId}),` +
      `and(sender.eq.${otherUserId},recipient.eq.${me})`
    )
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }
  return data ?? [];
}

/**
 * Send a message on an announce.
 * @param {number} announceId
 * @param {string} recipientId  the other participant (seller, or a buyer if you are the seller)
 * @param {string} content
 */
export async function sendAnnounceMessage(announceId, recipientId, content) {
  const me = await myId();
  if (!me) throw new Error("Not authenticated");

  const { error } = await getClient()
    .from("announce_message")
    .insert({ announce: announceId, sender: me, recipient: recipientId, content: content.trim() });

  if (error) {
    throw error;
  }
}

/**
 * Seller view: list every conversation on `announceId`, one per buyer, newest
 * activity first. RLS already restricts rows to those the current user is part of.
 * @param {number} announceId
 * @returns {Promise<Array<{userId, name, avatarUrl, lastContent, lastTime, count}>>}
 */
export async function fetchAnnounceThreads(announceId) {
  const me = await myId();
  if (!me) return [];

  const { data, error } = await getClient()
    .from("announce_message")
    .select("id, created_at, sender, recipient, content")
    .eq("announce", announceId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  // Group by the other participant.
  const byUser = new Map();
  for (const m of data ?? []) {
    const other = m.sender === me ? m.recipient : m.sender;
    const t = byUser.get(other) ?? { userId: other, count: 0, lastContent: "", lastTime: null };
    t.count += 1;
    t.lastContent = m.content;   // ascending order → last write wins
    t.lastTime = m.created_at;
    byUser.set(other, t);
  }

  const threads = [...byUser.values()];
  if (threads.length === 0) return [];

  // Attach display names/avatars for the buyers.
  const ids = threads.map(t => t.userId);
  const { data: traders } = await getClient()
    .from("Trader")
    .select("id, Name, avatar_url")
    .in("id", ids);
  const byId = Object.fromEntries((traders ?? []).map(tr => [tr.id, tr]));

  return threads
    .map(t => ({
      ...t,
      name:      byId[t.userId]?.Name ?? null,
      avatarUrl: byId[t.userId]?.avatar_url ?? null,
    }))
    .sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));
}
