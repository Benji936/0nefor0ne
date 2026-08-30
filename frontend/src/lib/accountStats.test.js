import { describe, it, expect, vi, beforeEach } from "vitest";
import { isYourMove } from "./proposalQueue";

/** The last query builder handed out, so a test can inspect what was asked for. */
let deckQuery;
/** Every table name select()ed through the fake client, in order. */
let tablesTouched;
/** What the decks count query should answer with. */
let deckResult;

vi.mock("./supabaseClient", () => ({
  getClient: () => ({
    from(table) {
      tablesTouched.push(table);
      deckQuery = {
        _select: null,
        _eq: {},
        select(cols, opts) { this._select = { cols, opts }; return this; },
        eq(col, val) { this._eq[col] = val; return Promise.resolve(deckResult).then((r) => ({ ...r, _q: this })); },
      };
      return deckQuery;
    },
  }),
}));

const fetchPileCounts = vi.fn();
const fetchMyProposals = vi.fn();
vi.mock("./onboarding", () => ({ fetchPileCounts: (...a) => fetchPileCounts(...a) }));
vi.mock("./proposals", () => ({ fetchMyProposals: (...a) => fetchMyProposals(...a) }));

const {
  fetchDeckCount, awaitingAnswerCount, openTradesCount,
  createStatsGeneration, loadAccountStats,
} = await import("./accountStats");

/** A proposal row in the shape fetch_my_proposals returns. The photo flags are
 *  part of that shape and isYourMove reads them, so they are not optional here:
 *  a row missing i_uploaded looks like one whose owner still owes a photo. */
const p = (status, iAmProposer, over = {}) =>
  ({ status, i_am_proposer: iAmProposer, i_uploaded: true, they_uploaded: true, ...over });

beforeEach(() => {
  tablesTouched = [];
  deckResult = { count: 0, error: null };
  fetchPileCounts.mockReset().mockResolvedValue({ tradeCount: 0, wishCount: 0 });
  fetchMyProposals.mockReset().mockResolvedValue([]);
});

describe("proposal derivations", () => {
  // AC13's worked example, kept literal so the numbers can be checked by eye.
  const mixed = [
    p("pending", false), p("pending", false),                    // 2 yours to answer
    p("pending", true), p("pending", true), p("pending", true),  // 3 waiting on them
    p("accepted", true),                                         // 1 live, and yours to confirm
  ];

  it("counts every trade whose next move is the user's (AC13, AC14)", () => {
    // Was "pending proposals you did not send", which is what the number under
    // a card labelled "Waiting on you" must not mean any more: an accepted
    // trade waits on your half of the receipt, and it is in this figure.
    expect(awaitingAnswerCount(mixed)).toBe(3);
  });

  it("counts a trade you sent but have not confirmed as waiting on you", () => {
    // The case the old "did not send it" rule got wrong, and the reason the
    // proposals page stopped filing trades by who started them.
    const mine = p("pending", true, {
      workflow_phase: "agreement", revision: 4, i_agreed_revision: 3,
    });
    expect(awaitingAnswerCount([mine])).toBe(1);
  });

  it("counts pending in both directions plus accepted as open (AC13)", () => {
    expect(openTradesCount(mixed)).toBe(6);
  });

  it("does not count settled trades as open (AC16)", () => {
    // The trap this test exists for: proposals.length would answer 4 here.
    const settled = [p("completed", true), p("completed", false), p("cancelled", true), p("declined", false)];
    expect(openTradesCount(settled)).toBe(0);
    expect(awaitingAnswerCount(settled)).toBe(0);
  });

  it("agrees with the Trade Center badge on the same rows (AC14)", () => {
    // TradeCenter.vue's badge and the proposals page's first pile are both
    // `filter(isYourMove)`. Kept here so a change on any of the three has to
    // break a test rather than drift quietly.
    expect(awaitingAnswerCount(mixed)).toBe(mixed.filter(isYourMove).length);
  });

  it("handles an empty proposal list", () => {
    expect(awaitingAnswerCount([])).toBe(0);
    expect(openTradesCount([])).toBe(0);
  });
});

describe("fetchDeckCount", () => {
  it("asks for a count without rows, scoped to the user", async () => {
    deckResult = { count: 3, error: null };
    await fetchDeckCount("u1");
    expect(tablesTouched).toEqual(["decks"]);
    expect(deckQuery._select.opts).toEqual({ count: "exact", head: true });
    expect(deckQuery._eq.user_id).toBe("u1");
  });

  it("returns the count", async () => {
    deckResult = { count: 3, error: null };
    await expect(fetchDeckCount("u1")).resolves.toBe(3);
  });

  it("returns null, never 0, when the read fails (AC20)", async () => {
    deckResult = { count: null, error: { message: "boom" } };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(fetchDeckCount("u1")).resolves.toBe(null);
    spy.mockRestore();
  });

  it("asks nothing without a user", async () => {
    await expect(fetchDeckCount(null)).resolves.toBe(null);
    expect(tablesTouched).toEqual([]);
  });

  it("reads a null count as zero decks, not as a failure", async () => {
    deckResult = { count: null, error: null };
    await expect(fetchDeckCount("u1")).resolves.toBe(0);
  });
});

describe("loadAccountStats", () => {
  it("fires no requests and settles every group for a guest (AC22, AC23)", async () => {
    const stats = loadAccountStats(null);
    const groups = await Promise.all([stats.decks, stats.collection, stats.proposals]);
    expect(groups.every((g) => g.status === "guest")).toBe(true);
    expect(groups.every((g) => g.data === null)).toBe(true);
    expect(tablesTouched).toEqual([]);
    expect(fetchPileCounts).not.toHaveBeenCalled();
    expect(fetchMyProposals).not.toHaveBeenCalled();
  });

  it("returns each group's numbers when every source answers", async () => {
    deckResult = { count: 2, error: null };
    fetchPileCounts.mockResolvedValue({ tradeCount: 12, wishCount: 5 });
    // Two open trades, only one of them waiting on this user: the accepted one
    // already has their confirmation on it. Keeps `awaiting` and `open`
    // distinct, so a mix-up between them cannot pass.
    fetchMyProposals.mockResolvedValue([
      p("pending", false),
      p("accepted", true, { i_confirmed: true }),
    ]);

    const stats = loadAccountStats("u1");
    expect(await stats.decks).toEqual({ status: "ready", data: { count: 2 } });
    expect(await stats.collection).toEqual({ status: "ready", data: { tradeCount: 12, wishCount: 5 } });
    expect(await stats.proposals).toEqual({ status: "ready", data: { awaiting: 1, open: 2, total: 2 } });
  });

  it("separates never-traded from nothing-open (AC15, AC16)", async () => {
    fetchMyProposals.mockResolvedValue([]);
    expect((await loadAccountStats("u1").proposals).data.total).toBe(0);

    fetchMyProposals.mockResolvedValue([p("completed", true), p("cancelled", false)]);
    const settled = (await loadAccountStats("u1").proposals).data;
    expect(settled).toEqual({ awaiting: 0, open: 0, total: 2 });
  });

  it("keeps a failing source from blanking the others (AC19)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    deckResult = { count: null, error: { message: "boom" } };
    fetchPileCounts.mockResolvedValue({ tradeCount: 4, wishCount: 1 });
    fetchMyProposals.mockResolvedValue([p("pending", false)]);

    const stats = loadAccountStats("u1");
    expect(await stats.decks).toEqual({ status: "error", data: null });
    expect((await stats.collection).status).toBe("ready");
    expect((await stats.proposals).status).toBe("ready");
    spy.mockRestore();
  });

  it("never rejects, even though fetchMyProposals throws (AC19, AC21)", async () => {
    fetchMyProposals.mockRejectedValue(new Error("rpc down"));
    fetchPileCounts.mockResolvedValue(null);
    const stats = loadAccountStats("u1");
    expect(await stats.proposals).toEqual({ status: "error", data: null });
    expect(await stats.collection).toEqual({ status: "error", data: null });
  });

  it("gives a failed group no number to render (AC20)", async () => {
    fetchPileCounts.mockResolvedValue(null);
    const group = await loadAccountStats("u1").collection;
    expect(group.status).toBe("error");
    expect(group.data).toBe(null);
  });

  it("starts all three sources at once rather than in sequence", () => {
    loadAccountStats("u1");
    // Synchronous by contract: every source is already in flight before the
    // caller has awaited anything, which is what lets each group settle alone.
    expect(fetchPileCounts).toHaveBeenCalledTimes(1);
    expect(fetchMyProposals).toHaveBeenCalledTimes(1);
    expect(tablesTouched).toEqual(["decks"]);
  });
});

describe("createStatsGeneration (AC24)", () => {
  it("treats only the newest token as current", () => {
    const gen = createStatsGeneration();
    const first = gen.next();
    expect(gen.isCurrent(first)).toBe(true);
    const second = gen.next();
    expect(gen.isCurrent(second)).toBe(true);
    expect(gen.isCurrent(first)).toBe(false);
  });

  it("discards a slow result that resolves after a newer load started", async () => {
    const gen = createStatsGeneration();
    let painted = null;

    // The stale load: started first, resolves last.
    const slow = gen.next();
    const stale = Promise.resolve({ count: 99 }).then(async (r) => {
      await new Promise((done) => setTimeout(done, 10));
      if (gen.isCurrent(slow)) painted = r.count;
    });

    // A newer load supersedes it before the first one lands.
    const fast = gen.next();
    await Promise.resolve({ count: 1 }).then((r) => {
      if (gen.isCurrent(fast)) painted = r.count;
    });
    await stale;

    expect(painted).toBe(1);
  });

  it("keeps generations independent per instance", () => {
    const a = createStatsGeneration();
    const b = createStatsGeneration();
    const tokenA = a.next();
    b.next(); b.next();
    expect(a.isCurrent(tokenA)).toBe(true);
  });
});
