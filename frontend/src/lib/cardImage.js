// Single source of truth for card image URLs.
//
// In production, set VITE_R2_CARDS_BASE in your environment, e.g.:
//   VITE_R2_CARDS_BASE=https://pub-abc123def456.r2.dev
// or
//   VITE_R2_CARDS_BASE=https://cards.yourdomain.com
//
// If the env var is unset (e.g. local dev with no .env), we fall back to the
// YGOPRODeck CDN so things still render — but note that's rate-limited and
// you should not ship to production without VITE_R2_CARDS_BASE set.

import cardBack from "../assets/yugioh/back.webp";

const BASE = (import.meta.env.VITE_R2_CARDS_BASE || "").replace(/\/$/, "");

export function cardImage(id) {
  if (!id) return "";
  if (BASE) return `${BASE}/cards/${id}.jpg`;
  // Dev fallback only.
  return `https://images.ygoprodeck.com/images/cards/${id}.jpg`;
}

/** Borderless artwork only (cards_cropped/{id}.jpg). Used by the hover preview.
 *  Synced to R2 alongside the full card by scripts/r2/sync-from-api.mjs — but a
 *  printing may lag behind a sync, so callers should fall back to cardImage(id)
 *  on error (and the global handler below ultimately falls back to the card back). */
export function cardImageCropped(id) {
  if (!id) return "";
  if (BASE) return `${BASE}/cards_cropped/${id}.jpg`;
  // Dev fallback only.
  return `https://images.ygoprodeck.com/images/cards_cropped/${id}.jpg`;
}

/** The card-back placeholder shown when a card image fails to load. */
export const CARD_BACK = cardBack;

/** Install a one-time, client-only handler that swaps any broken card image
 *  (a `…/cards/<id>.jpg` URL) for the card-back placeholder. Image `error` events
 *  don't bubble, so we listen in the capture phase — this covers every card <img>
 *  across the app without per-component wiring. */
export function installCardImageFallback() {
  if (typeof window === "undefined" || window.__cardImgFallbackInstalled) return;
  window.__cardImgFallbackInstalled = true;
  window.addEventListener(
    "error",
    (e) => {
      const el = e.target;
      if (!el || el.tagName !== "IMG" || el.dataset.cardFallback) return;
      const src = el.currentSrc || el.src || "";
      if (/\/cards\/[^/]+\.jpg(\?|$)/.test(src)) {
        el.dataset.cardFallback = "1"; // guard against an infinite error loop
        el.src = CARD_BACK;
      }
    },
    true
  );
}
