# Skill: CardPage Enrichment

## Context

CardPage (`/frontend/src/components/Pages/CardPage.vue`) is the Yu-Gi-Oh! card detail view. It already renders:
- Card image, name, type/race/attribute/level/ATK/DEF stats
- Card sets / Printings (from `card.card_sets[]`)
- Archetype cards horizontal scroll row (from `searchByArchetype()`)
- Related cards by Level+Attribute (from `searchByFilters()`)
- Traders section

## Current Implementation Status

| Feature | Status | Notes |
|---|---|---|
| Card sets section (set_code, set_name, rarity) | Done | Lines 98–123 |
| Archetype cards row | Done | Lines 126–145 |
| Archetype label as section title | Done | Shows "{archetype} archetype" as section header |
| Archetype badge near stats | Missing | Not shown standalone in the stats row |
| Related cards via Level+Attribute | Done | Lines 148–173 |
| Related card links to CardPage | Done | router-link to /{locale}/card/{id} |
| Graceful hiding (v-if guards) | Done | All sections conditionally rendered |
| Loading skeletons | Done | animate-pulse shown during async loads |

## The Only Real Gap

**Archetype badge in the stats row** (acceptance criteria: "Archetype label displayed when `card.archetype` is non-null"):

The archetype is currently only visible as a section heading when there are related archetype cards. If `card.archetype` is non-null but `archetypeCards` is empty, the archetype is invisible. Add a badge in the stats block.

### Where to Add It

In the stats `<div>` at line 52 in CardPage.vue:
```html
<div class="flex flex-wrap gap-3 text-sm" style="color: var(--c-muted)">
  <span v-if="card.type">{{ card.type }}</span>
  <span v-if="card.race">· {{ card.race }}</span>
  <span v-if="card.attribute">· {{ card.attribute }}</span>
  <span v-if="card.level != null">· {{ $t('cardYugi.level') }} {{ card.level }}</span>
  <span v-if="card.atk != null">· ATK {{ card.atk }}</span>
  <span v-if="card.def != null">· DEF {{ card.def }}</span>
  <!-- ADD HERE: -->
  <span
    v-if="card.archetype"
    class="text-xs px-2 py-0.5 rounded-full font-medium"
    style="background: color-mix(in srgb, var(--c-accent) 12%, transparent); color: var(--c-accent)"
  >{{ card.archetype }}</span>
</div>
```

## API Reference

All data comes from YGOProDeck API (`https://db.ygoprodeck.com/api/v7/`):

### Already-used endpoints (in `/frontend/src/api.js`)

```js
searchById(id, locale)      // cardinfo.php?id={id}&language={lang}
searchByArchetype(name, n)  // cardinfo.php?archetype={name}&num={n}
searchByFilters({level, attribute, num})  // cardinfo.php?level=X&attribute=Y&num=N
```

### Key card fields returned by `searchById`:
- `card.archetype` — string or null (e.g. `"Blue-Eyes"`)
- `card.card_sets[]` — `{set_name, set_code, set_rarity, set_rarity_code, set_price}`
- `card.card_prices` — `{tcgplayer_price, cardmarket_price, ebay_price, amazon_price, coolstuffinc_price}`
- `card.type`, `card.race`, `card.attribute`, `card.level`, `card.atk`, `card.def`

### Potential future additions:
- Price data: `card.card_prices.cardmarket_price` — already in API response, not currently displayed
- Set info API: `cardsetsinfo.php?setcode={code}` — for set-level metadata (release date, etc.)

## Codebase Patterns

### Component style (use Options API, not Composition API for methods/data):
```js
data() { return { archetypeCards: [], loadingArchetype: false } },
methods: {
  loadRelatedCards() {
    if (card.archetype) {
      this.loadingArchetype = true;
      searchByArchetype(card.archetype, 20)
        .then(res => { this.archetypeCards = res?.data?.data ?? [] })
        .catch(() => { this.archetypeCards = [] })
        .finally(() => { this.loadingArchetype = false });
    }
  }
}
```

### Theming (CSS custom properties):
- `--c-text` — primary text
- `--c-muted` — secondary/muted text
- `--c-border` — border color
- `--c-surface-2` — card/panel background
- `--c-skeleton` — skeleton pulse background
- `--c-accent` — accent color (archetype badge)
- `--c-trade` — trade action color

### Lazy loading images:
```html
<img :src="cardImage(c.id)" loading="lazy" />
```

### Skeleton loaders:
```html
<div v-if="loading" class="animate-pulse rounded-lg" style="width: 80px; height: 116px; background: var(--c-skeleton)" />
```

### Router links (locale-aware):
```html
<router-link :to="`/${$route.params.locale || 'en'}/card/${c.id}`">
```

## i18n Keys (cardPage namespace in en.json)

Existing:
- `cardPage.printingsCount` — "Printings ({count})"
- `cardPage.archetypeCards` — "{archetype} archetype"
- `cardPage.matchingCards` — "Can interact with"
- `cardPage.levelLabel` — "Level {level}"
- `cardPage.backToSearch`, `cardPage.cardNotFound`, `cardPage.searchOther`
- `cardPage.addToTrade`, `cardPage.addToWishlist`, `cardPage.unknown`

If adding a labelled archetype chip with prefix text (e.g. "Archetype: Blue-Eyes"), add:
```json
"cardPage": {
  "archetypeLabel": "Archetype"
}
```
...and mirror in `fr.json`, `de.json`, `it.json`.

## Mobile Considerations

- Archetype cards row: `overflow-x-auto pb-1` with `scrollbar-width: thin` — already mobile-safe
- New badge in stats row: `flex-wrap` is already set on the stats container — badge will wrap naturally
- Printings table: `overflow-y-auto max-height: 180px` — already scroll-contained
- No horizontal overflow risk from new elements if they use `shrink-0` or inline-flex

## Acceptance Criteria Cross-Check

- [x] Card sets section: set_code, set_name, rarity — **already done**
- [ ] Archetype label when `card.archetype` non-null — **needs badge in stats row**
- [x] Related cards ≥ 3 from same archetype — **done (up to 12)**
- [x] Related cards link to CardPage — **done**
- [x] Graceful hiding when unavailable — **done with v-if**
- [x] No flash/reflow on first load — **skeletons shown during load**
- [x] Mobile layout usable — **overflow-x-auto, flex-wrap**
