import { describe, it, expect } from 'vitest'
import {
  computeSourcedCount,
  computeCompletionPct,
  computeTypeBreakdown,
  computeEstimatedValue,
} from './deckStats.js'

// ---------------------------------------------------------------------------
// Deterministic, offline fixtures.
//
// `cardMap` mirrors the real value produced by api.getCardsByIds(): a plain
// object keyed by numeric card id, each value a YGOPRODeck card object carrying
// `frameType` (spell / trap / monster frames) and a `card_prices` array whose
// first element holds a `cardmarket_price` string. Deck `entries` are the
// `{ id, qty }` rows parsed from the .ydk (parsed.main/extra/side flattened).
// ---------------------------------------------------------------------------
const cardMap = {
  1: { id: 1, name: 'Normal Mon', frameType: 'normal', type: 'Normal Monster', card_prices: [{ cardmarket_price: '1.00' }] },
  2: { id: 2, name: 'Effect Mon', frameType: 'effect', type: 'Effect Monster', card_prices: [{ cardmarket_price: '2.50' }] },
  3: { id: 3, name: 'Xyz Mon',    frameType: 'xyz',    type: 'XYZ Monster',    card_prices: [{ cardmarket_price: '4.00' }] },
  10: { id: 10, name: 'A Spell',  frameType: 'spell',  type: 'Spell Card',     card_prices: [{ cardmarket_price: '0.50' }] },
  20: { id: 20, name: 'A Trap',   frameType: 'trap',   type: 'Trap Card',      card_prices: [{ cardmarket_price: '3.00' }] },
  // Price edge cases (all still recognized monsters):
  30: { id: 30, name: 'No Prices',    frameType: 'effect', type: 'Effect Monster', card_prices: [] },        // empty array
  31: { id: 31, name: 'Zero Price',   frameType: 'effect', type: 'Effect Monster', card_prices: [{ cardmarket_price: '0.00' }] },
  32: { id: 32, name: 'Empty Price',  frameType: 'effect', type: 'Effect Monster', card_prices: [{ cardmarket_price: '' }] },
  33: { id: 33, name: 'Null Prices',  frameType: 'effect', type: 'Effect Monster', card_prices: null },      // missing array
}
// id 999 is intentionally absent from cardMap -> "unrecognized".

// A small helper so breakdown assertions survive any casing of the category
// keys the module chooses (monster/Monster, spell/Spell, ...).
const catOf = (b, name) =>
  b[name] ??
  b[name.toLowerCase()] ??
  b[name.charAt(0).toUpperCase() + name.slice(1)] ??
  0
const sumBreakdown = (b) =>
  Object.values(b).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0)

describe('computeCompletionPct', () => {
  it('25 owned + 5 sourced + 10 missing (total 40) -> 75', () => {
    expect(computeCompletionPct({ owned: 25, sourced: 5, total: 40 })).toBe(75)
  })

  it('counts owned + sourced in the numerator (KD-1)', () => {
    // 30 of 40 filled -> 75, regardless of how owned/sourced split.
    expect(computeCompletionPct({ owned: 30, sourced: 0, total: 40 })).toBe(75)
    expect(computeCompletionPct({ owned: 0, sourced: 30, total: 40 })).toBe(75)
  })

  it('empty deck (total 0) -> 0 with no NaN (divide-by-zero guard)', () => {
    const pct = computeCompletionPct({ owned: 0, sourced: 0, total: 0 })
    expect(pct).toBe(0)
    expect(Number.isNaN(pct)).toBe(false)
  })

  it('rounds with Math.round (62.5 -> 63, not truncated)', () => {
    // 5 of 8 = 62.5% -> 63
    expect(computeCompletionPct({ owned: 5, sourced: 0, total: 8 })).toBe(63)
  })

  it('a fully complete deck reads 100', () => {
    expect(computeCompletionPct({ owned: 20, sourced: 20, total: 40 })).toBe(100)
  })
})

describe('computeSourcedCount', () => {
  it('qty-sums cards that are recognized, unowned and ignored', () => {
    const entries = [
      { id: 1, qty: 2 },  // owned -> excluded
      { id: 2, qty: 3 },  // ignored & unowned -> counts 3
      { id: 10, qty: 1 }, // ignored & unowned -> counts 1
      { id: 20, qty: 2 }, // unowned, not ignored -> excluded (that's "missing")
    ]
    const ownedIds = new Set([1])
    const ignoredIds = new Set([2, 10])
    expect(computeSourcedCount(entries, cardMap, ownedIds, ignoredIds)).toBe(4)
  })

  it('excludes unrecognized ids even if they are in the ignored set', () => {
    const entries = [{ id: 999, qty: 5 }]
    const ownedIds = new Set()
    const ignoredIds = new Set([999])
    expect(computeSourcedCount(entries, cardMap, ownedIds, ignoredIds)).toBe(0)
  })

  it('excludes ignored cards that are also owned', () => {
    const entries = [{ id: 2, qty: 3 }]
    const ownedIds = new Set([2])
    const ignoredIds = new Set([2])
    expect(computeSourcedCount(entries, cardMap, ownedIds, ignoredIds)).toBe(0)
  })

  it('returns 0 for an empty deck', () => {
    expect(computeSourcedCount([], cardMap, new Set(), new Set())).toBe(0)
  })
})

describe('computeTypeBreakdown', () => {
  it('qty-weights Monster / Spell / Trap and excludes unrecognized', () => {
    const entries = [
      { id: 1, qty: 2 },   // Normal monster  -> monster +2
      { id: 2, qty: 1 },   // Effect monster  -> monster +1
      { id: 3, qty: 1 },   // Xyz monster     -> monster +1
      { id: 10, qty: 3 },  // Spell           -> spell +3
      { id: 20, qty: 2 },  // Trap            -> trap +2
      { id: 999, qty: 5 }, // unrecognized    -> excluded
    ]
    const b = computeTypeBreakdown(entries, cardMap)
    expect(catOf(b, 'monster')).toBe(4)
    expect(catOf(b, 'spell')).toBe(3)
    expect(catOf(b, 'trap')).toBe(2)
    // Recognized qty = 4 + 3 + 2 = 9 = (total 14 - unrecognized 5).
    expect(sumBreakdown(b)).toBe(9)
  })

  it('all-unrecognized deck -> breakdown sums to 0, no crash', () => {
    const entries = [
      { id: 999, qty: 3 },
      { id: 888, qty: 2 },
    ]
    const b = computeTypeBreakdown(entries, cardMap)
    expect(sumBreakdown(b)).toBe(0)
  })

  it('empty deck -> breakdown sums to 0', () => {
    expect(sumBreakdown(computeTypeBreakdown([], cardMap))).toBe(0)
  })
})

describe('computeEstimatedValue', () => {
  it('sums cardmarket_price x qty across recognized cards', () => {
    const entries = [
      { id: 1, qty: 2 },  // 1.00 * 2 = 2.00
      { id: 2, qty: 1 },  // 2.50 * 1 = 2.50
      { id: 10, qty: 3 }, // 0.50 * 3 = 1.50
    ]
    const value = computeEstimatedValue(entries, cardMap)
    expect(value).toBeCloseTo(6.0, 2)
    expect(Number.isNaN(value)).toBe(false)
  })

  it('empty card_prices array contributes 0 without breaking the total', () => {
    const entries = [
      { id: 1, qty: 1 },  // 1.00
      { id: 30, qty: 4 }, // card_prices: [] -> 0
    ]
    const value = computeEstimatedValue(entries, cardMap)
    expect(value).toBeCloseTo(1.0, 2)
    expect(Number.isNaN(value)).toBe(false)
  })

  it('a "0.00" / empty / missing price never poisons the total with NaN', () => {
    const entries = [
      { id: 2, qty: 1 },   // 2.50
      { id: 31, qty: 2 },  // "0.00" -> 0
      { id: 32, qty: 2 },  // ""     -> 0
      { id: 33, qty: 2 },  // card_prices: null -> 0
      { id: 30, qty: 2 },  // card_prices: []   -> 0
      { id: 999, qty: 9 }, // unrecognized (no card) -> 0
    ]
    const value = computeEstimatedValue(entries, cardMap)
    expect(Number.isNaN(value)).toBe(false)
    expect(value).toBeCloseTo(2.5, 2)
  })

  it('empty deck -> 0, no NaN', () => {
    const value = computeEstimatedValue([], cardMap)
    expect(value).toBe(0)
    expect(Number.isNaN(value)).toBe(false)
  })
})
