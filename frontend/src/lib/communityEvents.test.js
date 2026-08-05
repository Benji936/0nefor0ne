import { describe, it, expect } from "vitest";
import {
  partitionEvents, validateEvent, formatEventWhen,
  communityLocation, eventPlace, eventMapUrl, mergeFollowedFirst,
} from "./communityEvents";

const at = (iso) => ({ starts_at: iso });

describe("partitionEvents", () => {
  const now = new Date("2026-08-02T12:00:00Z").getTime();

  it("splits on now, upcoming ascending and past descending", () => {
    const rows = [
      { id: 1, starts_at: "2026-08-10T10:00:00Z" }, // upcoming
      { id: 2, starts_at: "2026-07-20T10:00:00Z" }, // past
      { id: 3, starts_at: "2026-08-05T10:00:00Z" }, // upcoming (sooner)
      { id: 4, starts_at: "2026-07-30T10:00:00Z" }, // past (more recent)
    ];
    const { upcoming, past } = partitionEvents(rows, now);
    expect(upcoming.map((e) => e.id)).toEqual([3, 1]);
    expect(past.map((e) => e.id)).toEqual([4, 2]);
  });

  it("treats an event starting exactly now as upcoming", () => {
    const { upcoming, past } = partitionEvents([{ id: 1, starts_at: "2026-08-02T12:00:00Z" }], now);
    expect(upcoming).toHaveLength(1);
    expect(past).toHaveLength(0);
  });

  it("drops rows with an unparseable start and tolerates empty input", () => {
    expect(partitionEvents([{ id: 1, starts_at: "not-a-date" }], now)).toEqual({ upcoming: [], past: [] });
    expect(partitionEvents(null)).toEqual({ upcoming: [], past: [] });
  });
});

describe("validateEvent", () => {
  const base = { title: "Locals", starts_at: "2026-08-10T18:00" };

  it("accepts a minimal valid event", () => {
    expect(validateEvent(base)).toEqual({ ok: true });
  });

  it("requires a title", () => {
    expect(validateEvent({ ...base, title: "   " })).toEqual({ ok: false, error: "titleRequired" });
  });

  it("caps title length", () => {
    expect(validateEvent({ ...base, title: "x".repeat(141) })).toEqual({ ok: false, error: "titleTooLong" });
  });

  it("requires a start", () => {
    expect(validateEvent({ title: "x" })).toEqual({ ok: false, error: "startRequired" });
    expect(validateEvent({ title: "x", starts_at: "nope" })).toEqual({ ok: false, error: "startInvalid" });
  });

  it("rejects an end before the start", () => {
    expect(validateEvent({ ...base, ends_at: "2026-08-10T17:00" })).toEqual({ ok: false, error: "endBeforeStart" });
  });

  it("accepts an end equal to or after the start", () => {
    expect(validateEvent({ ...base, ends_at: "2026-08-10T21:00" })).toEqual({ ok: true });
  });

  it("rejects a schemeless url", () => {
    expect(validateEvent({ ...base, url: "example.com" })).toEqual({ ok: false, error: "urlInvalid" });
    expect(validateEvent({ ...base, url: "https://example.com" })).toEqual({ ok: true });
  });
});

describe("formatEventWhen", () => {
  it("formats the stored timezone and includes the year", () => {
    const out = formatEventWhen({ starts_at: "2026-08-10T18:00:00Z", timezone: "UTC" }, "en");
    expect(out).toContain("2026");
  });

  it("falls back rather than throwing on a bad timezone", () => {
    const out = formatEventWhen({ starts_at: "2026-08-10T18:00:00Z", timezone: "Not/AZone" }, "en");
    expect(out).toContain("2026");
  });

  it("returns empty string for missing/invalid start", () => {
    expect(formatEventWhen({})).toBe("");
    expect(formatEventWhen(at("nope"))).toBe("");
  });
});

describe("communityLocation", () => {
  it("joins city and country", () => {
    expect(communityLocation({ city: "Geneva", country: "Switzerland" })).toBe("Geneva, Switzerland");
  });
  it("skips blanks rather than leaving stray commas", () => {
    expect(communityLocation({ city: "Geneva", country: "  " })).toBe("Geneva");
    expect(communityLocation({ country: "Switzerland" })).toBe("Switzerland");
    expect(communityLocation({})).toBe("");
    expect(communityLocation(null)).toBe("");
  });
});

describe("eventPlace", () => {
  const store = { city: "Geneva", country: "Switzerland" };
  it("prefers the event's own location", () => {
    expect(eventPlace({ location: "Palexpo Hall 6" }, store)).toBe("Palexpo Hall 6");
  });
  it("falls back to the community address", () => {
    expect(eventPlace({ location: "" }, store)).toBe("Geneva, Switzerland");
  });
  it("is empty for online events", () => {
    expect(eventPlace({ is_online: true, location: "Palexpo" }, store)).toBe("");
  });
});

describe("mergeFollowedFirst", () => {
  const ev = (id, starts_at) => ({ id, starts_at });

  it("puts followed events first even when they start later", () => {
    const out = mergeFollowedFirst(
      [ev(1, "2026-09-01T10:00:00Z")],
      [ev(2, "2026-08-06T10:00:00Z")],
    );
    expect(out.map((e) => e.id)).toEqual([1, 2]);
  });

  it("sorts within each group by start ascending", () => {
    const out = mergeFollowedFirst(
      [ev(1, "2026-09-01T10:00:00Z"), ev(2, "2026-08-20T10:00:00Z")],
      [ev(3, "2026-08-15T10:00:00Z"), ev(4, "2026-08-07T10:00:00Z")],
    );
    expect(out.map((e) => e.id)).toEqual([2, 1, 4, 3]);
  });

  it("dedupes an event present in both queries and keeps it followed", () => {
    const out = mergeFollowedFirst([ev(1, "2026-09-01T10:00:00Z")], [ev(1, "2026-09-01T10:00:00Z")]);
    expect(out).toHaveLength(1);
    expect(out[0].followed).toBe(true);
  });

  it("flags followed membership on every row", () => {
    const out = mergeFollowedFirst([ev(1, "2026-08-10T10:00:00Z")], [ev(2, "2026-08-11T10:00:00Z")]);
    expect(out.map((e) => e.followed)).toEqual([true, false]);
  });

  it("does not mutate its inputs", () => {
    const followed = [ev(1, "2026-08-10T10:00:00Z")];
    mergeFollowedFirst(followed, []);
    expect(followed[0]).not.toHaveProperty("followed");
  });

  it("tolerates null, empty and holey input", () => {
    expect(mergeFollowedFirst(null, null)).toEqual([]);
    expect(mergeFollowedFirst([null], [ev(1, "2026-08-10T10:00:00Z")]).map((e) => e.id)).toEqual([1]);
  });
});

describe("eventMapUrl", () => {
  const store = { city: "Geneva", country: "Switzerland", lat: 46.2, lng: 6.14 };
  it("returns null for online events", () => {
    expect(eventMapUrl({ is_online: true, location: "Palexpo" }, store)).toBeNull();
  });
  it("searches the event's own location text", () => {
    const u = eventMapUrl({ location: "Palexpo Hall 6" }, store);
    expect(u).toContain("Palexpo%20Hall%206");
  });
  it("uses the community's exact coordinates when the event has no location", () => {
    expect(eventMapUrl({ location: "" }, store)).toBe(
      "https://www.google.com/maps/search/?api=1&query=46.2,6.14",
    );
  });
  it("falls back to the community address text when there are no coordinates", () => {
    const u = eventMapUrl({}, { city: "Geneva", country: "Switzerland" });
    expect(u).toContain("Geneva%2C%20Switzerland");
  });
  it("returns null when there is no address anywhere", () => {
    expect(eventMapUrl({}, {})).toBeNull();
  });
});
