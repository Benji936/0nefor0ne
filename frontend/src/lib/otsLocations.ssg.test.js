// Isolated from otsLocations.test.js on purpose: loadMeetupPlaces() caches its
// result in a module-scoped variable (_placesCache/_placesPromise), so once any
// test resolves it the guard branch can never be re-exercised in that module
// instance. Keeping this in its own file, plus an explicit vi.resetModules() +
// dynamic import per test, guarantees a fresh, uncached module every run and
// that the `typeof window === "undefined"` branch is actually the one hit.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("loadMeetupPlaces SSG guard", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns [] and never calls fetch when window is undefined (SSG/prerender)", async () => {
    vi.stubGlobal("window", undefined);
    // Sanity: confirm the stub actually reproduces the condition the guard
    // checks for. Without this, a broken stub could make the test pass
    // vacuously regardless of the guard's presence.
    expect(typeof window).toBe("undefined");

    // A plain return value of [] is not, by itself, proof the guard ran:
    // loadMeetupPlaces() also falls back to [] when both fetches fail (see
    // the .catch(() => ({ data: [] })) handlers), so a promise that reaches
    // the fetch step would *also* resolve to []. The discriminating signal
    // is that fetch must never be invoked at all.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { loadMeetupPlaces } = await import("./otsLocations");
    const result = await loadMeetupPlaces();

    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
