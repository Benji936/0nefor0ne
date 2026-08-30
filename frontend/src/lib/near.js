// "What is near me", asked of the places that proved they are real.
//
// The three reads are database functions rather than filtered selects, because
// distance is not something PostgREST can order by and shipping 4443 rows to
// the browser to sort them there would be worse in every way. See
// supabase/migrations/20260809_near_me.sql.
//
// Verified-only is the product decision this exists to serve: geographic
// discovery is what a shop is paying for. It also means the answer is empty
// until somebody subscribes, which is why unclaimedNear exists next to it.
import { getClient } from "@/lib/supabaseClient";
import { kindsOf } from "@/lib/communityKinds";
import { resolveCountry } from "@/lib/countries";

/** How far out to look, in km. The first is the default. */
export const RADII = [10, 25, 50, 100];
export const DEFAULT_RADIUS = 25;

/** Why a location request failed, in terms the UI can act on. */
export const GEO_UNSUPPORTED = "geo_unsupported";
export const GEO_DENIED = "geo_denied";
export const GEO_UNAVAILABLE = "geo_unavailable";

/**
 * The browser's idea of where you are.
 *
 * Rejects with one of the codes above rather than a GeolocationPositionError,
 * because the three cases want three different sentences: denied is a decision
 * the reader made and can unmake, unavailable is the hardware shrugging, and
 * unsupported is a browser that never had it.
 */
export function requestPosition({ timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error(GEO_UNSUPPORTED));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err?.code === 1 ? GEO_DENIED : GEO_UNAVAILABLE)),
      // No high accuracy: this picks a radius in tens of kilometres, and asking
      // for GPS precision costs battery and seconds to answer a question that
      // does not need it. A cached fix from the last five minutes is fine.
      { enableHighAccuracy: false, timeout, maximumAge: 300000 },
    );
  });
}

function callNear(fn, { lat, lng, km = DEFAULT_RADIUS, limit } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Promise.reject(new Error("near: lat and lng are required"));
  }
  const args = { p_lat: lat, p_lng: lng, p_km: km };
  if (limit != null) args.p_limit = limit;
  return getClient().rpc(fn, args).then(({ data, error }) => {
    if (error) { console.error(`${fn} failed`, error); throw error; }
    return data ?? [];
  });
}

/** Verified communities within the radius, nearest first. */
export function communitiesNear(opts) { return callNear("communities_near", opts); }

/** Upcoming events at verified communities within the radius, soonest first. */
export function eventsNear(opts) { return callNear("events_near", opts); }

/**
 * Seeded shops nearby that nobody has claimed. This is what an empty near-me
 * shows: the question stops being "why is this blank" and becomes "is one of
 * these yours". Emptiness is the only acquisition surface the feature has
 * while no one is verified yet.
 */
export function unclaimedNear(opts) { return callNear("unclaimed_near", { limit: 6, ...opts }); }

/**
 * The directory's other filters, applied in the browser.
 *
 * The near functions take a position and a radius and nothing else. Pushing
 * kind, name and remote-duel into SQL would mean three more arguments on three
 * functions to narrow a list that is already capped at a hundred rows. What
 * does matter is that the answers match: `contains(kinds, [kind])` and the
 * finder's name/city/country search from fetchDirectory are reproduced here, so
 * turning Near me on cannot silently change what a query means.
 */
export function filterNear(rows, { kind = "", q = "", remoteDuel = false, locale } = {}) {
  const needle = String(q ?? "").trim().toLowerCase();
  // The same three columns the finder searches, and the same country-name
  // resolution, so a query that finds a shop in the full list still finds it
  // once Near me is on. When they disagreed, turning the mode on looked like
  // the shop had moved out of range.
  const canon = needle ? resolveCountry(needle, locale)?.name?.toLowerCase() : null;
  const hit = (v) => String(v ?? "").toLowerCase().includes(needle);
  return (rows ?? []).filter((row) => {
    if (kind && !kindsOf(row).includes(kind)) return false;
    if (remoteDuel && row.remote_duel !== true) return false;
    if (needle && !hit(row.name) && !hit(row.city) && !hit(row.country)
      && !(canon && String(row.country ?? "").toLowerCase() === canon)) return false;
    return true;
  });
}

/**
 * A latitude/longitude box that contains everything within `km` of a point.
 *
 * Coarse on purpose: it is a pre-filter, and whatever it lets through is
 * measured properly with distanceKm afterwards. A degree of latitude is 111 km
 * anywhere; a degree of longitude is 111 km at the equator and narrows with the
 * cosine of the latitude, which is why the two are not the same number.
 *
 * Returns null for the longitude pair when the box crosses the antimeridian,
 * because "lng between 179 and -179" is not a range PostgREST can be asked for
 * and the two shops in Fiji are not worth a second query. The latitude bound
 * still narrows it, and the distance sort still sorts it.
 */
export function boundingBox({ lat, lng }, km) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !(km > 0)) return null;
  const dLat = km / 111;
  const cos = Math.cos((lat * Math.PI) / 180);
  const dLng = Math.abs(cos) < 0.01 ? 180 : km / (111 * Math.abs(cos));
  const west = lng - dLng;
  const east = lng + dLng;
  return {
    minLat: Math.max(-90, lat - dLat),
    maxLat: Math.min(90, lat + dLat),
    ...(west >= -180 && east <= 180 ? { minLng: west, maxLng: east } : {}),
  };
}

/**
 * Great-circle kilometres between two points.
 *
 * The near-me functions do this in SQL because they do it for a hundred rows at
 * a time and have to sort by the answer. A single profile page asking "how far
 * is this one shop from me" would be a round trip to ask the database something
 * it can work out in six lines, so it works it out here.
 */
export function distanceKm(a, b) {
  const ok = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
  if (!ok(a) || !ok(b)) return null;
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A distance a person would say out loud. Under 10km keeps one decimal because
 * the difference between 2.4 and 3.1 is the difference between walking and not;
 * past that, whole kilometres, because nobody chooses a shop on 34.2 versus 34.
 */
export function formatDistance(km) {
  if (!Number.isFinite(km) || km < 0) return null;
  // Floored at 100m, not at 1m: rounding 20 metres to the nearest hundred gives
  // zero, and "1 m" would be a worse lie than "100 m".
  if (km < 1) return `${Math.max(100, Math.round(km * 1000 / 100) * 100)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
