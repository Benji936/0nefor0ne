/**
 * Grouping for the /en/sets and /en/archetypes hub pages.
 *
 * 559 set and archetype pages exist and nothing links to them from one place:
 * there is no /en/sets or /en/archetypes, so the only routes in are the sitemap
 * and whatever Google already knows. Spokes with no hub is the classic
 * programmatic-SEO failure — the pages carry no internal PageRank and the site
 * offers no term for "the set of all archetypes" to rank on.
 *
 * The grouping lives here rather than in the .vue files because it is the only
 * part with rules worth pinning: which bucket a name starting with a quote or a
 * hyphen lands in, and what order the buckets come out in.
 */

// Archetype names are not all alphabetic — the live list opens with `"C"` and
// `-Eyes Dragon`. Bucketing those under whatever character they happen to start
// with would scatter four entries across the punctuation range and produce
// single-item sections nobody can navigate to.
export const OTHER_BUCKET = '#'

/** The bucket a display name belongs in: its uppercased initial, or '#'. */
export function bucketOf(name) {
  const first = String(name ?? '').trim().charAt(0)
  return /[a-z]/i.test(first) ? first.toUpperCase() : OTHER_BUCKET
}

/**
 * Groups items into ordered alphabetical sections.
 *
 * '#' sorts first so the anchor nav reads "# A B C …" — putting it last would
 * strand it below 500-odd entries on a page whose whole job is to be navigable.
 *
 * @param {Array}    items
 * @param {Function} nameOf  item → its display name
 * @returns {Array<{ letter: string, items: Array }>} sections, empty ones dropped
 */
export function groupByInitial(items, nameOf = (x) => x) {
  const buckets = new Map()
  for (const item of items ?? []) {
    const letter = bucketOf(nameOf(item))
    if (!buckets.has(letter)) buckets.set(letter, [])
    buckets.get(letter).push(item)
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => {
      if (a === OTHER_BUCKET) return -1
      if (b === OTHER_BUCKET) return 1
      return a.localeCompare(b, 'en')
    })
    .map(([letter, group]) => ({
      letter,
      // Sorted on the name rather than the raw item so `-Eyes Dragon` and `"C"`
      // order by what the reader actually sees.
      items: group.sort((x, y) =>
        String(nameOf(x)).localeCompare(String(nameOf(y)), 'en', { sensitivity: 'base' })),
    }))
}
