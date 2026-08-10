/**
 * Named wishlists.
 *
 * A list is a label on cards you already wish for, never a redefinition of what
 * wishing means. `Card.wish` stays the single predicate the matcher reads, so a
 * card is matchable whichever list it sits on, and a card on no list at all is
 * still perfectly matchable — that is the state every existing want started in.
 *
 * Mirrors the constraints in supabase/migrations/20260810_named_wishlists.sql so
 * the UI can say what is wrong before a round trip, rather than surfacing a
 * Postgres error. The database is still the authority; this is a nicer first
 * line, not a replacement for it.
 */

import { getClient } from "@/lib/supabaseClient";

/** Mirrors the wishlist_name_len CHECK. */
export const MAX_NAME_LEN = 40;

/** The cards not filed anywhere. Not a row in the table — the absence of one. */
export const UNSORTED = null;

/** Compare names the way the unique index does: case- and space-insensitive,
 *  because "chase cards" and "Chase Cards" are one list to the person reading. */
export function nameKey(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Why `name` cannot be used, or null when it can.
 *
 * Returns a reason code rather than a sentence: the caller owns the copy, and
 * this file has no business knowing which language the user reads.
 *
 * @param {string} name
 * @param {Array<{id:number,name:string}>} existing  the owner's current lists
 * @param {number|null} ignoreId  the list being renamed, which may keep its name
 * @returns {"empty"|"too_long"|"duplicate"|null}
 */
export function nameProblem(name, existing = [], ignoreId = null) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return "empty";
  if (trimmed.length > MAX_NAME_LEN) return "too_long";
  const key = nameKey(trimmed);
  const clash = existing.some((l) => l.id !== ignoreId && nameKey(l.name) === key);
  return clash ? "duplicate" : null;
}

/**
 * Split cards across their lists, in the order the lists are shown.
 *
 * Every list appears even when empty — a list you just made and cannot see is
 * indistinguishable from one that failed to save. Unsorted comes last and only
 * when it has something in it, because "Unsorted (0)" is noise for somebody who
 * has filed everything.
 *
 * @param {Array<{id:number,name:string}>} lists
 * @param {Array<{wishlist:number|null}>} cards
 * @returns {Array<{id:number|null, name:string|null, cards:Array}>}
 */
export function groupByList(lists = [], cards = []) {
  const byId = new Map((lists ?? []).map((l) => [l.id, []]));
  const unsorted = [];

  for (const card of cards ?? []) {
    const bucket = byId.get(card?.wishlist ?? -1);
    if (bucket) bucket.push(card);
    else unsorted.push(card); // no list, or one that is no longer there
  }

  const groups = (lists ?? []).map((l) => ({ id: l.id, name: l.name, cards: byId.get(l.id) }));
  if (unsorted.length) groups.push({ id: UNSORTED, name: null, cards: unsorted });
  return groups;
}

/** The owner's lists, in their chosen order. [] on failure: a wishlist that
 *  cannot be grouped must still be a wishlist you can read. */
export async function fetchWishlists() {
  const { data, error } = await getClient()
    .from("wishlist")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) { console.error("fetchWishlists failed", error); return []; }
  return data ?? [];
}

/**
 * Make a list. Throws on refusal so the caller can show what went wrong —
 * unlike reads, a create that silently does nothing is a broken button.
 */
export async function createWishlist(name, { ownerId, sortOrder = 0 } = {}) {
  if (!ownerId) throw new Error("createWishlist needs an owner");
  const { data, error } = await getClient()
    .from("wishlist")
    .insert({ owner: ownerId, name: String(name).trim(), sort_order: sortOrder })
    .select("id, name, sort_order")
    .single();
  if (error) throw error;
  return data;
}

export async function renameWishlist(id, name) {
  const { error } = await getClient()
    .from("wishlist")
    .update({ name: String(name).trim() })
    .eq("id", id);
  if (error) throw error;
}

/** Delete the list, not what is on it. The cards come back as unsorted, which
 *  the database does on its own through ON DELETE SET NULL. */
export async function deleteWishlist(id) {
  const { error } = await getClient().from("wishlist").delete().eq("id", id);
  if (error) throw error;
}

/** Move a card onto a list, or off every list when `listId` is null. */
export async function moveCardToList(cardId, listId) {
  const { error } = await getClient()
    .from("Card")
    .update({ wishlist: listId })
    .eq("id", cardId);
  if (error) throw error;
}

/** Persist a reordering. One call per list, but there are only ever a handful. */
export async function reorderWishlists(orderedIds = []) {
  const client = getClient();
  await Promise.all(
    orderedIds.map((id, i) => client.from("wishlist").update({ sort_order: i }).eq("id", id))
  );
}
