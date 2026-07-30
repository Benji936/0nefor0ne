import { describe, it, expect } from "vitest";
import { sanitizeLinks, isValidLink, linkHref, MAX_LINKS } from "./communityLinks";

describe("sanitizeLinks", () => {
  it("drops empty, unknown, and incomplete rows", () => {
    expect(sanitizeLinks([
      { platform: "instagram", url: "https://instagram.com/x" },
      { platform: "instagram", url: "" },        // no url
      { platform: "", url: "https://x.com" },     // no platform
      { platform: "myspace", url: "https://m.com" }, // unknown
    ])).toEqual([{ platform: "instagram", url: "https://instagram.com/x" }]);
  });

  it("prefixes https:// when a scheme is missing", () => {
    expect(sanitizeLinks([{ platform: "website", url: "shop.example.com" }]))
      .toEqual([{ platform: "website", url: "https://shop.example.com" }]);
  });

  it("leaves an existing scheme untouched", () => {
    expect(sanitizeLinks([{ platform: "website", url: "http://a.com" }]))
      .toEqual([{ platform: "website", url: "http://a.com" }]);
  });

  it("stores email as a bare address (mailto stripped)", () => {
    expect(sanitizeLinks([{ platform: "email", url: "mailto:hi@shop.com" }]))
      .toEqual([{ platform: "email", url: "hi@shop.com" }]);
  });

  it("keeps a trimmed label only on 'other', dropping the local _k", () => {
    expect(sanitizeLinks([
      { platform: "other", url: "https://whatnot.com/x", label: "  Whatnot  ", _k: 3 },
      { platform: "website", url: "https://a.com", label: "ignored", _k: 4 },
    ])).toEqual([
      { platform: "other", url: "https://whatnot.com/x", label: "Whatnot" },
      { platform: "website", url: "https://a.com" },
    ]);
  });

  it("caps the number of links", () => {
    const many = Array.from({ length: MAX_LINKS + 5 }, () => ({ platform: "other", url: "https://a.com" }));
    expect(sanitizeLinks(many)).toHaveLength(MAX_LINKS);
  });

  it("returns [] for non-array input", () => {
    expect(sanitizeLinks(null)).toEqual([]);
    expect(sanitizeLinks(undefined)).toEqual([]);
  });
});

describe("isValidLink", () => {
  it("requires a non-empty url", () => {
    expect(isValidLink({ platform: "website", url: "" })).toBe(false);
    expect(isValidLink({ platform: "website", url: "https://a.com" })).toBe(true);
  });
  it("validates email addresses", () => {
    expect(isValidLink({ platform: "email", url: "hi@shop.com" })).toBe(true);
    expect(isValidLink({ platform: "email", url: "mailto:hi@shop.com" })).toBe(true);
    expect(isValidLink({ platform: "email", url: "not-an-email" })).toBe(false);
  });
});

describe("linkHref", () => {
  it("builds a mailto: for email", () => {
    expect(linkHref({ platform: "email", url: "hi@shop.com" })).toBe("mailto:hi@shop.com");
    expect(linkHref({ platform: "email", url: "mailto:hi@shop.com" })).toBe("mailto:hi@shop.com");
  });
  it("returns the url for everything else", () => {
    expect(linkHref({ platform: "website", url: "https://a.com" })).toBe("https://a.com");
  });
  it("returns null when there is no url", () => {
    expect(linkHref({ platform: "website", url: "" })).toBe(null);
  });
});
