import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the API module so resolution is deterministic and offline.
vi.mock('@/api', () => ({
  searchCardByName: vi.fn(),
  searchCardBySetCode: vi.fn(),
  searchById: vi.fn(),
}))

import { searchCardByName, searchCardBySetCode, searchById } from '@/api'
import {
  resolveLine,
  resolveLines,
  buildRow,
  sanitizeRows,
  chunk,
} from './bulkAddResolver.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveLine — set-code routing', () => {
  it('routes a set code through searchCardBySetCode -> searchById and marks matched', async () => {
    searchCardBySetCode.mockResolvedValue({ data: { id: 89631139 } })
    searchById.mockResolvedValue({ data: { data: [{ id: 89631139, name: 'Blue-Eyes White Dragon' }] } })

    const row = await resolveLine({ qty: 1, query: 'SDCB-EN001' })

    expect(searchCardBySetCode).toHaveBeenCalledWith('SDCB-EN001')
    expect(searchById).toHaveBeenCalledWith(89631139)
    expect(searchCardByName).not.toHaveBeenCalled()
    expect(row.status).toBe('matched')
    expect(row.card?.id).toBe(89631139)
    expect(row.selected?.id).toBe(89631139)
  })

  it('marks unmatched when the set code resolves to no id', async () => {
    searchCardBySetCode.mockResolvedValue(null)
    const row = await resolveLine({ qty: 1, query: 'ZZZZ-EN999' })
    expect(row.status).toBe('unmatched')
    expect(searchById).not.toHaveBeenCalled()
  })
})

describe('resolveLine — name routing & exact-match gating', () => {
  it('single result -> matched', async () => {
    searchCardByName.mockResolvedValue({ data: { data: [{ id: 1, name: 'Maxx "C"' }] } })
    const row = await resolveLine({ qty: 2, query: 'Maxx "C"' })
    expect(searchCardBySetCode).not.toHaveBeenCalled()
    expect(row.status).toBe('matched')
    expect(row.card?.id).toBe(1)
  })

  it('multiple results with an exact (case-insensitive) name match -> matched', async () => {
    searchCardByName.mockResolvedValue({
      data: {
        data: [
          { id: 10, name: 'Dark Magician Girl' },
          { id: 11, name: 'Dark Magician' },
        ],
      },
    })
    const row = await resolveLine({ qty: 1, query: 'dark magician' })
    expect(row.status).toBe('matched')
    expect(row.card?.id).toBe(11)
  })

  it('multiple genuine candidates with no exact match -> ambiguous', async () => {
    searchCardByName.mockResolvedValue({
      data: {
        data: [
          { id: 20, name: 'Elemental HERO Neos' },
          { id: 21, name: 'Elemental HERO Sparkman' },
        ],
      },
    })
    const row = await resolveLine({ qty: 1, query: 'Elemental HERO' })
    expect(row.status).toBe('ambiguous')
    expect(row.candidates).toHaveLength(2)
    expect(row.card).toBeNull()
  })

  it('no results -> unmatched', async () => {
    searchCardByName.mockResolvedValue({ data: [] })
    const row = await resolveLine({ qty: 1, query: 'asdkjhasd' })
    expect(row.status).toBe('unmatched')
  })

  it('handles the error-path response shape (response.data is the array)', async () => {
    searchCardByName.mockResolvedValue({ data: [{ id: 5, name: 'Pot of Greed' }] })
    const row = await resolveLine({ qty: 1, query: 'Pot of Greed' })
    expect(row.status).toBe('matched')
    expect(row.card?.id).toBe(5)
  })
})

describe('resolveLines — sequential ordering', () => {
  it('resolves one line at a time (never concurrently)', async () => {
    let active = 0
    let maxActive = 0
    searchCardByName.mockImplementation(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return { data: { data: [{ id: 1, name: 'X' }] } }
    })

    const progress = []
    const rows = await resolveLines(
      [
        { qty: 1, query: 'a' },
        { qty: 1, query: 'b' },
        { qty: 1, query: 'c' },
      ],
      { onProgress: (cur, total) => progress.push([cur, total]) }
    )

    expect(rows).toHaveLength(3)
    expect(maxActive).toBe(1) // never more than one in flight
    expect(progress).toEqual([[1, 3], [2, 3], [3, 3]])
  })
})

describe('resolveLine — transient retry', () => {
  it('retries once on a Network Error then succeeds', async () => {
    searchCardByName
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({ data: { data: [{ id: 7, name: 'Raigeki' }] } })

    const onRetry = vi.fn()
    const row = await resolveLine({ qty: 1, query: 'Raigeki' }, { onRetry })

    expect(searchCardByName).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(row.status).toBe('matched')
    expect(row.card?.id).toBe(7)
  })
})

describe('buildRow', () => {
  it('produces the full Card insert shape with extension:"" / rarity:"common"', () => {
    const row = buildRow({
      card: { id: 42, name: 'Ash Blossom & Joyous Spring', name_en: 'Ash Blossom & Joyous Spring' },
      qty: 3,
      isWish: false,
      userId: 'user-123',
    })
    expect(row).toEqual({
      wish: false,
      game: 'YGO',
      url: 'https://db.ygoprodeck.com/api/v7/cardinfo.php?name=Ash Blossom & Joyous Spring',
      name: 'Ash Blossom & Joyous Spring',
      extension: '',
      rarity: 'common',
      quantity: 3,
      trader: 'user-123',
      image_id: 42,
      language: 'English',
      condition: 'Near Mint',
      first_edition: false,
    })
    expect(row.extension).toBe('')
    expect(row.rarity).toBe('common')
  })

  it('falls back to card.name when name_en is absent and honours the wish flag', () => {
    const row = buildRow({ card: { id: 9, name: 'Maxx "C"' }, qty: 1, isWish: true, userId: 'u' })
    expect(row.name).toBe('Maxx "C"')
    expect(row.wish).toBe(true)
  })
})

describe('sanitizeRows', () => {
  it('repairs null extension/rarity in place', () => {
    const rows = [
      { extension: null, rarity: null },
      { extension: 'SET-001', rarity: 'rare' },
      { extension: undefined, rarity: undefined },
    ]
    const out = sanitizeRows(rows)
    expect(out).toBe(rows) // same array returned
    expect(out[0]).toEqual({ extension: '', rarity: 'common' })
    expect(out[1]).toEqual({ extension: 'SET-001', rarity: 'rare' })
    expect(out[2]).toEqual({ extension: '', rarity: 'common' })
  })
})

describe('chunk', () => {
  it('splits at 500 by default', () => {
    const arr = Array.from({ length: 1250 }, (_, i) => i)
    const chunks = chunk(arr)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toHaveLength(500)
    expect(chunks[1]).toHaveLength(500)
    expect(chunks[2]).toHaveLength(250)
  })

  it('respects a custom size and handles an exact multiple', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
    expect(chunk([], 500)).toEqual([])
  })
})
