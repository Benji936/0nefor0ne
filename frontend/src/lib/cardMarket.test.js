import { describe, it, expect } from "vitest";
import { countMarket, marketKind, NONE, HELD, WANTED, BOTH } from "./cardMarket.js";

const held  = (trader, status = "available") => ({ trader, wish: false, status });
const want  = (trader, status = "available") => ({ trader, wish: true,  status });

describe("marketKind names the four states a card can be in", () => {
  it("is none when nobody is on either side", () => {
    expect(marketKind(0, 0)).toBe(NONE);
  });

  it("is held when somebody has it and nobody wants it", () => {
    expect(marketKind(2, 0)).toBe(HELD);
  });

  it("is wanted when somebody wants it and nobody has it", () => {
    expect(marketKind(0, 4)).toBe(WANTED);
  });

  it("is both only when both sides are live", () => {
    expect(marketKind(1, 1)).toBe(BOTH);
  });

  it("defaults to none rather than throwing on missing counts", () => {
    expect(marketKind()).toBe(NONE);
  });
});

describe("countMarket counts people, not rows", () => {
  it("collapses several copies held by one trader into one holder", () => {
    // The bug this exists to prevent: "3 have it" over a single name.
    const rows = [held("ana"), held("ana"), held("ana")];
    expect(countMarket(rows)).toEqual({ holders: 1, wanters: 0, kind: HELD });
  });

  it("counts each side separately", () => {
    const rows = [held("ana"), held("ben"), want("cleo")];
    expect(countMarket(rows)).toEqual({ holders: 2, wanters: 1, kind: BOTH });
  });

  it("lets one trader be on both sides without cancelling out", () => {
    // Wanting a second copy of a card you already have is ordinary.
    const rows = [held("ana"), want("ana")];
    expect(countMarket(rows)).toEqual({ holders: 1, wanters: 1, kind: BOTH });
  });
});

describe("countMarket leaves out cards that are not in circulation", () => {
  it("drops traded and locked copies", () => {
    const rows = [held("ana", "traded"), held("ben", "locked"), held("cleo")];
    expect(countMarket(rows).holders).toBe(1);
  });

  it("keeps a row whose status was never set", () => {
    // `status <> 'traded'` is NULL for a NULL status, so a PostgREST .neq()
    // filter would drop this row. Absence of a status means available.
    expect(countMarket([held("ana", null)]).holders).toBe(1);
    expect(countMarket([{ trader: "ben", wish: false }]).holders).toBe(1);
  });
});

describe("countMarket leaves the viewer out of their own market", () => {
  it("does not count you as somebody you could trade with", () => {
    const rows = [held("me"), held("ana")];
    expect(countMarket(rows, "me")).toEqual({ holders: 1, wanters: 0, kind: HELD });
  });

  it("can empty a side entirely, which is the honest answer", () => {
    expect(countMarket([held("me")], "me")).toEqual({ holders: 0, wanters: 0, kind: NONE });
  });

  it("counts everyone when nobody is signed in", () => {
    expect(countMarket([held("me"), held("ana")], null).holders).toBe(2);
  });
});

describe("countMarket survives what the database can actually hand it", () => {
  it("treats no rows and no argument alike", () => {
    expect(countMarket([])).toEqual({ holders: 0, wanters: 0, kind: NONE });
    expect(countMarket(null)).toEqual({ holders: 0, wanters: 0, kind: NONE });
    expect(countMarket(undefined)).toEqual({ holders: 0, wanters: 0, kind: NONE });
  });

  it("skips a row with no trader instead of counting a ghost", () => {
    expect(countMarket([{ trader: null, wish: false }, held("ana")]).holders).toBe(1);
  });
});
