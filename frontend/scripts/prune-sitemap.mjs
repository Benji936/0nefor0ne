/**
 * prune-sitemap.mjs — runs after vite-ssg build, before verify-ssg-output.
 *
 * Drops any <url> whose page is not in dist/, then writes the result to both
 * dist/sitemap.xml (what gets served) and public/sitemap.xml (the repo copy).
 *
 * Why this exists rather than just failing the build: a third-party API having a
 * bad minute must not block every deploy. A <loc> pointing at a page that does
 * not exist is worse than no <loc> at all, so a shorter sitemap is the right
 * outcome.
 *
 * Note what this does NOT catch. Throwing from onServerPrefetch does not make
 * vite-ssg skip a route — it writes the page anyway, in its loading state — so a
 * failed prefetch produces a file that exists and is empty, which looks fine
 * from here. The skeleton scan in verify-ssg-output.mjs is what catches that;
 * this only removes URLs with no file at all.
 *
 * verify-ssg-output.mjs asserts the invariant afterwards, so if this ever stops
 * working the build still fails rather than quietly submitting phantom URLs.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '../dist')
const PUBLIC_SITEMAP = resolve(__dirname, '../public/sitemap.xml')
const DIST_SITEMAP = resolve(DIST, 'sitemap.xml')

const source = existsSync(DIST_SITEMAP) ? DIST_SITEMAP : PUBLIC_SITEMAP
const xml = readFileSync(source, 'utf8')

// Every route is a directory holding an index.html — see ssgOptions.dirStyle.
const pageExists = loc =>
  existsSync(resolve(DIST, loc.replace(/^https?:\/\/[^/]+\//, ''), 'index.html'))

const seen = new Set()
const dropped = []

// <url> blocks are emitted one per entry by generate-sitemap.mjs; keep the
// surrounding document (header comment, urlset, namespaces) exactly as-is.
const pruned = xml.replace(/\n  <url>[\s\S]*?<\/url>/g, block => {
  const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1]
  if (!loc) return block
  if (seen.has(loc)) { dropped.push([loc, 'duplicate']); return '' }
  seen.add(loc)
  if (!pageExists(loc)) { dropped.push([loc, 'no page in dist/']); return '' }
  return block
})

writeFileSync(DIST_SITEMAP, pruned, 'utf8')
writeFileSync(PUBLIC_SITEMAP, pruned, 'utf8')

const kept = seen.size - dropped.filter(([, why]) => why !== 'duplicate').length
if (dropped.length) {
  console.log(`Pruned ${dropped.length} URL(s) from sitemap.xml, ${kept} remain:`)
  for (const [loc, why] of dropped.slice(0, 10)) console.log(`  ${loc} — ${why}`)
  if (dropped.length > 10) console.log(`  … and ${dropped.length - 10} more`)
} else {
  console.log(`Sitemap: ${kept} URLs, nothing to prune`)
}
