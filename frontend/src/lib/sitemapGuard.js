/**
 * Decides whether a degraded sitemap run should stop the build.
 *
 * generate-sitemap.mjs deliberately never throws: every Supabase failure
 * degrades to the 16 IDs in src/data/card-ids.js, on the reasoning that "a
 * stale sitemap is a minor SEO problem; a failed build is an outage."
 *
 * That reasoning holds locally and inverts on Vercel. A failed build there is
 * not an outage — Vercel keeps serving the last successful deployment, so the
 * live site keeps its correct sitemap and its 771 URLs. A *successful* build on
 * the fallback path is the damaging outcome: it publishes a sitemap missing
 * ~180 card URLs and, because the same list feeds
 * src/data/prerender-cards.generated.json, it also stops those card pages being
 * prerendered at all. That has happened — a `TypeError: fetch failed` took the
 * sitemap from 771 URLs to 593 with nothing but a console.warn to show for it.
 *
 * So: shout locally, stop in CI.
 */

// Well clear of the 16-ID fallback and well under a healthy ~200-card run, so
// it separates the two without tracking either number exactly.
export const MIN_CARDS = 50

/**
 * @param {object}  o
 * @param {boolean} o.degraded      the Supabase path fell back to card-ids.js
 * @param {number}  o.cardCount     unique cards this run produced
 * @param {number}  o.limit         the run's --limit, so a deliberately small
 *                                  run is not mistaken for a broken one
 * @param {boolean} o.isCI          true on Vercel / CI
 * @param {boolean} o.allowDegraded explicit --allow-degraded escape hatch
 * @returns {{ fatal: boolean, reason: string|null }}
 */
export function sitemapVerdict({
  degraded = false,
  cardCount = 0,
  limit = 200,
  isCI = false,
  allowDegraded = false,
} = {}) {
  // `--limit=10` is a legitimate thing to run; the floor must not punish it.
  const floor = Math.min(MIN_CARDS, limit)
  const thin = cardCount < floor

  if (!degraded && !thin) return { fatal: false, reason: null }

  // A successful query that returns almost nothing is as broken as a failed
  // one, and only the count can see it — hence both conditions, not just the
  // fallback flag.
  const reason = degraded
    ? `the Supabase fetch fell back to src/data/card-ids.js (${cardCount} cards)`
    : `only ${cardCount} cards came back, under the floor of ${floor}`

  return { fatal: isCI && !allowDegraded, reason }
}
