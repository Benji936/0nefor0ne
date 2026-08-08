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

const CHF = { currency: "chf", year: { amount: 60, display: "CHF 60" }, month: { amount: 6, display: "CHF 6" } };
const GBP = { currency: "gbp", year: { amount: 50, display: "£50" },    month: { amount: 5, display: "£5" } };
const EUR = { currency: "eur", year: { amount: 60, display: "€60" },    month: { amount: 6, display: "€6" } };
const USD = { currency: "usd", year: { amount: 60, display: "$60" },    month: { amount: 6, display: "$6" } };

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

export function communityPricing(community) {
  const cc = (community?.country_code || "").trim().toUpperCase();
  if (SWISS.has(cc)) return structuredClone(CHF);
  if (cc === "GB") return structuredClone(GBP);
  if (EUROZONE.has(cc)) return structuredClone(EUR);
  return structuredClone(USD);
}

/** Guards what reaches the Edge Function. Anything unrecognised becomes yearly
 *  rather than being passed through: the server rejects a bad interval, and a
 *  refused checkout is a worse answer than the default the user would have got
 *  anyway. */
export function normalizeInterval(interval) {
  return INTERVALS.includes(interval) ? interval : "year";
}
