import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { TOP_CARD_IDS } from '../src/data/card-ids.js'
import { TOP_SET_SLUGS } from '../src/data/set-slugs.js'
import { ARCHETYPES } from '../src/data/archetype-slugs.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '../dist')
// dist/sitemap.xml is the file that actually gets served, and the one
// prune-sitemap.mjs rewrites. public/ is the pre-build copy, checked only when
// verify is run on its own without a build.
const DIST_SITEMAP = resolve(DIST, 'sitemap.xml')
const SITEMAP = existsSync(DIST_SITEMAP) ? DIST_SITEMAP : resolve(__dirname, '../public/sitemap.xml')

// Sampled from what the build actually emitted, not from a hardcoded list and
// not from the manifest either.
//
// Hardcoding was the first mistake: the old sixteen were what vite.config.js
// used to prerender, and once the prerender list followed the live trending
// query, eleven stopped being built and this script called them missing when
// nothing was wrong. Reading the manifest was the second: it records what the
// build *meant* to emit, so a card legitimately skipped by vite-ssg after a
// ygoprodeck timeout would fail the build for a third party's outage. Whether
// every intended page exists is the sitemap invariant's job, below. These
// checks are about the quality of the pages that do.
function sampleCardIds(n) {
  try {
    return readdirSync(resolve(DIST, 'en/card')).sort().slice(0, n)
  } catch {
    try {
      return JSON.parse(readFileSync(resolve(__dirname, '../src/data/prerender-cards.generated.json'), 'utf8')).slice(0, n)
    } catch {
      return TOP_CARD_IDS.slice(0, n)
    }
  }
}

const ROUTES = [
  ...['/en/', '/fr/', '/de/', '/it/'].map(p => ({ path: p, type: 'home' })),
  ...['/en/privacy', '/fr/privacy', '/de/privacy', '/it/privacy'].map(p => ({ path: p, type: 'privacy' })),
  ...['/en/terms', '/fr/terms', '/de/terms', '/it/terms'].map(p => ({ path: p, type: 'terms' })),
  ...['/en/cards', '/fr/cards', '/de/cards', '/it/cards'].map(p => ({ path: p, type: 'cards' })),
  ...sampleCardIds(8).map(id => ({ path: `/en/card/${id}`, type: 'card' })),
  ...TOP_SET_SLUGS.slice(0, 3).map(s => ({ path: `/en/set/${encodeURIComponent(s)}`, type: 'set' })),
  ...ARCHETYPES.slice(0, 3).map(a => ({ path: `/en/archetype/${a.slug}`, type: 'archetype' })),
]

// Page types whose whole purpose is content a crawler can read. The skeleton
// bug these guard against rendered ~100 characters of nav chrome and no <h1>,
// while the title, description and JSON-LD stayed perfect — so every head-based
// check passed for as long as it existed.
const CONTENT_TYPES = new Set(['home', 'cards', 'privacy', 'terms', 'card', 'set', 'archetype'])
const MIN_BODY_CHARS = 200

// A string that must appear in the rendered <body> of each locale + page type.
//
// The title checks below all passed while /fr/, /de/ and /it/ were shipping an
// English body: titles resolve per-route with an explicit `locale` option, so
// they were never affected by the shared-i18n leak this guards against. Only a
// body assertion catches it. `home` and `privacy` are the two types that broke;
// `cards` is the control that did not.
// `privacy` and `terms` assert on their own <h1>, not on nav chrome. Their
// bodies stay English by design — see the englishNote in each page — so the
// heading and the note are the only translated copy they own, and matching
// chrome instead would have passed even if the pages rendered no policy at all.
const BODY_MARKERS = {
  home:    { fr: 'Échangez vos doublons',           de: 'Tausche Dubletten',        it: 'Scambia i doppioni' },
  privacy: { fr: 'Politique de confidentialité',    de: 'Datenschutzerklärung',     it: 'Informativa sulla privacy' },
  terms:   { fr: "Conditions d'utilisation",        de: 'Nutzungsbedingungen',      it: 'Termini di servizio' },
  cards:   { fr: 'Parcourir les cartes',            de: 'Karten durchsuchen',       it: 'Sfoglia carte' },
}

// The English hero copy. Its presence on a non-English page is the exact
// signature of the leak, whatever the page type.
const ENGLISH_HERO = 'Trade duplicates.'

/** Rendered body only: no <head>, and no <noscript> fallback (which is always English). */
function bodyOf(html) {
  const afterHead = html.split('</head>')[1] ?? ''
  return afterHead
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/g, ' ')
}

// With ssgOptions.dirStyle 'nested', every route is a directory holding an
// index.html — /en/ and /en/privacy alike. Vercel resolves those without the
// cleanUrls flag, which is the whole point of the nested layout.
function routeToFile(path) {
  return resolve(DIST, path.replace(/^\//, ''), 'index.html')
}

let pass = 0, fail = 0
for (const { path, type } of ROUTES) {
  const filePath = routeToFile(path)
  if (!existsSync(filePath)) {
    console.error(`MISSING: ${filePath}`)
    fail++; continue
  }
  const html = readFileSync(filePath, 'utf8')
  // Extract description content (handle both attribute orderings)
  const descMatch = html.match(/name="description"\s+content="([^"]*)"/) ||
                    html.match(/content="([^"]*)"\s+name="description"/)
  const descContent = descMatch ? descMatch[1] : ''

  // Non-English locale check: /fr/, /de/, /it/ home routes
  const localeMatch = path.match(/^\/(fr|de|it)\/$/)
  const locale = localeMatch ? localeMatch[1] : null

  // Same, but for any path shape — /fr/ and /fr/cards alike.
  const nonEnglish = (path.match(/^\/(fr|de|it)(\/|$)/) ?? [])[1] ?? null

  const checks = [
    ['<title>', html.includes('<title>')],
    ['meta description', html.includes('name="description"')],
    ['canonical', html.includes('rel="canonical"')],
    ['hreflang', html.includes('hreflang=')],
    ['og:title', html.includes('og:title')],
    ['og:url', html.includes('og:url')],
    // New assertion a: og:image present for all route types
    ['og:image', html.includes('og:image')],
    // New assertion b: non-empty description content
    ['non-empty description', descContent.length > 0],
    // New assertion c: non-English locale titles (only for /fr/, /de/, /it/ home)
    ...(locale ? [
      ...(locale === 'fr' ? [['title contains French keyword', html.includes('Échange')]] : []),
      ...(locale === 'de' ? [['title contains German keyword', html.includes('Tausch')]] : []),
      ...(locale === 'it' ? [['title contains Italian keyword', html.includes('Scambio')]] : []),
    ] : []),
    // Rendered content — the check the head assertions above cannot make. <h1>
    // is tested against the body specifically: index.html's <noscript> fallback
    // carries one, so `html.includes('<h1')` is true even for a blank page.
    ...(CONTENT_TYPES.has(type) ? (() => {
      const body = bodyOf(html)
      const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      return [
        ['<h1> in rendered body', /<h1[\s>]/.test(body)],
        [`body over ${MIN_BODY_CHARS} chars (got ${text.length})`, text.length > MIN_BODY_CHARS],
      ]
    })() : []),
    // Policy pages: fr/de/it must canonicalise to the English original and must
    // NOT advertise each other as alternates. Their bodies are identical English
    // legal text, so a self-canonical would submit four near-duplicates and let
    // Google pick which survives. This is easy to undo by accident, because the
    // rule lives in one regex in App.vue that reads like the English-only one
    // next to it — but that one is backed by a 301 and this one is not.
    ...((type === 'privacy' || type === 'terms') && nonEnglish ? [
      [`canonical points at /en/${type}`,
        html.includes(`rel="canonical" href="https://0nefor.one/en/${type}"`)],
      ['no fr/de/it hreflang alternates',
        !/hreflang="(fr|de|it)"/.test(html)],
    ] : []),
    // Archetype pages: the card list is the page, so assert the structured data
    // that describes it actually made it out.
    ...(type === 'archetype' ? (() => {
      const jld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      let items = 0
      for (const m of jld) {
        try {
          const s = JSON.parse(m[1])
          if (s['@type'] === 'CollectionPage') items = s.mainEntity?.numberOfItems ?? 0
        } catch { /* index.html's blocks are not all JSON-parseable in isolation */ }
      }
      return [
        ['json-ld CollectionPage with items', items > 0],
        ['canonical is /en/', /rel="canonical" href="https:\/\/0nefor\.one\/en\/archetype\//.test(html)],
      ]
    })() : []),
    // Body language — the check the title assertions above cannot make.
    ...(nonEnglish ? (() => {
      const body = bodyOf(html)
      const marker = BODY_MARKERS[type]?.[nonEnglish]
      return [
        [`html lang="${nonEnglish}"`, html.includes(`<html lang="${nonEnglish}"`)],
        ['body is not English hero copy', !body.includes(ENGLISH_HERO)],
        ...(marker ? [[`body contains ${nonEnglish} copy`, body.includes(marker)]] : []),
      ]
    })() : []),
    // Set page checks: H1, non-empty description, og:image, canonical, JSON-LD CollectionPage
    ...(type === 'set' ? (() => {
      const jldMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      let hasCollectionPage = false
      for (const match of jldMatches) {
        if (match[1].includes('"CollectionPage"')) hasCollectionPage = true
      }
      const ogImageMatch = html.match(/property="og:image"\s+content="([^"]*)"/) ||
                           html.match(/content="([^"]*)"\s+property="og:image"/)
      const ogImageContent = ogImageMatch ? ogImageMatch[1] : ''
      return [
        ['<h1', html.includes('<h1')],
        ['non-empty description', descContent.length > 0],
        ['og:image non-empty', ogImageContent.length > 0],
        ['canonical', html.includes('rel="canonical"')],
        ['json-ld', html.includes('application/ld+json')],
        ['json-ld CollectionPage', hasCollectionPage],
      ]
    })() : []),
    // New assertion d: no "price" in JSON-LD on card routes (scoped to Product schema only)
    ...(type === 'card' ? (() => {
      const jldMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      let productHasPrice = false
      for (const match of jldMatches) {
        try {
          const schema = JSON.parse(match[1])
          if (schema['@type'] === 'Product' && Array.isArray(schema.offers)) {
            productHasPrice = schema.offers.some(o => 'price' in o || 'priceCurrency' in o || 'availability' in o)
          }
        } catch {}
      }
      return [
        ['json-ld', html.includes('application/ld+json')],
        ['no price in json-ld', !productHasPrice],
      ]
    })() : []),
  ]
  const failed = checks.filter(([, ok]) => !ok)
  if (failed.length) {
    console.error(`FAIL ${path}: missing ${failed.map(([n]) => n).join(', ')}`)
    fail++
  } else {
    console.log(`PASS ${path}`)
    pass++
  }
}
console.log(`\nResult: ${pass} pass, ${fail} fail out of ${ROUTES.length} routes`)

// ── No prerendered page may be a loading skeleton ─────────────────────────────
//
// Sampling cannot find this. The per-route checks above test three archetypes;
// when 123 of 651 shipped as skeletons, all three sampled ones were fine and the
// build passed. So this walks everything.
//
// The failure it catches is specific and silent: a page whose <head> is perfect
// — title, description, canonical, JSON-LD all correct — above a body frozen in
// its loading state. It renders fine in a browser, because the client fetches on
// mount. Only a crawler sees the empty version.
let skeletons = 0
{
  const pages = []
  const walk = dir => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === 'index.html' && p !== resolve(DIST, 'index.html')) pages.push(p)
    }
  }
  // dist/index.html is excluded above on purpose: it IS the SPA shell, the
  // fallback vercel.json rewrites unprerendered routes to.
  walk(DIST)

  const bad = []
  for (const p of pages) {
    const html = readFileSync(p, 'utf8')
    const body = bodyOf(html)
    const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!/<h1[\s>]/.test(body) || text.length <= MIN_BODY_CHARS) {
      bad.push([p.slice(DIST.length), text.length])
    }
  }
  if (bad.length) {
    console.error(`\nFAIL skeletons: ${bad.length} of ${pages.length} prerendered pages have no <h1> or under ${MIN_BODY_CHARS} chars of body`)
    for (const [p, n] of bad.slice(0, 10)) console.error(`  ${p} — ${n} chars`)
    if (bad.length > 10) console.error(`  … and ${bad.length - 10} more`)
    // Say what to do about it. This check fired on `main` because ygoprodeck
    // stopped serving the "Sennet" archetype some time after
    // src/data/archetype-slugs.js was last generated, and the message named the
    // symptom ("102 chars") without naming the cause or the cure — so a red
    // build looked like a mystery in the page rather than staleness in a
    // generated file. The card API is upstream and it changes; expect this
    // again, and expect it to be the same fix.
    if (bad.some(([p]) => p.includes('/archetype/'))) {
      console.error(
        `\n  An archetype page renders empty when the card API no longer has that\n` +
        `  archetype. ARCHETYPES in src/data/archetype-slugs.js is the only gate on\n` +
        `  which pages exist, and it is generated, not live. Refresh it with:\n\n` +
        `      node scripts/build-archetype-slugs.mjs\n\n` +
        `  then check the diff: removals are fine (that URL is dead upstream),\n` +
        `  but a RENAMED slug breaks every inbound link and must not be committed.`,
      )
    }
    skeletons = bad.length
  } else {
    console.log(`Rendered: all ${pages.length} prerendered pages have a heading and body content`)
  }
}

// ── Every URL we submit to Google must be a page we actually built ────────────
//
// This is the invariant the whole SEO problem came down to. sitemap.xml listed
// 254 URLs and the build emitted 62 of them; the other 192 resolved to the SPA
// shell — one 7 kB page submitted to Google 192 times under the same title. The
// two lists are now generated from one query, and this asserts they stayed that
// way. It is a cheap check against an expensive, entirely invisible failure:
// nothing about the running site looks wrong when it breaks.
let drift = 0
try {
  const locs = [...readFileSync(SITEMAP, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
  const seen = new Set()
  const dupes = locs.filter(l => seen.has(l) || !seen.add(l))
  const missing = locs.filter(l => !existsSync(routeToFile(l.replace(/^https?:\/\/[^/]+/, ''))))

  if (missing.length) {
    console.error(`\nFAIL sitemap: ${missing.length} of ${locs.length} URLs have no page in dist/`)
    for (const m of missing.slice(0, 10)) console.error(`  ${m}`)
    if (missing.length > 10) console.error(`  … and ${missing.length - 10} more`)
    drift += missing.length
  }
  if (dupes.length) {
    console.error(`\nFAIL sitemap: ${dupes.length} duplicate <loc> entries, e.g. ${dupes[0]}`)
    drift += dupes.length
  }
  if (!drift) console.log(`Sitemap: all ${locs.length} URLs have a prerendered page, no duplicates`)
} catch (err) {
  console.error(`\nFAIL sitemap: could not read ${SITEMAP} — ${err.message}`)
  drift++
}

process.exit(fail > 0 || drift > 0 || skeletons > 0 ? 1 : 0)
