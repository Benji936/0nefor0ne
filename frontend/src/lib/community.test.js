import { describe, it, expect, vi, afterEach } from "vitest";
import * as community from "./community";
import { giveUpMode, resolveLocation, placeSearchFilter } from "./community";

describe("community data-access module", () => {
  it("compiles and exports the expected data-access functions", () => {
    const expected = [
      "fetchDirectory", "fetchBySlug", "createCommunity", "updateCommunity",
      "requestClaimCode", "verifyClaimCode", "requestManualReview",
      "reportCommunity", "fetchMyCommunities",
      "startClaimCheckout", "openBillingPortal", "fetchMyClaim",
      "giveUpMode", "releaseCommunity", "placeSearchFilter",
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

describe("resolveLocation", () => {
  const place = (extra = {}) => ({
    ok: true,
    json: async () => [{
      place_id: 1, display_name: "Geneva, Switzerland", lat: "46.2", lon: "6.14",
      address: { country: "Switzerland", country_code: "ch" }, ...extra,
    }],
  });

  afterEach(() => { vi.restoreAllMocks(); delete globalThis.fetch; });

  it("hands back coordinates it was given without calling the geocoder", async () => {
    const f = vi.fn(() => { throw new Error("should not fetch"); });
    globalThis.fetch = f;
    const out = await resolveLocation({ city: "Geneva", country: "Switzerland", lat: 46.2, lng: 6.14 });
    expect(out).toEqual({ lat: 46.2, lng: 6.14, country: "Switzerland", country_code: "CH" });
    expect(f).not.toHaveBeenCalled();
  });

  it("resolves a city to a pin", async () => {
    globalThis.fetch = vi.fn(async () => place());
    const out = await resolveLocation({ city: "Geneva", country: "Switzerland" });
    expect(out.lat).toBe(46.2);
    expect(out.lng).toBe(6.14);
  });

  // A country centroid would claim a shop is somewhere it is not, which is
  // worse for near-me than having no pin at all.
  it("refuses to pin a country with no city", async () => {
    const f = vi.fn(() => { throw new Error("should not fetch"); });
    globalThis.fetch = f;
    const out = await resolveLocation({ country: "Singapore" });
    expect(out).toEqual({ lat: null, lng: null, country: "Singapore", country_code: "SG" });
    expect(f).not.toHaveBeenCalled();
  });

  it("fills a blank country in from the geocoder", async () => {
    globalThis.fetch = vi.fn(async () => place());
    const out = await resolveLocation({ city: "Geneva" });
    expect(out.country).toBe("Switzerland");
    expect(out.country_code).toBe("CH");
  });

  // The owner picked theirs from a list; a geocoder that found the wrong
  // Springfield does not get to move their listing to another country.
  it("never overwrites a country the owner chose", async () => {
    globalThis.fetch = vi.fn(async () => place());
    const out = await resolveLocation({ city: "Springfield", country: "United States" });
    expect(out.country).toBe("United States");
    expect(out.country_code).toBe("US");
  });

  it("keeps the city and country when the geocoder is down", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 503 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await resolveLocation({ city: "Geneva", country: "Switzerland" });
    expect(out).toEqual({ lat: null, lng: null, country: "Switzerland", country_code: "CH" });
  });

  it("does not pin on a row the geocoder answered without coordinates", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => [{ place_id: 1, display_name: "Geneva", lat: null, lon: null }],
    }));
    expect((await resolveLocation({ city: "Geneva" })).lat).toBeNull();
  });
});

describe("placeSearchFilter", () => {
  // The finder searches the three things a place is findable by. It used to
  // search shop names alone, so a reader typing their own town got nothing.
  it("looks in the name, the town and the country", () => {
    const f = placeSearchFilter("Berlin");
    expect(f).toContain('name.ilike."%Berlin%"');
    expect(f).toContain('city.ilike."%Berlin%"');
    expect(f).toContain('country.ilike."%Berlin%"');
  });

  it("is nothing at all for an empty or blank query", () => {
    expect(placeSearchFilter("")).toBe("");
    expect(placeSearchFilter("   ")).toBe("");
    expect(placeSearchFilter(null)).toBe("");
    expect(placeSearchFilter(undefined)).toBe("");
  });

  // PostgREST parses the or() list itself, splitting on commas. Unquoted, the
  // first condition would end early and the request would come back 400 — and a
  // comma is exactly what "217 Comics, Cards, & Games" contains.
  it("quotes the value so a typed comma cannot split the filter", () => {
    const f = placeSearchFilter("Comics, Cards");
    expect(f).toContain('name.ilike."%Comics, Cards%"');
    expect(f.split(".ilike.").length - 1).toBe(3);
  });

  it("escapes a quote and a backslash rather than letting them close the literal", () => {
    expect(placeSearchFilter('Joe"s')).toContain('name.ilike."%Joe\\"s%"');
    expect(placeSearchFilter("back\\slash")).toContain('name.ilike."%back\\\\\\\\slash%"');
  });

  // A bare % is a LIKE wildcard. Unescaped, a reader who types one gets handed
  // the entire directory — confirmed against the API: 4,451 rows.
  it("escapes LIKE wildcards so they match themselves", () => {
    expect(placeSearchFilter("50%")).toContain('name.ilike."%50\\\\%%"');
    expect(placeSearchFilter("a_b")).toContain('name.ilike."%a\\\\_b%"');
  });

  // The rows were written through canonicalCountry, so the finder resolves
  // through it too — otherwise a country spelled the common way is a country
  // nobody can find.
  it("adds an exact country match for a name the directory files differently", () => {
    expect(placeSearchFilter("Czechia")).toContain('country.eq."Czech Republic"');
    expect(placeSearchFilter("Türkiye")).toContain('country.eq."Turkey"');
    expect(placeSearchFilter("United States of America")).toContain('country.eq."United States"');
  });

  it("does not bother when the substring match already finds that country", () => {
    expect(placeSearchFilter("Germany")).not.toContain("country.eq.");
    expect(placeSearchFilter("german")).not.toContain("country.eq.");
    expect(placeSearchFilter("South Korea")).not.toContain("country.eq.");
  });
});
