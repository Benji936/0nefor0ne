/**
 * Who is here: the two lists shown on the public landing page and again on the
 * app home, where they stop being proof that somebody is around and start
 * being a way to find them.
 *
 * Two questions, both public: who joined most recently, and who has put the
 * most into their trade pile. Neither exposes anything a visitor could not
 * already read from the Trader directory — it is the same rows, sorted.
 *
 * Reads return [] on failure. A page that cannot reach the database should
 * quietly lose one section, never show a broken one.
 *
 * See supabase/migrations/20260811_landing_traders.sql for where these come
 * from, and why the pile count is a function rather than a client-side count.
 */

import { getClient } from "@/lib/supabaseClient";

/** Below this the section reads as "nobody is here" rather than as proof that
 *  somebody is. Better to show nothing than to show a lonely single row. */
export const MIN_TO_SHOW = 3;

/** The newest accounts, newest first. */
export async function fetchRecentTraders(limit = 3) {
  const { data, error } = await getClient()
    .from("Trader")
    .select("id, Name, avatar_url, City, country_code, created_at")
    .not("Name", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) { console.error("fetchRecentTraders failed", error); return []; }
  return data ?? [];
}

/** The biggest trade piles, largest first. Counted in the database. */
export async function fetchTopTradepiles(limit = 3) {
  const { data, error } = await getClient().rpc("top_tradepile_traders", { n: limit });

  if (error) { console.error("fetchTopTradepiles failed", error); return []; }
  return (data ?? []).filter((t) => t.name);
}

/**
 * How long ago something happened, as a unit and a count rather than a
 * sentence — the caller owns the copy, and this file has no business knowing
 * which of the four languages the visitor reads.
 *
 * Months are 30 days and years are 365. Both are wrong by a day or two and
 * neither matters: "joined 3 months ago" is a texture, not a fact anyone will
 * check.
 *
 * @param {string|Date} when
 * @param {Date} now  injectable so the tests are not clock-dependent
 * @returns {{unit:"today"|"day"|"week"|"month"|"year", count:number}|null}
 */
export function joinedAgo(when, now = new Date()) {
  // Checked before constructing: `new Date(null)` is the epoch, not an invalid
  // date, so a missing timestamp would otherwise render as "56 years ago".
  if (when == null) return null;
  const then = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(then.getTime())) return null;

  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  // A clock skewed a few hours into the future is a config problem, not
  // something to render as "in -1 days".
  if (days <= 0) return { unit: "today", count: 0 };
  if (days < 7) return { unit: "day", count: days };
  if (days < 30) return { unit: "week", count: Math.floor(days / 7) };
  if (days < 365) return { unit: "month", count: Math.floor(days / 30) };
  return { unit: "year", count: Math.floor(days / 365) };
}

/** Where somebody trades, when they have said. Null renders as nothing at all
 *  rather than as an empty line holding space open. */
export function traderPlace(trader) {
  const city = trader?.City?.trim();
  const country = trader?.country_code?.trim()?.toUpperCase();
  if (city && country) return `${city}, ${country}`;
  return city || country || null;
}

/** First letter, for the avatar that isn't there. Ten of fourteen accounts have
 *  no picture, so this is the common case, not the fallback. */
export function traderInitial(name) {
  return (String(name ?? "").trim()[0] ?? "?").toUpperCase();
}

/**
 * Everything a row needs to render, worked out once.
 *
 * Both pages show the same list, and both would otherwise call joinedAgo three
 * times per row from inside a template — once for the v-if and twice for the
 * message. The `ago` key is null when the timestamp will not parse, and the
 * row then renders without a date: a bad timestamp must not cost us the person
 * it belongs to.
 */
export function decorateRecent(traders = []) {
  return (traders ?? []).map((t) => {
    const ago = joinedAgo(t?.created_at);
    return {
      ...t,
      place: traderPlace(t),
      initial: traderInitial(t?.Name),
      agoKey: ago ? `people.ago.${ago.unit}` : null,
      agoCount: ago?.count ?? 0,
    };
  });
}
