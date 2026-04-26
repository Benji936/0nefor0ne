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

const BASE = (import.meta.env.VITE_R2_CARDS_BASE || "").replace(/\/$/, "");

export function cardImage(id) {
  if (!id) return "";
  if (BASE) return `${BASE}/cards/${id}.jpg`;
  // Dev fallback only.
  return `https://images.ygoprodeck.com/images/cards/${id}.jpg`;
}
