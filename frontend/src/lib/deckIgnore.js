/**
 * Which copies of a deck's cards are coming from somewhere else.
 *
 * The mark used to be a Set of card ids: a card was sourced or it was not. That
 * could not describe a deck asking for three of something when one of them is
 * already handled — the only choice was to mark the whole entry or none of it,
 * which is the thing this file now exists to fix. A mark is a count.
 *
 * Storage, in both places, is a flat array of ids with one entry per marked
 * copy: `[42, 42, 105]` is two copies of 42 and one of 105. The column is
 * `decks.ignored_card_ids int4[]` and the localStorage key is
 * `tm_deck_ignored_${deckId}`, both unchanged — the format fits the shape that
 * was already there.
 *
 * A leading 0 tags the counted format. Card passcodes are positive, so 0 is
 * free to use, and the tag is what lets an array be read correctly rather than
 * guessed at: without it, `[42, 105]` could mean one copy of each (new) or
 * every copy of each (old), and no amount of inspection separates the two.
 * An untagged array is therefore read the old way — every copy of that entry —
 * and rewritten in the counted form the next time it is touched.
 *
 * The degradation is safe in the other direction too. A client still running
 * the old code reads a tagged array through `new Set(...)`, gets the ids plus a
 * harmless 0, and shows those cards as sourced. It loses the count, not the
 * fact.
 *
 * Vue 3 does not track in-place Map mutation, so every function here returns a
 * new Map and callers must reassign rather than mutate.
 */

const KEY_PREFIX = 'tm_deck_ignored_';

/** Marks the array as holding one entry per copy rather than one per card. */
export const COUNTED_TAG = 0;

// ── Encoding ────────────────────────────────────────────────────────────────

/**
 * decodeSourced(stored, quantities)
 *
 * A stored array to a Map of id -> copies marked.
 *
 * `quantities` (id -> how many the deck asks for) is only consulted for an
 * untagged array, where a listed id meant the whole entry. An id the deck no
 * longer contains falls back to one copy, so a mark left behind by an edited
 * decklist neither vanishes nor claims a quantity nothing states.
 *
 * @param {number[]|null|undefined} stored
 * @param {Map<number, number>|null} [quantities]
 * @returns {Map<number, number>}
 */
export function decodeSourced(stored, quantities = null) {
  const list = Array.isArray(stored) ? stored.map(Number).filter(Number.isFinite) : [];
  const out = new Map();
  if (!list.length) return out;

  if (list[0] === COUNTED_TAG) {
    for (const id of list.slice(1)) {
      if (id === COUNTED_TAG) continue;
      out.set(id, (out.get(id) ?? 0) + 1);
    }
    return out;
  }

  // Untagged: each id stood for every copy of that entry.
  for (const id of list) {
    if (id === COUNTED_TAG) continue;
    out.set(id, Math.max(1, Number(quantities?.get?.(id)) || 1));
  }
  return out;
}

/**
 * encodeSourced(map) — a Map of id -> count back to the tagged flat array.
 *
 * Counts of zero drop out entirely, so clearing a card's mark leaves nothing
 * behind. An empty map encodes to an empty array rather than a lone tag, which
 * keeps "nothing marked" identical to what it has always been on disk.
 */
export function encodeSourced(map) {
  const out = [];
  for (const [id, n] of map ?? []) {
    const count = Math.max(0, Math.floor(Number(n) || 0));
    for (let i = 0; i < count; i++) out.push(Number(id));
  }
  return out.length ? [COUNTED_TAG, ...out] : [];
}

/**
 * withSourcedCount(map, cardId, count) — a new Map with one card's count set.
 *
 * Zero removes the key rather than storing a zero, so a map only ever holds
 * cards that are actually marked.
 */
export function withSourcedCount(map, cardId, count) {
  const next = new Map(map ?? []);
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n > 0) next.set(Number(cardId), n);
  else next.delete(Number(cardId));
  return next;
}

/**
 * nextSourcedCount(current, max)
 *
 * What the mark button does on the next click: one more copy, wrapping to none
 * once every outstanding copy is marked. Cycling rather than stepping, because
 * the control is a 28px corner button on an 84px tile and there is no room for
 * two — and because `max` is at most three, so nothing is ever more than three
 * clicks from where the reader wants it.
 */
export function nextSourcedCount(current, max) {
  const cap = Math.max(0, Math.floor(Number(max) || 0));
  if (cap <= 0) return 0;
  const now = Math.min(cap, Math.max(0, Math.floor(Number(current) || 0)));
  return now >= cap ? 0 : now + 1;
}

/**
 * quantitiesOf(entries) — id -> how many copies the deck asks for.
 *
 * Summed across sections, because the copies are: a card in the main deck twice
 * and the side deck once is a three-of as far as a mark is concerned.
 */
export function quantitiesOf(entries) {
  const out = new Map();
  for (const entry of entries ?? []) {
    if (entry?.id == null) continue;
    out.set(Number(entry.id), (out.get(Number(entry.id)) ?? 0) + (entry.qty ?? 0));
  }
  return out;
}

// ── Guest storage ───────────────────────────────────────────────────────────

/**
 * The raw stored array for a deck held in this browser.
 *
 * SSR guard: returns an empty array outside a browser context, so the module is
 * safe to import into the SSR bundle as long as this is only called from
 * `mounted()` or something it triggers.
 */
export function loadMarks(deckId) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY_PREFIX + deckId);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Parse failure or a blocked localStorage: nothing marked.
    return [];
  }
}

/** Persist a deck's marks in this browser. */
export function saveSourcedLocal(deckId, map) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY_PREFIX + deckId, JSON.stringify(encodeSourced(map)));
  } catch {
    // Private browsing or a full quota: the mark is lost, the page is not.
  }
}

// ── Supabase (signed-in) ────────────────────────────────────────────────────

/** The raw stored array off a fetched deck row. */
export function marksFromRecord(record) {
  return Array.isArray(record?.ignored_card_ids) ? record.ignored_card_ids : [];
}

/** Persist a deck's marks to the account. Fire-and-forget — call without await. */
export async function saveSourcedToDb(supabase, deckId, map) {
  const { error } = await supabase
    .from('decks')
    .update({ ignored_card_ids: encodeSourced(map) })
    .eq('id', deckId);
  if (error) console.error('deckIgnore: saveSourcedToDb failed', error);
}
