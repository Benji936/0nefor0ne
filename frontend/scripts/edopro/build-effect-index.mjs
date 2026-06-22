#!/usr/bin/env node
// Build a static "effect index" from EDOPro card scripts.
//
// For each card we segment its registered effects, and for each effect we locate
// the pool-fetch calls (IsExistingMatchingCard / SelectMatchingCard at a deck/GY/
// extra/banished location) and parse the *filter* (type/attribute/race/level/
// archetype) that the fetch applies. We store the filter, NOT the resolved card
// list — the list is resolved live against ygoprodeck so it never goes stale.
//
// Output: effect-index.json  ->  { [cardId]: { fetches: [...] , stats... } }
//
// Usage: node build-effect-index.mjs --scripts <CardScripts dir> --out <file>
//        (if --scripts omitted, clones ProjectIgnis/CardScripts to a temp dir)

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { loadConstants } from "./lua-constants.mjs";

// ---------- CLI ----------
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : def;
}
let scriptsDir = arg("scripts");
const outFile = arg("out", join(process.cwd(), "effect-index.json"));
const limit = parseInt(arg("limit", "0"), 10); // 0 = all (debug aid)

if (!scriptsDir) {
  const tmp = mkdtempSync(join(tmpdir(), "cardscripts-"));
  console.error("Cloning ProjectIgnis/CardScripts...");
  execSync(
    `git clone --depth 1 https://github.com/ProjectIgnis/CardScripts.git ${tmp}/CardScripts`,
    { stdio: "inherit" }
  );
  scriptsDir = join(tmp, "CardScripts");
}
const officialDir = join(scriptsDir, "official");

const C = loadConstants(scriptsDir);

// ---------- Lua parsing helpers ----------

// Locations we treat as "fetch from the card pool" (combo-relevant).
const POOL_LOCATIONS = {
  LOCATION_DECK: "deck",
  LOCATION_GRAVE: "graveyard",
  LOCATION_EXTRA: "extra_deck",
  LOCATION_REMOVED: "banished",
};

// Map effect SetCategory tokens to a user-facing action.
function categoriesToActions(catExpr) {
  const actions = new Set();
  if (/CATEGORY_(SEARCH|TOHAND)/.test(catExpr)) actions.add("search");
  if (/CATEGORY_SPECIAL_SUMMON/.test(catExpr)) actions.add("special_summon");
  if (/CATEGORY_TOGRAVE/.test(catExpr)) actions.add("send_to_gy");
  if (/CATEGORY_TODECK/.test(catExpr)) actions.add("to_deck");
  return [...actions];
}

// Split a script into top-level `function ...` chunks; return { name -> body }.
function splitFunctions(src) {
  const fns = {};
  const parts = src.split(/\nfunction\s+/);
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const m = chunk.match(/^([A-Za-z0-9_.]+)\s*\(([^)]*)\)/);
    // Store the body WITHOUT the `name(args)` signature, so predicate/opacity
    // parsing doesn't trip over the function's own name.
    if (m) fns[m[1]] = chunk.slice(m[0].length);
  }
  return fns;
}

// Parse a filter-function body into a structured filter + an opacity flag.
// Recognised predicates map to ygoprodeck-resolvable fields. Unrecognised
// Card: method calls or custom helpers raise `opaque`, lowering confidence.
const RECOGNISED_BENIGN = new RegExp(
  "Is(AbleToHand|AbleToGrave|AbleToDeck|Faceup|Facedown|CanBeSpecialSummoned|" +
    "Relate|OnFieldAndCanBeEffected|Location|Controler|PreviousLocation)"
);

function parseFilterBody(body) {
  const filter = {};
  let opaque = false;

  // Types: collect all IsType(...) args (may be TYPE_A+TYPE_B)
  const types = new Set();
  for (const m of body.matchAll(/IsType\(([^)]*)\)/g)) {
    for (const tok of m[1].split("+")) {
      const t = tok.trim();
      if (C.TYPE[t]) types.add(C.TYPE[t].label);
    }
  }
  // Card-frame predicates: IsMonster()/IsSpell()/IsTrap() -> frame type token.
  if (/\bIsMonster\(\)/.test(body)) types.add("Monster");
  if (/\bIsSpell\(\)/.test(body)) types.add("Spell");
  if (/\bIsTrap\(\)/.test(body)) types.add("Trap");
  if (types.size) filter.types = [...types];

  // Attribute
  const attrs = new Set();
  for (const m of body.matchAll(/IsAttribute\(([^)]*)\)/g)) {
    for (const tok of m[1].split("|")) {
      const a = tok.trim();
      if (C.ATTRIBUTE[a]) attrs.add(C.ATTRIBUTE[a].label);
    }
  }
  if (attrs.size) filter.attributes = [...attrs];

  // Race / monster type. Includes aux.FilterBoolFunction(Card.IsRace,RACE_X).
  const races = new Set();
  for (const m of body.matchAll(/IsRace\(([^)]*)\)/g)) {
    for (const tok of m[1].split("|")) {
      const r = tok.trim();
      if (C.RACE[r]) races.add(C.RACE[r].label);
    }
  }
  for (const m of body.matchAll(/FilterBoolFunction\(\s*Card\.IsRace\s*,\s*([A-Z_0-9|]+)/g)) {
    for (const tok of m[1].split("|")) {
      const r = tok.trim();
      if (C.RACE[r]) races.add(C.RACE[r].label);
    }
  }
  if (races.size) filter.races = [...races];

  // Level: IsLevel(n) or GetLevel()==n
  const levels = new Set();
  for (const m of body.matchAll(/IsLevel\((\d+)\)/g)) levels.add(+m[1]);
  for (const m of body.matchAll(/GetLevel\(\)\s*==\s*(\d+)/g)) levels.add(+m[1]);
  if (levels.size) filter.levels = [...levels];

  // Level ranges: IsLevelBelow(n) / IsLevelAbove(n) -> resolver post-filters.
  const below = body.match(/IsLevelBelow\((\d+)\)/);
  if (below) filter.levelMax = +below[1];
  const above = body.match(/IsLevelAbove\((\d+)\)/);
  if (above) filter.levelMin = +above[1];

  // ATK / DEF. Inclusive bounds. IsAttackBelow(n)/IsAttackAbove(n) are inclusive
  // in EDOPro; GetAttack() comparisons cover the explicit-operator forms.
  const stat = (kindRe, getRe) => {
    let min, max, eq;
    for (const m of body.matchAll(new RegExp(`Is${kindRe}Below\\((\\d+)\\)`, "g")))
      max = Math.min(max ?? Infinity, +m[1]);
    for (const m of body.matchAll(new RegExp(`Is${kindRe}Above\\((\\d+)\\)`, "g")))
      min = Math.max(min ?? -Infinity, +m[1]);
    for (const m of body.matchAll(new RegExp(`Is${kindRe}\\((\\d+)\\)`, "g"))) eq = +m[1];
    for (const m of body.matchAll(
      new RegExp(`Get${getRe}\\(\\)\\s*(<=|<|>=|>|==)\\s*(\\d+)`, "g")
    )) {
      const v = +m[2];
      if (m[1] === "==") eq = v;
      else if (m[1] === "<=") max = Math.min(max ?? Infinity, v);
      else if (m[1] === "<") max = Math.min(max ?? Infinity, v - 1);
      else if (m[1] === ">=") min = Math.max(min ?? -Infinity, v);
      else if (m[1] === ">") min = Math.max(min ?? -Infinity, v + 1);
    }
    return { min: Number.isFinite(min) ? min : undefined, max: Number.isFinite(max) ? max : undefined, eq };
  };
  const atk = stat("Attack", "Attack");
  if (atk.eq != null) filter.atk = atk.eq;
  if (atk.min != null) filter.atkMin = atk.min;
  if (atk.max != null) filter.atkMax = atk.max;
  const def = stat("Defense", "Defense");
  if (def.eq != null) filter.def = def.eq;
  if (def.min != null) filter.defMin = def.min;
  if (def.max != null) filter.defMax = def.max;

  // Archetype via IsSetCard(SET_X)
  const sets = new Set();
  for (const m of body.matchAll(/IsSetCard\(([A-Z_0-9]+)\)/g)) {
    const s = m[1].trim();
    if (C.SET[s]) sets.add(C.SET[s].label);
  }
  if (sets.size) filter.archetypes = [...sets];

  // Opacity: any Card method call we didn't recognise (excluding benign/self code).
  for (const m of body.matchAll(/[ce]:Is([A-Za-z]+)\(/g)) {
    const meth = "Is" + m[1];
    if (
      /^Is(Type|Attribute|Race|Level|SetCard|Code|LevelAbove|LevelBelow|Monster|Spell|Trap|SpellTrap|Attack|AttackAbove|AttackBelow|Defense|DefenseAbove|DefenseBelow)$/.test(
        meth
      )
    )
      continue;
    if (RECOGNISED_BENIGN.test(meth)) continue;
    opaque = true;
  }
  // Custom helper invocation inside the filter (e.g. s.something(c)) -> opaque.
  if (/\bs\.[A-Za-z0-9_]+\(/.test(body)) opaque = true;

  return { filter, opaque, empty: Object.keys(filter).length === 0 };
}

// Find pool-fetch calls inside a function body. Returns [{filterName, location}].
function findFetches(body) {
  const fetches = [];
  // IsExistingMatchingCard(FILTER, tp, LOCATION, ...)
  // SelectMatchingCard(tp, FILTER, tp, LOCATION, ...)
  const patterns = [
    /Duel\.IsExistingMatchingCard\(\s*([A-Za-z0-9_.]+)\s*,\s*[^,]+,\s*([A-Z_0-9|]+)/g,
    /Duel\.SelectMatchingCard\(\s*[^,]+,\s*([A-Za-z0-9_.]+)\s*,\s*[^,]+,\s*([A-Z_0-9|]+)/g,
  ];
  for (const re of patterns) {
    for (const m of body.matchAll(re)) {
      const filterName = m[1];
      const locExpr = m[2];
      const loc = Object.keys(POOL_LOCATIONS).find((L) => locExpr.includes(L));
      if (loc) fetches.push({ filterName, location: POOL_LOCATIONS[loc] });
    }
  }
  return fetches;
}

// ---------- Per-card analysis ----------
function analyzeScript(src) {
  const fns = splitFunctions(src);
  const init = fns["s.initial_effect"];
  if (!init) return null;

  // Segment effects in initial_effect by their Effect.CreateEffect variable.
  const effects = [];
  const declRe = /local\s+(\w+)\s*=\s*Effect\.CreateEffect\(/g;
  const decls = [...init.matchAll(declRe)];
  for (let i = 0; i < decls.length; i++) {
    const varName = decls[i][1];
    const start = decls[i].index;
    const end = i + 1 < decls.length ? decls[i + 1].index : init.length;
    const slice = init.slice(start, end);
    const catM = slice.match(/SetCategory\(([^)]*)\)/);
    const tgtM = slice.match(/SetTarget\(\s*s\.([A-Za-z0-9_]+)\s*\)/);
    const opM = slice.match(/SetOperation\(\s*s\.([A-Za-z0-9_]+)\s*\)/);
    effects.push({
      var: varName,
      actions: catM ? categoriesToActions(catM[1]) : [],
      targetFn: tgtM ? "s." + tgtM[1] : null,
      operationFn: opM ? "s." + opM[1] : null,
    });
  }

  const fetchesOut = [];
  for (const eff of effects) {
    const fnBodies = [eff.targetFn, eff.operationFn]
      .filter(Boolean)
      .map((n) => fns[n])
      .filter(Boolean);
    const seen = new Set();
    for (const body of fnBodies) {
      for (const fetch of findFetches(body)) {
        const key = fetch.filterName + "@" + fetch.location;
        if (seen.has(key)) continue;
        seen.add(key);

        let parsed = { filter: {}, opaque: true, empty: true };
        const fname = fetch.filterName.startsWith("s.")
          ? fetch.filterName
          : null;
        if (fname && fns[fname]) parsed = parseFilterBody(fns[fname]);

        let confidence = "low";
        if (!parsed.empty && !parsed.opaque) confidence = "high";
        else if (!parsed.empty && parsed.opaque) confidence = "medium";

        fetchesOut.push({
          actions: eff.actions,
          location: fetch.location,
          filter: parsed.filter,
          confidence,
        });
      }
    }
  }
  return { fetches: fetchesOut };
}

// ---------- Run ----------
const files = readdirSync(officialDir).filter((f) => /^c\d+\.lua$/.test(f));
const index = {};
const stats = { total: 0, withFetch: 0, high: 0, medium: 0, low: 0 };

for (const file of limit ? files.slice(0, limit) : files) {
  const id = file.slice(1, -4); // c8240199.lua -> 8240199
  let src;
  try {
    src = readFileSync(join(officialDir, file), "utf8");
  } catch {
    continue;
  }
  stats.total++;
  const result = analyzeScript(src);
  if (!result || result.fetches.length === 0) continue;
  // Keep only effects that actually carry a parsed filter or a pool location.
  const meaningful = result.fetches.filter(
    (f) => Object.keys(f.filter).length > 0 || f.confidence !== "low"
  );
  if (meaningful.length === 0) continue;
  index[id] = { fetches: meaningful };
  stats.withFetch++;
  for (const f of meaningful) stats[f.confidence]++;
}

writeFileSync(outFile, JSON.stringify(index));
console.error("Wrote", outFile);
console.error(JSON.stringify(stats, null, 2));
