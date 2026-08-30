/**
 * cardmarket-expansion-index.mjs
 *
 * Reads the expansion directory at /en/YuGiOh/Expansions into a list of
 * canonical expansion links. Pure: it takes rows already read out of a rendered
 * DOM, so it is testable against captured samples.
 *
 * What one row looks like
 * -----------------------
 *   <div class="row ... expansion-row"
 *        data-url="/en/YuGiOh/Expansions/Maze-of-Muertos"
 *        data-local-name="Maze of Muertos">
 *     <span class="expansion-symbol ..."><span>MZMU</span></span>
 *     <img alt="Pumpking the King of Grave Ghosts (V.2 - Collectors Rare)"
 *          data-echo=".../MZMU/873126/873126.jpg">
 *     <a href="/en/YuGiOh/Expansions/Maze-of-Muertos">Maze of Muertos</a>
 *     <div>142 Cards</div>
 *
 * Cardmarket does not publish idExpansion anywhere on this page -- checked, zero
 * data-id-expansion / data-expansion-id attributes across all 1,259 rows. So the
 * page cannot be joined to our catalogue on that key directly.
 *
 * It can be joined on something better than a name, though. Every populated row
 * carries a sample product image, and that image path contains a real
 * idProduct. We already store id_product -> id_expansion for all 86,507
 * products, so one lookup turns a slug into our own expansion id with no string
 * matching at all. That is why sampleProduct is extracted here and treated as
 * the primary key candidate: a name can be spelled two ways and a set code can
 * be absent, but a product id resolves or it does not.
 *
 * The slug is taken from data-url, never generated from the name. "Maze of
 * Muertos" happens to slugify to "Maze-of-Muertos", but that is a coincidence
 * of this row -- punctuation, accents and Cardmarket's own renames make
 * name-to-slug an unsafe transformation, and there is no need to guess when the
 * page states it.
 */

/**
 * `.../{n}/{SET}/{idProduct}/{idProduct}.jpg` — the id must appear twice.
 *
 * The set segment allows hyphens. Cardmarket's OCG expansions are coded
 * "UT01-JP", "26GE-JP" and so on, and a class of [A-Za-z0-9] silently dropped
 * 220 of 1,183 populated expansions — they looked like rows with no product
 * image rather than like a pattern that did not match.
 */
const PRODUCT_IMAGE =
  /product-images\.s3\.cardmarket\.com\/\d+\/([A-Za-z0-9-]+)\/(\d+)\/\2\.(?:jpg|png|webp)/;

/** "/en/YuGiOh/Expansions/Maze-of-Muertos" -> "Maze-of-Muertos" */
export function slugFromUrl(url) {
  const m = String(url ?? "").match(/\/Expansions\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * The Singles listing for an expansion, from its directory slug.
 *
 * A path substitution on a slug Cardmarket gave us, not a slug we invented.
 * Verified against MZMU, whose /Products/Singles/Maze-of-Muertos we have read
 * five pages of. The locale segment is preserved so a non-English caller keeps
 * its own.
 */
export function singlesUrlFromExpansionUrl(url) {
  const m = String(url ?? "").match(/^\/([a-z]{2})\/YuGiOh\/Expansions\/([^/?#]+)$/);
  return m ? `/${m[1]}/YuGiOh/Products/Singles/${m[2]}` : null;
}

/** The idProduct a sample image states, or null. */
export function sampleProductId(imageUrl) {
  const m = String(imageUrl ?? "").match(PRODUCT_IMAGE);
  return m ? Number(m[2]) : null;
}

/**
 * Read one directory row.
 *
 * `row` is { setCode, name, dataUrl, cardCountText, imageUrl } as scraped.
 * Returns null when the row cannot yield a usable link, rather than a partial
 * entry that looks usable until something dereferences it.
 */
export function readExpansionRow(row) {
  const slug = slugFromUrl(row?.dataUrl);
  if (!slug) return null;

  const singlesUrl = singlesUrlFromExpansionUrl(row.dataUrl);
  if (!singlesUrl) return null;

  const cards = Number(String(row?.cardCountText ?? "").replace(/[^\d]/g, ""));

  return {
    setCode: row?.setCode?.trim() || null,
    expansionName: row?.name?.trim() || null,
    slug,
    expansionUrl: row.dataUrl,
    singlesUrl,
    // Cardmarket does not publish it on this page. Kept in the shape so the
    // field exists the day they do, and so callers never have to wonder whether
    // its absence was an oversight here.
    idExpansion: null,
    cardCount: Number.isFinite(cards) ? cards : null,
    sampleProduct: sampleProductId(row?.imageUrl),
  };
}

/**
 * Read the whole directory.
 *
 * Returns { expansions, skipped, stats }. An empty expansion -- "0 Cards", no
 * sample image -- is kept: it is a real Cardmarket expansion that simply has no
 * singles yet, and dropping it here would make the count disagree with the page
 * for no reason. Callers that need a joinable row filter on sampleProduct.
 */
export function readExpansionIndex(rows) {
  const expansions = [];
  const skipped = [];
  for (const row of rows ?? []) {
    const out = readExpansionRow(row);
    if (out) expansions.push(out);
    else skipped.push({ reason: "no usable expansion URL", row });
  }
  return {
    expansions,
    skipped,
    stats: {
      total: expansions.length,
      withSetCode: expansions.filter((e) => e.setCode).length,
      withName: expansions.filter((e) => e.expansionName).length,
      withSinglesUrl: expansions.filter((e) => e.singlesUrl).length,
      withIdExpansion: expansions.filter((e) => e.idExpansion !== null).length,
      joinableByProduct: expansions.filter((e) => e.sampleProduct).length,
    },
  };
}
