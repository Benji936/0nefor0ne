---
title: YDK Deck Import
type: feature
spec: YDK_IMPORT_PROMPT.md
---

# YDK Deck Import

## Description

Allow users to import a `.ydk` deck file, see at a glance which cards they already own vs. are missing, and push missing cards into their existing wishlist to surface traders via the existing `find_matches` flow.

Reference spec: `YDK_IMPORT_PROMPT.md`

Key fact: `card.id` is the Konami passcode — the same 8-digit number in YDK files. No local card DB needed.

## Acceptance Criteria

1. A user can import a `.ydk` file via drag-and-drop or file picker on the Library page
2. After import, a summary shows: total cards, owned, missing, unrecognized
3. Owned cards render normally; missing cards are greyed-out with a "Missing" badge; unrecognized passcodes show an "Unrecognized" badge
4. "Add X missing to wishlist" button adds all missing cards to `wished_cards` via the **exact same path** as `AddCard.vue mode="wish"` — no parallel insert
5. After adding, existing `find_matches` flow surfaces traders who have those cards
6. YDK parser handles: comments, duplicates (qty), all 3 sections (`#main`, `#extra`, `!side`), trailing garbage — malformed files degrade gracefully, never crash
7. Unrecognized passcodes (alt-art/fake) show as "unrecognized" instead of failing the whole import
8. Import/overlay works for unauthenticated visitors; "add to wishlist" requires auth (reuses existing `requireAuth` emit / `AuthDialog` pattern)
9. All user-facing strings go through `$t()` with keys in en/fr/de/it locale files
10. `npm run build` succeeds

## Non-goals

- No deck builder, banlist, hand simulator, combo display
- No YDK export
- No new card database or schema migrations

## Implementation Process

### Step 1: YDK Parser — src/lib/ydk.js [DONE] [standard]

**Parallel with:** Step 2, Step 3

Create `src/lib/ydk.js` with a pure `parseYdk(text)` function and unit tests.

#### Subtasks
- [ ] Create `src/lib/ydk.js` exporting `parseYdk(text)`
- [ ] Return `{ main: [{id, qty}], extra: [{id, qty}], side: [{id, qty}] }`
- [ ] Handle section markers: exactly `#main`, `#extra`, `!side` (note `!` for side)
- [ ] Skip comment lines (`#created by ...`, other `#...` lines that aren't section markers)
- [ ] Preserve quantity — repeated passcode = qty > 1
- [ ] Trim whitespace, ignore blank lines, ignore non-numeric junk gracefully (no throws)
- [ ] Create `src/lib/ydk.test.js` with unit tests covering: comments, duplicates, all 3 sections, trailing garbage, empty file

#### Expected Output
- `src/lib/ydk.js` — pure exported function `parseYdk(text)`
- `src/lib/ydk.test.js` — unit tests

#### Verification

**Level:** Single Judge
**Artifact:** `src/lib/ydk.js`, `src/lib/ydk.test.js`
**Threshold:** 4.0/5.0

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Parsing Correctness | 0.40 | Correctly handles all section markers (#main/#extra/!side), comments, duplicates, malformed lines |
| Return Shape | 0.20 | Returns `{ main, extra, side }` each as `[{id: number, qty: number}]` |
| Error Resilience | 0.20 | Never throws on malformed input; skips junk gracefully; handles empty sections |
| Test Coverage | 0.20 | Tests cover: comments, duplicates, 3 sections, garbage input, empty file |

---

### Step 2: Batch Card Fetch — src/api.js [DONE] [standard]

**Parallel with:** Step 1, Step 3

Add `getCardsByIds(ids)` to `src/api.js` using YGOPRODeck's comma-separated batch endpoint.

#### Subtasks
- [ ] Read `src/api.js` to understand existing axios instance, base URL, error-handling patterns
- [ ] Add `export function getCardsByIds(ids)` — calls `cardinfo.php?id=1,2,3,...`
- [ ] Chunk into batches of ≤100 IDs if the deck is large
- [ ] Return `{ [id]: cardData }` map for easy lookup
- [ ] Omit unresolvable IDs from result (do NOT throw); API 400/404 for unknown IDs = skip silently

#### Expected Output
- `src/api.js` — `getCardsByIds(ids)` export added

#### Verification

**Level:** Single Judge
**Artifact:** `src/api.js`
**Threshold:** 4.0/5.0

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Pattern Alignment | 0.35 | Matches existing api.js style — axios usage, error handling, named export |
| Batch Endpoint Usage | 0.30 | Uses comma-separated IDs in URL; handles chunking for large decks (>100 IDs) |
| Graceful Degradation | 0.20 | Unresolvable IDs are silently omitted from result; no throws |
| Return Shape | 0.15 | Returns `{ [id]: cardData }` lookup map |

---

### Step 3: i18n Keys — 4 locale files [DONE] [standard]

**Parallel with:** Step 1, Step 2

Add `deckImport` section to all 4 locale files.

#### Subtasks
- [ ] Read `src/locales/en.json` to understand existing structure and key naming conventions
- [ ] Add `deckImport` key block to `src/locales/en.json` with real English text
- [ ] Add `deckImport` key block to `src/locales/fr.json` (mirror English if not translating; keys must exist)
- [ ] Add `deckImport` key block to `src/locales/de.json` (mirror English if not translating; keys must exist)
- [ ] Add `deckImport` key block to `src/locales/it.json` (mirror English if not translating; keys must exist)

Required keys (en.json values):
```json
"deckImport": {
  "title": "Import Deck (.ydk)",
  "dropzone": "Drop your .ydk file here, or click to browse",
  "summary": "{total} cards · {owned} owned · {missing} missing · {unrecognized} unrecognized",
  "addMissing": "Add {count} missing card to wishlist | Add {count} missing cards to wishlist",
  "allOwned": "You already own all cards in this deck!",
  "added": "1 card added to your wishlist | {count} cards added to your wishlist",
  "missingBadge": "Missing",
  "unknownBadge": "Unrecognized",
  "sections": {
    "main": "Main Deck",
    "extra": "Extra Deck",
    "side": "Side Deck"
  },
  "loading": "Resolving cards…",
  "error": "Failed to parse deck file"
}
```

#### Expected Output
- `src/locales/en.json` — deckImport section added
- `src/locales/fr.json` — deckImport section added
- `src/locales/de.json` — deckImport section added
- `src/locales/it.json` — deckImport section added

#### Verification

**Level:** Per-Item Judges
**Threshold:** 3.5/5.0

Items:
- `src/locales/en.json`
- `src/locales/fr.json`
- `src/locales/de.json`
- `src/locales/it.json`

| Criterion | Weight | Description |
|-----------|--------|-------------|
| All Keys Present | 0.50 | All required deckImport keys exist in the file, including nested sections.* |
| Valid JSON | 0.30 | File is valid JSON with no syntax errors |
| Structure Consistency | 0.20 | Key names and nesting match exactly across all 4 locale files |

---

### Step 4: DeckImport.vue Component [DONE] [CRITICAL]

**Depends on:** Step 1, Step 2, Step 3

Create `src/components/DeckImport.vue` — the core import UI.

#### Subtasks
- [ ] Read `src/components/AddCard.vue` to identify the exact Supabase wish-add call (table name, columns, payload shape)
- [ ] Read `src/components/CardYugi.vue` or `CardElement.vue` for existing card visual style (CSS vars, image usage)
- [ ] Read `src/lib/supabaseClient.js` to understand client export and auth pattern
- [ ] Read `src/lib/cardImage.js` to understand `cardImage(id)` helper
- [ ] **File drop zone**: drag-and-drop + click-to-browse using HTML5 File API (`<input type="file" accept=".ydk">`)
- [ ] **Parse**: `parseYdk(fileText)` → get `{ main, extra, side }`
- [ ] **Resolve**: `getCardsByIds(allUniqueIds)` → card data map
- [ ] **Ownership cross-reference**: query user's `trade_cards` (if logged in) → Set of owned IDs
- [ ] **Render card grid** by section (Main/Extra/Side): 3 visual states:
  - Owned: normal card display using `cardImage(id)`
  - Missing: greyed-out (`opacity-40` or similar) + "Missing" badge
  - Unrecognized: grey placeholder + "Unrecognized" badge
- [ ] **Summary bar**: total cards, owned count, missing count, unrecognized count
- [ ] **"Add X missing to wishlist" button**: inserts missing cards using exact same Supabase call as `AddCard.vue mode="wish"` — no new insert logic
- [ ] **Auth gate**: if user not logged in and clicks "add to wishlist", emit `requireAuth`; overlay always shows
- [ ] **Props**: `login` (Object | null)
- [ ] **Emits**: `requireAuth`, `added` (after successful insert)
- [ ] **Loading state** during API resolution (skeleton or spinner)
- [ ] **Error state** for malformed/unreadable files
- [ ] All strings via `$t('deckImport.*')`

#### Expected Output
- `src/components/DeckImport.vue` — new component

#### Verification

**Level:** Panel of 2 Judges
**Artifact:** `src/components/DeckImport.vue`
**Threshold:** 4.5/5.0

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Parser Integration | 0.15 | Correctly calls parseYdk() and maps returned {main,extra,side} structure |
| API Integration | 0.15 | Uses getCardsByIds() batch fetch; unresolved IDs → unrecognized state (not errors) |
| Ownership Overlay | 0.20 | Correctly cross-references trade_cards; 3 visual states rendered distinctly |
| Wishlist Add Path | 0.20 | Uses exact same Supabase call as AddCard.vue mode="wish"; no parallel insert |
| Auth Gate | 0.10 | Guests see overlay (read-only); requireAuth emitted on wishlist action |
| Vue/Project Patterns | 0.10 | Options API or Composition API consistent with project; $t() for all strings; CSS vars |
| UX Completeness | 0.10 | Summary bar, loading state, error state, section headers all present |

---

### Step 5: Library.vue Integration [DONE] [standard]

**Depends on:** Step 4

Add "Import deck (.ydk)" affordance to the Library page.

#### Subtasks
- [ ] Read `src/components/Pages/Library.vue` to understand page structure and how existing components are integrated
- [ ] Add an "Import deck (.ydk)" button in a logical location (page header area or above card grid)
- [ ] Import `DeckImport.vue`
- [ ] Show `DeckImport` panel as a section that appears when the button is clicked (toggle or modal-like reveal)
- [ ] Pass `login` prop to `DeckImport`
- [ ] Wire `@requireAuth` emit → existing `requireAuth` pattern in Library.vue
- [ ] Wire `@added` emit → brief success toast/message

#### Expected Output
- `src/components/Pages/Library.vue` — modified

#### Verification

**Level:** Single Judge
**Artifact:** `src/components/Pages/Library.vue`
**Threshold:** 4.0/5.0

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Integration Correctness | 0.40 | DeckImport correctly imported, props passed, emits wired (requireAuth + added) |
| Pattern Consistency | 0.35 | Follows existing Library.vue code style (same API for components, same CSS vars) |
| UX Placement | 0.25 | Import affordance is logically placed, doesn't break existing Library UI |

---

## Definition of Done

- [X] `src/lib/ydk.js` exists with `parseYdk()` that handles all edge cases
- [X] `src/lib/ydk.test.js` exists with passing unit tests
- [X] `src/api.js` has `getCardsByIds()` using batch endpoint
- [X] `src/components/DeckImport.vue` exists with owned/missing/unrecognized states and wishlist add
- [X] `src/components/Pages/Library.vue` has import affordance wired up
- [X] All 4 locale files have all required `deckImport.*` keys
- [X] `npm run build` succeeds with no errors
- [X] No raw i18n keys rendered in UI
- [X] Malformed YDK files do not crash the app
- [X] Auth gate works: guests see overlay; only logged-in users can add to wishlist
