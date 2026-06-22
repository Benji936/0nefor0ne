// Yu-Gi-Oh attribute, spell/trap-property & level/rank iconography.
//
// Icon assets live in src/assets/yugioh/ and are auto-discovered at build time,
// keyed by their filename with non-alphanumerics stripped and lowercased — so
// "quickplay.svg" matches the API race "Quick-Play". Drop a file in that folder and
// it lights up automatically; until then call sites fall back to plain text.
//
// Provided keys: dark light earth water fire wind divine | spell trap |
//   quickplay continuous equip field ritual counter normal | level rank | back

const modules = import.meta.glob("../assets/yugioh/*.{svg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
});

/** Collapse a name/value to bare alphanumerics so "Quick-Play", "quickplay" and
 *  "quick_play" all resolve to the same key. */
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// { dark: "/assets/dark.123.svg", quickplay: "…", … }
const ICONS = {};
for (const path in modules) {
  const base = path.split("/").pop().replace(/\.(svg|png|webp)$/i, "");
  ICONS[norm(base)] = modules[path];
}

/** Resolve an icon URL by (normalized) key, or null if no asset was provided. */
export function iconUrl(key) {
  const k = norm(key);
  return k ? ICONS[k] ?? null : null;
}

const SPELL_TRAP = new Set(["spell", "trap"]);
// Spell/Trap properties that carry a distinct icon asset.
const PROPS_WITH_ICON = new Set(["quickplay", "continuous", "equip", "field", "ritual", "counter", "normal"]);

/** The primary kind icon: a monster's attribute, or the SPELL/TRAP symbol.
 *  Returns { key, label, src, fallbackText }, or null. `label` is used for alt/title;
 *  `fallbackText` shows only when no asset exists — empty for Spell/Trap, since the
 *  adjacent "Spell Card"/"Trap Card" type text already conveys it. */
export function attributeIconFor(card) {
  if (!card) return null;
  const frame = String(card.frameType || "").toLowerCase();
  if (frame === "spell") return { key: "spell", label: "Spell", src: iconUrl("spell"), fallbackText: "" };
  if (frame === "trap") return { key: "trap", label: "Trap", src: iconUrl("trap"), fallbackText: "" };
  if (card.attribute) {
    return { key: card.attribute, label: card.attribute, src: iconUrl(card.attribute), fallbackText: card.attribute };
  }
  return null;
}

/** The spell/trap property icon (Quick-Play, Counter, Normal, …). Monsters → null.
 *  Returns { key, label, src } or null. */
export function propertyIconFor(card) {
  if (!card) return null;
  const frame = String(card.frameType || "").toLowerCase();
  if (!SPELL_TRAP.has(frame)) return null;
  const key = norm(card.race);
  if (!key) return null;
  return { key, label: card.race, src: PROPS_WITH_ICON.has(key) ? iconUrl(key) : null };
}

/** Level (or Rank, for Xyz monsters) icon + the numeric value. Null when the card
 *  has no level (Spells, Traps, Link monsters). */
export function levelIconFor(card) {
  if (!card || card.level == null) return null;
  const isXyz = String(card.frameType || "").toLowerCase().includes("xyz");
  const key = isXyz ? "rank" : "level";
  return { key, label: isXyz ? "Rank" : "Level", value: card.level, src: iconUrl(key) };
}

/** True when the card is a Spell or Trap (its `race` is a property, not a monster type). */
export function isSpellTrap(card) {
  return SPELL_TRAP.has(String(card?.frameType || "").toLowerCase());
}
