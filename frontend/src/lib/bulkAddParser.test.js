import { describe, it, expect } from 'vitest'
import { parseBulkLines, isSetCode } from './bulkAddParser'

describe('parseBulkLines', () => {
  // AC1 — Quantity-prefix parsing
  it('parses the three quantity-prefix forms and bare names (AC1)', () => {
    const result = parseBulkLines(
      ['3x Ash Blossom', '3 Ash Blossom', 'x3 Ash Blossom', 'Ash Blossom'].join('\n'),
    )
    expect(result).toEqual([
      { qty: 3, query: 'Ash Blossom' },
      { qty: 3, query: 'Ash Blossom' },
      { qty: 3, query: 'Ash Blossom' },
      { qty: 1, query: 'Ash Blossom' },
    ])
  })

  it('handles the `3x` form with and without a space after x', () => {
    expect(parseBulkLines('2xMaxx "C"')).toEqual([{ qty: 2, query: 'Maxx "C"' }])
    expect(parseBulkLines('2x Maxx "C"')).toEqual([{ qty: 2, query: 'Maxx "C"' }])
  })

  it('defaults qty to 1 when there is no prefix', () => {
    expect(parseBulkLines('Maxx "C"')).toEqual([{ qty: 1, query: 'Maxx "C"' }])
  })

  it('qty is always a positive integer (never 0)', () => {
    // A bare `0x` would yield 0 — guarded back up to 1.
    expect(parseBulkLines('0x Pot of Greed')).toEqual([{ qty: 1, query: 'Pot of Greed' }])
    for (const { qty } of parseBulkLines('3x A\nx5 B\n2 C\nD')) {
      expect(Number.isInteger(qty)).toBe(true)
      expect(qty).toBeGreaterThanOrEqual(1)
    }
  })

  // Digit-led card name case (R5 / quantity over-matching guard)
  it('parses a digit-led card name sensibly', () => {
    // "7 Colored Fish" — by paste convention the leading number is read as a
    // quantity; the remaining text is the card token. Documented behaviour.
    expect(parseBulkLines('7 Colored Fish')).toEqual([{ qty: 7, query: 'Colored Fish' }])
    // A set code that legitimately starts with a digit is preserved as the query.
    expect(parseBulkLines('SDCB-EN001')).toEqual([{ qty: 1, query: 'SDCB-EN001' }])
    // A name whose first token is non-numeric is untouched, even with digits later.
    expect(parseBulkLines('Number 39: Utopia')).toEqual([
      { qty: 1, query: 'Number 39: Utopia' },
    ])
  })

  // Blank-line and comment skipping; empty-after-strip dropped
  it('skips blank lines and `#`-comment lines', () => {
    const text = ['# my want list', '', '  ', '3x Ash Blossom', '#another comment', 'Maxx "C"'].join(
      '\n',
    )
    expect(parseBulkLines(text)).toEqual([
      { qty: 3, query: 'Ash Blossom' },
      { qty: 1, query: 'Maxx "C"' },
    ])
  })

  it('drops lines whose query is empty after stripping the prefix', () => {
    // `3x` followed by nothing -> empty query -> dropped.
    expect(parseBulkLines('3x ')).toEqual([])
    expect(parseBulkLines('x3')).toEqual([])
  })

  it('trims surrounding whitespace on each line', () => {
    expect(parseBulkLines('   Pot of Greed   ')).toEqual([{ qty: 1, query: 'Pot of Greed' }])
  })

  it('handles CRLF line endings', () => {
    expect(parseBulkLines('3x Ash Blossom\r\nMaxx "C"\r\n')).toEqual([
      { qty: 3, query: 'Ash Blossom' },
      { qty: 1, query: 'Maxx "C"' },
    ])
  })

  it('returns an empty array for empty / non-string input', () => {
    expect(parseBulkLines('')).toEqual([])
    expect(parseBulkLines('   \n  \n')).toEqual([])
    expect(parseBulkLines(null)).toEqual([])
    expect(parseBulkLines(undefined)).toEqual([])
  })
})

describe('isSetCode', () => {
  // AC2 / R5 — strict set-code detection
  it('returns true for valid set codes (AC2/R5)', () => {
    expect(isSetCode('SDCB-EN001')).toBe(true)
    expect(isSetCode('LOB-005')).toBe(true)
  })

  it('returns false for card names and malformed codes (AC2/R5)', () => {
    expect(isSetCode('Maxx "C"')).toBe(false)
    expect(isSetCode('LOB')).toBe(false)
    expect(isSetCode('LOB-')).toBe(false)
  })

  it('is case-insensitive but still requires a trailing numeric part', () => {
    expect(isSetCode('sdcb-en001')).toBe(true)
    expect(isSetCode('lob-en')).toBe(false) // no trailing digits
  })

  it('returns false for non-string input', () => {
    expect(isSetCode(null)).toBe(false)
    expect(isSetCode(undefined)).toBe(false)
    expect(isSetCode(123)).toBe(false)
  })
})
