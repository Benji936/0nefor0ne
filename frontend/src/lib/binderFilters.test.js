import { describe, it, expect } from "vitest";
import {
  rarityKey,
  hasWishlistMatches,
  rarityOptions,
  applyFilters,
  isFiltering,
} from "./binderFilters";

const card = (over = {}) => ({ id: 1, name: "Dark Magician", rarity: "Ultra Rare", ...over });

describe("rarityKey", () => {
  it("lowercases and trims so inconsistent storage groups together", () => {
    expect(rarityKey({ rarity: "  Ultra Rare " })).toBe("ultra rare");
    expect(rarityKey({ rarity: "ULTRA RARE" })).toBe("ultra rare");
  });

  it("is empty for a card with no rarity", () => {
    expect(rarityKey({})).toBe("");
    expect(rarityKey(null)).toBe("");
  });
});

describe("rarityOptions", () => {
  it("lists each rarity once, capitalised, sorted by label", () => {
    const opts = rarityOptions([
      card({ rarity: "ultra rare" }),
      card({ rarity: "Ultra Rare" }),
      card({ rarity: "common" }),
    ]);
    expect(opts).toEqual([
      { value: "common", label: "Common" },
      { value: "ultra rare", label: "Ultra Rare" },
    ]);
  });

  // A full title-case turns this into "Collector'S Rare".
  it("capitalises per word without mangling an apostrophe", () => {
    expect(rarityOptions([card({ rarity: "collector's rare" })])[0].label)
      .toBe("Collector's Rare");
  });

  it("skips cards with no rarity rather than offering a blank option", () => {
    expect(rarityOptions([card({ rarity: "" }), card({ rarity: null })])).toEqual([]);
  });

  it("survives a non-array pile", () => {
    expect(rarityOptions(undefined)).toEqual([]);
  });
});

describe("hasWishlistMatches", () => {
  it("is true only when something in the pile is wanted", () => {
    expect(hasWishlistMatches([card(), card({ matchesMyWishlist: true })])).toBe(true);
    expect(hasWishlistMatches([card(), card()])).toBe(false);
    expect(hasWishlistMatches(null)).toBe(false);
  });
});

describe("applyFilters", () => {
  const pile = [
    card({ id: 1, name: "Blue-Eyes White Dragon", rarity: "Ultra Rare", matchesMyWishlist: true }),
    card({ id: 2, name: "Dark Magician", rarity: "ultra rare" }),
    card({ id: 3, name: "Pot of Greed", rarity: "Common", matchesMyWishlist: true }),
  ];
  const ids = (out) => out.map((c) => c.id);

  it("returns everything when nothing is set", () => {
    expect(ids(applyFilters(pile, undefined))).toEqual([1, 2, 3]);
  });

  it("matches a name case-insensitively, anywhere in the name", () => {
    expect(ids(applyFilters(pile, { query: "magician" }))).toEqual([2]);
    expect(ids(applyFilters(pile, { query: "  BLUE " }))).toEqual([1]);
  });

  // The option values come from rarityKey, so a card stored "ultra rare"
  // must match one stored "Ultra Rare".
  it("matches rarity on the lowercased key, not the stored casing", () => {
    expect(ids(applyFilters(pile, { rarity: "ultra rare" }))).toEqual([1, 2]);
  });

  it("keeps only wishlist matches when asked", () => {
    expect(ids(applyFilters(pile, { wantedOnly: true }))).toEqual([1, 3]);
  });

  it("ands the three together", () => {
    expect(ids(applyFilters(pile, { wantedOnly: true, rarity: "common" }))).toEqual([3]);
    expect(ids(applyFilters(pile, { wantedOnly: true, query: "dragon" }))).toEqual([1]);
    expect(applyFilters(pile, { wantedOnly: true, rarity: "common", query: "dragon" })).toEqual([]);
  });

  it("survives a non-array pile", () => {
    expect(applyFilters(null, { query: "x" })).toEqual([]);
  });
});

describe("isFiltering", () => {
  // Distinguishes "they have nothing" from "your search found nothing",
  // which need different words on screen.
  it("is false only when nothing is set", () => {
    expect(isFiltering(undefined)).toBe(false);
    expect(isFiltering({ query: "   ", rarity: "", wantedOnly: false })).toBe(false);
    expect(isFiltering({ query: "a" })).toBe(true);
    expect(isFiltering({ rarity: "common" })).toBe(true);
    expect(isFiltering({ wantedOnly: true })).toBe(true);
  });
});
