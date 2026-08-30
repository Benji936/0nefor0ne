import { describe, it, expect } from 'vitest'
import {
  COUNTED_TAG,
  decodeSourced,
  encodeSourced,
  withSourcedCount,
  nextSourcedCount,
  quantitiesOf,
} from './deckIgnore.js'

// ---------------------------------------------------------------------------
// A mark is a count of copies, stored as a flat array with one entry per marked
// copy and a leading 0 to say so. The tag exists because the two formats are
// otherwise indistinguishable: [42, 105] is one copy of each under the new
// rules and every copy of each under the old ones.
// ---------------------------------------------------------------------------
describe('encodeSourced', () => {
  it('writes one entry per marked copy, behind the tag', () => {
    expect(encodeSourced(new Map([[42, 2], [105, 1]]))).toEqual([COUNTED_TAG, 42, 42, 105])
  })

  it('nothing marked encodes to an empty array, not a lone tag', () => {
    // "Nothing marked" has to look on disk exactly as it always has, or every
    // untouched deck would appear to have been edited.
    expect(encodeSourced(new Map())).toEqual([])
    expect(encodeSourced(null)).toEqual([])
  })

  it('drops a count of zero rather than storing it', () => {
    expect(encodeSourced(new Map([[42, 0], [105, 1]]))).toEqual([COUNTED_TAG, 105])
  })

  it('round-trips through decode', () => {
    const map = new Map([[42, 3], [105, 1], [7, 2]])
    expect(decodeSourced(encodeSourced(map))).toEqual(map)
  })
})

describe('decodeSourced — counted format', () => {
  it('counts repeated ids', () => {
    expect(decodeSourced([COUNTED_TAG, 42, 42, 105])).toEqual(new Map([[42, 2], [105, 1]]))
  })

  it('ignores the quantities it does not need', () => {
    const qty = new Map([[42, 3]])
    expect(decodeSourced([COUNTED_TAG, 42], qty)).toEqual(new Map([[42, 1]]))
  })
})

describe('decodeSourced — the old whole-entry format', () => {
  it('expands a listed id to every copy the deck asks for', () => {
    // What the mark used to mean: this card is handled, all of it.
    const qty = new Map([[42, 3], [105, 1]])
    expect(decodeSourced([42, 105], qty)).toEqual(new Map([[42, 3], [105, 1]]))
  })

  it('falls back to one copy for a card the decklist no longer holds', () => {
    expect(decodeSourced([42], new Map())).toEqual(new Map([[42, 1]]))
    expect(decodeSourced([42])).toEqual(new Map([[42, 1]]))
  })

  it('an old mark survives the round trip with its meaning intact', () => {
    const qty = new Map([[42, 3]])
    const migrated = decodeSourced([42], qty)
    // Rewritten in the counted form, it still says all three are handled.
    expect(decodeSourced(encodeSourced(migrated), qty)).toEqual(new Map([[42, 3]]))
  })
})

describe('decodeSourced — junk', () => {
  it('nothing stored is an empty Map', () => {
    expect(decodeSourced([]).size).toBe(0)
    expect(decodeSourced(null).size).toBe(0)
    expect(decodeSourced(undefined).size).toBe(0)
    expect(decodeSourced('nope').size).toBe(0)
  })

  it('skips values that are not numbers', () => {
    expect(decodeSourced([COUNTED_TAG, 42, null, 'x', 42])).toEqual(new Map([[42, 2]]))
  })

  it('a stray tag inside the list never becomes a card', () => {
    expect(decodeSourced([COUNTED_TAG, 42, COUNTED_TAG, 42])).toEqual(new Map([[42, 2]]))
  })
})

describe('withSourcedCount', () => {
  it('returns a new Map so Vue sees the change', () => {
    const before = new Map([[42, 1]])
    const after = withSourcedCount(before, 42, 2)
    expect(after).not.toBe(before)
    expect(before.get(42)).toBe(1)
    expect(after.get(42)).toBe(2)
  })

  it('zero clears the card rather than storing a zero', () => {
    expect(withSourcedCount(new Map([[42, 2]]), 42, 0).has(42)).toBe(false)
  })

  it('never stores a negative count', () => {
    expect(withSourcedCount(new Map(), 42, -3).has(42)).toBe(false)
  })
})

describe('nextSourcedCount', () => {
  it('marks one more copy each click', () => {
    expect(nextSourcedCount(0, 3)).toBe(1)
    expect(nextSourcedCount(1, 3)).toBe(2)
    expect(nextSourcedCount(2, 3)).toBe(3)
  })

  it('clears once every outstanding copy is marked', () => {
    expect(nextSourcedCount(3, 3)).toBe(0)
  })

  it('a one-of behaves exactly as the on/off toggle it replaced', () => {
    expect(nextSourcedCount(0, 1)).toBe(1)
    expect(nextSourcedCount(1, 1)).toBe(0)
  })

  it('a card with nothing outstanding cannot be marked at all', () => {
    // Every copy is already in the trade pile; sourcing one would un-own it.
    expect(nextSourcedCount(0, 0)).toBe(0)
    expect(nextSourcedCount(2, 0)).toBe(0)
  })

  it('a stale count above the cap clears instead of climbing', () => {
    // The collection grew since the mark was made, so the cap fell under it.
    expect(nextSourcedCount(3, 1)).toBe(0)
  })
})

describe('quantitiesOf', () => {
  it('sums a card that appears in more than one section', () => {
    // Two in the main deck and one in the side is a three-of to a mark.
    expect(quantitiesOf([{ id: 42, qty: 2 }, { id: 42, qty: 1 }, { id: 7, qty: 1 }]))
      .toEqual(new Map([[42, 3], [7, 1]]))
  })

  it('an empty decklist has no quantities', () => {
    expect(quantitiesOf([]).size).toBe(0)
    expect(quantitiesOf(null).size).toBe(0)
  })
})
