import { describe, it, expect } from "vitest";
import { addressLines, telHref, directionsUrl, postalAddressLd } from "./postalAddress";

describe("addressLines", () => {
  it("puts the state between the town and the code in the United States", () => {
    expect(addressLines({
      country_code: "US", address: "37 Prospect Street", city: "Amsterdam",
      state: "NY", postal_code: "12010", country: "United States",
    })).toEqual(["37 Prospect Street", "Amsterdam, NY 12010", "United States"]);
  });

  it("leads with the postcode in Germany, and drops the source's region", () => {
    expect(addressLines({
      country_code: "DE", address: "Zinglerstraße 42", city: "Ulm",
      state: "Baden-Württemberg", postal_code: "89073", country: "Germany",
    })).toEqual(["Zinglerstraße 42", "89073 Ulm", "Germany"]);
  });

  it("works large-to-small in Japan: code, prefecture, ward", () => {
    expect(addressLines({
      country_code: "JP", address: "顕徳町1-4-3", city: "大分市",
      state: "大分県", postal_code: "870-0025", country: "Japan",
    })).toEqual(["顕徳町1-4-3", "870-0025 大分県 大分市", "Japan"]);
  });

  it("separates town from code with a space, not a comma, everywhere else", () => {
    expect(addressLines({
      country_code: "SG", address: "Blk 548, Serangoon North Ave 3, #01-07",
      city: null, postal_code: "550548", country: "Singapore",
    })).toEqual(["Blk 548, Serangoon North Ave 3, #01-07", "550548", "Singapore"]);
  });

  it("prints nothing at all when only the country is known", () => {
    expect(addressLines({ country_code: "JP", country: "Japan" })).toEqual([]);
  });

  it("skips a blank street rather than printing an empty line", () => {
    expect(addressLines({
      country_code: "GB", address: "   ", city: "London", postal_code: "EC1A 1BB",
      country: "United Kingdom",
    })).toEqual(["London EC1A 1BB", "United Kingdom"]);
  });

  it("survives a row with no fields at all", () => {
    expect(addressLines(null)).toEqual([]);
    expect(addressLines({})).toEqual([]);
  });
});

describe("telHref", () => {
  it("strips the shop's own punctuation out of the href", () => {
    expect(telHref("(863) 209-4093")).toBe("tel:8632094093");
  });

  it("keeps a leading plus, because it is the country code", () => {
    expect(telHref("+41 22 310 12 34")).toBe("tel:+41223101234");
  });

  it("passes a bare run of digits straight through", () => {
    expect(telHref("4506280027")).toBe("tel:4506280027");
  });

  it("refuses a fragment rather than linking to a number that cannot dial", () => {
    expect(telHref("n/a")).toBeNull();
    expect(telHref("123")).toBeNull();
    expect(telHref("")).toBeNull();
    expect(telHref(null)).toBeNull();
  });
});

describe("directionsUrl", () => {
  it("prefers the pin, which cannot be misread", () => {
    expect(directionsUrl({ lat: 42.94, lng: -74.18, name: "Prof. Bond's" }))
      .toBe("https://www.google.com/maps/search/?api=1&query=42.94,-74.18");
  });

  it("falls back to the name and the printed address", () => {
    const url = directionsUrl({
      name: "Waschbär", country_code: "DE", address: "Zinglerstraße 42",
      city: "Ulm", postal_code: "89073", country: "Germany",
    });
    expect(url).toContain("Wasch");
    expect(url).toContain(encodeURIComponent("89073 Ulm"));
  });

  it("is null when the row knows neither a pin nor a street", () => {
    expect(directionsUrl({ country: "Japan", country_code: "JP" })).toBeNull();
  });
});

describe("postalAddressLd", () => {
  it("emits the street and the code the old markup left out", () => {
    expect(postalAddressLd({
      country_code: "US", address: "37 Prospect Street", city: "Amsterdam",
      state: "NY", postal_code: "12010", country: "United States",
    })).toEqual({
      "@type": "PostalAddress",
      streetAddress: "37 Prospect Street",
      addressLocality: "Amsterdam",
      addressRegion: "NY",
      postalCode: "12010",
      addressCountry: "US",
    });
  });

  it("omits the keys it has no value for instead of emitting nulls", () => {
    expect(postalAddressLd({ city: "Ulm", country: "Germany" })).toEqual({
      "@type": "PostalAddress", addressLocality: "Ulm", addressCountry: "Germany",
    });
  });

  it("is undefined when there is nothing to say, so the caller can spread it", () => {
    expect(postalAddressLd({})).toBeUndefined();
    expect(postalAddressLd(null)).toBeUndefined();
  });
});
