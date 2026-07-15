# Decks — Dedicated Page with Completion Bar and Richer Data

**Type:** feature
**Status:** draft

## User Request

> "I would like a dedicated page for decks with a completion bar etc and more data"

## Description

The app already has dedicated deck pages: `DecksPage.vue` (deck list) and `DeckDetailPage.vue` (single deck). Today, deck completion against the user's collection is only ever shown as a plain text string (for example "40 cards · 25 owned · 15 missing"), and there is no visual progress indicator anywhere in the decks area. This feature turns that text into a visual completion bar and adds a richer-data block, so a collector can tell at a glance how close they are to building a deck from their own collection and what the deck is made of.

Why this matters: 0nefor.one is a free Yu-Gi-Oh! card-trading platform, and the deck completion view is the hook that converts passive deck storage into active sourcing and trading intent ("I'm 62% complete, I still need these cards" drives wishlist adds, which drive trade proposals — the core loop of the product). It also increases session depth and repeat visits as collectors track progress over time.

Who benefits: logged-in collectors see real completion against their collection and are prompted toward sourcing missing cards; guest users (no collection) still see deck composition and estimated value, with completion reading as 0% owned.

Key constraints: all required data is already fetched once per deck by `resolveStats()` (DeckDetailPage) and `computeStats()` / `deckStats[deckId]` (DecksPage) — the bar and richer-data breakdowns MUST be derived as computed values over that existing `stats` object, with NO new card or ownership fetch. All colors come from CSS theme variables (never hardcoded), all new copy is added to the 4 locales (en/fr/de/it) with no em dashes, and any new reactive `Set` state must be reassigned rather than mutated (Vue 3 reactivity).

One genuine open product decision remains: how "SOURCED" (ignored) cards affect the completion percentage. The rest of the deck UI already treats SOURCED cards as resolved (excluded from the missing count, from `missingEntries`, and from the bulk "add missing to wishlist" action; their badge reads "SOURCED"). The completion bar is a three-segment bar (owned / sourced / missing) with the headline percentage computed as (owned + sourced)/total, so a collector who has deliberately sourced missing cards sees that progress reflected in the headline; the owned segment's value still matches the existing text summary's owned number, and the sourced segment is shown distinctly so a "practically complete" state is clearly visible.

**Scope**:

- Included:
  - A visual completion bar on `DeckDetailPage.vue`, derived from the existing `stats` object (no new fetch).
  - A compact completion bar on each deck card in the `DecksPage.vue` list view, derived from existing per-deck `deckStats`.
  - A richer-data block on the detail page: card-type breakdown (counts by frame type / monster-spell-trap) and an estimated deck value (cardmarket EUR, approximate).
  - An explicit, consistent rule for how SOURCED/ignored cards are represented in the bar and percentage (adds `sourcedCount` to `stats`).
  - New i18n keys added to all 4 locale files with no em dashes.
- Excluded:
  - New routes or new page components (the dedicated pages already exist).
  - Any change to YDK deck import mechanics.
  - Any change to the trading / proposal flow or the "add to wishlist" logic itself.
  - Per-set collection progress (tracked separately as set-collection-progress).
  - Price history / trend, deck sharing / snapshot export, and banlist/legality checks.
  - Any new Supabase query, new API call, or schema change.

**User Scenarios**:

1. **Primary Flow**: A logged-in collector opens a saved deck; stats resolve once (existing behavior); a completion bar renders with owned / sourced / missing segments and a "62% complete" headline, alongside a card-type breakdown and estimated value; the collector adds the still-missing cards to their wishlist.
2. **Alternative Flow (deck list)**: A collector with several decks opens the deck list and sees a compact completion bar plus percentage on each deck card, letting them compare progress across decks at a glance.
3. **Alternative Flow (guest)**: A guest with no collection views a deck; the bar shows 0% owned while the card-type breakdown and estimated value still render.
4. **Alternative Flow (SOURCED toggle)**: A user marks a missing card as SOURCED; the missing segment shrinks, the sourced segment grows, and the headline percentage is unchanged — all reactively, with no refetch.
5. **Error Handling**: An empty deck (total = 0) shows 0% with no divide-by-zero or NaN; a card with an empty `card_prices` array contributes 0 to estimated value without breaking the total; a deck of only unrecognized cards renders at 0% without crashing; if the existing stats fetch fails, the existing error snackbar path is used and the bar/breakdown simply do not render.

---

## Acceptance Criteria

### Functional Requirements

- [x] **Completion bar on detail page**: A visual completion bar is shown on `DeckDetailPage.vue`, derived only from the already-resolved `stats`.
  - Given: a logged-in user views a deck with total 40, owned 25
  - When: the deck detail page finishes resolving stats
  - Then: a completion bar and a "62% complete" headline are shown, and no additional card/ownership fetch (e.g. `getCardsByIds`) is triggered to render them

- [x] **SOURCED shown consistently**: SOURCED (ignored) cards are represented as a visually distinct third bar segment, and the headline percentage equals (owned + sourced)/total.
  - Given: a deck with 25 owned, 5 sourced, and 10 still-missing cards
  - When: the completion bar renders
  - Then: three visually distinct segments (owned / sourced / missing) are shown and the headline reads "75% complete" (30 of 40)

- [x] **`sourcedCount` in stats (both pages)**: The stats object exposes a qty-summed count of SOURCED cards, computed identically in the detail page and the list page.
  - Given: a deck with N SOURCED cards (summed by quantity)
  - When: `resolveStats()` (detail) and `computeStats()` (list) run
  - Then: `stats.sourcedCount` / `deckStats[deckId].sourcedCount` equals N in both

- [x] **Compact bar in list view**: Each deck card in the list shows a compact completion bar and percentage.
  - Given: a user with two or more saved decks
  - When: the decks list renders and per-deck stats resolve
  - Then: each deck card shows a compact completion bar plus percentage sourced from its `deckStats`

- [x] **Card-type breakdown**: The detail page shows a breakdown of card types derived from the existing `cardMap`.
  - Given: a deck containing monsters, spells, and traps
  - When: the richer-data block renders
  - Then: counts per frame-type / category are shown and sum to (total minus unrecognized), with no new fetch

- [x] **Estimated deck value with price guard**: The detail page shows an approximate deck value that safely handles missing prices.
  - Given: a deck that includes at least one card with an empty `card_prices` array
  - When: the estimated value renders
  - Then: value equals the sum of `cardmarket_price × qty`, treating missing/NaN prices as 0, with no NaN in the output, and is labeled as approximate

- [x] **Divide-by-zero guard**: An empty deck does not break the bar.
  - Given: a deck with total = 0
  - When: the completion bar renders
  - Then: it shows 0% with no error and no NaN

- [x] **Reactive on SOURCED toggle**: The bar reflects SOURCED changes without a refetch.
  - Given: a deck detail page with the completion bar visible
  - When: the user toggles a missing card to SOURCED (existing action)
  - Then: the missing segment shrinks, the sourced segment grows, the headline percentage is unchanged, and no card/ownership refetch occurs

- [x] **Bar and text agree**: The bar's owned figure matches the existing text summary.
  - Given: any deck
  - When: comparing the completion bar's owned value to the existing summary's owned value
  - Then: they are identical

- [x] **4-locale parity, no em dashes**: All new user-facing strings exist in every locale with no em dashes.
  - Given: any new i18n key added for this feature
  - When: inspecting `en.json`, `fr.json`, `de.json`, `it.json`
  - Then: the key is present in all four and its value contains no em dash character

### Non-Functional Requirements

- [x] **Performance**: No additional network request is introduced; the bar, type breakdown, and estimated value are synchronous computed values over the in-memory `stats` (verifiable via network panel: only the existing per-deck resolve fires).
- [x] **Accessibility**: The completion bar has an aria-label conveying owned/total/percentage, and completion is not communicated by color alone (the numeric percentage is always present).
- [x] **Theming**: All bar and breakdown colors use CSS theme variables and render correctly in both light and dark themes.
- [x] **Compatibility**: Any new reactive `Set` state is reassigned (not mutated in place) to satisfy Vue 3 reactivity; all Supabase/localStorage reads stay in `mounted()`.

### Open Questions

- [x] **Completion % semantics for SOURCED**: Resolved per KD-1 (Architecture Overview, Key Decisions): the headline percentage is `(owned + sourced)/total` ("practically complete"), with SOURCED shown as a distinct third bar segment. Strict `owned/total` was considered and rejected, since it would understate progress for a collector who has deliberately marked cards as sourced.
- [ ] **Richer-data scope for v1**: Confirm whether card-type breakdown + estimated deck value are sufficient for the first version, or whether another field (e.g. rarity mix, banlist legality) is a must-have now.

### Definition of Done

- [ ] All acceptance criteria pass
- [ ] Tests written and passing
- [ ] i18n keys added and verified across en/fr/de/it (no em dashes)
- [ ] Code reviewed

## Skill Reference

See `.claude/skills/deck-management/SKILL.md` § 9 "Deck Completion Bar & Richer Deck Data" for implementation patterns: reusing the existing `stats`/`deckStats` owned-total computation (no new fetch needed), the completion-bar computed + `v-progress-linear` pattern, an open product question on whether ignored/SOURCED cards should count toward completion %, richer-data breakdown computeds (card type, estimated price) sourced from the already-fetched `cardMap`, i18n key placement, and pitfalls (duplicate fetches, realtime resync, `card_prices` guards, Set reactivity). Also see `.claude/skills/collection-progress/SKILL.md` (design reference for the analogous, not-yet-built `SetPage.vue` progress bar) and `.claude/skills/deck-card-ignore/SKILL.md` (ignoredIds semantics).

---

## Architecture Overview

> Synthesized from the Skill (`.claude/skills/deck-management/SKILL.md` § 9), the impact analysis (`.specs/analysis/analysis-deck-completion-page.md`), and the business acceptance criteria above. Architect scratchpad: `.specs/scratchpad/c149a67d.md`.

### Solution Strategy

This is a **frontend-only, additive Vue 3 (Options API) feature** with no new route, no new Supabase query, and no schema change. The two dedicated pages already exist and already fetch everything needed exactly once per deck:

- `DeckDetailPage.vue` builds a `stats` object in `resolveStats()` (initial load, realtime `Card`-table resync, and the `onToggleIgnore()` optimistic path).
- `DecksPage.vue` builds the same shape into `deckStats[deckId]` in `computeStats()` (plus its `onToggleDeckIgnore()` optimistic path).

The strategy is therefore to **derive** the completion bar, the type breakdown, and the estimated value as pure functions over the already-in-memory `stats.cardMap` / `stats.main|extra|side` / `ownedIds` / `ignoredIds`, surface them through thin component `computed`s, and render them with two new presentational SFCs. Because every derived value is a `computed` over `stats`, the existing realtime-resync and ignore-toggle wiring keeps the bar consistent for free, with the one exception of the new `sourcedCount` field, which is *stored* on `stats` and so must be recomputed everywhere `missing` already is (see State & Reactivity).

The derivations are extracted into a **pure `lib/deckStats.js` module** so the divide-by-zero, empty-`card_prices`, and all-unrecognized edge cases can be covered by fast vitest unit tests instead of mounted-component tests, mirroring the existing `bulkAddResolver.js` / `bulkAddResolver.test.js` split.

### Key Decisions

**KD-1 — SOURCED cards: three-segment bar, and they count toward the headline %.**
The completion bar renders **three visually distinct segments** (owned / sourced / missing) and the headline percentage is `(owned + sourced) / total`, *not* strict `owned / total`.

- *Reasoning*: the `deckIgnore` feature's entire semantic is "not missing" — a SOURCED card is already excluded from `stats.missing`, from `missingEntries`, and from the wishlist bulk-add. Counting it *against* the completion headline would contradict that established meaning. This choice also makes the number and the bar agree: the **filled** portion of the bar (owned segment + sourced segment) equals the headline %, and the missing segment is the unfilled remainder. Under strict `owned/total`, the headline would match only the owned sub-segment and not the whole filled bar, which is less intuitive.
- *Consistency preserved*: AC "Bar and text agree" still holds because the **owned segment's** value equals the existing text summary's owned number; only the headline %'s numerator gains `sourced`. The three distinct colours keep the true-owned count visible, so a collector is never misled into thinking sourced == owned.
- *Trade-off / downstream action*: this **reverses the current wording** of AC "SOURCED shown consistently" (which specifies headline `= owned/total`, e.g. "62% complete (25 of 40)") and the Description paragraph's "strict owned/total" line. Those must be realigned during decomposition/verification to `(owned + sourced)/total` (the AC's 25 owned + 5 sourced + 10 missing example becomes **75% (30 of 40)**). This resolves the "Completion % semantics for SOURCED" Open Question. The alternative (strict `owned/total`) was rejected: it understates progress for a collector who has deliberately marked cards as sourced, defeating the purpose of the ignore feature.

**KD-2 — Denominator and rounding.**
The denominator is the **existing `stats.total`** (a qty-sum of *all* entries, including unrecognized) — no new denominator is introduced, which is what keeps the owned segment matching the text summary. Unrecognized cards fall into the unfilled/missing portion of the bar for v1 (no fourth segment). The headline percentage uses **`Math.round`**: `pct = total > 0 ? Math.round(((owned + sourced) / total) * 100) : 0` — matching the SKILL.md snippet and giving the divide-by-zero / empty-deck guard (`total === 0 → 0`, no NaN). Note `Math.round(62.5) → 63`; the "62%" figures in the prose above were approximations and should not be read as a truncation requirement.

**KD-3 — Extract derivations into a pure `lib/deckStats.js`, test with vitest.**
Rather than inlining reduce-loops into each page, the four derivations live in `frontend/src/lib/deckStats.js` as pure functions and are unit-tested in `frontend/src/lib/deckStats.test.js`, following the `bulkAddResolver.test.js` pattern (vitest `describe`/`it`/`expect`, deterministic fixtures, no Vue mount). Component `computed`s become one-line wrappers. This satisfies the Definition of Done's "tests written and passing" for the guard cases (empty deck, empty `card_prices`, all-unrecognized) without the cost of mounting a page.

**KD-4 — Presentational SFCs own no data.**
`DeckCompletionBar.vue` and `DeckStatsBreakdown.vue` are pure props-in components in `components/library/` (same convention as `DeckSection.vue`); the parent pages remain the sole data owners. The completion bar's props are `{ owned, sourced, total }` — deliberately `sourced` (not the analysis's `ignored`) so one vocabulary (`sourcedCount` field ↔ `sourced` prop ↔ "SOURCED" badge copy) runs end-to-end.

### Component Design

- **`DeckCompletionBar.vue`** (new, `components/library/`). Props `{ owned: Number, sourced: Number (default 0), total: Number }`. Renders a single segmented bar — owned segment (`var(--c-accent)`), sourced segment (a muted/secondary theme var, e.g. `var(--c-surface-2)` tint distinct from the track), missing = remaining track — plus a `{owned} / {total} ({pct}%)` label and an `aria-label` conveying owned/total/pct (completion never communicated by colour alone; the numeric % is always present). All colours from CSS theme vars; verified in light and dark. Style precedent: `BulkAddCards.vue` `v-progress-linear` (`height="8" rounded`). Used by both pages (compact variant for the list rows).
- **`DeckStatsBreakdown.vue`** (new, `components/library/`, detail page only). Props `{ entries, cardMap, missingEntries }`. Renders the card-type breakdown (Monster/Spell/Trap, optionally extra-deck subtypes, qty-weighted) and the estimated value, reusing `lib/cardIcons.js` helpers (`isSpellTrap`, etc.) for chips. Kept off the dense `DecksPage` list rows per the analysis risk register (compact bar only in the list).

### State & Reactivity

- **`sourcedCount` is the one new stored field** (AC requires `stats.sourcedCount` / `deckStats[deckId].sourcedCount`). Definition, symmetric to the existing `missing` computation and qty-summed:
  `allEntries.filter(c => cardMap[c.id] && !ownedIds.has(c.id) && ignoredIds.has(c.id)).reduce((s,c)=>s+c.qty,0)`.
  It must be set in **four** places (everywhere `missing` is already computed): DeckDetailPage `resolveStats()` and the `onToggleIgnore()` optimistic block; DecksPage `computeStats()` and the `onToggleDeckIgnore()` optimistic block. Everything else (`completionPct`, `typeBreakdown`, `estimatedValue`) is a `computed`/pure-fn derivation and needs no extra wiring.
- **No second fetch.** All values derive from the already-loaded `cardMap`/`ownedIds`; introducing a parallel fetch is the explicit anti-pattern called out in the skill.
- **Set reactivity.** No new reactive `Set` is required (the bar reads the existing `ignoredIds`/`ignoredByDeck` Sets, which the ignore feature already reassigns rather than mutates). Any new Set state added must follow the reassign-not-mutate rule.
- **`card_prices` guard.** `computeEstimatedValue` treats `"0.00"` / falsy / `NaN` `cardmarket_price` as `0` (the same normalization as `CardPage.vue`), and guards `card?.card_prices?.[0]` so an empty array contributes 0 without breaking the total; the value is labeled approximate.

### Expected Changes

**Create (4)**

| File | Purpose |
|------|---------|
| `frontend/src/lib/deckStats.js` | Pure derivations: `computeSourcedCount(entries, cardMap, ownedIds, ignoredIds)`, `computeCompletionPct({ owned, sourced, total })` (Math.round + `total===0` guard), `computeTypeBreakdown(entries, cardMap)`, `computeEstimatedValue(entries, cardMap)`. No Vue/Supabase imports. |
| `frontend/src/lib/deckStats.test.js` | Vitest unit tests mirroring `bulkAddResolver.test.js`; cover empty deck (0%, no NaN), empty `card_prices`, all-unrecognized, and the SOURCED-in-headline math. |
| `frontend/src/components/library/DeckCompletionBar.vue` | Presentational three-segment bar (owned/sourced/missing) + label + aria-label; props `{ owned, sourced, total }`; theme-var colours; compact variant for list rows. |
| `frontend/src/components/library/DeckStatsBreakdown.vue` | Presentational richer-data panel (type breakdown + estimated value); props `{ entries, cardMap, missingEntries }`; detail page only. |

**Modify (6)**

| File | Change |
|------|--------|
| `frontend/src/components/Pages/App/DeckDetailPage.vue` | Add `sourcedCount` to `stats` in `resolveStats()` and the `onToggleIgnore()` optimistic block; add `completionPct` (+ breakdown) `computed`s via `deckStats.js`; render `<DeckCompletionBar>` after the `<h1>` (alongside/replacing the `deckDetail.summary` line) and `<DeckStatsBreakdown>` near the wishlist block, gated on `!loadingStats`. |
| `frontend/src/components/Pages/App/DecksPage.vue` | Add `sourcedCount` to `deckStats[deck.id]` in `computeStats()` and the `onToggleDeckIgnore()` optimistic block (~l.616-628); render a compact `<DeckCompletionBar>` in the panel-title stats line (~l.184-198). |
| `frontend/src/locales/en.json` | New keys under `deckDetail.*` (e.g. `completionPct`, `completionAria`, `typeBreakdown`, `estimatedValue`, sourced-segment/price-unavailable labels). No em dashes. |
| `frontend/src/locales/fr.json` | Same keys, French. No em dashes. |
| `frontend/src/locales/de.json` | Same keys, German. No em dashes. |
| `frontend/src/locales/it.json` | Same keys, Italian. No em dashes. |

**Confirmed no change**: `frontend/src/router/index.js`, `frontend/vite.config.js` (deck routes already excluded from `ssgOptions.includedRoutes`), `frontend/src/components/library/DeckSection.vue`, `frontend/src/lib/deckIgnore.js`, `frontend/src/api.js`, and the Supabase schema (`sourcedCount`, `completionPct`, and price totals are all derived client-side).

### Key Risks

1. **`sourcedCount` drift on toggle.** If it is added to `resolveStats()`/`computeStats()` but *not* to the two optimistic ignore-toggle blocks, the bar's sourced segment goes stale after a toggle until the next realtime resync. Mitigation: update `sourcedCount` in the same block that already recomputes `missing`/`missingEntries` (all four sites listed above).
2. **AC realignment.** KD-1 supersedes the current wording of AC "SOURCED shown consistently" and the Description's "strict owned/total" line; leaving them unchanged would make the spec self-contradictory. Mitigation: realign both to `(owned + sourced)/total` during decomposition, and mark the "Completion % semantics" Open Question resolved.
3. **Price data sparsity.** `card_prices` is often empty/zero for reprints; a naive `parseFloat` yields `NaN` and poisons the total. Mitigation: the `computeEstimatedValue` guard (KD/State above), unit-tested, and an "approximate"/"price unavailable" label rather than a silent `0.00`.
4. **i18n parity.** New keys landing in only some locales is the recurring deck-* risk; `$t` falls back silently (`missingWarn: false`) so a miss is a UX gap, not a crash. Mitigation: identical key sets in all four files in the same change, verified for the no-em-dash rule.

---

## Implementation Process

> Derived from the Architecture Overview above. Phases run Setup → Foundational → User Stories → Polish. Every value is a `computed`/pure-fn derivation over the already-in-memory `stats`; there is **no new fetch, route, or schema change** anywhere in this plan.

```
Parallelization Diagram   (every step = one general-purpose sub-agent; model in [ ])
══════════════════════════════════════════════════════════════════════════════════

Wave 0 (spec realignment; independent, edits the spec only)
┌──────────────────────────────┐
│  Step 1  Spec realignment     │
│  (AC + Description ↔ KD-1)     │  general-purpose [sonnet]
└──────────────────────────────┘

Wave 1 (5-wide — MUST dispatch all five in parallel, one sub-agent each)
  Contract-first: fn signatures (Step 2 output) + i18n key list (B4 freeze) are fixed
  in this spec, so tests/SFCs are built against the contract concurrently.
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ Step 2        │ │ Step 3        │ │ Step 4        │ │ Step 5        │ │ Step 6        │
│ deckStats.js  │ │ deckStats     │ │ i18n keys     │ │ CompletionBar │ │ StatsBreakdown│
│ (pure fns)    │ │ .test.js      │ │ (4 locales)   │ │ .vue          │ │ .vue          │
│ gp [opus]     │ │ gp [opus]     │ │ gp [sonnet]   │ │ gp [sonnet]   │ │ gp [sonnet]   │
└───────┬───────┘ └───────────────┘ └───────┬───────┘ └───────┬───────┘ └───────┬───────┘
        │  (contract)                        │  (keys)          │                 │
        └───────────────┬───────────────────┴──────────────────┴────────┬────────┘
                        │                                                │
Wave 2 (2-wide — MUST dispatch both in parallel, one sub-agent each)     │
        ┌──────────────────┐  ┌──────────────────┐                       │
        │ Step 7 (CRITICAL)│  │ Step 8           │                       │
        │ DeckDetailPage   │  │ DecksPage        │                       │
        │ wiring gp [opus] │  │ wiring gp[sonnet]│                       │
        └────────┬─────────┘  └────────┬─────────┘                       │
                 └──────────┬──────────┘◀──────────────────────────────── (Step 6 → 7)
                            │
Wave 3                      ▼
                 ┌──────────────────────┐
                 │ Step 9  Polish:       │  general-purpose [sonnet]
                 │ a11y / theme / parity │
                 │ / e2e verify          │
                 └──────────────────────┘

Deps:
- Step 3 is authored against Step 2's frozen signatures; re-run after Step 2 merges.
- Step 5 needs Step 4 (label/aria keys). Step 6 needs Step 2 (fns) + Step 4 (keys).
- Step 7 needs Steps 2 (fns), 4 (keys), 5 (bar), 6 (breakdown).
- Step 8 needs Steps 2 (fns), 4 (keys), 5 (bar).
- Step 9 needs Steps 3 (tests green), 7 + 8.
- Step 1 is spec-only; it gates verification correctness, not compilation.

Waves (dispatch units): W0={1} · W1={2,3,4,5,6} · W2={7,8} · W3={9}
Max parallelization depth: 5 (Wave 1).
Critical path: Step 2 → Step 7 → Step 9.
```

### Phase: Setup

### Step 1: Realign SOURCED acceptance criterion + Description to KD-1 — Wave 0 [general-purpose · sonnet] [DONE]
- **Agent**: general-purpose (model: sonnet)
- **Wave**: 0 (do first; independent, edits this spec file only)
- **Depends on**: nothing
- **Blocks**: correctness of Step 7/8 headline behavior and Step 9 sign-off (not compilation)
- **Parallel with**: may run alongside all of Wave 1 (no code coupling); land it before Step 9 verification

- **Goal**: Make the spec and the architecture agree. KD-1 settled the headline percentage as `(owned + sourced) / total` with a three-segment bar; the current AC "SOURCED shown consistently" and the Description still say strict `owned/total` with a 62% example. Leaving them is a self-contradictory spec (Risk R2).
- **Expected output** (edits to `.specs/tasks/draft/deck-completion-page.feature.md`):
  - AC "SOURCED shown consistently" (lines ~57-60): change "the headline percentage equals owned/total" and the Then example so `25 owned + 5 sourced + 10 missing` reads **"75% complete (30 of 40)"**, with three distinct owned/sourced/missing segments.
  - Description paragraph (line ~20): replace "headline percentage kept as strict owned/total" wording with `(owned + sourced)/total`, keeping the note that the owned **segment** still matches the existing text summary.
  - Open Questions (line ~111): mark "Completion % semantics for SOURCED" **resolved** in favor of `(owned + sourced)/total` per KD-1.
- **Success criteria**:
  - No remaining occurrence of "strict owned/total" or "62% complete (25 of 40)" in the file (`grep -n "owned/total" ` and `grep -n "62% complete"` return only historical/architecture-reasoning references, not live ACs).
  - AC "Bar and text agree" is left intact (owned **segment** == text summary owned; only the headline numerator gains `sourced`).
  - No em dash introduced in any edited line.
- **Subtasks**:
  1. Rewrite the AC "SOURCED shown consistently" Given/When/Then to the 75% (30 of 40) example.
  2. Edit the Description SOURCED paragraph to `(owned + sourced)/total`.
  3. Mark the "Completion % semantics for SOURCED" Open Question resolved.
  4. Grep the file for stale `owned/total` / `62%` live-AC wording and reconcile.
- **Estimate**: S

#### Verification
- **Level**: Single Judge
- **Threshold**: 4.0 / 5.0
- **Criticality**: MEDIUM (spec-only, but gates headline-% correctness of Steps 7/8/9 — Risk R2)
- **Rubric**:
  | Criterion | Weight | Description |
  |-----------|--------|-------------|
  | AC "SOURCED shown consistently" realigned to KD-1 | 0.35 | The AC's Then now reads the `(owned + sourced)/total` semantics; the `25 owned + 5 sourced + 10 missing` example resolves to "75% complete (30 of 40)"; three distinct owned/sourced/missing segments still specified |
  | Description paragraph updated | 0.25 | The Description's SOURCED paragraph no longer says "strict owned/total"; it states `(owned + sourced)/total` while preserving the note that the owned **segment** still matches the existing text summary |
  | Open Question marked resolved | 0.20 | "Completion % semantics for SOURCED" is explicitly marked resolved in favor of `(owned + sourced)/total` per KD-1 |
  | No collateral contradiction or em dash | 0.20 | AC "Bar and text agree" left intact (only headline numerator gains `sourced`); no remaining live-AC occurrence of "strict owned/total" or the "62% complete (25 of 40)" example; no em dash introduced in any edited line |

### Phase: Foundational

### Step 2: Create pure `lib/deckStats.js` derivations — Wave 1 [general-purpose · opus] [DONE]
- **Agent**: general-purpose (model: opus — math correctness of the headline + price guard is load-bearing)
- **Wave**: 1
- **Depends on**: nothing (starts immediately; function signatures are frozen in this spec)
- **Blocks**: Step 3 (tests import it), Step 6 (may import fns), Step 7, Step 8
- **Parallel with**: Steps 3, 4, 5, 6 (dispatch simultaneously, separate sub-agents)

- **Goal**: Provide the four pure derivations so component `computed`s become one-line wrappers and the guard cases are unit-testable without mounting a page (KD-3).
- **Expected output**: `frontend/src/lib/deckStats.js` exporting:
  - `computeSourcedCount(entries, cardMap, ownedIds, ignoredIds)` — qty-summed, symmetric to the existing `missing` computation: `entries.filter(c => cardMap[c.id] && !ownedIds.has(c.id) && ignoredIds.has(c.id)).reduce((s,c)=>s+c.qty,0)`.
  - `computeCompletionPct({ owned, sourced, total })` — `total > 0 ? Math.round(((owned + sourced) / total) * 100) : 0` (KD-2 guard).
  - `computeTypeBreakdown(entries, cardMap)` — qty-weighted counts by frame-type/category (Monster/Spell/Trap), unrecognized excluded.
  - `computeEstimatedValue(entries, cardMap)` — `sum(cardmarket_price × qty)`, normalizing `"0.00"`/falsy/`NaN` → 0 and guarding `card?.card_prices?.[0]`.
  - No Vue or Supabase imports (pure module).
- **Success criteria**:
  - `frontend/src/lib/deckStats.js` exists; all four named functions exported; file imports nothing from `vue`/`@supabase`.
  - `computeCompletionPct({ owned:25, sourced:5, total:40 })` returns `75`; `{ owned:0, sourced:0, total:0 }` returns `0` (no NaN).
  - `computeEstimatedValue` with an entry whose `card_prices` is `[]` contributes `0` and never yields `NaN`.
- **Subtasks**:
  1. Scaffold module + JSDoc; mirror `bulkAddResolver.js` style.
  2. Implement `computeSourcedCount` (reuse the exact missing-count predicate shape).
  3. Implement `computeCompletionPct` with the `total===0` guard.
  4. Implement `computeTypeBreakdown` reusing `lib/cardIcons.js` type helpers (`isSpellTrap`, etc.).
  5. Implement `computeEstimatedValue` with the `card_prices` normalization from `CardPage.vue`.
- **Estimate**: M

#### Verification
- **Level**: Panel of 2 Judges (independent evaluations, scores averaged)
- **Threshold**: 4.5 / 5.0
- **Criticality**: HIGH (load-bearing headline math + price NaN-guard; every consumer inherits any error)
- **Rubric** (each judge scores 0–5 per criterion; final = weighted average):
  | Criterion | Weight | Description |
  |-----------|--------|-------------|
  | Completion-% math correct (KD-1/KD-2) | 0.30 | `computeCompletionPct({owned,sourced,total})` returns `total > 0 ? Math.round(((owned + sourced)/total)*100) : 0`; `{25,5,40}` → `75`; `{0,0,0}` → `0` with no NaN; uses `Math.round` (not truncation) |
  | Estimated-value price guard (Risk R3) | 0.25 | `computeEstimatedValue` sums `cardmarket_price × qty`, normalizing `"0.00"`/falsy/`NaN` → 0 and guarding `card?.card_prices?.[0]`; an entry with `card_prices: []` contributes 0 and never poisons the total with NaN |
  | `computeSourcedCount` predicate correct | 0.20 | Qty-summed, symmetric to the existing missing computation: `entries.filter(c => cardMap[c.id] && !ownedIds.has(c.id) && ignoredIds.has(c.id)).reduce((s,c)=>s+c.qty,0)`; unrecognized ids (no `cardMap` entry) excluded |
  | `computeTypeBreakdown` correct | 0.15 | Qty-weighted counts by frame-type/category (Monster/Spell/Trap) reusing `lib/cardIcons.js` helpers; unrecognized excluded so counts sum to total − unrecognized |
  | Purity & convention | 0.10 | No imports from `vue`/`@supabase`; mirrors `bulkAddResolver.js` style; all four functions named-exported with JSDoc |

### Step 3: Vitest unit tests for `lib/deckStats.js` — Wave 1 [general-purpose · opus] [DONE]
- **Agent**: general-purpose (model: opus — authored against Step 2's frozen signatures so fixtures stay honest)
- **Wave**: 1 (contract-first: written against the Step 2 function signatures fixed in this spec)
- **Depends on**: Step 2 signatures (contract). The test file MUST be re-run/reconciled once Step 2's module merges.
- **Blocks**: Step 9 (Definition of Done "tests written and passing")
- **Parallel with**: Steps 2, 4, 5, 6 (dispatch simultaneously, separate sub-agents)

- **Goal**: Cover the guard cases and the SOURCED-in-headline math with fast, deterministic tests (KD-3), following the `bulkAddResolver.test.js` split.
- **Expected output**: `frontend/src/lib/deckStats.test.js` (vitest `describe`/`it`/`expect`, deterministic fixtures, no Vue mount).
- **Success criteria**:
  - `npx vitest run src/lib/deckStats.test.js` passes.
  - Explicit cases: empty deck (`total=0` → `0%`, no NaN); empty `card_prices` (contributes 0); all-unrecognized deck (`0%`, breakdown sums 0, no crash); `25 owned + 5 sourced + 10 missing` → `75`.
  - `computeEstimatedValue` NaN-poison case asserted (a `"0.00"`/missing price never poisons the total).
- **Subtasks**:
  1. Build shared fixture `cardMap`/`entries`/`ownedIds`/`ignoredIds`.
  2. Tests for `computeCompletionPct` (75% case + empty-deck guard).
  3. Tests for `computeSourcedCount` (qty-sum, unrecognized ignored).
  4. Tests for `computeTypeBreakdown` (monster/spell/trap sums = total − unrecognized).
  5. Tests for `computeEstimatedValue` (empty `card_prices`, `"0.00"`, mixed).
- **Estimate**: M

#### Verification
- **Level**: Single Judge
- **Threshold**: 4.0 / 5.0
- **Criticality**: MEDIUM (guards the guard-cases; weak tests produce false-green sign-off)
- **Rubric**:
  | Criterion | Weight | Description |
  |-----------|--------|-------------|
  | Guard-case coverage present | 0.35 | Explicit tests for empty deck (`total=0` → `0`, no NaN), empty `card_prices` (contributes 0), and all-unrecognized deck (`0%`, breakdown sums 0, no crash) |
  | Headline + NaN-poison assertions | 0.30 | `25 owned + 5 sourced + 10 missing` asserted → `75`; a `"0.00"`/missing price asserted to never poison the estimated-value total (no NaN) |
  | Suite runs green & isolated | 0.20 | `npx vitest run src/lib/deckStats.test.js` passes; no Vue mount; deterministic fixtures; imports the merged Step 2 signatures without drift |
  | Convention & readability | 0.15 | Mirrors `bulkAddResolver.test.js` `describe`/`it`/`expect` structure; shared fixture (`cardMap`/`entries`/`ownedIds`/`ignoredIds`) reused across cases |

### Step 4: Add i18n keys to all 4 locales — Wave 1 [general-purpose · sonnet] [DONE]
- **Agent**: general-purpose (model: sonnet)
- **Wave**: 1
- **Depends on**: nothing (starts immediately; the key list is frozen per B4 before fan-out)
- **Blocks**: Step 5 (label/aria keys), Step 6 (value labels), Step 7, Step 8
- **Parallel with**: Steps 2, 3, 5, 6 (dispatch simultaneously, separate sub-agents)

- **Goal**: Add every new user-facing string to en/fr/de/it in the same change, no em dashes (Risk R4).
- **Expected output**: identical new key set under `deckDetail.*` in `frontend/src/locales/en.json`, `fr.json`, `de.json`, `it.json`. Proposed keys:
  - `deckDetail.completionPct` (e.g. "{pct}% complete"), `deckDetail.completionAria` (owned/total/pct aria string), `deckDetail.ownedSegment`, `deckDetail.sourcedSegment`, `deckDetail.missingSegment`, `deckDetail.typeBreakdown`, `deckDetail.estimatedValue`, `deckDetail.estimatedApprox`, `deckDetail.priceUnavailable`.
- **Success criteria**:
  - Every proposed key exists in all four files (a `jq` key-set diff across the four is empty).
  - No em dash character in any added value (`grep -n "—"` on the added blocks is empty).
  - All four files still parse (`jq . <file>` succeeds).
- **Subtasks**:
  1. Finalize the key list with Step 5/6 authors (segment labels + value labels).
  2. Add keys to `en.json` (source of truth).
  3. Translate into fr/de/it, no em dashes.
  4. `jq`-validate parity + JSON validity across all four.
- **Estimate**: S

#### Verification
- **Level**: Per-Item (one judge per locale file — 4 evaluations total)
- **Threshold**: 3.5 / 5.0
- **Criticality**: MEDIUM (recurring deck-* parity risk R4; `$t` falls back silently so a miss is a UX gap not a crash)
- **Items**: `en.json`, `fr.json`, `de.json`, `it.json`
- **Rubric** (applied independently to each locale file):
  | Criterion | Weight | Description |
  |-----------|--------|-------------|
  | Full key-set parity | 0.40 | Every frozen `deckDetail.*` key (`completionPct`, `completionAria`, `ownedSegment`, `sourcedSegment`, `missingSegment`, `typeBreakdown`, `estimatedValue`, `estimatedApprox`, `priceUnavailable`) is present in this file — a `jq` key-set diff against `en.json` is empty |
  | No em dash + valid JSON | 0.30 | No em dash character (`—`) in any added value (per MEMORY no-em-dash rule); file parses (`jq . <file>` succeeds) with no trailing commas or structural errors |
  | Translation quality & placeholders | 0.20 | Values are non-empty, natural in the target language, and preserve interpolation placeholders (e.g. `{pct}`, owned/total tokens) intact and untranslated |
  | Correct placement & convention | 0.10 | New keys nested under the existing `deckDetail` object (not root); naming matches surrounding camelCase convention |

### Step 5: Create `DeckCompletionBar.vue` (presentational) — Wave 1 [general-purpose · sonnet] [DONE]
- **Agent**: general-purpose (model: sonnet)
- **Wave**: 1 (contract-first: consumes the frozen i18n key names, not the merged file)
- **Depends on**: Step 4 key names (contract — the frozen `deckDetail.*` label/aria keys)
- **Blocks**: Step 7, Step 8
- **Parallel with**: Steps 2, 3, 4, 6 (dispatch simultaneously, separate sub-agents)

- **Goal**: A pure props-in three-segment bar reused by both pages (KD-4).
- **Expected output**: `frontend/src/components/library/DeckCompletionBar.vue`, props `{ owned: Number, sourced: Number (default 0), total: Number, compact: Boolean (default false) }`.
  - Owned segment `var(--c-accent)`; sourced segment a muted/secondary theme var distinct from the track; missing = remaining track.
  - `{owned} / {total} ({pct}%)` label using `deckDetail.completionPct`; `aria-label` from `deckDetail.completionAria` (percentage always present, never colour-only).
  - `compact` variant for the dense list rows (smaller height, label optional).
- **Success criteria**:
  - File exists in `components/library/`; owns no fetch/store access; all colours from CSS theme vars (no hex literals in `<style>`/template).
  - Renders `0%` with no NaN when `total === 0` (delegates to `computeCompletionPct` or guards inline).
  - `aria-label` includes owned, total, and percentage.
- **Subtasks**:
  1. Scaffold SFC + props (default `sourced=0`, `compact=false`).
  2. Segmented bar markup (precedent: `BulkAddCards.vue` `v-progress-linear`, `height="8" rounded`).
  3. Label + aria-label wired to i18n keys.
  4. Theme-var styling + compact variant.
- **Estimate**: M

#### Verification
- **Level**: Single Judge
- **Threshold**: 4.0 / 5.0
- **Criticality**: MEDIUM (reused by both pages; owns the a11y + theme-var + divide-by-zero surface)
- **Rubric**:
  | Criterion | Weight | Description |
  |-----------|--------|-------------|
  | Three-segment render & props | 0.30 | Props `{ owned:Number, sourced:Number (default 0), total:Number, compact:Boolean (default false) }`; owned/sourced/missing rendered as three visually distinct segments (owned = `var(--c-accent)`, sourced = a distinct muted theme var, missing = remaining track); owned + sourced fill matches the headline % |
  | Accessibility (not colour-only) | 0.25 | `aria-label` (from `deckDetail.completionAria`) conveys owned, total, and percentage; the numeric `{pct}%` label is always present in the DOM so completion is never communicated by colour alone |
  | Divide-by-zero safety | 0.20 | Renders `0%` with no NaN when `total === 0` (delegates to `computeCompletionPct` or guards inline) |
  | Theme-var purity & no data | 0.15 | All colours from CSS theme vars — no hex literals in template/`<style>`; component owns no fetch/store access (pure props-in, KD-4) |
  | Compact variant | 0.10 | `compact` prop yields a reduced-height bar suitable for dense list rows (label optional), precedent `BulkAddCards.vue` `v-progress-linear height="8" rounded` |

### Step 6: Create `DeckStatsBreakdown.vue` (presentational) — Wave 1 [general-purpose · sonnet] [DONE]
- **Agent**: general-purpose (model: sonnet)
- **Wave**: 1 (contract-first: consumes Step 2 fn signatures + Step 4 key names, not merged files)
- **Depends on**: Step 2 fn signatures (may import derivations), Step 4 key names (value/approx labels)
- **Blocks**: Step 7
- **Parallel with**: Steps 2, 3, 4, 5 (dispatch simultaneously, separate sub-agents)

- **Goal**: A pure props-in richer-data panel (type breakdown + estimated value), detail page only (KD-4); kept off the dense list rows per the analysis risk register.
- **Expected output**: `frontend/src/components/library/DeckStatsBreakdown.vue`, props `{ entries, cardMap, missingEntries }`.
  - Card-type breakdown chips (Monster/Spell/Trap, optionally extra-deck subtypes), qty-weighted, reusing `lib/cardIcons.js` helpers.
  - Estimated value labeled approximate (`deckDetail.estimatedValue` + `deckDetail.estimatedApprox`), `priceUnavailable` when total is 0/unknown.
- **Success criteria**:
  - File exists in `components/library/`; owns no fetch; derives display via the Step 2 fns (or receives already-computed values as props).
  - Estimated value never renders `NaN`; shows the approximate label.
  - All colours from theme vars.
- **Subtasks**:
  1. Scaffold SFC + props.
  2. Type-breakdown chip row via `cardIcons.js` helpers.
  3. Estimated-value display + approximate/unavailable labels.
  4. Theme-var styling.
- **Estimate**: M

#### Verification
- **Level**: Single Judge
- **Threshold**: 4.0 / 5.0
- **Criticality**: MEDIUM (detail-only richer-data panel; owns NaN/price-label + theme correctness)
- **Rubric**:
  | Criterion | Weight | Description |
  |-----------|--------|-------------|
  | Type-breakdown correctness | 0.30 | Renders qty-weighted Monster/Spell/Trap (optionally extra-deck subtype) chips derived via `lib/cardIcons.js` helpers; counts reflect the Step 2 `computeTypeBreakdown` output; unrecognized excluded |
  | Estimated-value display & guard | 0.30 | Value shown labeled approximate (`deckDetail.estimatedValue` + `deckDetail.estimatedApprox`); never renders `NaN`; shows `priceUnavailable` when total is 0/unknown rather than a silent `0.00` |
  | Pure props-in, no data ownership | 0.20 | Props `{ entries, cardMap, missingEntries }`; owns no fetch — derives display via Step 2 fns or receives computed values (KD-4) |
  | Theme-var purity | 0.20 | All colours from CSS theme vars; no hex literals; located in `components/library/` |

### Phase: User Stories

### Step 7: Wire `DeckDetailPage.vue` — Wave 2 [general-purpose · opus] (CRITICAL) [DONE]
- **Agent**: general-purpose (model: opus)
- **Wave**: 2 (start after Wave 1 merges)
- **Depends on**: Step 2 (fns), Step 4 (keys), Step 5 (bar), Step 6 (breakdown)
- **Blocks**: Step 9
- **Parallel with**: Step 8 (dispatch simultaneously, separate sub-agent)
- **Flagged HIGH-RISK / L** — see decomposition recommendation below.

- **Goal**: Deliver the Primary Flow, guest flow, and SOURCED-toggle reactivity on the detail page, deriving everything from the existing `stats`.
- **Expected output** (edits to `frontend/src/components/Pages/App/DeckDetailPage.vue`):
  - Add `sourcedCount` to the `stats` object in **`resolveStats()`** and in the **`onToggleIgnore()` optimistic block** (both sites — Risk R1), using `computeSourcedCount`.
  - Add `completionPct`, `typeBreakdown`, `estimatedValue` `computed`s that wrap the Step 2 fns over `stats`.
  - Render `<DeckCompletionBar :owned :sourced :total>` after the `<h1>` (alongside/replacing the `deckDetail.summary` line) and `<DeckStatsBreakdown :entries :cardMap :missingEntries>` near the wishlist block, both gated on `!loadingStats`.
- **Success criteria**:
  - `stats.sourcedCount` is set in both `resolveStats()` and `onToggleIgnore()`; toggling a card to SOURCED shrinks the missing segment, grows the sourced segment, leaves the headline unchanged, and fires **no** card/ownership refetch (network panel shows only the pre-existing per-deck resolve).
  - Guest (no collection) renders `0%` owned with the breakdown + estimated value still shown.
  - Empty deck (`total=0`) renders `0%`, no NaN, no console error.
  - Bar owned **segment** equals the existing text summary owned figure (AC "Bar and text agree").
- **Subtasks**:
  1. Import `DeckCompletionBar`, `DeckStatsBreakdown`, and the `deckStats.js` fns.
  2. Add `sourcedCount` in `resolveStats()`.
  3. Add `sourcedCount` in the `onToggleIgnore()` optimistic block (same block that recomputes `missing`/`missingEntries`).
  4. Add `completionPct` / `typeBreakdown` / `estimatedValue` computeds.
  5. Render bar after `<h1>`; render breakdown near wishlist; gate on `!loadingStats`.
  6. Manual reactivity check: toggle SOURCED, watch network + segments.
- **Estimate**: L
- **Decomposition recommendation (high-risk L)**: if this exceeds an L during implementation, split into **7a — state & computeds** (`sourcedCount` at both sites + the three computeds, verifiable by unit/behavior) and **7b — template render** (bar + breakdown placement, gating, a11y). The two `sourcedCount` sites must land together in 7a to avoid drift (R1).

#### Verification
- **Level**: Panel of 2 Judges (independent evaluations, scores averaged)
- **Threshold**: 4.5 / 5.0
- **Criticality**: HIGH / CRITICAL (critical path; sourcedCount two-site drift R1, reactivity, no-refetch, guest/empty guards)
- **Rubric** (each judge scores 0–5 per criterion; final = weighted average):
  | Criterion | Weight | Description |
  |-----------|--------|-------------|
  | `sourcedCount` set at BOTH sites (Risk R1) | 0.25 | `stats.sourcedCount` is written via `computeSourcedCount` in **both** `resolveStats()` **and** the `onToggleIgnore()` optimistic block (the same block that recomputes `missing`/`missingEntries`); neither site omitted |
  | Reactive SOURCED toggle, no refetch | 0.25 | Toggling a card to SOURCED shrinks the missing segment, grows the sourced segment, leaves the headline unchanged, and fires **no** card/ownership refetch (network shows only the pre-existing per-deck resolve) |
  | Guest + empty-deck guards | 0.15 | Guest (no collection) renders `0%` owned with breakdown + estimated value still shown; empty deck (`total=0`) renders `0%` with no NaN and no console error |
  | Bar/text agreement & headline | 0.15 | The bar's owned **segment** equals the existing text-summary owned figure; the headline reads `(owned + sourced)/total` per KD-1 |
  | Computeds wrap Step 2 fns | 0.10 | `completionPct`, `typeBreakdown`, `estimatedValue` are `computed`s wrapping the `deckStats.js` fns over the in-memory `stats` — no inline reduce-loops, no new fetch |
  | Render placement & gating | 0.10 | `<DeckCompletionBar>` rendered after the `<h1>` (alongside/replacing the summary line) and `<DeckStatsBreakdown>` near the wishlist block, both gated on `!loadingStats`; Options-API/project patterns preserved |

### Step 8: Wire `DecksPage.vue` (list view) — Wave 2 [general-purpose · sonnet] [DONE]
- **Agent**: general-purpose (model: sonnet)
- **Wave**: 2 (start after Wave 1 merges)
- **Depends on**: Step 2 (fns), Step 4 (keys), Step 5 (bar)
- **Blocks**: Step 9
- **Parallel with**: Step 7 (dispatch simultaneously, separate sub-agent)

- **Goal**: Deliver the deck-list flow — a compact completion bar + percentage on each deck card.
- **Expected output** (edits to `frontend/src/components/Pages/App/DecksPage.vue`):
  - Add `sourcedCount` to `deckStats[deck.id]` in **`computeStats()`** and in the **`onToggleDeckIgnore()` optimistic block** (~l.616-628) via `computeSourcedCount` (both sites — Risk R1).
  - Render a compact `<DeckCompletionBar compact>` in the panel-title stats line (~l.184-198), sourced from that deck's `deckStats`.
- **Success criteria**:
  - `deckStats[deckId].sourcedCount` set in both `computeStats()` and `onToggleDeckIgnore()`.
  - Each deck card shows a compact bar + percentage; the breakdown panel is **not** added to the dense list rows.
  - `sourcedCount` computed identically to the detail page (same `computeSourcedCount` import).
- **Subtasks**:
  1. Import `DeckCompletionBar` + `computeSourcedCount`.
  2. Add `sourcedCount` in `computeStats()`.
  3. Add `sourcedCount` in the `onToggleDeckIgnore()` optimistic block.
  4. Render compact bar in the panel-title stats line.
- **Estimate**: M

#### Verification
- **Level**: Single Judge
- **Threshold**: 4.0 / 5.0
- **Criticality**: MEDIUM (two sourcedCount sites R1, but a simpler surface than Step 7)
- **Rubric**:
  | Criterion | Weight | Description |
  |-----------|--------|-------------|
  | `sourcedCount` set at BOTH sites (Risk R1) | 0.35 | `deckStats[deck.id].sourcedCount` written via `computeSourcedCount` in **both** `computeStats()` **and** the `onToggleDeckIgnore()` optimistic block; computed identically to the detail page (same import) |
  | Compact bar rendered per deck card | 0.30 | A compact `<DeckCompletionBar compact>` appears in each deck card's panel-title stats line, sourced from that deck's `deckStats`; percentage visible |
  | Breakdown correctly omitted | 0.20 | `<DeckStatsBreakdown>` is **not** added to the dense list rows (per analysis risk register) |
  | No regression / patterns | 0.15 | No console errors or Vue warnings; existing accordion/add/import/delete behavior unaffected; no new fetch introduced |

### Phase: Polish

### Step 9: Accessibility, theming, i18n parity, and end-to-end verification — Wave 3 [general-purpose · sonnet] [DONE]
- **Agent**: general-purpose (model: sonnet)
- **Wave**: 3 (after Steps 7 + 8)
- **Depends on**: Steps 7, 8, and Step 3 (tests green)
- **Blocks**: nothing (final gate before Definition of Done)
- **Parallel with**: none (runs alone in Wave 3)

- **Goal**: Confirm the non-functional ACs (accessibility, theming, performance, compatibility) and cross-cutting quality before Definition of Done.
- **Expected output**: verification notes + any small fixes to the four created / two modified files (no new files expected).
- **Success criteria**:
  - Bar `aria-label` conveys owned/total/percentage; percentage text always present (not colour-only).
  - Bar + breakdown render correctly in **both** light and dark themes (theme-var check, no hex literals).
  - Network panel confirms only the pre-existing per-deck resolve fires (no second fetch) on both pages.
  - i18n parity holds across en/fr/de/it with no em dashes (`grep -n "—"` empty on added blocks; `jq` key-set diff empty).
  - `npx vitest run src/lib/deckStats.test.js` passes.
- **Subtasks**:
  1. a11y pass (aria-label, colour-independence) on both bars.
  2. Light/dark theme visual pass.
  3. Network-panel no-refetch confirmation (detail + list, incl. SOURCED toggle).
  4. i18n parity + no-em-dash grep + `jq` validity.
  5. Run the vitest suite; fix any red.
- **Estimate**: S

#### Verification
- **Level**: Single Judge
- **Threshold**: 4.0 / 5.0
- **Criticality**: MEDIUM (cross-cutting NFR gate; checks are objective — grep/jq/network/vitest)
- **Rubric**:
  | Criterion | Weight | Description |
  |-----------|--------|-------------|
  | No-refetch performance confirmed | 0.30 | Network panel confirms only the pre-existing per-deck resolve fires (no second fetch) on both the detail and list pages, including after a SOURCED toggle |
  | i18n parity + no em dash | 0.25 | `jq` key-set diff across en/fr/de/it is empty and all parse; `grep -n "—"` on the added blocks is empty |
  | Accessibility pass | 0.20 | Both bars expose an `aria-label` conveying owned/total/percentage; numeric percentage always present (not colour-only) |
  | Theming pass | 0.15 | Bar + breakdown render correctly in both light and dark themes; theme-var check confirms no hex literals |
  | Tests green | 0.10 | `npx vitest run src/lib/deckStats.test.js` passes |

---

## Verification Summary

| Step | Description | Judge Level | Evaluations | Threshold | Rubric Focus |
|------|-------------|-------------|-------------|-----------|--------------|
| 1 | Realign SOURCED AC + Description to KD-1 | Single Judge | 1 | 4.0 / 5.0 | Headline-% semantics realignment; Open Question resolved; no stale wording/em dash |
| 2 | Pure `lib/deckStats.js` derivations | Panel of 2 Judges | 2 | 4.5 / 5.0 | Completion-% math + price NaN-guard; sourcedCount/type-breakdown predicates; purity |
| 3 | Vitest tests for deckStats | Single Judge | 1 | 4.0 / 5.0 | Guard-case + headline + NaN-poison coverage; green & isolated |
| 4 | i18n keys × 4 locales | Per-Item (1/locale) | 4 | 3.5 / 5.0 | Key-set parity; no em dash + valid JSON; translation/placeholder quality |
| 5 | `DeckCompletionBar.vue` | Single Judge | 1 | 4.0 / 5.0 | Three-segment render; a11y not colour-only; divide-by-zero; theme-var purity |
| 6 | `DeckStatsBreakdown.vue` | Single Judge | 1 | 4.0 / 5.0 | Type-breakdown; estimated-value guard/label; pure props-in; theme-var purity |
| 7 | Wire `DeckDetailPage.vue` (CRITICAL) | Panel of 2 Judges | 2 | 4.5 / 5.0 | sourcedCount two-site (R1); reactive toggle no-refetch; guest/empty guards; bar/text agreement |
| 8 | Wire `DecksPage.vue` compact bar | Single Judge | 1 | 4.0 / 5.0 | sourcedCount two-site (R1); compact bar per card; breakdown omitted; no regression |
| 9 | a11y / theme / parity / e2e verify | Single Judge | 1 | 4.0 / 5.0 | No-refetch; i18n parity + no em dash; a11y; theming; tests green |
| **Total** | | | **14** | | |

**Verification breakdown**: Panel of judges × 2 (Steps 2, 7) · Per-Item × 1 (Step 4) · Single Judge × 6 (Steps 1, 3, 5, 6, 8, 9) · None × 0. Total evaluations = **14**.

---

## Blockers & Resolutions

| # | Blocker | Blocks | Resolution |
|---|---------|--------|------------|
| B1 | Spec self-contradiction: AC "SOURCED shown consistently" + Description say strict `owned/total` (62%), but KD-1 settled `(owned+sourced)/total` (75%). | Correct verification of Steps 7/8; sign-off in Step 9. | **Step 1** realigns the AC wording/example and the Description line, and marks the "Completion % semantics" Open Question resolved. Do Step 1 first. |
| B2 | `DeckCompletionBar` / `DeckStatsBreakdown` / `deckStats.js` must exist before the pages can import them. | Steps 7, 8. | Steps 2, 5, 6 are Wave 1 and complete before Wave 2 starts. |
| B3 | i18n keys must exist before the pages/SFCs reference them or `$t` silently falls back. | Steps 7, 8 (and 5, 6 labels). | Step 4 (Wave 1) lands all keys in all four locales before Wave 2. |
| B4 | Final segment-label + value-label key names are shared between Step 4 (i18n) and Steps 5/6 (SFCs). | Steps 5, 6. | Freeze the key list as subtask 4.1 before Wave 1 fan-out; all three consume the agreed names. |

## Risk Register

| # | Risk | Sev | Likelihood | Mitigation | Owner step |
|---|------|-----|-----------|------------|------------|
| R1 | `sourcedCount` drift: added to `resolveStats()`/`computeStats()` but not to the two optimistic toggle blocks → stale sourced segment until next realtime resync. | HIGH | Med | Set `sourcedCount` in the **same block** that already recomputes `missing`/`missingEntries` — all **four** sites. Explicit subtask in Steps 7 & 8; verified by the SOURCED-toggle check in Step 9. | 7, 8 |
| R2 | AC realignment missed → spec and architecture contradict each other; implementers may build strict `owned/total`. | HIGH | Med | **Step 1** first; Step 9 sign-off confirms no live AC still says strict `owned/total`. | 1 |
| R3 | Price-data sparsity: empty/`"0.00"` `card_prices` → naive `parseFloat` yields `NaN` and poisons the deck total. | MED | High | `computeEstimatedValue` normalizes `"0.00"`/falsy/`NaN` → 0 and guards `card?.card_prices?.[0]`; unit-tested (Step 3); "approximate"/"price unavailable" label instead of silent `0.00`. | 2, 3, 6 |
| R4 | i18n parity gap: keys land in only some locales; `$t` falls back silently (UX gap, not crash). | MED | Med | Identical key set across all four files in one change (Step 4); `jq` key-set diff + no-em-dash grep in Step 9. | 4, 9 |
| R5 | Step 7 scope creep (L step touching state + template + a11y) risks a partial landing. | MED | Med | **Decomposition recommendation** on Step 7: split into 7a (state & computeds, both `sourcedCount` sites together) and 7b (template render + a11y) if it exceeds an L. | 7 |

**High-priority (HIGH-severity) risks: 2** (R1, R2). Step 7 additionally flagged for optional decomposition (R5).

## Implementation Summary

| Step | Phase | Description | Files | Est | Agent (model) | Wave | Depends on | Blocks |
|------|-------|-------------|-------|-----|---------------|------|-----------|--------|
| 1 | Setup | Realign SOURCED AC + Description to KD-1 | task .feature.md | S | general-purpose (sonnet) | 0 | — | 7,8,9 (correctness) |
| 2 | Foundational | Pure `lib/deckStats.js` derivations | deckStats.js | M | general-purpose (opus) | 1 | — | 3,6,7,8 |
| 3 | Foundational | Vitest tests for deckStats | deckStats.test.js | M | general-purpose (opus) | 1 | 2 (contract) | 9 |
| 4 | Foundational | i18n keys × 4 locales | en/fr/de/it.json | S | general-purpose (sonnet) | 1 | — | 5,6,7,8 |
| 5 | Foundational | `DeckCompletionBar.vue` (presentational) | DeckCompletionBar.vue | M | general-purpose (sonnet) | 1 | 4 (keys) | 7,8 |
| 6 | Foundational | `DeckStatsBreakdown.vue` (presentational) | DeckStatsBreakdown.vue | M | general-purpose (sonnet) | 1 | 2,4 (contract) | 7 |
| 7 | User Stories | Wire `DeckDetailPage.vue` (CRITICAL) | DeckDetailPage.vue | L | general-purpose (opus) | 2 | 2,4,5,6 | 9 |
| 8 | User Stories | Wire `DecksPage.vue` compact bar | DecksPage.vue | M | general-purpose (sonnet) | 2 | 2,4,5 | 9 |
| 9 | Polish | a11y / theme / parity / e2e verify | (all touched) | S | general-purpose (sonnet) | 3 | 3,7,8 | — |

**Totals**: 9 steps, 40 subtasks. All steps run as `general-purpose` sub-agents. Critical path: Step 2 → Step 7 → Step 9. No step larger than L.

**Agent distribution**: general-purpose/opus × 3 (Steps 2, 3, 7 — load-bearing math + critical wiring); general-purpose/sonnet × 6 (Steps 1, 4, 5, 6, 8, 9); no trivial (haiku) steps.

**Wave dispatch units** (max parallelization depth = 5): W0 = {1} · W1 = {2, 3, 4, 5, 6} · W2 = {7, 8} · W3 = {9}.

## Sub-Agent Execution Directive

These rules govern how the steps above are dispatched. They are MUST requirements for the orchestrator.

- **MUST — one sub-agent per step.** Every step is executed by its own separate `general-purpose` sub-agent. No sub-agent takes on two steps, and no step is split across sub-agents (except the sanctioned Step 7 decomposition into 7a/7b, each of which is then its own sub-agent).
- **MUST — dispatch each wave in parallel.** All steps in the same wave MUST be dispatched simultaneously in a single batch of parallel sub-agent calls, not sequentially:
  - Wave 0: Step 1 (may also overlap Wave 1, being spec-only).
  - Wave 1: Steps 2, 3, 4, 5, 6 dispatched together (5 parallel sub-agents).
  - Wave 2: Steps 7, 8 dispatched together (2 parallel sub-agents).
  - Wave 3: Step 9 (single sub-agent).
- **MUST — respect wave ordering.** A wave MUST NOT start until every step in the prior wave has completed and merged. Wave 2 waits for all of Wave 1; Wave 3 waits for Steps 7 and 8.
- **MUST — freeze the contract before Wave 1 fan-out (B4).** The i18n key names, the `DeckCompletionBar`/`DeckStatsBreakdown` prop names, and the `deckStats.js` function signatures MUST be fixed (they are specified in Steps 2, 4, 5, 6) before the Wave 1 sub-agents start, so tests (Step 3) and SFCs (Steps 5, 6) build against a stable contract.
- **MUST — reconcile contract-first steps after their source merges.** Step 3 MUST be re-run against the merged Step 2 module; Steps 5/6 MUST be checked against the merged Step 4 keys. Any drift is resolved before Wave 2.
- **MUST — assign models as specified.** Each sub-agent uses the model named in its step (opus for Steps 2, 3, 7; sonnet otherwise). Do not downgrade the opus steps.
- **MUST — land both `sourcedCount` sites together within a step.** In Step 7 (and 7a if decomposed) and Step 8, the two `sourcedCount` write sites MUST be edited in the same sub-agent run to avoid the R1 drift risk; they are never split across sub-agents.
- **SHOULD — use `pr-review-toolkit:code-reviewer` (review-only) for the Definition of Done "Code reviewed" gate** after Step 9, and `Explore` (read-only) for any incidental code lookup a sub-agent needs. Neither substitutes for the `general-purpose` implementer on any step.

## Definition of Done

- [x] **Spec aligned**: AC "SOURCED shown consistently" and the Description read `(owned + sourced)/total`; the 25/5/10 example reads 75% (30 of 40); "Completion % semantics" Open Question marked resolved (Step 1).
- [x] **Completion bar (detail)**: `<DeckCompletionBar>` renders on `DeckDetailPage.vue` from the existing `stats`, three segments, `{pct}% complete` headline, no new fetch (AC "Completion bar on detail page").
- [x] **SOURCED three-segment + headline math**: owned/sourced/missing segments distinct; headline = `(owned + sourced)/total`; owned **segment** equals the text summary (AC "SOURCED shown consistently" + "Bar and text agree").
- [x] **`sourcedCount` in stats**: set in all four sites — `resolveStats()`, `onToggleIgnore()`, `computeStats()`, `onToggleDeckIgnore()` — via `computeSourcedCount` (AC "`sourcedCount` in stats").
- [x] **Compact bar (list)**: each deck card in `DecksPage.vue` shows a compact bar + percentage (AC "Compact bar in list view").
- [x] **Card-type breakdown**: `<DeckStatsBreakdown>` shows qty-weighted type counts summing to total − unrecognized, no new fetch (AC "Card-type breakdown").
- [x] **Estimated value with guard**: sum of `cardmarket_price × qty`, missing/`NaN`/`"0.00"` → 0, labeled approximate, no NaN (AC "Estimated deck value").
- [x] **Divide-by-zero guard**: `total = 0` renders 0%, no NaN (AC "Divide-by-zero guard").
- [x] **Reactive on SOURCED toggle**: missing shrinks, sourced grows, headline updates, no refetch (AC "Reactive on SOURCED toggle").
- [x] **Tests written and passing**: `frontend/src/lib/deckStats.test.js` green (empty deck, empty `card_prices`, all-unrecognized, 75% headline).
- [x] **i18n parity, no em dashes**: all new `deckDetail.*` keys in en/fr/de/it, no em dash (AC "4-locale parity").
- [x] **Non-functional**: no additional network request; bar `aria-label` conveys owned/total/pct with numeric % always present; theme-var colours correct in light + dark; new reactive state reassigned not mutated.
- [X] **Code reviewed** (pr-review-toolkit:code-reviewer: APPROVE, no blocking findings)
