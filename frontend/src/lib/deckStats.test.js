import { describe, it, expect } from 'vitest'
import {
  computeSourcedCount,
  computeCompletionPct,
  computeTypeBreakdown,
  computeEstimatedValue,
  cardState,
  allocateCopies,
  entryState,
  stateRuns,
  missingEntries,
  deckTally,
  completionRuns,
  OWNED,
  MISSING,
  SOURCED,
  UNKNOWN,
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

// ---------------------------------------------------------------------------
// Card state, tally and the completion strip.
// ---------------------------------------------------------------------------
describe('cardState', () => {
  const ctx = {
    cardMap,
    ownedIds: new Set([1, 10]),
    ignoredIds: new Set([2, 999]),
  }

  it('reads an id the card database does not know as unknown, whatever else is set', () => {
    // 999 is marked ignored, but an id we cannot resolve is not "sourced" — it
    // is unreadable, and pretending otherwise would count it toward completion.
    expect(cardState(999, ctx)).toBe(UNKNOWN)
  })

  it('lets owning beat being marked sourced', () => {
    expect(cardState(1, { ...ctx, ignoredIds: new Set([1]) })).toBe(OWNED)
  })

  it('calls a recognized card you neither own nor sourced missing', () => {
    expect(cardState(3, ctx)).toBe(MISSING)
  })

  it('reports sourced only for a recognized, unowned, ignored card', () => {
    expect(cardState(2, ctx)).toBe(SOURCED)
  })

  it('survives being handed nothing', () => {
    expect(cardState(1)).toBe(UNKNOWN)
    expect(cardState(1, { cardMap })).toBe(MISSING)
  })
})

describe('deckTally', () => {
  const ctx = { cardMap, ownedIds: new Set([1]), ignoredIds: new Set([10]) }

  // A deck needing three copies is missing three cards, not one card.
  it('counts cards, not distinct ids', () => {
    const entries = [{ id: 1, qty: 3 }, { id: 2, qty: 2 }, { id: 10, qty: 1 }, { id: 999, qty: 2 }]
    expect(deckTally(entries, ctx)).toEqual({
      total: 8, owned: 3, missing: 2, sourced: 1, unknown: 2,
    })
  })

  it('has the four states sum to the total, always', () => {
    const entries = [{ id: 1, qty: 3 }, { id: 2, qty: 2 }, { id: 10, qty: 1 }, { id: 999, qty: 2 }]
    const t = deckTally(entries, ctx)
    expect(t.owned + t.missing + t.sourced + t.unknown).toBe(t.total)
  })

  it('is all zeroes for an empty deck rather than NaN', () => {
    expect(deckTally([], ctx)).toEqual({ total: 0, owned: 0, missing: 0, sourced: 0, unknown: 0 })
    expect(deckTally(null, ctx).total).toBe(0)
  })
})

describe('completionRuns', () => {
  const ctx = { cardMap, ownedIds: new Set([1]), ignoredIds: new Set([10]) }

  it('orders the strip settled-first, outstanding-last', () => {
    const entries = [{ id: 2, qty: 2 }, { id: 999, qty: 1 }, { id: 1, qty: 3 }, { id: 10, qty: 1 }]
    expect(completionRuns(entries, ctx)).toEqual([
      { state: 'owned', count: 3 },
      { state: 'sourced', count: 1 },
      { state: 'missing', count: 2 },
      { state: 'unknown', count: 1 },
    ])
  })

  // A finished deck should read as one unbroken run, not four with three of
  // them zero-width.
  it('drops empty runs', () => {
    expect(completionRuns([{ id: 1, qty: 40 }], ctx)).toEqual([{ state: 'owned', count: 40 }])
  })

  it('is an empty strip for an empty deck', () => {
    expect(completionRuns([], ctx)).toEqual([])
  })
})


// ---------------------------------------------------------------------------
// Copies, not cards.
//
// `ownedCopies` is a Map of id -> how many copies the collection holds. It used
// to be a Set, which could only answer "at all", so a deck asking for three of
// something you had one of read as complete. A Set is still accepted, meaning
// what it always meant — enough of them — so an un-migrated caller keeps its
// old answer instead of quietly getting one copy of everything.
// ---------------------------------------------------------------------------
const copies = (pairs) => new Map(pairs)

describe('allocateCopies', () => {
  it('splits an entry the collection only partly covers', () => {
    const [a] = allocateCopies([{ id: 1, qty: 3 }], {
      cardMap, ownedCopies: copies([[1, 1]]), ignoredIds: new Set(),
    })
    expect(a).toEqual({ id: 1, qty: 3, owned: 1, sourced: 0, missing: 2, unknown: 0 })
  })

  it('the four states always sum to the entry quantity', () => {
    const entries = [{ id: 1, qty: 3 }, { id: 2, qty: 2 }, { id: 10, qty: 1 }, { id: 999, qty: 2 }]
    const ctx = { cardMap, ownedCopies: copies([[1, 1], [10, 5]]), ignoredIds: new Set([2]) }
    for (const a of allocateCopies(entries, ctx)) {
      expect(a.owned + a.sourced + a.missing + a.unknown).toBe(a.qty)
    }
  })

  it('never credits more copies than the deck asks for', () => {
    const [a] = allocateCopies([{ id: 1, qty: 2 }], {
      cardMap, ownedCopies: copies([[1, 9]]), ignoredIds: new Set(),
    })
    expect(a.owned).toBe(2)
    expect(a.missing).toBe(0)
  })

  it('spends the pool once across the whole list, not once per entry', () => {
    // Two copies in the main deck and one in the side: three cards, one held.
    const entries = [{ id: 1, qty: 2 }, { id: 1, qty: 1 }]
    const out = allocateCopies(entries, {
      cardMap, ownedCopies: copies([[1, 1]]), ignoredIds: new Set(),
    })
    expect(out[0]).toMatchObject({ owned: 1, missing: 1 })
    expect(out[1]).toMatchObject({ owned: 0, missing: 1 })
  })

  it('sources only the copies you do not already hold', () => {
    const [a] = allocateCopies([{ id: 1, qty: 3 }], {
      cardMap, ownedCopies: copies([[1, 1]]), ignoredIds: new Set([1]),
    })
    expect(a).toMatchObject({ owned: 1, sourced: 2, missing: 0 })
  })

  it('an unrecognized id is only unreadable — never owned, wanted or sourced', () => {
    const [a] = allocateCopies([{ id: 999, qty: 2 }], {
      cardMap, ownedCopies: copies([[999, 5]]), ignoredIds: new Set([999]),
    })
    expect(a).toEqual({ id: 999, qty: 2, owned: 0, sourced: 0, missing: 0, unknown: 2 })
  })

  it('a Set still means "enough of them", so an un-migrated caller is unchanged', () => {
    const [a] = allocateCopies([{ id: 1, qty: 3 }], {
      cardMap, ownedIds: new Set([1]), ignoredIds: new Set(),
    })
    expect(a).toMatchObject({ owned: 3, missing: 0 })
  })

  it('no ownership at all leaves every copy missing', () => {
    const [a] = allocateCopies([{ id: 1, qty: 3 }], { cardMap })
    expect(a).toMatchObject({ owned: 0, missing: 3 })
  })

  it('an empty list allocates nothing', () => {
    expect(allocateCopies([], { cardMap })).toEqual([])
    expect(allocateCopies(undefined, { cardMap })).toEqual([])
  })
})

describe('entryState', () => {
  const of = (o) => ({ owned: 0, sourced: 0, missing: 0, unknown: 0, ...o })

  it('an entry one copy short still reads as missing', () => {
    expect(entryState(of({ owned: 2, missing: 1 }))).toBe(MISSING)
  })

  it('only an entry with nothing outstanding reads as owned', () => {
    expect(entryState(of({ owned: 3 }))).toBe(OWNED)
  })

  it('sourced once the remainder is handled elsewhere', () => {
    expect(entryState(of({ owned: 1, sourced: 2 }))).toBe(SOURCED)
  })

  it('missing beats sourced when some copies are neither', () => {
    expect(entryState(of({ sourced: 1, missing: 1 }))).toBe(MISSING)
  })

  it('unreadable wins over everything', () => {
    expect(entryState(of({ owned: 1, unknown: 1 }))).toBe(UNKNOWN)
  })
})

describe('stateRuns', () => {
  it('returns runs in display order with the empty ones dropped', () => {
    expect(stateRuns({ owned: 1, sourced: 0, missing: 2, unknown: 0 })).toEqual([
      { state: OWNED, count: 1 },
      { state: MISSING, count: 2 },
    ])
  })

  it('a whole tally works the same as one entry', () => {
    const runs = stateRuns({ owned: 30, sourced: 2, missing: 8, unknown: 0 })
    expect(runs.map((r) => r.state)).toEqual([OWNED, SOURCED, MISSING])
  })

  it('nothing to draw is an empty list, not a run of zero', () => {
    expect(stateRuns({})).toEqual([])
    expect(stateRuns(null)).toEqual([])
  })
})

describe('deckTally with copies', () => {
  it('counts the copies you are short, not the cards', () => {
    // Three of id 1 (one held) and two of id 2 (none held) -> 1 owned, 4 missing.
    const tally = deckTally([{ id: 1, qty: 3 }, { id: 2, qty: 2 }], {
      cardMap, ownedCopies: copies([[1, 1]]), ignoredIds: new Set(),
    })
    expect(tally).toMatchObject({ total: 5, owned: 1, missing: 4, sourced: 0, unknown: 0 })
  })

  it('the states still sum to the total', () => {
    const entries = [{ id: 1, qty: 3 }, { id: 2, qty: 2 }, { id: 999, qty: 1 }]
    const tally = deckTally(entries, {
      cardMap, ownedCopies: copies([[1, 2]]), ignoredIds: new Set([2]),
    })
    expect(tally.owned + tally.sourced + tally.missing + tally.unknown).toBe(tally.total)
  })

  it('a deck fully covered leaves nothing missing', () => {
    const tally = deckTally([{ id: 1, qty: 3 }], {
      cardMap, ownedCopies: copies([[1, 3]]), ignoredIds: new Set(),
    })
    expect(tally).toMatchObject({ owned: 3, missing: 0 })
  })
})

describe('completionRuns with copies', () => {
  it('draws a partly held entry as both an owned and a missing run', () => {
    const runs = completionRuns([{ id: 1, qty: 3 }], {
      cardMap, ownedCopies: copies([[1, 1]]), ignoredIds: new Set(),
    })
    expect(runs).toEqual([
      { state: OWNED, count: 1 },
      { state: MISSING, count: 2 },
    ])
  })
})

describe('missingEntries', () => {
  it('carries the outstanding count, not the deck quantity', () => {
    const out = missingEntries([{ id: 1, qty: 3 }, { id: 2, qty: 2 }], {
      cardMap, ownedCopies: copies([[1, 1], [2, 2]]), ignoredIds: new Set(),
    })
    // id 1 is two short; id 2 is fully covered and drops out entirely.
    expect(out).toEqual([{ id: 1, qty: 2 }])
  })

  it('leaves out what is sourced elsewhere and what cannot be read', () => {
    const out = missingEntries([{ id: 1, qty: 2 }, { id: 2, qty: 1 }, { id: 999, qty: 1 }], {
      cardMap, ownedCopies: new Map(), ignoredIds: new Set([2]),
    })
    expect(out).toEqual([{ id: 1, qty: 2 }])
  })

  it('is empty for a deck with nothing outstanding', () => {
    expect(missingEntries([{ id: 1, qty: 1 }], {
      cardMap, ownedCopies: copies([[1, 1]]), ignoredIds: new Set(),
    })).toEqual([])
  })
})

describe('cardState with copies', () => {
  it('is owned once you hold one, however many the deck wants', () => {
    expect(cardState(1, { cardMap, ownedCopies: copies([[1, 1]]), ignoredIds: new Set() })).toBe(OWNED)
  })

  it('a count of zero is not ownership', () => {
    expect(cardState(1, { cardMap, ownedCopies: copies([[1, 0]]), ignoredIds: new Set() })).toBe(MISSING)
  })

  it('still reads a Set', () => {
    expect(cardState(1, { cardMap, ownedIds: new Set([1]), ignoredIds: new Set() })).toBe(OWNED)
  })
})


// ---------------------------------------------------------------------------
// A sourced mark counts too. It used to be a Set, so it could only claim a
// whole entry: a deck asking for three could not be told that one is handled.
// ---------------------------------------------------------------------------
describe('sourcedCopies', () => {
  it('marks only the copies asked for, leaving the rest missing', () => {
    const [a] = allocateCopies([{ id: 1, qty: 3 }], {
      cardMap, ownedCopies: new Map(), sourcedCopies: new Map([[1, 1]]),
    })
    expect(a).toMatchObject({ owned: 0, sourced: 1, missing: 2 })
  })

  it('takes owned copies first, so a mark never un-owns one', () => {
    const [a] = allocateCopies([{ id: 1, qty: 3 }], {
      cardMap, ownedCopies: new Map([[1, 1]]), sourcedCopies: new Map([[1, 1]]),
    })
    expect(a).toMatchObject({ owned: 1, sourced: 1, missing: 1 })
  })

  it('saturates rather than double-counting when the mark outlives the need', () => {
    // Marked three, then two of them turned up in the collection.
    const [a] = allocateCopies([{ id: 1, qty: 3 }], {
      cardMap, ownedCopies: new Map([[1, 2]]), sourcedCopies: new Map([[1, 3]]),
    })
    expect(a).toMatchObject({ owned: 2, sourced: 1, missing: 0 })
    expect(a.owned + a.sourced + a.missing).toBe(a.qty)
  })

  it('spends the marks once across the list, as the owned pool is spent', () => {
    const entries = [{ id: 1, qty: 2 }, { id: 1, qty: 1 }]
    const out = allocateCopies(entries, {
      cardMap, ownedCopies: new Map(), sourcedCopies: new Map([[1, 2]]),
    })
    expect(out[0]).toMatchObject({ sourced: 2, missing: 0 })
    expect(out[1]).toMatchObject({ sourced: 0, missing: 1 })
  })

  it('a partly marked entry is still missing, and shows both runs', () => {
    const ctx = { cardMap, ownedCopies: new Map(), sourcedCopies: new Map([[1, 1]]) }
    const [a] = allocateCopies([{ id: 1, qty: 3 }], ctx)
    expect(entryState(a)).toBe(MISSING)
    expect(stateRuns(a)).toEqual([
      { state: SOURCED, count: 1 },
      { state: MISSING, count: 2 },
    ])
  })

  it('an entry fully covered by owning and marking is settled', () => {
    const [a] = allocateCopies([{ id: 1, qty: 2 }], {
      cardMap, ownedCopies: new Map([[1, 1]]), sourcedCopies: new Map([[1, 1]]),
    })
    expect(entryState(a)).toBe(SOURCED)
    expect(a.missing).toBe(0)
  })

  it('marked copies stay off the wishlist', () => {
    const out = missingEntries([{ id: 1, qty: 3 }], {
      cardMap, ownedCopies: new Map(), sourcedCopies: new Map([[1, 2]]),
    })
    expect(out).toEqual([{ id: 1, qty: 1 }])
  })

  it('an ignoredIds Set still claims the whole entry', () => {
    const [a] = allocateCopies([{ id: 1, qty: 3 }], {
      cardMap, ownedCopies: new Map(), ignoredIds: new Set([1]),
    })
    expect(a).toMatchObject({ sourced: 3, missing: 0 })
  })
})
