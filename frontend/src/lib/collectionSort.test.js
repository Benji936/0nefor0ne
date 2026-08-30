import { describe, it, expect } from "vitest";
import { SORT_KEYS, DEFAULT_SORT, sortCollection } from "./collectionSort.js";
import { EXACT, RANGE } from "./cardmarketPrice.js";

const rows = [
  { id: 3, name: "Dark Magician",        extension: "LOB-EN005",  rarity: "Ultra Rare"  },
  { id: 1, name: "Blue-Eyes White Dragon", extension: "LOB-EN001", rarity: "Ultra Rare" },
  { id: 4, name: "Ćwikła",               extension: "DOOD-EN9",   rarity: "Common"      },
  { id: 2, name: "Aleister the Invoker", extension: "DOOD-EN024", rarity: "Common"      },
];

const prices = new Map([
  [1, { kind: EXACT, value: 8975 }],
  [2, { kind: EXACT, value: 0.3 }],
  [3, { kind: RANGE, low: 12, high: 400 }],
  // 4 is deliberately absent: Cardmarket matched nothing.
]);

const ids = (list) => list.map((c) => c.id);

describe("sortCollection", () => {
  it("does not mutate the pile it was handed", () => {
    const before = ids(rows);
    sortCollection(rows, "name", prices);
    expect(ids(rows)).toEqual(before);
  });

  it("files names the way a reader expects, accents included", () => {
    // Ć sorts with C rather than after Z, which a raw codepoint sort would do.
    expect(ids(sortCollection(rows, "name", prices))).toEqual([2, 1, 4, 3]);
  });

  it("puts the best card first when sorting by value", () => {
    expect(ids(sortCollection(rows, "value", prices))).toEqual([1, 3, 2, 4]);
  });

  // The reason a range sorts on its low end: an unresolved printing can span
  // €0.02–€8,975, and reading that as €8,975 would park every unanswered card
  // above every genuinely valuable one.
  it("sorts an unresolved range on its low end, not its high", () => {
    const two = [{ id: 10, name: "A" }, { id: 11, name: "B" }];
    const p = new Map([
      [10, { kind: RANGE, low: 0.02, high: 8975 }],
      [11, { kind: EXACT, value: 40 }],
    ]);
    expect(ids(sortCollection(two, "value", p))).toEqual([11, 10]);
  });

  it("sorts an unpriced card last rather than as free", () => {
    expect(ids(sortCollection(rows, "value", prices)).at(-1)).toBe(4);
  });

  it("orders a printing by set code then rarity, counting numbers as numbers", () => {
    // DOOD-EN9 before DOOD-EN024: a plain string sort puts "024" first.
    expect(ids(sortCollection(rows, "printing", prices))).toEqual([4, 2, 1, 3]);
  });

  it("shows the newest copy first by default, which is the one most likely wrong", () => {
    expect(DEFAULT_SORT).toBe("added");
    expect(ids(sortCollection(rows, "added", prices))).toEqual([4, 3, 2, 1]);
  });

  // The property the missing .order() was costing: two runs, same order.
  it("is total, so rows that tie still land in the same place every render", () => {
    const tied = [
      { id: 2, name: "Same", extension: "A-1", rarity: "Common" },
      { id: 1, name: "Same", extension: "A-1", rarity: "Common" },
      { id: 3, name: "Same", extension: "A-1", rarity: "Common" },
    ];
    const once  = ids(sortCollection(tied, "printing", new Map()));
    const twice = ids(sortCollection([...tied].reverse(), "printing", new Map()));
    expect(once).toEqual(twice);
    expect(once).toEqual([1, 2, 3]);
  });

  it("falls back to the default rather than returning an unsorted pile", () => {
    expect(ids(sortCollection(rows, "nonsense", prices)))
      .toEqual(ids(sortCollection(rows, DEFAULT_SORT, prices)));
  });

  it("survives an empty pile, a missing one, and rows with no price map", () => {
    expect(sortCollection([], "value")).toEqual([]);
    expect(sortCollection(undefined, "name")).toEqual([]);
    expect(ids(sortCollection(rows, "value"))).toHaveLength(rows.length);
  });

  it("offers exactly the four orders the control draws", () => {
    expect(SORT_KEYS).toEqual(["name", "value", "printing", "added"]);
  });
});
