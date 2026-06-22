# Feature: Set Collection Progress & Missing Cards

## Type
feature

## User Request
"How could we entertain more the users on this application?"

## Summary
Show logged-in users how many cards from each set they already own, display a completion percentage, and highlight the exact cards they're missing — each with a direct "Find a trade" shortcut. This turns passive browsing into an active collecting goal and drives trades naturally.

# Description

The app currently shows set pages with all cards in a Yu-Gi-Oh! set but gives logged-in collectors no sense of their progress toward owning that set. Without a visible collecting goal, users browse passively and have no prompt to initiate trades. This feature adds a collection-progress overlay to the set page that computes, client-side, how many cards the user owns from that set and which ones they are missing — creating a direct motivation loop: see the gap → click "find a trader" → propose a trade.

"Owned" is defined as cards in the user's trade-pile (wish=false, status not 'traded') stored in the platform database. Cards with status='locked' (in-flight trades) still count as owned. Multiple copies of the same card count as one. Guest users are not shown any personal data; they see a CTA inviting them to log in.

The progress overlay is rendered entirely client-side after the set page loads and must not affect the pre-rendered static HTML (vite-ssg SEO pipeline) or block the set card grid from appearing.

**Scope**:
- Included: Progress bar (owned / total, percentage) on set page for logged-in users; missing cards list sorted rarest-first; per-missing-card "Find traders" link to the card page; guest CTA with login link; loading skeleton; error state; edge states (0% and 100%)
- Excluded: Library page set-completion summary across all sets (separate future task); push notifications for missing card availability; achievement badges; any changes to the database schema

**User Scenarios**:
1. **Primary Flow**: A logged-in collector visits `/en/set/Legend-of-Blue-Eyes-White-Dragon`. After the set card grid renders, a progress bar appears showing "You own 12/115 cards (10%)" and below it a "Missing Cards" section lists the 103 cards they don't have, sorted rarest-first, each with a "Find traders" button that navigates to the card's dedicated page.
2. **Alternative Flow — Guest**: An unauthenticated visitor on the same page sees the full set card grid but the progress section shows only a locked placeholder: "Log in to see your collection progress" with a login link. No personal data is fetched or rendered.
3. **Error Handling**: If the library fetch fails after the page loads, the progress section shows "Could not load collection data. Try refreshing." The set card grid and all other page content remain unaffected.

## Acceptance Criteria

Clear, testable criteria using Given/When/Then format:

### Functional Requirements

- [ ] **Progress bar accuracy**: Shows correct owned/total count and percentage.
  - Given: A logged-in user owns 3 cards from a set with 10 total cards
  - When: The set page finishes loading
  - Then: The progress section displays "3/10 cards (30%)" with a filled progress bar at 30%

- [ ] **Zero-progress state**: Handled gracefully when user owns no cards from the set.
  - Given: A logged-in user has no cards from the current set
  - When: The set page finishes loading
  - Then: The progress section displays "0/N cards (0%)" and all N set cards appear in the missing cards list

- [ ] **Full-completion state**: Handled gracefully when user owns every card in the set.
  - Given: A logged-in user owns every card in the current set
  - When: The set page finishes loading
  - Then: The progress section shows 100% and the missing cards section shows "You own every card in this set!" (no card list)

- [ ] **Missing cards rarity sort**: Cards in the missing list are ordered rarest-first.
  - Given: A logged-in user is missing cards of varying rarities (e.g. Ultra Rare, Common, Secret Rare)
  - When: The missing cards section renders
  - Then: Secret Rare cards appear before Ultra Rare, Ultra Rare before Super Rare, Super Rare before Rare, Rare before Common; cards of equal rarity are ordered alphabetically by name

- [ ] **Find traders navigation**: Clicking a missing card navigates to its card page.
  - Given: A logged-in user sees a card in the missing cards list
  - When: The user clicks that card
  - Then: The router navigates to `/[locale]/card/[card_id]` where locale matches the current route and card_id is the YGOProdeck numeric ID of that card

- [ ] **Guest CTA visible**: Unauthenticated users see a login prompt instead of progress data.
  - Given: An unauthenticated visitor is on a set page
  - When: The page loads
  - Then: The progress section area shows "Log in to see your collection progress" with a link to the login page

- [ ] **Guest data isolation**: No user-specific data is fetched or rendered for guests.
  - Given: An unauthenticated visitor is on a set page
  - When: The page loads and network requests are observed
  - Then: No request to the user library data source is made; no card count or missing list is rendered in the DOM

- [ ] **Non-blocking loading skeleton**: Library fetch does not block the set card grid.
  - Given: A logged-in user navigates to a set page and the library query is in-flight
  - When: The set card grid has rendered but the library query has not yet resolved
  - Then: The set card grid is fully visible; the progress/missing area shows a skeleton or spinner

- [ ] **Locked cards count as owned**: Cards with locked status are included in the owned count.
  - Given: A logged-in user has a card with status='locked' that belongs to the current set
  - When: The set page finishes loading
  - Then: That card is counted in the owned total and does not appear in the missing cards list

- [ ] **Traded cards excluded from owned**: Cards with traded status are not counted as owned.
  - Given: A logged-in user has a card with status='traded' that belongs to the current set
  - When: The set page finishes loading
  - Then: That card is NOT counted in the owned total and DOES appear in the missing cards list

- [ ] **De-duplication by card ID**: Multiple copies of the same card count as one for progress.
  - Given: A logged-in user has 2 copies (different quantity or separate rows) of the same card from the set
  - When: The set page finishes loading
  - Then: That card is counted once in the owned total and does not appear in the missing cards list

- [ ] **Library fetch error state**: A graceful error is shown if the library query fails.
  - Given: A logged-in user is on a set page and the library data source returns an error
  - When: The query resolves with an error
  - Then: The progress section shows "Could not load collection data. Try refreshing."; the set card grid and rarity distribution remain fully functional

### Non-Functional Requirements

- [ ] **Performance**: Progress section renders within 2 seconds of the set page becoming interactive on a standard broadband connection.

- [ ] **SSG pipeline integrity**: Running the vite-ssg build produces no auth-related errors and the pre-rendered set page HTML does not contain any user-specific progress data.

- [ ] **Locale compatibility**: The progress section renders correctly (labels translated) when the user is on any supported locale route (/en/, /fr/, /de/, /it/).

- [ ] **Accessibility**: The progress bar element has an aria-label describing its value (e.g. "Collection progress: 12 of 115 cards owned").

### Definition of Done

- [ ] All acceptance criteria pass
- [ ] i18n keys added for all new UI strings (en, fr, de, it)
- [ ] No console errors introduced on set page for guest or logged-in users
- [ ] vite-ssg build completes without regression
- [ ] Code reviewed

## Architecture Overview

### Approach: Inline Options API extension of SetPage.vue

All new logic lives inside `frontend/src/components/Pages/SetPage.vue` — no new component files. The feature is implemented as an extension of the existing Options API structure (new prop, three new data fields, three new computed properties, one new method, and a template block).

### Auth Pattern

`SetPage.vue` currently has no `props`. A new prop `login: { type: Object, default: null }` is added. `App.vue` already forwards `:login="authenticated"` to all RouterView children, where `authenticated` has shape `{ user: { id, ... }, session }`. User ID is accessed via `this.login?.user?.id`.

### SSG Safety

Three new reactive fields are added to `data()` only — never in `setup()` or `onServerPrefetch`:
- `ownedIds: null` — becomes a `Set<number>` after the client-side fetch
- `collectionLoading: false`
- `collectionError: null`

The SSG pre-render snapshot always captures the initial null/false state, so no user data ever appears in static HTML. The `fetchOwnedIds()` method is called only from `mounted()`, which never runs during vite-ssg build.

### Data Flow

1. `mounted()` (or the end of `fetchCards()`) calls `fetchOwnedIds()` when `this.login` is set.
2. `fetchOwnedIds()` queries Supabase: `getClient().from('Card').select('image_id').eq('wish', false).eq('trader', userId).neq('status', 'traded')`.
3. Result is stored as `this.ownedIds = new Set(data.map(r => r.image_id))`.
4. Computed properties cross-reference `this.ownedIds` against `this.cards` entirely client-side.

This matches the pattern used by `Library.vue` (`getClient().from('Card').select('*').eq('wish', false).eq('trader', ...).neq('status', 'traded')`), narrowed to `select('image_id')` for a minimal payload.

### Computed Properties

- `ownedCount`: cards in `this.cards` whose `id` is in `this.ownedIds`
- `completionPct`: `Math.round(ownedCount / cardCount * 100)` (0 when not loaded)
- `missingCards`: `this.cards` filtered to IDs not in `this.ownedIds`, sorted by rarity rank then name alphabetically

Rarity sort order (constant at module level):
`Secret Rare = 0, Ultimate Rare = 1, Ultra Rare = 2, Super Rare = 3, Rare = 4, Common = 5, unknown = 99`

### Template Structure

A single `<div class="mb-6">` block is inserted after the rarity distribution section and before the card grid (within the `v-else` loaded state):
- `v-if="!login"` → guest CTA ("Log in to see your collection progress")
- `v-else-if="collectionLoading"` → loading skeleton
- `v-else-if="collectionError"` → error message with retry hint
- `v-else-if="ownedIds !== null"` → progress bar + missing cards list (or "all owned" message)

The progress bar element carries `aria-label="Collection progress: X of Y cards owned"` for accessibility.

### i18n — 6 New Keys Under `setPage.*`

| Key | Purpose |
|---|---|
| `collectionProgress` | Section heading |
| `ownedCount` | Interpolated `"{owned} / {total} cards ({pct}%)"` |
| `missingCards` | Subsection heading |
| `allOwned` | 100% completion message |
| `collectionError` | Error state message |
| `loginToTrack` | Guest CTA text |

Added to all four locale files: `en.json`, `fr.json`, `de.json`, `it.json`.

### Watch Reset

The existing `watch.$route.params.setSlug` handler also resets `ownedIds`, `collectionLoading`, and `collectionError` to their initial values. `fetchOwnedIds()` is triggered at the end of `fetchCards()` (client-side navigation) and at the end of the `mounted()` SSR hydration path.

### Expected File Changes

| File | Change |
|---|---|
| `frontend/src/components/Pages/SetPage.vue` | Add prop, 3 data fields, 3 computed, 1 method, template block |
| `frontend/src/locales/en.json` | 6 new `setPage.*` keys |
| `frontend/src/locales/fr.json` | 6 new `setPage.*` keys |
| `frontend/src/locales/de.json` | 6 new `setPage.*` keys |
| `frontend/src/locales/it.json` | 6 new `setPage.*` keys |

## Parallelization

```
Wave 1 (parallel)
├── Step 1 — i18n Keys         [sonnet]   en.json, fr.json, de.json, it.json
└── Step 2 — Core Logic        [claude]   SetPage.vue <script>
         |
         ▼ (Step 2 must complete before Step 3)
Wave 2 (sequential)
└── Step 3 — Template UI Block [sonnet]   SetPage.vue <template>
```

**Wave count**: 2
**Agent distribution**: claude ×1 (Step 2), sonnet ×2 (Steps 1 and 3)

## Sub-Agent Execution Directive

- **Wave 1**: Launch Step 1 (sonnet) and Step 2 (claude) in parallel. Both can start immediately with no prior dependency.
- **Wave 2**: After both Wave 1 agents complete, launch Step 3 (sonnet). Step 3 must not start until Step 2 is confirmed complete (computed properties and data fields must exist in the script before the template references them).
- Each agent should verify its own success criteria before reporting done.

## Implementation Process

### Step 1 — i18n Keys [i18n]

<!-- wave: 1 | parallel-with: Step 2 | agent: sonnet -->

**Goal**: Add 6 new `setPage.*` translation keys to all 4 locale files so the template can reference them without missing-key warnings.

**Estimate**: S

**Subtasks**:
1. Add 6 keys to `frontend/src/locales/en.json` under `setPage`
2. Add 6 keys to `frontend/src/locales/fr.json` under `setPage` (French translations)
3. Add 6 keys to `frontend/src/locales/de.json` under `setPage` (German translations)
4. Add 6 keys to `frontend/src/locales/it.json` under `setPage` (Italian translations)

**Keys and translations**:

| Key | en | fr | de | it |
|-----|----|----|----|----|
| `loginToTrack` | "Log in to track your collection" | "Connectez-vous pour suivre votre collection" | "Anmelden, um deine Sammlung zu verfolgen" | "Accedi per tracciare la tua collezione" |
| `collectionProgress` | "Your collection" | "Votre collection" | "Deine Sammlung" | "La tua collezione" |
| `ownedCount` | "You own {owned} of {total} cards ({pct}%)" | "Vous possédez {owned} cartes sur {total} ({pct}%)" | "Du besitzt {owned} von {total} Karten ({pct}%)" | "Possiedi {owned} carte su {total} ({pct}%)" |
| `missingCards` | "Missing cards" | "Cartes manquantes" | "Fehlende Karten" | "Carte mancanti" |
| `allOwned` | "You own every card in this set! 🎉" | "Vous possédez toutes les cartes de ce set ! 🎉" | "Du besitzt alle Karten dieses Sets! 🎉" | "Possiedi tutte le carte di questo set! 🎉" |
| `collectionError` | "Could not load collection data. Try refreshing." | "Impossible de charger les données. Rechargez la page." | "Sammlungsdaten konnten nicht geladen werden. Seite neu laden." | "Impossibile caricare i dati. Prova ad aggiornare." |

**Success Criteria**:
- All 4 locale files contain the 6 new keys under `setPage`
- JSON is valid after each edit (no trailing commas, correct nesting)
- Key names match exactly what the template `$t()` calls reference

**Blockers/Risks**: None. Pure JSON edits.

**Per-item verification**: Validate JSON syntax after each of the 4 locale file edits.

#### Verification

**Level**: LOW — Per-Item | **Threshold**: 3.5 / 5.0 | **Panel**: 1 judge per locale file

**Rubric** (applied independently to each of the 4 locale files):

| Criterion | Weight | Pass Condition |
|-----------|--------|----------------|
| Key completeness | 0.30 | All 6 keys present under `setPage` with exact names: `loginToTrack`, `collectionProgress`, `ownedCount`, `missingCards`, `allOwned`, `collectionError` |
| Interpolation syntax | 0.25 | `ownedCount` value contains exactly `{owned}`, `{total}`, `{pct}` — matching what the template passes as `$t('setPage.ownedCount', { owned, total, pct })` |
| Translation quality | 0.25 | Phrasing is natural in the target language; no literal word-for-word machine translation; context (collecting cards) is preserved |
| JSON validity | 0.20 | File passes JSON.parse without error; no trailing commas; new keys correctly nested inside existing `setPage` object; no duplicate keys |

**Decision rule**: Each file must individually score ≥ 3.5. A file that fails JSON validity scores 0 regardless of other criteria (invalid JSON blocks the build).

---

### Step 2 — Core Logic in SetPage.vue [script]

<!-- wave: 1 | parallel-with: Step 1 | agent: claude | blocks: Step 3 -->

**Goal**: Wire up the reactive data layer for collection progress — props, data, computed properties, the `fetchOwnedIds()` method, and watch/lifecycle hooks — without affecting the template or SSG pipeline.

**Estimate**: M

**Subtasks**:
1. Add import at top of `<script>`: `import { getClient } from '@/lib/supabaseClient'`
2. Add `props` section: `login: { type: Object, default: null }`
3. Extend `data()` with three new fields: `ownedIds: null`, `collectionLoading: false`, `collectionError: false`
4. Add module-level rarity rank constant (above `export default`):
   ```js
   const RARITY_RANK = { 'Secret Rare': 0, 'Ultimate Rare': 1, 'Ultra Rare': 2, 'Super Rare': 3, 'Rare': 4, 'Common': 5 }
   ```
5. Add `fetchOwnedIds()` method:
   - Guard: `if (!this.login?.user?.id) return`
   - Set `this.collectionLoading = true`, `this.collectionError = false`
   - Query: `getClient().from('Card').select('image_id').eq('wish', false).eq('trader', this.login.user.id).neq('status', 'traded')`
   - On success: `this.ownedIds = new Set(data.map(r => String(r.image_id)))` (string coercion for type safety)
   - On error: `this.collectionError = true; this.ownedIds = null`
   - Always: `this.collectionLoading = false`
6. Add computed properties:
   - `ownedCount`: `this.ownedIds ? this.cards.filter(c => this.ownedIds.has(String(c.id))).length : 0`
   - `completionPct`: `this.cards.length && this.ownedIds ? Math.round((this.ownedCount / this.cards.length) * 100) : 0`
   - `missingCards`: `this.ownedIds ? this.cards.filter(c => !this.ownedIds.has(String(c.id))).sort((a, b) => { const ra = RARITY_RANK[a.rarity] ?? 99; const rb = RARITY_RANK[b.rarity] ?? 99; return ra !== rb ? ra - rb : a.name.localeCompare(b.name) }) : []`
7. Update `mounted()`: after loading cards from `ssrSetData`, add `if (this.login?.user?.id) this.fetchOwnedIds()`
8. Update `fetchCards()` method: at the end (after `this.ssrSetData = { ... }`), add `if (this.login?.user?.id) this.fetchOwnedIds()`
9. Update watch `'$route.params.setSlug'`: add reset lines `this.ownedIds = null; this.collectionLoading = false; this.collectionError = false` before calling `fetchCards()`

**Success Criteria**:
- `fetchOwnedIds()` is never invoked during vite-ssg build (only called from `mounted()` and `fetchCards()`, both client-only)
- `ownedIds` remains `null` in initial data — SSG snapshot stays clean
- Computed properties return correct values for 0%, partial, and 100% ownership scenarios
- Rarity sort: Secret Rare < Ultimate Rare < Ultra Rare < Super Rare < Rare < Common < unknown; ties broken alphabetically by name
- De-duplication: Set semantics ensure same `image_id` counted once even if multiple DB rows
- No console errors when `login` is `null` (guest path)

**Blockers/Risks**:
- **HIGH**: `image_id` in the Supabase Card table may be stored as a string while `card.id` from YGOProdeck is a number — `Set.has()` uses strict equality so `has(88141791) !== has("88141791")`. **Mitigation**: `String()` coercion applied on both sides (in fetchOwnedIds and computed filters).
- **MEDIUM**: `getClient()` must only be called in browser context. Confirmed safe since `fetchOwnedIds()` is only reachable from `mounted()` and client-side `fetchCards()`, never from `onServerPrefetch`.

**Panel verification (critical)**: After implementation, manually log `this.ownedIds` to verify type consistency and correct population.

#### Verification

**Level**: CRITICAL — Panel of 2 | **Threshold**: 4.5 / 5.0 | **Panel**: 2 independent judges, averaged

**Rubric**:

| Criterion | Weight | Pass Condition |
|-----------|--------|----------------|
| Auth guard correctness | 0.25 | `login` prop declared as `{ type: Object, default: null }`; `fetchOwnedIds()` returns immediately when `this.login?.user?.id` is falsy; `data()` initializes all three fields: `ownedIds: null`, `collectionLoading: false`, `collectionError: false` |
| Supabase query accuracy | 0.25 | `getClient` imported from `@/lib/supabaseClient` (not already present — must be added); query uses `.from('Card').select('image_id').eq('wish', false).eq('trader', this.login.user.id).neq('status', 'traded')`; pattern matches Library.vue approach with minimal `select('image_id')` projection |
| Type coercion safety | 0.20 | `String()` coercion applied when building the Set: `new Set(data.map(r => String(r.image_id)))`; `String()` also applied in all three computed property filters: `this.ownedIds.has(String(c.id))`; absence of coercion on either side scores 0 for this criterion |
| Computed correctness | 0.20 | `ownedCount` returns 0 when `ownedIds` is null; `completionPct` guards against division by zero (`this.cards.length > 0`); `missingCards` returns `[]` when `ownedIds` is null; rarity sort order is Secret Rare=0, Ultimate Rare=1, Ultra Rare=2, Super Rare=3, Rare=4, Common=5, unknown=99; equal-rarity ties broken with `localeCompare` |
| SSG safety | 0.10 | `fetchOwnedIds()` is NOT called from `onServerPrefetch()` or `setup()`; all three new reactive fields live in `data()` not `setup()` refs; `mounted()` and `fetchCards()` are the only call sites; watch handler resets all three fields before re-fetching |

**Decision rule**: Both judges score independently. Average must reach 4.5. If either judge flags the type coercion criterion as failing (0 weight contribution from that criterion), the step is blocked — this is the HIGH-risk item that would silently break the feature for all users.

---

### Step 3 — Template UI Block [template]

<!-- wave: 2 | depends-on: Step 2 | agent: sonnet -->

**Goal**: Insert the collection progress section (progress bar + missing cards grid) between the rarity distribution pills and the card grid in `SetPage.vue`'s template.

**Estimate**: S

**Subtasks**:
1. Locate insertion point in template: after the closing `</div>` of the rarity distribution pills block (`<div v-if="rarityDistribution.length" class="flex flex-wrap gap-2 mb-6">`), before the `<!-- Card grid -->` div
2. Insert the `<div class="mb-6">` block with four mutually exclusive branches:
   - `v-if="!login"` → guest CTA ("🔒 Log in to track your collection")
   - `v-else-if="collectionLoading"` → loading skeleton (`animate-pulse` div)
   - `v-else-if="collectionError"` → error message ("⚠️ Could not load collection data. Try refreshing.")
   - `v-else-if="ownedIds !== null"` → progress bar + owned count + missing cards list (or allOwned message)

**Template block to insert** (corrected from spec — uses `ownedIds !== null` guard):
```html
<!-- Collection progress — logged-in users only, client-side -->
<div class="mb-6">
  <!-- Guest CTA -->
  <div v-if="!login" class="text-sm py-3 px-4 rounded-lg" style="background: var(--c-surface-2); color: var(--c-muted)">
    🔒 {{ $t('setPage.loginToTrack') }}
  </div>
  <!-- Loading skeleton -->
  <div v-else-if="collectionLoading" class="h-10 rounded-lg animate-pulse" style="background: var(--c-surface-2)" />
  <!-- Error state -->
  <div v-else-if="collectionError" class="text-sm py-3 px-4 rounded-lg" style="background: var(--c-surface-2); color: var(--c-muted)">
    ⚠️ {{ $t('setPage.collectionError') }}
  </div>
  <!-- Progress (data loaded) -->
  <div v-else-if="ownedIds !== null">
    <p class="text-sm font-semibold mb-2" style="color: var(--c-text)">{{ $t('setPage.collectionProgress') }}</p>
    <div class="w-full rounded-full h-2 mb-1 overflow-hidden" style="background: var(--c-surface-2)">
      <div class="h-2 rounded-full transition-all" :style="{ width: completionPct + '%', background: 'var(--c-accent)' }" :aria-label="$t('setPage.ownedCount', { owned: ownedCount, total: cards.length, pct: completionPct })" role="progressbar" />
    </div>
    <p class="text-xs mb-4" style="color: var(--c-muted)">{{ $t('setPage.ownedCount', { owned: ownedCount, total: cards.length, pct: completionPct }) }}</p>
    <!-- All owned celebration -->
    <p v-if="missingCards.length === 0" class="text-sm" style="color: var(--c-accent)">{{ $t('setPage.allOwned') }}</p>
    <!-- Missing cards list -->
    <template v-else>
      <p class="text-xs font-bold uppercase tracking-wide mb-2" style="color: var(--c-muted)">{{ $t('setPage.missingCards') }} ({{ missingCards.length }})</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
        <router-link v-for="card in missingCards" :key="card.id" :to="`/${$route.params.locale || 'en'}/card/${card.id}`" class="no-underline rounded-lg overflow-hidden opacity-60 hover:opacity-100 transition-opacity flex flex-col" style="background: var(--c-surface-2)">
          <img v-if="card.image" :src="card.image" :alt="card.name" loading="lazy" class="w-full aspect-[59/86] object-cover" />
          <div class="p-1.5">
            <p class="text-xs font-semibold leading-tight line-clamp-2" style="color: var(--c-text)">{{ card.name }}</p>
            <p class="text-xs" style="color: var(--c-muted)">{{ card.rarity }}</p>
          </div>
        </router-link>
      </div>
    </template>
  </div>
</div>
```

**Success Criteria**:
- Guest (no login) sees only the CTA block; no library fetch occurs
- Loading state: skeleton visible while `collectionLoading === true`
- Error state: error message visible if `collectionError === true`
- Progress block renders once `ownedIds !== null` (after fetch resolves)
- Progress bar `width` style correctly reflects `completionPct`
- Missing cards grid: each card is a `router-link` to `/[locale]/card/[id]` with lazy-loaded image, name, rarity
- `allOwned` message shown when `missingCards.length === 0`
- No regressions to existing set card grid, rarity pills, or page SEO

**Blockers/Risks**: Low. Entirely depends on Step 2 computed props being correct. The template is pure presentation logic with no independent risk.

**Single verification**: Confirm all 4 template branches render correctly in-browser (guest, loading, error, data-loaded).

#### Verification

**Level**: HIGH — Single Judge | **Threshold**: 4.0 / 5.0 | **Panel**: 1 judge

**Rubric**:

| Criterion | Weight | Pass Condition |
|-----------|--------|----------------|
| Guest CTA | 0.15 | `v-if="!login"` branch present and renders `$t('setPage.loginToTrack')` text when `login` is null; no library fetch triggered; no personal data in DOM |
| Loading skeleton | 0.15 | `v-else-if="collectionLoading"` branch renders an `animate-pulse` element; main card grid remains visible (skeleton is inside the progress block only) |
| Error state | 0.15 | `v-else-if="collectionError"` branch renders `$t('setPage.collectionError')` text; card grid and rarity pills are unaffected |
| Progress bar correctness | 0.20 | `v-else-if="ownedIds !== null"` branch renders progress bar with `:style="{ width: completionPct + '%' }"`; inner fill element has `role="progressbar"` and `aria-label` containing owned/total/pct values; `$t('setPage.ownedCount', { owned: ownedCount, total: cards.length, pct: completionPct })` text displayed below bar |
| All-owned message | 0.10 | When `missingCards.length === 0`, renders `$t('setPage.allOwned')` text and no card grid; when `missingCards.length > 0`, renders missing cards grid instead |
| Missing cards grid | 0.15 | Each card is a `router-link` with `:to` resolving to `/${$route.params.locale \|\| 'en'}/card/${card.id}`; tiles have `opacity-60` class; lazy-loaded image, card name, and rarity displayed |
| Insertion point / no regression | 0.10 | Block inserted after rarity distribution pills and before the card grid, inside the `v-else` loaded state; existing card grid, rarity pills, H1, and loading/error states are unaffected |

**Decision rule**: Score must reach 4.0. Any template branch that is entirely missing (not just styled differently) scores 0 for that criterion. The no-regression criterion fails if the existing card grid is broken or shifted.

---

## Implementation Summary

| Step | Scope | Files | Estimate | Risk | Dependency | Wave | Agent |
|------|-------|-------|----------|------|------------|------|-------|
| 1 — i18n keys | 6 `setPage.*` keys in 4 locale files | `en.json`, `fr.json`, `de.json`, `it.json` | S | Low | None | 1 | sonnet |
| 2 — Core logic | Props, data, computed, method, watch/lifecycle | `SetPage.vue` (script) | M | **HIGH** (image_id type coercion) | None | 1 | claude |
| 3 — Template | Progress UI block | `SetPage.vue` (template) | S | Low | Step 2 | 2 | sonnet |

**Recommended execution order**: (Steps 1 + 2 in parallel) → Step 3

## Verification Summary

| Step | Criticality | Panel Size | Threshold | Criteria Summary | Key Blocking Risk |
|------|-------------|------------|-----------|------------------|-------------------|
| Step 1 — i18n ×4 locale files | LOW | 1 judge per file | 3.5 / 5.0 | Key completeness (0.30), interpolation syntax (0.25), translation quality (0.25), JSON validity (0.20) | JSON invalidity auto-fails the file (build-breaking); interpolation var names `{owned}`, `{total}`, `{pct}` must exactly match template call |
| Step 2 — SetPage.vue core logic | CRITICAL | Panel of 2 | 4.5 / 5.0 | Auth guard (0.25), Supabase query accuracy (0.25), type coercion safety (0.20), computed correctness (0.20), SSG safety (0.10) | Missing `getClient` import; absent `String()` coercion silently causes 0% ownership for all users (HIGH); division-by-zero in `completionPct` |
| Step 3 — SetPage.vue template | HIGH | 1 judge | 4.0 / 5.0 | Guest CTA (0.15), loading skeleton (0.15), error state (0.15), progress bar + aria (0.20), all-owned message (0.10), missing cards grid (0.15), no regression (0.10) | Entirely missing template branches score 0 for that criterion; insertion point outside `v-else` would break SSG snapshot |

**High-risk step**: Step 2 — the `image_id` string/number type mismatch must be verified to prevent the progress feature silently showing 0% ownership for all users.

## Definition of Done

- [ ] 6 new `setPage.*` keys present and correctly translated in all 4 locale files; JSON valid
- [ ] `SetPage.vue` declares `login` prop, 3 new data fields (`ownedIds`, `collectionLoading`, `collectionError`), module-level `RARITY_RANK` constant
- [ ] `fetchOwnedIds()` method implemented with `getClient().from('Card').select('image_id')` query and `String()` coercion
- [ ] 3 computed properties (`ownedCount`, `completionPct`, `missingCards`) implemented with rarity sort
- [ ] `mounted()` and `fetchCards()` both trigger `fetchOwnedIds()` when `login` is set
- [ ] Watch `'$route.params.setSlug'` resets all 3 new data fields on route change
- [ ] Collection progress UI block inserted between rarity pills and card grid
- [ ] Guest sees CTA; logged-in user sees progress bar + missing cards (or allOwned message)
- [ ] vite-ssg build produces no user-specific data in pre-rendered set page HTML
- [ ] No console errors for guest or logged-in user on set page
- [ ] image_id type coercion verified (string/number) — HIGH RISK item confirmed safe
