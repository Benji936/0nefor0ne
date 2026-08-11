// Maps a community's location to the claim subscription's presentment currency
// and the two plans it can be bought on. Fixed round figures per currency (NOT
// live FX); USD is the fallback. `currency` is the lowercase ISO code Stripe
// expects; `display` is user-facing copy.
//
// Monthly costs about a fifth more over a year than yearly does, and comes with
// half the free period. Both differences are deliberate and both are stated in
// the UI: the point of yearly is that it is the better deal, which only works as
// an argument if the reader can see it.
//
// Switzerland was billed in USD until CHF was added here, because CH is neither
// GB nor eurozone and fell through to the fallback.

// Amounts only. How a price is written is a question about the reader, not
// about the shop, so it is answered at render time by formatPrice below.
const CHF = { currency: "chf", year: { amount: 60 }, month: { amount: 6 } };
const GBP = { currency: "gbp", year: { amount: 50 }, month: { amount: 5 } };
const EUR = { currency: "eur", year: { amount: 60 }, month: { amount: 6 } };
const USD = { currency: "usd", year: { amount: 60 }, month: { amount: 6 } };

// ISO-3166 alpha-2 codes of euro-area countries.
const EUROZONE = new Set([
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
]);

// Liechtenstein is in the Swiss franc customs and currency union.
const SWISS = new Set(["CH", "LI"]);

/** The two intervals, in the order they are offered. Yearly leads because it is
 *  the recommended one and carries the longer free period. */
export const INTERVALS = ["year", "month"];

/** Free days per interval, mirrored in claim-create-checkout as
 *  trial_period_days. 182 is six months to the nearest day. */
export const FREE_DAYS = { year: 365, month: 182 };

/**
 * @param community          the row being priced
 * @param fallbackCountryCode the buyer's own country, used only when the
 *   community has none of its own. A community's country is optional and easy
 *   to skip, and skipping it used to mean the USD default no matter where
 *   everyone involved actually was. The community's own country still wins, so
 *   a Swiss owner running a shop in Lyon is billed in euros.
 */
export function communityPricing(community, fallbackCountryCode = null) {
  const own = (community?.country_code || "").trim().toUpperCase();
  const cc = own || (fallbackCountryCode || "").trim().toUpperCase();
  if (SWISS.has(cc)) return structuredClone(CHF);
  if (cc === "GB") return structuredClone(GBP);
  if (EUROZONE.has(cc)) return structuredClone(EUR);
  return structuredClone(USD);
}

/**
 * A price written the way the reader's language writes it.
 *
 * Two separate inputs, deliberately not collapsed into one. `currency` follows
 * the community's country, because that is what Stripe will present at
 * checkout. `locale` follows the reader's UI language, because that is what
 * decides where the symbol goes. A French reader looking at a British shop
 * should see "50 £": the currency is the shop's, the word order is theirs.
 *
 * This replaces a stored display string that always put the symbol in front.
 * That is right in English and wrong in the other three languages we ship,
 * where "€60 par an" should read "60 € par an".
 *
 * narrowSymbol rather than the default: in French, USD and GBP otherwise
 * render as "$US" and "£GB". Only one currency is ever on screen at a time,
 * so there is nothing for the longer form to disambiguate against.
 *
 * Whole units, because every plan is a round figure and "€60.00" invites the
 * reader to look for cents that are never there.
 */
export function formatPrice(amount, currency, locale = "en") {
  const code = String(currency ?? "").toUpperCase();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      // Both bounds, or Intl throws: a currency's default minimum is 2, which
      // would exceed a maximum of 0.
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // A malformed currency code must not take the price off the page. Mirrors
    // the fallback in communityEvents.js formatEventWhen.
    return `${code} ${amount}`;
  }
}

/** Guards what reaches the Edge Function. Anything unrecognised becomes yearly
 *  rather than being passed through: the server rejects a bad interval, and a
 *  refused checkout is a worse answer than the default the user would have got
 *  anyway. */
export function normalizeInterval(interval) {
  return INTERVALS.includes(interval) ? interval : "year";
}
