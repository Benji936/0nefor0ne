# Impact Analysis: Deck Completion Page

**Feature:** Enrich the existing per-deck page (`decks/:deckId`) with a visual completion bar and richer deck statistics; extend the same math to the deck list page's summary rows.
**Date:** 2026-07-13
**Risk Level:** LOW-MEDIUM

---

## Important context: the "dedicated page" already exists

Prior tasks (deck-detail-page, deck-management-page, deck-card-ignore) already shipped:
- `frontend/src/components/Pages/App/DecksPage.vue` - deck list at `/:locale/decks`, with lazy per-deck text stats (total/owned/missing/unrecognized) inside expansion panels.
- `frontend/src/components/Pages/App/DeckDetailPage.vue` - dedicated single-deck page at `/:locale/decks/:deckId` (route name `deckDetail`), showing a plain-text summary line and three `DeckSection` card grids (main/extra/side).
- `frontend/src/components/library/DeckSection.vue` - pure card-grid renderer (owned/missing/unrecognized/ignored badges + ignore toggle).
- `frontend/src/lib/deckIgnore.js` - "SOURCED"/ignored card persistence (Supabase `decks.ignored_card_ids` for auth users, `localStorage tm_deck_ignored_<deckId>` for guests).

This task does not require a new route or new page shell. It requires: (1) a visual completion bar component, (2) additional derived statistics/breakdowns rendered on `DeckDetailPage.vue`, and (3) optionally propagating the same completion-bar visual to `DecksPage.vue` list rows (currently text-only).

No reusable progress-bar component exists anywhere in the codebase today. The only `v-progress-linear` usage in the app is an unrelated import-progress meter in `frontend/src/components/library/BulkAddCards.vue` (style pattern worth copying: `color="var(--c-accent)" height="8" rounded`). The previously-analyzed `analysis-set-collection-progress.md` proposed a `SetProgressBar.vue`, but that task (`set-collection-progress`) is still in `todo/` and unimplemented, so there is nothing to reuse from it directly, though its progress-bar markup pattern is a good template.

Note: a skill file already exists at `.claude/skills/deck-management/SKILL.md` § 9 "Deck Completion Bar & Richer Deck Data" (and companion skills `collection-progress` and `deck-card-ignore`) covering implementation patterns for this exact feature — cross-reference during architecture/decomposition.

---

## Files to CREATE

| File | Purpose |
|------|---------|
| `frontend/src/components/library/DeckCompletionBar.vue` | Presentational completion bar. Props: `{ owned: Number, total: Number, ignored: Number (default 0) }`. Renders a segmented `v-progress-linear`-based bar (owned = accent color, ignored = muted/secondary color, remainder = missing) plus a `X / Y (Z%)` label. Used by both `DeckDetailPage.vue` and `DecksPage.vue`. |
| `frontend/src/components/library/DeckStatsBreakdown.vue` | Presentational "richer data" panel: card-type breakdown (Monster/Spell/Trap counts, computed client-side from `cardMap` + entries), and an estimated cost of missing cards (sum of `card_prices[0].tcgplayer_price` / `cardmarket_price` across `missingEntries`, `"0.00"`/falsy treated as unknown, same normalization CardPage.vue already uses). Props: `{ entries: Array, cardMap: Object, missingEntries: Array }`. Used on `DeckDetailPage.vue`; optional on `DecksPage.vue` expansion panel. |

Both are new, small, pure-presentational SFCs following the existing `DeckSection.vue` convention (props in, no Supabase/API calls of their own; parent pages own data fetching).

---

## Files to MODIFY

| File | Change required |
|------|----------------|
| `frontend/src/components/Pages/App/DeckDetailPage.vue` | Import and render `DeckCompletionBar` (below the H1, replacing/augmenting the current plain-text `deckDetail.summary` line) and `DeckStatsBreakdown` (new section, likely between the completion bar and the wishlist button, or after the wishlist button and before `DeckSection`s). Compute `completionPct`, `ownedForBar`, `ignoredForBar` as new `computed` properties derived from existing `stats` (no new data fetches; `stats.owned`, `stats.missing`, `stats.unrecognized`, and `ignoredIds.size` are already available). Must stay correct wherever `stats`/`ignoredIds` already get recomputed: `resolveStats()` (initial load + realtime callback) and `onToggleIgnore()` (optimistic path); as computed properties this is automatic, no extra wiring needed. |
| `frontend/src/components/Pages/App/DecksPage.vue` | Same pattern in the expansion-panel-title stats line: swap (or augment) the existing text stats (`decks.totalCards`/`ownedCount`/`missingCount`) for a compact `DeckCompletionBar`. `deckStats[deck.id]` already carries `total`/`owned`/`missing`; `ignoredByDeck[deck.id]` already carries the ignored `Set`. `computeStats()` and `onToggleDeckIgnore()` already recompute these, no new async work required. |
| `frontend/src/locales/en.json` | New keys under `deckDetail.*` (and/or a new `deckCompletion.*` namespace) for: completion bar label/aria text, type-breakdown section title, "estimated cost of missing cards" label, price-unavailable fallback text. |
| `frontend/src/locales/fr.json` | Same keys, French. |
| `frontend/src/locales/de.json` | Same keys, German. |
| `frontend/src/locales/it.json` | Same keys, Italian. |

## Files confirmed to need NO change

- `frontend/src/router/index.js` - route `decks/:deckId` (name `deckDetail`) and legacy redirect already exist; no new route needed.
- `frontend/vite.config.js` - `ssgOptions.includedRoutes` does not list any `decks` path (grepped, confirmed); the deck pages are correctly excluded from SSG prerendering as user-private/auth-optional pages. Nothing to change.
- `frontend/src/components/library/DeckSection.vue` - stays a pure card-grid renderer; the new richer-data panel is a sibling component, not a change to this one.
- `frontend/src/lib/deckIgnore.js`, `frontend/src/lib/ydk.js`, `frontend/src/api.js` - all data this feature needs (`ownedIds`, `ignoredIds`, `cardMap` with `type`/`card_prices`) is already fetched by existing code paths; no new queries or endpoints required.
- No Supabase schema/migration changes: the `decks` table already has `ignored_card_ids`; no new column is needed since completion % and price totals are purely derived client-side from data already loaded into `stats`/`deckStats`.

---

## Key Interfaces

### `DeckCompletionBar.vue` (new)
```js
props: {
  owned:   { type: Number, required: true },
  total:   { type: Number, required: true },
  ignored: { type: Number, default: 0 },
}
// computed: pct = total > 0 ? Math.round(((owned + ignored) / total) * 100) : 0
```
Open design question (flag for architecture phase): does "ignored" count as owned toward the percentage, or render as a visually distinct third segment? The task's context doc says ignored cards "should presumably count toward completion."

### `DeckStatsBreakdown.vue` (new)
```js
props: {
  entries:        { type: Array,  required: true }, // combined main+extra+side [{id, qty}]
  cardMap:        { type: Object, required: true },  // { [id]: ygoprodeckCardObject }
  missingEntries: { type: Array,  required: true },  // [{id, qty}] excluding ignored
}
```
Derives, client-side, no extra fetches:
- Type breakdown: bucket `cardMap[id].type` into Monster/Spell/Trap (and optionally Extra-deck subtype) counts weighted by `qty`.
- Estimated missing-card cost: `sum(missingEntries.map(e => price(cardMap[e.id]) * e.qty))`, using the same "0.00" -> null normalization as `CardPage.vue`'s `prices` computed (frontend/src/components/Pages/App/CardPage.vue:641-648).

### Existing `stats` / `deckStats[deck.id]` shape (unchanged, reused as-is)
```js
{
  cardMap, ownedIds, main, extra, side,
  total, owned, missing, unrecognized, missingEntries,
}
```
`ignoredIds` (DeckDetailPage) / `ignoredByDeck[deck.id]` (DecksPage) are Set<number>, tracked separately from `stats`.

---

## Integration Points

1. **DeckDetailPage.vue template**: insert `<DeckCompletionBar>` immediately after the `<h1>` deck name (replacing or sitting alongside the current `deckDetail.summary` paragraph, lines ~33-43), and `<DeckStatsBreakdown>` as a new block before or after the wishlist-action block (lines ~51-72), gated behind `v-if="!loadingStats"` like the existing summary.
2. **DecksPage.vue expansion-panel-title**: the stats `<div class="text-caption mt-1">` block (lines ~183-198) is the injection point for a compact `DeckCompletionBar` variant; keep it small enough to fit inline in the collapsed panel header.
3. **Realtime consistency**: both pages already re-run `resolveStats()`/`computeStats()` on Supabase `Card` table realtime events and on ignore-toggle. Because the new bar/breakdown data is purely derived (computed properties, not separately fetched/stored state), it stays consistent for free, no new subscription wiring needed.
4. **i18n key additions must land in all 4 locale files** in the same PR (repo convention observed in every prior deck-* analysis and confirmed by the current parallel key sets across `en/fr/de/it.json`). No em dashes in new copy per user style preference.

---

## Similar Existing Patterns to Follow

- **Progress bar styling**: `frontend/src/components/library/BulkAddCards.vue` lines 78-84 (`v-progress-linear` with `color="var(--c-accent)"`, `height="8"`, `rounded`), closest existing visual precedent in this codebase.
- **Price normalization**: `frontend/src/components/Pages/App/CardPage.vue` `prices` computed (lines 641-648), treats `"0.00"`/falsy `tcgplayer_price`/`cardmarket_price` as unavailable; reuse this exact normalization for the missing-cards cost estimate.
- **Derived-stats-as-computed pattern**: already used throughout `DeckDetailPage.vue`/`DecksPage.vue` for `total`/`owned`/`missing`/`unrecognized`; the new completion % and breakdowns should be plain `computed` properties over already-loaded `stats`, not new async state, to avoid duplicating the realtime-refresh wiring.
- **Ignored-card exclusion**: `missingEntries` in both pages already filters out ignored IDs (`!ignoredIds.has(c.id)`); the breakdown/price-estimate component should consume `missingEntries` (not raw entries) so ignored ("SOURCED") cards are automatically excluded from "missing cost," consistent with how they're already excluded from the missing count and wishlist-add flow.

---

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Completion % denominator ambiguity (does `total` include unrecognized cards? do ignored cards count as owned?) | Medium | Resolve explicitly in architecture phase before implementation; recommend excluding `unrecognized` from the denominator and giving ignored cards their own visual segment rather than silently folding them into "owned" (avoids overstating true collection completion) |
| Price data (`card_prices`) can be missing/stale/zero for many cards, especially rare or reprint-heavy cards | Low-Medium | Reuse CardPage.vue's existing null-normalization; render "price unavailable" rather than $0.00 or omitting the card from the total silently |
| Adding a breakdown panel to `DecksPage.vue`'s already-dense expansion-panel-title could crowd the collapsed row on mobile | Low | Keep the list-row variant to the compact bar only; put the full type/price breakdown exclusively on `DeckDetailPage.vue` |
| i18n keys added to only some locale files (repeated risk across all prior deck-* analyses) | Low | Add identical key sets to all 4 locale files in the same change; `useHead`/`$t` fall back silently (`missingWarn: false`) so a miss is not a hard error but is a real UX gap |
| Vue 3 reactivity on Sets (ignored IDs) | Low | Already solved by existing `deckIgnore.js` convention (always reassign a new `Set` instance); no new risk introduced, just must be respected by any new code path that reads `ignoredIds` |
| Realtime recompute cost if breakdown computation is expensive for very large decks | Low | Type/price breakdown is O(unique card count), same order as existing `owned`/`missing` reduces already run on every realtime event; negligible additional cost |

**Overall risk: LOW-MEDIUM** - no new routes, no new Supabase queries/schema, no SSG interaction changes. Primary risk is a product-decision ambiguity (how ignored cards factor into the completion percentage) rather than technical/architectural risk.

---

## Summary

- Files to create: 2 (`DeckCompletionBar.vue`, `DeckStatsBreakdown.vue`, both in `frontend/src/components/library/`)
- Files to modify: 6 (`DeckDetailPage.vue`, `DecksPage.vue`, 4 locale files)
- Files confirmed unaffected: router, vite.config.js, DeckSection.vue, deckIgnore.js, ydk.js, api.js, Supabase schema
- Total files affected: 8
- Risk level: LOW-MEDIUM (see risk register, mainly a product-decision risk, not a technical one)
