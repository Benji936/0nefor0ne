import { describe, it, expect } from 'vitest'
import { sitemapVerdict, MIN_CARDS } from './sitemapGuard.js'

// ---------------------------------------------------------------------------
// The failure this guards is silent by construction: generate-sitemap.mjs
// catches every Supabase error and degrades to 16 checked-in card IDs, so a
// broken build and a healthy one both exit 0. These tests pin the one rule that
// makes the difference visible — CI stops, everywhere else only complains.
// ---------------------------------------------------------------------------
describe('sitemapVerdict', () => {
  it('says nothing about a healthy run', () => {
    expect(sitemapVerdict({ cardCount: 200, limit: 200, isCI: true }))
      .toEqual({ fatal: false, reason: null })
  })

  it('fails the build in CI when the fetch fell back', () => {
    const v = sitemapVerdict({ degraded: true, cardCount: 16, limit: 200, isCI: true })
    expect(v.fatal).toBe(true)
    expect(v.reason).toContain('card-ids.js')
  })

  it('only warns outside CI, so a laptop with no network still builds', () => {
    const v = sitemapVerdict({ degraded: true, cardCount: 16, limit: 200, isCI: false })
    expect(v.fatal).toBe(false)
    expect(v.reason).toContain('card-ids.js')
  })

  it('catches a thin result that never hit the fallback', () => {
    // The 593-URL incident came through the fallback, but a query that succeeds
    // and returns three rows produces the same broken sitemap with no flag set.
    const v = sitemapVerdict({ degraded: false, cardCount: 3, limit: 200, isCI: true })
    expect(v.fatal).toBe(true)
    expect(v.reason).toContain('under the floor')
  })

  it('does not punish a deliberately small --limit run', () => {
    // `--limit=10` asked for 10 and got 10. Measuring that against MIN_CARDS
    // would fail every small run for doing exactly what it was told.
    expect(sitemapVerdict({ cardCount: 10, limit: 10, isCI: true }))
      .toEqual({ fatal: false, reason: null })
  })

  it('still catches a small run that came up short of its own limit', () => {
    const v = sitemapVerdict({ cardCount: 2, limit: 10, isCI: true })
    expect(v.fatal).toBe(true)
  })

  it('--allow-degraded downgrades a CI failure to a warning', () => {
    const v = sitemapVerdict({ degraded: true, cardCount: 16, limit: 200, isCI: true, allowDegraded: true })
    expect(v.fatal).toBe(false)
    expect(v.reason).toBeTruthy()
  })

  it('reports the reason even when it is not fatal, so the warning can say why', () => {
    expect(sitemapVerdict({ degraded: true, cardCount: 16, limit: 200 }).reason).toBeTruthy()
  })

  it('treats a missing argument list as a broken run, not a healthy one', () => {
    // Defaulting cardCount to 0 must land on the failing side of the floor:
    // a caller that forgets to pass anything should not be told all is well.
    expect(sitemapVerdict().reason).toBeTruthy()
  })

  it('keeps the floor clear of the 16-ID fallback', () => {
    expect(MIN_CARDS).toBeGreaterThan(16)
  })
})
