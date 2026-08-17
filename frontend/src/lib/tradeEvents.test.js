import { describe, it, expect } from "vitest";
import { describeEvent } from "./tradeEvents.js";

/**
 * Exactly the shape `fetch_trade_events` returns. Copied from the function's
 * declared RETURNS TABLE, not from what a view happened to read — reading the
 * consumer instead of the contract is how the blank activity log happened.
 */
const rpcRow = (over = {}) => ({
  id: 1,
  event_type: "created",
  actor_id: "user-a",
  from_status: null,
  to_status: "pending",
  notes: null,
  created_at: "2026-06-29T10:02:00Z",
  ...over,
});

describe("describeEvent", () => {
  it("reads event_type, not type", () => {
    // The bug: `evt.type` is undefined on every row the RPC returns, so every
    // event fell through to the unknown fallback and rendered a blank label
    // beside a correct timestamp.
    const d = describeEvent(rpcRow());
    expect(d.type).toBe("created");
    expect(d.labelKey).toBe("tradeDetail.tradeProposed");
    expect(d.icon).toBe("mdi-plus-circle-outline");
    expect(d.fallbackLabel).toBe(null);
  });

  it("reads actor_id, not actor", () => {
    expect(describeEvent(rpcRow(), "user-a").actorIsMe).toBe(true);
    expect(describeEvent(rpcRow(), "user-b").actorIsMe).toBe(false);
    expect(describeEvent(rpcRow()).hasActor).toBe(true);
  });

  it("maps every event type the database actually stores", () => {
    // created / accepted / cancelled / completed are the four present in
    // production; declined and updated are written by paths not yet exercised.
    for (const type of ["created", "accepted", "declined", "cancelled", "completed", "updated"]) {
      const d = describeEvent(rpcRow({ event_type: type }));
      expect(d.labelKey, type).toBeTruthy();
      expect(d.icon, type).not.toBe("mdi-information-outline");
    }
  });

  it("says something for an event type it does not know", () => {
    const d = describeEvent(rpcRow({ event_type: "reopened" }));
    expect(d.labelKey).toBe(null);
    expect(d.fallbackLabel).toBe("reopened");
  });

  it("treats a missing actor as no actor rather than as the other trader", () => {
    const d = describeEvent(rpcRow({ actor_id: null }), "user-a");
    expect(d.hasActor).toBe(false);
    expect(d.actorIsMe).toBe(false);
  });

  it("only reports a transition when both ends are known", () => {
    expect(describeEvent(rpcRow()).hasTransition).toBe(false);
    expect(describeEvent(rpcRow({ from_status: "pending", to_status: "accepted" })).hasTransition).toBe(true);
  });

  it("passes notes and timestamp through", () => {
    const d = describeEvent(rpcRow({ notes: "Changed my mind." }));
    expect(d.notes).toBe("Changed my mind.");
    expect(d.createdAt).toBe("2026-06-29T10:02:00Z");
  });

  it("does not throw on a null row", () => {
    const d = describeEvent(null);
    expect(d.labelKey).toBe(null);
    expect(d.hasActor).toBe(false);
  });
});
