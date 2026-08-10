import { describe, it, expect } from "vitest";
import { nameKey, nameProblem, groupByList, MAX_NAME_LEN, UNSORTED } from "./wishlists.js";

describe("nameKey", () => {
  it("treats case and spacing the way the unique index does", () => {
    expect(nameKey("  chase   CARDS ")).toBe(nameKey("Chase Cards"));
  });

  it("keeps genuinely different names apart", () => {
    expect(nameKey("Chase cards")).not.toBe(nameKey("Chase card"));
  });
});

describe("nameProblem", () => {
  const lists = [{ id: 1, name: "Chase cards" }, { id: 2, name: "Staples" }];

  it("refuses an empty name", () => {
    expect(nameProblem("", lists)).toBe("empty");
  });

  it("refuses a name that is only whitespace", () => {
    expect(nameProblem("   ", lists)).toBe("empty");
  });

  it("refuses a name past the column's limit", () => {
    expect(nameProblem("x".repeat(MAX_NAME_LEN + 1), lists)).toBe("too_long");
  });

  it("accepts a name exactly at the limit", () => {
    expect(nameProblem("x".repeat(MAX_NAME_LEN), lists)).toBeNull();
  });

  it("catches a duplicate before the database has to", () => {
    expect(nameProblem("  chase CARDS ", lists)).toBe("duplicate");
  });

  it("lets a list keep its own name while being renamed", () => {
    expect(nameProblem("Chase cards", lists, 1)).toBeNull();
  });

  it("still catches a rename onto another list's name", () => {
    expect(nameProblem("Staples", lists, 1)).toBe("duplicate");
  });

  it("accepts a new, distinct name", () => {
    expect(nameProblem("Side deck", lists)).toBeNull();
  });
});

describe("groupByList", () => {
  const lists = [{ id: 1, name: "Chase" }, { id: 2, name: "Staples" }];

  it("puts each card under its list", () => {
    const groups = groupByList(lists, [
      { id: 10, wishlist: 1 },
      { id: 11, wishlist: 2 },
      { id: 12, wishlist: 1 },
    ]);
    expect(groups.map((g) => g.name)).toEqual(["Chase", "Staples"]);
    expect(groups[0].cards.map((c) => c.id)).toEqual([10, 12]);
    expect(groups[1].cards.map((c) => c.id)).toEqual([11]);
  });

  it("shows an empty list rather than hiding it", () => {
    const groups = groupByList(lists, [{ id: 10, wishlist: 1 }]);
    expect(groups).toHaveLength(2);
    expect(groups[1].cards).toEqual([]);
  });

  it("collects unfiled cards into an unsorted group, last", () => {
    const groups = groupByList(lists, [{ id: 10, wishlist: null }, { id: 11, wishlist: 1 }]);
    expect(groups.at(-1).id).toBe(UNSORTED);
    expect(groups.at(-1).cards.map((c) => c.id)).toEqual([10]);
  });

  it("omits the unsorted group when everything is filed", () => {
    const groups = groupByList(lists, [{ id: 10, wishlist: 1 }]);
    expect(groups.some((g) => g.id === UNSORTED)).toBe(false);
  });

  it("does not lose a card pointing at a list that is gone", () => {
    // The database nulls these on delete, but a stale client copy can still
    // carry the old id, and a card that vanishes from the page reads as data loss.
    const groups = groupByList(lists, [{ id: 10, wishlist: 999 }]);
    expect(groups.at(-1).id).toBe(UNSORTED);
    expect(groups.at(-1).cards.map((c) => c.id)).toEqual([10]);
  });

  it("survives being handed nothing", () => {
    expect(groupByList()).toEqual([]);
    expect(groupByList([], [])).toEqual([]);
  });

  it("returns only unsorted when there are no lists yet", () => {
    const groups = groupByList([], [{ id: 10, wishlist: null }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe(UNSORTED);
  });
});
