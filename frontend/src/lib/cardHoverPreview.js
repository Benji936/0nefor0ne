// Hover-card preview: shared store + the global thumbnail detector.
//
// A single document-level listener (mirroring installCardImageFallback's one-handler,
// zero-per-component approach) spots when the cursor lands on a small card thumbnail,
// then drives a reactive store that <CardHoverPreview> renders into a rich floating
// panel (art, price, rarity, stats, effect text). Card data is fetched once per id
// and cached. SSG-safe and a no-op on touch / coarse-pointer devices.

import { reactive } from "vue";
import { searchById } from "@/api";

const CARD_SRC_RE = /\/cards\/[^/]+\.jpg(\?|$)/;
const CARD_ID_RE = /\/cards\/([^/.]+)\.jpg/;
const SHOW_AFTER = 120;   // ms hover dwell before the panel appears
const HIDE_AFTER = 90;    // ms grace so sliding between cards doesn't flicker
const MAX_THUMB_H = 230;  // skip images already this tall (e.g. the card-page hero)

/** Reactive state the panel component reads. `rect` is a plain DOMRect snapshot. */
export const hoverState = reactive({
  visible: false,
  id: null,
  rect: null,
  card: null,
});

const cache = new Map(); // id -> card object (or null when not found)

async function loadCard(id, locale) {
  if (cache.has(id)) return cache.get(id);
  try {
    const res = await searchById(id, locale);
    const card = res?.data?.data?.[0] ?? (Array.isArray(res?.data) ? res.data[0] : null) ?? null;
    cache.set(id, card);
    return card;
  } catch {
    cache.set(id, null);
    return null;
  }
}

export async function showHoverCard(id, rect, locale = "en") {
  hoverState.id = id;
  hoverState.rect = rect;
  hoverState.visible = true;
  hoverState.card = cache.get(id) ?? null; // instant if cached, else fill in below
  if (cache.has(id)) return;
  const card = await loadCard(id, locale);
  if (hoverState.id === id) hoverState.card = card; // ignore if the user moved on
}

export function hideHoverCard() {
  hoverState.visible = false;
}

/** Install the global thumbnail detector. Call once, client-side; `getLocale`
 *  returns the active locale string so card data is fetched in the right language. */
export function installCardHoverPreview(getLocale = () => "en") {
  if (typeof window === "undefined" || window.__cardHoverInstalled) return;
  if (!window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches) return;
  window.__cardHoverInstalled = true;

  let showTimer = 0, hideTimer = 0;

  function cardUnder(target) {
    if (!target || target.tagName !== "IMG" || target.dataset.cardFallback) return null;
    const src = target.currentSrc || target.src || "";
    if (!CARD_SRC_RE.test(src)) return null;
    if (target.clientHeight > MAX_THUMB_H) return null;       // already large
    if (target.closest(".v-overlay__content")) return null;   // inside an open dialog
    const m = src.match(CARD_ID_RE);
    if (!m) return null;
    const r = target.getBoundingClientRect();
    return {
      id: m[1],
      rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
    };
  }

  document.addEventListener("mouseover", (e) => {
    const hit = cardUnder(e.target);
    if (!hit) return;
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    showTimer = window.setTimeout(() => showHoverCard(hit.id, hit.rect, getLocale()), SHOW_AFTER);
  });

  document.addEventListener("mouseout", (e) => {
    if (!cardUnder(e.target)) return;
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hideHoverCard, HIDE_AFTER);
  });

  // The anchored rect goes stale the moment the page scrolls or anything is clicked.
  window.addEventListener("scroll", hideHoverCard, true);
  window.addEventListener("click", hideHoverCard, true);
}
