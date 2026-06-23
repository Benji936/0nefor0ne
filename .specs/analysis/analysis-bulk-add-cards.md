# Codebase Impact Analysis — Bulk Add Cards (Paste-a-List)

**Task file:** `.specs/tasks/draft/bulk-add-cards.feature.md`
**Skill reference:** `.claude/skills/bulk-add-cards/SKILL.md`
**Date:** 2026-06-23

---

## 1. Files to Create

### 1a. `frontend/src/components/BulkAddCards.vue`

The main feature component. A `v-dialog`-wrapped multi-step wizard following the same Vuetify dialog pattern as `AddCard.vue` (Options API, `v-dialog v-model`, `@after-leave="reset"`).

**Logical steps:**
1. **Paste step** — `v-textarea` for the raw list, a Trade/Wishlist `v-btn-toggle` (defaults Trade = `wish: false`), and a "Resolve" button.
2. **Resolve step** — progress indicator while lines are resolved sequentially against YGOPRODeck. Shows `resolving X of N` text.
3. **Review step** — table of resolved rows. Matched rows show card thumbnail + name + qty. Ambiguous rows show a picker dropdown. Unmatched rows are flagged and excluded from insert. User can drop any row.
4. **Insert** — single `supabase.from('Card').insert(rows).select()` call. Emits `added(count)` on success.

**Props:**
- `mode: String` (default `'trade'`) — mirrors `AddCard.vue`'s mode prop; passed into the destination toggle initial state.

**Emits:**
- `added(count: number)` — same signature as `DeckImport.vue @added`
- `requireAuth()` — fires if auth check fails, same as `DeckImport.vue` line 373

**Imports needed:**
```js
import { searchCardByName, searchCardBySetCode, searchById } from '@/api'
import { getClient } from '@/lib/supabaseClient'
import { parseBulkLines, isSetCode } from '@/lib/bulkAddParser'
import { cardImage } from '@/lib/cardImage'
```

**Row shape to insert** (matches `AddCard.vue` lines 323–336, with safe bulk defaults):
```js
{
  wish:          isWish,           // boolean from toggle
  game:          'YGO',
  url:           `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${canonicalName}`,
  name:          card.name_en ?? card.name,
  extension:     '',               // NOT NULL — empty string, NOT null
  rarity:        'common',         // NOT NULL — explicit, NOT null
  quantity:      qty,              // parsed from line or 1
  trader:        userId,
  image_id:      card.id,
  language:      'English',
  condition:     'Near Mint',
  first_edition: false,
}
```

**Resolution logic per line:**
1. Parse `{ qty, query }` via `parseBulkLines()` from `bulkAddParser.js`
2. Detect set code vs name via `isSetCode(query)` (regex `/^[A-Z0-9]+-\w+$/i`)
3. Set-code path: `searchCardBySetCode(q)` → if result → `searchById(result.data.id)`
4. Name path: `searchCardByName(q)` → check exact name match first (case-insensitive)
5. Classify: `matched | ambiguous | unmatched`

**Rate limiting:** Loop sequentially with `await` (never parallel). For >20 lines, show `v-progress-linear` with `resolving X of N` text. A simple retry with 600 ms delay on Network Error is sufficient.

---

### 1b. `frontend/src/lib/bulkAddParser.js`

A pure, side-effect-free utility. No Vue, no Supabase, no API calls — unit-testable in isolation (alongside `ydk.test.js`).

**Exported functions:**
```js
/**
 * Parse a raw multi-line paste into an array of { qty, query }.
 * Skips blank lines and comment lines (starting with #).
 * Quantity prefixes: "3x Name", "x3 Name", "3 Name", "Name" (defaults qty=1).
 * @param {string} text
 * @returns {Array<{qty: number, query: string}>}
 */
export function parseBulkLines(text) { ... }

/**
 * Returns true if query looks like a set code (e.g. LOB-005, MAMA-EN001).
 * Uses /^[A-Z0-9]+-\w+$/i — only pass to searchCardBySetCode if true.
 * @param {string} query
 * @returns {boolean}
 */
export function isSetCode(query) { ... }
```

This parallels `frontend/src/lib/ydk.js` (`parseYdk`, lines 9–80) in role and structure. The SKILL.md provides the exact regex implementation (lines 24–32 and 41–43).

---

## 2. Files to Modify

### 2a. `frontend/src/components/Pages/Library.vue`

**Read before modifying:** Lines 1–200 (fully read in analysis).

**Changes:**

1. **Import** `BulkAddCards` alongside `DeckImport` (currently line 93):
   ```js
   import BulkAddCards from '@/components/BulkAddCards.vue'
   ```

2. **Register** in `components: { DeckImport, BulkAddCards }` (line 95).

3. **Add `showBulkAdd: false`** to `data()` (lines 99–112), alongside `showDeckImport: false`.

4. **Add toolbar button** in the template toolbar block (lines 12–53), next to the existing DeckImport toggle button. Both sit in the `flex items-center justify-between gap-3 flex-wrap` row.

5. **Mount the dialog** below the toolbar (after the `showDeckImport` panel, lines 47–53):
   ```html
   <div v-if="showBulkAdd" class="mt-4">
     <BulkAddCards
       @requireAuth="$emit('requireAuth')"
       @added="onBulkAdded"
     />
   </div>
   ```

6. **Add `onBulkAdded(count)` method** mirroring `onDeckImportAdded(count)` (lines 145–152):
   ```js
   onBulkAdded(count) {
     this.snackbar = {
       open:    true,
       message: this.$t('bulkAdd.added', count, { count }),
       color:   'var(--c-accent)',
       icon:    'mdi-playlist-plus',
     }
   }
   ```

**No change** to: `onCardAdded`, `onCardDeleted`, the `mounted()` data-fetch, or the realtime subscription. The Postgres realtime channel (lines 188–199) re-fetches both piles automatically after the bulk insert commits, so no manual row-prepending is needed in `onBulkAdded` (contrast with `onCardAdded` which does optimistic single-card prepend at lines 155–165).

---

### 2b. `frontend/src/components/Pages/library/LibrarySection.vue`

**No change required.** The bulk-add dialog lives at the `Library.vue` toolbar level with a destination toggle, not per-section. `LibrarySection` only renders `<AddCard :mode="mode" @added="emit('added', $event)" />` (line 26) and is not affected.

---

### 2c–2f. Locale files

All four locale files need a new `bulkAdd` object. Location: after the `addCard` block (lines 108–127 in `en.json`).

**`frontend/src/locales/en.json`** — source-of-truth keys:
```json
"bulkAdd": {
  "title": "Bulk add cards",
  "subtitle": "Paste a list — one card per line",
  "placeholder": "3x Blue-Eyes White Dragon\nAsh Blossom & Joyous Spring\nLOB-EN005",
  "destination": "Destination",
  "tradePile": "Trade pile",
  "wishlist": "Wishlist",
  "resolve": "Resolve cards",
  "resolving": "Resolving {current} of {total}…",
  "reviewTitle": "Review 1 card | Review {count} cards",
  "matched": "Matched",
  "ambiguous": "Multiple matches — pick one",
  "unmatched": "Not found",
  "remove": "Remove",
  "addAll": "Add 1 card | Add {count} cards",
  "adding": "Adding…",
  "added": "1 card added | {count} cards added",
  "skipped": "1 line skipped | {count} lines skipped",
  "noLines": "Paste at least one card name or set code.",
  "authRequired": "You must be signed in to add cards."
}
```

Plural keys (pipe-separated) follow the vue-i18n v9 convention already established in `deckImport.addMissing` and `deckImport.added` (lines 535–537 of `en.json`).

**`frontend/src/locales/fr.json`**, **`frontend/src/locales/de.json`**, **`frontend/src/locales/it.json`** — same key set, translated. Must be added in the same commit to avoid vue-i18n fallback warnings in non-English UIs.

---

### 2g. `frontend/src/api.js`

**No changes required.** All needed functions are already exported:

| Function | Line | Used for |
|----------|------|----------|
| `searchCardByName(fname)` | 19 | Fuzzy name resolution |
| `searchCardBySetCode(code)` | 26 | Set-code → card ID |
| `searchById(id, locale)` | 35 | Full card data after set-code hit |
| `getCardsByIds(ids[])` | 213 | Not needed by default (sequential is safer), available if batch-resolve is ever preferred |

`getWithRetry` (line 109) is private (not exported). The bulk resolver implements its own simple await-loop with a 600 ms delay on failure, or accepts transient failures (the review step lets users drop unmatched rows).

---

## 3. Reuse Points

### 3a. `AddCard.vue submit()` — canonical row shape (lines 308–348)

Must replicate the 12-field row in `BulkAddCards.vue`'s `buildRow()`:

| Field | AddCard.vue | BulkAddCards.vue |
|-------|-------------|------------------|
| `extension` | `this.extensionCode` (may be `null`) | `''` (empty string, NOT null) |
| `rarity` | `this.rarity` (may be `null`) | `'common'` (explicit) |
| `language` | user dropdown | `'English'` |
| `condition` | user dropdown | `'Near Mint'` |
| `first_edition` | user checkbox | `false` |
| `quantity` | user counter | parsed from line or `1` |

### 3b. `DeckImport.vue` batch insert (lines 380–421)

Reuse verbatim — with the `extension`/`rarity` fix:
```js
const { data: inserted, error } = await supabase
  .from('Card')
  .insert(rows)
  .select()
if (error) throw error
emit('added', inserted?.length ?? rows.length)
```

**Known DeckImport latent bug (lines 391–392):** sets `extension: null` and `rarity: null`. Confirmed as a bug; do NOT copy it. The analysis surface this intentionally so the implementer avoids repeating it.

### 3c. `ydk.js` `parseYdk` line-loop structure (lines 9–80)

Split → trim → skip blanks/comments → accumulate. The `parseBulkLines()` function in `bulkAddParser.js` follows this same structure.

### 3d. `AddCard.vue update()` name/set-code branching (lines 249–272)

Shows the fallback pattern: name search first, then set-code if empty. Bulk add inverts this: detect set-code via regex first (exact and fast), then name-search.

### 3e. `Library.vue onDeckImportAdded` handler (lines 145–152)

Template for `onBulkAdded`: same snackbar shape `{ open, message, color, icon }`, same count-emit contract.

---

## 4. Integration Points

### 4a. Auth gate

Check `supabase.auth.getUser()` **before the resolve phase** (SKILL.md recommendation), not just before insert. This matches `AddCard.vue submit()` lines 313–318. On failure, emit `requireAuth` (same as `DeckImport.vue` line 373) and abort without losing the pasted text.

### 4b. Realtime refresh

`Library.vue mounted()` subscribes to Postgres changes on the `Card` table (lines 188–199). Every insert triggers the callback, which re-fetches both piles. After bulk insert commits, the Library refreshes automatically — `onBulkAdded` only needs the snackbar.

### 4c. `newCardId` highlight ring

Not applicable for bulk inserts (too many cards). `onBulkAdded` correctly skips the `newCardId` pattern used by `onCardAdded` (lines 164–165).

### 4d. `Card` table column constraints

Confirmed from row shapes and task spec:
- `extension` — NOT NULL, no DB default → send `''`
- `rarity` — NOT NULL, DB default `'common'` but PostgREST sends explicit null from JS unless set → send `'common'`
- `game` — must be `'YGO'`
- `trader` — authenticated user UUID (from `supabase.auth.getUser()`)
- `wish` — boolean; determines which pile the card appears in
- `quantity` — integer ≥ 1

---

## 5. Risks

### R1 — `extension`/`rarity` NOT NULL constraint violation — **HIGH**
Sending `null` for either field causes a Postgres NOT NULL constraint violation, silently rejecting the entire batch insert. `DeckImport.vue` (lines 391–392) has this bug today. Always set `extension: ''` and `rarity: 'common'` in `buildRow()`. Add a defensive guard before insert: `rows.forEach(r => { if (r.extension == null) r.extension = ''; if (r.rarity == null) r.rarity = 'common'; })`.

### R2 — YGOPRODeck rate-limiting on large pastes — **HIGH**
YGOPRODeck enforces ~20 req/s burst. A 50-line paste fires 50 API calls; 200 lines → 10–20 s and potential Network Error rate-limit hits. Mitigate: resolve sequentially (one `await` per line), retry with 600 ms backoff on Network Error, show `v-progress-linear` with `resolving X of N` text. The review step lets users retry/drop failed lines.

### R3 — Fuzzy `searchCardByName` false positives — **MEDIUM**
`fname` is a substring match; "Ash" returns 30+ cards. Without exact-name gating, short queries are incorrectly classified as `ambiguous`. Mitigation: always check for exact case-insensitive name match before declaring `ambiguous` (SKILL.md lines 59–64).

### R4 — Large batch insert payload — **MEDIUM**
PostgREST has a payload size limit. 500+ rows in one insert may time out. Cap the dialog at 500 lines with a validation warning; for edge cases above 500, chunk at 500 and await each chunk.

### R5 — `searchCardBySetCode` crash on malformed input — **MEDIUM**
`api.js` line 28 does `split_code[1].replace(...)` — if `split_code[1]` is `undefined` (e.g., input is `LOB` or `LOB-`), this throws a TypeError. `isSetCode()` in `bulkAddParser.js` must use a strict regex `/^[A-Z0-9]+-[A-Z]*\d+$/i` to only pass valid codes to `searchCardBySetCode`.

### R6 — Duplicate cards — **LOW**
By design, bulk add allows duplicates (same as `AddCard.vue`). Optionally surface a post-insert banner "You may have duplicates." No blocking required.

### R7 — SSR / hydration safety — **LOW**
The dialog is pure client-side (user interaction required to open). No `window`/`document` at mount. `supabase` client is already SSR-safe in this repo. No guards needed.

### R8 — Locale coverage gaps — **LOW**
Missing `bulkAdd.*` keys in fr/de/it causes vue-i18n to fall back silently to the raw key string. Mitigate: add all four locale files in the same commit.

---

## 6. Summary

| Item | Path | Action |
|------|------|--------|
| Dialog component | `frontend/src/components/BulkAddCards.vue` | **CREATE** |
| Line parser utility | `frontend/src/lib/bulkAddParser.js` | **CREATE** |
| Library page (host) | `frontend/src/components/Pages/Library.vue` | **MODIFY** |
| EN locale | `frontend/src/locales/en.json` | **MODIFY** |
| FR locale | `frontend/src/locales/fr.json` | **MODIFY** |
| DE locale | `frontend/src/locales/de.json` | **MODIFY** |
| IT locale | `frontend/src/locales/it.json` | **MODIFY** |
| LibrarySection | `frontend/src/components/Pages/library/LibrarySection.vue` | NO CHANGE |
| API module | `frontend/src/api.js` | NO CHANGE |
| DeckImport | `frontend/src/components/DeckImport.vue` | NO CHANGE |

**Files to create:** 2
**Files to modify:** 5
**Overall risk:** MEDIUM-HIGH (NOT NULL trap and rate-limiting are the critical paths; both have clear mitigations)
