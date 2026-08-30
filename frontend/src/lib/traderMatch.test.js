import { describe, it, expect } from "vitest";
import {
  overlapByName, tradeTable, tableKind,
  MUTUAL, YOU_GET, YOU_GIVE, NONE,
} from "./traderMatch.js";

const card = (name, id = 1) => ({ id, name, image_id: id });

describe("overlapByName", () => {
  it("keeps only the cards the other list names", () => {
    const rows = [card("Ash Blossom", 1), card("Maxx C", 2), card("Called by", 3)];
    expect(overlapByName(rows, ["Maxx C"]).map((c) => c.name)).toEqual(["Maxx C"]);
  });

  // find_matches counts COUNT(DISTINCT name). The page counted rows, so a
  // trader holding two copies of a card you want read as "2 cards you want"
  // here and "1" on the matches list. Three (trader, card) pairs in this
  // database hold a duplicate, so the disagreement was live.
  it("counts a name once however many copies they hold", () => {
    const rows = [card("Ash Blossom", 1), card("Ash Blossom", 2)];
    expect(overlapByName(rows, ["Ash Blossom"])).toHaveLength(1);
  });

  it("keeps the first copy, so the row it draws is the one the list sorted", () => {
    const rows = [card("Ash Blossom", 7), card("Ash Blossom", 9)];
    expect(overlapByName(rows, ["Ash Blossom"])[0].id).toBe(7);
  });

  it("matches on the exact name, the way the database join does", () => {
    expect(overlapByName([card("Maxx C")], ["maxx c"])).toEqual([]);
    expect(overlapByName([card("Maxx C")], [" Maxx C"])).toEqual([]);
  });

  it("takes a Set as readily as an array, since callers have both", () => {
    expect(overlapByName([card("Maxx C")], new Set(["Maxx C"]))).toHaveLength(1);
  });

  it("ignores a row with no name rather than matching it against nothing", () => {
    expect(overlapByName([{ id: 1 }, card("Maxx C")], ["Maxx C"])).toHaveLength(1);
  });

  it("survives nothing at all, on either side", () => {
    expect(overlapByName(null, ["a"])).toEqual([]);
    expect(overlapByName([card("a")], null)).toEqual([]);
    expect(overlapByName([card("a")], [])).toEqual([]);
  });
});

describe("tradeTable", () => {
  const theirPile = [card("Ash Blossom", 1), card("Droll", 2)];
  const theirWishlist = [card("Maxx C", 3), card("Nibiru", 4)];

  it("fills both arms independently", () => {
    const table = tradeTable({
      theirPile, theirWishlist,
      myWishNames: ["Ash Blossom"],
      myPileNames: ["Maxx C", "Nibiru"],
    });
    expect(table.youGet.map((c) => c.name)).toEqual(["Ash Blossom"]);
    expect(table.youGive.map((c) => c.name)).toEqual(["Maxx C", "Nibiru"]);
    expect(table.kind).toBe(MUTUAL);
  });

  // The direction the page never drew. Half the live matching relationships in
  // this database run this way, and the old match block rendered nothing for
  // all of them.
  it("names a trade that runs only from you to them", () => {
    const table = tradeTable({ theirPile, theirWishlist, myPileNames: ["Nibiru"] });
    expect(table.youGet).toEqual([]);
    expect(table.youGive).toHaveLength(1);
    expect(table.kind).toBe(YOU_GIVE);
  });

  it("names a trade that runs only from them to you", () => {
    const table = tradeTable({ theirPile, theirWishlist, myWishNames: ["Droll"] });
    expect(table.kind).toBe(YOU_GET);
  });

  it("reports no overlap as a state, not as an absence", () => {
    expect(tradeTable({ theirPile, theirWishlist }).kind).toBe(NONE);
    expect(tradeTable().kind).toBe(NONE);
  });
});

// Which colour each state is drawn in lives in the stylesheet, not here — see
// the trader guard in palette.test.js, which asserts amethyst on the receiving
// arm and pink on the giving one straight off the CSS.
describe("tableKind", () => {
  it("names the one case where both sides are live", () => {
    expect(tableKind(2, 3)).toBe(MUTUAL);
  });

  it("tells the two one-way cases apart, because they point opposite ways", () => {
    expect(tableKind(2, 0)).toBe(YOU_GET);
    expect(tableKind(0, 2)).toBe(YOU_GIVE);
  });

  it("has a name for a table with nothing on it", () => {
    expect(tableKind(0, 0)).toBe(NONE);
    expect(tableKind()).toBe(NONE);
  });
});
