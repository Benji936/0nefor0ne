# Impact Analysis: Deck Card Ignore

**Feature:** Allow users to mark deck cards as "not missing" (ignored/skipped)
**Date:** 2026-06-08
**Risk Level:** LOW-MEDIUM

---

## Files to CREATE

| File | Reason |
|------|--------|
| `frontend/src/lib/deckIgnore.js` | localStorage utility: loadIgnored(deckId), saveIgnored(deckId, set), toggleIgnored(deckId, cardId) |

---

## Files to MODIFY

| File | Changes |
|------|---------|
| `frontend/src/components/DeckSection.vue` | Add `ignoredIds` prop (Set), `isIgnored(id)` method, ignore icon button on missing cards, `missingInSection` excludes ignored, emit `toggle-ignore` |
| `frontend/src/components/Pages/DeckDetailPage.vue` | Load ignoredIds from localStorage on mount; handle `toggle-ignore`; filter `stats.missingEntries` and `stats.missing` to exclude ignored; pass ignoredIds to DeckSection |
| `frontend/src/components/Pages/DecksPage.vue` | Load ignoredIds per deck in `computeStats`; store in deckStats; handle `toggle-ignore`; filter missingEntries and missing count; pass ignoredIds to DeckSection |
| `frontend/src/locales/en.json` | Add: `deckDetail.ignoreCard`, `deckDetail.unignoreCard`, `deckDetail.ignoredCount` |
| `frontend/src/locales/fr.json` | Same keys in French |
| `frontend/src/locales/de.json` | Same keys in German |
| `frontend/src/locales/it.json` | Same keys in Italian |

**Total: 7 files (1 new, 6 modified)**

---

## Persistence Strategy

localStorage only — no new Supabase table.

- Key: `tm_deck_ignored_<deckId>` → JSON array of card IDs (numbers)
- Works for both guests (localId) and auth users (Supabase UUID)
- Consistent with existing `tm_guest_decks` pattern in the codebase

---

## Architecture

```
localStorage (tm_deck_ignored_<deckId>)
        ↕ read on mount / write on toggle
DeckDetailPage  /  DecksPage
        ↓ :ignored-ids="ignoredIds"   ↑ @toggle-ignore="onToggleIgnore"
DeckSection  ← single render component, owns ignore button UI
```

---

## DeckSection.vue — New interface

### Props added
```js
ignoredIds: { type: Object, default: () => new Set() },  // Set<number>
```

### Emits added
```js
emits: ['toggle-ignore'],   // payload: cardId (number)
```

### Logic changes
- `isIgnored(id)` method: `return this.ignoredIds.has(id)`
- `missingInSection` computed: exclude ignored from count
- Ignored missing cards: render with very low opacity (0.15) + restore icon; owned/unrecognized unchanged
- Missing (non-ignored) cards: add small eye-off icon button, emits `toggle-ignore` on click

---

## DeckDetailPage.vue — Changes

```js
// data
ignoredIds: new Set(),

// on mount, after resolveStats
this.ignoredIds = loadIgnored(this.deck.id);

// method
onToggleIgnore(cardId) {
  this.ignoredIds = toggleIgnored(this.deck.id, cardId);
  this.recalcMissingStats();
},

// recalcMissingStats: refilter missingEntries and missing count excluding ignoredIds
```

- `stats.missing` and `stats.missingEntries` must be recomputed after ignore toggling to keep the wishlist button count accurate.
- Template: pass `:ignored-ids="ignoredIds"` and `@toggle-ignore="onToggleIgnore"` to each DeckSection.

---

## DecksPage.vue — Changes

```js
// in computeStats, after resolving:
const ignoredIds = loadIgnored(deck.id);

this.deckStats = {
  ...this.deckStats,
  [deck.id]: {
    ...existing,
    ignoredIds,
    missing: /* recomputed excluding ignoredIds */,
    missingEntries: /* filtered excluding ignoredIds */,
  },
};

// method
onToggleDeckIgnore(deckId, cardId) {
  const newSet = toggleIgnored(deckId, cardId);
  const stats = this.deckStats[deckId];
  // recompute missing/missingEntries for that deck with newSet
  this.deckStats = { ...this.deckStats, [deckId]: { ...stats, ignoredIds: newSet, ... } };
},
```

- Template: `:ignored-ids="deckStats[deck.id].ignoredIds"` and `@toggle-ignore="onToggleDeckIgnore(deck.id, $event)"` on each DeckSection.

---

## i18n Keys (all 4 locales)

```json
"deckDetail": {
  "ignoreCard": "Mark as not needed",
  "unignoreCard": "Mark as missing again",
  "ignoredCount": "{count} ignored"
}
```

---

## Risk Analysis

| Risk | Level | Mitigation |
|------|-------|-----------|
| Vue reactivity with Set | Low | Always replace Set with `new Set(...)` — never mutate in place |
| Per-deck ignored bleed in DecksPage deckStats cache | Low | Key ignoredIds by deckId inside deckStats object |
| `missingInSection` uses 3 props | Low | All props, no async; standard Vue computed |
| Wishlist count mismatch | Medium | Filter missingEntries in parent before passing to wishlist insert AND before showing button count |
| localStorage key collision | Low | Unique prefix `tm_deck_ignored_` + deckId |

No Supabase migrations. No router changes. No new pages.

---

## Key Integration Points

1. **DeckSection is the single UI component** — all ignore button rendering and emission lives here. Both parent pages are symmetric wrt props/events.
2. **`missingEntries` filtering is the source of truth** — both DeckDetailPage and DecksPage must filter this array excluding `ignoredIds` to keep the `missing` count, summary text, and "Add missing to wishlist" action all consistent.
