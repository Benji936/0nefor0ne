// Resolve a parsed EDOPro effect filter into a list of matching cards.
//
// Strategy: query YGOPRODeck with the most selective *necessary* constraint in
// the filter (so the result set is a superset of the true matches), then
// post-filter precisely against each returned card's fields. This stays correct
// even where the API's query params don't map 1:1 to EDOPro predicates.
//
// The filter shape comes from scripts/edopro/build-effect-index.mjs:
//   { types?, attributes?, races?, levels?, levelMin?, levelMax?, archetypes? }

import { searchByFilters, searchByArchetype, getArchetypes } from "@/api";

// EDOPro type token -> predicate over a YGOPRODeck card object.
// Monster sub-types live in `card.type` ("Synchro Monster", "Tuner Monster");
// Spell/Trap sub-types live in `card.race` ("Field", "Quick-Play", "Counter").
const TYPE_PREDICATES = {
  Monster: (c) => /Monster/i.test(c.type),
  Spell: (c) => c.type === "Spell Card",
  Trap: (c) => c.type === "Trap Card",
  Normal: (c) => /Normal/i.test(c.type),
  Effect: (c) => /Effect/i.test(c.type),
  Tuner: (c) => /Tuner/i.test(c.type),
  Synchro: (c) => /Synchro/i.test(c.type),
  Fusion: (c) => /Fusion/i.test(c.type),
  Xyz: (c) => /XYZ/i.test(c.type),
  Link: (c) => /Link/i.test(c.type),
  Pendulum: (c) => /Pendulum/i.test(c.type) || /pendulum/i.test(c.frameType || ""),
  Ritual: (c) => /Ritual/i.test(c.type),
  Toon: (c) => /Toon/i.test(c.type),
  Spirit: (c) => /Spirit/i.test(c.type),
  Union: (c) => /Union/i.test(c.type),
  Gemini: (c) => /Gemini/i.test(c.type),
  Flip: (c) => /Flip/i.test(c.type),
  // Spell/Trap sub-types (race-encoded by the API)
  Field: (c) => c.race === "Field",
  "Quick-Play": (c) => c.race === "Quick-Play",
  Continuous: (c) => c.race === "Continuous",
  Equip: (c) => c.race === "Equip",
  Counter: (c) => c.race === "Counter",
};

const SPELLTRAP_SUBTYPES = new Set(["Field", "Quick-Play", "Continuous", "Equip", "Counter"]);

/** Precise membership test for a single card against a filter (AND semantics). */
export function matchesFilter(card, f) {
  if (!card) return false;
  if (f.types) {
    for (const t of f.types) {
      const pred = TYPE_PREDICATES[t];
      if (pred && !pred(card)) return false;
    }
  }
  if (f.attributes?.length) {
    const a = (card.attribute || "").toUpperCase();
    if (!f.attributes.map((x) => x.toUpperCase()).includes(a)) return false;
  }
  if (f.races?.length) {
    if (!f.races.includes(card.race)) return false;
  }
  if (f.levels?.length) {
    if (!f.levels.includes(card.level)) return false;
  }
  if (f.levelMax != null && !(card.level <= f.levelMax)) return false;
  if (f.levelMin != null && !(card.level >= f.levelMin)) return false;
  // ATK/DEF. A "?" stat is non-numeric (atk/def -1 or null in the API) — exclude
  // it from any numeric bound, since its value isn't knowable up front.
  if (!statOk(card.atk, f.atk, f.atkMin, f.atkMax)) return false;
  if (!statOk(card.def, f.def, f.defMin, f.defMax)) return false;
  return true;
}

function statOk(value, eq, min, max) {
  if (eq == null && min == null && max == null) return true;
  if (value == null || value < 0) return false; // "?" / unknown
  if (eq != null && value !== eq) return false;
  if (min != null && !(value >= min)) return false;
  if (max != null && !(value <= max)) return false;
  return true;
}

/** Normalize an EDOPro archetype guess to YGOPRODeck's exact spelling.
 *  Matches case/punctuation-insensitively against the canonical archetype list;
 *  returns the original guess if no match (searchByArchetype degrades to []). */
let _normMap = null;
async function canonicalArchetype(guess) {
  if (!_normMap) {
    const list = await getArchetypes();
    _normMap = new Map();
    for (const name of list) _normMap.set(norm(name), name);
  }
  return _normMap.get(norm(guess)) ?? guess;
}
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Game-accurate archetype membership for *combo* purposes.
 *  YGOPRODeck's `archetype` field is a curated "related cards" grouping — it
 *  includes thematic support (Kaibaman, Maiden/Sage/Priestess with Eyes of Blue,
 *  Dictator of D., …) that a "<archetype>" effect cannot actually fetch. By the
 *  rules a card belongs to an archetype only if its NAME contains the archetype
 *  string, or its text states it "is always treated as a/an '<archetype>' card".
 *  So we use the API archetype query only as a candidate pool and narrow here. */
export function cardInArchetype(card, archetype) {
  const a = norm(archetype);
  if (!a || !card) return false;
  if (norm(card.name).includes(a)) return true;
  // Errata clause, e.g.: This card is always treated as a "Blue-Eyes" card.
  const desc = String(card.desc || "");
  const i = desc.toLowerCase().indexOf("always treated as");
  return i >= 0 && norm(desc.slice(i, i + 80)).includes(a);
}

// Extra Deck monster types — these never sit in the Main Deck.
const EXTRA_DECK_RE = /Fusion|Synchro|Xyz|Link/i;

/** Zone realism: keep only cards the effect can physically reach given its
 *  location. The Main Deck never holds Extra Deck monsters (Fusion/Synchro/Xyz/
 *  Link), so they can't be searched, sent, or Special Summoned "from the Deck".
 *  Conversely, a Special Summon "from the Extra Deck" can ONLY bring out an
 *  Extra Deck monster. GY/banished can hold any type, so those are unrestricted. */
function locationAllows(card, location, actions = []) {
  const isExtra = EXTRA_DECK_RE.test(card.type || "");
  if (location === "deck" && isExtra) return false;
  if (location === "extra_deck" && actions.includes("special_summon") && !isExtra) return false;
  return true;
}

/** Build a YGOPRODeck `searchByFilters` arg set seeded on a necessary constraint.
 *  Returns null when the filter is too broad to query without pulling the whole DB
 *  (e.g. "any Monster" with no other constraint). */
export function computeSeed(f) {
  const args = { num: 300, offset: 0 };
  let seeded = false;

  if (f.races?.length) {
    args.race = f.races.join(",");
    seeded = true;
  }
  if (f.attributes?.length === 1) {
    args.attribute = f.attributes[0];
    seeded = true;
  }
  if (f.levels?.length === 1) {
    args.level = f.levels[0];
    seeded = true;
  } else if (f.levelMax != null) {
    args.level = "lte" + f.levelMax;
    seeded = true;
  } else if (f.levelMin != null) {
    args.level = "gte" + f.levelMin;
    seeded = true;
  }

  // Spell/Trap frame + sub-type seeding.
  const subtype = f.types?.find((t) => SPELLTRAP_SUBTYPES.has(t));
  if (!seeded && f.types?.includes("Spell")) {
    args.type = "Spell Card";
    seeded = true;
  } else if (!seeded && f.types?.includes("Trap")) {
    args.type = "Trap Card";
    seeded = true;
  } else if (!seeded && subtype) {
    // Field/Quick-Play/Equip are spells; Counter is a trap; Continuous is either.
    args.type = subtype === "Counter" ? "Trap Card" : "Spell Card";
    args.race = subtype;
    seeded = true;
  }

  return seeded ? args : null;
}

/** Resolve one fetch's filter to a de-duplicated, name-sorted card array.
 *  Returns { cards, broad } — `broad: true` means the filter was too generic to
 *  enumerate and no query was issued. */
export async function resolveFetch(filter, { location, actions = [] } = {}) {
  // Archetype is the most selective signal — query it directly.
  if (filter.archetypes?.length) {
    const seen = new Map();
    for (const a of filter.archetypes) {
      const canonical = await canonicalArchetype(a);
      const r = await searchByArchetype(canonical, 2000);
      for (const c of r?.data?.data ?? []) {
        // API archetype = "related cards" (too broad for combos). Keep only cards
        // a "<archetype>" effect can truly fetch (name match / "always treated as").
        if (cardInArchetype(c, canonical) && matchesFilter(c, filter) && locationAllows(c, location, actions))
          seen.set(c.id, c);
      }
    }
    return { cards: sortByName([...seen.values()]), broad: false };
  }

  const args = computeSeed(filter);
  if (!args) return { cards: [], broad: true };

  const r = await searchByFilters(args);
  const cards = (r?.data?.data ?? []).filter((c) => matchesFilter(c, filter) && locationAllows(c, location, actions));
  return { cards: sortByName(dedupe(cards)), broad: false };
}

function dedupe(cards) {
  const m = new Map();
  for (const c of cards) m.set(c.id, c);
  return [...m.values()];
}
function sortByName(cards) {
  return cards.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}
