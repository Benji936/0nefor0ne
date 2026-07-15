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
