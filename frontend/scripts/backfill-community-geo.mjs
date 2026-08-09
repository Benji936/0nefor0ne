/**
 * backfill-community-geo.mjs
 *
 * Fills in the two location columns a community can be missing:
 *
 *   lat/lng  — no pin, so the community is invisible to Near me no matter how
 *              verified it is. Resolved forward, from "city, country".
 *   country  — no country, so it is missing from the directory's country filter
 *              and priced in the USD fallback. Resolved backward, from the pin.
 *
 * It also re-spells countries written a way the country picker does not offer.
 * The directory filter compares names literally, so a store filed under
 * "Republic of Indonesia" is listed and unfindable at the same time: picking
 * Indonesia never matches it.
 *
 * The forms now write both (see resolveLocation in src/lib/community.js); this
 * is for the rows that predate that, and for anything a future importer lands
 * without. Idempotent: it only ever touches rows that are missing a value, and
 * only ever writes values it actually resolved.
 *
 * A country with no city is deliberately left unpinned. Geocoding "Singapore"
 * with no address returns the country centroid, which would put a shop several
 * kilometres from itself and tell somebody it was nearby when it is not. An
 * empty pin is a gap; a centroid is a wrong answer that looks like a right one.
 *
 * Nominatim's usage policy allows about one request a second and requires a
 * real User-Agent. Both are honoured below; a full run over a few dozen rows
 * takes under a minute, and the rate limit is not negotiable.
 *
 * Usage:
 *   node scripts/backfill-community-geo.mjs --dry-run     # print, write nothing
 *   node scripts/backfill-community-geo.mjs --limit=10
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-community-geo.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { countryByCode, canonicalCountry } from "../src/lib/countries.js";

const DRY = process.argv.includes("--dry-run");
const LIMIT = parseInt(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0", 10);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://sxteuctysfiwripnaozi.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY: seeded rows have owner NULL and RLS hides them from anon.");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Identifies us to Nominatim, which is a condition of using it at all.
const UA = "OneForOne/1.0 (https://0nefor.one; community geo backfill)";
const GAP_MS = 1100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function nominatim(path, params) {
  const url = `https://nominatim.openstreetmap.org/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.json();
}

/** "city, country" -> a pin, or null when the geocoder does not know it. */
async function forward(city, country) {
  const q = [city, country].filter(Boolean).join(", ");
  const rows = await nominatim("search", {
    q, format: "jsonv2", addressdetails: "1", limit: "1",
    featuretype: "settlement", "accept-language": "en",
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  const lat = Number(row.lat), lng = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, countryCode: row.address?.country_code?.toUpperCase() ?? null };
}

/** A pin -> the country it is in. zoom=3 asks for the country, not the street. */
async function reverse(lat, lng) {
  const row = await nominatim("reverse", {
    lat: String(lat), lon: String(lng),
    format: "jsonv2", zoom: "3", addressdetails: "1", "accept-language": "en",
  });
  return row?.address?.country_code?.toUpperCase() ?? null;
}

/**
 * Re-spell countries the country picker does not offer.
 *
 * Costs no geocoder call, so it runs over every row rather than only the ones
 * with a gap: a country can be perfectly filled in and still be the wrong
 * string. Discovered by paging (PostgREST caps a read at 1000 rows), then
 * applied one bulk update per distinct misspelling.
 */
async function normalizeNames() {
  const wrong = new Map();  // as written -> canonical entry
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("community").select("country").not("country", "is", null)
      .order("id").range(from, from + 999);
    if (error) { console.error("read failed", error); process.exit(1); }
    for (const { country } of data) {
      const known = canonicalCountry(country);
      if (known && known.name !== country) wrong.set(country, known);
    }
    if (data.length < 1000) break;
  }

  if (!wrong.size) { console.log("country names: all already canonical\n"); return; }
  for (const [written, known] of wrong) {
    console.log(`  ✓ "${written}" -> "${known.name}" (${known.code})`);
    if (DRY) continue;
    const { error } = await db
      .from("community").update({ country: known.name, country_code: known.code })
      .eq("country", written);
    if (error) console.error(`  ! rename failed for "${written}"`, error.message);
  }
  console.log(`renamed ${wrong.size} country spelling(s)\n`);
}

async function main() {
  await normalizeNames();

  const { data, error } = await db
    .from("community")
    .select("id, name, city, country, country_code, lat, lng")
    .or("lat.is.null,lng.is.null,country.is.null")
    .order("id");
  if (error) { console.error("read failed", error); process.exit(1); }

  const rows = LIMIT > 0 ? data.slice(0, LIMIT) : data;
  console.log(`${rows.length} row(s) with a gap${DRY ? " (dry run)" : ""}\n`);

  let pinned = 0, named = 0, skipped = 0;

  for (const row of rows) {
    const patch = {};
    const hasPin = Number.isFinite(row.lat) && Number.isFinite(row.lng);
    let code = row.country_code ?? null;

    try {
      if (!hasPin && row.city) {
        const place = await forward(row.city, row.country);
        await sleep(GAP_MS);
        if (place) {
          patch.lat = place.lat;
          patch.lng = place.lng;
          code = code ?? place.countryCode;
        }
      } else if (hasPin && !row.country) {
        code = code ?? await reverse(row.lat, row.lng);
        await sleep(GAP_MS);
      }

      // Our own list is the authority on the spelling, because the directory
      // filter compares country names literally: Nominatim's "Republic of
      // Indonesia" would file the shop under a country nobody can select.
      const known = countryByCode(code);
      if (known && !row.country) { patch.country = known.name; patch.country_code = known.code; }
      else if (known && !row.country_code) { patch.country_code = known.code; }
    } catch (e) {
      console.warn(`  ! ${row.id} ${row.name}: ${e.message}`);
      await sleep(GAP_MS);
      continue;
    }

    if (!Object.keys(patch).length) {
      skipped++;
      console.log(`  – ${row.id} ${row.name}: nothing resolvable (city=${row.city ?? "—"}, country=${row.country ?? "—"})`);
      continue;
    }
    if (patch.lat != null) pinned++;
    if (patch.country) named++;

    console.log(`  ✓ ${row.id} ${row.name}: ${JSON.stringify(patch)}`);
    if (DRY) continue;

    const { error: upErr } = await db.from("community").update(patch).eq("id", row.id);
    if (upErr) console.error(`  ! ${row.id} write failed`, upErr.message);
  }

  console.log(`\npinned ${pinned}, named ${named}, left alone ${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
