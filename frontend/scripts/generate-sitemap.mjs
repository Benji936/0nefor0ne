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
import { ARCHETYPES } from "../src/data/archetype-slugs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../public/sitemap.xml");

// The card IDs this run put in the sitemap, handed to vite.config.js so
// includedRoutes prerenders exactly them. The two lists used to be independent —
// the sitemap took 200 IDs from Supabase, includedRoutes took 16 from
// card-ids.js — so 184 sitemap URLs pointed at pages that were never built and
// resolved to the SPA shell. Generated, gitignored, and only ever written here;
// vite.config.js falls back to TOP_CARD_IDS when it is absent.
const MANIFEST = resolve(__dirname, "../src/data/prerender-cards.generated.json");

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

// `englishOnly` submits just /en<path> with an en + x-default cluster, for pages
// that exist in every locale but only have translated chrome — the policy pages,
// whose legal text is English everywhere on purpose. Their fr/de/it URLs stay
// prerendered and reachable; they are simply not offered to Google as
// translations, which matches the canonical those pages emit (see App.vue).
// Submitting the four-locale cluster here would contradict that and hand Google
// four near-identical documents to choose between.
function urlEntry({ path, changefreq, priority, englishOnly = false }) {
  if (englishOnly) {
    const loc = `${BASE}/en${path}`;
    return `
  <url>
    <loc>${loc}</loc>
    <xhtml:link rel="alternate" hreflang="en"        href="${loc}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}"/>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  }
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

// Archetype pages are English-only — same rationale as card and set pages.
// Priority sits above sets: these are the highest-volume queries in the game
// ("Labrynth deck", "Snake-Eye cards") and the pages have the most to say.
function archetypeUrlEntry(slug) {
  const loc = `${BASE}/en/archetype/${slug}`;
  return `
  <url>
    <loc>${loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
    <xhtml:link rel="alternate" hreflang="en" href="${loc}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}"/>
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
  { path: "/privacy", changefreq: "yearly", priority: 0.3, englishOnly: true },
  { path: "/terms",   changefreq: "yearly", priority: 0.3, englishOnly: true },
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
  const fetched = await fetchTopCards(LIMIT);

  // The trending RPC can return the same image_id more than once — one build
  // returned 200 rows covering 196 cards. Only the Card-table fallback deduped,
  // so the duplicates reached the sitemap as repeated <loc> entries and made the
  // prerender count look 4 short of the sitemap count for no reason.
  const seenIds = new Set();
  const cards = fetched.filter(c => !seenIds.has(c.image_id) && seenIds.add(c.image_id));
  if (cards.length !== fetched.length) {
    console.log(`  Deduplicated ${fetched.length - cards.length} repeated image_id(s) → ${cards.length} unique cards`);
  }

  // Counted rather than multiplied out: englishOnly pages contribute one entry
  // each, not one per locale, so STATIC_PAGES.length * LOCALES.length has been
  // wrong since they were added.
  const staticEntries  = STATIC_PAGES.map(urlEntry).join("");
  const staticCount    = STATIC_PAGES.reduce((n, p) => n + (p.englishOnly ? 1 : LOCALES.length), 0);
  const cardEntries    = cards.map(c =>
    cardUrlEntry({ path: `/card/${c.image_id}`, changefreq: "weekly", priority: 0.6 })
  ).join("");
  const setEntries     = TOP_SET_SLUGS
    .map(name => setUrlEntry({ path: '/set/' + encodeURIComponent(name) }))
    .join('');
  const archetypeEntries = ARCHETYPES.map(a => archetypeUrlEntry(a.slug)).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Auto-generated by scripts/generate-sitemap.mjs
  ${new Date().toISOString()}
  Static pages: ${staticCount} (${STATIC_PAGES.length} pages, English-only ones counted once)
  Card pages:   ${cards.length} × en only (non-English locales redirect to /en/card/:id)
  Set pages:    ${TOP_SET_SLUGS.length} × en only
  Archetypes:   ${ARCHETYPES.length} × en only (those under the card floor are pruned post-build)
  Total <url> entries: ${staticCount + cards.length + TOP_SET_SLUGS.length + ARCHETYPES.length}
-->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${staticEntries}
${cardEntries}
${setEntries}
${archetypeEntries}
</urlset>
`;

  await writeFile(OUT, xml, "utf8");
  await writeFile(MANIFEST, JSON.stringify(cards.map(c => c.image_id), null, 2), "utf8");
  console.log(`\nWrote ${OUT}`);
  console.log(`Wrote ${MANIFEST} (${cards.length} card IDs for includedRoutes)`);
  console.log(`  ${STATIC_PAGES.length} static pages = ${staticCount} entries`);
  console.log(`  ${cards.length} card pages × en only = ${cards.length} entries`);
  console.log(`  ${TOP_SET_SLUGS.length} set pages × en only = ${TOP_SET_SLUGS.length} entries`);
  console.log(`  ${ARCHETYPES.length} archetype pages × en only = ${ARCHETYPES.length} entries`);
  console.log(`  Total: ${staticCount + cards.length + TOP_SET_SLUGS.length + ARCHETYPES.length} <url> entries (before pruning)`);
}

main().catch(err => { console.error(err); process.exit(1); });
