// Representative card art per YGOPRODeck archetype.
//
// "Looking For" announces are tagged with a canonical archetype name but carry
// no image of their own, so the UI needs one picture that reads as "Darklord"
// or "Sky Striker" at a glance. There is no archetype artwork endpoint, so we
// elect a representative card offline and ship the mapping as a manifest.
//
// Output: frontend/public/archetype-art.json
//   { "<archetypeName>": <passcodeId> }
//   Consumed by src/lib/archetypeArt.js, which turns the id into a cropped-art
//   URL via lib/cardImage.js (so it rides the R2 CDN like every other card).
//
// Election rule, in order:
//   1. highest-ATK non-Token monster whose NAME contains the archetype name
//   2. highest-ATK non-Token monster
//   3. any card in the archetype
//
// Step 1 is what makes the result iconic rather than arbitrary. An archetype's
// card pool includes cards that merely SUPPORT it, so "Blue-Eyes" without the
// name filter elects "Dragon Master Knight" and "Sky Striker" elects "Surgical
// Striker - S.P.E.C.T.R.A.". With it they elect "Blue-Eyes Alternative Ultimate
// Dragon" and "Sky Striker Ace - Azalea Temperance". Tokens are excluded because
// alphabetical order otherwise hands Darklord an "Asmo Token".
//
// Usage:
//   node scripts/archetype-art.mjs              # full refresh
//   node scripts/archetype-art.mjs --out p.json # custom output path
//
// Politeness: exactly ONE request. Grouping by each card's own `archetype`
// field means the whole mapping is computed from a single full-database dump
// rather than ~650 per-archetype queries.

import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const YGOPRO_API = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const USER_AGENT =
  "TradeMarket-OneForOne/1.0 (https://0nefor.one; archetype art sync; contact: benjsit@gmail.com)";

const outArg = process.argv.indexOf("--out");
const OUT_PATH =
  outArg !== -1 && process.argv[outArg + 1]
    ? resolve(process.cwd(), process.argv[outArg + 1])
    : resolve(__dirname, "../public/archetype-art.json");

/** Cards that can carry meaningful artwork for an archetype. Tokens are real
 *  monsters with an ATK, so excluding them needs an explicit type check. */
function isElectableMonster(card) {
  return card.atk !== null && card.atk !== undefined && !card.type.includes("Token");
}

function elect(archetype, cards) {
  const monsters = cards.filter(isElectableMonster);
  const needle = archetype.toLowerCase();
  const named = monsters.filter((c) => c.name.toLowerCase().includes(needle));

  const pool = named.length ? named : monsters.length ? monsters : cards;
  const winner = pool.reduce((best, c) => ((c.atk ?? 0) > (best.atk ?? 0) ? c : best), pool[0]);

  return {
    id: winner.id,
    name: winner.name,
    tier: named.length ? "named" : monsters.length ? "monster" : "any",
  };
}

async function main() {
  console.log("Fetching the full card database (one request)…");
  const res = await fetch(YGOPRO_API, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`YGOPRODeck returned ${res.status} ${res.statusText}`);

  const cards = (await res.json())?.data ?? [];
  if (cards.length === 0) throw new Error("YGOPRODeck returned no cards — refusing to write an empty manifest.");
  console.log(`  ${cards.length} cards`);

  // A card's own `archetype` field is its membership. Using that rather than
  // the ?archetype= query keeps support cards from other archetypes out.
  const byArchetype = new Map();
  for (const card of cards) {
    if (!card.archetype) continue;
    const bucket = byArchetype.get(card.archetype);
    if (bucket) bucket.push(card);
    else byArchetype.set(card.archetype, [card]);
  }

  const manifest = {};
  const tiers = { named: 0, monster: 0, any: 0 };
  for (const [archetype, members] of byArchetype) {
    const { id, tier } = elect(archetype, members);
    manifest[archetype] = id;
    tiers[tier]++;
  }

  // Sorted so a refresh with no real change produces no diff.
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));

  await writeFile(OUT_PATH, JSON.stringify(sorted), "utf8");

  console.log(`\n${Object.keys(sorted).length} archetypes -> ${OUT_PATH}`);
  console.log(`  by name: ${tiers.named}   by ATK: ${tiers.monster}   fallback: ${tiers.any}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
