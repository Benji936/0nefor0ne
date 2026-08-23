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
 * Fold Cardmarket products into YGOPRODeck printings.
 *
 * Pure, so the matching rules are testable without a network: a printing keeps
 * its own rarity from YGOPRODeck, and takes a price only when exactly one
 * Cardmarket product sits under that set code for that card. Where a set
 * printed the card at several rarities Cardmarket holds several unlabelled
 * products, and there is no honest way to say which is which -- those printings
 * are still offered, priced as a band, because picking the right *set* still
 * narrows the answer a long way even when the rarity cannot be pinned.
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

    // Prefer the product whose resolved rarity matches this printing's: it is
    // the one case where Cardmarket's ambiguity can be broken honestly, because
    // the import already worked out that rarity from the same YGOPRODeck data.
    const exact = candidates.filter(
      (p) => p.rarity && s.set_rarity && p.rarity.toLowerCase() === s.set_rarity.toLowerCase(),
    );
    const use = exact.length === 1 ? exact : candidates;

    // Null-check before Number(), not after: `null ?? null ?? null` is null and
    // Number(null) is 0, so the obvious spelling of this turned a product with
    // no sales history into a printing worth nothing.
    const values = use
      .map((p) => p.cardmarket_price)
      .filter(Boolean)
      .map((v) => v.trend ?? v.avg7 ?? v.avg30)
      .filter((v) => v !== null && v !== undefined && v !== "")
      .map(Number)
      .filter((n) => Number.isFinite(n));

    out.push({
      printCode,
      setCode: code,
      setName: s.set_name ?? "",
      rarity: s.set_rarity ?? null,
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

  const { data, error } = await getClient()
    .from("cardmarket_product")
    .select("id_product, set_code, rarity, cardmarket_price(trend, avg7, avg30)")
    .ilike("name", cardName);

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
 */
export async function setCardPrinting(cardId, printing) {
  const { error } = await getClient()
    .from("Card")
    .update({ extension: printing.printCode, rarity: printing.rarity ?? "common" })
    .eq("id", cardId);
  if (error) {
    console.error("setCardPrinting failed", error);
    return false;
  }
  return true;
}
