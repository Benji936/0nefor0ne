/**
 * prune-sitemap.mjs — runs after vite-ssg build, before verify-ssg-output.
 *
 * Drops any <url> whose page is not in dist/, then writes the result to both
 * dist/sitemap.xml (what gets served) and public/sitemap.xml (the repo copy).
 *
 * Why this exists rather than just failing the build: card pages fetch from
 * db.ygoprodeck.com during prerender, and CardPage.vue deliberately throws on a
 * null response so vite-ssg skips that route (see the onServerPrefetch comment
 * there). A third-party timeout therefore drops a page that generate-sitemap.mjs
 * already committed to advertising. Failing the build on that would let someone
 * else's API outage block every deploy; pruning ships a slightly shorter sitemap
 * instead, which is the correct outcome — a <loc> pointing at a page that does
 * not exist is worse than no <loc> at all.
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
