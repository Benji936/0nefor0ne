/**
 * The order a collection is read in.
 *
 * Until this existed there was none. Library.vue asked for `select('*')` with
 * no `.order()`, and Postgres promises nothing about the order of an unordered
 * scan — so a 200-card pile could come back arranged differently on a refresh,
 * and a card you had just looked at was somewhere else. Sorting client-side
 * keeps that fix in one place: the page already holds every row, both halves,
 * so re-sorting is free and does not cost a round trip per change.
 */

import { RANGE, EXACT } from "./cardmarketPrice";

/** Sort keys, in the order the control offers them. */
export const SORT_KEYS = ["name", "value", "printing", "added"];

/** Newest first is the default: the copy you just added is the one you are
 *  most likely to have got wrong, so it should be the one in front of you. */
export const DEFAULT_SORT = "added";

const text = (v) => (typeof v === "string" ? v : "");

/**
 * What a row is worth, for ordering only.
 *
 * A price is one of three things: a figure, a range with no printing chosen,
 * or nothing Cardmarket could match. A range sorts on its low end — the
 * conservative read, and the one that keeps an unresolved €0.02–€8,975 card
 * from sitting above every genuinely valuable card in the pile. Unpriced rows
 * sort last in either direction rather than reading as free.
 */
function sortValue(price) {
  if (!price) return null;
  if (price.kind === EXACT) return price.value ?? null;
  if (price.kind === RANGE) return price.low ?? null;
  return null;
}

const compare = {
  // Locale-aware so accented names file where a reader expects them.
  name: (a, b) => text(a.name).localeCompare(text(b.name), undefined, { sensitivity: "base" }),

  // Set code, then rarity: the two halves of a printing, in the order the row
  // prints them. Numeric so DOOD-EN9 precedes DOOD-EN024.
  printing: (a, b) =>
    text(a.extension).localeCompare(text(b.extension), undefined, { numeric: true, sensitivity: "base" }) ||
    text(a.rarity).localeCompare(text(b.rarity), undefined, { sensitivity: "base" }),

  // Highest first — the question a value order answers is "what is my best card".
  value: (a, b, prices) => {
    const av = sortValue(prices.get(a.id));
    const bv = sortValue(prices.get(b.id));
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  },

  added: (a, b) => (b.id ?? 0) - (a.id ?? 0),
};

/**
 * Sort a pile without mutating it.
 *
 * Every comparator falls back to name and then id, so the order is total: two
 * rows that tie on the chosen key still land in the same place on every render,
 * which is the property the missing `.order()` was costing.
 *
 * @param {Array<object>} cards
 * @param {string} key one of SORT_KEYS
 * @param {Map<number, object>} prices card id -> resolved price
 */
export function sortCollection(cards = [], key = DEFAULT_SORT, prices = new Map()) {
  const primary = compare[key] ?? compare[DEFAULT_SORT];
  return [...(cards ?? [])].sort(
    (a, b) =>
      primary(a, b, prices) ||
      compare.name(a, b) ||
      (a.id ?? 0) - (b.id ?? 0)
  );
}
