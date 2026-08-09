import { describe, it, expect, vi, afterEach } from "vitest";
import { formatPlace, searchPlaces, geocodePlace, dedupe, MIN_QUERY } from "@/lib/geocode";

const row = (display_name, extra = {}) => ({ place_id: 1, display_name, lat: "1.5", lon: "-2.5", ...extra });

function mockFetch(impl) {
  globalThis.fetch = vi.fn(impl);
  return globalThis.fetch;
}

afterEach(() => { vi.restoreAllMocks(); delete globalThis.fetch; });

describe("formatPlace", () => {
  it("splits display_name into a primary head and secondary tail", () => {
    const p = formatPlace(row("Foo Cards, 12 Main St, Springfield, United States"));
    expect(p.primary).toBe("Foo Cards");
    expect(p.secondary).toBe("12 Main St, Springfield, United States");
    expect(p.value).toBe("Foo Cards, 12 Main St, Springfield, United States");
  });

  it("handles a single-part name with no secondary", () => {
    const p = formatPlace(row("Geneva"));
    expect(p.primary).toBe("Geneva");
    expect(p.secondary).toBe("");
  });

  it("coerces lat/lon to numbers", () => {
    const p = formatPlace(row("X"));
    expect(p.lat).toBe(1.5);
    expect(p.lon).toBe(-2.5);
  });

  it("returns null for an empty or missing display_name", () => {
    expect(formatPlace({})).toBeNull();
    expect(formatPlace(row("   "))).toBeNull();
  });
});

describe("dedupe", () => {
  it("collapses identical values, keeping relevance order", () => {
    const out = dedupe([
      { value: "Rue du Rhone, Geneva" },
      { value: "rue du rhone, geneva" },
      { value: "Rue de Rive, Geneva" },
    ]);
    expect(out.map((p) => p.value)).toEqual(["Rue du Rhone, Geneva", "Rue de Rive, Geneva"]);
  });
});

describe("searchPlaces", () => {
  it("collapses Nominatim's repeated street segments", async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => [row("Rue du Rhône, Geneva"), row("Rue du Rhône, Geneva", { place_id: 2 })],
    }));
    expect(await searchPlaces("rhone")).toHaveLength(1);
  });

  it("does not call the network below the minimum query length", async () => {
    const f = mockFetch(() => { throw new Error("should not fetch"); });
    expect(await searchPlaces("a".repeat(MIN_QUERY - 1))).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("maps rows through formatPlace", async () => {
    mockFetch(async () => ({ ok: true, json: async () => [row("A, B"), row("C, D", { place_id: 2 })] }));
    const out = await searchPlaces("cards");
    expect(out).toHaveLength(2);
    expect(out[0].primary).toBe("A");
    expect(out[1].primary).toBe("C");
  });

  it("drops unusable rows rather than emitting nulls", async () => {
    mockFetch(async () => ({ ok: true, json: async () => [row("A, B"), { place_id: 9 }] }));
    expect(await searchPlaces("cards")).toHaveLength(1);
  });

  it("passes the query and locale to the endpoint", async () => {
    const f = mockFetch(async () => ({ ok: true, json: async () => [] }));
    await searchPlaces("geneva", { locale: "fr" });
    const url = f.mock.calls[0][0];
    expect(url).toContain("q=geneva");
    expect(url).toContain("accept-language=fr");
  });

  it("returns [] on a network failure instead of throwing", async () => {
    mockFetch(async () => { throw new Error("offline"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await searchPlaces("cards")).toEqual([]);
  });

  it("returns [] on a non-ok response", async () => {
    mockFetch(async () => ({ ok: false, status: 429 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await searchPlaces("cards")).toEqual([]);
  });

  it("returns [] when the body is not valid JSON", async () => {
    mockFetch(async () => ({ ok: true, json: async () => { throw new Error("bad"); } }));
    expect(await searchPlaces("cards")).toEqual([]);
  });

  it("propagates aborts so the caller can tell them from empty results", async () => {
    mockFetch(async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; });
    await expect(searchPlaces("cards")).rejects.toThrow("aborted");
  });
});

describe("formatPlace address details", () => {
  it("carries the country and an upper-case ISO code", () => {
    const p = formatPlace(row("Geneva, Switzerland", {
      address: { city: "Geneva", country: "Switzerland", country_code: "ch" },
    }));
    expect(p.country).toBe("Switzerland");
    expect(p.countryCode).toBe("CH");
  });

  it("reads null rather than undefined when Nominatim sends no address", () => {
    const p = formatPlace(row("Somewhere"));
    expect(p.country).toBeNull();
    expect(p.countryCode).toBeNull();
  });
});

describe("searchPlaces feature filter", () => {
  it("asks for settlements only when a feature type is given", async () => {
    const f = mockFetch(async () => ({ ok: true, json: async () => [] }));
    await searchPlaces("geneva", { featureType: "settlement" });
    expect(f.mock.calls[0][0]).toContain("featuretype=settlement");
  });

  it("omits the filter entirely when none is given", async () => {
    const f = mockFetch(async () => ({ ok: true, json: async () => [] }));
    await searchPlaces("geneva");
    expect(f.mock.calls[0][0]).not.toContain("featuretype");
  });
});

describe("geocodePlace", () => {
  it("returns the single best match", async () => {
    mockFetch(async () => ({ ok: true, json: async () => [row("Geneva, Switzerland")] }));
    expect((await geocodePlace("geneva")).primary).toBe("Geneva");
  });

  it("returns null when nothing matches", async () => {
    mockFetch(async () => ({ ok: true, json: async () => [] }));
    expect(await geocodePlace("nowhere at all")).toBeNull();
  });

  it("returns null rather than throwing when the geocoder is down", async () => {
    mockFetch(async () => ({ ok: false, status: 503 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await geocodePlace("geneva")).toBeNull();
  });
});
