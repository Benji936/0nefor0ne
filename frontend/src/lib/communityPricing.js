// Maps a community's location to the claim subscription's presentment currency
// and the fixed yearly price shown in the dialog and charged at Checkout. Fixed
// round figures per currency (NOT live FX); USD is the fallback. `currency` is
// the lowercase ISO code Stripe expects; `display` is user-facing copy.

const GBP = { currency: "gbp", amount: 50, display: "£50" };
const EUR = { currency: "eur", amount: 60, display: "€60" };
const USD = { currency: "usd", amount: 60, display: "$60" };

// ISO-3166 alpha-2 codes of euro-area countries.
const EUROZONE = new Set([
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
]);

export function communityPricing(community) {
  const cc = (community?.country_code || "").trim().toUpperCase();
  if (cc === "GB") return { ...GBP };
  if (EUROZONE.has(cc)) return { ...EUR };
  return { ...USD };
}
