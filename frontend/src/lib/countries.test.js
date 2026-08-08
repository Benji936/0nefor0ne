import { describe, it, expect } from "vitest";
import { codeForCountry, COUNTRIES } from "./countries";

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
