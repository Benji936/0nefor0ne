// Marking a search term inside text the user did not write.
//
// Card rules text comes from the card API, so it never reaches a template as
// HTML — splitting it into segments lets the template mark the hits with real
// elements and keeps v-html out of the picture entirely.

/**
 * Split `text` on every case-insensitive occurrence of `query`.
 *
 * Always returns the whole string, in order: concatenating every segment's `t`
 * reproduces the input exactly. Returns null when there is nothing to mark, so
 * a caller can fall back to rendering the plain string.
 *
 * @param {string} text
 * @param {string} query
 * @returns {Array<{t: string, hit: boolean}>|null}
 */
export function splitMatches(text, query) {
  const src = typeof text === "string" ? text : "";
  const needle = String(query ?? "").trim().toLowerCase();
  if (!src || !needle) return null;

  const hay = src.toLowerCase();
  if (!hay.includes(needle)) return null;

  const segments = [];
  let i = 0;
  for (;;) {
    const at = hay.indexOf(needle, i);
    if (at === -1) {
      if (i < src.length) segments.push({ t: src.slice(i), hit: false });
      break;
    }
    if (at > i) segments.push({ t: src.slice(i, at), hit: false });
    segments.push({ t: src.slice(at, at + needle.length), hit: true });
    i = at + needle.length;
  }
  return segments;
}
