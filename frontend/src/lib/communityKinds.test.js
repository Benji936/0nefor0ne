import { describe, it, expect } from "vitest";
import { kindsOf, normalizeKinds, primaryKind, strictestKind } from "./communityKinds";

describe("kindsOf", () => {
  it("reads the kinds array when there is one", () => {
    expect(kindsOf({ kinds: ["discord", "store"], kind: "discord" })).toEqual(["discord", "store"]);
  });

  // Rows from a narrower select, or anything cached from before the column
  // existed, still have to render.
  it("falls back to the single kind column", () => {
    expect(kindsOf({ kind: "store" })).toEqual(["store"]);
    expect(kindsOf({ kinds: null, kind: "group" })).toEqual(["group"]);
    expect(kindsOf({ kinds: [], kind: "group" })).toEqual(["group"]);
  });

  it("drops values that are not kinds", () => {
    expect(kindsOf({ kinds: ["store", "banana"] })).toEqual(["store"]);
  });

  it("returns nothing for nothing", () => {
    expect(kindsOf(null)).toEqual([]);
    expect(kindsOf({})).toEqual([]);
  });
});

describe("normalizeKinds", () => {
  it("keeps order and drops repeats, first occurrence winning", () => {
    expect(normalizeKinds(["discord", "store", "discord"])).toEqual(["discord", "store"]);
  });

  it("drops unknown values", () => {
    expect(normalizeKinds(["store", "", null, "nope"])).toEqual(["store"]);
  });

  it("survives a non-array", () => {
    expect(normalizeKinds(undefined)).toEqual([]);
    expect(normalizeKinds("store")).toEqual([]);
  });
});

describe("primaryKind", () => {
  it("is the first kind, which is the one the directory shows", () => {
    expect(primaryKind({ kinds: ["group", "store"] })).toBe("group");
  });

  it("is null when there is nothing to show", () => {
    expect(primaryKind({})).toBe(null);
  });
});

describe("strictestKind", () => {
  // The rule that keeps the badge honest: claiming to be a shop means proving
  // the shop, whatever easier thing you also are.
  it("picks store over everything", () => {
    expect(strictestKind({ kinds: ["discord", "store"] })).toBe("store");
    expect(strictestKind({ kinds: ["discord", "group", "store"] })).toBe("store");
  });

  it("picks group over discord", () => {
    expect(strictestKind({ kinds: ["discord", "group"] })).toBe("group");
  });

  it("picks discord only when discord is all there is", () => {
    expect(strictestKind({ kinds: ["discord"] })).toBe("discord");
  });

  // Order in the array is the owner's display preference, not a strictness
  // ranking, so leading with discord must not weaken the requirement.
  it("ignores the order the owner chose", () => {
    expect(strictestKind({ kinds: ["discord", "store"] }))
      .toBe(strictestKind({ kinds: ["store", "discord"] }));
  });

  it("is null when there is no known kind", () => {
    expect(strictestKind({ kinds: ["banana"] })).toBe(null);
    expect(strictestKind(null)).toBe(null);
  });
});
