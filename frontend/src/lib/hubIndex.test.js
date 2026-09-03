import { describe, it, expect } from 'vitest'
import { groupByInitial, bucketOf, OTHER_BUCKET } from './hubIndex.js'
import { ARCHETYPES } from '../data/archetype-slugs.js'

describe('bucketOf', () => {
  it('uppercases the initial', () => {
    expect(bucketOf('Labrynth')).toBe('L')
    expect(bucketOf('blue-eyes')).toBe('B')
  })

  it('sends names that do not start with a letter to the other bucket', () => {
    // Both of these are real: the live archetype list opens with them.
    expect(bucketOf('"C"')).toBe(OTHER_BUCKET)
    expect(bucketOf('-Eyes Dragon')).toBe(OTHER_BUCKET)
    expect(bucketOf('7')).toBe(OTHER_BUCKET)
  })

  it('ignores surrounding whitespace rather than bucketing on a space', () => {
    expect(bucketOf('  Dogmatika')).toBe('D')
  })

  it('survives a missing name instead of throwing mid-render', () => {
    expect(bucketOf(undefined)).toBe(OTHER_BUCKET)
    expect(bucketOf(null)).toBe(OTHER_BUCKET)
    expect(bucketOf('')).toBe(OTHER_BUCKET)
  })
})

describe('groupByInitial', () => {
  it('orders sections alphabetically with the other bucket first', () => {
    // '#' leads so the anchor nav starts with it; last would strand it under
    // hundreds of rows on a page that exists to be navigable.
    const out = groupByInitial(['Zoodiac', '"C"', 'Apple', 'Melodious'])
    expect(out.map(s => s.letter)).toEqual([OTHER_BUCKET, 'A', 'M', 'Z'])
  })

  it('sorts within a section by display name, case-insensitively', () => {
    const out = groupByInitial(['dogmatika', 'Dragonmaid', 'Despia'])
    expect(out[0].items).toEqual(['Despia', 'dogmatika', 'Dragonmaid'])
  })

  it('reads the name through nameOf for object items', () => {
    const items = [{ name: 'Snake-Eye' }, { name: 'Branded' }]
    const out = groupByInitial(items, a => a.name)
    expect(out.map(s => s.letter)).toEqual(['B', 'S'])
    expect(out[0].items[0].name).toBe('Branded')
  })

  it('emits no empty sections', () => {
    const out = groupByInitial(['Apple'])
    expect(out).toHaveLength(1)
    expect(out.every(s => s.items.length > 0)).toBe(true)
  })

  it('handles an absent list rather than throwing', () => {
    expect(groupByInitial(undefined)).toEqual([])
    expect(groupByInitial([])).toEqual([])
  })

  it('accounts for every archetype exactly once', () => {
    // The hub is the only page linking to all 529 spokes. A grouping bug that
    // silently drops one drops its only internal link with it.
    const out = groupByInitial(ARCHETYPES, a => a.name)
    const total = out.reduce((n, s) => n + s.items.length, 0)
    expect(total).toBe(ARCHETYPES.length)
    expect(new Set(out.flatMap(s => s.items.map(a => a.slug))).size).toBe(ARCHETYPES.length)
  })
})
