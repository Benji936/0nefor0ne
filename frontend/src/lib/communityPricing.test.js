import { describe, it, expect } from "vitest";
import { communityPricing, formatPrice, normalizeInterval, INTERVALS, FREE_DAYS } from "./communityPricing";

describe("communityPricing", () => {
  it("maps Switzerland to CHF, yearly 60 and monthly 6", () => {
    expect(communityPricing({ country_code: "CH" })).toEqual({
      currency: "chf",
      year: { amount: 60 },
      month: { amount: 6 },
    });
  });
  it("maps Liechtenstein to CHF too", () => {
    expect(communityPricing({ country_code: "LI" }).currency).toBe("chf");
  });
  it("maps GB to GBP 50 / 5", () => {
    const p = communityPricing({ country_code: "GB" });
    expect(p.currency).toBe("gbp");
    expect(p.year.amount).toBe(50);
    expect(p.month.amount).toBe(5);
  });
  it("maps a eurozone country (FR) to EUR 60 / 6", () => {
    const p = communityPricing({ country_code: "FR" });
    expect(p.currency).toBe("eur");
    expect(p.year.amount).toBe(60);
    expect(p.month.amount).toBe(6);
  });
  it("maps the US to USD 60 / 6", () => {
    const p = communityPricing({ country_code: "US" });
    expect(p.currency).toBe("usd");
    expect(p.year.amount).toBe(60);
  });
  it("carries no pre-formatted price, because formatting needs the reader", () => {
    // The bug this replaces: a stored display string put the symbol in front
    // in every language, so French read "€60 par an" instead of "60 € par an".
    const p = communityPricing({ country_code: "FR" });
    expect(p.year).not.toHaveProperty("display");
    expect(p.month).not.toHaveProperty("display");
  });
  it("is case-insensitive on the country code", () => {
    expect(communityPricing({ country_code: "ch" }).currency).toBe("chf");
    expect(communityPricing({ country_code: "gb" }).currency).toBe("gbp");
    expect(communityPricing({ country_code: "de" }).currency).toBe("eur");
  });
  it("falls back to USD for unknown, empty, or missing location", () => {
    expect(communityPricing({ country_code: "JP" }).currency).toBe("usd");
    expect(communityPricing({ country_code: "" }).currency).toBe("usd");
    expect(communityPricing({}).currency).toBe("usd");
    expect(communityPricing(null).currency).toBe("usd");
  });
  it("returns a fresh object each call, so a caller cannot mutate the table", () => {
    const first = communityPricing({ country_code: "CH" });
    first.year.amount = 1;
    expect(communityPricing({ country_code: "CH" }).year.amount).toBe(60);
  });
  it("prices monthly above yearly-per-month in every currency", () => {
    for (const cc of ["CH", "GB", "FR", "US"]) {
      const p = communityPricing({ country_code: cc });
      expect(p.month.amount * 12).toBeGreaterThan(p.year.amount);
    }
  });
});

describe("the buyer-country fallback", () => {
  it("uses the buyer's country when the community has none", () => {
    expect(communityPricing({ country_code: null }, "CH").currency).toBe("chf");
    expect(communityPricing({}, "GB").currency).toBe("gbp");
    expect(communityPricing(null, "FR").currency).toBe("eur");
  });
  it("lets the community's own country win over the buyer's", () => {
    // A Swiss owner running a shop in Lyon is billed in euros.
    expect(communityPricing({ country_code: "FR" }, "CH").currency).toBe("eur");
  });
  it("still falls back to USD when neither is known", () => {
    expect(communityPricing({ country_code: null }, null).currency).toBe("usd");
    expect(communityPricing({}, "").currency).toBe("usd");
    expect(communityPricing({}, "ZZ").currency).toBe("usd");
  });
  it("is case-insensitive on the fallback too", () => {
    expect(communityPricing({}, "ch").currency).toBe("chf");
  });
});

describe("formatPrice", () => {
  // Where the digits sit relative to everything else. Asserting the ordering
  // rather than the exact string keeps this stable across ICU versions, which
  // move between U+00A0 and U+202F for the separator without warning.
  const symbolTrails = (s) => {
    const digits = s.search(/\d/);
    const symbol = s.search(/[^\d\s  ]/);
    return digits >= 0 && symbol > digits;
  };

  it("leaves the English wording as it was", () => {
    // No regression for the locale that was already right. The three symbol
    // currencies are unchanged to the byte; CHF now separates with a
    // non-breaking space where the old literal had a plain one, so the code
    // and the amount can no longer be split across a line break.
    expect(formatPrice(60, "usd", "en")).toBe("$60");
    expect(formatPrice(50, "gbp", "en")).toBe("£50");
    expect(formatPrice(60, "eur", "en")).toBe("€60");
    expect(formatPrice(60, "chf", "en")).toBe("CHF\u00A060");
  });

  it("puts the symbol after the number in French, German and Italian", () => {
    // The whole point of the change.
    for (const locale of ["fr", "de", "it"]) {
      const out = formatPrice(60, "eur", locale);
      expect(symbolTrails(out), `${locale}: ${JSON.stringify(out)}`).toBe(true);
      expect(out).toMatch(/60/);
      expect(out).toMatch(/€/);
    }
  });

  it("puts the symbol before the number in English", () => {
    expect(symbolTrails(formatPrice(60, "eur", "en"))).toBe(false);
  });

  it("uses the narrow symbol, so French does not read $US or £GB", () => {
    expect(formatPrice(60, "usd", "fr")).not.toMatch(/US/);
    expect(formatPrice(50, "gbp", "fr")).not.toMatch(/GB/);
  });

  it("shows whole units, never trailing cents", () => {
    for (const locale of ["en", "fr", "de", "it"]) {
      expect(formatPrice(60, "eur", locale)).not.toMatch(/[.,]\d/);
    }
  });

  it("takes the currency case-insensitively, since Stripe stores it lowercase", () => {
    expect(formatPrice(60, "eur", "en")).toBe(formatPrice(60, "EUR", "en"));
  });

  it("defaults to English when no locale is given", () => {
    expect(formatPrice(60, "eur")).toBe(formatPrice(60, "eur", "en"));
  });

  it("still shows the number when the currency code is unusable", () => {
    // A price that vanishes is worse than one that is plainly formatted.
    for (const bad of ["", null, undefined, "not-a-currency"]) {
      const out = formatPrice(60, bad, "fr");
      expect(out).toMatch(/60/);
    }
  });
});

describe("normalizeInterval", () => {
  it("passes through the two real intervals", () => {
    expect(normalizeInterval("year")).toBe("year");
    expect(normalizeInterval("month")).toBe("month");
  });
  it("defaults anything else to yearly", () => {
    expect(normalizeInterval("weekly")).toBe("year");
    expect(normalizeInterval("")).toBe("year");
    expect(normalizeInterval(undefined)).toBe("year");
    expect(normalizeInterval(null)).toBe("year");
  });
});

describe("the offer", () => {
  it("leads with yearly", () => {
    expect(INTERVALS[0]).toBe("year");
  });
  it("gives yearly the longer free period", () => {
    expect(FREE_DAYS.year).toBeGreaterThan(FREE_DAYS.month);
    expect(FREE_DAYS.year).toBe(365);
    expect(FREE_DAYS.month).toBe(182);
  });
});
