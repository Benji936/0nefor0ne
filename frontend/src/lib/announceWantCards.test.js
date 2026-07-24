import { describe, it, expect } from "vitest";
import {
  buildWantRows,
  countResolved,
  totalQty,
  MAX_QTY,
  MAX_NAME_LEN,
} from "./announceWantCards";

const matched = (name, id, qty = 1) => ({
  status: "matched", qty, query: name, candidates: [], selected: { id, name }, card: { id, name },
});
const unmatched = (query, qty = 1) => ({
  status: "unmatched", qty, query, candidates: [], selected: null, card: null,
});

describe("buildWantRows", () => {
  it("maps a matched line to its passcode and canonical name", () => {
    expect(buildWantRows([matched("Ash Blossom & Joyous Spring", 14558127, 3)])).toEqual([
      { ygo_card_id: 14558127, card_name: "Ash Blossom & Joyous Spring", qty: 3, sort_order: 0 },
    ]);
  });

  // The reason ygo_card_id is nullable: an unresolvable line is still a want.
  it("keeps an unresolved line with a null card id and the typed text", () => {
    expect(buildWantRows([unmatched("Kashtira Fenrir (alt art)")])).toEqual([
      { ygo_card_id: null, card_name: "Kashtira Fenrir (alt art)", qty: 1, sort_order: 0 },
    ]);
  });

  it("numbers sort_order by output position, not input position", () => {
    const rows = buildWantRows([matched("A", 1), unmatched("   "), matched("B", 2)]);
    expect(rows.map((r) => [r.card_name, r.sort_order])).toEqual([["A", 0], ["B", 1]]);
  });

  it("drops lines that are empty after trimming, since card_name is NOT NULL", () => {
    expect(buildWantRows([unmatched(""), unmatched("   "), unmatched("\t")])).toEqual([]);
  });

  it("uses `selected` when `card` is absent", () => {
    const line = { status: "matched", qty: 2, query: "x", selected: { id: 7, name: "Chosen" }, card: null };
    expect(buildWantRows([line])[0]).toMatchObject({ ygo_card_id: 7, card_name: "Chosen", qty: 2 });
  });

  // Each of these would otherwise violate a CHECK and reject the whole batch.
  it("clamps qty into the range the DB accepts", () => {
    const qtys = [0, -5, 1, 99, 100, 1000, 2.7, NaN, undefined].map(
      (q) => buildWantRows([matched("C", 1, q)])[0].qty
    );
    expect(qtys).toEqual([1, 1, 1, 99, MAX_QTY, MAX_QTY, 2, 1, 1]);
  });

  it("caps card_name at the DB length limit", () => {
    const row = buildWantRows([unmatched("z".repeat(300))])[0];
    expect(row.card_name.length).toBe(MAX_NAME_LEN);
    expect(row.card_name.endsWith("…")).toBe(true);
  });

  it("collapses runs of whitespace in a name", () => {
    expect(buildWantRows([unmatched("  Pot   of \t Greed  ")])[0].card_name).toBe("Pot of Greed");
  });

  it("returns [] for junk input", () => {
    for (const input of [null, undefined, "nope", 42, {}]) {
      expect(buildWantRows(input)).toEqual([]);
    }
    expect(buildWantRows([null, undefined])).toEqual([]);
  });
});

describe("summaries", () => {
  const rows = buildWantRows([matched("A", 1, 3), unmatched("B", 2), matched("C", 3, 1)]);

  it("counts only rows that resolved to a real card", () => {
    expect(countResolved(rows)).toBe(2);
  });

  it("totals copies across the list", () => {
    expect(totalQty(rows)).toBe(6);
  });

  it("survives empty and missing input", () => {
    expect(countResolved([])).toBe(0);
    expect(totalQty([])).toBe(0);
    expect(countResolved(undefined)).toBe(0);
    expect(totalQty(undefined)).toBe(0);
  });
});
