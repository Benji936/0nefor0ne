// How a pile of cards becomes binder pages.
//
// Split out of CardBinder.vue so it can be tested: the component has no test
// harness in this repo (there is no @vue/test-utils), and the arithmetic here
// is the part that actually goes wrong -- off-by-one page counts, a view left
// past the end when the window narrows, and a last page that changes height
// because it was not padded out.

/** A binder page is nine pockets, three across. That is the format the pages
 *  are drawn in and the unit the page numbers count, so it is fixed here
 *  rather than passed in: "page 3 of 25" has to mean the same thing on a
 *  phone as on a desktop. */
export const POCKETS_PER_PAGE = 9;

/** How many pages a pile fills.
 *
 *  Always at least one. An empty binder still shows a page, because a page of
 *  empty pockets is how you can tell somebody has nothing rather than that the
 *  screen failed to load. */
export function pageCount(total, per = POCKETS_PER_PAGE) {
  if (!Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / per));
}

/** How many spreads those pages make.
 *
 *  A view is what is open in front of you: two facing pages when there is room
 *  for them, one otherwise. The page count never changes with the window --
 *  only how many of them you can see at once. */
export function viewCount(pages, pagesPerView) {
  const p = Math.max(1, pagesPerView || 1);
  return Math.max(1, Math.ceil(Math.max(1, pages) / p));
}

/** Keep a view index inside the binder.
 *
 *  Narrowing the window folds two pages into one, which halves the view count
 *  and can leave you reading past the back cover. */
export function clampView(view, views) {
  if (!Number.isFinite(view) || view < 0) return 0;
  return Math.min(view, Math.max(0, views - 1));
}

/** The pages currently open, each padded out to nine pockets.
 *
 *  Padding is not cosmetic: without it the last leaf is short, and the binder
 *  changes height as you turn onto it. An empty pocket is also information --
 *  it says how close to the end of somebody's pile you have got.
 *
 *  Returns `[{ number, pockets }]` where `number` is 1-based and `pockets`
 *  holds cards and nulls.
 */
export function openPages(cards, view, pagesPerView, per = POCKETS_PER_PAGE) {
  const list  = Array.isArray(cards) ? cards : [];
  const pages = pageCount(list.length, per);
  const perV  = Math.max(1, pagesPerView || 1);
  const first = Math.max(0, view) * perV;

  const out = [];
  for (let p = first; p < first + perV && p < pages; p++) {
    const slice = list.slice(p * per, (p + 1) * per);
    const pockets = [];
    for (let i = 0; i < per; i++) pockets.push(slice[i] ?? null);
    out.push({ number: p + 1, pockets });
  }
  return out;
}

/** Where the next arrow should take you, or null when there is nowhere to go.
 *
 *  Returned rather than applied so the caller can decide not to start a turn
 *  animation it would have to cancel. */
export function nextView(view, views, direction) {
  const target = view + direction;
  if (target < 0 || target >= views) return null;
  return target;
}
