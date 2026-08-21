import { describe, it, expect } from 'vitest'
import { splitMatches } from './highlight'

const rebuild = (segs) => segs.map(s => s.t).join('')
const marked = (segs) => segs.filter(s => s.hit).map(s => s.t)

describe('splitMatches', () => {
  const desc = 'Fusion Summon 1 Fusion Monster. You do not use "Polymerization".'

  it('marks every occurrence and leaves the rest alone', () => {
    const segs = splitMatches(desc, 'fusion')
    expect(marked(segs)).toEqual(['Fusion', 'Fusion'])
    expect(rebuild(segs)).toBe(desc)
  })

  it('keeps the original casing of the text it marks', () => {
    // The reader typed "fusion"; the card says "Fusion". The card wins.
    expect(marked(splitMatches(desc, 'FUSION'))).toEqual(['Fusion', 'Fusion'])
  })

  it('ignores whitespace around the query', () => {
    expect(marked(splitMatches(desc, '  Polymerization  '))).toEqual(['Polymerization'])
  })

  it('matches across word boundaries, so a phrase is marked as one run', () => {
    const segs = splitMatches(desc, 'fusion monster')
    expect(marked(segs)).toEqual(['Fusion Monster'])
    expect(rebuild(segs)).toBe(desc)
  })

  it('returns null when there is nothing to mark, so callers can render plain text', () => {
    expect(splitMatches(desc, 'ritual')).toBeNull()
    expect(splitMatches(desc, '')).toBeNull()
    expect(splitMatches(desc, '   ')).toBeNull()
    expect(splitMatches('', 'fusion')).toBeNull()
    expect(splitMatches(null, 'fusion')).toBeNull()
    expect(splitMatches(desc, null)).toBeNull()
  })

  it('handles a match at the very start and the very end', () => {
    const segs = splitMatches('Fusion', 'fusion')
    expect(segs).toEqual([{ t: 'Fusion', hit: true }])
    expect(marked(splitMatches('Use Fusion', 'fusion'))).toEqual(['Fusion'])
  })

  it('does not lose adjacent repeats', () => {
    const segs = splitMatches('abab', 'ab')
    expect(segs).toEqual([{ t: 'ab', hit: true }, { t: 'ab', hit: true }])
    expect(rebuild(segs)).toBe('abab')
  })
})
