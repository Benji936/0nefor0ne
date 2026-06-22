# Skill: Deck Card Ignore (Mark as "Not Missing")

## Purpose
Allow users to mark individual missing deck cards as "not needed" / "already sourcing" / "skip". The ignored cards are excluded from the missing count, the summary stats, and the "Add missing to wishlist" bulk action. State is persisted per-deck in localStorage — no backend required.

---

## Data Model

### localStorage Key Pattern
```
tm_deck_ignored_{deckId}   →   JSON array of numeric card IDs
```

Per-deck granularity: a user may need the same card in one deck but not another. Global ignore would be wrong.

### Helper functions (add to DeckDetailPage.vue)
```js
function readIgnoredIds(deckId) {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(`tm_deck_ignored_${deckId}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function writeIgnoredIds(deckId, set) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    `tm_deck_ignored_${deckId}`,
    JSON.stringify(Array.from(set))
  );
}
```

---

## Vue 3 Reactivity Rule for Sets

Vue 3 does NOT track mutations on a plain `Set`. You MUST reassign to trigger reactivity:

```js
// WRONG — Vue won't re-render
this.ignoredIds.add(id);

// CORRECT — reassign new Set to trigger reactivity
const next = new Set(this.ignoredIds);
next.add(id);
this.ignoredIds = next;
```

---

## Architecture

### Data Flow
```
DeckDetailPage
  ├── ignoredIds: Set<number>   (reactive, persisted to localStorage)
  ├── toggleIgnore(cardId)      (method)
  └── DeckSection (x3: main, extra, side)
        ├── prop: ignoredIds
        ├── emits: toggle-ignore(cardId)
        └── per-card ignore button (mdi-eye-off / mdi-eye)
```

### Files to Modify

| File | Change |
|---|---|
| `frontend/src/components/Pages/DeckDetailPage.vue` | Add `ignoredIds` data, `toggleIgnore()` method, update `stats.missing` / `missingEntries` to exclude ignored, load from localStorage in `mounted()` |
| `frontend/src/components/DeckSection.vue` | Add `ignoredIds` prop, `isIgnored()` method, ignore toggle button per card, update `missingInSection` computed |
| `frontend/src/locales/en.json` | Add `deckIgnore.*` keys |
| `frontend/src/locales/fr.json` | Add `deckIgnore.*` keys |
| `frontend/src/locales/de.json` | Add `deckIgnore.*` keys |
| `frontend/src/locales/it.json` | Add `deckIgnore.*` keys |

---

## DeckDetailPage.vue Changes

### data() additions
```js
data() {
  return {
    // ... existing ...
    ignoredIds: new Set(), // card numeric IDs ignored by user
  };
},
```

### mounted() — load ignored IDs from localStorage
```js
async mounted() {
  await this.loadDeck();
  // ignoredIds loaded after deck.id is known (inside loadDeck after deck is set)
},
```

Load inside `loadDeck()` after `this.deck` is set:
```js
// After: this.deck = { id, name, ydk_content, created_at }
this.ignoredIds = readIgnoredIds(this.deck.id);
```

### methods additions
```js
toggleIgnore(cardId) {
  const next = new Set(this.ignoredIds);
  if (next.has(cardId)) { next.delete(cardId); }
  else { next.add(cardId); }
  this.ignoredIds = next;
  writeIgnoredIds(this.deck.id, next);
},
```

### Update resolveStats() — exclude ignored from stats
After computing `missingEntries`:
```js
// Apply ignore filter to stats
const ignoredIds = this.ignoredIds; // snapshot for consistency
const missingEntries = allEntries.filter(
  c => cardMap[c.id] && !ownedIds.has(c.id) && !ignoredIds.has(c.id)
);
const missing = missingEntries.reduce((s, c) => s + c.qty, 0);
const ignoredCount = allEntries.filter(
  c => cardMap[c.id] && !ownedIds.has(c.id) && ignoredIds.has(c.id)
).reduce((s, c) => s + c.qty, 0);

this.stats = {
  // ... existing fields ...
  missing,
  ignoredCount,
  missingEntries,
};
```

### DeckSection template — pass ignoredIds + handle emit
```vue
<DeckSection
  v-if="stats.main.length"
  :entries="stats.main"
  :card-map="stats.cardMap"
  :owned-ids="stats.ownedIds"
  :ignored-ids="ignoredIds"
  :title="$t('deckDetail.mainDeck')"
  :missing-badge="$t('deckImport.missingBadge')"
  :unknown-badge="$t('deckImport.unknownBadge')"
  @toggle-ignore="toggleIgnore"
/>
```

---

## DeckSection.vue Changes

### Add prop
```js
props: {
  // ... existing props ...
  ignoredIds: { type: Object, default: () => new Set() }, // Set<number>
},
```

### Add emit
```js
emits: ['toggle-ignore'],
```

### Update computed missingInSection
```js
missingInSection() {
  return this.entries.reduce((sum, e) => {
    if (this.cardMap[e.id] && !this.ownedIds.has(e.id) && !this.ignoredIds.has(e.id))
      sum += (e.qty || 1);
    return sum;
  }, 0);
},
```

### Add isIgnored method
```js
isIgnored(id) { return this.ignoredIds.has(id); },
```

### Template — ignore toggle button on missing cards
Add inside the `position-relative` wrapper div for each card (after the missing badge):
```vue
<!-- Ignore button — only on missing (not owned, not unrecognized) -->
<button
  v-if="isMissing(item.id)"
  class="position-absolute"
  style="top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: rgba(0,0,0,0.55); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0"
  :title="isIgnored(item.id) ? $t('deckIgnore.unignore') : $t('deckIgnore.ignore')"
  @click.stop="$emit('toggle-ignore', item.id)"
>
  <v-icon
    :icon="isIgnored(item.id) ? 'mdi-eye' : 'mdi-eye-off'"
    size="11"
    color="white"
  />
</button>
```

Replace the missing badge to show "SKIPPED" when ignored:
```vue
<div
  v-if="isMissing(item.id) && !isIgnored(item.id)"
  class="position-absolute ..."
  style="... background: var(--c-missing-badge, rgba(220,38,38,0.85)); ..."
>{{ missingBadge }}</div>

<div
  v-if="isMissing(item.id) && isIgnored(item.id)"
  class="position-absolute ..."
  style="... background: rgba(120,120,120,0.85); ..."
>{{ $t('deckIgnore.skippedBadge') }}</div>
```

### Section header — ignored count badge
```vue
<span v-if="ignoredInSection > 0" style="color: var(--c-muted); margin-left: 4px; font-size: 0.75em">
  · {{ $t('deckIgnore.ignoredCount', { count: ignoredInSection }) }}
</span>
```

Add computed:
```js
ignoredInSection() {
  return this.entries.reduce((sum, e) => {
    if (this.cardMap[e.id] && !this.ownedIds.has(e.id) && this.ignoredIds.has(e.id))
      sum += (e.qty || 1);
    return sum;
  }, 0);
},
```

---

## i18n Keys

### en.json
```json
"deckIgnore": {
  "ignore": "Mark as not needed",
  "unignore": "Mark as missing again",
  "skippedBadge": "Skipped",
  "ignoredCount": "{count} skipped"
}
```

### fr.json
```json
"deckIgnore": {
  "ignore": "Marquer comme non nécessaire",
  "unignore": "Marquer à nouveau comme manquant",
  "skippedBadge": "Ignoré",
  "ignoredCount": "{count} ignoré(s)"
}
```

### de.json
```json
"deckIgnore": {
  "ignore": "Als nicht benötigt markieren",
  "unignore": "Wieder als fehlend markieren",
  "skippedBadge": "Übersprungen",
  "ignoredCount": "{count} übersprungen"
}
```

### it.json
```json
"deckIgnore": {
  "ignore": "Segna come non necessario",
  "unignore": "Segna di nuovo come mancante",
  "skippedBadge": "Saltato",
  "ignoredCount": "{count} saltato/i"
}
```

---

## SSR Safety

`readIgnoredIds()` guards against SSR with `typeof window === 'undefined'`. It must only be called inside `loadDeck()` (which runs from `mounted()`) — never in `setup()` or `onServerPrefetch()`.

---

## Visual Summary of UX

| Card State | Image Opacity | Badge | Eye Icon |
|---|---|---|---|
| Owned | 1.0 | — | — |
| Missing (active) | 0.35 | Red "MISSING" | `mdi-eye-off` (tap to skip) |
| Missing (ignored) | 0.35 | Gray "SKIPPED" | `mdi-eye` (tap to restore) |
| Unrecognized | 0.35 | Gray "UNRECOGNIZED" | — |

---

## Key Dependencies

- `window.localStorage` — browser-only, guarded for SSR
- Vue 3 Set reactivity — always reassign new Set
- `mdi-eye` / `mdi-eye-off` — MDI icons (already installed)
- Vue Options API — match existing DeckDetailPage.vue / DeckSection.vue style
- CSS variables: `var(--c-muted)`, `var(--c-missing-badge)` — never hardcode colors
