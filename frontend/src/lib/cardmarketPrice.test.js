import { describe, it, expect } from "vitest";
import { readPrice, sumPrices, tradeGap, formatMoney, EXACT, NARROWED, RANGE, NONE } from "./cardmarketPrice.js";

// Rows as card_prices returns them: numerics arrive from PostgREST as strings.
const row = (o) => ({ card_id: 1, price: null, low_price: null, high_price: null,
                      printings: 0, in_set: false, as_of: "2026-08-23", ...o });

const exact    = (v) => ({ kind: EXACT, value: v, printings: 1, inSet: true });
const band     = (lo, hi) => ({ kind: NARROWED, low: lo, high: hi, printings: 2, inSet: true });
const nothing  = { kind: NONE, printings: 0 };

describe("readPrice says what kind of answer it has", () => {
  it("is exact when the candidates collapse to one figure", () => {
    const p = readPrice(row({ price: "0.09", printings: 1, in_set: true }));
    expect(p).toMatchObject({ kind: EXACT, value: 0.09, printings: 1, inSet: true });
  });

  it("is narrowed when a known set still holds several printings", () => {
    // CORI-EN027 really is two products Cardmarket does not label: the Ultra
    // and the Secret. This is the case the whole feature exists for.
    const p = readPrice(row({ low_price: "57.82", high_price: "368.69", printings: 2, in_set: true }));
    expect(p).toMatchObject({ kind: NARROWED, low: 57.82, high: 368.69, printings: 2 });
  });

  it("is a range when there is no set code to narrow by", () => {
    const p = readPrice(row({ low_price: "0.21", high_price: "30.47", printings: 16, in_set: false }));
    expect(p).toMatchObject({ kind: RANGE, low: 0.21, high: 30.47, printings: 16 });
  });

  it("is none when Cardmarket prices nothing by that name", () => {
    expect(readPrice(row({ printings: 0 }))).toMatchObject({ kind: NONE });
  });

  it("treats a missing row as none rather than throwing", () => {
    expect(readPrice(null)).toMatchObject({ kind: NONE });
    expect(readPrice(undefined)).toMatchObject({ kind: NONE });
  });

  it("reads a single printing as exact even with no set code", () => {
    // One honest number is one honest number, however we arrived at it.
    const p = readPrice(row({ price: "2.35", printings: 1, in_set: false }));
    expect(p).toMatchObject({ kind: EXACT, value: 2.35, inSet: false });
  });
});

describe("sumPrices keeps a total as honest as its parts", () => {
  it("collapses to one figure when every card is exact", () => {
    const t = sumPrices([exact(0.09), exact(2.35), exact(0.15)]);
    expect(t).toMatchObject({ low: 2.59, high: 2.59, exact: true, uncertain: 0 });
  });

  it("becomes a band as soon as one card is a band", () => {
    const t = sumPrices([exact(1.0), band(57.82, 368.69)]);
    expect(t).toMatchObject({ low: 58.82, high: 369.69, exact: false, uncertain: 1 });
  });

  it("never invents a midpoint for a band", () => {
    const t = sumPrices([band(10, 20)]);
    expect(t.low).toBe(10);
    expect(t.high).toBe(20);
    expect(t.low === t.high).toBe(false);
  });

  it("multiplies by quantity on both ends", () => {
    expect(sumPrices([{ price: exact(1.5), quantity: 3 }])).toMatchObject({ low: 4.5, high: 4.5 });
    expect(sumPrices([{ price: band(2, 5), quantity: 2 }])).toMatchObject({ low: 4, high: 10 });
  });

  it("counts unpriced cards instead of dropping them", () => {
    const t = sumPrices([exact(1.0), nothing, nothing]);
    expect(t).toMatchObject({ low: 1, high: 1, priced: 1, unpriced: 2 });
  });

  it("is not exact when nothing was priced at all", () => {
    // An empty total must not claim to be a confident zero.
    expect(sumPrices([nothing]).exact).toBe(false);
    expect(sumPrices([]).exact).toBe(false);
  });

  it("survives a missing or malformed quantity", () => {
    expect(sumPrices([{ price: exact(2), quantity: null }]).low).toBe(2);
    expect(sumPrices([{ price: exact(2), quantity: 0 }]).low).toBe(2);
    expect(sumPrices([{ price: exact(2), quantity: "x" }]).low).toBe(2);
  });

  it("rounds away floating point noise", () => {
    // 0.1 + 0.2 must not reach the screen as 0.30000000000000004.
    expect(sumPrices([exact(0.1), exact(0.2)]).low).toBe(0.3);
  });

  it("treats null entries as unpriced rather than throwing", () => {
    expect(sumPrices([null, undefined, exact(1)])).toMatchObject({ low: 1, unpriced: 2 });
  });
});

describe("tradeGap only names a payer when the sign is certain", () => {
  const side = (lo, hi, ex) => ({ low: lo, high: hi, exact: ex, priced: 1, unpriced: 0, uncertain: ex ? 0 : 1 });

  it("names you as payer when you receive more on any reading", () => {
    const g = tradeGap(side(3.6, 3.6, true), side(50.35, 50.35, true));
    expect(g).toMatchObject({ low: 46.75, high: 46.75, payer: "proposer", exact: true, amount: 46.75 });
  });

  it("names them as payer when they receive more on any reading", () => {
    const g = tradeGap(side(50.35, 50.35, true), side(3.6, 3.6, true));
    expect(g).toMatchObject({ payer: "counterparty", amount: 46.75 });
  });

  it("names nobody when the gap straddles zero", () => {
    // Give 1-100, receive 50: you might be ahead or behind. Saying which would
    // be picking a side of a coin still in the air.
    const g = tradeGap(side(1, 100, false), side(50, 50, true));
    expect(g.payer).toBeNull();
    expect(g.exact).toBe(false);
  });

  it("offers no cash amount unless both sides are exact", () => {
    expect(tradeGap(side(1, 5, false), side(50, 50, true)).amount).toBeNull();
    expect(tradeGap(side(1, 1, true), side(50, 90, false)).amount).toBeNull();
  });

  it("widens the gap from the widest readings of both sides", () => {
    const g = tradeGap(side(10, 20, false), side(30, 60, false));
    expect(g.low).toBe(10);   // least received minus most given
    expect(g.high).toBe(50);  // most received minus least given
  });

  it("reports an even trade as a zero gap with no payer", () => {
    const g = tradeGap(side(5, 5, true), side(5, 5, true));
    expect(g).toMatchObject({ low: 0, high: 0, payer: null, amount: 0 });
  });
});

describe("formatMoney always speaks euro, in the reader's shape", () => {
  it("keeps cents, because most cards are worth cents", () => {
    // Rounding to whole euro would print a 300-card binder as a wall of zeroes.
    expect(formatMoney(0.09, "en-IE")).toBe("€0.09");
    expect(formatMoney(0.02, "en-IE")).toBe("€0.02");
  });

  it("formats the same number differently per locale", () => {
    expect(formatMoney(1234.5, "en-IE")).toBe("€1,234.50");
    // Intl separates the amount from the symbol with U+00A0, not a space.
    expect(formatMoney(1234.5, "de-DE")).toBe("1.234,50\u00A0€");
  });

  it("never converts away from euro", () => {
    // Cardmarket quotes in euro; a converted figure would not match the listing
    // the reader opens, and would need a rate and a date we do not have.
    expect(formatMoney(10, "en-US")).toContain("€");
    expect(formatMoney(10, "it-IT")).toContain("€");
  });

  it("returns nothing, not zero, when there is no price", () => {
    // Number(null) and Number("") are 0, so the naive version of this printed
    // "0.00 EUR" for a card we simply have no price for.
    expect(formatMoney(null)).toBe("");
    expect(formatMoney(undefined)).toBe("");
    expect(formatMoney("")).toBe("");
    expect(formatMoney("abc")).toBe("");
    expect(formatMoney(NaN)).toBe("");
  });

  it("still formats a genuine zero", () => {
    // A card really priced at 0 is a different fact from an absent price.
    expect(formatMoney(0, "en-IE")).toBe("€0.00");
  });
});
