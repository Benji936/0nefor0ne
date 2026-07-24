// Archetype -> representative card art.
//
// "Looking For" announces carry a canonical archetype name but no picture of
// their own. public/archetype-art.json (produced by scripts/archetype-art.mjs)
// maps each archetype to one elected card id; here we turn that into an image
// URL through lib/cardImage.js, so archetype art resolves to the same R2 CDN
// as every other card image.
//
// Mirrors the manifest handling in lib/banlist.js: fetched once per session
// into a reactive ref, client-only and SSG-safe, so computeds that call
// archetypeArtUrl() re-render when the manifest lands.

import { ref } from "vue";
import { cardImageCropped } from "./cardImage";

// { "<archetypeName>": <passcodeId> }
export const archetypeArtManifest = ref(null);
let manifestPromise = null;

// Lowercased view of the manifest, derived on first use and re-derived if the
// manifest object is ever replaced. The archetype on an announce comes from
// YGOPRODeck's canonical list on both the Discord and website paths, so an
// exact hit is the norm — this only guards against casing drift between the
// list and the manifest.
let lowerIndex = null;
let lowerIndexSource = null;

function lowerIndexFor(manifest) {
  if (lowerIndexSource !== manifest) {
    lowerIndex = new Map(Object.entries(manifest).map(([name, id]) => [name.toLowerCase(), id]));
    lowerIndexSource = manifest;
  }
  return lowerIndex;
}

/** Load the archetype art manifest once. No-op (resolves null) during SSR. */
export function ensureArchetypeArtManifest() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (archetypeArtManifest.value) return Promise.resolve(archetypeArtManifest.value);
  if (!manifestPromise) {
    manifestPromise = fetch("/archetype-art.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => { archetypeArtManifest.value = j; return j; })
      .catch(() => { manifestPromise = null; return {}; }); // non-critical enhancement
  }
  return manifestPromise;
}

/** Elected card id for an archetype, or null when it isn't a known archetype
 *  (or the manifest hasn't loaded yet). */
export function archetypeArtId(archetype) {
  const name = typeof archetype === "string" ? archetype.trim() : "";
  const manifest = archetypeArtManifest.value;
  if (!name || !manifest) return null;
  return manifest[name] ?? lowerIndexFor(manifest).get(name.toLowerCase()) ?? null;
}

/** Cropped-art URL for an archetype, or null.
 *
 *  Null means "render nothing at all" — an announce whose text matched no
 *  archetype must show no picture, not a placeholder. Callers should also hide
 *  the image on a load error so a missing CDN object degrades the same way. */
export function archetypeArtUrl(archetype) {
  const id = archetypeArtId(archetype);
  return id ? cardImageCropped(id) : null;
}
