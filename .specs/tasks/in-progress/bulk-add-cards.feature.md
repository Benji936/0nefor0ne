# Bulk Add Cards — Paste-a-List

**Type:** feature
**Status:** draft

## User Request

> "A way to bulk add cards would be very nice let's find the best idea to implement this."

## Description

Today the only way to add cards to a collection is one at a time through `AddCard.vue`: search → select a single card → choose printing/language/condition/quantity → insert one row. Adding a stack of cards (e.g. a freshly opened box, a traded-away pile, or a want-list) is tedious because each card requires the full single-card dialog.

This feature adds a **bulk add** flow built around a **paste-a-list** input: the user pastes many lines (e.g. `3x Ash Blossom & Joyous Spring`, `Maxx "C"`, or set codes), the app parses and resolves each line against the YGOPRODeck `cardinfo.php` API, surfaces a review screen for unmatched/ambiguous rows, then batch-inserts the resolved cards into the user's collection in a single operation.

## Brainstorm Decisions (confirmed with user)

These choices are locked in and should drive the refinement — do not re-open them:

1. **Primary UX = Paste-a-list.** A textarea accepting many lines, one card per line, with optional leading quantity (`3x`, `3 `, `x3`). Lines may be card names or set codes. Parse → resolve via API → review unmatched/ambiguous → batch insert. Reuse the existing resolve + batch-`insert(rows)` plumbing already proven in `DeckImport.vue`, and `searchCardByName` / `searchCardBySetCode` from `src/api.js`.
2. **Per-card detail = Quick defaults.** Inserted rows use sensible defaults (blank/any `extension`, `rarity: 'common'`, `language: 'English'`, `condition: 'Near Mint'`, `first_edition: false`, `quantity` parsed from the line or 1). This matches the existing "add missing to wishlist" default-insert behavior. Per-printing accuracy is intentionally out of scope for v1; users can edit a card afterward.
3. **Destination = Both, user picks.** The bulk-add dialog has a Trade list / Wishlist toggle (the `wish` boolean on the `Card` row), defaulting to Trade — mirroring `AddCard.vue`'s existing `mode` prop (`wish` | `trade`).

## Scope

**In scope:**
- A bulk-add entry point (button/dialog) reachable from where single add lives today (Library / collection area).
- Paste textarea + line parser (quantity prefix + name/setcode).
- Resolve each parsed line against the card API; collect matched, unmatched, and ambiguous (multiple matches) rows.
- Review step: show resolved cards with parsed quantity; let the user drop rows and pick among ambiguous matches; clearly flag unmatched lines.
- Trade/Wishlist destination toggle (default Trade).
- Batch insert all confirmed rows into the `Card` table with quick defaults; report inserted count and any skipped lines.
- i18n for all new strings across the four locales (en, fr, de, it).

**Out of scope:**
- Per-card printing/rarity/condition pickers (quick defaults only for v1).
- CSV / Dragon Shield / TCGplayer file import.
- Multi-select-in-search and set-based bulk add (separate features; set-based overlaps the queued `set-collection-progress` task).
- Editing existing collection rows (already possible elsewhere).

## Notes / Existing Building Blocks

- `frontend/src/components/AddCard.vue` — single-add dialog; row shape, defaults, auth check, duplicate logic, and `wish`/`trade` mode to mirror.
- `frontend/src/components/DeckImport.vue` — already parses a list and does `supabase.from("Card").insert(rows)` in batch; closest prior art for resolve + bulk insert + inserted-count emit.
- `frontend/src/lib/ydk.js` (`parseYdk`) — parsing prior art.
- `frontend/src/api.js` — `searchCardByName`, `searchCardBySetCode`, `searchById` for resolution.
- The `Card` table requires `extension` NOT NULL (no default) and `rarity` NOT NULL (default `'common'` but PostgREST sends explicit nulls) — bulk inserts must send `extension: ''` and `rarity: 'common'`, never null.

## Skill

Reusable patterns, pitfalls, and building-block pointers: [`.claude/skills/bulk-add-cards/SKILL.md`](.claude/skills/bulk-add-cards/SKILL.md)

---

## User Scenarios

1. **Primary Flow (happy path)** — A logged-in collector opens bulk-add from the collection area (destination defaults to **Trade**), pastes a list such as `3x Ash Blossom & Joyous Spring`, `Maxx "C"`, `SDCB-EN001`, triggers resolution, reviews the matched cards with their parsed quantities, confirms, and sees a summary like "X added". The cards land in their Trade list with quick defaults.

2. **Alternative — Wishlist destination** — Before confirming, the user flips the toggle to **Wishlist**; all inserted rows are recorded as wishlist entries instead of trade.

3. **Alternative — Ambiguous & manual review** — A line resolves to more than one card. The review step presents the candidates so the user can pick the intended one; the user may also drop any unwanted row before confirming.

4. **Error — Unmatched lines** — A line that resolves to no card is flagged distinctly, excluded from insertion, and reported in the skipped count.

5. **Error — Empty / unauthenticated** — Whitespace-only input leaves the action disabled with a "nothing to add" state and fires no lookups. An unauthenticated user attempting to insert is prompted to authenticate, and no rows are written.

---

## Acceptance Criteria

### Functional Requirements

- [ ] **AC1 — Quantity-prefix parsing**
  - Given a paste containing the lines `3x Ash Blossom`, `3 Ash Blossom`, `x3 Ash Blossom`, and `Ash Blossom`
  - When the input is parsed
  - Then the parsed quantities are `3`, `3`, `3`, and `1` respectively, with the remaining text used as the card token (quantity is always a positive integer).

- [ ] **AC2 — Name vs. set-code lines**
  - Given a list containing both a card-name line (e.g. `Maxx "C"`) and a set-code line (e.g. `SDCB-EN001`)
  - When resolution runs
  - Then each line is resolved through the appropriate lookup and classified as matched, ambiguous, or unmatched.

- [ ] **AC3 — Unmatched lines**
  - Given a line that resolves to no card (e.g. a misspelling or nonsense text)
  - When resolution completes
  - Then the line is flagged distinctly as unmatched, is never inserted, and is counted toward the skipped total.

- [ ] **AC4 — Ambiguous (multiple) matches**
  - Given a line that resolves to more than one candidate card
  - When the user reaches the review step
  - Then the candidates are shown for the user to pick one; a picked candidate becomes a matched row, and an ambiguous line left unresolved at confirmation is excluded and counted as skipped.

- [ ] **AC5 — Duplicate cards already owned**
  - Given a resolved card the user already owns
  - When the list is confirmed
  - Then the card is still inserted (consistent with single-add allowing multiple entries); it is not silently blocked or auto-skipped.

- [ ] **AC6 — Destination toggle**
  - Given the bulk-add dialog with the Trade/Wishlist toggle (default Trade)
  - When the user confirms with the toggle set to Trade vs. Wishlist
  - Then every inserted row is recorded against the chosen destination (trade vs. wishlist), and Trade is the default when the dialog opens.

- [ ] **AC7 — Inserted-count and skipped-count feedback**
  - Given a list containing a mix of matched, unmatched, and user-dropped lines
  - When insertion completes
  - Then the user sees a summary reporting the number of cards added and the number skipped, where skipped = unmatched + user-dropped + unresolved ambiguous lines, and (added + skipped) reconciles to the total parsed lines.

- [ ] **AC8 — Empty / whitespace input**
  - Given input that is empty or contains only whitespace/blank lines
  - When the user attempts to proceed
  - Then no card lookups are performed, the confirm/insert action is disabled (or a no-op), and a clear "nothing to add" state is shown.

- [ ] **AC9 — Very large pastes (100+ lines)**
  - Given a paste of 100 or more valid lines
  - When the user resolves and confirms
  - Then all lines resolve and matched rows are inserted successfully; insertion is performed in chunks so it does not fail as a single oversized request, and progress/loading feedback is shown during resolution.

- [ ] **AC10 — Quick defaults on every inserted row**
  - Given any matched card being inserted
  - When the row is written
  - Then it uses the quick defaults: extension `''` (never null), rarity `common`, language English, condition Near Mint, first_edition false, and quantity taken from the parsed line.

- [ ] **AC11 — Authentication required**
  - Given an unauthenticated visitor
  - When they attempt to confirm a bulk insert
  - Then they are prompted to authenticate and no rows are inserted.

### Non-Functional Requirements

- [ ] **Resilience**: Resolution shows a loading/progress indication for multi-line lists; the UI does not freeze while lines resolve.
- [ ] **Data integrity**: Inserted rows always send `extension: ''` and `rarity: 'common'` (never null) to satisfy the NOT NULL columns.
- [ ] **Compatibility / i18n**: All new user-facing strings are present in en, fr, de, and it locales.

### Definition of Done

- [ ] All acceptance criteria pass
- [ ] Tests written and passing
- [ ] i18n keys added to all four locales
- [ ] Code reviewed

---

## Architecture Overview

Synthesised from the analysis ([`.specs/analysis/analysis-bulk-add-cards.md`](../../analysis/analysis-bulk-add-cards.md)) and reusable patterns ([`.claude/skills/bulk-add-cards/SKILL.md`](../../../.claude/skills/bulk-add-cards/SKILL.md)).

### Solution Strategy

End-to-end flow for a single bulk-add operation:

1. **Entry point** — a new `BulkAddCards.vue` `v-dialog` wizard is mounted in the `Library.vue` toolbar, sitting alongside the existing `DeckImport` toggle (same `flex items-center justify-between gap-3 flex-wrap` row, gated by a `showBulkAdd` data flag).
2. **Paste** — a `v-textarea` collects the raw list plus a Trade/Wishlist `v-btn-toggle` (default Trade). Confirm is disabled on empty/whitespace input (AC8).
3. **Parse** — a pure `frontend/src/lib/bulkAddParser.js` helper turns the paste into `{ qty, query }[]`, stripping quantity prefixes (`3x`, `x3`, `3 `) and skipping blank/comment lines. Parallels `ydk.js`'s `parseYdk` in role and structure; unit-testable in isolation.
4. **Resolve** — each parsed line is resolved **sequentially** (one `await` per line, never parallel) to respect YGOPRODeck's ~20 req/s burst limit. Set-code lines (`isSetCode` regex) go through `searchCardBySetCode` → `searchById`; name lines go through `searchCardByName` with exact-match gating before declaring ambiguity. A `v-progress-linear` with `resolving X of N` text covers multi-line lists; a 600 ms retry on transient Network Error.
5. **Review** — each line is surfaced in one of three states: `matched` (thumbnail + qty, included), `ambiguous` (candidate picker, must select to include), `unmatched` (flagged, excluded, counted as skipped). The user may drop any row.
6. **Insert** — confirmed rows are batch-inserted into the `Card` table with quick defaults via `supabase.from('Card').insert(rows).select()`, chunked at 500 rows for very large pastes. Auth (`supabase.auth.getUser()`) is checked **before the resolve phase** so a stale session does not lose the paste; failure emits `requireAuth`.
7. **Refresh** — `Library.vue`'s existing Postgres realtime subscription on `Card` re-fetches both piles automatically after the insert commits, so `onBulkAdded(count)` only shows a snackbar — no manual row prepend (contrast `onCardAdded`'s optimistic single-card prepend).

### Key Decisions

- **Paste-a-list over multi-select / file import.** Reuses the proven resolve + batch-insert plumbing from `DeckImport.vue` and the `searchCardBy*` helpers; fastest path for stacks of cards, and avoids the per-printing complexity that's explicitly out of scope for v1. Trade-off: no per-card printing/rarity accuracy — mitigated by quick defaults plus post-add editing elsewhere.
- **Quick defaults `extension: ''`, `rarity: 'common'` (never `null`).** The `Card` table has `extension`/`rarity` NOT NULL, and PostgREST sends explicit nulls from JS. `DeckImport.vue` lines 391–392 send `null` for both — a latent bug that silently rejects the whole batch. We deliberately diverge and add a defensive pre-insert guard. Trade-off: inserted rows aren't printing-accurate, accepted for v1.
- **Sequential resolution with retry + small concurrency.** Respects the YGOPRODeck burst limit and keeps the UI responsive with progress feedback. Trade-off: 100+ line pastes take ~10–20 s — accepted, surfaced via the progress indicator.
- **Chunked inserts (≤500/chunk).** Keeps very large pastes within PostgREST payload limits instead of one oversized request that could time out (AC9).
- **Trade/Wishlist via a `wish` boolean toggle.** Mirrors `AddCard.vue`'s `mode` prop semantics (`wish` | `trade`), default Trade, written straight into each row's `wish` field — consistent with the rest of the app.
- **Duplicates allowed (not blocked).** Matches single-add behaviour (AC5); optional post-insert "you may have duplicates" notice, no blocking.

### Component & Data Contracts

**Resolved-row shape** (internal review-step model, one per parsed line):

```js
{
  status:     'matched' | 'ambiguous' | 'unmatched',
  qty:        number,        // parsed from line, >= 1
  query:      string,        // original card token (name or set code)
  candidates: Card[],        // populated when ambiguous
  selected:   Card | null,   // chosen candidate (ambiguous) or the matched card
  card:       Card | null,   // resolved card for matched rows
}
```

**`BulkAddCards.vue` interface:**

- Props: `mode: String` (default `'trade'`) — seeds the destination toggle, mirroring `AddCard.vue`.
- Emits: `added(count: number)` — same contract as `DeckImport.vue @added`; `requireAuth()` — same as `DeckImport.vue` (auth gate failure).

**`Card` insert row** (mirror `AddCard.vue` `submit()` lines 323–336, with the extension/rarity overrides):

```js
{
  wish:          isWish,            // boolean from toggle
  game:          'YGO',
  url:           `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${canonicalName}`,
  name:          card.name_en ?? card.name,
  extension:     '',                // NOT NULL — empty string, never null
  rarity:        'common',          // NOT NULL — explicit, never null
  quantity:      qty,               // parsed from line or 1
  trader:        userId,            // from supabase.auth.getUser()
  image_id:      card.id,
  language:      'English',
  condition:     'Near Mint',
  first_edition: false,
}
```

**`bulkAddParser.js` exports:** `parseBulkLines(text) → {qty, query}[]` and `isSetCode(query) → boolean` (strict regex so malformed codes like `LOB`/`LOB-` never reach `searchCardBySetCode`, which would otherwise throw on `split_code[1]`).

### Expected Changes

**CREATE**
- `frontend/src/components/BulkAddCards.vue` — the dialog/wizard component.
- `frontend/src/lib/bulkAddParser.js` — pure parse + set-code-detection helper.

**MODIFY**
- `frontend/src/components/Pages/Library.vue` — import/register `BulkAddCards`, add `showBulkAdd` flag, toolbar button, mount the dialog, add `onBulkAdded(count)` snackbar handler.
- `frontend/src/locales/en.json`, `fr.json`, `de.json`, `it.json` — new `bulkAdd.*` key namespace (incl. pipe-separated plural keys), all four in the same commit.

**NO CHANGE**
- `frontend/src/api.js`, `frontend/src/components/DeckImport.vue`, `frontend/src/components/Pages/library/LibrarySection.vue`.

---

## Implementation Process

Dependency-ordered, phased steps. Critical-path steps are marked. The pure parser + its unit test (Step 2) and the resolver helpers (Step 3) are foundational and must land before the dialog (Step 4). i18n (Step 6) can be built in parallel with Steps 3–4 but is required before the dialog smoke test in Step 7.

Each step below carries a **Dependencies**, **Parallel with**, and **Agent** annotation. The wave/parallelization diagram and the sub-agent execution directive (which waves may run concurrently, and the assigned agent per step) live in the **Parallelization Plan** section immediately after Step 7.

### Phase A — Setup

#### Step 1 — Confirm test harness & scaffold files (Setup)
- **Goal:** Verify the vitest runner works in this repo and create empty target files so later steps only edit, never wonder about paths.
- **Subtasks:**
  - Run `cd frontend && npm test` once to confirm `vitest run` is green on the existing suite (`src/lib/ydk.test.js`, `src/composables/useCardSearch.spec.js`).
  - Create empty placeholders: `frontend/src/lib/bulkAddParser.js`, `frontend/src/lib/bulkAddParser.test.js`, `frontend/src/components/BulkAddCards.vue`.
  - Note the existing `bulkAdd`-anchor location in `en.json` (after the `addCard` block, ~lines 108–127) for Step 6.
- **Expected output:** Three new (empty/stub) files on disk; a confirmed-green baseline test run.
- **Success criteria:** `npm test` exits 0 before any feature code is added; the three file paths exist.
- **Blockers:** None.
- **Risks/mitigation:** Stale `node_modules` → run `npm ci` if the baseline run fails on missing deps.
- **Dependencies:** None — foundational gate.
- **Parallel with:** Nothing (solo Wave 0; every later step depends on the scaffolded paths and the green baseline).
- **Agent:** `general-purpose` (haiku) — trivial scaffold + baseline run.
- **Wave:** 0

#### Verification
- **Level:** None. This step is a trivial scaffold (create empty files) plus a baseline `npm test` run. Its success is binary and self-evidencing — the three file paths either exist or they don't, and the baseline either exits 0 or it doesn't. There is no artifact requiring judgment, so no LLM-as-Judge evaluation is warranted. Correctness is confirmed mechanically by the step's own Success criteria (`npm test` exits 0; the three paths exist).

### Phase B — Foundational

#### Step 2 — Pure line parser + unit test (Foundational, **CRITICAL**)
- **Goal:** Implement `frontend/src/lib/bulkAddParser.js` exporting `parseBulkLines(text) → {qty, query}[]` and `isSetCode(query) → boolean`, plus the **required** vitest spec `frontend/src/lib/bulkAddParser.test.js`.
- **Subtasks:**
  - `parseBulkLines`: split → trim → skip blank/`#`-comment lines (mirror `ydk.js` `parseYdk` structure). Quantity prefixes `3x` / `x3` / `3 ` / none → qty default 1, always a positive integer (SKILL.md regex lines 24–32). Strip the prefix to get `query`; drop lines that have no query left.
  - `isSetCode`: strict regex so `LOB`/`LOB-` never reach `searchCardBySetCode` (which would throw on `split_code[1]`). Use `/^[A-Z0-9]+-[A-Z]*\d+$/i` (analysis R5), stricter than the SKILL.md `/^[A-Z0-9]+-\w+$/i`.
  - Test cases covering **AC1** (`3x Ash Blossom`, `3 Ash Blossom`, `x3 Ash Blossom`, `Ash Blossom` → 3,3,3,1) and **AC2/R5** (`Maxx "C"` not a set code; `SDCB-EN001` and `LOB-005` are set codes; `LOB` and `LOB-` are NOT), plus blank/comment-line skipping.
- **Expected output:** `frontend/src/lib/bulkAddParser.js`, `frontend/src/lib/bulkAddParser.test.js`.
- **Success criteria:** `npm test` runs the new spec and all `parseBulkLines`/`isSetCode` cases pass; AC1 and the set-code/name detection portion of AC2 are demonstrably covered by assertions.
- **Blockers:** Step 1.
- **Risks/mitigation:** R5 malformed set codes → strict regex + a test asserting `isSetCode('LOB') === false`. Quantity regex over-matching names that start with a digit → assert a digit-led name token still parses correctly.
- **Dependencies:** Step 1 (scaffolded files + green baseline).
- **Parallel with:** Step 6 (i18n) — pure parser logic and locale JSON are fully independent.
- **Agent:** `general-purpose` (opus) — pure logic with tricky regex edge cases + required test.
- **Wave:** 1

#### Verification
- **Level:** MEDIUM — Single judge. The artifact is pure, side-effect-free logic that is directly testable via the required vitest spec, so a single judge reviewing the parser + its test suite against the rubric is sufficient. The unit tests provide objective ground truth the judge can corroborate.
- **Judge inputs:** `frontend/src/lib/bulkAddParser.js`, `frontend/src/lib/bulkAddParser.test.js`, and the captured `vitest run` output for the new spec.
- **Threshold:** 4.0 / 5.0 (weighted total). Any single criterion scoring below 3.0 fails the step regardless of total.
- **Rubric:**

  | Weight | Criterion | Measurable description |
  |--------|-----------|------------------------|
  | 0.35 | Quantity-prefix correctness (AC1) | `parseBulkLines` yields qty `3,3,3,1` for `3x Ash Blossom` / `3 Ash Blossom` / `x3 Ash Blossom` / `Ash Blossom`; qty is always a positive integer; the prefix is stripped so `query` holds only the card token. A digit-led name (e.g. a name starting with a number) is not mis-parsed as a quantity. |
  | 0.30 | Set-code vs name detection (AC2 / R5) | `isSetCode` returns true for `SDCB-EN001` and `LOB-005`, and false for `Maxx "C"`, `LOB`, and `LOB-`. The regex is the strict `/^[A-Z0-9]+-[A-Z]*\d+$/i` (analysis R5), not the looser SKILL.md variant, so no malformed code can reach `searchCardBySetCode`. |
  | 0.20 | Edge-case & blank/comment handling | Blank lines and `#`-comment lines are skipped; lines that reduce to an empty query after prefix-stripping are dropped; trimming is applied. Mirrors `ydk.js` `parseYdk` structure. |
  | 0.15 | Test coverage & assertions | The vitest spec contains explicit assertions for every AC1/AC2/R5 case above (including `isSetCode('LOB') === false`) plus blank/comment skipping; the spec runs green under `vitest run`. |

#### Step 3 — Resolver logic with sequential retry + chunking (Foundational, **CRITICAL**)
- **Goal:** Implement the per-line resolution and the batch-insert helpers used by the dialog (can live inside `BulkAddCards.vue` methods or a small local module; `api.js` stays unchanged — `getWithRetry` is private, so implement a **local** retry).
- **Subtasks:**
  - Per-line resolve: if `isSetCode(query)` → `searchCardBySetCode(query)` → on hit `searchById(result.id)`; else `searchCardByName(query)`. Apply exact case-insensitive name-match gating before declaring `ambiguous` (R3, SKILL.md lines 59–64). Classify each line `matched | ambiguous | unmatched` into the Resolved-row shape from the Component & Data Contracts section.
  - Sequential loop (one `await` per line, never parallel) with a 600 ms retry on transient Network Error (R2); emit `resolving X of N` progress state.
  - `buildRow({card, qty, isWish, userId})` per the Card-insert contract — `extension: ''`, `rarity: 'common'`, never null — plus a defensive pre-insert guard `rows.forEach(r => { if (r.extension == null) r.extension=''; if (r.rarity == null) r.rarity='common' })` (R1).
  - Chunked insert: `supabase.from('Card').insert(chunk).select()` in chunks of ≤500, awaiting each (R4/AC9); accumulate inserted count.
- **Expected output:** Resolver + `buildRow` + chunked-insert helpers (in `BulkAddCards.vue` or a co-located helper imported by it).
- **Success criteria:** Set-code lines route through `searchCardBySetCode`→`searchById`; name lines through `searchCardByName` with exact-match gating; rows never carry null `extension`/`rarity`; inserts chunk at 500. Satisfies AC2, AC3, AC9, AC10 logic and R1/R2/R3/R4.
- **Blockers:** Step 2 (`parseBulkLines`/`isSetCode`).
- **Risks/mitigation:** R2 rate limit → sequential + retry + progress. R1 NOT NULL → explicit defaults + guard. R3 false positives → exact-match gate test path.
- **Dependencies:** Step 2 (consumes `isSetCode`/`parseBulkLines`).
- **Parallel with:** Nothing in its wave — Step 6 (i18n) may still be running concurrently from Wave 1, but no new step starts alongside Step 3.
- **Agent:** `general-purpose` (opus) — complex async sequencing, retry, chunking, NOT-NULL guard.
- **Wave:** 2

#### Verification
- **Level:** HIGH — Panel (3 judges). This step concentrates the feature's data-integrity and rate-limit risk: the sequential-resolve loop, the transient-retry, the chunked insert, and especially the `extension: ''` / `rarity: 'common'` NOT-NULL invariant whose violation silently rejects the entire batch (the latent `DeckImport.vue` bug this task deliberately diverges from). Independent judges (correctness, rate-limit/resilience, data-integrity) reduce the chance a single reviewer misses one axis. The panel's per-criterion scores are averaged across judges.
- **Judge inputs:** the resolver + `buildRow` + chunked-insert helpers (in `BulkAddCards.vue` or the co-located module) and the Component & Data Contracts section of this task for the expected row shape.
- **Threshold:** 4.5 / 5.0 (panel-averaged weighted total). The data-integrity criterion is a hard gate: if it scores below 4.0 the step fails regardless of total.
- **Rubric:**

  | Weight | Criterion | Measurable description |
  |--------|-----------|------------------------|
  | 0.30 | NOT-NULL data integrity (R1 / AC10) | Every built row sets `extension: ''` and `rarity: 'common'` — never null. The defensive pre-insert guard (`rows.forEach(r => { if (r.extension == null) r.extension=''; if (r.rarity == null) r.rarity='common' })`) is present. The full row shape matches the Card-insert contract (wish, game, url, name, quantity, trader, image_id, language, condition, first_edition). No code path can emit a null for either NOT-NULL column. |
  | 0.30 | Resolution correctness (AC2 / AC3 / R3) | Set-code lines route `searchCardBySetCode` → `searchById`; name lines route `searchCardByName` with exact case-insensitive match gating before declaring `ambiguous`. Each line is classified `matched | ambiguous | unmatched` into the Resolved-row shape. Unmatched lines are excluded and counted; ambiguous lines carry candidates. |
  | 0.25 | Rate-limit safety & resilience (R2 / AC9) | Resolution is strictly sequential (one `await` per line, never `Promise.all` over all lines) to respect the ~20 req/s burst limit; a ~600 ms retry covers a transient Network Error; a `resolving X of N` progress state is emitted. The insert chunks at ≤500 rows, awaiting each chunk, accumulating the inserted count. |
  | 0.15 | Reuse & isolation | Consumes `isSetCode`/`parseBulkLines` from the Step 2 parser and `searchCardBy*`/`searchById` from `@/api`; implements a **local** retry (does not depend on `api.js`'s private `getWithRetry`); leaves `api.js` and `DeckImport.vue` unchanged. |

### Phase C — User Stories

#### Step 4 — `BulkAddCards.vue` dialog/wizard (User Story, **CRITICAL**, ⚠️ HIGHEST-RISK STEP)
- **Goal:** Build the Vuetify dialog mirroring `AddCard.vue` / `DeckImport.vue` patterns: paste → resolve (progress) → review → confirm → insert.
- **Subtasks:**
  - `v-dialog v-model` (Options API, `@after-leave="reset"`); prop `mode: String` default `'trade'` seeds the Trade/Wishlist `v-btn-toggle` (default Trade = `wish:false`, **AC6**).
  - Paste: `v-textarea`; Resolve button disabled on empty/whitespace input with a "nothing to add" state — fires no lookups (**AC8**).
  - Auth gate via `supabase.auth.getUser()` **before** the resolve phase so the paste isn't lost; on failure `emit('requireAuth')` and abort, no rows written (**AC11**).
  - Resolve phase: `v-progress-linear` + `bulkAdd.resolving` text (non-functional resilience req).
  - Review list: `matched` (thumbnail via `cardImage` + qty, included), `ambiguous` (candidate picker — must select to include, **AC4**), `unmatched` (flagged, excluded, **AC3**); user can drop any row.
  - Confirm: build rows (Step 3 `buildRow`), chunked insert, then `emit('added', insertedCount)`; show inserted/skipped summary where skipped = unmatched + dropped + unresolved-ambiguous and added+skipped reconciles to parsed total (**AC7**). Duplicates allowed, not blocked (**AC5**).
- **Expected output:** Completed `frontend/src/components/BulkAddCards.vue`.
- **Success criteria:** All listed ACs exercised in the component; emits match `DeckImport.vue` contract (`added(count)`, `requireAuth`); imports `searchCardBy*`/`searchById` from `@/api`, `parseBulkLines`/`isSetCode` from the parser, `cardImage` from `@/lib/cardImage`.
- **Blockers:** Steps 2, 3; Step 6 needed before the Step 7 smoke test (keys referenced here).
- **Risks/mitigation:** R7 SSR — dialog is client-only (user must open it), no `window` at mount, no guards needed. Vuetify `v-btn-toggle` default-value wiring → verify Trade selected on open.
- **Dependencies:** Steps 2 and 3 (parser + resolver/insert helpers). Step 6's initial keys should exist before this step references them; the final key reconciliation (Step 6 final pass) happens after this template settles.
- **Parallel with:** Nothing — **runs solo on its own wave.** This is the highest-risk step (see Judge note below); it must not share a wave so its full context budget and review focus stay undivided.
- **Agent:** `general-purpose` (opus) — Vuetify wizard + review state machine + auth-before-resolve ordering + count reconciliation.
- **Wave:** 3
- **⚠️ Judge note (from decomposition):** This is the **highest-risk step** in the task. Risk concentrates here: the three-state review machine (matched/ambiguous/unmatched), the auth-gate-before-resolve ordering (AC11, so a stale session never loses the paste), the inserted/skipped count reconciliation (AC7), and Vuetify `v-btn-toggle` default-Trade wiring (AC6). The repo also has a known null-vnode unmount crash tied to upstream render throws (see MEMORY) — keep the dialog's render path defensive. Isolate this step on its own wave; consider a `pr-review-toolkit:code-reviewer` pass after it lands before proceeding to Step 5.

#### Verification
- **Level:** HIGH — Panel (3 judges). The highest-risk artifact in the task: the full UX flow, the three-state review machine, auth-before-resolve ordering, count reconciliation, and the no-null insert invariant all live here, and a render-path bug can trigger the known null-vnode unmount crash. Three judges with distinct lenses — UX-flow-vs-acceptance-criteria, review-state-machine correctness, and insert-correctness/i18n/data-integrity — give the coverage this concentration of risk demands. Per-criterion scores are averaged across the panel.
- **Judge inputs:** `frontend/src/components/BulkAddCards.vue`, the User Scenarios and Acceptance Criteria sections of this task, the `BulkAddCards.vue` interface contract, and `AddCard.vue` / `DeckImport.vue` as the patterns being mirrored.
- **Threshold:** 4.5 / 5.0 (panel-averaged weighted total). The insert-correctness criterion is a hard gate: below 4.0 fails the step regardless of total.
- **Rubric:**

  | Weight | Criterion | Measurable description |
  |--------|-----------|------------------------|
  | 0.30 | UX flow vs acceptance criteria (AC6 / AC8 / AC11) | Paste → resolve (progress) → review → confirm → insert flow is complete. Trade/Wishlist `v-btn-toggle` defaults to Trade (`wish:false`, seeded by `mode` prop) per AC6. Resolve is disabled with a "nothing to add" state on empty/whitespace input, firing no lookups (AC8). `supabase.auth.getUser()` auth gate runs **before** the resolve phase so the paste isn't lost; failure emits `requireAuth` and writes no rows (AC11). |
  | 0.30 | Review-state-machine handling (AC3 / AC4 / AC7) | Each line renders as exactly one of `matched` (thumbnail + qty, included), `ambiguous` (candidate picker; must select to include — AC4), `unmatched` (flagged, excluded — AC3); the user can drop any row. The inserted/skipped summary reconciles: skipped = unmatched + dropped + unresolved-ambiguous, and added + skipped equals the parsed-line total (AC7). |
  | 0.25 | Insert correctness & data integrity (AC5 / AC10) | Confirm builds rows via the Step 3 `buildRow`, inserts chunked, then `emit('added', insertedCount)`. Quick defaults applied on every row with `extension: ''` / `rarity: 'common'` never null (AC10). Duplicates already owned are still inserted, not blocked (AC5). Emits match the `DeckImport.vue` contract (`added(count)`, `requireAuth`). |
  | 0.15 | i18n usage & render-path defensiveness | All user-facing strings use `$t('bulkAdd.*')` keys (no hardcoded copy); plural keys use `{count}`. Render path is defensive against the known null-vnode unmount crash — no unguarded throws in the template/render that could unmount with a null vnode; dialog is client-only (no `window` at mount, R7). |

#### Step 5 — Mount in `Library.vue` toolbar (User Story, **CRITICAL**)
- **Goal:** Surface the dialog from the collection area, mirroring the existing `DeckImport` mount + `onDeckImportAdded` handler (~lines 145–152).
- **Subtasks:**
  - Import + register `BulkAddCards` alongside `DeckImport`; add `showBulkAdd: false` to `data()`.
  - Add toolbar button in the `flex items-center justify-between gap-3 flex-wrap` row; mount `<BulkAddCards @requireAuth="$emit('requireAuth')" @added="onBulkAdded" />` below the toolbar.
  - Add `onBulkAdded(count)` → snackbar `{ open, message: $t('bulkAdd.added', count, { count }), color, icon }`. No optimistic prepend — the existing `Card` realtime subscription re-fetches both piles.
- **Expected output:** Modified `frontend/src/components/Pages/Library.vue`.
- **Success criteria:** Bulk-add button visible in the Library toolbar; opening + confirming inserts and shows the snackbar; both piles refresh via realtime; `requireAuth` propagates to the page's existing auth flow.
- **Blockers:** Step 4.
- **Risks/mitigation:** Toolbar layout regression → keep within the existing flex row; verify against `showDeckImport` mount pattern.
- **Dependencies:** Step 4 (the dialog component being mounted).
- **Parallel with:** Step 6 final pass (key reconciliation) — both can run together in Wave 4 since the mount wiring and locale JSON don't touch the same files.
- **Agent:** `general-purpose` (sonnet) — small, well-templated wiring change mirroring `DeckImport` mount.
- **Wave:** 4

#### Verification
- **Level:** MEDIUM — Single judge. A small, well-templated integration change that mirrors the existing `DeckImport` mount + `onDeckImportAdded` handler. Risk is contained to wiring (registration, emit propagation, snackbar, no-regression on realtime refresh), so a single judge against the rubric suffices.
- **Judge inputs:** the `Library.vue` diff, and the existing `DeckImport` mount + `onDeckImportAdded` handler (~lines 145–152) as the mirrored pattern.
- **Threshold:** 4.0 / 5.0 (weighted total).
- **Rubric:**

  | Weight | Criterion | Measurable description |
  |--------|-----------|------------------------|
  | 0.35 | Mount & emit wiring | `BulkAddCards` is imported, registered, and mounted with `@requireAuth="$emit('requireAuth')"` and `@added="onBulkAdded"`; `showBulkAdd: false` added to `data()`; the toolbar button lives inside the existing `flex items-center justify-between gap-3 flex-wrap` row. `requireAuth` propagates to the page's existing auth flow. |
  | 0.35 | Snackbar & refresh behaviour (AC6 refresh) | `onBulkAdded(count)` opens a snackbar using `$t('bulkAdd.added', count, { count })`. No optimistic prepend — relies on the existing `Card` realtime subscription to re-fetch both piles (contrast `onCardAdded`'s single-card prepend). |
  | 0.20 | Pattern fidelity & no regression | Mirrors the `DeckImport`/`showDeckImport` mount pattern; no toolbar layout regression; existing realtime refresh and `onCardAdded` behaviour are untouched. |
  | 0.10 | Scope containment | `LibrarySection.vue`, `api.js`, and `DeckImport.vue` remain unchanged; only `Library.vue` is modified. |

#### Step 6 — i18n keys across four locales (User Story)
- **Goal:** Add the `bulkAdd.*` namespace to `en/fr/de/it.json` in the **same commit** (R8) — mirror the `addCard` block and use pipe-separated plural keys (vue-i18n v9, like `deckImport.added`).
- **Subtasks:**
  - Add the source-of-truth keys to `en.json` (analysis §2c–2f list: `title, subtitle, placeholder, destination, tradePile, wishlist, resolve, resolving, reviewTitle, matched, ambiguous, unmatched, remove, addAll, adding, added, skipped, noLines, authRequired`).
  - Translate the same key set into `fr.json`, `de.json`, `it.json` (keep plural pipes + `{count}`/`{current}`/`{total}` placeholders).
- **Expected output:** Modified `frontend/src/locales/{en,fr,de,it}.json`.
- **Success criteria:** All four locales contain identical key sets; no vue-i18n fallback warnings when switching languages; plural keys render correctly for count 1 vs N.
- **Blockers:** Key names finalized once Step 4's template settles (do final pass after Step 4).
- **Risks/mitigation:** R8 missing keys → diff key sets across the four files before commit.
- **Dependencies:** Step 1 (anchor location noted). **Two-pass step:** the *initial* pass (analysis key list) runs in Wave 1 independently of all code; the *final* reconciliation pass runs in Wave 4 once Step 4's template settles to catch any keys the dialog actually references.
- **Parallel with:** Step 2 (Wave 1, initial pass) and Step 5 (Wave 4, final pass) — locale JSON never collides with parser logic or `Library.vue` wiring.
- **Agent:** `general-purpose` (sonnet) — high-volume mechanical four-locale edits.
- **Wave:** 1 (initial) and 4 (final reconciliation)

#### Verification
- **Level:** MEDIUM — Per-Item (4 evaluations, one per locale). Each locale file (`en`, `fr`, `de`, `it`) is judged independently for completeness and parity against the source-of-truth `en.json` key set, because a missing or misnamed key in any single locale produces a vue-i18n fallback warning at runtime. Per-item evaluation localizes the failure to the offending locale. Run after Step 4's template settles (final reconciliation pass) so the judged key set matches what the dialog actually references.
- **Judge inputs (per item):** the locale file under review, `en.json` as the canonical key set, and the list of `bulkAdd.*` keys actually referenced in `BulkAddCards.vue`.
- **Threshold:** 4.0 / 5.0 per locale (weighted total). A locale missing any referenced key, or with a different key set from `en.json`, hard-fails that item regardless of total.
- **Rubric (applied to each of the 4 locales):**

  | Weight | Criterion | Measurable description |
  |--------|-----------|------------------------|
  | 0.40 | Key-set completeness & parity | The locale contains the full `bulkAdd.*` key set (`title, subtitle, placeholder, destination, tradePile, wishlist, resolve, resolving, reviewTitle, matched, ambiguous, unmatched, remove, addAll, adding, added, skipped, noLines, authRequired`) — identical key set to `en.json`, no missing or extra keys, and every key referenced by `BulkAddCards.vue` is present. |
  | 0.30 | Plural & placeholder integrity | Pipe-separated plural keys (e.g. `added`, `skipped`) keep their `singular | plural` form; `{count}` / `{current}` / `{total}` placeholders are preserved verbatim and not translated away. Renders correctly for count 1 vs N. |
  | 0.20 | Translation quality | Values are genuine, idiomatic translations into the target language (not English copy-pasted into fr/de/it), faithful to the source string's meaning. |
  | 0.10 | Placement & formatting | Keys sit under the `bulkAdd` namespace anchored after the `addCard` block; valid JSON; consistent with the file's existing style. |

### Phase D — Polish

#### Step 7 — Verification & polish (Polish)
- **Goal:** Prove the feature against the acceptance criteria and leave the tree clean.
- **Subtasks:**
  - `cd frontend && npm test` — full vitest suite green (parser spec included).
  - Run the repo lint (`npm run lint` if present; otherwise the configured linter) on the new/changed files.
  - Manual smoke per ACs: AC1/AC2 (mixed name + set-code paste), AC3 (nonsense line flagged/skipped), AC4 (ambiguous picker), AC6 (Trade vs Wishlist destination), AC7 (added/skipped summary reconciles), AC8 (empty input disabled, no lookups), AC9 (100+ line paste resolves + chunked insert + progress), AC10 (inserted rows carry `extension:''`/`rarity:'common'`), AC11 (signed-out insert prompts auth, writes nothing).
  - Confirm `api.js`, `DeckImport.vue`, `LibrarySection.vue` are untouched.
- **Expected output:** Green test run, clean lint, a short smoke-test pass note.
- **Success criteria:** All 11 ACs verified; Definition of Done items checked; no regressions in `Library.vue` realtime refresh.
- **Blockers:** Steps 1–6.
- **Risks/mitigation:** Live YGOPRODeck dependency during smoke → if rate-limited, retry path (R2) should surface in the progress UI rather than hang.
- **Dependencies:** Steps 1–6 (all prior work).
- **Parallel with:** Nothing — final gate, runs solo.
- **Agent:** `general-purpose` (opus) — full AC sweep + judgment over the whole feature.
- **Wave:** 5

#### Verification
- **Level:** MEDIUM — Single judge. The final gate confirms the whole feature against the acceptance criteria, a green test run, and clean lint. A single judge reviewing the captured evidence (test output, lint output, smoke-test notes) against the rubric is appropriate; the upstream HIGH/Panel steps already covered the per-artifact risk in depth.
- **Judge inputs:** the captured `npm test` output, the lint output, the smoke-test pass note covering AC1–AC11, and the git status / diff confirming untouched files.
- **Threshold:** 4.0 / 5.0 (weighted total). The test-and-lint criterion is a hard gate: a red suite or lint failure fails the step regardless of total.
- **Rubric:**

  | Weight | Criterion | Measurable description |
  |--------|-----------|------------------------|
  | 0.35 | Tests & lint green | `cd frontend && npm test` runs the full vitest suite green, including `bulkAddParser.test.js`; the repo lint runs clean on the new/changed files. Evidence (captured output) is present, not merely asserted. |
  | 0.40 | Acceptance-criteria smoke coverage | A documented smoke pass exercises every AC: AC1/AC2 (mixed name + set-code paste), AC3 (nonsense line flagged/skipped), AC4 (ambiguous picker), AC6 (Trade vs Wishlist), AC7 (added/skipped summary reconciles), AC8 (empty input disabled, no lookups), AC9 (100+ line paste resolves + chunked insert + progress), AC10 (rows carry `extension:''`/`rarity:'common'`), AC11 (signed-out insert prompts auth, writes nothing). Each AC has a concrete observed result, not just a checkbox. |
  | 0.15 | Scope & regression integrity | `api.js`, `DeckImport.vue`, `LibrarySection.vue` confirmed untouched; `Library.vue` realtime refresh shows no regression. |
  | 0.10 | Definition-of-Done completeness | All DoD items are checked with corroborating evidence; i18n parity across the four locales confirmed (no fallback warnings). |

### Verification Summary

| Step | Artifact | Level | Threshold | Judge count |
|------|----------|-------|-----------|-------------|
| 1 | Harness + scaffold | None | — | 0 |
| 2 | `bulkAddParser.js` + unit test | Single judge | 4.0 | 1 |
| 3 | Resolver + insert helpers | Panel | 4.5 | 3 |
| 4 | `BulkAddCards.vue` dialog | Panel | 4.5 | 3 |
| 5 | `Library.vue` mount | Single judge | 4.0 | 1 |
| 6 | i18n four locales | Per-Item | 4.0 (per locale) | 4 (one per locale) |
| 7 | Verify & polish | Single judge | 4.0 | 1 |

**Totals:** 6 of 7 steps carry verification (Step 1 = None). 13 individual evaluations defined. Breakdown: Panel ×2 (Steps 3, 4), Per-Item ×1 (Step 6), Single judge ×3 (Steps 2, 5, 7), None ×1 (Step 1).

### Implementation Summary

| # | Step | Phase | Critical | Creates / Modifies | Key ACs / Risks |
|---|------|-------|----------|--------------------|-----------------|
| 1 | Confirm harness & scaffold | Setup | — | + parser.js, parser.test.js, BulkAddCards.vue (stubs) | baseline green |
| 2 | Parser + unit test | Foundational | ✅ | + bulkAddParser.js, bulkAddParser.test.js | AC1, AC2, R5 |
| 3 | Resolver + insert helpers | Foundational | ✅ | (within BulkAddCards.vue / helper) | AC2,3,9,10; R1,R2,R3,R4 |
| 4 | BulkAddCards.vue dialog | User Story | ✅ | BulkAddCards.vue | AC3–AC11; R7 |
| 5 | Library.vue mount | User Story | ✅ | M Library.vue | AC6, realtime refresh |
| 6 | i18n four locales | User Story | — | M en/fr/de/it.json | i18n req, R8 |
| 7 | Verify & polish | Polish | — | (no new files) | all ACs, DoD |

**Critical path:** Step 1 → Step 2 → Step 3 → Step 4 → Step 5 → Step 7 (Step 6 parallel to 2–5, required before Step 7).

---

## Parallelization Plan

### Wave diagram

```
Wave 0   ┌─ Step 1  Setup: harness + scaffold        (general-purpose · haiku)   [solo gate]
         └────────────────────────────────────────────────────────────────────────────────
Wave 1   ┌─ Step 2  Parser + unit test ★CRITICAL      (general-purpose · opus)   ┐
         │  Step 6a i18n initial pass (en/fr/de/it)   (general-purpose · sonnet) ┘  ‖ parallel
         └────────────────────────────────────────────────────────────────────────────────
Wave 2   ┌─ Step 3  Resolver + insert helpers ★CRIT.  (general-purpose · opus)   [depends 2]
         └────────────────────────────────────────────────────────────────────────────────
Wave 3   ┌─ Step 4  BulkAddCards.vue dialog ★CRIT.    (general-purpose · opus)   [solo, ⚠ HIGHEST RISK]
         └────────────────────────────────────────────────────────────────────────────────
Wave 4   ┌─ Step 5  Library.vue mount ★CRITICAL       (general-purpose · sonnet) ┐
         │  Step 6b i18n final reconciliation pass    (general-purpose · sonnet) ┘  ‖ parallel
         └────────────────────────────────────────────────────────────────────────────────
Wave 5   └─ Step 7  Verify & polish                   (general-purpose · opus)   [solo final gate]
```

Critical path (longest dependency chain): **Step 1 → 2 → 3 → 4 → 5 → 7** (6 sequential waves).
**Max parallelization depth (widest wave): 2 concurrent steps** — Waves 1 and 4 each run two steps side by side.

### Sub-agent execution directive (MUST run in parallel where marked)

When executing, dispatch each wave as follows. **Do not start a wave until every step in the previous wave has completed and verified.**

- **Wave 0 (sequential):** Run Step 1 alone. It scaffolds the file paths and confirms the green baseline that every later step assumes — nothing else may start until it passes.
- **Wave 1 (PARALLEL — 2 concurrent agents):** Dispatch **Step 2 (parser)** and **Step 6a (i18n initial pass)** in the *same batch* as two independent sub-agents. They share no files (parser logic vs. locale JSON) and have no ordering between them. **They MUST run concurrently.**
- **Wave 2 (sequential):** Run **Step 3 (resolver)** alone — it consumes `parseBulkLines`/`isSetCode` from Step 2. (Step 6a may still be finishing from Wave 1; that is fine, but no *new* step joins Step 3.)
- **Wave 3 (SOLO — highest risk):** Run **Step 4 (dialog)** entirely alone. Per the Judge note it is the highest-risk step; give it an undivided context budget and run a `pr-review-toolkit:code-reviewer` pass on the resulting diff before advancing.
- **Wave 4 (PARALLEL — 2 concurrent agents):** Dispatch **Step 5 (Library mount)** and **Step 6b (i18n final reconciliation)** in the same batch. The mount touches `Library.vue`; the i18n pass touches only the four locale JSONs — disjoint files, so **they MUST run concurrently.**
- **Wave 5 (sequential):** Run **Step 7 (verify & polish)** alone after all six steps land — the final AC sweep and lint gate.

**Agent distribution:** opus ×4 (Steps 2, 3, 4, 7) · sonnet ×3 dispatches (Steps 5, 6a, 6b) · haiku ×1 (Step 1). All steps use `general-purpose` (the `sdd:*` agents are not installed in this repo). Tier rationale: opus on the foundational/complex/judgment steps (parser regex, async resolver, the high-risk dialog, final verification); sonnet on the mechanical, well-templated steps (locale edits, the `DeckImport`-mirroring mount).

### Definition of Done
- [ ] All 11 acceptance criteria (AC1–AC11) pass via manual smoke + unit tests.
- [ ] `frontend/src/lib/bulkAddParser.test.js` exists and is green under `vitest run`; full suite passes.
- [ ] `bulkAdd.*` keys present and consistent across en, fr, de, it (no fallback warnings).
- [ ] Inserted rows always carry `extension: ''` and `rarity: 'common'` (never null); inserts chunk at ≤500.
- [ ] `BulkAddCards.vue` emits `added(count)` and `requireAuth` matching the `DeckImport.vue` contract; mounted in `Library.vue` with `onBulkAdded` snackbar.
- [ ] `api.js`, `DeckImport.vue`, `LibrarySection.vue` unchanged.
- [ ] Lint clean; code reviewed.
