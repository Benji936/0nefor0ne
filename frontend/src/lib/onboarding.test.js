import { describe, it, expect } from "vitest";
import {
  STEPS, SKIP_KEY, stepIndex, nextStep, prevStep, normalizeStep,
  isEmptyAccount, needsOnboarding, readSkipped, writeSkipped, divertsFrom,
} from "./onboarding";

/** Minimal in-memory Storage stand-in. */
function fakeStorage(initial = {}) {
  const map = { ...initial };
  return {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); },
    _map: map,
  };
}

/** A Storage that throws, as Safari does in private mode. */
const hostileStorage = {
  getItem() { throw new Error("SecurityError"); },
  setItem() { throw new Error("SecurityError"); },
};

describe("step sequence", () => {
  it("walks forward to the end and stops", () => {
    expect(nextStep("trade")).toBe("wish");
    expect(nextStep("wish")).toBe("done");
    expect(nextStep("done")).toBe(null);
  });

  it("walks back to the start and stops", () => {
    expect(prevStep("done")).toBe("wish");
    expect(prevStep("wish")).toBe("trade");
    expect(prevStep("trade")).toBe(null);
  });

  it("sends an unknown step to the beginning, not the end", () => {
    // A stale or hand-edited ?step= must start the flow. Returning null here
    // would read as "already finished" and skip the whole thing.
    expect(nextStep("nonsense")).toBe(STEPS[0]);
    expect(prevStep("nonsense")).toBe(null);
    expect(stepIndex("nonsense")).toBe(-1);
  });

  it("normalizes junk to the first step", () => {
    expect(normalizeStep("wish")).toBe("wish");
    expect(normalizeStep("nonsense")).toBe("trade");
    expect(normalizeStep(undefined)).toBe("trade");
    expect(normalizeStep(null)).toBe("trade");
    expect(normalizeStep(2)).toBe("trade");
  });
});

describe("isEmptyAccount", () => {
  it("is empty when either pile is empty", () => {
    expect(isEmptyAccount({ tradeCount: 0, wishCount: 0 })).toBe(true);
    expect(isEmptyAccount({ tradeCount: 9, wishCount: 0 })).toBe(true);
    expect(isEmptyAccount({ tradeCount: 0, wishCount: 9 })).toBe(true);
  });

  it("is not empty only when both piles have something", () => {
    expect(isEmptyAccount({ tradeCount: 1, wishCount: 1 })).toBe(false);
  });

  it("treats missing counts and no argument as empty", () => {
    expect(isEmptyAccount({})).toBe(true);
    expect(isEmptyAccount()).toBe(true);
  });

  it("does not treat a negative count as populated", () => {
    expect(isEmptyAccount({ tradeCount: -1, wishCount: 5 })).toBe(true);
  });
});

describe("needsOnboarding", () => {
  it("sends an empty account to the flow", () => {
    expect(needsOnboarding({ tradeCount: 0, wishCount: 0 })).toBe(true);
  });

  it("leaves a populated account alone", () => {
    expect(needsOnboarding({ tradeCount: 4, wishCount: 2 })).toBe(false);
  });

  it("respects a skip even while the account is still empty", () => {
    expect(needsOnboarding({ tradeCount: 0, wishCount: 0, skipped: true })).toBe(false);
  });

  it("does not resurrect the flow for a populated account that also skipped", () => {
    expect(needsOnboarding({ tradeCount: 7, wishCount: 7, skipped: true })).toBe(false);
  });
});

describe("divertsFrom", () => {
  it("diverts from the surfaces that are blank without a collection", () => {
    for (const name of ["home", "dashboard", "TradeCenter", "library", "decks"]) {
      expect(divertsFrom(name)).toBe(true);
    }
  });

  // The real protection: these pages were asked for by name, usually from a
  // link somebody sent. Redirecting off one is worse than the empty app.
  it("never diverts away from a page the visitor asked for", () => {
    for (const name of [
      "card", "set", "archetype", "combo", "cards",
      "tradeDetail", "trader", "community", "communityProfile", "communityVerify",
      "deckDetail", "account", "privacy", "terms", "built-with",
    ]) {
      expect(divertsFrom(name)).toBe(false);
    }
  });

  it("never diverts away from the first run itself", () => {
    // Would be a redirect loop: /start is not in the allowlist, and must not be.
    expect(divertsFrom("start")).toBe(false);
  });

  it("does not divert on an unknown or missing route name", () => {
    expect(divertsFrom("somethingNew")).toBe(false);
    expect(divertsFrom(undefined)).toBe(false);
    expect(divertsFrom(null)).toBe(false);
  });
});

describe("skip persistence", () => {
  it("round-trips through storage", () => {
    const s = fakeStorage();
    expect(readSkipped(s)).toBe(false);
    writeSkipped(s);
    expect(s._map[SKIP_KEY]).toBe("true");
    expect(readSkipped(s)).toBe(true);
  });

  it("can be cleared", () => {
    const s = fakeStorage({ [SKIP_KEY]: "true" });
    writeSkipped(s, false);
    expect(readSkipped(s)).toBe(false);
  });

  it("reads false for anything that is not the literal string true", () => {
    expect(readSkipped(fakeStorage({ [SKIP_KEY]: "1" }))).toBe(false);
    expect(readSkipped(fakeStorage({ [SKIP_KEY]: "yes" }))).toBe(false);
    expect(readSkipped(fakeStorage())).toBe(false);
  });

  it("survives no storage at all (SSR)", () => {
    expect(readSkipped(undefined)).toBe(false);
    expect(readSkipped(null)).toBe(false);
    expect(() => writeSkipped(undefined)).not.toThrow();
  });

  it("survives storage that throws (Safari private mode)", () => {
    expect(readSkipped(hostileStorage)).toBe(false);
    expect(() => writeSkipped(hostileStorage)).not.toThrow();
  });
});
