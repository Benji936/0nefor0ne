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
  const checks = [
    ['<title>', html.includes('<title>')],
    ['meta description', html.includes('name="description"')],
    ['canonical', html.includes('rel="canonical"')],
    ['hreflang', html.includes('hreflang=')],
    ['og:title', html.includes('og:title')],
    ['og:url', html.includes('og:url')],
    ...(type === 'card' ? [['json-ld', html.includes('application/ld+json')]] : []),
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
