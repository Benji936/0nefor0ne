import { describe, it, expect } from "vitest";
import {
  PROPOSAL_FILTERS, isDone, isCancelled, splitHistory, resolveFilter,
} from "./proposalFilters.js";

describe("splitHistory", () => {
  const history = [
    { id: 1, status: "completed" },
    { id: 2, status: "cancelled" },
    { id: 3, status: "declined"  },
    { id: 4, status: "completed" },
  ];

  it("sends completed trades to done and the rest to cancelled", () => {
    const { done, cancelled } = splitHistory(history);
    expect(done.map(p => p.id)).toEqual([1, 4]);
    expect(cancelled.map(p => p.id)).toEqual([2, 3]);
  });

  it("loses nothing: every history row lands in exactly one group", () => {
    const { done, cancelled } = splitHistory(history);
    expect(done.length + cancelled.length).toBe(history.length);
    expect(done.filter(p => cancelled.includes(p))).toEqual([]);
  });

  it("treats a declined proposal as cancelled, not as done", () => {
    // The one case worth pinning: 'declined' has no chip of its own, and
    // filing it under done would tell somebody a refused trade completed.
    expect(isCancelled("declined")).toBe(true);
    expect(isDone("declined")).toBe(false);
  });

  it("does not count an accepted trade as done", () => {
    // Accepted is an agreement, not an exchange.
    expect(isDone("accepted")).toBe(false);
    expect(isCancelled("accepted")).toBe(false);
  });

  it("survives a missing list and rows without a status", () => {
    expect(splitHistory()).toEqual({ done: [], cancelled: [] });
    expect(splitHistory([{ id: 9 }])).toEqual({ done: [], cancelled: [] });
  });
});

describe("resolveFilter", () => {
  const counts = (over = {}) =>
    ({ incoming: 0, outgoing: 0, accepted: 0, done: 0, cancelled: 0, ...over });

  it("keeps the current filter while it still has rows", () => {
    expect(resolveFilter(counts({ incoming: 2, done: 5 }), "done")).toBe("done");
  });

  it("moves off a filter that has emptied", () => {
    // Without an "All" chip there is no safe fallback to sit on, so an empty
    // group has to hand over rather than show a blank page.
    expect(resolveFilter(counts({ outgoing: 1 }), "incoming")).toBe("outgoing");
  });

  it("opens on what needs an answer before what is finished", () => {
    expect(resolveFilter(counts({ incoming: 1, accepted: 3, done: 9 }), null)).toBe("incoming");
    expect(resolveFilter(counts({ accepted: 3, done: 9 }), null)).toBe("accepted");
    expect(resolveFilter(counts({ done: 9, cancelled: 2 }), null)).toBe("done");
    expect(resolveFilter(counts({ cancelled: 2 }), null)).toBe("cancelled");
  });

  it("returns null when there is nothing at all", () => {
    expect(resolveFilter(counts(), null)).toBe(null);
    expect(resolveFilter(counts(), "incoming")).toBe(null);
  });

  it("offers no 'all' filter", () => {
    expect(PROPOSAL_FILTERS).not.toContain("all");
    expect(PROPOSAL_FILTERS).toEqual(["incoming", "outgoing", "accepted", "done", "cancelled"]);
  });
});
