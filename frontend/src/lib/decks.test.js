import { describe, it, expect } from 'vitest'
import { countCopies } from './decks.js'

// ---------------------------------------------------------------------------
// countCopies turns Card rows into "how many of each card do I have".
//
// The rows are whatever `select("image_id, quantity")` returns for the viewer's
// trade pile. One card can be in that pile several times over — a Secret Rare,
// a Common, a French one — and for the purpose of building a deck they are all
// copies of it, which is why the sum is per image_id and not per row.
//
// `quantity` is numeric in Postgres rather than integer, because completing a
// trade subtracts from it, so the parsing below guards what that allows.
// ---------------------------------------------------------------------------
describe('countCopies', () => {
  it('sums quantity across every row holding the same card', () => {
    const out = countCopies([
      { image_id: 1, quantity: 2 },
      { image_id: 1, quantity: 1 },
      { image_id: 2, quantity: 3 },
    ])
    expect(out.get(1)).toBe(3)
    expect(out.get(2)).toBe(3)
  })

  it('a row with no readable quantity still counts as one copy', () => {
    // The row exists, so the card does — reading it as zero would lose a card
    // the collector actually has.
    const out = countCopies([
      { image_id: 1, quantity: null },
      { image_id: 2 },
      { image_id: 3, quantity: 'nonsense' },
    ])
    expect(out.get(1)).toBe(1)
    expect(out.get(2)).toBe(1)
    expect(out.get(3)).toBe(1)
  })

  it('a row decremented to zero contributes nothing', () => {
    const out = countCopies([{ image_id: 1, quantity: 0 }, { image_id: 1, quantity: 2 }])
    expect(out.get(1)).toBe(2)
  })

  it('never counts a negative quantity against the pile', () => {
    const out = countCopies([{ image_id: 1, quantity: -5 }, { image_id: 1, quantity: 1 }])
    expect(out.get(1)).toBe(1)
  })

  it('floors a fractional quantity — half a card is not a copy', () => {
    expect(countCopies([{ image_id: 1, quantity: 2.7 }]).get(1)).toBe(2)
  })

  it('reads a numeric string, which is what PostgREST sends for numeric', () => {
    expect(countCopies([{ image_id: 1, quantity: '3' }]).get(1)).toBe(3)
  })

  it('keys on the number even when the id arrives as a string', () => {
    const out = countCopies([{ image_id: '46986414', quantity: 1 }])
    expect(out.get(46986414)).toBe(1)
  })

  it('skips a row with no card behind it', () => {
    const out = countCopies([{ image_id: null, quantity: 3 }, { image_id: undefined }])
    expect(out.size).toBe(0)
  })

  it('nothing in the pile is an empty Map, not a null', () => {
    expect(countCopies([]).size).toBe(0)
    expect(countCopies(null).size).toBe(0)
    expect(countCopies(undefined).size).toBe(0)
  })
})
