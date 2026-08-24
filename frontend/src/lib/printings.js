// Every printing of a card, priced.
//
// A collection row that knows only a name gets a range across all of them --
// Albion the Sanctifire Dragon is 0.21 to 30.47 euros across sixteen printings,
// and 0.21 to 6.52 once you know it came from RA05. This is what turns the
// first into the second: the list somebody picks their actual copy out of.
//
// The two catalogues each hold half of what the list needs. YGOPRODeck knows
// the print codes and rarities the app itself records (POTE-EN012, Common);
// Cardmarket knows the prices but files printings under an opaque expansion id
// with no rarity at all. So the printings come from YGOPRODeck and the prices
// are matched onto them by set code, which the nightly import resolved once for
// all 86,507 products. See scripts/cardmarket-import.mjs.
//
// `low` is deliberately not read here, matching card_prices: on a product with
// no trend and no rolling average it is one speculative listing rather than a
// market, and 10% of the catalogue is in exactly that state.
import { getClient } from "@/lib/supabaseClient";
import { readPrice } from "@/lib/cardmarketPrice";

const YGO = "https://db.ygoprodeck.com/api/v7/cardinfo.php";

/** "POTE-EN012" -> "POTE". The set is what carries a price; the number is not. */
export function setCodeOf(printCode) {
  return String(printCode ?? "").split("-")[0].trim() || null;
}

/**
 * Things YGOPRODeck files under set_rarity that are not rarities.
 *
 * Picking a printing writes its rarity onto the Card row, so these end up in
 * the collection and on screen: one card in this database reads "Jurrac Megalo
 * · New" because "New" came back as a set_rarity and was written through
 * unchallenged. Taken from the 48 distinct values in cardinfo.php on
 * 2026-08-24 -- printing notes, release notes, bare numbers, and two one-offs.
 *
 * Same list as NOT_A_RARITY in scripts/cardmarket-rarity.mjs, which cannot be
 * imported from here: one runs in the bundle, the other under node.
 */
const NOT_A_RARITY = new Set([
  "2", "3", "new", "reprint", "newartwork",
  "europeandebut", "oceaniandebut", "europeanoceaniandebut",
  "cr", "forcesmw",
]);

/** The rarity to record for a printing, or null when the source gave us a note. */
export function printingRarity(raw) {
  const key = String(raw ?? "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key || NOT_A_RARITY.has(key)) return null;
  return String(raw).normalize("NFKC").replace(/\s+/g, " ").trim();
}

/**
 * Fold Cardmarket products into YGOPRODeck printings.
 *
 * Pure, so the matching rules are testable without a network: a printing keeps
 * its own rarity from YGOPRODeck, and takes a single price only when exactly
 * one Cardmarket product sits under that set code for that card.
 *
 * Where a set printed the card at several rarities Cardmarket holds several
 * products and labels none of them -- its files carry no rarity and no version
 * number at all. Those printings are still offered and priced as a band,
 * because picking the right *set* narrows the answer a long way even when the
 * version cannot be pinned: sixteen printings down to seven, 0.21-30.47 down to
 * 0.21-6.52.
 */
export function mergePrintings(cardSets, products) {
  const bySet = new Map();
  for (const p of products ?? []) {
    if (!p.set_code) continue;
    const key = p.set_code.toLowerCase();
    if (!bySet.has(key)) bySet.set(key, []);
    bySet.get(key).push(p);
  }

  const seen = new Set();
  const out = [];
  for (const s of cardSets ?? []) {
    const printCode = s.set_code;
    if (!printCode || seen.has(printCode)) continue;
    seen.add(printCode);

    const code = setCodeOf(printCode);
    const candidates = bySet.get(code?.toLowerCase()) ?? [];

    // Every product of this printing, and no attempt to pick between them.
    //
    // There used to be a filter here preferring the product whose rarity
    // matched. It could never fire: cardmarket_product.rarity is only set when
    // YGOPRODeck lists one rarity for the card in that set, so it holds the
    // same value on every product of a printing and filtering by it returns all
    // or nothing. card_prices dropped its equivalent rung for the same reason,
    // and the two have to agree -- a picker quoting a tighter range than the
    // collection does is two answers to one question.
    const use = candidates;

    // Every product of the printing with its own figure, kept rather than
    // reduced, because the picker's second step is a list of exactly these:
    // when a printing holds nine products and Cardmarket labels none of them,
    // the price is the only thing telling them apart.
    //
    // Null-check before Number(), not after: `null ?? null ?? null` is null and
    // Number(null) is 0, so the obvious spelling of this turned a product with
    // no sales history into a printing worth nothing.
    const products = use
      .map((p) => {
        const row = p.cardmarket_price;
        const raw = row ? row.trend ?? row.avg7 ?? row.avg30 : null;
        const n = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
        return { idProduct: p.id_product, value: Number.isFinite(n) ? n : null };
      })
      .sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity));

    const values = products.map((p) => p.value).filter((v) => v !== null);

    out.push({
      printCode,
      setCode: code,
      setName: s.set_name ?? "",
      rarity: printingRarity(s.set_rarity),

      // The Cardmarket product this printing *is*, when the printing holds
      // exactly one. Recording it stops the price being matched at all -- see
      // rung 0 of card_prices -- so the answer survives Cardmarket renaming a
      // set or the expansion map being rebuilt.
      //
      // Null when the printing holds several, which is 11,708 of 66,829 of
      // them. Nothing in the catalogue says which is which, so picking the
      // printing narrows the card to one set and leaves a band; `products`
      // below is what the picker's second step asks about to close it.
      productId: use.length === 1 ? use[0].id_product ?? null : null,
      products,

      price: values.length
        ? readPrice({
            printings: values.length,
            price: values.length === 1 ? values[0] : null,
            low_price: values.length > 1 ? Math.min(...values) : null,
            high_price: values.length > 1 ? Math.max(...values) : null,
            in_set: true,
          })
        : null,
    });
  }

  // Cheapest first among the priced, then the unpriced. Somebody hunting their
  // own copy is usually holding a common one, and the expensive alternate arts
  // are the minority worth scrolling for.
  return out.sort((a, b) => {
    const av = a.price ? (a.price.value ?? a.price.low) : Infinity;
    const bv = b.price ? (b.price.value ?? b.price.low) : Infinity;
    return av - bv;
  });
}

/**
 * Does choosing this printing still leave a question?
 *
 * True when Cardmarket files more than one product for it, which is 11,708 of
 * 66,829 printings. Lives here rather than in the picker because it is a fact
 * about the data, and because the picker's branch and the chevron that warns
 * about it must not be able to disagree.
 */
export function needsVersionChoice(printing) {
  return (printing?.products?.length ?? 0) > 1;
}

/**
 * The printings of one card, priced, ready for a picker.
 *
 * Returns [] on any failure. An empty list closes the picker with nothing to
 * choose, which is the truth when neither catalogue knows the card -- better
 * than a dialog of blanks implying the answer is in there somewhere.
 */
export async function fetchPrintings(cardName) {
  if (!cardName) return [];

  let cardSets = [];
  try {
    const res = await fetch(`${YGO}?name=${encodeURIComponent(cardName)}`);
    if (!res.ok) return [];
    const json = await res.json();
    cardSets = json?.data?.[0]?.card_sets ?? [];
  } catch {
    return [];
  }
  if (!cardSets.length) return [];

  // Two queries, because a printing is (id_expansion, id_metacard) and not a
  // name. The first finds a way into each printing by the name the app knows;
  // the second collects every product of those printings, including the ones
  // Cardmarket spells differently -- CORI files "Magician of Dark Chaos –
  // Black Chaos" beside two hyphenated siblings, and a name query returns two
  // of the three. Stopping at the name would quote a narrower band here than
  // card_prices quotes on the same card.
  const db = getClient();
  const { data: seeds, error: seedError } = await db
    .from("cardmarket_product")
    .select("id_metacard")
    .ilike("name", cardName)
    .not("id_metacard", "is", null);

  if (seedError) {
    console.error("fetchPrintings: printing lookup failed", seedError);
    return mergePrintings(cardSets, []);
  }

  const metacards = [...new Set((seeds ?? []).map((r) => r.id_metacard))];
  if (!metacards.length) return mergePrintings(cardSets, []);

  const { data, error } = await db
    .from("cardmarket_product")
    .select("id_product, id_expansion, id_metacard, set_code, rarity, cardmarket_price(trend, avg7, avg30)")
    .in("id_metacard", metacards);

  if (error) {
    console.error("fetchPrintings: product lookup failed", error);
    return mergePrintings(cardSets, []);
  }
  return mergePrintings(cardSets, data ?? []);
}

/**
 * Record which printing a card row is.
 *
 * Writes the print code exactly as the rest of the app spells it -- AddCard
 * writes "POTE-EN012" into extension and "Common" into rarity, and a picker
 * that wrote a bare set code would leave two spellings of the same fact in one
 * column. The price then resolves through the same path as a row that was
 * added carefully in the first place.
 *
 * It also writes the Cardmarket product id when the printing resolved to one,
 * and that is the part that makes the answer durable. extension and rarity have
 * to be re-matched against the catalogue on every read, through an expansion
 * map that is rebuilt nightly and a rarity that may or may not have been
 * established; cardmarket_product_id is looked up directly and cannot drift.
 * Both are written because both are true, and because the columns the rest of
 * the app reads should not quietly disagree with the one pricing reads.
 */
export async function setCardPrinting(cardId, printing) {
  const { error } = await getClient()
    .from("Card")
    .update({
      extension: printing.printCode,
      rarity: printing.rarity ?? "common",
      cardmarket_product_id: printing.productId ?? null,
    })
    .eq("id", cardId);
  if (error) {
    console.error("setCardPrinting failed", error);
    return false;
  }
  return true;
}
