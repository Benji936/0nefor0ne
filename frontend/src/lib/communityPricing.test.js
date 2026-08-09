import { describe, it, expect } from "vitest";
import { communityPricing, normalizeInterval, INTERVALS, FREE_DAYS } from "./communityPricing";

describe("communityPricing", () => {
  it("maps Switzerland to CHF, yearly 60 and monthly 6", () => {
    expect(communityPricing({ country_code: "CH" })).toEqual({
      currency: "chf",
      year: { amount: 60, display: "CHF 60" },
      month: { amount: 6, display: "CHF 6" },
    });
  });
  it("maps Liechtenstein to CHF too", () => {
    expect(communityPricing({ country_code: "LI" }).currency).toBe("chf");
  });
  it("maps GB to GBP £50 / £5", () => {
    const p = communityPricing({ country_code: "GB" });
    expect(p.currency).toBe("gbp");
    expect(p.year.display).toBe("£50");
    expect(p.month.display).toBe("£5");
  });
  it("maps a eurozone country (FR) to EUR €60 / €6", () => {
    const p = communityPricing({ country_code: "FR" });
    expect(p.currency).toBe("eur");
    expect(p.year.display).toBe("€60");
    expect(p.month.display).toBe("€6");
  });
  it("maps the US to USD $60 / $6", () => {
    const p = communityPricing({ country_code: "US" });
    expect(p.currency).toBe("usd");
    expect(p.year.display).toBe("$60");
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
