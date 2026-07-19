// Loads scraped OTS stores + upcoming events (served from public/data) and
// exposes helpers to search them and sort by distance from the user.
// Fetching happens lazily in the browser only (never during SSG prerender).

let _placesCache = null;
let _placesPromise = null;

function _base() {
  return (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
}

async function _fetchJson(path) {
  const res = await fetch(`${_base()}${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

// Store record -> Place
function _normalizeStore(s) {
  const addr = s.address ?? {};
  const parts = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean);
  return {
    source: "store",
    ref_id: s.id,
    name: s.name,
    city: addr.city ?? null,
    state: addr.state ?? null,
    country: addr.country ?? null,
    region: s.region ?? null,
    address: parts.join(", ") || null,
    lat: s.latitude ?? null,
    lng: s.longitude ?? null,
    event_date: null,
    url: null,
  };
}

// Event record -> Place (events carry no coordinates in the source data)
function _normalizeEvent(e) {
  const addr = e.address ?? {};
  const parts = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean);
  return {
    source: "event",
    ref_id: e.url,
    name: e.name,
    city: addr.city ?? null,
    state: addr.state ?? null,
    country: addr.country ?? null,
    region: null,
    address: parts.join(", ") || e.location_text || null,
    lat: null,
    lng: null,
    event_date: e.date_display ?? null,
    url: e.url ?? null,
  };
}

// Fetch + normalize stores and events once; cached for the session.
export async function loadMeetupPlaces() {
  if (_placesCache) return _placesCache;
  if (typeof window === "undefined") return []; // SSG guard
  if (!_placesPromise) {
    _placesPromise = Promise.all([
      _fetchJson("/data/stores.json").catch(() => ({ data: [] })),
      _fetchJson("/data/events.json").catch(() => ({ data: [] })),
    ])
      .then(([stores, events]) => {
        const places = [
          ...(stores.data ?? []).map(_normalizeStore),
          ...(events.data ?? []).map(_normalizeEvent),
        ];
        _placesCache = places;
        return places;
      })
      .catch(() => {
        _placesPromise = null; // allow retry
        return [];
      });
  }
  return _placesPromise;
}

// Haversine distance in km between two {lat,lng}; null if any coord missing.
export function distanceKm(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Ask the browser for the user's position. Resolves {lat,lng} or rejects.
export function getMyPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });
}

// Filter by free text over name/city/state/country, optionally sorting by
// distance from `origin`; coord-less places sink to the bottom.
export function searchPlaces(places, query, origin = null) {
  const q = (query ?? "").toLowerCase().trim();
  let list = q
    ? places.filter((p) =>
        [p.name, p.city, p.state, p.country]
          .filter(Boolean)
          .some((f) => f.toLowerCase().includes(q))
      )
    : places.slice();
  if (origin) {
    // Schwartzian transform: pair each place with its distance for sorting,
    // then unwrap so the returned objects keep the exact Place shape (no _dist leak).
    list = list
      .map((p) => [p, distanceKm(origin, p)])
      .sort(([, da], [, db]) => {
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return da - db;
      })
      .map(([p]) => p);
  }
  return list;
}
