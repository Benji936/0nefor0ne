import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({ getClient: () => ({ rpc }) }));

const {
  communitiesNear, eventsNear, unclaimedNear, requestPosition, formatDistance, filterNear,
  boundingBox, distanceKm,
  GEO_UNSUPPORTED, GEO_DENIED, GEO_UNAVAILABLE, RADII, DEFAULT_RADIUS,
} = await import("./near");

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
});

describe("formatDistance", () => {
  it("uses metres under a kilometre, rounded to something sayable", () => {
    expect(formatDistance(0.4)).toBe("400 m");
    expect(formatDistance(0.86)).toBe("900 m");
  });
  it("never rounds a real distance down to zero", () => {
    expect(formatDistance(0.02)).toBe("100 m");
  });
  it("keeps one decimal close in, where it changes whether you walk", () => {
    expect(formatDistance(2.44)).toBe("2.4 km");
    expect(formatDistance(9.4)).toBe("9.4 km");
  });
  it("drops to whole kilometres further out, where it stops mattering", () => {
    expect(formatDistance(34.2)).toBe("34 km");
    expect(formatDistance(99.6)).toBe("100 km");
  });
  it("returns null for nothing, rather than a string saying NaN", () => {
    expect(formatDistance(null)).toBeNull();
    expect(formatDistance(undefined)).toBeNull();
    expect(formatDistance(-1)).toBeNull();
    expect(formatDistance("far")).toBeNull();
  });
});

describe("the near queries", () => {
  it("calls the right function with the caller's position", async () => {
    await communitiesNear({ lat: 46.2, lng: 6.14, km: 50 });
    expect(rpc).toHaveBeenCalledWith("communities_near", { p_lat: 46.2, p_lng: 6.14, p_km: 50 });
  });
  it("defaults the radius rather than letting the server guess", async () => {
    await eventsNear({ lat: 1, lng: 2 });
    expect(rpc).toHaveBeenCalledWith("events_near", { p_lat: 1, p_lng: 2, p_km: DEFAULT_RADIUS });
  });
  it("asks for a short list of unclaimed shops, since it is an aside", async () => {
    await unclaimedNear({ lat: 1, lng: 2 });
    expect(rpc.mock.calls[0][1].p_limit).toBe(6);
  });
  it("refuses a missing or unusable position instead of querying for NaN", async () => {
    await expect(communitiesNear({ lng: 2 })).rejects.toThrow(/lat and lng/);
    await expect(communitiesNear({ lat: NaN, lng: 2 })).rejects.toThrow(/lat and lng/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("returns an empty list rather than null when nothing is near", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await communitiesNear({ lat: 1, lng: 2 })).toEqual([]);
  });
  it("throws when the database refuses", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(communitiesNear({ lat: 1, lng: 2 })).rejects.toBeTruthy();
  });
});

describe("requestPosition", () => {
  const withGeo = (impl) => {
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: impl === null ? {} : { geolocation: { getCurrentPosition: impl } },
      configurable: true, writable: true,
    });
    return () => Object.defineProperty(globalThis, "navigator", {
      value: original, configurable: true, writable: true,
    });
  };

  it("resolves to a plain lat/lng", async () => {
    const restore = withGeo((ok) => ok({ coords: { latitude: 46.2, longitude: 6.14 } }));
    await expect(requestPosition()).resolves.toEqual({ lat: 46.2, lng: 6.14 });
    restore();
  });
  it("tells a refusal apart from a failure, because they need different words", async () => {
    let restore = withGeo((_ok, fail) => fail({ code: 1 }));
    await expect(requestPosition()).rejects.toThrow(GEO_DENIED);
    restore();
    restore = withGeo((_ok, fail) => fail({ code: 2 }));
    await expect(requestPosition()).rejects.toThrow(GEO_UNAVAILABLE);
    restore();
  });
  it("names a browser that never had geolocation", async () => {
    const restore = withGeo(null);
    await expect(requestPosition()).rejects.toThrow(GEO_UNSUPPORTED);
    restore();
  });
  it("does not ask for GPS precision to choose a 25km radius", async () => {
    let opts;
    const restore = withGeo((ok, _fail, o) => { opts = o; ok({ coords: { latitude: 1, longitude: 2 } }); });
    await requestPosition();
    expect(opts.enableHighAccuracy).toBe(false);
    expect(opts.maximumAge).toBeGreaterThan(0);
    restore();
  });
});

describe("filterNear", () => {
  const shop = { name: "Otaku Store", city: "Osaka", country: "Japan", kinds: ["store", "discord"], remote_duel: true };
  const club = { name: "Geneva Duel Club", city: "Geneva", country: "Switzerland", kinds: ["group"], remote_duel: false };
  const rows = [shop, club];

  it("passes everything through when nothing is filtered", () => {
    expect(filterNear(rows, {})).toEqual(rows);
    expect(filterNear(rows)).toEqual(rows);
  });
  it("matches a kind anywhere in kinds, the way the directory does", () => {
    expect(filterNear(rows, { kind: "discord" })).toEqual([shop]);
    expect(filterNear(rows, { kind: "group" })).toEqual([club]);
  });
  it("falls back to the legacy kind column for a row without kinds", () => {
    const old = { name: "Old Row", kind: "store" };
    expect(filterNear([old], { kind: "store" })).toEqual([old]);
  });
  it("searches names case-insensitively, on a substring", () => {
    expect(filterNear(rows, { q: "  duel " })).toEqual([club]);
    expect(filterNear(rows, { q: "OTAKU" })).toEqual([shop]);
  });
  // The whole point of this function is that the two lists answer a query the
  // same way. When it searched names only and the directory searched three
  // columns, turning Near me on made a shop you had just found disappear, and
  // it read as the shop being out of range.
  it("searches the town and the country too, the way the directory does", () => {
    expect(filterNear(rows, { q: "osaka" })).toEqual([shop]);
    expect(filterNear(rows, { q: "Switzerland" })).toEqual([club]);
  });
  it("resolves a country spelled the way the directory does not file it", () => {
    const cz = { name: "Prague Cards", city: "Prague", country: "Czech Republic" };
    expect(filterNear([cz], { q: "Czechia" })).toEqual([cz]);
  });
  it("keeps a row that has no town on file out of a town search, not in it", () => {
    expect(filterNear([{ name: "Nowhere" }], { q: "osaka" })).toEqual([]);
  });
  it("keeps only remote-duel rows when asked, and never on a missing flag", () => {
    expect(filterNear(rows, { remoteDuel: true })).toEqual([shop]);
    expect(filterNear([{ name: "x" }], { remoteDuel: true })).toEqual([]);
  });
  it("survives a null list rather than throwing at the template", () => {
    expect(filterNear(null, { kind: "store" })).toEqual([]);
  });
});

describe("the radius choices", () => {
  it("offers the default among them", () => {
    expect(RADII).toContain(DEFAULT_RADIUS);
  });
  it("is ordered outward", () => {
    expect([...RADII].sort((a, b) => a - b)).toEqual(RADII);
  });
});

describe("boundingBox", () => {
  it("is 40 km of latitude tall, in degrees", () => {
    const box = boundingBox({ lat: 0, lng: 0 }, 111);
    expect(box.maxLat - box.minLat).toBeCloseTo(2, 2);
  });

  // A degree of longitude is 111 km at the equator and narrows with the cosine
  // of the latitude, so the same radius has to reach further in degrees the
  // further north the shop is. Ignoring that would drop half the shops in
  // Helsinki out of a search that found them all in Nairobi.
  it("widens in longitude the further from the equator it is", () => {
    const equator = boundingBox({ lat: 0, lng: 10 }, 40);
    const helsinki = boundingBox({ lat: 60, lng: 10 }, 40);
    expect(helsinki.maxLng - helsinki.minLng).toBeGreaterThan(equator.maxLng - equator.minLng);
    expect(helsinki.maxLng - helsinki.minLng).toBeCloseTo(2 * (equator.maxLng - equator.minLng), 1);
  });

  // "lng between 179.5 and -179.5" is not a range, so the longitude bound is
  // simply left off and the latitude bound plus the distance sort do the work.
  it("drops the longitude bound rather than asking for an impossible range", () => {
    const box = boundingBox({ lat: -18, lng: 179.9 }, 40);
    expect(box.minLng).toBeUndefined();
    expect(box.maxLng).toBeUndefined();
    expect(box.maxLat).toBeGreaterThan(box.minLat);
  });

  it("clamps at the poles rather than returning a latitude past 90", () => {
    expect(boundingBox({ lat: 89.9, lng: 0 }, 200).maxLat).toBe(90);
  });

  it("is null for a row with no pin, which is the signal to ask nothing", () => {
    expect(boundingBox({ lat: null, lng: 2 }, 40)).toBeNull();
    expect(boundingBox({ lat: 1, lng: 2 }, 0)).toBeNull();
  });
});

describe("distanceKm", () => {
  it("measures a distance somebody could check on a map", () => {
    // Paris to London, about 344 km as the crow flies.
    const km = distanceKm({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 });
    expect(km).toBeGreaterThan(330);
    expect(km).toBeLessThan(350);
  });

  it("is zero for a point and itself, not a rounding artefact", () => {
    expect(distanceKm({ lat: 12, lng: -3 }, { lat: 12, lng: -3 })).toBe(0);
  });

  it("is null when either end has no pin", () => {
    expect(distanceKm({ lat: 1, lng: 2 }, { lat: null, lng: 2 })).toBeNull();
    expect(distanceKm(null, { lat: 1, lng: 2 })).toBeNull();
  });
});
