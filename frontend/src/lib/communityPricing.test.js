import { describe, it, expect } from "vitest";
import { communityPricing } from "./communityPricing";

describe("communityPricing", () => {
  it("maps GB to GBP £50", () => {
    expect(communityPricing({ country_code: "GB" })).toEqual({ currency: "gbp", amount: 50, display: "£50" });
  });
  it("maps a eurozone country (FR) to EUR €60", () => {
    expect(communityPricing({ country_code: "FR" })).toEqual({ currency: "eur", amount: 60, display: "€60" });
  });
  it("maps the US to USD $60", () => {
    expect(communityPricing({ country_code: "US" })).toEqual({ currency: "usd", amount: 60, display: "$60" });
  });
  it("is case-insensitive on the country code", () => {
    expect(communityPricing({ country_code: "gb" }).currency).toBe("gbp");
    expect(communityPricing({ country_code: "de" }).currency).toBe("eur");
  });
  it("falls back to USD for unknown, empty, or missing location", () => {
    expect(communityPricing({ country_code: "JP" }).currency).toBe("usd");
    expect(communityPricing({ country_code: "" }).currency).toBe("usd");
    expect(communityPricing({}).currency).toBe("usd");
    expect(communityPricing(null).currency).toBe("usd");
  });
});
