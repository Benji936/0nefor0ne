# Analysis: CardPage Enriched Content

## Source file
`frontend/src/components/Pages/CardPage.vue`

---

## Gap 1 — Prices Not Displayed

### Current state
`card.card_prices` is returned by `searchById` (ygoprodeck always includes it) but is never read or rendered.

The `marketLinks` computed (lines 447–454) only builds href links for TCGPlayer, eBay, and Cardmarket. No price data is extracted.

The external-links row (lines 64–77) renders only the `<a>` tags from `marketLinks`.

### What needs to change

1. Add a `prices` computed property that reads:
   - `card.card_prices?.[0]?.tcgplayer_price` → display in USD
   - `card.card_prices?.[0]?.cardmarket_price` → display in EUR
   Values of "0.00", "", or null should yield "—".

2. Render price badges alongside the market links row (lines 64–77). Add compact `<span>` elements inside the same `flex flex-wrap gap-3` div, or as a sibling `<div>` immediately after it.

3. Guard rendering: show the price row only when at least one non-zero price exists. If all prices are "0.00", hide the row entirely.

4. i18n keys needed in all locale files under `cardPage`: price display strings for TCGPlayer (USD) and Cardmarket (EUR).

### Integration risks
- `card.card_prices` is an array; always access `[0]`. The field may be null if the API omits it.
- Prices must not show during `loading` state — already handled since they render inside `v-else-if="card"`.
- No new API call needed.

---

## Gap 2 — Mobile Collapse for Printings

### Current state
Lines 98–123: the printings section uses a fixed `max-height: 180px` + `overflow-y-auto` div that scrolls on all viewports. On mobile this is cramped and non-intuitive.

Line 102: `<div class="overflow-y-auto" style="max-height: 180px">`

The `v-for` iterates over all `card.card_sets` with no limit.

### What needs to change

1. Add a reactive data property `printingsExpanded: false` in `data()` (lines 429–441).

2. Reset on navigation: in the `load()` method (line 472), add `this.printingsExpanded = false` alongside the other resets.

3. Template logic — use two sibling divs inside the printings container:
   - `<div class="sm:hidden">` — mobile branch: render `card.card_sets.slice(0, 5)` when `!printingsExpanded`, full list when `printingsExpanded`. Show a toggle button below only when `card.card_sets.length > 5`.
   - `<div class="hidden sm:block overflow-y-auto" style="max-height: 180px">` — desktop branch: unchanged full list with scroll.

4. Toggle button i18n: existing `cardPage.printingsCount` key can be reused for the "Show all X printings" label; add a `cardPage.showLess` key for collapse.

### Integration risks
- The section is guarded by `v-if="card.card_sets?.length"` — no change needed to the guard.
- Desktop scroll path is completely isolated in the `hidden sm:block` branch — zero regression risk.
- `printingsExpanded` must be reset in `load()` to satisfy the navigation-reset requirement.

---

## Gap 3 — Archetype-Null Fallback Label

### Current state
Lines 147–173: the matching-cards section always shows the generic i18n key `cardPage.matchingCards` ("Can interact with") as the section header (line 151), regardless of whether `card.archetype` is null.

The section is already guarded by `v-if="searchCriteria && (loadingTargets || targetCards.length)"` (line 148), so the archetype-null + no-results case is already handled (section disappears).

The existing sub-label (lines 153–156) already shows `levelLabel` and `attribute` as detail text below the heading.

### What needs to change

1. Add new i18n keys for enriched heading under `cardPage`:
   - A key that can express "Similar Level {level} {attribute} Monsters" — e.g. `matchingCardsCriteria` with params `{level}` and `{attribute}`, or separate keys for level-only and attribute-only variants.

2. Template change at lines 150–152: replace static `$t('cardPage.matchingCards')` with a conditional:
   - When `card.archetype` is null AND `searchCriteria` has both level and attribute → show enriched label.
   - When `card.archetype` is null AND `searchCriteria` has only one field → show partial label.
   - Fallback: keep `cardPage.matchingCards` as the default.

3. No change to the `v-if` guard — empty-section cases are already handled correctly.

### Integration risks
- Must add new i18n keys to all 4 locale files (en, fr, de, it). Card stat labels ("Level", "LIGHT") are conventionally shown in English in YGO context; translations can use English values for these tokens.
- The change is purely additive to the heading text — no behavioral change.

---

## Gap 4 — parseSearchCriteria Locale Bug

### Current state
Lines 505–515: `parseSearchCriteria` parses `card.desc` with English-only regex:

```js
const lvlMatch = desc.match(/[Ll]evel\s+(\d+)/);        // breaks in DE/FR/IT
for (const attr of ['LIGHT', 'DARK', 'EARTH', 'WATER', 'FIRE', 'WIND']) {
  if (upper.includes(attr)) { result.attribute = attr; break; }  // breaks in DE/FR/IT
}
return Object.keys(result).length >= 2 ? result : null;
```

The bug: when the user browses in DE/FR/IT, `searchById` returns `card.desc` in the target language. The word "Level" becomes "Stufe" (DE), "Niveau" (FR), "Livello" (IT). Attribute names also differ. Result: `parseSearchCriteria` returns `null`, `searchCriteria` is never set, and the matching-cards section never renders for non-English users.

The fix: `card.level` and `card.attribute` are structured API fields always returned in English by ygoprodeck regardless of locale param. They do not need regex parsing.

### What needs to change

Replace `parseSearchCriteria` entirely (lines 505–515):

```js
parseSearchCriteria(card) {
  // Only Monster cards have meaningful level/attribute criteria
  const isMonster = card.type && card.type.toLowerCase().includes('monster');
  if (!isMonster) return null;
  const result = {};
  if (card.level != null) result.level = card.level;
  if (card.attribute) result.attribute = card.attribute;
  return Object.keys(result).length > 0 ? result : null;
},
```

Key changes:
- Remove the `lvlMatch` regex entirely.
- Remove the attribute string-loop against `card.desc`.
- Read `card.level` (integer, locale-invariant) and `card.attribute` (string, always English) directly.
- Guard on Monster type to prevent Spell/Trap cards from ever triggering the section.
- Return non-null even with only one criterion (level or attribute alone) — the caller `loadRelatedCards` already handles this via `searchByFilters` which accepts partial params.

### Integration risks
- `searchByFilters` in `api.js` (lines 82–88) already accepts `{ level, attribute }` — no change needed.
- Link Monsters have no `level` (they have `linkval`); `card.level != null` handles this correctly.
- Xyz Monster ranks are stored in `level` field — no special handling needed.
- The `isMonster` check using `.includes('monster')` covers all Monster subtypes correctly.
- The old method required BOTH level AND attribute (`>= 2`). The new method returns non-null with just one field. This is a behavioral change: monsters with only a level or only an attribute will now trigger the matching-cards section. This is consistent with the acceptance criteria ("use card.level and card.attribute fields directly... guarded by card type").

---

## Summary Table

| Gap | File | Lines Affected | Risk |
|-----|------|----------------|------|
| Prices not displayed | CardPage.vue | 447–454 (computed), 64–77 (template) | Low — additive only |
| Mobile collapse printings | CardPage.vue | 98–123 (template), 472–481 (load), 429–441 (data) | Low — desktop path isolated |
| Archetype-null fallback label | CardPage.vue | 150–152 (template), all 4 locale JSON files | Low — additive heading text |
| parseSearchCriteria locale bug | CardPage.vue | 505–515 (method) | Low — replaces regex with direct field access, same return shape |

## i18n Keys Needed (all 4 locale files)

Under `cardPage`:
- `priceUSD` or `priceTcg` — for TCGPlayer price badge (Gap 1)
- `priceEUR` or `priceCm` — for Cardmarket price badge (Gap 1)
- `showAllPrintings` — "Show all {count} printings" toggle (Gap 2)
- `showLess` — collapse toggle label (Gap 2)
- `matchingCardsCriteria` — "Similar Level {level} {attribute} Monsters" (Gap 3)
- Variants for level-only and attribute-only if needed (Gap 3)

Existing keys already present in en.json that are reusable: `levelLabel`, `matchingCards`, `printingsCount`.
