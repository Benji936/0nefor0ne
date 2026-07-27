import { describe, it, expect } from "vitest";
import { deriveClaimState, isValidCode } from "./claimState";

describe("deriveClaimState", () => {
  it("is claimable when owner is null", () => {
    expect(deriveClaimState({ owner: null }, "u1")).toBe("claimable");
  });
  it("is owned_by_me when the viewer owns it", () => {
    expect(deriveClaimState({ owner: "u1" }, "u1")).toBe("owned_by_me");
  });
  it("is owned_by_other when someone else owns it", () => {
    expect(deriveClaimState({ owner: "u2" }, "u1")).toBe("owned_by_other");
  });
  it("treats a null community as claimable-safe (no crash)", () => {
    expect(deriveClaimState(null, "u1")).toBe("claimable");
  });
});

describe("isValidCode", () => {
  it("accepts exactly six digits", () => {
    expect(isValidCode("012345")).toBe(true);
  });
  it("rejects wrong length or non-digits", () => {
    expect(isValidCode("12345")).toBe(false);
    expect(isValidCode("1234567")).toBe(false);
    expect(isValidCode("12a456")).toBe(false);
    expect(isValidCode("")).toBe(false);
    expect(isValidCode(null)).toBe(false);
  });
});
