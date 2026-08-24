/**
 * cardmarket-elimination-report.mjs
 *
 * Prints what an expansion's listing pages resolve, and what they do not.
 *
 *   node scripts/cardmarket-elimination-report.mjs --expansion 6536 --rows cori-rows.json
 *
 * `--rows` is the JSON the in-page probe returns: one entry per listing row,
 * { imageUrl, alt, href }, concatenated across every page of the expansion.
 * The rows go through the same extractor the enrichment uses, so the report and
 * the write agree by construction rather than by two implementations happening
 * to match.
 *
 * Reads only. Nothing here writes an identity.
 */

import { readFileSync } from "node:fs";
import { readExpansionPage } from "./cardmarket-expansion-page.mjs";
import { planExpansion, SOURCE_ELIMINATION } from "./cardmarket-elimination.mjs";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://sxteuctysfiwripnaozi.supabase.co";
const KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1];
}

async function localProducts(idExpansion) {
  const url = `${SUPABASE_URL}/rest/v1/cardmarket_product`
    + `?id_expansion=eq.${idExpansion}`
    + `&select=id_product,name,id_metacard,version_no,version_label,identity_source`
    + `&order=id_product`;
  const res = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`catalogue read failed: ${res.status}`);
  return res.json();
}

const idExpansion = Number(arg("expansion"));
const rowsFile = arg("rows");
if (!idExpansion || !rowsFile) {
  console.error("usage: --expansion <id_expansion> --rows <scraped-rows.json>");
  process.exit(1);
}

const scraped = JSON.parse(readFileSync(rowsFile, "utf8"));
const { products, placeholders, skipped } = readExpansionPage(scraped);
const pageRows = [...products, ...placeholders];

const local = await localProducts(idExpansion);
const { plans, conflicts, orphanRows, summary } = planExpansion({ localProducts: local, pageRows });

console.log(`expansion ${idExpansion}`);
console.log(`  scraped rows        ${scraped.length}`);
console.log(`  named an idProduct  ${products.length}`);
console.log(`  no artwork          ${placeholders.length}`);
// A skip is a row the extractor could not read at all, which means the markup
// moved -- unlike a placeholder, it is never expected and should be zero.
console.log(`  unreadable          ${skipped.length}${skipped.length ? "  <-- markup changed" : ""}`);
console.log(`  local products      ${summary.localProducts}`);
console.log("");
console.log(`  printings, single-product   ${summary.singleProductPrintings}  (no identity needed)`);
console.log(`  printings, multi-product    ${summary.multiProductPrintings}`);
console.log(`    resolved, all pictured    ${summary.resolvedDirect}`);
console.log(`    resolved by elimination   ${summary.resolvedByElimination}`);
console.log(`    still ambiguous           ${summary.unresolved}`);
console.log("");
console.log(`  identities writable, direct       ${summary.identitiesDirect}`);
console.log(`  identities writable, elimination  ${summary.identitiesByElimination}`);

for (const p of plans.filter((x) => x.status === SOURCE_ELIMINATION || x.status === "elimination")) {
  const got = p.identities.find((i) => i.source === SOURCE_ELIMINATION);
  const named = p.identities.filter((i) => i.source !== SOURCE_ELIMINATION);
  console.log(`\n  ${p.name}`);
  for (const i of named) console.log(`    ${i.idProduct}  named itself   ${i.versionLabel}`);
  console.log(`    ${got.idProduct}  by elimination ${got.versionLabel}`);
}

const stuck = plans.filter((p) => p.status === "unresolved");
if (stuck.length) {
  console.log("\n  still ambiguous:");
  for (const p of stuck) console.log(`    ${p.name} — ${p.reason}`);
}
if (conflicts.length) console.log("\n  name conflicts:", conflicts);
if (orphanRows.length) console.log(`\n  ${orphanRows.length} page row(s) for cards not in this expansion locally`);
