/**
 * seed-community-private.mjs
 *
 * Fills community_private.claim_email from the OTS source (data/stores.json),
 * joining stores.json `id` -> community.ots_store_id. Idempotent (upsert on the
 * community PK). Needs a service-role key because community_private denies all
 * client roles.
 *
 * Usage:
 *   node scripts/seed-community-private.mjs --dry-run
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-community-private.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORES = resolve(__dirname, "../../data/stores.json");

const DRY = process.argv.includes("--dry-run");
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://sxteuctysfiwripnaozi.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && !SERVICE_KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY to write. Use --dry-run to preview.");
  process.exit(1);
}
const db = DRY ? null : createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function main() {
  const raw = JSON.parse(await readFile(STORES, "utf8"));
  const stores = (raw.data ?? raw).filter((s) => s?.id && s?.email);
  const byOts = new Map(stores.map((s) => [String(s.id), s.email]));
  console.log(`stores with email: ${byOts.size} | dry-run: ${DRY}`);
  if (DRY) {
    console.log("sample:", [...byOts.entries()][0]);
    return;
  }

  // Page through community rows to map ots_store_id -> community.id.
  const CHUNK = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await db
      .from("community")
      .select("id, ots_store_id")
      .not("ots_store_id", "is", null)
      .range(from, from + CHUNK - 1);
    if (error) { console.error("read failed", error); process.exit(1); }
    if (!data.length) break;
    for (const c of data) {
      const email = byOts.get(String(c.ots_store_id));
      if (email) rows.push({ community: c.id, claim_email: email });
    }
    from += CHUNK;
    if (data.length < CHUNK) break;
  }

  console.log(`upserting ${rows.length} private-email rows`);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from("community_private")
      .upsert(rows.slice(i, i + 500), { onConflict: "community" });
    if (error) { console.error("upsert failed at", i, error); process.exit(1); }
  }
  console.log("done.");
}
main();
