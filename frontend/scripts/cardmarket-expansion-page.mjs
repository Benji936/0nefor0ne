/**
 * cardmarket-expansion-page.mjs
 *
 * Reads product identity off a Cardmarket *expansion* listing page, rather than
 * one product page at a time.
 *
 * Why this exists
 * ---------------
 * Resolving identity product-by-product costs one navigation per idProduct.
 * 31,386 products sit in ambiguous printings, and the rate limit interrupted a
 * 50-product run five times. The expansion grid carries the same two facts in
 * one page:
 *
 *   <img alt="Pumpking the King of Grave Ghosts (V.1 - Secret Rare)"
 *        data-echo=".../MZMU/873125/873125.jpg">
 *
 * The image path gives the idProduct; the alt gives the version and rarity in
 * exactly the format the product page's own H1 uses. ~30 products per page.
 *
 * Two traps this module exists to avoid
 * -------------------------------------
 * 1. Lazy loading moves the URL. Cardmarket ships the path in `data-echo` and
 *    the browser rewrites it into `src` once the image loads, so a scan of a
 *    cold page and a scan of a warm one find it in different attributes. A
 *    reader that checks only one returns nothing half the time. Both are read.
 *
 * 2. Row order means nothing. idProduct is taken from the image URL or the row
 *    is skipped -- never from position, never from the price beside it. The
 *    doubled id in `.../{id}/{id}.jpg` is what makes the match safe: a stray
 *    number in a path cannot satisfy it.
 *
 * Pure: takes rows already read out of a rendered DOM and returns verdicts, so
 * it is testable against captured samples without a browser.
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

const TRAILING_PAREN = /^(.*?)\s*\(([^()]*)\)\s*$/;
const VERSION_AND_RARITY = /^V\.(\d{1,3})\s*[-–—]\s*(.+)$/i;
const VERSION_ONLY = /^V\.(\d{1,3})$/i;

/** Fold spelling so a slug, an alt and a stored name can be compared. */
export function slugKey(raw) {
  return String(raw ?? "")
    .normalize("NFKC")
    .replace(/[‐-―]/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The idProduct an image URL states, or null.
 *
 * Null rather than a guess: a row whose image does not match this shape is
 * skipped by the caller. There is no fallback to order or to the href, because
 * a slug can be shared across expansions while an image path cannot.
 */
export function idProductFromImage(url) {
  const m = String(url ?? "").match(PRODUCT_IMAGE);
  return m ? { set: m[1], idProduct: Number(m[2]) } : null;
}

/**
 * Split "Card Name (V.1 - Secret Rare)" into its parts.
 *
 * Same grammar as the product page's H1, deliberately: both surfaces are
 * rendered from the same underlying product, and one parser for both means one
 * place to fix when Cardmarket changes the wording.
 */
export function parseAlt(alt) {
  const text = String(alt ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const m = text.match(TRAILING_PAREN);
  if (!m) return { cardName: text, versionNo: null, versionLabel: null, rarity: null };

  const cardName = m[1].trim();
  const inner = m[2].trim();
  if (!cardName) return null;

  const vr = inner.match(VERSION_AND_RARITY);
  if (vr) return { cardName, versionNo: Number(vr[1]), versionLabel: inner, rarity: vr[2].trim() };

  const vo = inner.match(VERSION_ONLY);
  if (vo) return { cardName, versionNo: Number(vo[1]), versionLabel: inner, rarity: null };

  // "(Rarity)" with no version, or a bracket belonging to the card's own name.
  return { cardName, versionNo: null, versionLabel: inner, rarity: inner };
}

/**
 * Turn one scraped row into an identity, or explain why not.
 *
 * `row` is { imageUrl, alt, href } as read from the DOM. Confidence is 1.0 only
 * when the href slug independently corroborates the alt; a row with no href is
 * accepted at 0.9 because the image and the alt are still two separate
 * attributes agreeing, but it is marked so the caller can treat it differently.
 */
export function readRow(row) {
  const img = idProductFromImage(row?.imageUrl);
  if (!img) return { ok: false, reason: "no idProduct in image URL" };

  const parsed = parseAlt(row?.alt);
  if (!parsed) return { ok: false, reason: "unreadable alt", idProduct: img.idProduct };
  if (!parsed.versionNo && !parsed.rarity) {
    return {
      ok: true, single: true, confidence: 1.0,
      idProduct: img.idProduct, set: img.set, cardName: parsed.cardName,
      versionNo: null, versionLabel: null, rarity: null,
    };
  }

  // The slug repeats the identity: /Pumpking-the-King-of-Grave-Ghosts-V1-Secret-Rare
  let confidence = 0.9;
  if (row.href) {
    const tail = String(row.href).split("/").pop() ?? "";
    const expect = slugKey(parsed.cardName + (parsed.versionLabel ?? ""));
    const got = slugKey(tail);
    // Some slugs carry the rarity, some stop at the version ("...-V-1"), so
    // agreement means the slug is a prefix-consistent rendering, not an exact
    // string match.
    if (got && (slugKey(tail).startsWith(slugKey(parsed.cardName)) || expect.startsWith(got))) {
      confidence = 1.0;
    } else {
      return { ok: false, reason: `href "${tail}" does not match alt "${row.alt}"`, idProduct: img.idProduct };
    }
  }

  return {
    ok: true, single: false, confidence,
    idProduct: img.idProduct, set: img.set,
    cardName: parsed.cardName, versionNo: parsed.versionNo,
    versionLabel: parsed.versionLabel, rarity: parsed.rarity,
  };
}

/**
 * Read a whole page's rows, keeping the failures rather than dropping them.
 *
 * Returns { products, skipped }. `skipped` exists so a page whose markup has
 * changed shows up as a pile of refusals instead of as a quietly short list.
 */
export function readExpansionPage(rows) {
  const products = [];
  const skipped = [];
  for (const row of rows ?? []) {
    const out = readRow(row);
    if (out.ok) products.push(out);
    else skipped.push({ reason: out.reason, idProduct: out.idProduct ?? null, alt: row?.alt ?? null });
  }
  return { products, skipped };
}
