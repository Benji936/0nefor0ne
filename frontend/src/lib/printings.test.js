import { describe, it, expect } from "vitest";
import { setCodeOf, mergePrintings } from "./printings.js";
import { EXACT, NARROWED } from "./cardmarketPrice.js";

const ygo = (set_code, set_rarity, set_name = "Set") => ({ set_code, set_rarity, set_name });
const prod = (set_code, rarity, trend) => ({
  id_product: Math.random(), set_code, rarity,
  cardmarket_price: trend === null ? null : { trend, avg7: null, avg30: null },
});
/** A product with a listing but no sales history at all. */
const onlyListed = (set_code, low) => ({
  id_product: Math.random(), set_code, rarity: null,
  cardmarket_price: { trend: null, avg7: null, avg30: null, low },
});

describe("setCodeOf takes the set out of a print code", () => {
  it("keeps the part before the dash", () => {
    expect(setCodeOf("POTE-EN012")).toBe("POTE");
    expect(setCodeOf("RA05-EN037")).toBe("RA05");
  });

  it("handles a bare set code", () => {
    expect(setCodeOf("POTE")).toBe("POTE");
  });

  it("is null for nothing usable", () => {
    expect(setCodeOf("")).toBeNull();
    expect(setCodeOf(null)).toBeNull();
    expect(setCodeOf(undefined)).toBeNull();
  });
});

describe("mergePrintings prices the printings the app can name", () => {
  it("gives a printing the price of its set's single product", () => {
    const out = mergePrintings([ygo("POTE-EN012", "Common")], [prod("POTE", "Common", 0.09)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ printCode: "POTE-EN012", setCode: "POTE", rarity: "Common" });
    expect(out[0].price).toMatchObject({ kind: EXACT, value: 0.09 });
  });

  it("breaks a set's ambiguity when exactly one product's rarity matches", () => {
    // The import resolves rarity from this same YGOPRODeck data, so when it
    // managed to label one product, that label is as good as the printing's own.
    const out = mergePrintings(
      [ygo("CORI-EN027", "Ultra Rare")],
      [prod("CORI", "Ultra Rare", 57.82), prod("CORI", "Secret Rare", 368.69)],
    );
    expect(out[0].price).toMatchObject({ kind: EXACT, value: 57.82 });
  });

  it("stays a band when the set's products carry no rarity to match on", () => {
    // Cardmarket files two unlabelled products for CORI-EN027. Picking one
    // would be a coin flip on a 300 euro difference.
    const out = mergePrintings(
      [ygo("CORI-EN027", "Ultra Rare")],
      [prod("CORI", null, 57.82), prod("CORI", null, 368.69)],
    );
    expect(out[0].price).toMatchObject({ kind: NARROWED, low: 57.82, high: 368.69 });
  });

  it("offers a printing with no price at all rather than hiding it", () => {
    // It is still the right answer to "which one is yours", and answering it
    // narrows every future price even if today's is unknown.
    const out = mergePrintings([ygo("LART-EN055", "Ultra Rare")], []);
    expect(out).toHaveLength(1);
    expect(out[0].price).toBeNull();
  });

  it("ignores products from a different set", () => {
    const out = mergePrintings([ygo("POTE-EN012", "Common")], [prod("BLTR", "Ultra Rare", 99)]);
    expect(out[0].price).toBeNull();
  });

  it("drops duplicate print codes", () => {
    const out = mergePrintings([ygo("POTE-EN012", "Common"), ygo("POTE-EN012", "Common")], []);
    expect(out).toHaveLength(1);
  });

  it("skips entries with no print code", () => {
    const out = mergePrintings([ygo(null, "Common"), ygo("", "Common"), ygo("POTE-EN012", "Common")], []);
    expect(out).toHaveLength(1);
    expect(out[0].printCode).toBe("POTE-EN012");
  });

  it("sorts cheapest first and puts the unpriced last", () => {
    const out = mergePrintings(
      [ygo("AAA-EN001", "Common"), ygo("BBB-EN001", "Common"), ygo("CCC-EN001", "Common")],
      [prod("BBB", "Common", 12.5), prod("CCC", "Common", 0.4)],
    );
    expect(out.map(p => p.setCode)).toEqual(["CCC", "BBB", "AAA"]);
  });

  it("survives empty and missing inputs", () => {
    expect(mergePrintings([], [])).toEqual([]);
    expect(mergePrintings(null, null)).toEqual([]);
    expect(mergePrintings(undefined, undefined)).toEqual([]);
  });

  it("ignores a product row whose price is missing", () => {
    const out = mergePrintings([ygo("POTE-EN012", "Common")], [prod("POTE", "Common", null)]);
    expect(out[0].price).toBeNull();
  });

  it("refuses to price a product that has only a listing", () => {
    // 10% of the catalogue has no trend and no average -- one person asking a
    // number rather than a market. A Dark Magical Curtain printing in that
    // state carried a lone 18,995 EUR listing and set a whole collection's
    // ceiling to 76,298 EUR before this was pinned down.
    const out = mergePrintings([ygo("MAMO-EN003", "Ultra Rare")], [onlyListed("MAMO", 18995)]);
    expect(out[0].price).toBeNull();
  });

  it("still prices a set where one product has sales and another only a listing", () => {
    const out = mergePrintings(
      [ygo("MAMO-EN003", "Ultra Rare")],
      [prod("MAMO", null, 3.39), onlyListed("MAMO", 18995)],
    );
    expect(out[0].price).toMatchObject({ kind: EXACT, value: 3.39 });
  });

  it("matches set codes case-insensitively", () => {
    const out = mergePrintings([ygo("pote-EN012", "Common")], [prod("POTE", "Common", 0.09)]);
    expect(out[0].price).toMatchObject({ kind: EXACT, value: 0.09 });
  });
});
