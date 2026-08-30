/**
 * cardmarket-identity.mjs
 *
 * Turns what a Cardmarket product page states into the identity columns on
 * cardmarket_product. Pure: it takes fields already read off a rendered page and
 * returns a verdict. It does no fetching, so it can be tested against captured
 * samples rather than against the live site.
 *
 * Why this exists
 * ---------------
 * The daily catalogue carries no rarity and no version -- a singles record is
 * idProduct, name, idCategory, categoryName, idExpansion, idMetacard, dateAdded.
 * The product page carries both, in two independent places:
 *
 *   <h1>Card Trooper (V.2 - Mosaic Rare)<span>Battle Pack 2: ...</span></h1>
 *   <dt>Rarity</dt><dd><svg aria-label="Mosaic Rare">
 *
 * Confirmed on idProduct 262487, 2026-08-24. Note the document *title* says only
 * "Card Trooper (V.2) (BP02)" -- version without rarity -- so a parser built on
 * the title silently loses the rarity on every product. The heading is the
 * source; the aria-label is the check.
 *
 * The rule everywhere here: state, or say you do not know. A page that does not
 * fit a known shape produces `ok: false` with a reason, and the caller queues it
 * for a human. Nothing is inferred from id order, price, dateAdded or position.
 */

/**
 * The parenthetical Cardmarket appends to a product name.
 *
 * Deliberately anchored to the end of the string and non-greedy on the name, so
 * a card whose own name contains brackets keeps them. "(V.2 - Mosaic Rare)",
 * "(V.2)" and "(Mosaic Rare)" all match; the pieces are sorted out below.
 */
const TRAILING_PAREN = /^(.*?)\s*\(([^()]*)\)\s*$/;
const VERSION_AND_RARITY = /^V\.(\d{1,3})\s*[-–—]\s*(.+)$/i;
const VERSION_ONLY = /^V\.(\d{1,3})$/i;

/** Compare two rarity spellings the way the database's rarity_key() does. */
export function rarityKey(raw) {
  if (raw === null || raw === undefined) return null;
  return String(raw).normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "") || null;
}

/**
 * Normalise a card name for comparison against what we already hold.
 *
 * Cardmarket writes the same card two ways -- "Magician of Dark Chaos – Black
 * Chaos" with an en-dash sits beside two hyphenated siblings under one
 * idMetacard -- so dash variants have to compare equal or every one of those
 * products would fail validation against its own catalogue row.
 */
export function nameKey(raw) {
  return String(raw ?? "")
    .normalize("NFKC")
    .replace(/[‐-―]/g, "-")   // hyphen, non-breaking hyphen, en/em dash
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Read identity out of one product page's fields.
 *
 * `h1Text` must be the heading's own text, without the expansion sub-heading
 * Cardmarket nests inside it as a <span>. `rarityLabel` is the aria-label on the
 * Rarity row's icon, and is optional -- when present it is used as a second
 * opinion, never as the primary source.
 *
 * Returns either
 *   { ok: true,  cardName, versionNo, versionLabel, rarity }
 * or
 *   { ok: false, reason, cardName? }
 *
 * versionNo may be null on an ok result: a product labelled "(Mosaic Rare)" with
 * no V-number is fully identified by its rarity, and refusing it would leave a
 * resolvable printing unresolved forever.
 */
export function parseIdentity({ h1Text, rarityLabel = null, title = null } = {}) {
  const heading = String(h1Text ?? "").replace(/\s+/g, " ").trim();
  if (!heading) return { ok: false, reason: "no heading on page" };

  const m = heading.match(TRAILING_PAREN);
  if (!m) {
    // A product with no parenthetical is not a versioned printing. That is a
    // real state, not a parse failure, but it cannot break a tie either.
    return { ok: false, reason: "heading has no (...) suffix", cardName: heading };
  }

  const cardName = m[1].trim();
  const inner = m[2].trim();
  if (!cardName) return { ok: false, reason: "heading is only a suffix" };

  let versionNo = null;
  let rarity = null;

  const vr = inner.match(VERSION_AND_RARITY);
  const vo = inner.match(VERSION_ONLY);
  if (vr) {
    versionNo = Number(vr[1]);
    rarity = vr[2].trim();
  } else if (vo) {
    versionNo = Number(vo[1]);
    rarity = rarityLabel ? String(rarityLabel).trim() : null;
  } else {
    // "(Mosaic Rare)" -- a rarity with no version number.
    rarity = inner;
  }

  if (versionNo !== null && !(versionNo > 0)) {
    return { ok: false, reason: `version number out of range: ${inner}`, cardName };
  }

  // The two sources have to agree. A heading saying Mosaic Rare over an icon
  // saying Common means the page is not what this parser thinks it is.
  if (rarity && rarityLabel && rarityKey(rarity) !== rarityKey(rarityLabel)) {
    return {
      ok: false,
      reason: `heading rarity "${rarity}" disagrees with icon "${rarityLabel}"`,
      cardName,
    };
  }

  if (!rarity && versionNo === null) {
    return { ok: false, reason: `suffix "${inner}" is neither version nor rarity`, cardName };
  }

  return {
    ok: true,
    cardName,
    versionNo,
    versionLabel: inner,
    rarity: rarity || null,
  };
}

/**
 * Does this page describe the product we asked for?
 *
 * Cardmarket redirects idProduct to a slug URL, so the only guard against
 * landing somewhere else is checking what came back. Both the card name and the
 * expansion have to line up with the catalogue row before an identity is
 * written against it.
 */
export function validatePage({
  parsed, expectedName, finalUrl, pageText = "",
  expansionName = null, expectedExpansionName = null,
} = {}) {
  if (!parsed?.ok) return { ok: false, reason: parsed?.reason ?? "unparsed" };

  if (nameKey(parsed.cardName) !== nameKey(expectedName)) {
    return {
      ok: false,
      reason: `page card "${parsed.cardName}" is not "${expectedName}"`,
    };
  }

  // Every product of one printing is in one expansion, by definition. If a
  // redirect lands somewhere else this is what catches it -- the card name
  // alone would not, because the same card exists in many sets.
  if (expectedExpansionName && expansionName
      && nameKey(expansionName) !== nameKey(expectedExpansionName)) {
    return {
      ok: false,
      reason: `page expansion "${expansionName}" is not "${expectedExpansionName}"`,
    };
  }

  // A block or challenge page has no product heading, so parseIdentity would
  // already have refused it -- but check explicitly, because a challenge that
  // happens to carry a heading must never be written to the database.
  if (/just a moment|attention required|access denied|you have been blocked/i.test(pageText)) {
    return { ok: false, reason: "challenge or block page" };
  }

  if (!finalUrl || !/^https:\/\/www\.cardmarket\.com\/[a-z]{2}\/YuGiOh\/Products\/Singles\//i.test(finalUrl)) {
    return { ok: false, reason: `unexpected final URL: ${finalUrl}` };
  }

  return { ok: true };
}
