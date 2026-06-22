import { describe, it, expect } from 'vitest'
import { parseYdk } from './ydk.js'

describe('parseYdk', () => {
  it('returns empty sections for an empty string', () => {
    const result = parseYdk('')
    expect(result).toEqual({ main: [], extra: [], side: [] })
  })

  it('returns empty sections for null/undefined input', () => {
    expect(parseYdk(null)).toEqual({ main: [], extra: [], side: [] })
    expect(parseYdk(undefined)).toEqual({ main: [], extra: [], side: [] })
  })

  it('skips comment lines (lines starting with # that are not section markers)', () => {
    const text = `#created by YGOPro
#main
89631139
`
    const result = parseYdk(text)
    expect(result.main).toEqual([{ id: 89631139, qty: 1 }])
    expect(result.extra).toEqual([])
    expect(result.side).toEqual([])
  })

  it('handles duplicates correctly — repeated passcode produces qty > 1', () => {
    const text = `#main
89631139
89631139
89631139
`
    const result = parseYdk(text)
    expect(result.main).toEqual([{ id: 89631139, qty: 3 }])
  })

  it('parses all 3 sections correctly', () => {
    const text = `#created by YGOPro
#main
89631139
89631139
89631139
40737112
#extra
44508094
!side
81386177
`
    const result = parseYdk(text)
    expect(result.main).toEqual([
      { id: 89631139, qty: 3 },
      { id: 40737112, qty: 1 },
    ])
    expect(result.extra).toEqual([{ id: 44508094, qty: 1 }])
    expect(result.side).toEqual([{ id: 81386177, qty: 1 }])
  })

  it('skips trailing garbage lines gracefully without throwing', () => {
    const text = `#main
89631139
#extra
44508094
!side
81386177
#junk line to skip
not_a_number
abc123
`
    expect(() => parseYdk(text)).not.toThrow()
    const result = parseYdk(text)
    expect(result.main).toEqual([{ id: 89631139, qty: 1 }])
    expect(result.extra).toEqual([{ id: 44508094, qty: 1 }])
    expect(result.side).toEqual([{ id: 81386177, qty: 1 }])
  })

  it('skips blank lines', () => {
    const text = `#main

89631139

40737112

`
    const result = parseYdk(text)
    expect(result.main).toEqual([
      { id: 89631139, qty: 1 },
      { id: 40737112, qty: 1 },
    ])
  })

  it('treats lines before any section marker as main section', () => {
    const text = `89631139
#main
40737112
`
    const result = parseYdk(text)
    expect(result.main.find(c => c.id === 89631139)).toEqual({ id: 89631139, qty: 1 })
    expect(result.main.find(c => c.id === 40737112)).toEqual({ id: 40737112, qty: 1 })
  })

  it('returns id as a Number (not a string)', () => {
    const text = `#main
89631139
`
    const result = parseYdk(text)
    expect(typeof result.main[0].id).toBe('number')
  })

  it('handles Windows-style CRLF line endings', () => {
    const text = '#main\r\n89631139\r\n40737112\r\n'
    const result = parseYdk(text)
    expect(result.main).toEqual([
      { id: 89631139, qty: 1 },
      { id: 40737112, qty: 1 },
    ])
  })

  it('handles multiple cards in extra and side decks with duplicates', () => {
    const text = `#extra
44508094
44508094
!side
81386177
81386177
81386177
`
    const result = parseYdk(text)
    expect(result.extra).toEqual([{ id: 44508094, qty: 2 }])
    expect(result.side).toEqual([{ id: 81386177, qty: 3 }])
    expect(result.main).toEqual([])
  })

  it('handles a full realistic deck file', () => {
    const text = `#created by YGOPro Percy
#main
5318639
5318639
5318639
89631139
89631139
89631139
40737112
40737112
40737112
#extra
44508094
44508094
44508094
!side
81386177
`
    const result = parseYdk(text)
    expect(result.main.length).toBe(3)
    expect(result.extra.length).toBe(1)
    expect(result.side.length).toBe(1)
    expect(result.extra[0]).toEqual({ id: 44508094, qty: 3 })
  })
})
