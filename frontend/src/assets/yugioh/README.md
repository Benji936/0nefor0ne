# Yu-Gi-Oh attribute & spell/trap icons

Icon files here are auto-discovered at build time by `src/lib/cardIcons.js`
(via `import.meta.glob`). Filenames are matched **case-insensitively with
non-alphanumerics stripped**, so `quickplay.svg` matches the API value
`Quick-Play`, `quick-play.svg` would work too. Drop a file in and it appears
automatically; a missing icon falls back to plain text (never an error).

## Keys used by the app

**Attributes** (monsters, from `card.attribute`):
`dark` · `light` · `earth` · `water` · `fire` · `wind` · `divine`

**Card type** (Spell / Trap, from `card.frameType`): `spell` · `trap`

**Spell/Trap properties** (from `card.race`):
`quickplay` · `continuous` · `equip` · `field` · `ritual` · `counter` · `normal`

**Level / Rank** (monsters, shown next to the value): `level` · `rank`

## Status
- ✅ Provided: light, earth, water, fire, wind, divine, spell, trap, quickplay,
  continuous, equip, field, ritual, counter, normal, level, rank.
- ⚠️ **Missing: `dark.svg`** — DARK monsters currently show the text "DARK"
  until a `dark.svg` is added here.
- `back.webp` is present but not yet wired (available as a card-image fallback).
