// Deck Stats Derivations
//
// Pure derivations for the deck completion bar + richer-data block
// (completion %, SOURCED count, card-type breakdown, estimated value).
// Extracted from DeckDetailPage/DecksPage so the divide-by-zero,
// empty-`card_prices`, and all-unrecognized edge cases can be unit-tested
// without mounting a page, mirroring the bulkAddResolver.js split.
//
// IMPORTANT: this module is pure — it imports nothing from `vue` or
// `@supabase`, only the frame-type classification helper from cardIcons.js.
// Every function derives from the already-in-memory `stats` (`cardMap`,
// `main|extra|side` entries, `ownedIds`, `ignoredIds`); it never fetches.
//
// Shapes (from resolveStats()/computeStats()):
//   - entries     : Array<{ id: number, qty: number }>  (parsed YDK rows)
//   - cardMap     : Object<id, card>                     (full YGOPRODeck cards)
//   - ownedCopies   : Map<number, number>                (id -> copies held)
//   - sourcedCopies : Map<number, number>                (id -> copies marked)

import { isSpellTrap } from './cardIcons'

/**
 * computeSourcedCount(entries, cardMap, ownedIds, ignoredIds)
 *
 * Qty-summed count of SOURCED (ignored) cards, symmetric to the existing
 * `missing` computation in resolveStats(): a card counts as SOURCED when it is
 * recognized (present in `cardMap`), not owned, and marked ignored. Unrecognized
 * ids (no `cardMap` entry) are excluded.
 *
 * @param {{ id: number, qty: number }[]} entries
 * @param {Object<string|number, Object>} cardMap
 * @param {Set<number>} ownedIds
 * @param {Set<number>} ignoredIds
 * @returns {number} qty-summed SOURCED count.
 */
export function computeSourcedCount(entries, cardMap, ownedIds, ignoredIds) {
  return (entries || [])
    .filter(c => cardMap[c.id] && !ownedIds.has(c.id) && ignoredIds.has(c.id))
    .reduce((s, c) => s + c.qty, 0)
}

/**
 * computeCompletionPct({ owned, sourced, total })
 *
 * Headline completion percentage (KD-1/KD-2): SOURCED cards count toward
 * completion, so the numerator is `owned + sourced`. Rounded with Math.round
 * (not truncated). The `total === 0` guard returns 0 so an empty deck never
 * yields NaN.
 *
 * @param {{ owned?: number, sourced?: number, total?: number }} args
 * @returns {number} integer percentage in [0, 100+].
 */
export function computeCompletionPct({ owned = 0, sourced = 0, total = 0 } = {}) {
  return total > 0 ? Math.round(((owned + sourced) / total) * 100) : 0
}

/**
 * computeTypeBreakdown(entries, cardMap)
 *
 * Qty-weighted card counts by category — Monster / Spell / Trap. Spells and
 * Traps are identified via the shared `isSpellTrap` helper (frameType-based);
 * every other recognized card is a Monster. Unrecognized ids (no `cardMap`
 * entry) are excluded, so the three counts sum to `total - unrecognized`.
 *
 * @param {{ id: number, qty: number }[]} entries
 * @param {Object<string|number, Object>} cardMap
 * @returns {{ monster: number, spell: number, trap: number }}
 */
export function computeTypeBreakdown(entries, cardMap) {
  const counts = { monster: 0, spell: 0, trap: 0 }
  for (const entry of entries || []) {
    const card = cardMap[entry.id]
    if (!card) continue // unrecognized — excluded
    if (isSpellTrap(card)) {
      const frame = String(card.frameType || '').toLowerCase()
      if (frame === 'trap') counts.trap += entry.qty
      else counts.spell += entry.qty
    } else {
      counts.monster += entry.qty
    }
  }
  return counts
}

/**
 * computeEstimatedValue(entries, cardMap)
 *
 * Approximate deck value: sum of `cardmarket_price × qty` over recognized
 * cards. Mirrors CardPage.vue's normalization — a falsy price or the sentinel
 * "0.00" is treated as 0 — and additionally guards NaN (e.g. malformed strings)
 * to 0 so a card with an empty `card_prices` array contributes 0 without
 * poisoning the total.
 *
 * @param {{ id: number, qty: number }[]} entries
 * @param {Object<string|number, Object>} cardMap
 * @returns {number} approximate total (EUR, cardmarket).
 */
export function computeEstimatedValue(entries, cardMap) {
  let total = 0
  for (const entry of entries || []) {
    const card = cardMap[entry.id]
    if (!card) continue
    const raw = card?.card_prices?.[0]?.cardmarket_price
    // Normalize falsy / "0.00" sentinel to 0, per CardPage.vue.
    const price = (!raw || raw === '0.00') ? 0 : parseFloat(raw)
    if (Number.isNaN(price)) continue // guard malformed prices → contribute 0
    total += price * entry.qty
  }
  return total
}

// ── Card state ──────────────────────────────────────────────────────────────
//
// Every *copy* in a decklist is in exactly one of four states relative to you.
// Copies, not cards: a deck asking for three of something and a collection
// holding one is two copies short, and the page used to call that entry simply
// "owned" because ownership was a Set membership test and a Set cannot count.
//
// The names are the app's own: a copy you have is in your trade pile, a copy
// you lack goes on your wishlist. That is why the deck pages spend amethyst on
// OWNED and pink on MISSING and nothing at all on teal — a decklist contains no
// agreements (DESIGN.md, The Agreement Rule).
export const OWNED = 'owned'
export const SOURCED = 'sourced'
export const MISSING = 'missing'
export const UNKNOWN = 'unknown'

/** Display order: settled first, outstanding last, then the ones we cannot read. */
export const STATES = [OWNED, SOURCED, MISSING, UNKNOWN]

/**
 * countIn(src, id) — how many copies of `id` a count source names.
 *
 * The source is a Map of id -> count. A Set is still accepted, under the
 * meaning it always had: membership without a number, so every copy the deck
 * asks for is covered. That keeps a caller that has not been migrated honest
 * about what it knows rather than silently reporting one copy of everything.
 */
function countIn(src, id) {
  if (!src) return 0
  if (typeof src.get === 'function') {
    const n = src.get(id)
    return typeof n === 'number' ? n : (src.has(id) ? Infinity : 0)
  }
  return src.has?.(id) ? Infinity : 0
}

/** How many copies of `id` the viewer holds. */
const held = (ctx, id) => countIn(ctx?.ownedCopies ?? ctx?.ownedIds, id)

/** How many copies of `id` the viewer has marked as coming from elsewhere. */
const marked = (ctx, id) => countIn(ctx?.sourcedCopies ?? ctx?.ignoredIds, id)

/**
 * allocateCopies(entries, ctx)
 *
 * Splits every entry's copies across the four states, and returns one row per
 * entry: { id, qty, owned, sourced, missing, unknown }, the four always summing
 * to qty.
 *
 * Both inputs count. `ownedCopies` says how many you hold and `sourcedCopies`
 * how many you have marked as coming from elsewhere — the mark used to be a
 * Set, so it could only claim a whole entry, and a deck asking for three could
 * not be told that one of them is handled.
 *
 * The pool is shared across the whole list rather than re-read per entry,
 * because the copies are. A card sitting in the main deck twice and the side
 * deck once needs three physical copies, so one copy in the collection covers
 * the first entry and leaves nothing for the other two. Pass main+extra+side
 * together, in that order, and never a section on its own if the same id can
 * appear in two of them.
 *
 * UNKNOWN still wins over everything: an id the card database does not
 * recognize cannot be owned, wanted or sourced, only unreadable. Owned copies
 * are taken first, and only the remainder is sourced or missing — so marking a
 * card as coming from elsewhere never un-owns the copy you already have.
 */
export function allocateCopies(entries, ctx) {
  const cardMap = ctx?.cardMap ?? {}
  const pool = new Map()
  const sourcedPool = new Map()
  const out = []

  for (const entry of entries || []) {
    const id = entry?.id
    const qty = entry?.qty ?? 0
    if (!cardMap[id]) {
      out.push({ id, qty, owned: 0, sourced: 0, missing: 0, unknown: qty })
      continue
    }
    if (!pool.has(id)) pool.set(id, held(ctx, id))
    if (!sourcedPool.has(id)) sourcedPool.set(id, marked(ctx, id))

    const owned = Math.min(qty, pool.get(id))
    pool.set(id, pool.get(id) - owned)

    // Only what you do not already hold can be sourced, and a mark left over
    // from before you acquired a copy saturates rather than double-counting.
    const rest = qty - owned
    const sourced = Math.min(rest, sourcedPool.get(id))
    sourcedPool.set(id, sourcedPool.get(id) - sourced)

    out.push({ id, qty, owned, sourced, missing: rest - sourced, unknown: 0 })
  }
  return out
}

/**
 * cardState(id, ctx)
 *
 * What an id is to you, ignoring how many the deck asks for: OWNED once you
 * hold at least one. Kept for callers that only have an id — the deck pages
 * read `entryState` instead, which knows the count and so can tell a card you
 * have from a card you have enough of.
 */
export function cardState(id, ctx = {}) {
  if (!ctx.cardMap?.[id]) return UNKNOWN
  if (held(ctx, id) > 0) return OWNED
  if (marked(ctx, id) > 0) return SOURCED
  return MISSING
}

/**
 * entryState(alloc)
 *
 * The one state an entry reads as, which is the state of what is still
 * outstanding: an entry two copies short is MISSING even though a copy of it is
 * in the trade pile, because it is still on the shopping list. Only an entry
 * with nothing outstanding reads as OWNED.
 */
export function entryState(alloc) {
  if (!alloc || alloc.unknown > 0) return UNKNOWN
  if (alloc.missing > 0) return MISSING
  if (alloc.sourced > 0) return SOURCED
  return OWNED
}

/**
 * stateRuns(counts)
 *
 * Any `{ owned, sourced, missing, unknown }` shape — an allocation row or a
 * whole tally — as runs in display order, with the empty ones dropped. One
 * entry's runs draw the rule under its card; the deck's draw the strip.
 */
export function stateRuns(counts) {
  return STATES
    .map((state) => ({ state, count: counts?.[state] ?? 0 }))
    .filter((run) => run.count > 0)
}

/**
 * deckTally(entries, ctx)
 *
 * Copy-weighted counts per state, plus the total. Every count is in copies, not
 * in distinct ids, because a deck that needs three copies of a card and holds
 * one is missing two cards.
 */
export function deckTally(entries, ctx) {
  const out = { total: 0, [OWNED]: 0, [SOURCED]: 0, [MISSING]: 0, [UNKNOWN]: 0 }
  for (const alloc of allocateCopies(entries, ctx)) {
    out.total += alloc.qty
    for (const state of STATES) out[state] += alloc[state]
  }
  return out
}

/**
 * completionRuns(entries, ctx)
 *
 * The completion strip, as runs of one tick per copy.
 *
 * A percentage rounds; this counts. A deck is a countable pile — forty, fifteen
 * and fifteen — so the strip draws one tick per copy rather than a proportional
 * bar, and the reader can count the pink ones. Grouped by state rather than
 * left in deck order, so the boundary between what you have and what you need
 * is a single edge instead of a rash of stripes.
 *
 * Runs of zero are dropped, so a finished deck is one unbroken amethyst run.
 */
export function completionRuns(entries, ctx) {
  return stateRuns(deckTally(entries, ctx))
}

/**
 * missingEntries(entries, ctx)
 *
 * The shopping list: one row per entry that still needs copies, carrying `qty`
 * as the number *outstanding* rather than the number the deck asks for. Both
 * deck pages price this and wishlist it, and both used to send the entry's full
 * quantity — so owning one of three put three on the wishlist.
 */
export function missingEntries(entries, ctx) {
  return allocateCopies(entries, ctx)
    .filter((alloc) => alloc.missing > 0)
    .map((alloc) => ({ id: alloc.id, qty: alloc.missing }))
}
