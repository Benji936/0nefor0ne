import { describe, it, expect } from "vitest";
import {
  QUEUE_GROUPS,
  isDone,
  isClosed,
  isOpen,
  isYourMove,
  queueGroup,
  groupProposals,
  queueCounts,
  resolveGroup,
} from "./proposalQueue.js";

/** A staged trade, mid-workflow. Defaults to one waiting on the other side. */
const staged = (over = {}) => ({
  id: 1,
  status: "pending",
  workflow_phase: "agreement",
  revision: 3,
  i_agreed_revision: 3,
  they_agreed_revision: null,
  i_am_proposer: true,
  ...over,
});

/** A pre-workflow trade: no workflow_phase, so tradePhase falls back. */
const legacy = (over = {}) => ({
  id: 2,
  status: "pending",
  i_am_proposer: true,
  i_uploaded: true,
  they_uploaded: true,
  ...over,
});

describe("status predicates", () => {
  it("counts only a completed trade as done", () => {
    expect(isDone("completed")).toBe(true);
    expect(isDone("accepted")).toBe(false);
    expect(isDone("declined")).toBe(false);
  });

  it("files a declined trade with the cancelled ones", () => {
    // Worth pinning: declined has no pile of its own, and filing it under done
    // would tell somebody a refused trade completed.
    expect(isClosed("declined")).toBe(true);
    expect(isClosed("cancelled")).toBe(true);
    expect(isClosed("completed")).toBe(false);
  });

  it("treats pending and accepted as still live", () => {
    expect(isOpen("pending")).toBe(true);
    expect(isOpen("accepted")).toBe(true);
    expect(isOpen("completed")).toBe(false);
    expect(isOpen(undefined)).toBe(false);
  });
});

describe("isYourMove", () => {
  it("is your move when selection is waiting on your return cards", () => {
    expect(isYourMove(staged({ workflow_phase: "selection", i_am_proposer: false }))).toBe(true);
    expect(isYourMove(staged({ workflow_phase: "selection", i_am_proposer: true }))).toBe(false);
  });

  // The case the old incoming/outgoing split got wrong, and the reason this
  // module exists: a trade you sent, now waiting on your confirmation.
  it("is your move when you have not confirmed the current revision, whoever started it", () => {
    expect(isYourMove(staged({ i_am_proposer: true, revision: 4, i_agreed_revision: 3 }))).toBe(true);
    expect(isYourMove(staged({ i_am_proposer: false, revision: 4, i_agreed_revision: 3 }))).toBe(true);
  });

  it("is not your move once you have confirmed and they have not", () => {
    expect(isYourMove(staged({ revision: 3, i_agreed_revision: 3, they_agreed_revision: null }))).toBe(false);
  });

  it("is not your move when both sides have already confirmed", () => {
    expect(isYourMove(staged({ i_agreed_revision: 3, they_agreed_revision: 3 }))).toBe(false);
  });

  it("hands an accepted trade back to you until you confirm your side", () => {
    expect(isYourMove({ status: "accepted", i_confirmed: false })).toBe(true);
    expect(isYourMove({ status: "accepted", i_confirmed: true })).toBe(false);
  });

  // Photos are advisory, not a gate. Once you have confirmed there is nothing
  // left for you to do, missing photo or not.
  it("does not reopen a confirmed exchange over a missing photo", () => {
    expect(isYourMove({ status: "accepted", i_confirmed: true, i_uploaded: false })).toBe(false);
  });

  it("gives a legacy proposal to whoever has to answer it", () => {
    expect(isYourMove(legacy({ i_am_proposer: false }))).toBe(true);
    expect(isYourMove(legacy({ i_am_proposer: true }))).toBe(false);
  });

  it("counts a legacy proposal missing your own photo as yours", () => {
    expect(isYourMove(legacy({ i_am_proposer: true, i_uploaded: false }))).toBe(true);
    // Theirs missing is theirs to fix.
    expect(isYourMove(legacy({ i_am_proposer: true, they_uploaded: false }))).toBe(false);
  });

  it("is never your move on a settled trade", () => {
    for (const status of ["completed", "declined", "cancelled"]) {
      expect(isYourMove({ status, i_confirmed: false })).toBe(false);
    }
  });

  it("survives a missing row", () => {
    expect(isYourMove(undefined)).toBe(false);
    expect(isYourMove({})).toBe(false);
  });
});

describe("groupProposals", () => {
  const rows = [
    { id: 1, status: "pending",   workflow_phase: "selection", i_am_proposer: false, created_at: "2026-08-01T00:00:00Z" },
    { id: 2, status: "pending",   workflow_phase: "selection", i_am_proposer: true,  created_at: "2026-08-02T00:00:00Z" },
    { id: 3, status: "accepted",  i_confirmed: false, created_at: "2026-07-01T00:00:00Z" },
    { id: 4, status: "completed", created_at: "2026-06-01T00:00:00Z" },
    { id: 5, status: "declined",  created_at: "2026-06-02T00:00:00Z" },
    { id: 6, status: "completed", created_at: "2026-06-03T00:00:00Z" },
  ];
  const ids = (list) => list.map((p) => p.id);

  it("loses nothing: every row lands in exactly one pile", () => {
    const piles = groupProposals(rows);
    const all = [...piles.yours, ...piles.theirs, ...piles.done, ...piles.closed];
    expect(all.length).toBe(rows.length);
    expect(new Set(ids(all)).size).toBe(rows.length);
  });

  it("splits open trades by turn rather than by who started them", () => {
    const piles = groupProposals(rows);
    expect(ids(piles.yours)).toEqual([3, 1]);
    expect(ids(piles.theirs)).toEqual([2]);
  });

  it("runs open piles oldest first, so nothing sinks under this morning's", () => {
    expect(ids(groupProposals(rows).yours)).toEqual([3, 1]);
  });

  it("runs the finished piles newest first", () => {
    const piles = groupProposals(rows);
    expect(ids(piles.done)).toEqual([6, 4]);
    expect(ids(piles.closed)).toEqual([5]);
  });

  it("survives a missing list and rows with no date", () => {
    expect(groupProposals()).toEqual({ yours: [], theirs: [], done: [], closed: [] });
    expect(ids(groupProposals([{ id: 7, status: "completed" }]).done)).toEqual([7]);
  });
});

describe("queueCounts", () => {
  it("reports a number for every pile, including the empty ones", () => {
    expect(queueCounts(groupProposals([{ id: 1, status: "completed" }])))
      .toEqual({ yours: 0, theirs: 0, done: 1, closed: 0 });
  });

  it("survives being handed nothing", () => {
    expect(queueCounts(undefined)).toEqual({ yours: 0, theirs: 0, done: 0, closed: 0 });
  });
});

describe("resolveGroup", () => {
  const counts = (over = {}) => ({ yours: 0, theirs: 0, done: 0, closed: 0, ...over });

  it("keeps the current pile while it still has rows", () => {
    expect(resolveGroup(counts({ yours: 2, done: 5 }), "done")).toBe("done");
  });

  it("moves off a pile that has emptied", () => {
    // With no "everything" segment there is no safe place to sit, so an
    // emptied pile has to hand over rather than show a blank page.
    expect(resolveGroup(counts({ theirs: 1 }), "yours")).toBe("theirs");
  });

  it("opens on what is waiting on you before what is waiting on them", () => {
    expect(resolveGroup(counts({ yours: 1, theirs: 3, done: 9 }), null)).toBe("yours");
    expect(resolveGroup(counts({ theirs: 3, done: 9 }), null)).toBe("theirs");
    expect(resolveGroup(counts({ done: 9, closed: 2 }), null)).toBe("done");
    expect(resolveGroup(counts({ closed: 2 }), null)).toBe("closed");
  });

  it("returns null when there is nothing at all", () => {
    expect(resolveGroup(counts(), null)).toBe(null);
    expect(resolveGroup(counts(), "yours")).toBe(null);
  });

  it("offers no 'everything' pile", () => {
    expect(QUEUE_GROUPS).toEqual(["yours", "theirs", "done", "closed"]);
  });
});
