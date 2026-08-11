import { describe, it, expect } from "vitest";
import { joinedAgo, traderPlace, traderInitial } from "./landingTraders.js";

const NOW = new Date("2026-08-11T12:00:00Z");
const daysBefore = (n) => new Date(NOW.getTime() - n * 86_400_000);

describe("joinedAgo", () => {
  it("calls the same day today", () => {
    expect(joinedAgo(new Date("2026-08-11T02:00:00Z"), NOW)).toEqual({ unit: "today", count: 0 });
  });

  it("counts days up to a week", () => {
    expect(joinedAgo(daysBefore(3), NOW)).toEqual({ unit: "day", count: 3 });
    expect(joinedAgo(daysBefore(6), NOW)).toEqual({ unit: "day", count: 6 });
  });

  it("switches to weeks at seven days", () => {
    expect(joinedAgo(daysBefore(7), NOW)).toEqual({ unit: "week", count: 1 });
    expect(joinedAgo(daysBefore(29), NOW)).toEqual({ unit: "week", count: 4 });
  });

  it("switches to months at thirty days", () => {
    expect(joinedAgo(daysBefore(30), NOW)).toEqual({ unit: "month", count: 1 });
    expect(joinedAgo(daysBefore(364), NOW)).toEqual({ unit: "month", count: 12 });
  });

  it("switches to years at a full year", () => {
    expect(joinedAgo(daysBefore(365), NOW)).toEqual({ unit: "year", count: 1 });
  });

  it("accepts the ISO string Postgres actually returns", () => {
    expect(joinedAgo("2026-08-08T12:00:00Z", NOW)).toEqual({ unit: "day", count: 3 });
  });

  it("reads a clock skewed into the future as today, not as negative days", () => {
    expect(joinedAgo(daysBefore(-2), NOW)).toEqual({ unit: "today", count: 0 });
  });

  it("returns null rather than Invalid Date for junk", () => {
    expect(joinedAgo(null)).toBeNull();
    expect(joinedAgo("not a date")).toBeNull();
  });
});

describe("traderPlace", () => {
  it("joins a city to its country", () => {
    expect(traderPlace({ City: "Geneva", country_code: "ch" })).toBe("Geneva, CH");
  });

  it("falls back to whichever half exists", () => {
    expect(traderPlace({ City: "Geneva" })).toBe("Geneva");
    expect(traderPlace({ country_code: "FR" })).toBe("FR");
  });

  it("treats whitespace as absent, so no stray comma is rendered", () => {
    expect(traderPlace({ City: "  ", country_code: "  " })).toBeNull();
    expect(traderPlace({})).toBeNull();
    expect(traderPlace()).toBeNull();
  });
});

describe("traderInitial", () => {
  it("takes the first letter, uppercased", () => {
    expect(traderInitial("benjamin")).toBe("B");
    expect(traderInitial("  ada ")).toBe("A");
  });

  it("has something to show for a nameless row", () => {
    expect(traderInitial("")).toBe("?");
    expect(traderInitial(null)).toBe("?");
  });
});
