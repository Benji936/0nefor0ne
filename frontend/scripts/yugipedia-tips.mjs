// Yugipedia "Card Tips" existence crawler.
//
// Builds a static manifest of which cards have a real (non-stub) Yugipedia
// "Card Tips:<name>" page, so the frontend can render an outbound
// "Strategy tips on Yugipedia ↗" link ONLY when there's something to link to —
// with zero content ingestion (no licensing/share-alike weight) and zero
// per-page-view requests to Yugipedia.
//
// Outputs (written in the SAME crawl — no extra requests):
//   frontend/public/yugipedia-tips.json       →  { "<cardId>": "<yugipediaUrl>" }
//       The frontend looks up by card id; a missing id means "don't show the link".
//   frontend/public/yugipedia-searchers.json   →  { "<cardId>": [<searcherCardId>, …] }
//       The "This card can be searched by …" list parsed from the same Card Tips
//       wikitext, with each searcher's name resolved to our YGOPRODeck card id so
//       the frontend can render a related-cards strip that links to our own pages.
//
// Usage:
//   node scripts/yugipedia-tips.mjs              # full crawl (all cards)
//   node scripts/yugipedia-tips.mjs --sample     # ~40 labeled cards (validation)
//   node scripts/yugipedia-tips.mjs --limit 500  # first N cards (smoke test)
//   node scripts/yugipedia-tips.mjs --out path/to.json
//
// Politeness: MediaWiki API, 50 titles/request, >=1s between requests, a
// descriptive User-Agent, and maxlag=5 (back off when the wiki is under load).
// This is a BATCH job — never run it from a page view.

import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const YGOPRO_API = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const WIKI_API = "https://yugipedia.com/api.php";
const NAMESPACE = "Card Tips:";
const BATCH = 50; // MediaWiki allows up to 50 titles per query
const DELAY_MS = 1100; // ~1 req/sec, slightly over to be safe
const USER_AGENT =
  "TradeMarket-OneForOne/1.0 (https://0nefor.one; Yugipedia Card Tips existence check; contact: benjsit@gmail.com)";

const SEARCHER_CAP = 30; // store at most N searchers/card — keeps the manifest lean

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const spaces = (t) => t.replace(/_/g, " ").trim(); // normalize titles to a comparable form

// Global name→id map (English canonical names → YGOPRODeck passcode), built once
// from the full card list and used to resolve parsed searcher names to card ids.
const NAME_TO_ID = new Map();

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const flagVal = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};
const SAMPLE = hasFlag("--sample");
const LIMIT = flagVal("--limit") ? Number(flagVal("--limit")) : null;
const OUT = flagVal("--out")
  ? resolve(process.cwd(), flagVal("--out"))
  : resolve(__dirname, "..", "public", SAMPLE ? "yugipedia-tips.sample.json" : "yugipedia-tips.json");
// The searchers manifest sits next to the tips manifest (sample mode mirrors the
// `.sample.json` suffix). When --out is given, append "-searchers" before .json.
const SEARCHERS_OUT = flagVal("--out")
  ? resolve(process.cwd(), flagVal("--out").replace(/\.json$/i, "") + "-searchers.json")
  : resolve(__dirname, "..", "public", SAMPLE ? "yugipedia-searchers.sample.json" : "yugipedia-searchers.json");

// A small labeled set for validation (mix of known-positive + known-negative).
const SAMPLE_CARDS = [
  { id: 89631139, name: "Blue-Eyes White Dragon" }, // big tips page
  { id: 46986414, name: "Dark Magician" }, // big tips page
  { id: 55144522, name: "Pot of Greed" }, // minimal but real (2 bullets)
  { id: 14558127, name: "Ash Blossom & Joyous Spring" }, // staple, real tips
  { id: 97268402, name: "Effect Veiler" },
  { id: 12580477, name: "Raigeki" },
  { id: 5318639, name: "Mystical Space Typhoon" },
  { id: 40640057, name: "Kuriboh" },
  { id: 38033121, name: "Dark Magician Girl" },
  { id: 53129443, name: "Dark Hole" },
  { id: 83764718, name: "Monster Reborn" },
  { id: 70781052, name: "Summoned Skull" },
  { id: 999999991, name: "Totally Made Up Card Zzqx" }, // missing → no link
  { id: 999999992, name: "Another Nonexistent Card Qwxz" }, // missing → no link
];

// ── Fetch the card list (id + canonical English name) ─────────────────────────
// Always fetches the full YGOPRODeck list to populate NAME_TO_ID (needed to
// resolve searcher names even in --sample mode); returns the set of cards to
// CHECK (the sample set, the first N, or all).
async function fetchCardList() {
  console.log("Fetching full card list from YGOPRODeck…");
  const r = await fetch(YGOPRO_API, { headers: { "User-Agent": USER_AGENT } });
  if (!r.ok) throw new Error(`YGOPRODeck API returned ${r.status}`);
  const j = await r.json();
  // De-dupe by id (a name can appear once; alt-art printings share the card id)
  // and build the global name→id map in the same pass.
  const seen = new Set();
  const cards = [];
  for (const c of j.data ?? []) {
    if (!c?.id || !c?.name) continue;
    if (!NAME_TO_ID.has(c.name)) NAME_TO_ID.set(c.name, c.id);
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    cards.push({ id: c.id, name: c.name });
  }
  if (SAMPLE) return SAMPLE_CARDS;
  return LIMIT ? cards.slice(0, LIMIT) : cards;
}

// Parse the "This card can be searched by …" bullet out of Card Tips wikitext.
// Searcher card names are always wrapped as quoted links — "[[Card Name]]" —
// while the meta-links ([[Searcher|searched]], [[List of generic searchers…]])
// are NOT quoted, so matching only quoted links cleanly excludes them. Names are
// resolved to YGOPRODeck ids (stripping a trailing " (card)" disambiguation),
// de-duped, with the subject card itself removed. Returns null when there is no
// searcher bullet or nothing resolved.
function parseSearchers(content, subjectId) {
  if (!content) return null;
  const bullet = content
    .split(/\n/)
    .find((l) => /^[ \t]*[*#]/.test(l) && /\[\[Searcher|searched by|can be searched/i.test(l));
  if (!bullet) return null;

  const ids = [];
  const seen = new Set();
  for (const m of bullet.matchAll(/"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]"/g)) {
    const name = m[1].trim();
    let id = NAME_TO_ID.get(name);
    if (id == null && / \(card\)$/.test(name)) id = NAME_TO_ID.get(name.replace(/ \(card\)$/, ""));
    if (id == null || id === subjectId || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= SEARCHER_CAP) break;
  }
  return ids.length ? ids : null;
}

// A "Card Tips" page counts as useful (non-stub) when it has at least one tip
// bullet. Nav-only/stub pages contain just templates like {{Navigation}} and
// no list items. (Validated: "Pot of Greed" = 318B, 2 bullets → useful.)
function hasUsefulTips(content) {
  if (!content) return false;
  if (/^#redirect/i.test(content.trim())) return false; // unresolved redirect (shouldn't happen with redirects=1)
  return /^[ \t]*[*#]/m.test(content);
}

// Query a batch of titles; returns { tips: Map<id,url>, searchers: Map<id,number[]> }.
// `attempt` tracks back-off retries; after MAX_RETRIES the batch throws so the
// caller logs and skips it rather than looping forever.
const MAX_RETRIES = 5;
async function checkBatch(batch, attempt = 0) {
  const titles = batch.map((c) => NAMESPACE + c.name);
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "info|revisions",
    inprop: "url",
    rvprop: "content|size",
    rvslots: "main",
    redirects: "1",
    maxlag: "5",
    titles: titles.join("|"),
  });

  const retry = async (why) => {
    if (attempt >= MAX_RETRIES) throw new Error(`${why} — gave up after ${MAX_RETRIES} retries`);
    console.warn(`  ${why} — backing off 5s (retry ${attempt + 1}/${MAX_RETRIES})`);
    await sleep(5000);
    return checkBatch(batch, attempt + 1);
  };

  const r = await fetch(`${WIKI_API}?${params}`, { headers: { "User-Agent": USER_AGENT } });
  if (r.status === 503) return retry("maxlag/503");
  if (!r.ok) throw new Error(`Yugipedia API returned ${r.status}`);
  const data = await r.json();
  // The API can answer 200 with an `error` body (maxlag, transient DB errors).
  // These are recoverable — back off and retry instead of silently dropping the
  // batch (which would punch holes in the manifest on a full crawl).
  if (data.error) return retry(`API error: ${data.error.code}`);
  const q = data.query ?? {};

  // Resolve each input title through normalization + redirects to its final
  // title, so we can map the returned pages back to our card ids.
  const norm = new Map((q.normalized ?? []).map((n) => [spaces(n.from), spaces(n.to)]));
  const redir = new Map((q.redirects ?? []).map((rd) => [spaces(rd.from), spaces(rd.to)]));
  const finalToId = new Map();
  for (const c of batch) {
    let title = spaces(NAMESPACE + c.name);
    if (norm.has(title)) title = norm.get(title);
    if (redir.has(title)) title = redir.get(title);
    finalToId.set(title, c.id);
  }

  const tips = new Map();
  const searchers = new Map();
  for (const page of q.pages ?? []) {
    if (page.missing) continue;
    const id = finalToId.get(spaces(page.title));
    if (id == null) continue;
    const content = page.revisions?.[0]?.content ?? "";
    if (hasUsefulTips(content)) tips.set(id, page.fullurl);
    const found = parseSearchers(content, id);
    if (found) searchers.set(id, found);
  }
  return { tips, searchers };
}

async function main() {
  const cards = await fetchCardList();
  console.log(`Checking ${cards.length} cards in batches of ${BATCH} (~${Math.ceil(cards.length / BATCH)} requests)…`);

  const manifest = {};
  const searchersManifest = {};
  let checked = 0;
  let hits = 0;
  let searcherHits = 0;
  for (let i = 0; i < cards.length; i += BATCH) {
    const batch = cards.slice(i, i + BATCH);
    try {
      const { tips, searchers } = await checkBatch(batch);
      for (const [id, url] of tips) {
        manifest[id] = url;
        hits++;
      }
      for (const [id, ids] of searchers) {
        searchersManifest[id] = ids;
        searcherHits++;
      }
    } catch (err) {
      console.error(`  batch @${i} failed: ${err.message} — skipping`);
    }
    checked += batch.length;
    if (checked % 500 === 0 || checked >= cards.length) {
      console.log(`  ${checked}/${cards.length} checked, ${hits} with tips, ${searcherHits} with searchers`);
    }
    if (i + BATCH < cards.length) await sleep(DELAY_MS);
  }

  // Stable key order (numeric) for clean diffs.
  const order = (obj) => {
    const out = {};
    for (const k of Object.keys(obj).sort((a, b) => Number(a) - Number(b))) out[k] = obj[k];
    return out;
  };
  await writeFile(OUT, JSON.stringify(order(manifest)) + "\n", "utf8");
  await writeFile(SEARCHERS_OUT, JSON.stringify(order(searchersManifest)) + "\n", "utf8");
  console.log(`\nDone. ${hits}/${cards.length} cards have a Yugipedia Card Tips page.`);
  console.log(`      ${searcherHits}/${cards.length} cards have a parsed "searched by" list.`);
  console.log(`Tips manifest      → ${OUT}`);
  console.log(`Searchers manifest → ${SEARCHERS_OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
