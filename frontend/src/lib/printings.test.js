import { describe, it, expect } from "vitest";
import { setCodeOf, mergePrintings, printingRarity, needsVersionChoice } from "./printings.js";
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

  it("stays a band even when a product carries a matching rarity", () => {
    // rarity cannot break this tie and must not appear to. It is only ever set
    // when YGOPRODeck lists one rarity for the card in the set, so it holds the
    // same value on every product of a printing -- these two rows cannot both
    // occur in real data, and if they did, preferring one would be a coin flip
    // on a 300 euro difference.
    const out = mergePrintings(
      [ygo("CORI-EN027", "Ultra Rare")],
      [prod("CORI", "Ultra Rare", 57.82), prod("CORI", "Secret Rare", 368.69)],
    );
    expect(out[0].price).toMatchObject({ kind: NARROWED, low: 57.82, high: 368.69 });
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

describe("needsVersionChoice decides whether a second question is owed", () => {
  const withProducts = (n) => ({ products: Array.from({ length: n }, (_, i) => ({ idProduct: i, value: i })) });

  it("is false for the 55,121 printings holding one product", () => {
    expect(needsVersionChoice(withProducts(1))).toBe(false);
  });

  it("is true for the 11,708 holding several", () => {
    expect(needsVersionChoice(withProducts(2))).toBe(true);
    expect(needsVersionChoice(withProducts(9))).toBe(true);
  });

  it("is false when Cardmarket carries no product for the printing", () => {
    expect(needsVersionChoice(withProducts(0))).toBe(false);
    expect(needsVersionChoice({})).toBe(false);
    expect(needsVersionChoice(null)).toBe(false);
    expect(needsVersionChoice(undefined)).toBe(false);
  });

  it("agrees with productId: a printing is either answered or asked, never both", () => {
    // The picker branches on this and shows a chevron from it. If it could
    // disagree with productId, a card would either skip a real question or
    // stall on one that has already been answered.
    const one = mergePrintings([ygo("POTE-EN012", "Common")],
      [{ id_product: 1, set_code: "POTE", rarity: "Common", cardmarket_price: { trend: 0.09 } }])[0];
    const many = mergePrintings([ygo("CORI-EN003", "Super Rare")], [
      { id_product: 894689, set_code: "CORI", rarity: null, cardmarket_price: { trend: 0.33 } },
      { id_product: 894690, set_code: "CORI", rarity: null, cardmarket_price: { trend: 25.76 } },
    ])[0];
    expect([needsVersionChoice(one), one.productId !== null]).toEqual([false, true]);
    expect([needsVersionChoice(many), many.productId !== null]).toEqual([true, false]);
  });
});

describe("printingRarity keeps notes out of the rarity column", () => {
  it("drops what YGOPRODeck files under set_rarity but is not one", () => {
    // A live card in this database reads "Jurrac Megalo · New" because this
    // guard did not exist when it was picked.
    for (const junk of ["New", "Reprint", "2", "3", "European debut", "New artwork", "Cr", "force-SMW"]) {
      expect(printingRarity(junk)).toBeNull();
    }
  });

  it("keeps real rarities, tidying whitespace only", () => {
    expect(printingRarity("Secret Rare")).toBe("Secret Rare");
    expect(printingRarity("  Quarter  Century Secret Rare ")).toBe("Quarter Century Secret Rare");
    expect(printingRarity("Collector's Rare")).toBe("Collector's Rare");
  });

  it("is null for nothing usable", () => {
    expect(printingRarity(null)).toBeNull();
    expect(printingRarity("")).toBeNull();
  });

  it("leaves a printing's rarity null rather than writing a note onto the card", () => {
    const out = mergePrintings([ygo("BLMM-EN016", "New")], []);
    expect(out[0].rarity).toBeNull();
  });
});

describe("mergePrintings names the Cardmarket product where it can", () => {
  const withId = (id, set_code, rarity, trend) => ({
    id_product: id, set_code, rarity,
    cardmarket_price: { trend, avg7: null, avg30: null },
  });

  it("carries the product id when the set holds exactly one", () => {
    // This is what makes the pick durable. extension + rarity have to be
    // re-matched through a nightly-rebuilt expansion map on every read; an
    // id_product is looked up directly and cannot drift.
    const out = mergePrintings([ygo("POTE-EN012", "Common")], [withId(712345, "POTE", "Common", 0.09)]);
    expect(out[0].productId).toBe(712345);
  });

  it("names no product for RA02 Purrely, whose seven versions are unlabelled", () => {
    // The load-bearing case. The catalogue carries no rarity and no version
    // number, so all seven are 'Purrely' and nothing says which is the Quarter
    // Century Secret Rare. A band from 0.21 to 5.62 and a question to its
    // owner, rather than a number picked off an id ordering.
    const ra02 = [769695, 769776, 769857, 769941, 770026, 770107, 770188]
      .map((id, i) => withId(id, "RA02", null, [0.21, 0.33, 0.37, 1.75, 5.62, 0.71, 1.2][i]));
    const out = mergePrintings([ygo("RA02-EN001", "Quarter Century Secret Rare")], ra02);
    expect(out[0].productId).toBeNull();
    expect(out[0].price).toMatchObject({ kind: NARROWED, low: 0.21, high: 5.62 });
  });

  it("names no product when the set's products are indistinguishable", () => {
    // Two unlabelled products at 57.82 and 368.69. Recording either id would
    // put a 300 euro guess behind a number the UI presents as certain.
    const out = mergePrintings(
      [ygo("CORI-EN027", "Ultra Rare")],
      [withId(894838, "CORI", null, 57.82), withId(894839, "CORI", null, 368.69)],
    );
    expect(out[0].productId).toBeNull();
    expect(out[0].price).toMatchObject({ kind: NARROWED });
  });

  it("lists every product of the printing for the second step", () => {
    // RA04 files nine products for Aleister the Invoker, all named the same.
    // The picker's second step is exactly this list, so it has to survive
    // whole rather than being reduced to a low and a high.
    const nine = [
      [820357, 0.21], [820444, 0.25], [820527, 0.46], [820631, 1.75], [820718, 7.23],
      [820817, 0.42], [820898, 0.68], [821130, 1.47], [821315, 25.19],
    ].map(([id, v]) => withId(id, "RA04", null, v));
    const out = mergePrintings([ygo("RA04-EN024", "Collector's Rare")], nine);
    expect(out[0].products).toHaveLength(9);
    expect(out[0].productId).toBeNull();
    expect(out[0].price).toMatchObject({ kind: NARROWED, low: 0.21, high: 25.19 });
  });

  it("orders the second step cheapest first, unpriced last", () => {
    // Somebody hunting their own copy scans by price, and an unpriced product
    // is the least identifiable thing in the list.
    const out = mergePrintings(
      [ygo("RA04-EN024", "Collector's Rare")],
      [
        withId(3, "RA04", null, 7.23),
        { id_product: 4, set_code: "RA04", rarity: null, cardmarket_price: null },
        withId(1, "RA04", null, 0.21),
        withId(2, "RA04", null, 1.75),
      ],
    );
    expect(out[0].products.map((p) => p.idProduct)).toEqual([1, 2, 3, 4]);
    expect(out[0].products.at(-1).value).toBeNull();
  });

  it("gives a single-product printing a one-entry list, so no second step is asked", () => {
    const out = mergePrintings([ygo("POTE-EN012", "Common")], [withId(712345, "POTE", "Common", 0.09)]);
    expect(out[0].products).toEqual([{ idProduct: 712345, value: 0.09 }]);
    expect(out[0].productId).toBe(712345);
  });

  it("names no product for a printing Cardmarket does not carry", () => {
    const out = mergePrintings([ygo("LART-EN055", "Ultra Rare")], []);
    expect(out[0].productId).toBeNull();
  });

  it("still names the product when it has no price yet", () => {
    // Knowing which printing it is stays true whether or not it sold today.
    const out = mergePrintings(
      [ygo("POTE-EN012", "Common")],
      [{ id_product: 712345, set_code: "POTE", rarity: "Common", cardmarket_price: null }],
    );
    expect(out[0].productId).toBe(712345);
    expect(out[0].price).toBeNull();
  });
});
