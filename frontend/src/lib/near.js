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
