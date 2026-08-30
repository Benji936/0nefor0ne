import { describe, it, expect } from "vitest";
import {
  POCKETS_PER_PAGE,
  pageCount,
  viewCount,
  clampView,
  openPages,
  nextView,
} from "./binderPaging";

const pile = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Card ${i + 1}` }));

describe("pageCount", () => {
  it("fills one page per nine cards", () => {
    expect(pageCount(9)).toBe(1);
    expect(pageCount(18)).toBe(2);
    expect(pageCount(10)).toBe(2);
  });

  // An empty binder still draws a page. Collapsing to zero pages would show a
  // blank panel, which reads as a load failure rather than as an empty pile.
  it("never reports fewer than one page", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(-4)).toBe(1);
    expect(pageCount(NaN)).toBe(1);
  });
});

describe("viewCount", () => {
  it("pairs pages into spreads when two fit", () => {
    expect(viewCount(4, 2)).toBe(2);
    expect(viewCount(25, 2)).toBe(13);
  });

  it("gives one view per page when only one fits", () => {
    expect(viewCount(4, 1)).toBe(4);
  });

  it("treats a missing or zero pagesPerView as one", () => {
    expect(viewCount(3, 0)).toBe(3);
    expect(viewCount(3, undefined)).toBe(3);
  });
});

describe("clampView", () => {
  // Narrowing the window folds two pages into one and halves the view count.
  // Somebody reading spread 6 of 13 must not end up past the back cover.
  it("pulls a view back inside the binder when the count shrinks", () => {
    expect(clampView(6, 4)).toBe(3);
  });

  it("leaves a view alone when it still fits", () => {
    expect(clampView(2, 13)).toBe(2);
  });

  it("floors at the first view", () => {
    expect(clampView(-1, 5)).toBe(0);
    expect(clampView(3, 0)).toBe(0);
  });
});

describe("openPages", () => {
  it("opens two facing pages, numbered from one", () => {
    const open = openPages(pile(30), 1, 2);
    expect(open.map((p) => p.number)).toEqual([3, 4]);
    expect(open[0].pockets[0].name).toBe("Card 19");
  });

  it("opens a single page when only one fits", () => {
    const open = openPages(pile(30), 2, 1);
    expect(open.map((p) => p.number)).toEqual([3]);
    expect(open[0].pockets[0].name).toBe("Card 19");
  });

  // The last leaf of a real binder has empty pockets in it. Without the pad the
  // page is short and the binder changes height as you turn onto it.
  it("pads the last page out to nine pockets", () => {
    const open = openPages(pile(11), 0, 2);
    expect(open).toHaveLength(2);
    expect(open[1].pockets).toHaveLength(POCKETS_PER_PAGE);
    expect(open[1].pockets.filter(Boolean)).toHaveLength(2);
    expect(open[1].pockets[8]).toBeNull();
  });

  it("stops at the last page rather than opening a blank one", () => {
    // 10 cards is two pages; the second spread would be pages 3 and 4.
    expect(openPages(pile(10), 0, 2).map((p) => p.number)).toEqual([1, 2]);
    expect(openPages(pile(10), 1, 2)).toEqual([]);
  });

  it("draws a page of empty pockets for an empty pile", () => {
    const open = openPages([], 0, 2);
    expect(open).toHaveLength(1);
    expect(open[0].pockets).toHaveLength(POCKETS_PER_PAGE);
    expect(open[0].pockets.every((p) => p === null)).toBe(true);
  });

  it("survives a non-array pile", () => {
    expect(openPages(null, 0, 2)[0].pockets).toHaveLength(POCKETS_PER_PAGE);
  });
});

describe("nextView", () => {
  it("moves one spread at a time", () => {
    expect(nextView(0, 4, 1)).toBe(1);
    expect(nextView(2, 4, -1)).toBe(1);
  });

  // Returned rather than applied, so the component does not start a turn
  // animation it would immediately have to cancel.
  it("refuses to turn past either cover", () => {
    expect(nextView(0, 4, -1)).toBeNull();
    expect(nextView(3, 4, 1)).toBeNull();
  });
});
