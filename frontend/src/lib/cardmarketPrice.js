// What a card is worth, and how sure we are.
//
// Prices come from Cardmarket's daily price guide, resolved to a printing where
// the app knows one. See supabase/migrations/20260823_cardmarket_prices.sql for
// where the numbers come from and scripts/cardmarket-import.mjs for how a
// printing the app can name becomes a product Cardmarket can price.
//
// Everything here reads one RPC, card_prices, rather than each surface
// computing its own total. The trade screen's gap feeds a cash offset — a claim
// about money between two people — so the collection and the proposal have to
// agree by construction, not by two implementations kept in step by hand.
//
// Nothing in this file invents a number. Cardmarket prices a printing, not a
// copy: there is no condition axis and no language axis in the file, and the
// app does not manufacture one. A worn French copy and a mint English one of
// the same printing carry the same figure here, and the card says which it is.
import { getClient } from "@/lib/supabaseClient";

/** One price. The printing was identified, or only one candidate had a value. */
export const EXACT = "exact";
/** Several candidates within a known set — a card printed at two rarities. */
export const NARROWED = "narrowed";
/** No set code, so every printing of the card is a candidate. */
export const RANGE = "range";
/** Cardmarket has no price for this card at all. */
export const NONE = "none";

/**
 * Shape one RPC row into what the UI asks questions of.
 *
 * `kind` is about the *price*, not the printing: a card whose set is unknown
 * but which has only ever had one printing is EXACT, because there is one
 * honest number to show. `inSet` is the separate question of whether we
 * narrowed by set code, which is what lets the UI say "2 printings in this set"
 * rather than "2 printings somewhere".
 */
export function readPrice(row) {
  if (!row || !row.printings) return { kind: NONE, printings: 0 };
  const printings = Number(row.printings);
  const inSet = row.in_set === true;
  const asOf = row.as_of ?? null;

  if (printings === 1) {
    return { kind: EXACT, value: Number(row.price), printings, inSet, asOf };
  }
  return {
    kind: inSet ? NARROWED : RANGE,
    low: Number(row.low_price),
    high: Number(row.high_price),
    printings,
    inSet,
    asOf,
  };
}

/**
 * Add up one side of a trade, or a whole collection.
 *
 * The total is itself a range, because some of its parts are. Summing a band by
 * its midpoint would invent a number that no card is worth, and doing it across
 * a pile compounds the invention; summing the floors and the ceilings keeps the
 * arithmetic honest and collapses to a single figure on its own the moment
 * every card resolves.
 *
 * `exact` is the flag the trade screen acts on: only when every priced card
 * gave one figure can a cash offset be offered, because only then is there one
 * number to offer.
 *
 * Quantity is respected — three copies of a card are three times the price —
 * and cards with no price at all are counted rather than silently dropped, so a
 * total can say what it is missing.
 */
export function sumPrices(entries) {
  let low = 0;
  let high = 0;
  let priced = 0;
  let unpriced = 0;
  let uncertain = 0;

  for (const entry of entries ?? []) {
    const price = entry?.price ?? entry;
    const qty = Math.max(1, Number(entry?.quantity ?? 1) || 1);

    if (!price || price.kind === NONE) { unpriced += qty; continue; }

    priced += qty;
    if (price.kind === EXACT) {
      low  += price.value * qty;
      high += price.value * qty;
    } else {
      uncertain += qty;
      low  += price.low  * qty;
      high += price.high * qty;
    }
  }

  return {
    low: round2(low),
    high: round2(high),
    exact: uncertain === 0 && priced > 0,
    priced,
    unpriced,
    uncertain,
  };
}

/**
 * The distance between two sides of a trade.
 *
 * Widest-first: the least you could be receiving against the most you could be
 * giving, and the reverse. A gap stated more precisely than its inputs would be
 * a guess wearing a decimal point.
 *
 * `payer` is null whenever the gap straddles zero — the trade may be even, and
 * saying who owes whom would be picking a side of a coin still in the air.
 */
export function tradeGap(give, receive) {
  const low  = round2(receive.low  - give.high);
  const high = round2(receive.high - give.low);
  const exact = give.exact && receive.exact;

  let payer = null;
  if (low > 0) payer = "proposer";       // receiving more, so you pay
  else if (high < 0) payer = "counterparty";

  return {
    low,
    high,
    exact,
    payer,
    // Only an exact gap can fill the cash field: an offset is a single number.
    amount: exact ? round2(Math.abs(low)) : null,
  };
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Prices for a set of Card ids, as a Map keyed by id.
 *
 * Returns an empty Map when the request fails, which the callers treat as "no
 * prices to show" rather than "these cards are worthless" — every surface here
 * hides the price line entirely rather than rendering a zero.
 */
export async function fetchCardPrices(cardIds) {
  const ids = [...new Set((cardIds ?? []).map(Number).filter(Boolean))];
  if (!ids.length) return new Map();

  const { data, error } = await getClient().rpc("card_prices", { p_card_ids: ids });
  if (error) {
    console.error("card_prices RPC failed", error);
    return new Map();
  }
  return new Map((data ?? []).map((row) => [Number(row.card_id), readPrice(row)]));
}
