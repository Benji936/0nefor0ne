/**
 * seed-communities.mjs
 *
 * Upserts one `community` row per OTS store from data/stores.json.
 * Seeded rows are UNCLAIMED shells (owner NULL, status 'published') that owners
 * can later claim. Idempotent on ots_store_id (re-running updates, never dupes).
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
const db = DRY ? null : createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

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
    city: a.city ?? null,
    country: a.country ?? null,
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
  const rows = slice.map(s => toRow(s, usedSlugs));

  console.log(`stores: ${stores.length} | seeding: ${rows.length} | dry-run: ${DRY}`);
  console.log("sample:", JSON.stringify(rows[0], null, 2));
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
