// Yugipedia "Forbidden & Limited" status crawler.
//
// YGOPRODeck's per-card `banlist_info` lags the current TCG/OCG Forbidden &
// Limited Lists — a newly-Limited card (e.g. "Maliss <P> Dormouse") shows as
// unlimited there for weeks. Yugipedia tracks the CURRENT status as queryable
// Semantic MediaWiki properties — `TCG status` and `OCG status` — so a handful of
// `ask` queries return every restricted card with no per-card crawling.
//
// Output: frontend/public/yugipedia-banlist.json
//   { "<passcodeId>": { "tcg": "Forbidden"|"Limited"|"Semi-Limited", "ocg": "…" } }
//   Keyed by EVERY printing passcode (all card_images ids) so alternate-art tiles
//   resolve too. A card appears only if it carries a status in ≥1 format.
//
// The frontend prefers this manifest and falls back to YGOPRODeck's banlist_info
// (see src/lib/banlist.js). Absent from SSR — purely a client enhancement.
//
// Usage:
//   node scripts/yugipedia-banlist.mjs              # full refresh
//   node scripts/yugipedia-banlist.mjs --out p.json # custom output path
//
// Politeness: MediaWiki ask API, descriptive User-Agent, maxlag=5, paginated with
// a ≥1s delay between requests, and exponential-ish back-off on 503/429/maxlag.

import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const YGOPRO_API = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const WIKI_API = "https://yugipedia.com/api.php";
const USER_AGENT =
  "TradeMarket-OneForOne/1.0 (https://0nefor.one; Forbidden & Limited status sync; contact: benjsit@gmail.com)";

const STATUSES = ["Forbidden", "Limited", "Semi-Limited"];
const FORMATS = [
  { key: "tcg", prop: "TCG status" },
  { key: "ocg", prop: "OCG status" },
];
const PAGE = 500;       // SMW ask page size
const DELAY_MS = 1100;  // ~1 req/sec between wiki requests
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flagVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const OUT = flagVal("--out")
  ? resolve(process.cwd(), flagVal("--out"))
  : resolve(__dirname, "..", "public", "yugipedia-banlist.json");

// ── YGOPRODeck: name → [all printing passcodes] ────────────────────────────────
// A card's `banlist_info` applies to every printing, so we map each Yugipedia
// card name to ALL of its passcode ids (main + alternate arts) — that way a tile
// rendering an alt-art id still resolves to a status.
const NAME_TO_IDS = new Map();
async function buildNameIndex() {
  console.log("Fetching full card list from YGOPRODeck…");
  const r = await fetch(YGOPRO_API, { headers: { "User-Agent": USER_AGENT } });
  if (!r.ok) throw new Error(`YGOPRODeck API returned ${r.status}`);
  const j = await r.json();
  for (const c of j.data ?? []) {
    if (!c?.name) continue;
    const ids = new Set();
    if (c.id != null) ids.add(c.id);
    for (const img of c.card_images ?? []) if (img?.id != null) ids.add(img.id);
    NAME_TO_IDS.set(c.name, [...ids]);
    // MediaWiki forbids < > in page titles, so Yugipedia renders names like
    // "Maliss <P> Dormouse" as "Maliss P Dormouse". Register that bracket-stripped
    // alias so those titles still resolve to the YGOPRODeck card.
    const alias = c.name.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
    if (alias !== c.name && !NAME_TO_IDS.has(alias)) NAME_TO_IDS.set(alias, [...ids]);
  }
  console.log(`  indexed ${NAME_TO_IDS.size} card names`);
}

// Resolve a Yugipedia page title to YGOPRODeck passcodes (handling a trailing
// " (card)" disambiguation). Returns [] for titles that aren't real-world cards
// (tokens, Rush Duel, anime-only, Skill Cards…), which are simply skipped.
function idsForTitle(title) {
  const name = title.replace(/_/g, " ").trim();
  return NAME_TO_IDS.get(name) ?? NAME_TO_IDS.get(name.replace(/ \(card\)$/, "")) ?? [];
}

// ── SMW ask, paginated + polite ────────────────────────────────────────────────
async function askPage(prop, status, offset, attempt = 0) {
  const params = new URLSearchParams({
    action: "ask",
    format: "json",
    query: `[[${prop}::${status}]]|limit=${PAGE}|offset=${offset}`,
    maxlag: "5",
  });
  const retry = async (why) => {
    if (attempt >= MAX_RETRIES) throw new Error(`${prop}=${status}@${offset}: ${why} — gave up`);
    console.warn(`  ${why} — backing off 5s (retry ${attempt + 1}/${MAX_RETRIES})`);
    await sleep(5000);
    return askPage(prop, status, offset, attempt + 1);
  };
  let res;
  try {
    res = await fetch(`${WIKI_API}?${params}`, { headers: { "User-Agent": USER_AGENT } });
  } catch (e) {
    return retry(`network error (${e.message})`);
  }
  if (res.status === 503 || res.status === 429) return retry(`HTTP ${res.status}`);
  if (!res.ok) throw new Error(`${prop}=${status}: HTTP ${res.status}`);
  const j = await res.json();
  if (j?.error?.code === "maxlag") return retry("maxlag");
  return { titles: Object.keys(j?.query?.results ?? {}), next: j?.["query-continue-offset"] ?? null };
}

async function askStatus(prop, status) {
  const titles = [];
  let offset = 0;
  for (;;) {
    const { titles: batch, next } = await askPage(prop, status, offset);
    titles.push(...batch);
    if (!next || batch.length === 0) break;
    offset = next;
    await sleep(DELAY_MS);
  }
  return titles;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  await buildNameIndex();

  const manifest = {}; // passcodeId -> { tcg?, ocg? }
  const unresolved = new Set();

  for (const { key, prop } of FORMATS) {
    for (const status of STATUSES) {
      const titles = await askStatus(prop, status);
      let matched = 0;
      for (const title of titles) {
        const ids = idsForTitle(title);
        if (!ids.length) { unresolved.add(title); continue; }
        matched++;
        for (const id of ids) (manifest[id] ??= {})[key] = status;
      }
      console.log(`${prop} = ${status}: ${titles.length} cards (${matched} resolved)`);
      await sleep(DELAY_MS);
    }
  }

  const count = Object.keys(manifest).length;
  console.log(`\nWriting ${count} passcode entries — ${unresolved.size} titles unresolved`);
  if (unresolved.size) console.log("  unresolved:", [...unresolved].slice(0, 30).join(", "));
  await writeFile(OUT, JSON.stringify(manifest) + "\n", "utf8");
  console.log(`→ ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
