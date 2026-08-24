/**
 * cardmarket-rarity.mjs
 *
 * Groups Cardmarket products into printings, and names a printing's rarity in
 * the one case where that can be read rather than inferred.
 *
 * What the catalogue actually contains
 * ------------------------------------
 * A singles record has seven fields and no more:
 *
 *   idProduct, name, idCategory, categoryName, idExpansion, idMetacard, dateAdded
 *
 * There is no rarity, and no version. The "(V.5 - Quarter Century Secret Rare)"
 * shown on cardmarket.com is rendered by the website; it is not in the file.
 * Checked 2026-08-24: 0 of 86,507 product names contain "(V.". The only other
 * public files are products_nonsingles_3.json and price_guide_3.json, neither of
 * which carries rarity either -- every other path under productCatalog/ answers
 * 403.
 *
 * So RA02 files seven rows all named exactly "Purrely", and nothing in the data
 * says which is the Super and which is the Quarter Century.
 *
 * What this module deliberately does NOT do
 * -----------------------------------------
 * It does not guess. In particular it never uses, as a signal for which variant
 * a product is:
 *
 *   - the order products appear in the JSON array
 *   - idProduct numeric order
 *   - dateAdded order
 *   - price order
 *   - any global "V.1 is always Super Rare" assumption
 *
 * An earlier version of this file did exactly that, via a canonical rarity
 * ladder zipped against idProduct order. The evidence for it was genuinely
 * strong -- 93% of seven-product groups peak in price at the fifth id, and the
 * six-rarity variants peak one position earlier as a restricted order predicts.
 * It was still an inference dressed as a fact, and the thing being inferred is
 * the difference between a 0.21 EUR card and a 5.62 EUR one. Strong evidence is
 * not the same as metadata, and a price the app presents as certain should rest
 * on the second.
 *
 * The consequence is that a card printed at several rarities in one set stays a
 * band until its owner points at the product they hold. That is what
 * Card.cardmarket_product_id is for, and an owner pointing at their own copy is
 * better evidence than any ordering heuristic could have been.
 */

/**
 * Collapse a rarity to a comparison key: lowercase, no punctuation, no spaces.
 *
 * The same rule as rarity_key() in the database and rarityKey() in
 * src/lib/printings.js, so a string written by one matches a string read by
 * another. It absorbs the real inconsistencies in the source data --
 * "Collector's Rare" against "Collectors Rare", and YGOPRODeck's own
 * "PLatinum Secret Rare", which is 80 of its 81 RA05 rows.
 *
 * It does not absorb differences that might be a different product. "Secret
 * Rare", "Prismatic Secret Rare" and "Extra Secret Rare" stay three keys.
 */
export function rarityKey(raw) {
  if (raw === null || raw === undefined) return null;
  const k = String(raw)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z0-9]/g, "");
  return k || null;
}

/**
 * Spellings worth normalising, because the same rarity is written two ways by
 * two sources. Anything not listed keeps its own wording -- inventing a house
 * spelling for "Duel Terminal Normal Parallel Rare" helps nobody.
 */
const DISPLAY = new Map([
  ["platinumsecretrare", "Platinum Secret Rare"],
  ["collectorsrare", "Collector's Rare"],
  ["quartercenturysecretrare", "Quarter Century Secret Rare"],
]);

/**
 * Things YGOPRODeck files under set_rarity that are not rarities.
 *
 * Taken from the 48 distinct values in cardinfo.php on 2026-08-24, not guessed:
 * printing notes ("New", "Reprint", "New artwork"), release notes ("European
 * debut"), bare numbers, and two one-off strings. "Cr" is almost certainly
 * Collector's Rare and is still dropped -- guessing a rarity from two letters
 * is how a 40 cent card gets quoted at 300 EUR.
 */
const NOT_A_RARITY = new Set([
  "2", "3", "new", "reprint", "newartwork",
  "europeandebut", "oceaniandebut", "europeanoceaniandebut",
  "cr", "forcesmw",
]);

/** The spelling to store for a rarity, or null if it is not one. */
export function displayRarity(raw) {
  const key = rarityKey(raw);
  if (!key || NOT_A_RARITY.has(key)) return null;
  return DISPLAY.get(key) ?? String(raw).normalize("NFKC").replace(/\s+/g, " ").trim();
}

/**
 * Group products into printings, keyed by (idExpansion, idMetacard).
 *
 * idMetacard is Cardmarket's own card identity and is the right key precisely
 * because it survives Cardmarket correcting its own spelling: 61 metacards
 * carry two names, so "Fairy Tale Tails" and "Fairy Tail Tales" are one card
 * filed twice, and CORI's "Magician of Dark Chaos – Black Chaos" differs from
 * its siblings by an en-dash. Grouping by name prices those as separate cards.
 *
 * idExpansion restricts the group to one set, so the same card in two sets
 * stays two printings.
 *
 * Returns Map `${idExpansion}:${idMetacard}` -> products. The array order is
 * whatever the file gave us and carries no meaning; nothing downstream may
 * read anything into it.
 */
export function groupPrintings(products) {
  const groups = new Map();
  for (const p of products) {
    const key = `${p.idExpansion}:${p.idMetacard}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return groups;
}

/**
 * Resolve every product to { rarity, source }.
 *
 * `expansions` maps Cardmarket expansion id -> YGOPRODeck set code, and
 * `rarities` maps `${lower name} ${set code}` -> the rarities YGOPRODeck lists.
 * Both come from cardmarket-import.mjs, which is the only caller.
 *
 * There is exactly one rule, and it does not distinguish variants:
 *
 *   if YGOPRODeck lists exactly one rarity for this card in this set, then
 *   every product in the group is that rarity, however many products there are
 *
 * That is a statement about the card, not about any individual product, so it
 * needs no ordering and makes no claim it cannot support. When the card has two
 * or more rarities in the set, rarity is null on all of its products and the
 * price resolves as a band.
 *
 * source is 'unique' or null, and exists so the audit can tell a rarity that
 * was established from one that is merely absent.
 */
export function resolvePrintings(products, expansions, rarities) {
  const out = new Map();

  for (const group of groupPrintings(products).values()) {
    const setCode = expansions.get(group[0].idExpansion) ?? null;
    const known = setCode
      ? rarities.get(`${group[0].name.toLowerCase()} ${setCode}`) ?? null
      : null;

    const distinct = [...new Set((known ?? []).map(displayRarity).filter(Boolean))];
    const sole = distinct.length === 1 ? distinct[0] : null;

    for (const p of group) {
      out.set(p.idProduct, { rarity: sole, source: sole ? "unique" : null });
    }
  }

  return out;
}
