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
//   - entries : Array<{ id: number, qty: number }>  (parsed YDK rows)
//   - cardMap : Object<id, card>                     (full YGOPRODeck cards)
//   - ownedIds / ignoredIds : Set<number>

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
// Every card in a decklist is in exactly one of four states relative to you,
// and the two pages that draw a deck were each deciding this inline, with
// slightly different expressions of the same four conditions. Naming them once
// is what lets the completion strip, the card grid and the tally agree.
//
// The names are the app's own: a card you have is in your trade pile, a card
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
 * cardState(id, { cardMap, ownedIds, ignoredIds })
 *
 * UNKNOWN wins over everything: an id the card database does not recognize
 * cannot be owned, wanted or sourced, only unreadable. Then owning beats being
 * marked sourced, so a card you have marked as coming from elsewhere and then
 * actually acquired stops being counted twice.
 */
export function cardState(id, { cardMap = {}, ownedIds, ignoredIds } = {}) {
  if (!cardMap[id]) return UNKNOWN
  if (ownedIds?.has?.(id)) return OWNED
  if (ignoredIds?.has?.(id)) return SOURCED
  return MISSING
}

/**
 * deckTally(entries, ctx)
 *
 * Qty-weighted counts per state, plus the total. `entries` is the flattened
 * main+extra+side list; every count is in cards, not in distinct ids, because a
 * deck that needs three copies of a card is missing three cards.
 */
export function deckTally(entries, ctx) {
  const out = { total: 0, [OWNED]: 0, [SOURCED]: 0, [MISSING]: 0, [UNKNOWN]: 0 }
  for (const entry of entries || []) {
    const qty = entry?.qty ?? 0
    out.total += qty
    out[cardState(entry.id, ctx)] += qty
  }
  return out
}

/**
 * completionRuns(entries, ctx)
 *
 * The completion strip, as runs of one tick per card.
 *
 * A percentage rounds; this counts. A deck is a countable pile — forty, fifteen
 * and fifteen — so the strip draws one tick per card rather than a proportional
 * bar, and the reader can count the pink ones. Grouped by state rather than
 * left in deck order, so the boundary between what you have and what you need
 * is a single edge instead of a rash of stripes.
 *
 * Runs of zero are dropped, so a finished deck is one unbroken amethyst run.
 */
export function completionRuns(entries, ctx) {
  const tally = deckTally(entries, ctx)
  return STATES
    .map((state) => ({ state, count: tally[state] }))
    .filter((run) => run.count > 0)
}
