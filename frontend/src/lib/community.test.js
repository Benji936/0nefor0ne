import { describe, it, expect } from "vitest";
import * as community from "./community";

describe("community data-access module", () => {
  it("compiles and exports the expected data-access functions", () => {
    const expected = [
      "fetchDirectory", "fetchBySlug", "createCommunity",
      "updateCommunity", "claimCommunity", "reportCommunity", "fetchMyCommunities",
    ];
    for (const name of expected) expect(typeof community[name]).toBe("function");
  });
});
