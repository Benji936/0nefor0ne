/**
 * generate-sitemap.mjs
 *
 * Generates public/sitemap.xml by combining:
 *   1. Static pages (homepage, /trade, /library) — all 4 locales
 *   2. Top N card permalink pages from the Supabase trending cards RPC
 *
 * Usage:
 *   node scripts/generate-sitemap.mjs
 *   node scripts/generate-sitemap.mjs --limit 500
 */

import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TOP_CARD_IDS } from "../src/data/card-ids.js";
import { TOP_SET_SLUGS } from "../src/data/set-slugs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../public/sitemap.xml");

// Env vars win when set (staging, a fork); the literals keep the build working
// with zero configuration. The anon key is public by design — see the note in
// src/lib/supabaseClient.js.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://sxteuctysfiwripnaozi.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4dGV1Y3R5c2Zpd3JpcG5hb3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTA1OTAsImV4cCI6MjA3MjkyNjU5MH0.nrRXz20dGkNH3wDIkHTxlrVMC-uvEiukWsq9-Pu4Lcw";

const LOCALES   = ["en", "fr", "de", "it"];
const BASE      = "https://0nefor.one";
const TODAY     = new Date().toISOString().slice(0, 10);
const LIMIT     = parseInt(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "200", 10);

// ── Helpers ───────────────────────────────────────────────────────────────────

function hreflangSet(path) {
  const alts = LOCALES.map(l =>
    `    <xhtml:link rel="alternate" hreflang="${l}"        href="${BASE}/${l}${path}"/>`
  ).join("\n");
  return alts + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE}/en${path}"/>`;
}

function urlEntry({ path, changefreq, priority }) {
  return LOCALES.map(locale => `
  <url>
    <loc>${BASE}/${locale}${path}</loc>
${hreflangSet(path)}
    <lastmod>${TODAY}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${locale === "en" ? priority : (priority - 0.1).toFixed(1)}</priority>
  </url>`).join("");
}

// Card pages are English-only — non-English locales serve the same English card
// descriptions, causing duplicate content. Only /en/card/:id is indexed.
function cardUrlEntry({ path, changefreq, priority }) {
  return `
  <url>
    <loc>${BASE}/en${path}</loc>
    <xhtml:link rel="alternate" hreflang="en"        href="${BASE}/en${path}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${BASE}/en${path}"/>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

// Set pages are English-only — same rationale as card pages.
function setUrlEntry({ path, changefreq = 'monthly', priority = 0.7 }) {
  const loc = `https://0nefor.one/en${path}`
  return `
  <url>
    <loc>${loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
    <xhtml:link rel="alternate" hreflang="en" href="${loc}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}"/>
  </url>`
}

// ── Static pages ──────────────────────────────────────────────────────────────

// Only include publicly useful pages — auth-required pages (library, trade, account)
// show thin/empty content to Googlebot and waste crawl budget.
const STATIC_PAGES = [
  { path: "/",        changefreq: "daily",  priority: 1.0 },
  { path: "/cards",   changefreq: "weekly", priority: 0.9 },
  { path: "/privacy", changefreq: "yearly", priority: 0.3 },
  { path: "/terms",   changefreq: "yearly", priority: 0.3 },
  { path: "/built-with", changefreq: "monthly", priority: 0.3 },
  // Community directory. Individual profile slugs are not enumerated here yet —
  // the `community` table seed is deferred (see src/data/community-slugs.js).
  { path: "/community", changefreq: "weekly", priority: 0.7 },
];

// ── Fetch trending cards from Supabase ────────────────────────────────────────

// A stale sitemap is a minor SEO problem; a failed build is an outage. Every
// Supabase failure below therefore degrades to the checked-in card ID list
// rather than propagating. This function does not throw.
function staticCardFallback(reason) {
  console.warn(`  ${reason}`);
  console.log(`  Using TOP_CARD_IDS fallback from src/data/card-ids.js (${TOP_CARD_IDS.length} IDs)`);
  return TOP_CARD_IDS.map(id => ({ image_id: id, name: null }));
}

async function fetchTopCards(limit) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return staticCardFallback(
      "Supabase config is empty (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — skipping the live query."
    );
  }

  console.log(`Fetching top ${limit} traded cards from Supabase...`);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Try the trending RPC first (returns image_id + trade_count)
    const { data: rpcData, error: rpcErr } = await supabase
      .rpc("get_trending_cards", { p_limit: limit });

    if (!rpcErr && rpcData?.length) {
      console.log(`  Got ${rpcData.length} cards from get_trending_cards RPC`);
      return rpcData.map(r => ({ image_id: r.image_id, name: r.name }));
    }

    // Fallback: count distinct image_ids from the Card table directly
    console.log("  RPC unavailable, falling back to Card table query (then src/data/card-ids.js if that also fails)...");
    const { data, error } = await supabase
      .from("Card")
      .select("image_id, name")
      .not("status", "in", '("traded","locked")')
      .eq("wish", false)
      .not("image_id", "is", null)
      .limit(limit * 3); // fetch more to deduplicate

    if (error) return staticCardFallback(`Supabase query failed: ${error.message}`);

    // Deduplicate by image_id, keep first occurrence
    const seen = new Set();
    const deduped = [];
    for (const row of data) {
      if (!seen.has(row.image_id)) {
        seen.add(row.image_id);
        deduped.push(row);
        if (deduped.length >= limit) break;
      }
    }
    if (!deduped.length) return staticCardFallback("Card table returned no usable rows.");

    console.log(`  Got ${deduped.length} unique cards from Card table`);
    return deduped;
  } catch (err) {
    // Covers client construction (bad/empty key) and network-level failures.
    return staticCardFallback(`Supabase unreachable: ${err.message}`);
  }
}

// ── Build sitemap ─────────────────────────────────────────────────────────────

async function main() {
  const cards = await fetchTopCards(LIMIT);

  const staticEntries  = STATIC_PAGES.map(urlEntry).join("");
  const cardEntries    = cards.map(c =>
    cardUrlEntry({ path: `/card/${c.image_id}`, changefreq: "weekly", priority: 0.6 })
  ).join("");
  const setEntries     = TOP_SET_SLUGS
    .map(name => setUrlEntry({ path: '/set/' + encodeURIComponent(name) }))
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Auto-generated by scripts/generate-sitemap.mjs
  ${new Date().toISOString()}
  Static pages: ${STATIC_PAGES.length} × ${LOCALES.length} locales
  Card pages:   ${cards.length} × en only (non-English locales redirect to /en/card/:id)
  Set pages:    ${TOP_SET_SLUGS.length} × en only
  Total <url> entries: ${STATIC_PAGES.length * LOCALES.length + cards.length + TOP_SET_SLUGS.length}
-->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${staticEntries}
${cardEntries}
${setEntries}
</urlset>
`;

  await writeFile(OUT, xml, "utf8");
  console.log(`\nWrote ${OUT}`);
  console.log(`  ${STATIC_PAGES.length} static pages × ${LOCALES.length} locales = ${STATIC_PAGES.length * LOCALES.length} entries`);
  console.log(`  ${cards.length} card pages × en only = ${cards.length} entries`);
  console.log(`  ${TOP_SET_SLUGS.length} set pages × en only = ${TOP_SET_SLUGS.length} entries`);
  console.log(`  Total: ${STATIC_PAGES.length * LOCALES.length + cards.length + TOP_SET_SLUGS.length} <url> entries`);
}

main().catch(err => { console.error(err); process.exit(1); });
