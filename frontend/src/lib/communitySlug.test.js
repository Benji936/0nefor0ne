import { describe, it, expect } from "vitest";
import { slugify, withSuffix } from "./communitySlug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("The Inventory")).toBe("the-inventory");
  });
  it("strips punctuation and diacritics", () => {
    expect(slugify("Café Élite & Co.")).toBe("cafe-elite-co");
  });
  it("collapses and trims separators", () => {
    expect(slugify("  --Hobby   Shop--  ")).toBe("hobby-shop");
  });
  it("appends city when provided", () => {
    expect(slugify("The Inventory", { city: "Hagåtña" })).toBe("the-inventory-hagatna");
  });
  it("matches the DB slug pattern and caps length", () => {
    const s = slugify("x".repeat(200));
    expect(s).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(s.length).toBeLessThanOrEqual(60);
  });
  it("returns a safe fallback for empty input", () => {
    expect(slugify("!!!")).toBe("community");
  });
});

describe("withSuffix", () => {
  it("appends a numeric suffix", () => {
    expect(withSuffix("the-inventory", 2)).toBe("the-inventory-2");
  });
});
