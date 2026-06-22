// Forbidden/Limited (banlist) status resolution.
//
// YGOPRODeck's per-card `banlist_info` lags the current TCG/OCG lists, so we
// prefer a Yugipedia-sourced manifest (public/yugipedia-banlist.json, produced by
// scripts/yugipedia-banlist.mjs) and fall back to `banlist_info` when a card isn't
// in it. The manifest is fetched once per session (client-only, SSG-safe) into a
// reactive ref, so badges that consult banlistStatusFor() re-render when it loads.

import { ref } from "vue";

// { "<passcodeId>": { tcg?: "Forbidden"|"Limited"|"Semi-Limited", ocg?: … } }
export const banlistManifest = ref(null);
let manifestPromise = null;

/** Load the Yugipedia banlist manifest once. No-op (resolves null) during SSR.
 *  Call from any surface that shows cards so manifest-only restrictions (cards
 *  unlimited in YGOPRODeck's data but restricted on the current list) still appear. */
export function ensureBanlistManifest() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (banlistManifest.value) return Promise.resolve(banlistManifest.value);
  if (!manifestPromise) {
    manifestPromise = fetch("/yugipedia-banlist.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => { banlistManifest.value = j; return j; })
      .catch(() => { manifestPromise = null; return {}; }); // non-critical enhancement
  }
  return manifestPromise;
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const BAN_STATUS = {
  forbidden:   { key: "forbidden",   copies: 0 },
  banned:      { key: "forbidden",   copies: 0 },
  limited:     { key: "limited",     copies: 1 },
  semilimited: { key: "semiLimited", copies: 2 },
};

/** Raw status string for a card+format, manifest first then YGOPRODeck. */
function rawStatus(card, format) {
  const fromManifest =
    banlistManifest.value && card?.id != null
      ? banlistManifest.value[card.id]?.[format]
      : null;
  if (fromManifest) return fromManifest;
  return card?.banlist_info?.[format === "ocg" ? "ban_ocg" : "ban_tcg"] ?? null;
}

/** Normalized banlist status for a card in the given format ("tcg" | "ocg"), or
 *  null when unlimited there. Returns { key, copies, format } where `key` ∈
 *  forbidden|limited|semiLimited (an i18n key), `copies` is the max playable count
 *  (0/1/2) and `format` is "TCG"/"OCG". Reactive to the loaded manifest. */
export function banlistStatusFor(card, format = "tcg") {
  const status = BAN_STATUS[norm(rawStatus(card, format))];
  return status ? { ...status, format: format.toUpperCase() } : null;
}

/** True when the card is restricted in TCG and/or OCG (manifest or YGOPRODeck). */
export function hasAnyBanlist(card) {
  return !!(banlistStatusFor(card, "tcg") || banlistStatusFor(card, "ocg"));
}
