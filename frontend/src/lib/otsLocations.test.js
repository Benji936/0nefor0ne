import { describe, it, expect } from "vitest";
import { distanceKm, searchPlaces } from "./otsLocations";

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
    const ordered = searchPlaces(places, "", origin).map(p => p.ref_id);
    expect(ordered[0]).toBe("b");   // Lyon closest
    expect(ordered[1]).toBe("a");   // Paris next
    expect(ordered[2]).toBe("e");   // no coords -> last
  });
});
