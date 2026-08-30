/**
 * Decks: where they live, and how the card states get resolved.
 *
 * Both deck pages were carrying their own copy of all of this — the guest
 * localStorage shape, the "load my decks" query, the ownership lookup, and a
 * forty-line block that parsed a .ydk, fetched its cards and diffed them
 * against the collection. The two copies had already drifted (the list page
 * recomputed a sourced count the detail page did not), which is the usual way
 * two numbers for the same thing end up disagreeing on screen.
 *
 * A deck is stored per account in Supabase, or in this browser for a guest who
 * has not signed in. Both shapes normalize to { id, name, ydk_content,
 * created_at } so nothing above this file has to care which it is.
 */
import { getClient } from "@/lib/supabaseClient";
import { parseYdk } from "@/lib/ydk";
import { getCardsByIds } from "@/api";
import { loadMarks, marksFromRecord } from "@/lib/deckIgnore";

export const GUEST_KEY = "tm_guest_decks";

const normalize = (row) => ({
  id: row.id,
  name: row.name,
  ydk_content: row.ydk_content,
  created_at: row.created_at,
});

// ── Guest storage ───────────────────────────────────────────────────────────
export function readGuestDecks() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function writeGuestDecks(list) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("decks: writeGuestDecks failed", err);
  }
}

export function clearGuestDecks() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(GUEST_KEY); } catch { /* nothing to clear */ }
}

const fromGuest = (d) => ({
  id: d.localId, name: d.name, ydk_content: d.ydkContent, created_at: d.importedAt,
});

// ── Reads ───────────────────────────────────────────────────────────────────

/**
 * Every deck the viewer has, newest first, with what they have marked as coming
 * from elsewhere.
 *
 * Returns { decks, marksByDeck } rather than just the rows, because the marks
 * live in a different place for each kind of viewer — a column on the row for
 * an account, a localStorage key per deck for a guest — and every caller needs
 * both.
 *
 * The marks come back as the raw stored array, undecoded. Reading them needs
 * the deck's quantities, and the deck has not been parsed yet at this point —
 * `resolveDecks` is where both are in hand.
 */
export async function fetchDecks(userId) {
  if (!userId) {
    const decks = readGuestDecks().map(fromGuest);
    const marksByDeck = {};
    for (const deck of decks) marksByDeck[deck.id] = loadMarks(deck.id);
    return { decks, marksByDeck };
  }

  const { data, error } = await getClient()
    .from("decks").select("*").eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) { console.error("decks: fetchDecks failed", error); throw error; }

  const rows = data ?? [];
  const marksByDeck = {};
  for (const row of rows) marksByDeck[row.id] = marksFromRecord(row);
  return { decks: rows.map(normalize), marksByDeck };
}

/** One deck by id, or null. Same normalized shape as fetchDecks. */
export async function fetchDeck(deckId, userId) {
  if (!userId) {
    const found = readGuestDecks().find((d) => d.localId === deckId);
    return found
      ? { deck: fromGuest(found), marks: loadMarks(deckId) }
      : { deck: null, marks: [] };
  }
  const { data, error } = await getClient()
    .from("decks").select("*").eq("id", deckId).eq("user_id", userId).maybeSingle();
  if (error) console.error("decks: fetchDeck failed", error);
  return data
    ? { deck: normalize(data), marks: marksFromRecord(data) }
    : { deck: null, marks: [] };
}

/**
 * How many copies of each card the viewer's trade pile holds, as a Map of
 * image_id -> count.
 *
 * Copies, not ids. This used to return a Set, which meant a collection holding
 * one Ash Blossom answered "yes" to a deck asking for three, and the deck read
 * as complete. The count is summed across rows because one card can be in the
 * pile several times over — a Secret Rare, a Common, a French one — and they
 * are all copies of it for the purpose of building a deck.
 *
 * Wishlist rows are excluded — a card you want is precisely a card you do not
 * have — and so are traded and locked ones, which are spoken for. A guest owns
 * nothing on file, so their decks read as entirely missing, which is true and
 * is what the sign-in line on the page is for.
 */
export async function fetchOwnedCopies(userId) {
  if (!userId) return new Map();
  const { data, error } = await getClient()
    .from("Card").select("image_id, quantity")
    .eq("trader", userId).eq("wish", false)
    .not("status", "in", '("traded","locked")');
  if (error) { console.error("decks: fetchOwnedCopies failed", error); return new Map(); }
  return countCopies(data);
}

/**
 * Sum `quantity` per image_id over Card rows.
 *
 * A row with no readable quantity still counts as one copy: the row exists, so
 * the card does. Fractions are floored — `quantity` is numeric in Postgres
 * because completing a trade subtracts from it — and a row that has been
 * decremented to zero contributes nothing.
 */
export function countCopies(rows) {
  const out = new Map();
  for (const row of rows ?? []) {
    if (row?.image_id == null) continue;
    const id = Number(row.image_id);
    // An absent quantity is one copy, not zero: the row exists, so the card
    // does. Number(null) is 0, which is why this tests the value before
    // converting it rather than leaning on Number.isFinite alone.
    const blank = row.quantity == null || row.quantity === "";
    const raw = Number(row.quantity);
    const n = blank || !Number.isFinite(raw) ? 1 : Math.max(0, Math.floor(raw));
    out.set(id, (out.get(id) ?? 0) + n);
  }
  return out;
}

/**
 * Parse a set of decks and resolve every card in them in one pass.
 *
 * One card lookup for all of them and one ownership query, rather than a fetch
 * per deck as each accordion panel opened. That is what lets the list page show
 * every deck's completion on load — the old page had the counts and the bar
 * behind `v-if="deckStats[deck.id]"`, which nothing filled until you expanded
 * the panel, so the rows showed a name and an empty line, and the "sort by
 * missing" control above them sorted by a number that was not there yet.
 */
export async function resolveDecks(decks, userId) {
  const parsed = new Map();
  const ids = new Set();
  for (const deck of decks) {
    const p = parseYdk(deck.ydk_content);
    parsed.set(deck.id, p);
    for (const section of ["main", "extra", "side"]) {
      for (const entry of p[section]) ids.add(entry.id);
    }
  }
  const [cardMap, ownedCopies] = await Promise.all([
    ids.size ? getCardsByIds([...ids]) : Promise.resolve({}),
    fetchOwnedCopies(userId),
  ]);
  return { parsed, cardMap, ownedCopies };
}

// ── Writes ──────────────────────────────────────────────────────────────────
export async function createDeck({ userId, name, ydkContent }) {
  if (userId) {
    const { data, error } = await getClient()
      .from("decks").insert({ user_id: userId, name, ydk_content: ydkContent })
      .select().single();
    if (error) throw error;
    return normalize(data);
  }
  const localId = Date.now().toString();
  const importedAt = new Date().toISOString();
  const list = readGuestDecks();
  list.unshift({ localId, name, ydkContent, importedAt });
  writeGuestDecks(list);
  return { id: localId, name, ydk_content: ydkContent, created_at: importedAt };
}

export async function renameDeck(id, name, userId) {
  if (userId) {
    const { error } = await getClient()
      .from("decks").update({ name }).eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const list = readGuestDecks();
  const item = list.find((d) => d.localId === id);
  if (item) { item.name = name; writeGuestDecks(list); }
}

export async function deleteDeck(id, userId) {
  if (userId) {
    const { error } = await getClient()
      .from("decks").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    return;
  }
  writeGuestDecks(readGuestDecks().filter((d) => d.localId !== id));
}
