import { describe, it, expect, vi, afterEach } from "vitest";
import { distanceKm, searchPlaces, getMyPosition } from "./otsLocations";

const places = [
  { source: "store", ref_id: "a", name: "Alpha Cards", city: "Paris",  state: "IDF", country: "France", lat: 48.85, lng: 2.35 },
  { source: "store", ref_id: "b", name: "Beta Games",  city: "Lyon",   state: "ARA", country: "France", lat: 45.76, lng: 4.84 },
  { source: "event", ref_id: "e", name: "YCS London",  city: "London", state: null,  country: "UK",     lat: null,  lng: null },
];

describe("distanceKm", () => {
  it("returns null when a coordinate is missing", () => {
    expect(distanceKm({ lat: 1, lng: 1 }, { lat: null, lng: 2 })).toBeNull();
  });
  it("computes a known distance (Paris to Lyon ~= 392 km)", () => {
    const d = distanceKm({ lat: 48.85, lng: 2.35 }, { lat: 45.76, lng: 4.84 });
    expect(d).toBeGreaterThan(380);
    expect(d).toBeLessThan(405);
  });
});

describe("searchPlaces", () => {
  it("filters by name, city, state or country (case-insensitive)", () => {
    expect(searchPlaces(places, "lyon").map(p => p.ref_id)).toEqual(["b"]);
    expect(searchPlaces(places, "france").map(p => p.ref_id).sort()).toEqual(["a", "b"]);
  });
  it("returns all places when query is empty", () => {
    expect(searchPlaces(places, "")).toHaveLength(3);
  });
  it("sorts by distance from origin, coord-less places last", () => {
    const origin = { lat: 45.75, lng: 4.85 }; // near Lyon
    const results = searchPlaces(places, "", origin);
    const ordered = results.map(p => p.ref_id);
    expect(ordered[0]).toBe("b");   // Lyon closest
    expect(ordered[1]).toBe("a");   // Paris next
    expect(ordered[2]).toBe("e");   // no coords -> last
  });
  it("does not leak an internal _dist field on the returned Place objects", () => {
    const origin = { lat: 45.75, lng: 4.85 }; // near Lyon
    const results = searchPlaces(places, "", origin);
    for (const place of results) {
      expect(Object.prototype.hasOwnProperty.call(place, "_dist")).toBe(false);
    }
  });
});

describe("getMyPosition", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects when navigator is undefined", async () => {
    vi.stubGlobal("navigator", undefined);
    expect(typeof navigator).toBe("undefined"); // sanity: guard's condition is actually met

    // Pins the guard's own error, not some incidental TypeError from
    // accessing a property on undefined — that would also happen to
    // reject, but for the wrong reason if the guard were removed.
    await expect(getMyPosition()).rejects.toThrow("Geolocation unavailable");
  });
});
