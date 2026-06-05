import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '../dist')

const ROUTES = [
  ...['/en/', '/fr/', '/de/', '/it/'].map(p => ({ path: p, type: 'home' })),
  ...['/en/privacy', '/fr/privacy', '/de/privacy', '/it/privacy'].map(p => ({ path: p, type: 'privacy' })),
  ...[10966439, 18711696, 19144622, 27632520, 31533473, 38811586, 4026187, 54077752, 57847269, 69140098, 70088809, 81684048, 83232904, 91237821, 96334243, 98829635]
    .map(id => ({ path: `/en/card/${id}`, type: 'card' }))
]

// vite-ssg emits /en/index.html for /en/ and /en/privacy.html for /en/privacy
function routeToFile(path) {
  // trailing slash → index.html
  if (path.endsWith('/')) return resolve(DIST, path.replace(/^\//, ''), 'index.html')
  // no trailing slash → <path>.html
  return resolve(DIST, path.replace(/^\//, '') + '.html')
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
      [`html lang="${locale}"`, html.includes(`<html lang="${locale}"`)],
      ...(locale === 'fr' ? [['title contains French keyword', html.includes('Échange')]] : []),
      ...(locale === 'de' ? [['title contains German keyword', html.includes('Tausch')]] : []),
      ...(locale === 'it' ? [['title contains Italian keyword', html.includes('Scambio')]] : []),
    ] : []),
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
process.exit(fail > 0 ? 1 : 0)
