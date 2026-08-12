/**
 * build-archetype-slugs.mjs
 *
 * Turns the 651 archetype names in public/archetype-art.json into URL slugs and
 * writes src/data/archetype-slugs.js, which vite.config.js, generate-sitemap.mjs
 * and ArchetypePage.vue all read.
 *
 * Run by hand when archetype-art.json changes, not as part of the build:
 *
 *   node scripts/build-archetype-slugs.mjs
 *
 * The output is COMMITTED on purpose. These slugs are public URLs, and a URL
 * that changes is a URL that 404s for everyone who linked to it. Keeping the
 * generated file in git means any regeneration that would rename an existing
 * slug shows up as a diff you can refuse, rather than silently shipping.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ART = resolve(__dirname, '../public/archetype-art.json')
const OUT = resolve(__dirname, '../src/data/archetype-slugs.js')

// "." is dropped rather than hyphenated so that D.D. and D/D — two real and
// separately-searched archetypes — do not both become "d-d". They land on "dd"
// and "d-d" instead.
export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// Below this an archetype page is a stub: a heading, a card or two, and nothing
// a reader could not get from the card pages themselves. Google's helpful-content
// signal is site-wide, so stubs cost the pages that are good.
//
// This has to be decided HERE rather than at prerender time. ArchetypePage.vue
// throws from onServerPrefetch when it comes up short, and vite-ssg does NOT
// skip the route when that happens — it writes the page anyway, frozen in its
// loading state: no <h1>, ~100 characters of nav chrome. 123 of the first 651
// shipped that way. Everything downstream reads this file, so an archetype
// missing from it is never routed, never prerendered and never in the sitemap.
const MIN_CARDS = 3

// db.ygoprodeck.com 403s a bare Node/curl user-agent, which looks exactly like
// "no such archetype" — it briefly convinced me that 123 real archetypes were
// invalid names. Send a browser UA and throttle.
const UA = 'Mozilla/5.0 (compatible; 0nefor.one build script; +https://0nefor.one)'
const CONCURRENCY = 4
const RETRIES = 3

async function cardCount(name) {
  const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?archetype=${encodeURIComponent(name)}`
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      // 400 is this API's "archetype matched nothing"; anything else retries.
      if (res.status === 400) return 0
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      return body?.data?.length ?? 0
    } catch (err) {
      if (attempt === RETRIES) {
        // Counted as unknown, not as zero: dropping a real archetype because the
        // API had a bad minute would delete a live URL.
        console.warn(`  ${name}: ${err.message} after ${RETRIES} tries — keeping it`)
        return null
      }
      await new Promise(r => setTimeout(r, 400 * attempt))
    }
  }
}

async function countAll(names) {
  const counts = new Map()
  let done = 0
  const queue = [...names]
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const name = queue.shift()
      counts.set(name, await cardCount(name))
      if (++done % 100 === 0) console.log(`  …${done}/${names.length}`)
    }
  }))
  return counts
}

const art = JSON.parse(readFileSync(ART, 'utf8'))

// Sorted so the assignment below is a pure function of the input file: the same
// archetype-art.json always produces the same slugs, in the same order.
const allNames = Object.keys(art).sort()

console.log(`Counting cards for ${allNames.length} archetypes (${CONCURRENCY} at a time)…`)
const counts = await countAll(allNames)

const dropped = allNames.filter(n => counts.get(n) !== null && counts.get(n) < MIN_CARDS)
const names = allNames.filter(n => !dropped.includes(n))

const taken = new Map()
const entries = []
const collisions = []

for (const name of names) {
  const base = slugify(name)
  if (!base) {
    console.warn(`  skipping ${JSON.stringify(name)} — slugifies to nothing`)
    continue
  }
  let slug = base
  // The survivors are case-only pairs (roid/Roid, sphinx/Sphinx,
  // tellarknight/Tellarknight) which are genuinely different archetypes that a
  // lowercase slug cannot tell apart, plus "Assault Mode" vs "/Assault Mode".
  // First alphabetically keeps the bare slug; the rest are numbered.
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
  if (slug !== base) collisions.push([name, slug, taken.get(base)])
  taken.set(slug, name)
  entries.push({ slug, name, artId: art[name], cards: counts.get(name) })
}

const body = entries
  .map(e => `  { slug: ${JSON.stringify(e.slug)}, name: ${JSON.stringify(e.name)}, artId: ${e.artId}, cards: ${e.cards ?? 'null'} },`)
  .join('\n')

writeFileSync(OUT, `// GENERATED by scripts/build-archetype-slugs.mjs — do not edit by hand.
//
// Source: public/archetype-art.json — ${allNames.length} archetypes, of which
// ${dropped.length} were dropped for having fewer than ${MIN_CARDS} cards, leaving ${entries.length}.
// \`artId\` is the card whose art represents the archetype, used as the og:image
// and hero image on /en/archetype/:slug. \`cards\` is the count at generation
// time (null = the API could not be reached and the archetype was kept).
//
// This list is the ONLY gate on which archetype pages exist. Throwing from
// ArchetypePage.vue's onServerPrefetch does not make vite-ssg skip a route — it
// writes the page in its loading state instead — so an archetype that should
// not have a page must not appear here.
//
// Slugs are live URLs. Regenerating is fine; a diff that RENAMES an existing
// slug is not — that breaks every inbound link to the old one. Check the diff.
export const ARCHETYPES = [
${body}
];

export const ARCHETYPE_BY_SLUG = new Map(ARCHETYPES.map(a => [a.slug, a]));
`, 'utf8')

console.log(`Wrote ${OUT}`)
console.log(`  ${entries.length} archetypes kept, ${dropped.length} dropped under the ${MIN_CARDS}-card floor`)
console.log(`  ${collisions.length} slug collision(s) disambiguated`)
for (const [name, slug, heldBy] of collisions) {
  console.log(`    ${JSON.stringify(name)} → ${slug}  (base taken by ${JSON.stringify(heldBy)})`)
}
