# deck-card-ignore.feature

## Title
Allow users to mark deck cards as "not missing" (ignored/skipped)

## Type
feature

## User Request
> "I want the user to be able to mark card in the deck list as not missing so he can track what he need only and not all the deck list"

## Depends On
- deck-detail-page.feature (completed — DeckDetailPage.vue and DeckSection.vue exist)

---

# Description

Users want to curate their deck want-lists by excluding specific missing cards they no longer need to track. Currently the deck view shows all missing cards (cards in the YDK file not present in their collection), but some of those cards may have been sourced elsewhere, deemed unnecessary, or simply deprioritised. This feature lets users mark individual missing cards as "ignored" — removing them from the missing count and from the "Add missing to wishlist" action — while keeping the full deck list visible with a distinct visual state for ignored cards.

Ignored state is scoped per deck: the same card can be ignored in one deck and tracked as missing in another. For authenticated users, ignored cards are persisted in Supabase alongside the deck; for guest users, they are stored in the existing localStorage structure (tm_guest_decks). The feature applies to both DeckDetailPage (the full deck view) and the accordion panels in DecksPage. When a guest user migrates to an authenticated account, their ignored cards migrate with the deck.

If an ignored card is later added to the user's collection, the owned state takes priority and the ignored flag has no visible effect (the card shows as owned, not ignored).

**Scope**:
- Included: Toggle ignore per missing card, distinct visual badge and opacity for the ignored state, missing count excludes ignored cards, "Add missing to wishlist" excludes ignored cards, Supabase persistence for auth users, localStorage persistence for guest users, guest-to-auth migration carry-over, i18n translation key for the "IGNORED" badge
- Excluded: Ignoring owned or unrecognized cards, global (cross-deck) ignore, bulk ignore, ignore notes/reasons, a separate filtering UI to show/hide ignored cards

**User Scenarios**:
1. **Primary Flow**: User clicks a missing card in DeckDetailPage or the DecksPage accordion → card badge changes to "IGNORED" and opacity updates, missing count decrements, change is persisted
2. **Alternative Flow**: User clicks an ignored card → it reverts to "MISSING" state and count increments; or user clicks "Add missing to wishlist" which skips all ignored cards
3. **Error Handling**: If persistence fails, an error snackbar is shown but the optimistic UI state is preserved

---

## Acceptance Criteria

Clear, testable criteria using Given/When/Then format:

### Functional Requirements

- [ ] **Toggle ignore on missing card**: User can click a missing card to mark it as ignored
  - Given: A missing card is displayed in a deck section
  - When: User clicks the card
  - Then: The card badge changes to the locale-specific "IGNORED" text, the card's opacity updates to the ignored style, and the deck's missing count decrements by the card's qty

- [ ] **Unignore restores missing state**: User can click an ignored card to unmark it
  - Given: An ignored card is displayed in a deck section
  - When: User clicks the ignored card
  - Then: The card badge reverts to "MISSING", the card's opacity reverts to the missing style, and the missing count increments by the card's qty

- [ ] **Missing count excludes ignored cards**: The deck missing count reflects only non-ignored missing cards
  - Given: A deck has 3 missing cards and 1 of them is marked as ignored
  - When: Stats are computed or the deck is rendered
  - Then: The displayed missing count is 2, not 3

- [ ] **Wishlist add excludes ignored cards**: "Add missing to wishlist" does not insert ignored cards
  - Given: A deck has 3 missing cards and 1 is ignored
  - When: User clicks "Add missing to wishlist"
  - Then: Exactly 2 cards are inserted into the wishlist (the ignored card is skipped)

- [ ] **Auth persistence across page reload**: Ignored state survives a page reload for authenticated users
  - Given: An authenticated user has ignored a card in a deck
  - When: The user reloads the page and navigates back to the same deck
  - Then: The card still displays as ignored

- [ ] **Guest persistence across page reload**: Ignored state survives a page reload for guest users
  - Given: A guest user has ignored a card in a deck
  - When: The user reloads the page and navigates back to the same deck
  - Then: The card still displays as ignored (state was saved to localStorage)

- [ ] **Per-deck isolation**: Ignoring a card in one deck does not affect other decks
  - Given: Card X is ignored in deck A
  - When: User opens deck B which also contains card X
  - Then: Card X is NOT in an ignored state in deck B

- [ ] **Guest-to-auth migration carries ignored state**: Migrating guest decks to auth account includes ignored cards
  - Given: A guest user has a deck with 2 ignored cards and then logs into an account
  - When: The migration prompt is confirmed
  - Then: The migrated deck in Supabase has the same 2 cards in the ignored state

- [ ] **Only missing cards are ignorable**: Clicking an owned card has no ignore effect
  - Given: An owned card is displayed in a deck section
  - When: User clicks the owned card
  - Then: No ignore state change occurs on the card

- [ ] **i18n badge text**: The "IGNORED" badge uses a locale-specific translation key
  - Given: The app is displayed in any of the supported locales (en, fr, de, it)
  - When: A card is in the ignored state
  - Then: The badge text is the locale-specific translation, not a hardcoded English string

### Non-Functional Requirements

- [ ] **Performance**: Toggle interaction updates the UI within 100ms (optimistic update — the UI does not wait for the async persistence call to complete)
- [ ] **Resilience**: If the persistence call fails, an error snackbar is shown but the UI state is not rolled back

### Definition of Done

- [ ] All acceptance criteria pass
- [ ] Tests written and passing
- [ ] i18n keys added for all 4 locales (en, fr, de, it)
- [ ] Code reviewed

---

## Skill Reference

Implementation guidance: `.claude/skills/deck-card-ignore/SKILL.md`

Key patterns documented:
- localStorage helpers (`readIgnoredIds` / `writeIgnoredIds`) with per-deck key `tm_deck_ignored_{deckId}`
- Vue 3 Set reactivity rule (always reassign `new Set()`, never mutate in place)
- Emit chain: `DeckSection` → `toggle-ignore(cardId)` → `DeckDetailPage.toggleIgnore()`
- Visual states table: owned / missing-active / missing-ignored / unrecognized
- i18n keys for all 4 locales (`deckIgnore.*`)

---

## Architecture Overview

### Solution Strategy

The ignore/skip feature layers cleanly on top of the existing `DeckSection` / `DeckDetailPage` / `DecksPage` architecture with **no Supabase migration required**. Ignored state is persisted entirely in `localStorage`, using the key pattern `tm_deck_ignored_{deckId}` which stores a JSON array of numeric card IDs. This mirrors the existing `tm_guest_decks` localStorage pattern in the codebase and works identically for both guest users and authenticated users (scoped by the deck's ID, whether a local integer or a Supabase UUID).

A utility module `frontend/src/lib/deckIgnore.js` exposes `loadIgnored(deckId)`, `saveIgnored(deckId, set)`, and `toggleIgnored(deckId, cardId)` to keep the logic DRY across both parent pages.

### Key Decisions

1. **Ignored state in the parent page, not DeckSection**: `ignoredIds: Set<number>` is a reactive data property on `DeckDetailPage` and `DecksPage`. `DeckSection` stays a pure presentational component with no direct localStorage access.

2. **Prop/emit contract on DeckSection**: `DeckSection` receives `ignoredIds: Set<number>` as a prop (default `new Set()`) and emits `toggle-ignore(cardId: number)`. The parent handles persistence and state update.

3. **Vue 3 Set reactivity — always reassign**: Vue 3 does not track in-place Set mutations. Every toggle must create a new Set (`this.ignoredIds = new Set(this.ignoredIds)`) to trigger reactivity. The `toggleIgnored()` utility enforces this pattern.

4. **Four visual states in DeckSection**:
   | State | Opacity | Badge | Eye icon |
   |---|---|---|---|
   | Owned | 1.0 | — | — |
   | Missing (active) | 0.35 | Red "MISSING" | `mdi-eye-off` (click to skip) |
   | Missing (ignored) | 0.15 | Gray "SKIPPED" | `mdi-eye` (click to restore) |
   | Unrecognized | 0.35 | Gray "UNRECOGNIZED" | — |

5. **Missing count excludes ignored**: Both `missingInSection` (computed in `DeckSection`) and `stats.missing` / `stats.missingEntries` (computed in the parent pages) filter out ignored card IDs. This ensures the badge count, the summary stat, and the "Add missing to wishlist" action are all consistent.

6. **Wishlist insert filters ignored cards**: The "Add missing to wishlist" action uses `stats.missingEntries` which already excludes ignored IDs — no additional filtering needed at insert time.

7. **SSR safety**: `loadIgnored()` guards `typeof window === 'undefined'` and must only be called inside `mounted()` (or inside `loadDeck()` which is called from `mounted()`), never in `setup()` or `onServerPrefetch()`.

8. **Optimistic UI**: Since `localStorage` is synchronous, the toggle is instant — no async gap, no rollback logic needed. The optimistic update pattern is naturally satisfied.

### Data Flow

```
localStorage: tm_deck_ignored_{deckId}
        ↕  loadIgnored() on mount
        ↕  saveIgnored() on toggle
DeckDetailPage  /  DecksPage
  ignoredIds: Set<number>   (reactive)
  onToggleIgnore(cardId) → toggleIgnored(deckId, cardId) → reassign ignoredIds
        ↓  :ignored-ids="ignoredIds"
        ↑  @toggle-ignore="onToggleIgnore"
DeckSection (main / extra / side)
  isIgnored(id), missingInSection (excludes ignored)
  ignore eye button → $emit('toggle-ignore', cardId)
```

### Expected File Changes

| File | Action | Description |
|---|---|---|
| `frontend/src/lib/deckIgnore.js` | CREATE | `loadIgnored(deckId)`, `saveIgnored(deckId, set)`, `toggleIgnored(deckId, cardId)` — SSR-safe localStorage helpers |
| `frontend/src/components/DeckSection.vue` | MODIFY | Add `ignoredIds` prop, `toggle-ignore` emit, `isIgnored()` method, `missingInSection` and `ignoredInSection` computed updates, ignore eye button UI, visual state for ignored badge |
| `frontend/src/components/Pages/DeckDetailPage.vue` | MODIFY | Add `ignoredIds` data, load from localStorage in `loadDeck()`, `onToggleIgnore()` method, recompute `stats.missing` / `stats.missingEntries` excluding ignored, pass prop/event to DeckSection |
| `frontend/src/components/Pages/DecksPage.vue` | MODIFY | Load `ignoredIds` per deck in `computeStats`, store in `deckStats[deckId].ignoredIds`, `onToggleDeckIgnore(deckId, cardId)` method, recompute missing/missingEntries, pass prop/event to DeckSection |
| `frontend/src/locales/en.json` | MODIFY | Add `deckIgnore.ignore`, `deckIgnore.unignore`, `deckIgnore.skippedBadge`, `deckIgnore.ignoredCount` |
| `frontend/src/locales/fr.json` | MODIFY | Same keys in French |
| `frontend/src/locales/de.json` | MODIFY | Same keys in German |
| `frontend/src/locales/it.json` | MODIFY | Same keys in Italian |

**Total: 8 files (1 new, 7 modified). No router changes. No Supabase migrations.**

### Trade-offs

**localStorage vs Supabase**: localStorage is chosen for v1 because it requires no migration, works for both guest and auth users with the same code path, and aligns with the existing `tm_guest_decks` pattern. The trade-off is that ignored state does not sync across devices for authenticated users. This is acceptable for a card-tracking helper feature.

**Optimistic UI**: Because localStorage is synchronous, the toggle completes and persists in the same microtask as the reactive state update. There is no async persistence gap, so no rollback logic is needed and the 100ms performance requirement is trivially met.

---

## Implementation Process

### Execution Directive

The orchestrator MUST follow this wave order:
1. **Launch Steps 1 and 3 in parallel** (no dependencies between them)
2. **Wait for Step 1 to complete**, then launch Step 2
3. **Wait for Steps 2 and 3 to both complete**, then launch Steps 4 and 5 in parallel

### Parallelization Diagram

```
Wave 1 (parallel)        Wave 2              Wave 3 (parallel)
─────────────────        ──────              ─────────────────
Step 1 (sonnet)  ──┐
                   ├──→  Step 2 (sonnet) ──┬──→ Step 4 (sonnet)
Step 3 (haiku)   ──┘                       └──→ Step 5 (sonnet)
```

| Wave | Steps | Can Start When | Max Parallel |
|------|-------|----------------|-------------|
| 1    | 1, 3  | Immediately    | 2           |
| 2    | 2     | Step 1 done    | 1           |
| 3    | 4, 5  | Steps 1+2+3 done | 2         |

### Step 1 — Utility Module (`frontend/src/lib/deckIgnore.js`)

**Parallel with**: Step 3 (Wave 1 — no dependencies)
**Agent**: sonnet
**Model**: claude-sonnet-4-6

**Goal**: Create a standalone, SSR-safe localStorage helper that centralises all ignore persistence logic, so parent pages never touch localStorage directly.

**Subtasks**:
- Create `frontend/src/lib/deckIgnore.js` as a new file
- Implement `loadIgnoredIds(deckId)`: guards `typeof window === 'undefined'`, reads `tm_deck_ignored_{deckId}` from localStorage, parses JSON array, returns `new Set(array)`, returns empty Set on parse error or missing key
- Implement `saveIgnoredIds(deckId, set)`: guards SSR, serialises Set to JSON array, writes to `tm_deck_ignored_{deckId}`
- Implement `toggleIgnoredId(deckId, cardId)`: calls `loadIgnoredIds`, adds or deletes cardId, calls `saveIgnoredIds`, returns the updated Set (always a new Set instance — never mutates in place)
- Add JSDoc comments describing SSR guard pattern and the Vue 3 reactivity rule (always reassign, never mutate)

**Success Criteria**:
- `loadIgnoredIds('deck1')` returns an empty Set when localStorage has no entry
- `toggleIgnoredId('deck1', 42)` called twice returns an empty Set (toggle round-trip)
- `loadIgnoredIds` called in a server context (`window === undefined`) returns empty Set without throwing
- All three exports are named exports resolvable via `import { loadIgnoredIds } from '@/lib/deckIgnore'`

**Blockers / Risks**:
- None — pure utility with no external dependencies

**Size**: Small

#### Verification

**Level**: Single Judge | **Threshold**: 4.0 / 5.0

| # | Criterion | Weight | Score 1 | Score 3 | Score 5 |
|---|-----------|--------|---------|---------|---------|
| 1 | **SSR Safety** — `loadIgnoredIds` guards `typeof window === 'undefined'` and returns empty Set without throwing in a server context | 0.30 | Guard missing or throws in SSR | Guard exists but incomplete (e.g. only one function guarded) | All three exports guard SSR correctly; no window access outside the guard |
| 2 | **Toggle Round-trip Correctness** — `toggleIgnoredId` called twice with same cardId returns a Set not containing that cardId | 0.25 | Toggle does not remove on second call (add-only) | Toggle works but mutates the existing Set in place | Toggle returns a new Set instance each time and correctly adds/removes |
| 3 | **localStorage Key Convention** — key pattern is exactly `tm_deck_ignored_{deckId}` matching the spec | 0.20 | Different key pattern used | Key pattern correct but inconsistently applied across functions | All read/write operations use the exact `tm_deck_ignored_{deckId}` pattern |
| 4 | **Named Export Contract** — all three functions are named exports importable via `import { loadIgnoredIds, saveIgnoredIds, toggleIgnoredId } from '@/lib/deckIgnore'` | 0.15 | Default export only or wrong names | Some exports named correctly, one missing or misspelled | All three named exports present with exact names matching the spec |
| 5 | **Parse Error Resilience** — `loadIgnoredIds` returns empty Set when localStorage contains malformed JSON | 0.10 | Throws on parse error | Returns null/undefined instead of empty Set | Returns `new Set()` silently on any parse/access error |

---

### Step 2 — DeckSection.vue Update

**Depends on**: Step 1 (Wave 2 — after utility module exists)
**Agent**: sonnet
**Model**: claude-sonnet-4-6

**Goal**: Add the ignored visual state and the emit contract to `DeckSection.vue` so it can display and react to ignored cards without owning any persistence logic.

**Subtasks**:
- Add `ignoredIds` prop (`Object` / `Set`, default `() => new Set()`) to the props definition
- Add `isIgnored(cardId)` method that returns `ignoredIds.has(cardId)`
- Update `missingInSection` computed property to filter out cards whose id is in `ignoredIds`
- Add `ignoredInSection` computed property (count of missing cards whose id is in `ignoredIds`) for potential display use
- Add `toggle-ignore` event to `emits` declaration with `cardId: Number`
- Add ignore toggle button (eye icon: `mdi-eye-off` for missing-active, `mdi-eye` for missing-ignored) rendered only for cards in the missing state
- Add the "SKIPPED" / ignored badge visual state: opacity `0.15`, gray badge with `$t('deckIgnore.skippedBadge')` text
- Ensure owned cards show no ignore button (only missing-state cards get the toggle)
- Wire button `@click` to `$emit('toggle-ignore', card.id)`

**Success Criteria**:
- A card with its id in `ignoredIds` renders at 0.15 opacity with gray badge and `mdi-eye` icon
- A card NOT in `ignoredIds` (missing) renders at 0.35 opacity with red badge and `mdi-eye-off` icon
- Clicking the eye icon on a missing card emits `toggle-ignore` with the correct card id
- `missingInSection` count does not include ignored card ids
- Owned cards show no eye icon

**Blockers / Risks**:
- Vue 3 reactivity: parent must always reassign `ignoredIds` with a new Set for the prop change to propagate; documented in the utility module
- Risk (Low): if existing `DeckSection` slots or scoped CSS conflict with the new badge style, visual regression possible — inspect and adjust

**Size**: Medium

#### Verification

**Level**: Single Judge | **Threshold**: 4.0 / 5.0

| # | Criterion | Weight | Score 1 | Score 3 | Score 5 |
|---|-----------|--------|---------|---------|---------|
| 1 | **Visual State Accuracy** — ignored cards render at 0.15 opacity with gray badge and `mdi-eye` icon; missing-active cards render at 0.35 opacity with red badge and `mdi-eye-off` icon | 0.30 | One or both states missing or visually incorrect | One state correct but the other has wrong opacity or icon | Both states render exactly as specified with correct opacity, badge colour, and icon |
| 2 | **Emit Contract** — clicking the eye icon emits `toggle-ignore` with the correct numeric cardId; `emits` declaration includes `toggle-ignore` | 0.25 | No emit or wrong event name | Emit fires but payload is wrong type or undefined | Emit fires `toggle-ignore` with correct cardId; declared in `emits` option |
| 3 | **missingInSection Filtering** — `missingInSection` computed excludes cards whose id is in `ignoredIds` | 0.25 | `missingInSection` does not filter ignored cards at all | Filtered but uses wrong comparison (e.g. loose equality with strings) | `missingInSection` correctly filters using `ignoredIds.has(card.id)` |
| 4 | **Owned Card Guard** — owned cards display no eye icon toggle button | 0.10 | Eye icon appears on owned cards | Eye icon absent on owned cards but toggling an owned card still emits | Eye icon is conditionally rendered only for missing-state cards; owned cards are unaffected |
| 5 | **Prop Default** — `ignoredIds` prop defaults to `() => new Set()` (factory function, not a shared instance) | 0.10 | No default or default is a shared `new Set()` literal | Default exists but is not a factory function | Default is correctly `() => new Set()` preventing shared state across instances |

---

### Step 3 — i18n Keys (all 4 locale files)

**Parallel with**: Step 1 (Wave 1 — no dependencies)
**Agent**: haiku
**Model**: claude-haiku-4-5

**Goal**: Add all required translation keys for the ignore feature to every supported locale so no hardcoded English strings exist in the UI.

**Subtasks**:
- Add to `frontend/src/locales/en.json` under a `deckIgnore` namespace: `ignore`, `unignore`, `skippedBadge`, `ignoredCount`
- Add equivalent keys with French translations to `frontend/src/locales/fr.json`
- Add equivalent keys with German translations to `frontend/src/locales/de.json`
- Add equivalent keys with Italian translations to `frontend/src/locales/it.json`
- Verify the key path matches what `DeckSection.vue` uses (`$t('deckIgnore.skippedBadge')` etc.)

**Key values (reference)**:
- `en`: ignore → "Ignore", unignore → "Unignore", skippedBadge → "SKIPPED", ignoredCount → "{n} ignored"
- `fr`: ignore → "Ignorer", unignore → "Rétablir", skippedBadge → "IGNORÉ", ignoredCount → "{n} ignorée(s)"
- `de`: ignore → "Ignorieren", unignore → "Wiederherstellen", skippedBadge → "IGNORIERT", ignoredCount → "{n} ignoriert"
- `it`: ignore → "Ignora", unignore → "Ripristina", skippedBadge → "IGNORATO", ignoredCount → "{n} ignorata/e"

**Success Criteria**:
- All 4 locale files contain `deckIgnore.ignore`, `deckIgnore.unignore`, `deckIgnore.skippedBadge`, `deckIgnore.ignoredCount`
- No key is missing in any locale (no fallback to English in fr/de/it renders)
- JSON files remain valid (no trailing commas, correct nesting)

**Blockers / Risks**:
- None — pure data, no runtime dependencies
- Risk (Low): JSON syntax error would break all i18n globally — validate JSON after editing

**Size**: Small

#### Verification

**Level**: Per-Item | **Threshold**: 3.5 / 5.0

Each locale file is evaluated independently. All 4 must meet the threshold.

| # | Criterion | Weight | Score 1 | Score 3 | Score 5 |
|---|-----------|--------|---------|---------|---------|
| 1 | **Key Completeness** — all 4 keys (`deckIgnore.ignore`, `deckIgnore.unignore`, `deckIgnore.skippedBadge`, `deckIgnore.ignoredCount`) are present in the locale file | 0.40 | 2 or more keys missing | 1 key missing | All 4 keys present under `deckIgnore` namespace |
| 2 | **Translation Quality** — values are locale-appropriate translations, not English placeholders | 0.35 | Values are empty strings or copied English | Values are present but awkward or machine-translated literally | Values are idiomatic translations matching the reference values in the spec |
| 3 | **JSON Validity** — file remains valid JSON after modification (no trailing commas, correct nesting) | 0.25 | File has syntax errors (invalid JSON) | File is valid JSON but `deckIgnore` object is incorrectly nested | File is valid JSON and `deckIgnore` object is correctly placed at the top level |

---

### Step 4 — DeckDetailPage.vue Integration

**Parallel with**: Step 5 (Wave 3 — after Steps 1, 2, 3)
**Depends on**: Steps 1, 2, 3
**Agent**: sonnet
**Model**: claude-sonnet-4-6

**Goal**: Wire `ignoredIds` reactive state, load from localStorage on mount, handle the toggle event, and filter the wishlist insert in `DeckDetailPage.vue`.

**Subtasks**:
- Import `loadIgnoredIds`, `toggleIgnoredId` from `@/lib/deckIgnore`
- Add `ignoredIds: new Set()` to the `data()` return
- In `loadDeck()` (called from `mounted()`), after deck data is loaded, call `this.ignoredIds = loadIgnoredIds(deckId)` — ensures SSR safety since `mounted` only runs on client
- Add `onToggleIgnore(cardId)` method: calls `toggleIgnoredId(this.deck.id, cardId)`, reassigns `this.ignoredIds = new Set(result)` to trigger reactivity
- Update `stats.missing` computed / calculation to subtract ignored cards: filter `stats.missingEntries` by `!this.ignoredIds.has(card.id)`
- Update `stats.missingEntries` similarly so the wishlist insert action naturally skips ignored cards
- Pass `:ignored-ids="ignoredIds"` and `@toggle-ignore="onToggleIgnore"` to every `<DeckSection>` instance in the template
- Verify "Add missing to wishlist" logic consumes `stats.missingEntries` (already filtered) — no additional change needed if so

**Success Criteria**:
- After page load, a previously ignored card renders as ignored in DeckDetailPage
- Clicking the eye icon on a missing card calls `onToggleIgnore` and the UI updates without page reload
- Clicking the eye icon on an ignored card reverts it to missing state
- The missing count in the page header decrements when a card is ignored
- "Add missing to wishlist" does not insert ignored cards

**Blockers / Risks**:
- Blocker: Steps 1 and 2 must be complete before this step can be tested end-to-end
- Risk (Medium): `loadDeck()` may be called before `mounted` in SSR context — confirm it is only invoked from `mounted()` or add an explicit SSR guard
- Risk (Low): If `deck.id` is a string UUID vs integer, ensure `loadIgnoredIds` key generation handles both consistently

**Size**: Medium

#### Verification

**Level**: Panel of 2 | **Threshold**: 4.5 / 5.0

Two independent judges evaluate; the mean score must meet or exceed 4.5.

| # | Criterion | Weight | Score 1 | Score 3 | Score 5 |
|---|-----------|--------|---------|---------|---------|
| 1 | **Persistence on Mount** — `loadIgnoredIds(deckId)` is called inside `loadDeck()` / `mounted()` and `this.ignoredIds` is assigned the result; no SSR-unsafe call in `setup()` or `onServerPrefetch()` | 0.25 | `loadIgnoredIds` not called on mount, or called in SSR-unsafe context | Called on mount but assigned to a local variable not wired to `data()` | Called in `loadDeck()` from `mounted()` and correctly assigned to `this.ignoredIds` |
| 2 | **Toggle Reactivity** — `onToggleIgnore` reassigns `this.ignoredIds = new Set(result)` (new instance) so Vue 3 detects the change | 0.25 | In-place mutation of existing Set (no reactivity trigger) | New Set created but not from the result of `toggleIgnoredId` | `toggleIgnoredId` result is wrapped in `new Set()` and reassigned to `this.ignoredIds` |
| 3 | **Wishlist Filter** — "Add missing to wishlist" action only inserts cards from `stats.missingEntries` which already excludes ignored cards; no ignored card is inserted | 0.20 | Wishlist insert iterates all missing cards including ignored | Wishlist skips ignored cards but only via an ad-hoc filter at insert time (not via `missingEntries`) | `stats.missingEntries` is filtered to exclude ignored ids and the wishlist action uses it unchanged |
| 4 | **Missing Count Consistency** — `stats.missing` count displayed in the page header decrements when a card is ignored and increments when unignored | 0.20 | Missing count does not update on toggle | Count updates but only after page reload | Count updates immediately (optimistically) on toggle without page reload |
| 5 | **Prop/Event Wiring** — every `<DeckSection>` instance in the template receives `:ignored-ids="ignoredIds"` and `@toggle-ignore="onToggleIgnore"` | 0.10 | Prop and event missing from one or more DeckSection instances | Prop wired but event handler missing, or vice versa | Both prop and event wired to all DeckSection instances in the template |

---

### Step 5 — DecksPage.vue Integration

**Parallel with**: Step 4 (Wave 3 — after Steps 1, 2, 3)
**Depends on**: Steps 1, 2, 3
**Agent**: sonnet
**Model**: claude-sonnet-4-6

**Goal**: Apply the same `ignoredIds` wiring to each deck's accordion panel in `DecksPage.vue`, where multiple decks are rendered simultaneously.

**Subtasks**:
- Import `loadIgnoredIds`, `toggleIgnoredId` from `@/lib/deckIgnore`
- Add `ignoredByDeck: {}` (plain object keyed by deckId) to `data()` — each value is a `Set<number>`
- After decks are loaded (in `mounted()` or the deck-loading callback), iterate each deck and populate `ignoredByDeck[deck.id] = loadIgnoredIds(deck.id)`
- Add `onToggleDeckIgnore(deckId, cardId)` method: calls `toggleIgnoredId(deckId, cardId)`, reassigns `this.ignoredByDeck = { ...this.ignoredByDeck, [deckId]: new Set(result) }` (spread to trigger Vue reactivity on the parent object)
- Update `computeStats(deck)` or equivalent to accept `ignoredIds` from `ignoredByDeck[deck.id]` when calculating `missing` and `missingEntries`
- Pass `:ignored-ids="ignoredByDeck[deck.id] || new Set()"` and `@toggle-ignore="onToggleDeckIgnore(deck.id, $event)"` to each `<DeckSection>` in the accordion template
- Ensure per-deck isolation: `ignoredByDeck` is keyed by deckId so changes to one deck do not affect others

**Success Criteria**:
- Opening the DecksPage accordion for a deck shows previously ignored cards as ignored
- Toggling ignore on a card in one deck's accordion does not change any other deck's display
- Missing counts in the deck accordion headers reflect ignored exclusions
- "Add missing to wishlist" inside each accordion skips ignored cards for that deck

**Blockers / Risks**:
- Blocker: Steps 1 and 2 must be complete; Step 4 should be done first for pattern consistency
- Risk (Medium): If `DecksPage` loads deck data asynchronously after mount, `loadIgnoredIds` calls must be deferred to the data-ready callback — check the existing loading lifecycle
- Risk (Low): Vue reactivity on a plain object property requires spreading the parent object on reassignment — the pattern above (`{ ...this.ignoredByDeck, [deckId]: ... }`) handles this

**Size**: Medium

#### Verification

**Level**: Single Judge | **Threshold**: 4.0 / 5.0

| # | Criterion | Weight | Score 1 | Score 3 | Score 5 |
|---|-----------|--------|---------|---------|---------|
| 1 | **Per-Deck Isolation** — `ignoredByDeck` is keyed by deckId so ignoring a card in deck A does not affect deck B's display | 0.30 | Shared ignore state across all decks (single Set) | Separate Sets per deck but reactivity spread not used (silent failure) | `ignoredByDeck` is a plain object keyed by deckId; spread reassignment triggers reactivity; changes to one deck do not affect others |
| 2 | **Multi-Deck Load on Mount** — `loadIgnoredIds` is called for each deck after decks are loaded, populating `ignoredByDeck[deck.id]` | 0.25 | `loadIgnoredIds` not called at all, or called before decks are available | Called in wrong lifecycle (e.g. `created()`) bypassing SSR guard | Called in `mounted()` or the deck-loaded callback, iterating all decks and assigning to `ignoredByDeck` |
| 3 | **Toggle Handler Scoping** — `onToggleDeckIgnore(deckId, cardId)` correctly targets the specific deck and reassigns `this.ignoredByDeck` with spread | 0.25 | Handler does not accept deckId, or mutates Set in place | Spread used but `new Set()` not used for the value | Handler uses `{ ...this.ignoredByDeck, [deckId]: new Set(result) }` to update reactively |
| 4 | **Prop/Event Wiring in Accordion** — each `<DeckSection>` in the accordion template receives `:ignored-ids="ignoredByDeck[deck.id] || new Set()"` and `@toggle-ignore="onToggleDeckIgnore(deck.id, $event)"` | 0.20 | Prop and event not wired in accordion template | Prop wired but `$event` forwarding missing, causing handler to lose cardId | Both prop with fallback and event forwarding correctly wired to all accordion DeckSection instances |

---

## Verification Summary

| Step | Artifact | Level | Threshold |
|------|----------|-------|-----------|
| 1 | `frontend/src/lib/deckIgnore.js` — SSR-safe localStorage utility | Single Judge | 4.0 / 5.0 |
| 2 | `frontend/src/components/DeckSection.vue` — ignored prop, emit, visual states | Single Judge | 4.0 / 5.0 |
| 3 | `frontend/src/locales/{en,fr,de,it}.json` — i18n keys (4 items) | Per-Item (×4) | 3.5 / 5.0 |
| 4 | `frontend/src/components/Pages/DeckDetailPage.vue` — state wiring + wishlist filter | Panel of 2 | 4.5 / 5.0 |
| 5 | `frontend/src/components/Pages/DecksPage.vue` — per-deck state wiring | Single Judge | 4.0 / 5.0 |

---

## Implementation Summary

| Step | Description | Size | Files |
|---|---|---|---|
| 1 | Utility module — SSR-safe localStorage helpers | Small | `frontend/src/lib/deckIgnore.js` (CREATE) |
| 2 | DeckSection.vue — ignored prop, emit, visual states | Medium | `frontend/src/components/DeckSection.vue` |
| 3 | i18n keys — all 4 locale files | Small | `frontend/src/locales/en.json`, `fr.json`, `de.json`, `it.json` |
| 4 | DeckDetailPage.vue — state wiring + wishlist filter | Medium | `frontend/src/components/Pages/DeckDetailPage.vue` |
| 5 | DecksPage.vue — per-deck state wiring | Medium | `frontend/src/components/Pages/DecksPage.vue` |

**Total: 5 steps, 8 files (1 new, 7 modified)**

---

## Definition of Done

- [ ] `frontend/src/lib/deckIgnore.js` created with `loadIgnoredIds`, `saveIgnoredIds`, `toggleIgnoredId` — all SSR-safe
- [ ] `DeckSection.vue` accepts `ignoredIds` prop, emits `toggle-ignore`, renders ignored visual state (gray badge, 0.15 opacity, eye icon)
- [ ] `missingInSection` computed excludes ignored card ids
- [ ] i18n keys (`deckIgnore.ignore`, `deckIgnore.unignore`, `deckIgnore.skippedBadge`, `deckIgnore.ignoredCount`) present in all 4 locale files
- [ ] `DeckDetailPage.vue` loads ignored state on mount, handles toggle, persists on toggle, passes prop/event to DeckSection
- [ ] `DecksPage.vue` loads ignored state per deck on mount, handles per-deck toggle, persists, passes prop/event to each DeckSection
- [ ] Missing count in both pages excludes ignored cards
- [ ] "Add missing to wishlist" in both pages skips ignored cards
- [ ] Per-deck isolation verified: ignoring in deck A does not affect deck B
- [ ] Toggle round-trip works: ignore → unignore restores missing state and count
- [ ] State persists across page reload for both guest and auth users (localStorage)
- [ ] No hardcoded English strings in ignored badge — uses `$t('deckIgnore.skippedBadge')`
- [ ] All 4 locale JSON files are valid JSON after modification
- [ ] No SSR errors: `loadIgnoredIds` never called outside `mounted()` context
