/**
 * A Cardmarket link that knows which printing, and which copy.
 *
 * Every Cardmarket link in the app used to be the same shape: drop a name or a
 * print code into /Products/Search and let the reader sort it out. That is the
 * link a stranger would build. The app knows more than a stranger — which of a
 * card's nine printings this row is, what language the copy is, what condition
 * its owner graded it — and none of it reached the URL.
 *
 * All of that fits in one address:
 *
 *   /en/YuGiOh/Products?idProduct=820817&sellerCountry=4&language=1&minCondition=2
 *
 * `idProduct` is the whole trick. Cardmarket resolves a product id straight to
 * that product's page, so there is no slug to build, no expansion to look up,
 * and no search to disambiguate. A card printed at nine rarities in one set is
 * nine ids, and naming one names the printing exactly — which is the thing a
 * name search cannot do at all, however narrowly it is scoped.
 *
 * The id is free. `card_prices` already returns `product_id` and already keys
 * on rarity, so every surface that shows a price has the id in hand; the link
 * costs no request of its own. Only a card with no price loaded pays for one.
 *
 * Nothing here is invented. A copy with no language recorded omits that filter
 * rather than defaulting to English, a reader in a country Cardmarket does not
 * sell from omits `sellerCountry`, and a card whose printing was never
 * identified falls back to exactly the search link the app built before this
 * module existed.
 */
import { getClient } from "@/lib/supabaseClient";

const ORIGIN = "https://www.cardmarket.com";

/**
 * Cardmarket's minCondition ladder.
 *
 * The app's own Condition enum is this ladder, in this order — Mint through
 * Played — which is not a coincidence worth relying on silently, so the test
 * beside this file asserts every value in cardCopy's CONDITIONS is accounted
 * for here.
 *
 * Poor is deliberately absent, though Cardmarket does number it 7 — checked in
 * the site's own minCondition select. It is the floor of the ladder, so
 * "at least Poor" excludes nothing; omitting the parameter and sending 7 return
 * the same listings, and the shorter URL is the honest one.
 */
export const CONDITION_IDS = Object.freeze({
  "Mint": 1,
  "Near Mint": 2,
  "Excellent": 3,
  "Good": 4,
  "Light Played": 5,
  "Played": 6,
});

/**
 * Cardmarket's language ids, for the six languages this app records.
 *
 * Portuguese is 8, not 6. Worth stating because the obvious reading of
 * "English, French, German, Spanish, Italian, Portuguese" is 1 through 6, and
 * it is wrong: Cardmarket's own filter markup numbers those six 1,2,3,4,5,8.
 * Whatever occupies 6 and 7 is not a language the app offers, so it is not
 * guessed at here.
 */
export const LANGUAGE_IDS = Object.freeze({
  "English": 1,
  "French": 2,
  "German": 3,
  "Spanish": 4,
  "Italian": 5,
  "Portuguese": 8,
});

/**
 * Cardmarket's sellerCountry ids, by ISO 3166-1 alpha-2 code.
 *
 * Read straight off Cardmarket's own filter markup — the `sellerCountry[N]`
 * checkboxes on a product page, each with its label — rather than assembled
 * from a list of country names. That matters, because the order is alphabetical
 * by *ISO code*, not by name, and the two orders disagree almost everywhere:
 * Germany is 7, Switzerland is 4, the United Kingdom is 13. Sorting the English
 * names would have sent every Swiss reader to Croatia's sellers.
 *
 * The ids run to 37 but only 35 exist: 32 and 34 are absent from the markup,
 * and nothing here invents an occupant for them.
 *
 * Countries Cardmarket does not list are simply not here — the app has traders
 * in the United States and Israel, and neither is a Cardmarket seller country,
 * so those readers get no country filter rather than a wrong one.
 */
export const SELLER_COUNTRY_IDS = Object.freeze({
  AT: 1,  BE: 2,  BG: 3,  CH: 4,  CY: 5,  CZ: 6,  DE: 7,  DK: 8,  EE: 9,
  ES: 10, FI: 11, FR: 12, GB: 13, GR: 14, HU: 15, IE: 16, IT: 17, LI: 18,
  LT: 19, LU: 20, LV: 21, MT: 22, NL: 23, NO: 24, PL: 25, PT: 26, RO: 27,
  SE: 28, SG: 29, SI: 30, SK: 31, CA: 33, HR: 35, JP: 36, IS: 37,
});

/** The Cardmarket id for a condition, or null if it does not narrow anything. */
export function conditionId(condition) {
  return CONDITION_IDS[condition] ?? null;
}

/** The Cardmarket id for a language, or null if we have not been told one. */
export function languageId(language) {
  return LANGUAGE_IDS[language] ?? null;
}

/** The Cardmarket id for an ISO-2 country code, or null if it sells nothing. */
export function sellerCountryId(countryCode) {
  if (!countryCode) return null;
  return SELLER_COUNTRY_IDS[String(countryCode).toUpperCase()] ?? null;
}

/**
 * The set code out of a print code: "POTE-EN012" -> "POTE".
 *
 * Spelled the way card_prices spells it, so the link and the price agree about
 * which printing they are talking about.
 */
export function setCodeOf(extension) {
  if (!extension) return null;
  return String(extension).split("-")[0].trim() || null;
}

/**
 * A print code as Cardmarket searches for it: "RA04-EN001" -> "RA04-001".
 *
 * Cardmarket files a card by set and number and leaves the region out, so the
 * printed code and the searchable code differ by the two letters in the middle.
 * Searching the full "RA04-EN001" finds nothing; searching the bare set code
 * "RA04" finds the whole set. Dropping just the region is the one form that
 * lands on the card.
 *
 * The region is whatever letters sit between the hyphen and the number, so this
 * works for EN, FR, DE, JP and any other Cardmarket adds without a list to keep
 * up to date. A code that already omits the region passes through unchanged --
 * one of the 98 print codes in the app is written that way.
 *
 * Lowercased, because "ra04-001" is the form that was actually tested against
 * the site. Search is almost certainly case-insensitive, but "almost certainly"
 * is not a reason to send a spelling nobody has tried.
 *
 * Anything that does not parse falls back to the set code alone, which is the
 * link this used to build for every card and is still a real search.
 */
export function printCodeSearchTerm(extension) {
  if (!extension) return null;
  const text = String(extension).trim();
  if (!text) return null;

  // Greedy up to the last hyphen, so a set code containing one survives.
  const parts = text.match(/^(.+)-([A-Za-z]*)(\d+)$/);
  return (parts ? `${parts[1]}-${parts[3]}` : setCodeOf(text))?.toLowerCase() ?? null;
}

/**
 * The filters a copy justifies, as query parameters.
 *
 * Only the ones it can support: a copy with no language recorded gets no
 * language parameter, not `language=` and not a default of English. An empty
 * object is the honest answer for a copy the owner told us nothing about.
 *
 * `viewer` supplies the country, because whose country matters is the reader's,
 * not the card's — you filter to sellers you can buy from. It is a separate
 * argument for that reason and not because it is optional.
 */
export function cardmarketFilters(card, viewer = null) {
  const out = {};

  const language = languageId(card?.language);
  if (language) out.language = [language];

  const condition = conditionId(card?.condition);
  if (condition) out.minCondition = condition;

  const country = sellerCountryId(viewer?.country_code);
  if (country) out.sellerCountry = [country];

  return out;
}

/**
 * Query string for a filter set.
 *
 * Multi-valued parameters are joined with a literal comma rather than repeated
 * or percent-encoded, because that is how Cardmarket writes its own:
 * `sellerCountry=1,4&language=1,2,3,4,5,8`. A comma is legal unencoded in a
 * query string, so this is the same URL, spelled the way the site spells it.
 */
function filterQuery(filters) {
  return Object.entries(filters ?? {})
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : value}`)
    .join("&");
}

/**
 * Where to send a reader for one copy of one card.
 *
 * Two outcomes, and the second is not a failure:
 *
 *   the printing is known  -> that product's page, by id
 *   it is not              -> the search link the app has always built
 *
 * The fallback is what 220 of the app's 322 cards look like today, because
 * their owners never recorded a printing. Every card that *does* name a
 * printing resolves to an id — checked, 0 cards with a set code and no product
 * — so there is no third case to write and no expansion listing to fall back
 * through.
 *
 * Returns null for a card with no name and no product, which is the one state
 * there is no link for.
 */
export function cardmarketUrl(card, { productId = null, viewer = null } = {}) {
  const id = productId ?? card?.price?.productId ?? null;
  const query = filterQuery(cardmarketFilters(card, viewer));

  if (id != null) {
    return `${ORIGIN}/en/YuGiOh/Products?idProduct=${encodeURIComponent(id)}${query ? `&${query}` : ""}`;
  }

  const name = card?.name;
  if (!name) return null;

  // A search, for a copy whose printing was never identified. The print code
  // narrows it to one card where the name alone would return every printing.
  const term = printCodeSearchTerm(card?.extension) ?? name;
  return `${ORIGIN}/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(term)}${query ? `&${query}` : ""}`;
}

/**
 * What kind of link that was, for a UI that wants to say so.
 *
 * Separate from the URL because a component should not have to parse a string
 * to find out what it was handed.
 */
export function cardmarketLinkKind({ productId = null } = {}) {
  return productId == null ? "search" : "product";
}

// ── Filling in what the caller did not have ─────────────────────────────────

/**
 * The signed-in reader's country, for the seller filter.
 *
 * Cached for the life of the page including the miss: a signed-out visitor and
 * a trader who never filled in their profile both resolve to null, and asking
 * again on every link would be a request per right click to learn the same
 * nothing.
 *
 * Returns null rather than throwing on any failure. A country is a nicety on
 * this link; not having one costs a filter, not the link.
 */
let viewerCountry;

export async function fetchViewerCountry() {
  if (viewerCountry !== undefined) return viewerCountry;
  try {
    const client = getClient();
    const { data: auth } = await client.auth.getUser();
    const id = auth?.user?.id;
    if (!id) return (viewerCountry = null);

    const { data, error } = await client
      .from("Trader")
      .select("country_code")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    viewerCountry = data?.country_code ? { country_code: data.country_code } : null;
  } catch (err) {
    console.error("cardmarketLink: viewer country lookup failed", err);
    viewerCountry = null;
  }
  return viewerCountry;
}

/**
 * Everything one card needs to be linked.
 *
 * Usually no lookup at all. Every surface that shows a price has called
 * `fetchCardPrices`, and a price carries the product it resolved to, so the id
 * is already on the card. Only a card with no price loaded costs the RPC below,
 * and only the first link on a page costs the country query.
 *
 * `viewer` is left undefined by callers on purpose: threading the reader
 * through every binder and dialog to reach a single query parameter would be
 * plumbing for its own sake. An explicit null still means "this reader has no
 * country", which is a different statement and is respected.
 */
export async function resolveCardLink(card, viewer = undefined) {
  if (!card) return { url: null, kind: "search", productId: null };

  const reader = viewer === undefined ? await fetchViewerCountry() : viewer;

  let productId = card.price?.productId ?? null;
  if (productId == null && card.id != null) {
    const { data, error } = await getClient().rpc("card_prices", { p_card_ids: [Number(card.id)] });
    if (error) console.error("card_prices RPC failed", error);
    productId = data?.[0]?.product_id == null ? null : Number(data[0].product_id);
  }

  return {
    url: cardmarketUrl(card, { productId, viewer: reader }),
    kind: cardmarketLinkKind({ productId }),
    productId,
  };
}
