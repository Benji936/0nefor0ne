import { describe, it, expect } from "vitest";
import { communityMenuTarget } from "./communityMenu";

describe("communityMenuTarget", () => {
  it("returns null when the user owns no communities", () => {
    expect(communityMenuTarget([], "en")).toBeNull();
  });
  it("returns null for a missing/invalid slug list", () => {
    expect(communityMenuTarget(null, "en")).toBeNull();
    expect(communityMenuTarget(undefined, "en")).toBeNull();
  });
  it("routes a single owner straight to their community profile", () => {
    expect(communityMenuTarget(["my-store"], "fr")).toEqual({
      name: "communityProfile",
      params: { locale: "fr", slug: "my-store" },
    });
  });
  it("routes a multi-owner to the account list", () => {
    expect(communityMenuTarget(["a", "b"], "de")).toEqual({
      name: "account",
      params: { locale: "de" },
    });
  });
  it("defaults the locale to 'en' when omitted", () => {
    expect(communityMenuTarget(["x"]).params.locale).toBe("en");
  });
});
