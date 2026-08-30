/**
 * seed-communities.mjs
 *
 * Upserts one `community` row per OTS store from data/stores.json.
 * Seeded rows are UNCLAIMED shells (owner NULL, status 'published') that owners
 * can later claim. Idempotent on ots_store_id (re-running updates, never dupes).
 * Rows an owner has claimed are skipped: their name, address and phone are the
 * owner's edits, and the OTS record must not be written back over them.
 *
 * Usage:
 *   node scripts/seed-communities.mjs --dry-run           # print, write nothing
 *   node scripts/seed-communities.mjs --limit=50          # first 50 only
 *   node scripts/seed-communities.mjs                      # full run
 *
 * Requires a SERVICE ROLE key to write with owner NULL past RLS:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-communities.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { slugify, withSuffix } from "../src/lib/communitySlug.js";
import { canonicalCountry } from "../src/lib/countries.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORES = resolve(__dirname, "../../data/stores.json");

const DRY = process.argv.includes("--dry-run");
const LIMIT = parseInt(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "0", 10);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://sxteuctysfiwripnaozi.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && !SERVICE_KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY to write (owner NULL bypasses RLS). Use --dry-run to preview.");
  process.exit(1);
}
// Built whenever a key is present, dry run or not: a dry run with the key can
// then report the claimed rows it would skip instead of guessing.
const db = SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } }) : null;

/**
 * The ots_store_id of every claimed row. An owner edits their name, address and
 * phone on the profile page, and this seeder would otherwise write the OTS
 * record back over that edit on the next sync, so claimed rows are left alone.
 */
async function claimedStoreIds() {
  const PAGE = 1000;
  const ids = new Set();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("community")
      .select("ots_store_id")
      .not("owner", "is", null)
      .not("ots_store_id", "is", null)
      .range(from, from + PAGE - 1);
    if (error) { console.error("could not read claimed rows:", error); process.exit(1); }
    for (const r of data) ids.add(String(r.ots_store_id));
    if (data.length < PAGE) return ids;
  }
}

function toRow(store, usedSlugs) {
  const a = store.address ?? {};
  let slug = slugify(store.name, { city: a.city });
  let n = 2;
  while (usedSlugs.has(slug)) slug = withSuffix(slugify(store.name, { city: a.city }), n++);
  usedSlugs.add(slug);
  return {
    kind: "store",
    owner: null,
    name: store.name,
    slug,
    website: store.website ?? null,
    // The street, the code and the shop's public number. The seeder used to
    // drop all four, so 4,450 store pages knew the town and not the address
    // (20260822_community_street_address.sql). The e-mail in the same record
    // stays out on purpose: publishing 3,348 shop inboxes is a scraping
    // surface, and an owner who wants to be written to can add an email link.
    address: a.street ?? null,
    postal_code: a.zip ?? null,
    state: a.state ?? null,
    phone: store.phone ?? null,
    city: a.city ?? null,
    // Spelled the way the directory filter spells it. The source writes long
    // forms ("Republic of Indonesia") that no country picker offers, which
    // files a store where nobody can filter for it.
    country: canonicalCountry(a.country)?.name ?? a.country ?? null,
    country_code: canonicalCountry(a.country)?.code ?? null,
    region: store.region ?? null,
    lat: store.latitude ?? null,
    lng: store.longitude ?? null,
    remote_duel: !!store.remote_duel,
    ots_store_id: String(store.id),
    status: "published",
  };
}

async function main() {
  const raw = JSON.parse(await readFile(STORES, "utf8"));
  const stores = (raw.data ?? raw).filter(s => s?.id && s?.name);
  const slice = LIMIT > 0 ? stores.slice(0, LIMIT) : stores;
  const usedSlugs = new Set();
  const all = slice.map(s => toRow(s, usedSlugs));

  const claimed = db ? await claimedStoreIds() : null;
  const rows = claimed ? all.filter(r => !claimed.has(r.ots_store_id)) : all;
  const skipped = all.length - rows.length;

  console.log(`stores: ${stores.length} | seeding: ${rows.length} | dry-run: ${DRY}`);
  console.log(
    claimed
      ? `skipped ${skipped} owner-edited row(s) (${claimed.size} claimed in all)`
      : "claimed rows unknown (no service key): a real run would skip them",
  );
  console.log("sample:", JSON.stringify(rows[0] ?? null, null, 2));
  if (DRY) return;

  const CHUNK = 500;
  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await db.from("community").upsert(chunk, { onConflict: "ots_store_id" });
    if (error) { console.error("upsert failed at", i, error); process.exit(1); }
    done += chunk.length;
    console.log(`upserted ${done}/${rows.length}`);
  }
  console.log("done.");
}
main();
