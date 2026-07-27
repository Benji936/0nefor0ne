import { describe, it, expect } from "vitest";
import * as community from "./community";

describe("community data-access module", () => {
  it("compiles and exports the expected data-access functions", () => {
    const expected = [
      "fetchDirectory", "fetchBySlug", "createCommunity", "updateCommunity",
      "requestClaimCode", "verifyClaimCode", "requestManualReview",
      "reportCommunity", "fetchMyCommunities",
      "startClaimCheckout", "openBillingPortal", "fetchMyClaim",
    ];
    for (const name of expected) expect(typeof community[name]).toBe("function");
  });
});
