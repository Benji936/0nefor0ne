import { describe, it, expect } from 'vitest'
import {
  ANNOUNCE_KIND,
  isLookingFor,
  stripKindPrefix,
  detectKindFromText,
  matchArchetype,
  composeWantHeadline,
} from './announceKind'

const ARCHETYPES = ['Darklord', 'Blue-Eyes', 'HERO', 'Sky Striker', 'Dark Magician']

describe('detectKindFromText', () => {
  it('treats an LF prefix as looking_for, in any case and with any separator', () => {
    expect(detectKindFromText('LF: Darklord deck base')).toBe(ANNOUNCE_KIND.LOOKING_FOR)
    expect(detectKindFromText('lf Darklord')).toBe(ANNOUNCE_KIND.LOOKING_FOR)
    expect(detectKindFromText('LF - Darklord')).toBe(ANNOUNCE_KIND.LOOKING_FOR)
    expect(detectKindFromText('  LF:Darklord')).toBe(ANNOUNCE_KIND.LOOKING_FOR)
  })

  it('does not match LF inside a word', () => {
    expect(detectKindFromText('LFP playmat for sale')).toBe(ANNOUNCE_KIND.SELL)
    expect(detectKindFromText('Golfer deck')).toBe(ANNOUNCE_KIND.SELL)
  })

  it('falls back to sell for WTS and for unprefixed text', () => {
    expect(detectKindFromText('WTS: Blue-Eyes')).toBe(ANNOUNCE_KIND.SELL)
    expect(detectKindFromText('Blue-Eyes PSA 9')).toBe(ANNOUNCE_KIND.SELL)
    expect(detectKindFromText('')).toBe(ANNOUNCE_KIND.SELL)
  })
})

describe('stripKindPrefix', () => {
  it('removes LF and the existing WTS/WTT/WTB prefixes', () => {
    expect(stripKindPrefix('LF: Darklord deck base')).toBe('Darklord deck base')
    expect(stripKindPrefix('lf - Darklord')).toBe('Darklord')
    expect(stripKindPrefix('WTS: Blue-Eyes')).toBe('Blue-Eyes')
    expect(stripKindPrefix('WTB Dark Magician')).toBe('Dark Magician')
  })

  it('leaves unprefixed text alone', () => {
    expect(stripKindPrefix('Darklord deck base')).toBe('Darklord deck base')
  })
})

describe('matchArchetype', () => {
  it('finds an archetype anywhere in the text, case-insensitively', () => {
    expect(matchArchetype('Darklord deck base', ARCHETYPES)).toBe('Darklord')
    expect(matchArchetype('looking for darklord stuff', ARCHETYPES)).toBe('Darklord')
    expect(matchArchetype('need a SKY STRIKER core', ARCHETYPES)).toBe('Sky Striker')
  })

  it('prefers the longest match so multi-word archetypes win', () => {
    expect(matchArchetype('Dark Magician playset', ARCHETYPES)).toBe('Dark Magician')
  })

  it('respects word boundaries', () => {
    expect(matchArchetype('Darklords', ARCHETYPES)).toBe('Darklord')
    expect(matchArchetype('superhero cape', ARCHETYPES)).toBe(null)
  })

  it('returns null for no match or bad input', () => {
    expect(matchArchetype('random junk', ARCHETYPES)).toBe(null)
    expect(matchArchetype('', ARCHETYPES)).toBe(null)
    expect(matchArchetype('Darklord', [])).toBe(null)
    expect(matchArchetype('Darklord', null)).toBe(null)
  })
})

describe('composeWantHeadline', () => {
  it('joins archetype and detail', () => {
    expect(composeWantHeadline('Darklord', 'deck base')).toBe('Darklord deck base')
  })

  it('handles either side missing', () => {
    expect(composeWantHeadline('Darklord', '')).toBe('Darklord')
    expect(composeWantHeadline('', 'deck base')).toBe('deck base')
    expect(composeWantHeadline('', '')).toBe('')
    expect(composeWantHeadline(null, null)).toBe('')
  })

  it('trims and collapses whitespace', () => {
    expect(composeWantHeadline('  Darklord ', '  deck  base ')).toBe('Darklord deck base')
  })
})

describe('isLookingFor', () => {
  it('reads the kind column and defaults to false', () => {
    expect(isLookingFor({ kind: 'looking_for' })).toBe(true)
    expect(isLookingFor({ kind: 'sell' })).toBe(false)
    expect(isLookingFor({})).toBe(false)
    expect(isLookingFor(null)).toBe(false)
  })
})
