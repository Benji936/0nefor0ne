// Parses EDOPro constant tables (constant.lua, archetype_setcode_constants.lua)
// into JS lookup maps. The maps are bit-value -> human label, used by the parser
// to turn `IsType(TYPE_TUNER)` / `IsAttribute(ATTRIBUTE_LIGHT)` / `IsSetCard(SET_BLUE_EYES)`
// into structured, resolvable filters.
//
// Source of truth is the live ProjectIgnis/CardScripts repo, so we parse the .lua
// rather than hardcoding values that could drift.

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Evaluate a simple Lua numeric RHS like `0x10`, `0x1|0x2`, `RACE_A|RACE_B`,
 *  resolving already-known symbols from `known`. Returns a Number or null. */
function evalLuaNumber(rhs, known) {
  const expr = rhs
    .replace(/--.*$/, "") // strip trailing comment
    .trim();
  // Split on bitwise-or, OR each token
  let value = 0;
  for (const rawTok of expr.split("|")) {
    const tok = rawTok.trim();
    if (!tok) continue;
    let n;
    if (/^0x[0-9a-fA-F]+$/.test(tok)) n = parseInt(tok, 16);
    else if (/^\d+$/.test(tok)) n = parseInt(tok, 10);
    else if (tok in known) n = known[tok];
    else return null; // unknown symbol -> bail (e.g. references a fn)
    value |= n;
  }
  return value;
}

/** Parse `PREFIX_NAME = <number expr>` lines into { symbol: value }. */
function parseConstantAssignments(text, prefixRegex) {
  const known = {};
  const lineRe = new RegExp(`^\\s*(${prefixRegex})\\s*=\\s*(.+)$`, "gm");
  let m;
  while ((m = lineRe.exec(text))) {
    const sym = m[1];
    const val = evalLuaNumber(m[2], known);
    if (val !== null) known[sym] = val;
  }
  return known;
}

// Human labels target ygoprodeck vocabulary where it differs from EDOPro.
const ATTRIBUTE_LABELS = {
  ATTRIBUTE_EARTH: "EARTH", ATTRIBUTE_WATER: "WATER", ATTRIBUTE_FIRE: "FIRE",
  ATTRIBUTE_WIND: "WIND", ATTRIBUTE_LIGHT: "LIGHT", ATTRIBUTE_DARK: "DARK",
  ATTRIBUTE_DIVINE: "DIVINE",
};

// EDOPro RACE_* -> ygoprodeck "race" (monster type) string.
const RACE_LABELS = {
  RACE_WARRIOR: "Warrior", RACE_SPELLCASTER: "Spellcaster", RACE_FAIRY: "Fairy",
  RACE_FIEND: "Fiend", RACE_ZOMBIE: "Zombie", RACE_MACHINE: "Machine",
  RACE_AQUA: "Aqua", RACE_PYRO: "Pyro", RACE_ROCK: "Rock",
  RACE_WINGEDBEAST: "Winged Beast", RACE_PLANT: "Plant", RACE_INSECT: "Insect",
  RACE_THUNDER: "Thunder", RACE_DRAGON: "Dragon", RACE_BEAST: "Beast",
  RACE_BEASTWARRIOR: "Beast-Warrior", RACE_DINOSAUR: "Dinosaur", RACE_FISH: "Fish",
  RACE_SEASERPENT: "Sea Serpent", RACE_REPTILE: "Reptile", RACE_PSYCHIC: "Psychic",
  RACE_DIVINE: "Divine-Beast", RACE_CREATORGOD: "Creator-God", RACE_WYRM: "Wyrm",
  RACE_CYBERSE: "Cyberse", RACE_ILLUSION: "Illusion",
};

// TYPE_* bits that map to a meaningful ygoprodeck type token. (Many TYPE_* are
// internal flags with no card-pool meaning; we only keep the useful ones.)
const TYPE_LABELS = {
  TYPE_MONSTER: "Monster", TYPE_SPELL: "Spell", TYPE_TRAP: "Trap",
  TYPE_NORMAL: "Normal", TYPE_EFFECT: "Effect", TYPE_FUSION: "Fusion",
  TYPE_RITUAL: "Ritual", TYPE_SPIRIT: "Spirit", TYPE_UNION: "Union",
  TYPE_GEMINI: "Gemini", TYPE_TUNER: "Tuner", TYPE_SYNCHRO: "Synchro",
  TYPE_TOKEN: "Token", TYPE_QUICKPLAY: "Quick-Play", TYPE_CONTINUOUS: "Continuous",
  TYPE_EQUIP: "Equip", TYPE_FIELD: "Field", TYPE_COUNTER: "Counter",
  TYPE_FLIP: "Flip", TYPE_TOON: "Toon", TYPE_XYZ: "Xyz",
  TYPE_PENDULUM: "Pendulum", TYPE_LINK: "Link",
};

/** Turn `SET_BLUE_EYES` into a best-guess ygoprodeck archetype label `Blue-Eyes`.
 *  This is a heuristic; resolution validates against ygoprodeck's archetype list. */
function setSymbolToArchetype(symbol) {
  return symbol
    .replace(/^SET_/, "")
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("-");
}

export function loadConstants(scriptsDir) {
  const constantText = readFileSync(join(scriptsDir, "constant.lua"), "utf8");
  const archetypeText = readFileSync(
    join(scriptsDir, "archetype_setcode_constants.lua"),
    "utf8"
  );

  const attrVals = parseConstantAssignments(constantText, "ATTRIBUTE_[A-Z]+");
  const raceVals = parseConstantAssignments(constantText, "RACE_[A-Z0-9]+");
  const typeVals = parseConstantAssignments(constantText, "TYPE_[A-Z0-9]+");
  const setVals = parseConstantAssignments(archetypeText, "SET_[A-Z0-9_]+");

  // Build symbol -> { value, label } maps, keeping only symbols we have labels for.
  const buildMap = (vals, labels) => {
    const out = {};
    for (const [sym, val] of Object.entries(vals)) {
      if (labels[sym]) out[sym] = { value: val, label: labels[sym] };
    }
    return out;
  };

  const setMap = {};
  for (const [sym, val] of Object.entries(setVals)) {
    setMap[sym] = { value: val, label: setSymbolToArchetype(sym) };
  }

  return {
    ATTRIBUTE: buildMap(attrVals, ATTRIBUTE_LABELS),
    RACE: buildMap(raceVals, RACE_LABELS),
    TYPE: buildMap(typeVals, TYPE_LABELS),
    SET: setMap,
  };
}
