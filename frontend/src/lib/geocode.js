/**
 * Place lookup backed by Nominatim (OpenStreetMap).
 *
 * Keyless on purpose: the community map already uses Wikimedia's keyless OSM
 * tiles, so address search stays on the same footing — no API key, no signup,
 * no billing to keep alive.
 *
 * Nominatim's usage policy caps traffic at roughly one request per second and
 * forbids hammering it per keystroke, so every caller MUST debounce and pass an
 * AbortSignal to drop superseded lookups. PlaceAutocomplete does both.
 */

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

/** Nominatim caps `limit` at 40; a short list is all an autocomplete needs. */
export const MAX_RESULTS = 6;

/** Below this a query matches half the planet and the results are noise. */
export const MIN_QUERY = 3;

/**
 * Turn a Nominatim row into what the UI shows: a short primary label plus the
 * broader context. Nominatim's display_name is a long comma-joined string
 * ("Foo Cards, 12 Main St, Springfield, Illinois, 62701, United States"); the
 * head reads as the place and the tail as where it is.
 */
export function formatPlace(row) {
  const parts = String(row?.display_name ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const address = row.address ?? {};
  return {
    id: row.place_id,
    // The full string is what we store — it is unambiguous.
    value: parts.join(", "),
    primary: parts[0],
    secondary: parts.slice(1).join(", "),
    lat: row.lat != null ? Number(row.lat) : null,
    lon: row.lon != null ? Number(row.lon) : null,
    // What country the pin is actually in, straight from the geocoder. A
    // community's country used to be typed independently of its address, which
    // is how a shop ended up filed under one country and pinned in another.
    country: address.country ?? null,
    countryCode: address.country_code ? String(address.country_code).toUpperCase() : null,
  };
}

/**
 * Search places matching `query`.
 *
 * Resolves to [] rather than throwing on network/HTTP failure: an address
 * lookup is an optional convenience, and a dead third party must never block
 * someone from typing an address by hand. Aborts propagate so the caller can
 * distinguish "superseded" from "no results".
 */
export async function searchPlaces(query, { signal, locale = "en", featureType, limit = MAX_RESULTS } = {}) {
  const q = String(query ?? "").trim();
  if (q.length < MIN_QUERY) return [];

  const url = `${ENDPOINT}?${new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    "accept-language": locale,
    // Nominatim's own spelling is lowercase. "settlement" keeps a city field
    // answering with cities: without it "Geneva" also offers the canton, the
    // lake and a street, and the first row is a coin toss.
    ...(featureType ? { featuretype: featureType } : {}),
  })}`;

  let res;
  try {
    res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    console.error("searchPlaces failed", e);
    return [];
  }
  if (!res.ok) {
    console.error("searchPlaces HTTP", res.status);
    return [];
  }

  let rows;
  try { rows = await res.json(); }
  catch { return []; }

  // Nominatim commonly returns the same street as several rows (one per way
  // segment). They render identically, so collapse them by display string.
  return dedupe((Array.isArray(rows) ? rows : []).map(formatPlace).filter(Boolean));
}

/**
 * The single best match for a place, or null.
 *
 * For code that needs an answer rather than a menu: resolving a community's
 * city to coordinates at save time. Same failure contract as searchPlaces —
 * null on a dead geocoder, never a throw, because a missing pin must not stop
 * somebody saving their profile.
 */
export async function geocodePlace(query, { signal, locale = "en", featureType } = {}) {
  const rows = await searchPlaces(query, { signal, locale, featureType, limit: 1 });
  return rows[0] ?? null;
}

/** Keep the first of each identical `value`, preserving relevance order. */
export function dedupe(places) {
  const seen = new Set();
  return places.filter((p) => {
    const k = p.value.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
