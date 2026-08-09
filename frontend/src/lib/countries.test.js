import { describe, it, expect } from "vitest";
import { codeForCountry, canonicalCountry, COUNTRIES } from "./countries";

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
