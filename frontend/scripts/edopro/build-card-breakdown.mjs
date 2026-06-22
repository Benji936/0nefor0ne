#!/usr/bin/env node
// Build normalized card-effect breakdowns for display.
//
// Default engine: the deterministic PSCT parser (psct-parser.mjs) — FREE, offline,
// no API. Optional `--llm` mode backfills with an LLM (e.g. Gemini) for cards the
// rules parser handles poorly.
//
// Input sources:
//   --cdb <path/to/cards.cdb>   read text straight from EDOPro's SQLite DB (offline)
//   --in  <cards.json>          [{ id, name, desc, type? }, ...] (e.g. a ygoprodeck dump)
//
// Output (schema per card, keyed by passcode):
//   { name, summary, segments:[{label,text}], tags:{...} }
//
// Usage:
//   node build-card-breakdown.mjs --cdb ./BabelCDB/cards.cdb --out public/data/card-breakdown.json
//   node build-card-breakdown.mjs --in cards.json --llm        # LLM tail (needs LLM_API_URL/KEY)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
// Runtime no longer needs this script — the breakdown is computed in-browser via
// src/lib/psctParser.js. Kept ONLY for optional precompute/LLM-override workflows.
import { parseCardText } from "../../src/lib/psctParser.js";

// lastIndexOf so a user-appended flag overrides any default baked into the npm script
const arg = (n, d) => { const i = process.argv.lastIndexOf(`--${n}`); return i !== -1 ? process.argv[i + 1] : d; };
const useLLM = process.argv.includes("--llm");
const outDir = arg("outdir", "public/data/breakdown");
const SHARDS = 64; // only used by this optional precompute path
const TYPE_NORMAL = 0x10; // skip vanilla monsters (flavor text, no effect)

// ---- load cards: [{ id, name, desc, type }] ----
async function loadCards() {
  const inJson = arg("in");
  if (inJson) return JSON.parse(readFileSync(inJson, "utf8"));

  const cdb = arg("cdb");
  if (!cdb) { console.error("Provide --cdb <cards.cdb> or --in <cards.json>"); process.exit(1); }
  // node:sqlite is built in (Node 22+). May need --experimental-sqlite on some builds.
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); }
  catch { console.error("node:sqlite unavailable — re-run with: node --experimental-sqlite ... or use --in"); process.exit(1); }
  const db = new DatabaseSync(cdb, { readOnly: true });
  const rows = db.prepare("SELECT t.id AS id, t.name AS name, t.desc AS desc, d.type AS type FROM texts t JOIN datas d ON t.id = d.id").all();
  db.close();
  return rows;
}

// ---- optional LLM backfill (Gemini/Anthropic) ----
const SYSTEM_PROMPT = `Normalize Yu-Gi-Oh! card text into JSON: { summary, segments:[{label,text}], tags }.
Labels: trigger, condition, cost, target, effect, restriction, downside. Keep text close to the printed wording; omit labels that don't apply; return ONLY JSON.`;
async function callLLM(card) {
  const url = process.env.LLM_API_URL, key = process.env.LLM_API_KEY;
  if (!url || !key) throw new Error("Set LLM_API_URL and LLM_API_KEY for --llm.");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.LLM_MODEL || "gemini-2.5-flash-lite", max_tokens: 800, system: SYSTEM_PROMPT, messages: [{ role: "user", content: card.desc }] }),
  });
  const j = await res.json();
  const text = j?.content?.[0]?.text ?? j?.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(text);
}

// ---- run ----
const cards = await loadCards();
const buckets = Array.from({ length: SHARDS }, () => ({}));
let done = 0, skipped = 0;
for (const card of cards) {
  const desc = card.desc?.trim();
  if (!desc) { skipped++; continue; }
  if (card.type != null && (card.type & TYPE_NORMAL)) { skipped++; continue; } // vanilla
  try {
    const entry = useLLM ? await callLLM(card) : parseCardText(desc);
    if (!entry.segments?.length) { skipped++; continue; }
    const b = ((Number(card.id) % SHARDS) + SHARDS) % SHARDS;
    buckets[b][String(card.id)] = { name: card.name, ...entry };
    done++;
  } catch (e) {
    skipped++;
    console.error(`fail ${card.id}: ${e.message}`);
  }
}
mkdirSync(outDir, { recursive: true });
for (let b = 0; b < SHARDS; b++) {
  writeFileSync(join(outDir, `${b}.json`), JSON.stringify(buckets[b]));
}
console.error(`Wrote ${SHARDS} shards to ${outDir}/ — parsed=${done} skipped=${skipped} (engine: ${useLLM ? "LLM" : "PSCT"})`);
