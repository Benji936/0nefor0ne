import { describe, it, expect } from "vitest";
import {
  ANNOUNCE_TTL_DAYS,
  EXPIRY_SOON_DAYS,
  isExpired,
  daysUntilExpiry,
  isExpiringSoon,
} from "./announceExpiry";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-07-22T12:00:00.000Z");

/** An announce whose window ends `days` from NOW (negative = already past). */
const at = days => ({ expires_at: new Date(NOW + days * DAY).toISOString() });

describe("isExpired", () => {
  it("is false while the window is open", () => {
    expect(isExpired(at(1), NOW)).toBe(false);
    expect(isExpired(at(ANNOUNCE_TTL_DAYS), NOW)).toBe(false);
  });

  it("is true once the window has passed", () => {
    expect(isExpired(at(-1), NOW)).toBe(true);
  });

  it("treats the exact boundary as expired", () => {
    expect(isExpired(at(0), NOW)).toBe(true);
  });

  it("treats a row with no expiry as live", () => {
    // Optimistic local inserts have no expires_at until the server replies;
    // they must not flicker as expired in the meantime.
    expect(isExpired({}, NOW)).toBe(false);
    expect(isExpired({ expires_at: null }, NOW)).toBe(false);
    expect(isExpired(null, NOW)).toBe(false);
  });

  it("treats an unparseable date as live rather than throwing", () => {
    expect(isExpired({ expires_at: "not a date" }, NOW)).toBe(false);
  });
});

describe("daysUntilExpiry", () => {
  it("rounds up, so a part-day still reads as a day", () => {
    expect(daysUntilExpiry({ expires_at: new Date(NOW + 0.1 * DAY).toISOString() }, NOW)).toBe(1);
    expect(daysUntilExpiry(at(3), NOW)).toBe(3);
  });

  it("clamps to 0 once expired instead of going negative", () => {
    expect(daysUntilExpiry(at(-9), NOW)).toBe(0);
  });

  it("returns null when there is no expiry date", () => {
    expect(daysUntilExpiry({}, NOW)).toBe(null);
  });
});

describe("isExpiringSoon", () => {
  it("is true inside the warning window", () => {
    expect(isExpiringSoon(at(EXPIRY_SOON_DAYS - 1), NOW)).toBe(true);
    expect(isExpiringSoon(at(EXPIRY_SOON_DAYS), NOW)).toBe(true);
  });

  it("is false with plenty of time left", () => {
    expect(isExpiringSoon(at(EXPIRY_SOON_DAYS + 1), NOW)).toBe(false);
    expect(isExpiringSoon(at(ANNOUNCE_TTL_DAYS), NOW)).toBe(false);
  });

  it("is false once actually expired, so the two badges never both show", () => {
    expect(isExpiringSoon(at(-1), NOW)).toBe(false);
    expect(isExpiringSoon(at(0), NOW)).toBe(false);
  });

  it("never reports a day count of 0 while true", () => {
    // The card renders "{days}d left" off the back of this, and "0d left" on a
    // listing that is still live would be wrong.
    for (let d = 1; d <= EXPIRY_SOON_DAYS; d++) {
      const a = { expires_at: new Date(NOW + (d - 0.5) * DAY).toISOString() };
      if (isExpiringSoon(a, NOW)) expect(daysUntilExpiry(a, NOW)).toBeGreaterThan(0);
    }
  });
});
