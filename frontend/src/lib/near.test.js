import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabaseClient", () => ({ getClient: () => ({ rpc }) }));

const {
  communitiesNear, eventsNear, unclaimedNear, requestPosition, formatDistance, filterNear,
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
  const shop = { name: "Otaku Store", kinds: ["store", "discord"], remote_duel: true };
  const club = { name: "Geneva Duel Club", kinds: ["group"], remote_duel: false };
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
