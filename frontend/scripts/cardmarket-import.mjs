/**
 * cardmarket-import.mjs
 *
 * Loads Cardmarket's daily price guide into cardmarket_product + cardmarket_price.
 *
 * Cardmarket publishes the price guide and the product catalogue as public
 * files, rebuilt every morning, with no key and no rate limit. This reads them
 * and joins them to YGOPRODeck so that a printing the app can name (POTE-EN012,
 * Common) can be turned into a printing Cardmarket can price (idProduct 712345).
 *
 * The join is the whole job, and it runs in one direction:
 *
 *   Cardmarket expansion id --(shared card list)--> YGOPRODeck set --> set code
 *   (name, set code)        --(YGOPRODeck card_sets)-------------->  rarity
 *
 * Neither half is given to us. Cardmarket identifies a printing by an opaque
 * expansion id and carries no rarity at all; YGOPRODeck carries both but no
 * prices. The two catalogues share no identifier, and they do not even agree on
 * names -- so the expansions are matched on the one thing they describe the
 * same way, which is which cards are in the set. See buildExpansionMap.
 *
 * Where the join is ambiguous nothing is written. A card printed at two
 * rarities in one set, or an expansion holding several products for one card,
 * leaves rarity NULL and lets the app fall back to a price range. Guessing
 * which of two products is the Starlight Rare would put a 200 euro card and a
 * 40 cent card behind the same number, which is the bug this whole feature
 * exists to fix.
 *
 * Usage:
 *   node scripts/cardmarket-import.mjs --dry-run    # resolve + report, write nothing
 *   node scripts/cardmarket-import.mjs --report     # also list unmatched expansions
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/cardmarket-import.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DRY    = process.argv.includes("--dry-run");
const REPORT = process.argv.includes("--report");

const CM   = "https://downloads.s3.cardmarket.com/productCatalog";
const YGO  = "https://db.ygoprodeck.com/api/v7";
const GAME = 3; // Yu-Gi-Oh on Cardmarket. 1 is Magic, 6 is Pokemon.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://sxteuctysfiwripnaozi.supabase.co";
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

// The floors the import refuses to fall below. Cardmarket shipped 86,507
// products and 86,494 prices the day this was written; a run that resolves
// dramatically fewer has hit a truncated download or a changed schema, and
// yesterday's prices are worth more than today's wreckage.
const MIN_PRODUCTS = 70_000;
const MIN_PRICED   = 65_000;
const MAX_FILE_AGE_DAYS = 4;

const log = (...a) => console.log(...a);

// Cardmarket names an expansion after something you can buy out of it, so every
// name ends in its packaging: "Force of the Breaker Booster", "Zombie World
// Structure Deck". Only the override file cares -- the matcher below works on
// card lists, not names.
const CATEGORY_WORD = /\s+(Booster|Display|Structure Deck|Special Edition|Promo Products|Collector Tins|Starter Deck|Lot|Event Tickets|Booster Box|Box)$/i;

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "one-for-one/cardmarket-import" } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

/**
 * Build Cardmarket expansion id -> YGOPRODeck set code, by card list.
 *
 * Set *names* look like the obvious join and are not. Cardmarket writes
 * "Hidden Arsenal 4" where YGOPRODeck writes "Hidden Arsenal 4: Trishula's
 * Triumph", "Dark Revelation 1" against "Dark Revelation Volume 1", "Gold
 * Series 5: Haunted Mine" against "Gold Series: Haunted Mine". Matching on
 * those strings placed 406 of 1,111 expansions; every trick to close the gap
 * either missed more or started pairing "Duelist Pack: Yusei" with "Duelist
 * Pack: Yusei 2", which is worse than missing.
 *
 * Both catalogues do agree on something far more distinctive: which cards are
 * in the set. Scoring expansions against sets by the overlap of their card
 * lists places 586 with a median overlap of 1.00 and no name handling at all.
 *
 * Two rules keep it honest:
 *
 *   OCG expansions are dropped. "Supreme Darkness (OCG)" is the Japanese
 *   release -- a different product at a different price -- and an -EN set code
 *   never refers to it. Left in, it wins half the matches it enters.
 *
 *   The assignment is 1:1. A ten-card promo pack that happens to reprint ten
 *   cards from Rarity Collection II scores a perfect containment against it;
 *   requiring each set to claim one expansion and each expansion one set makes
 *   the real 293-card expansion win, and drops set codes claimed twice from
 *   291 to 0.
 */
export function buildExpansionMap(products, nonSingles, ygoCards, overrides) {
  // set code -> the card names YGOPRODeck says are in it
  const setCards = new Map();
  for (const card of ygoCards) {
    for (const s of card.card_sets ?? []) {
      const code = String(s.set_code ?? "").split("-")[0];
      if (!code) continue;
      if (!setCards.has(code)) setCards.set(code, new Set());
      setCards.get(code).add(card.name.toLowerCase());
    }
  }

  // expansion -> the product names Cardmarket says are in it
  const expCards = new Map();
  for (const p of products) {
    if (!expCards.has(p.idExpansion)) expCards.set(p.idExpansion, new Set());
    expCards.get(p.idExpansion).add(p.name.toLowerCase());
  }

  const expName = new Map();
  for (const p of nonSingles) if (!expName.has(p.idExpansion)) expName.set(p.idExpansion, p.name);

  const byCard = new Map();
  for (const [code, names] of setCards) {
    for (const n of names) {
      if (!byCard.has(n)) byCard.set(n, []);
      byCard.get(n).push(code);
    }
  }

  const candidates = [];
  for (const [id, names] of expCards) {
    if (/\(OCG\)/.test(expName.get(id) ?? "")) continue;
    const hits = new Map();
    for (const n of names) for (const code of byCard.get(n) ?? []) hits.set(code, (hits.get(code) ?? 0) + 1);
    for (const [code, n] of hits) {
      const ofSet = n / setCards.get(code).size; // how much of the set this expansion holds
      const ofExp = n / names.size;              // how much of the expansion the set explains
      if (ofSet >= 0.5 && ofExp >= 0.5) candidates.push({ score: Math.min(ofSet, ofExp), id, code });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const map = new Map();
  const takenCode = new Set();
  for (const c of candidates) {
    if (map.has(c.id) || takenCode.has(c.code)) continue;
    map.set(c.id, c.code);
    takenCode.add(c.code);
  }

  // Overrides land last and win, keyed by the name Cardmarket writes so the
  // file reads as a list of corrections rather than a list of magic numbers.
  // The trailing product word is dropped first: the catalogue only ever names
  // an expansion through something you can buy out of it, so every name arrives
  // as "Dark Revelation 1 Booster" or "Zombie World Structure Deck", and asking
  // the file to spell that out would make it a list of packaging.
  //
  // An override is authoritative, which means taking the set code off whichever
  // expansion the card-list match gave it to. Without that step the file could
  // only ever add a second claimant, and two expansions holding one set code is
  // the ambiguity the 1:1 rule exists to prevent -- the override would appear to
  // work while the wrong printing still answered half the lookups.
  const usedOverride = new Set();
  for (const [id, name] of expName) {
    const key = name.replace(CATEGORY_WORD, "");
    const code = overrides[key];
    if (!code) continue;
    for (const [otherId, otherCode] of map) {
      if (otherCode === code && otherId !== id) map.delete(otherId);
    }
    map.set(id, code);
    usedOverride.add(key);
  }

  // A key that matches nothing is a correction for a set Cardmarket has since
  // renamed or dropped. Harmless, but it reads as a set that still needs
  // fixing, so say so rather than let the file rot into decoration.
  const dead = Object.keys(overrides).filter((k) => !k.startsWith("__") && !usedOverride.has(k));
  if (dead.length) log(`  note: ${dead.length} override key(s) match no expansion: ${dead.join(", ")}`);

  const unmatched = [...expCards.keys()]
    .filter((id) => !map.has(id))
    .map((id) => ({ id, name: expName.get(id) ?? "(singles only)", size: expCards.get(id).size }))
    .sort((a, b) => b.size - a.size);

  return { map, unmatched };
}

/**
 * Build (card name, set code) -> rarity, keeping only the unambiguous ones.
 *
 * 11% of (card, set) pairs were printed at more than one rarity -- a set with
 * an Ultra and a Starlight of the same card. Cardmarket holds several products
 * for those and labels none of them, so there is no honest way to say which is
 * which. Those pairs are dropped, not guessed.
 */
export function buildRarityMap(cards) {
  const seen = new Map();
  for (const card of cards) {
    for (const s of card.card_sets ?? []) {
      const code = String(s.set_code ?? "").split("-")[0];
      if (!code) continue;
      const key = `${card.name.toLowerCase()} ${code}`;
      const prev = seen.get(key);
      if (prev === undefined) seen.set(key, s.set_rarity);
      else if (prev !== s.set_rarity) seen.set(key, null); // ambiguous, stays null
    }
  }
  return seen;
}

async function main() {
  if (!DRY && !SERVICE_KEY) {
    console.error("Set SUPABASE_SERVICE_ROLE_KEY, or pass --dry-run to resolve without writing.");
    process.exit(1);
  }

  log("Fetching Cardmarket catalogue and price guide...");
  const [priceGuide, singles, nonSingles, ygoCards] = await Promise.all([
    getJson(`${CM}/priceGuide/price_guide_${GAME}.json`),
    getJson(`${CM}/productList/products_singles_${GAME}.json`),
    getJson(`${CM}/productList/products_nonsingles_${GAME}.json`),
    getJson(`${YGO}/cardinfo.php`).then((d) => d.data ?? []),
  ]);

  const overrides = JSON.parse(
    await readFile(new URL("./cardmarket-expansions.json", import.meta.url), "utf8"),
  );

  const products = singles.products ?? [];
  const prices   = priceGuide.priceGuides ?? [];
  const asOf     = String(priceGuide.createdAt ?? "").slice(0, 10);

  // -- Sanity gate, before anything is written ------------------------------
  const ageDays = (Date.now() - new Date(priceGuide.createdAt).getTime()) / 86_400_000;
  const fail = (why) => { console.error(`Refusing to import: ${why}`); process.exit(1); };

  if (!asOf || Number.isNaN(ageDays)) fail("the price guide has no usable createdAt.");
  if (ageDays > MAX_FILE_AGE_DAYS)    fail(`the price guide is ${ageDays.toFixed(1)} days old (max ${MAX_FILE_AGE_DAYS}).`);
  if (products.length < MIN_PRODUCTS) fail(`only ${products.length} products (min ${MIN_PRODUCTS}) -- likely a truncated download.`);

  const priceById = new Map(prices.map((p) => [p.idProduct, p]));
  const priced = products.filter((p) => priceById.has(p.idProduct)).length;
  if (priced < MIN_PRICED) fail(`only ${priced} products carry a price (min ${MIN_PRICED}).`);

  log(`  price guide  ${prices.length.toLocaleString()} rows, built ${asOf}`);
  log(`  catalogue    ${products.length.toLocaleString()} singles, ${priced.toLocaleString()} priced`);

  // -- Resolve --------------------------------------------------------------
  const { map: expansions, unmatched } = buildExpansionMap(products, nonSingles.products ?? [], ygoCards, overrides);
  const rarities = buildRarityMap(ygoCards);

  const productRows = products.map((p) => {
    const setCode = expansions.get(p.idExpansion) ?? null;
    const rarity  = setCode ? rarities.get(`${p.name.toLowerCase()} ${setCode}`) ?? null : null;
    return { id_product: p.idProduct, name: p.name, id_expansion: p.idExpansion, set_code: setCode, rarity };
  });

  const withSet    = productRows.filter((r) => r.set_code).length;
  const withRarity = productRows.filter((r) => r.rarity).length;

  // How often a printing the app can name resolves to exactly one product,
  // which is the only rung of the ladder that produces a single price.
  const perPrinting = new Map();
  for (const r of productRows) {
    if (!r.set_code) continue;
    const k = `${r.set_code} ${r.name.toLowerCase()}`;
    perPrinting.set(k, (perPrinting.get(k) ?? 0) + 1);
  }
  const alone = [...perPrinting.values()].filter((n) => n === 1).length;

  log(`\nResolved:`);
  log(`  expansions placed   ${expansions.size} of ${expansions.size + unmatched.length}`);
  log(`  products with set   ${withSet.toLocaleString()} (${(withSet / productRows.length * 100).toFixed(1)}%)`);
  log(`  products w/ rarity  ${withRarity.toLocaleString()} (${(withRarity / productRows.length * 100).toFixed(1)}%)`);
  log(`  printings alone     ${alone.toLocaleString()} of ${perPrinting.size.toLocaleString()} (${(alone / perPrinting.size * 100).toFixed(1)}% resolve to one price)`);

  if (REPORT && unmatched.length) {
    log(`\nUnplaced expansions, largest first -- add a set code for any of these`);
    log(`to cardmarket-expansions.json, keyed by the name exactly as shown:`);
    for (const u of unmatched.slice(0, 40)) log(`  ${String(u.size).padStart(5)} cards  ${u.name}`);
    if (unmatched.length > 40) log(`  ... and ${unmatched.length - 40} more`);
  }

  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const priceRows = productRows
    .filter((r) => priceById.has(r.id_product))
    .map((r) => {
      const g = priceById.get(r.id_product);
      return {
        id_product: r.id_product,
        trend: num(g.trend), low: num(g.low),
        avg7: num(g.avg7), avg30: num(g.avg30),
        as_of: asOf,
      };
    });

  if (DRY) {
    log(`\nDry run -- would upsert ${productRows.length.toLocaleString()} products and ${priceRows.length.toLocaleString()} prices.`);
    return;
  }

  // -- Write ----------------------------------------------------------------
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Products first: cardmarket_price references them, so a new printing has to
  // exist before its price can land.
  for (const [label, table, rows] of [["products", "cardmarket_product", productRows],
                                      ["prices",   "cardmarket_price",   priceRows]]) {
    log(`\nUpserting ${rows.length.toLocaleString()} ${label}...`);
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = rows.slice(i, i + 1000);
      const { error } = await db.from(table).upsert(chunk, { onConflict: "id_product" });
      if (error) { console.error(`  chunk at ${i} failed:`, error.message); process.exit(1); }
      if (i && i % 20000 === 0) log(`  ${i.toLocaleString()}...`);
    }
  }

  log(`\nDone. Prices as of ${asOf}.`);
}

// Only when run as a command. The resolvers above are exported so they can be
// tested, and so a one-off can reuse them rather than reimplement them and
// quietly disagree with what the nightly job writes.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
