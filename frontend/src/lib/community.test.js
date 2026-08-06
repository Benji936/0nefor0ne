import { describe, it, expect } from "vitest";
import * as community from "./community";
import { giveUpMode } from "./community";

describe("community data-access module", () => {
  it("compiles and exports the expected data-access functions", () => {
    const expected = [
      "fetchDirectory", "fetchBySlug", "createCommunity", "updateCommunity",
      "requestClaimCode", "verifyClaimCode", "requestManualReview",
      "reportCommunity", "fetchMyCommunities",
      "startClaimCheckout", "openBillingPortal", "fetchMyClaim",
      "giveUpMode", "releaseCommunity",
    ];
    for (const name of expected) expect(typeof community[name]).toBe("function");
  });
});

describe("giveUpMode", () => {
  const ME = "user-1";

  it("offers deletion for a community you created", () => {
    expect(giveUpMode({ owner: ME, created_by: ME }, ME)).toBe("delete");
  });

  it("offers release for a seeded row you claimed", () => {
    expect(giveUpMode({ owner: ME, created_by: null }, ME)).toBe("release");
  });

  // Someone else made it and handed it over: still not yours to destroy.
  it("offers release when the creator is another account", () => {
    expect(giveUpMode({ owner: ME, created_by: "user-2" }, ME)).toBe("release");
  });

  it("offers nothing to a visitor", () => {
    expect(giveUpMode({ owner: "user-2", created_by: "user-2" }, ME)).toBe(null);
  });

  it("offers nothing on an unowned community", () => {
    expect(giveUpMode({ owner: null, created_by: null }, ME)).toBe(null);
  });

  // A signed-out viewer and an unowned row both read as null owner; neither may
  // reach the control, and matching them to each other must not open it.
  it("offers nothing when signed out", () => {
    expect(giveUpMode({ owner: null, created_by: null }, null)).toBe(null);
    expect(giveUpMode({ owner: ME, created_by: ME }, null)).toBe(null);
  });

  it("offers nothing without a community", () => {
    expect(giveUpMode(null, ME)).toBe(null);
  });
});
