import { describe, it, expect } from "vitest";
import { CONDITIONS, LANGUAGES } from "./cardCopy.js";
import {
  CONDITION_IDS,
  LANGUAGE_IDS,
  SELLER_COUNTRY_IDS,
  conditionId,
  languageId,
  sellerCountryId,
  setCodeOf,
  printCodeSearchTerm,
  cardmarketFilters,
  cardmarketUrl,
  cardmarketLinkKind,
} from "./cardmarketLink.js";

// Aleister the Invoker, Collector's Rare, in Quarter Century Stampede. One of
// nine products for that card in that one set, which is why the id matters.
const ALEISTER = 820817;

const copy = (o = {}) => ({ name: "Aleister the Invoker", extension: "RA04-EN024", rarity: "Collector's Rare", language: "English", condition: "Near Mint", ...o });

const paramsOf = (url) => Object.fromEntries(new URL(url).searchParams.entries());

describe("the id tables cover what the app can actually record", () => {
  // The guard that matters: adding a language to cardCopy without an id here
  // would silently drop the filter on every card in that language.
  it("has an id for every language the collection offers", () => {
    for (const language of LANGUAGES) expect(languageId(language)).toBeTypeOf("number");
  });

  it("has an id for every condition except Poor", () => {
    for (const condition of CONDITIONS) {
      if (condition === "Poor") expect(conditionId(condition)).toBeNull();
      else expect(conditionId(condition)).toBeTypeOf("number");
    }
  });

  it("numbers Portuguese 8, not 6", () => {
    // Cardmarket writes these six as 1,2,3,4,5,8. Reading the list as 1..6 is
    // the mistake this asserts against: it would filter to Simplified Chinese.
    expect(LANGUAGE_IDS).toMatchObject({ English: 1, French: 2, German: 3, Spanish: 4, Italian: 5, Portuguese: 8 });
  });

  it("orders conditions the way the grading scale runs", () => {
    expect(Object.values(CONDITION_IDS)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("orders seller countries by ISO code, not by name", () => {
    // The trap this guards. Sorting the English names alphabetically gives
    // Switzerland 34; Cardmarket's own markup gives it 4, because the list is
    // ordered by ISO code. Every Swiss reader would have gone to Croatia.
    expect(sellerCountryId("CH")).toBe(4);
    expect(sellerCountryId("DE")).toBe(7);
    expect(sellerCountryId("GB")).toBe(13);
    expect(sellerCountryId("CA")).toBe(33);
  });

  it("leaves 32 and 34 unclaimed, because Cardmarket does", () => {
    const ids = Object.values(SELLER_COUNTRY_IDS);
    expect(ids).toHaveLength(35);
    expect(ids).not.toContain(32);
    expect(ids).not.toContain(34);
    expect(Math.max(...ids)).toBe(37);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no id for a country Cardmarket does not sell from", () => {
    // Live cases, not hypotheticals: the app has traders in both.
    expect(sellerCountryId("US")).toBeNull();
    expect(sellerCountryId("IL")).toBeNull();
    expect(sellerCountryId(null)).toBeNull();
  });

  it("takes a lowercase code, since profiles are not trusted to shout", () => {
    expect(sellerCountryId("ch")).toBe(4);
  });
});

describe("setCodeOf", () => {
  it("takes the set code off a print code", () => {
    expect(setCodeOf("RA04-EN024")).toBe("RA04");
  });

  it("passes through a bare set code", () => {
    expect(setCodeOf("POTE")).toBe("POTE");
  });

  it("has nothing to say about nothing", () => {
    expect(setCodeOf(null)).toBeNull();
    expect(setCodeOf("")).toBeNull();
    expect(setCodeOf("   ")).toBeNull();
  });
});

describe("printCodeSearchTerm", () => {
  it("drops the region from a print code", () => {
    // Cardmarket files a card by set and number. "RA04-EN001" finds nothing.
    expect(printCodeSearchTerm("RA04-EN001")).toBe("ra04-001");
    expect(printCodeSearchTerm("CORI-EN027")).toBe("cori-027");
  });

  it("keeps the leading zeros, which are part of the number", () => {
    expect(printCodeSearchTerm("POTE-EN001")).toBe("pote-001");
  });

  it("drops any region, not just EN", () => {
    // No list of region codes to keep up to date: it is whatever letters sit
    // between the hyphen and the number.
    expect(printCodeSearchTerm("RA04-FR001")).toBe("ra04-001");
    expect(printCodeSearchTerm("RA04-JP001")).toBe("ra04-001");
    expect(printCodeSearchTerm("RA04-SP001")).toBe("ra04-001");
  });

  it("leaves a code that already omits the region alone", () => {
    // One of the 98 print codes in the app is written this way.
    expect(printCodeSearchTerm("MC1-001")).toBe("mc1-001");
  });

  it("keeps a hyphen inside the set code", () => {
    expect(printCodeSearchTerm("SD-A-EN001")).toBe("sd-a-001");
  });

  it("emits the lowercase form that was tested against the site", () => {
    expect(printCodeSearchTerm("ra04-en001")).toBe("ra04-001");
    expect(printCodeSearchTerm("RA04-EN001")).toBe("ra04-001");
  });

  it("falls back to the set code when there is no number to keep", () => {
    expect(printCodeSearchTerm("POTE")).toBe("pote");
    expect(printCodeSearchTerm("RA04-EN")).toBe("ra04");
  });

  it("has nothing to say about nothing", () => {
    expect(printCodeSearchTerm(null)).toBeNull();
    expect(printCodeSearchTerm("")).toBeNull();
    expect(printCodeSearchTerm("   ")).toBeNull();
  });
});

describe("cardmarketFilters only claims what the copy states", () => {
  it("reads language and condition off the copy", () => {
    expect(cardmarketFilters(copy({ language: "French", condition: "Light Played" })))
      .toEqual({ language: [2], minCondition: 5 });
  });

  it("omits a filter the copy has no value for", () => {
    expect(cardmarketFilters(copy({ language: null, condition: "Good" }))).toEqual({ minCondition: 4 });
    expect(cardmarketFilters(copy({ language: "Italian", condition: null }))).toEqual({ language: [5] });
  });

  it("is empty for a copy that states nothing", () => {
    expect(cardmarketFilters(copy({ language: null, condition: null }))).toEqual({});
  });

  it("does not filter a Poor copy to Poor-or-better, which is every copy", () => {
    expect(cardmarketFilters(copy({ condition: "Poor" }))).toEqual({ language: [1] });
  });

  it("takes the country from the viewer, never from the card", () => {
    expect(cardmarketFilters(copy(), { country_code: "CH" })).toEqual({
      language: [1], minCondition: 2, sellerCountry: [4],
    });
    expect(cardmarketFilters(copy(), { country_code: "US" }).sellerCountry).toBeUndefined();
    expect(cardmarketFilters(copy(), null).sellerCountry).toBeUndefined();
  });

  it("survives a card that is not there", () => {
    expect(cardmarketFilters(null)).toEqual({});
    expect(cardmarketFilters(undefined, undefined)).toEqual({});
  });
});

describe("cardmarketUrl with a known printing", () => {
  const url = cardmarketUrl(copy({ language: "French", condition: "Light Played" }),
    { productId: ALEISTER, viewer: { country_code: "CH" } });

  it("addresses the product by id", () => {
    expect(new URL(url).pathname).toBe("/en/YuGiOh/Products");
    expect(paramsOf(url).idProduct).toBe(String(ALEISTER));
  });

  it("names one printing rather than searching for the card", () => {
    // Aleister is nine products in RA04. A name search finds all nine; an id
    // finds the one the owner actually holds.
    expect(url).not.toContain("searchString");
    expect(url).not.toContain("exactMatch");
  });

  it("carries the copy's own language and condition and the reader's country", () => {
    expect(paramsOf(url)).toEqual({ idProduct: String(ALEISTER), language: "2", minCondition: "5", sellerCountry: "4" });
  });

  it("is just the id when the copy justifies no filters", () => {
    expect(cardmarketUrl({ name: "X" }, { productId: ALEISTER }))
      .toBe("https://www.cardmarket.com/en/YuGiOh/Products?idProduct=820817");
  });

  it("takes the id off the card's own price when one is loaded", () => {
    // card_prices already resolved the printing; the link costs no request.
    const withPrice = copy({ price: { productId: ALEISTER } });
    expect(paramsOf(cardmarketUrl(withPrice)).idProduct).toBe(String(ALEISTER));
  });

  it("prefers an explicit id over the one on the price", () => {
    const withPrice = copy({ price: { productId: 1 } });
    expect(paramsOf(cardmarketUrl(withPrice, { productId: ALEISTER })).idProduct).toBe(String(ALEISTER));
  });

  it("links a card with no name at all, because the id is the identity", () => {
    expect(cardmarketUrl({}, { productId: ALEISTER })).toContain("idProduct=820817");
  });

  it("writes multi-valued filters with literal commas, as Cardmarket does", () => {
    expect(cardmarketUrl(copy(), { productId: ALEISTER })).not.toContain("%2C");
  });

  it("reports what kind of link it built", () => {
    expect(cardmarketLinkKind({ productId: ALEISTER })).toBe("product");
    expect(cardmarketLinkKind({})).toBe("search");
  });
});

describe("cardmarketUrl with no printing keeps the old link", () => {
  it("searches the print code, region removed, when the copy names one", () => {
    // Not "RA04", which is the whole set, and not "RA04-EN024", which Cardmarket
    // does not file anything under.
    expect(cardmarketUrl(copy({ language: null, condition: null })))
      .toBe("https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=ra04-024");
  });

  it("searches the name when the copy names no printing", () => {
    expect(cardmarketUrl(copy({ extension: null, language: null, condition: null })))
      .toBe("https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=Aleister%20the%20Invoker");
  });

  it("is byte-for-byte the pre-existing link when the copy states nothing", () => {
    // The promise made when this shipped: a card with missing data keeps the
    // link it already had, rather than getting a differently-broken one.
    const bare = { name: "Pot of Greed", extension: null };
    const old = `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(bare.name)}`;
    expect(cardmarketUrl(bare)).toBe(old);
  });

  it("still applies the filters it does have", () => {
    const url = cardmarketUrl(copy({ extension: null, language: "German", condition: "Excellent" }));
    expect(paramsOf(url)).toEqual({ searchString: "Aleister the Invoker", language: "3", minCondition: "3" });
  });

  it("has no link for a card with neither a name nor an id", () => {
    expect(cardmarketUrl({ extension: "RA04-EN024" })).toBeNull();
    expect(cardmarketUrl(null)).toBeNull();
  });

  it("escapes a name that would otherwise break the query", () => {
    const url = cardmarketUrl(copy({ name: "Dark Magician & Co / Test?x=1", extension: null }));
    expect(paramsOf(url).searchString).toBe("Dark Magician & Co / Test?x=1");
  });
});
