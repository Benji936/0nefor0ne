import { describe, it, expect } from "vitest";
import { codeForCountry, canonicalCountry, resolveCountry, COUNTRIES } from "./countries";

describe("codeForCountry", () => {
  it("maps a country name to its ISO code", () => {
    expect(codeForCountry("Switzerland")).toBe("CH");
    expect(codeForCountry("France")).toBe("FR");
    expect(codeForCountry("United Kingdom")).toBe("GB");
  });
  it("ignores case and surrounding space, because the value came from a form", () => {
    expect(codeForCountry("  switzerland ")).toBe("CH");
  });
  it("returns null for nothing, rather than guessing", () => {
    expect(codeForCountry("")).toBeNull();
    expect(codeForCountry(null)).toBeNull();
    expect(codeForCountry(undefined)).toBeNull();
    expect(codeForCountry("Atlantis")).toBeNull();
  });
  it("resolves every name the country select can produce", () => {
    for (const c of COUNTRIES) expect(codeForCountry(c.name)).toBe(c.code);
  });
});

describe("canonicalCountry", () => {
  it("matches the list's own spelling exactly", () => {
    expect(canonicalCountry("Switzerland").code).toBe("CH");
  });

  it("ignores case and surrounding space", () => {
    expect(canonicalCountry("  sWITZERLAND ").code).toBe("CH");
  });

  // The list writes "&" where almost every other source writes "and". A rule,
  // not six alias entries, so countries nobody has imported yet match too.
  it("reads 'and' and '&' as the same word", () => {
    expect(canonicalCountry("Bosnia and Herzegovina").name).toBe("Bosnia & Herzegovina");
    expect(canonicalCountry("Trinidad and Tobago").code).toBe("TT");
    expect(canonicalCountry("Antigua & Barbuda").code).toBe("AG");
  });

  it("resolves the long forms other sources use", () => {
    expect(canonicalCountry("Republic of Indonesia").name).toBe("Indonesia");
    expect(canonicalCountry("United States of America").name).toBe("United States");
    expect(canonicalCountry("Czechia").name).toBe("Czech Republic");
    expect(canonicalCountry("Türkiye").name).toBe("Turkey");
  });

  it("returns null for somewhere not on the list", () => {
    expect(canonicalCountry("Atlantis")).toBeNull();
    expect(canonicalCountry("")).toBeNull();
    expect(canonicalCountry(null)).toBeNull();
  });

  // codeForCountry is now the same lookup, so an alias prices correctly too.
  it("gives an alias the same code as the canonical name", () => {
    expect(codeForCountry("Republic of Indonesia")).toBe("ID");
    expect(codeForCountry("Bosnia and Herzegovina")).toBe("BA");
  });
});

describe("resolveCountry", () => {
  // The directory files every country in English, and the finder searches that
  // column. Without this, a German reader typing their own country into a box
  // that says "Laden, Stadt oder Land" got nothing back — and so did French and
  // Italian. The names come from Intl rather than from a table nobody would
  // remember to extend.
  it("resolves a country written in the reader's language to the stored name", () => {
    expect(resolveCountry("Deutschland", "de")?.name).toBe("Germany");
    expect(resolveCountry("Allemagne", "fr")?.name).toBe("Germany");
    expect(resolveCountry("Germania", "it")?.name).toBe("Germany");
    expect(resolveCountry("Vereinigte Staaten", "de")?.name).toBe("United States");
    expect(resolveCountry("Royaume-Uni", "fr")?.name).toBe("United Kingdom");
    expect(resolveCountry("Giappone", "it")?.name).toBe("Japan");
  });

  it("still takes the English name whatever the reader's language", () => {
    expect(resolveCountry("Germany", "de")?.name).toBe("Germany");
    expect(resolveCountry("czechia", "fr")?.name).toBe("Czech Republic");
  });

  // An ISO code comes back from Intl unchanged when it has no display name, and
  // indexing those would make "de" resolve to Germany — swallowing every shop
  // with "de" in its name.
  it("never resolves a bare country code", () => {
    expect(resolveCountry("de", "de")).toBeNull();
    expect(resolveCountry("US", "en")).toBeNull();
  });

  it("is null for something that is not a country, in any language", () => {
    expect(resolveCountry("Augsburg", "de")).toBeNull();
    expect(resolveCountry("", "de")).toBeNull();
    expect(resolveCountry(null, "de")).toBeNull();
  });

  it("survives a locale tag the platform cannot parse", () => {
    expect(() => resolveCountry("Germany", "not a locale")).not.toThrow();
    expect(resolveCountry("Germany", "not a locale")?.name).toBe("Germany");
  });
});
