import { describe, it, expect } from "vitest";
import { tradeErrorKey, isStaleTradeError } from "./tradeErrors.js";

// The strings below are copied verbatim from the RAISE EXCEPTION lines in
// accept_trade, decline_trade and cancel_trade. If those change, these fail,
// which is the point.
describe("tradeErrorKey", () => {
  it("reads a status clash as the trade having moved on", () => {
    expect(tradeErrorKey(new Error("Trade is not pending (current status: accepted)"))).toBe("tradeError.stale");
    expect(tradeErrorKey(new Error("trade cannot be cancelled (current status: declined)"))).toBe("tradeError.stale");
    expect(tradeErrorKey(new Error("can only decline a pending proposal (current: cancelled)"))).toBe("tradeError.stale");
  });

  it("reads a permission failure as not yours to act on", () => {
    expect(tradeErrorKey(new Error("Only the counterparty may accept this trade"))).toBe("tradeError.notYours");
    expect(tradeErrorKey(new Error("only the recipient can decline a proposal"))).toBe("tradeError.notYours");
    expect(tradeErrorKey(new Error("not a participant of this trade"))).toBe("tradeError.notYours");
  });

  it("recognises a missing trade and a dead session", () => {
    expect(tradeErrorKey(new Error("trade 42 not found"))).toBe("tradeError.gone");
    expect(tradeErrorKey(new Error("Trade not found"))).toBe("tradeError.gone");
    expect(tradeErrorKey(new Error("not authenticated"))).toBe("tradeError.signedOut");
  });

  it("prefers the status reading when a message could be read either way", () => {
    // decline_trade raises this when the trade is no longer pending; the useful
    // half is "it moved on", not "you are the wrong person".
    expect(tradeErrorKey(new Error("can only decline a pending proposal (current: accepted)")))
      .toBe("tradeError.stale");
  });

  it("falls back rather than guessing", () => {
    expect(tradeErrorKey(new Error("connection reset by peer"))).toBe("tradeError.generic");
    expect(tradeErrorKey(null)).toBe("tradeError.generic");
    expect(tradeErrorKey({})).toBe("tradeError.generic");
    expect(tradeErrorKey(new Error(""), "custom.key")).toBe("custom.key");
  });

  it("accepts a bare string as well as an Error", () => {
    expect(tradeErrorKey("Only the counterparty may accept this trade")).toBe("tradeError.notYours");
  });
});

describe("isStaleTradeError", () => {
  it("is true only for the moved-on case, since that is the one that reloads", () => {
    expect(isStaleTradeError(new Error("Trade is not pending (current status: accepted)"))).toBe(true);
    expect(isStaleTradeError(new Error("not a participant of this trade"))).toBe(false);
    expect(isStaleTradeError(new Error("connection reset"))).toBe(false);
  });
});
