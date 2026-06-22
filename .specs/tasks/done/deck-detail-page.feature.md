---
title: Deck Detail Page
type: feature
skill: deck-management
---

# Deck Detail Page

## User Request

> "I want a specific view or page for viewing a deck and his card where we can select which card are missing and then add them to our wishlist."

## Description

The current accordion in DecksPage.vue is too compact for reviewing a full 60-card deck. Users need to scroll past other decks, can't share the view with anyone, and the lack of breathing room makes it hard to spot missing cards at a glance. A dedicated full-page route per deck solves this by giving the card grid proper screen real estate and making each deck URL bookmarkable and shareable.

The feature adds a new route `/[locale]/decks/:id` (e.g. `/en/decks/abc-123`) that renders a dedicated page for a single saved deck. The page displays the deck name, full card grid across Main Deck / Extra Deck / Side Deck sections with owned/missing/unrecognized visual states, a stats summary (total/owned/missing/unrecognized counts), and an "Add X missing cards to wishlist" button. Auth users load their deck from Supabase; guest users load from localStorage. A "Back to Decks" link returns to the deck list. If the deck ID is not found, a not-found state with a back link is shown.

The DecksPage accordion rows are updated to link to this detail page. The SSG build must not prerender any `/*/decks/*` routes (private/dynamic user data).

**Scope**:
- Included: route `/[locale]/decks/:id`, DeckDetailPage.vue component, full card grid (Main/Extra/Side) with owned/missing/unrecognized visual states, stats summary, "Add missing to wishlist" button with auth gate, back navigation, 404/not-found state, DecksPage deck row links, SSG exclusion, noindex meta
- Excluded: inline deck editing, public deck sharing, print/export, completion progress history

**User Scenarios**:
1. **Primary Flow**: Auth user clicks a deck in DecksPage → detail page loads → card grid shows owned/missing states → user clicks "Add missing to wishlist" → success snackbar → user returns to /[locale]/decks via back link
2. **Alternative Flow**: Guest user clicks a deck → detail page loads from localStorage → all cards show as missing → clicking wishlist button triggers login modal (requireAuth)
3. **Error Handling**: Deck ID not found → not-found message displayed with back link to /[locale]/decks

## Acceptance Criteria

### Functional Requirements

- [ ] **Route renders**: Navigating to `/[locale]/decks/:valid-id` mounts the deck detail page and displays deck content.
  - Given: App is running with a deck saved under that ID
  - When: User navigates to `/en/decks/:valid-id`
  - Then: Deck detail page renders with deck name and card grid visible

- [ ] **Page title equals deck name**: The browser `<title>` contains the deck's name when the page is loaded.
  - Given: A valid deck is loaded
  - When: The page renders
  - Then: `<title>` tag contains the deck name

- [ ] **Main/Extra/Side sections visible**: Three section headings (Main Deck, Extra Deck, Side Deck) are rendered when the deck has cards in all three sections.
  - Given: Deck has cards in Main, Extra, and Side sections
  - When: Page loads
  - Then: Three section headers with card counts are displayed

- [ ] **Owned card visual state**: Cards owned by the authenticated user are displayed at full opacity with no status badge.
  - Given: Auth user owns card X in the deck
  - When: Page renders
  - Then: Card X displays at full opacity with no "Missing" or "Unrecognized" badge

- [ ] **Missing card visual state**: Cards not owned by the authenticated user are dimmed with a red "Missing" badge.
  - Given: Auth user does not own card Y in the deck
  - When: Page renders
  - Then: Card Y displays at reduced opacity (0.35) with a red "Missing" badge at the bottom

- [ ] **Unrecognized card visual state**: Cards with IDs not found in the card database show a gray placeholder with an "Unrecognized" badge.
  - Given: Deck contains an unrecognized card ID
  - When: Page renders
  - Then: A gray placeholder card with an "Unrecognized" badge is displayed

- [ ] **Stats summary visible**: Total, owned, missing, and unrecognized card counts are displayed on the page.
  - Given: A valid deck is loaded
  - When: Page renders
  - Then: Counts for total, owned, missing (and unrecognized if > 0) are visible on the page

- [ ] **Add missing to wishlist (auth user)**: Authenticated users can add all missing cards to their wishlist via a button.
  - Given: Auth user is logged in and the deck has missing cards (missing > 0)
  - When: User clicks "Add X missing cards to wishlist"
  - Then: Missing card rows are inserted into the wishlist in Supabase and a success snackbar is shown

- [ ] **Wishlist auth gate (guest)**: Guest users clicking the wishlist button trigger the login modal instead of inserting data.
  - Given: User is not authenticated and the deck has missing cards
  - When: User clicks "Add X missing cards to wishlist"
  - Then: The `requireAuth` event is emitted and the login modal is triggered; no data is inserted

- [ ] **All owned state**: When the authenticated user owns all cards in the deck, a success alert is shown and no wishlist button is rendered.
  - Given: Auth user owns every card in the deck
  - When: Page renders
  - Then: "All owned" success alert is visible and no "Add missing" button is present

- [ ] **Back navigation**: A back link/button on the detail page navigates to `/[locale]/decks`.
  - Given: User is on DeckDetailPage
  - When: User clicks the back button/link
  - Then: User is navigated to `/[locale]/decks`

- [ ] **404 / not-found state**: Navigating to a deck ID that does not exist shows a not-found message with a back link.
  - Given: The deck ID in the URL does not exist in Supabase (auth) or localStorage (guest)
  - When: Page loads
  - Then: A not-found message is displayed and a link back to `/[locale]/decks` is present

- [ ] **DecksPage links to detail page**: Each deck row in DecksPage navigates to the detail page when clicked.
  - Given: User is on DecksPage with at least one saved deck
  - When: User clicks a deck row/name
  - Then: Navigation to `/[locale]/decks/:id` occurs

- [ ] **SSG build does not prerender deck detail routes**: The vite-ssg static build produces no HTML files under any `/*/decks/*` path.
  - Given: The vite-ssg build runs
  - When: Build output is inspected
  - Then: No files matching the pattern `/*/decks/*` exist in the `dist` directory

### Non-Functional Requirements

- [ ] **Security**: Supabase queries for deck data are scoped with `.eq('user_id', userId)` — a user cannot access another user's deck by guessing an ID.
- [ ] **SEO / Privacy**: Page includes a `noindex` meta tag to prevent search engine indexing of private user deck pages.
- [ ] **Performance**: Card grid renders within the same latency as the existing accordion expansion in DecksPage (no additional blocking network requests beyond what the accordion already performs).

### Definition of Done

- [ ] All 14 acceptance criteria pass
- [ ] Route added to router and SSG exclusion confirmed in build output
- [ ] DeckDetailPage.vue created; DeckSection reused or extracted as shared component
- [ ] DecksPage deck rows link to the detail page
- [ ] Code reviewed

---

## Architecture Overview

### Solution Strategy

`DeckDetailPage.vue` is introduced at route `/:locale/decks/:deckId`. On mount it reads the `deckId` route param, loads the matching deck from Supabase (auth users: `decks` table scoped with `.eq('user_id', userId)`) or from `localStorage` key `tm_guest_decks` (guests), then executes the same three-step stats pipeline already present in `DecksPage.computeStats()`:

1. `parseYdk(deck.ydk_content)` → `{ main, extra, side }` arrays of `{ id, qty }`
2. `getCardsByIds(allIds)` → `cardMap: { [numericId]: CardObject }`
3. Supabase `Card` table query → `ownedIds: Set<number>`

The rendered page consists of a back button, a deck stats header (total / owned / missing / unrecognized counts), the three-section card grid via `DeckSection`, and an "Add selected missing cards to wishlist" button with auth gate. A not-found state with back link handles missing deck IDs.

### DeckSection Extraction (Critical Shared Component)

`DeckSection` is currently an **inline `defineComponent` inside `DecksPage.vue`**. It must be extracted to `frontend/src/components/DeckSection.vue` and imported in both pages. This extraction is the highest-risk step: `DecksPage.vue` must be updated simultaneously to import from the new file so it remains identical in behavior. Do not copy-paste — extract and import.

Props contract (unchanged from current inline version):

```js
props: {
  entries:      Array,   // [{ id, qty }]
  cardMap:      Object,  // { [numericId]: CardObject }
  ownedIds:     Object,  // Set<number>
  title:        String,
  missingBadge: String,
  unknownBadge: String,
}
```

### Route Registration

Add to `localeChildren` in `frontend/src/router/index.js` **after** the existing `decks` entry:

```js
{ path: 'decks/:deckId', name: 'deckDetail', component: () => import(/* webpackChunkName: "deck-detail" */ '@/components/Pages/DeckDetailPage.vue') },
```

Add a legacy redirect alongside the existing `/decks` redirect:

```js
{ path: '/decks/:deckId', redirect: (to) => `/${detectLocale()}/decks/${to.params.deckId}` },
```

### DecksPage Modification

Each deck row in `DecksPage.vue` gains a navigation trigger — either a `<router-link>` wrapping the deck name/title or a small "View" icon button using `{ name: 'deckDetail', params: { locale: $route.params.locale, deckId: deck.id } }`. The existing accordion detail view (inline stats + wishlist button) may be retained as a compact shortcut or removed; it is out of scope for this task but the extraction of `DeckSection` must not break it.

Guest decks use `localId` (string from `Date.now()`) as the ID. Navigation and lookup must use `localId` for guests and `id` (UUID) for auth users. The detail page must apply the same branching.

### SSG Exclusion

No change to `frontend/vite.config.js`. The `ssgOptions.includedRoutes` function is an explicit allowlist; `/:locale/decks/:deckId` is not listed and will not be prerendered. `DeckDetailPage.vue` must call `useHead({ meta: [{ name: 'robots', content: 'noindex' }] })` to prevent indexing, matching the pattern already used in `DecksPage.vue`.

### Files to Create / Modify

| Action | File | Change |
|--------|------|--------|
| CREATE | `frontend/src/components/DeckSection.vue` | Extract inline `DeckSection` from `DecksPage.vue` into standalone SFC |
| CREATE | `frontend/src/components/Pages/DeckDetailPage.vue` | New page: loads deck by ID, runs stats pipeline, renders DeckSection × 3 |
| MODIFY | `frontend/src/router/index.js` | Add `decks/:deckId` child route + legacy redirect |
| MODIFY | `frontend/src/components/Pages/DecksPage.vue` | (a) Remove inline DeckSection, import from DeckSection.vue; (b) Add router-link/button on deck rows |
| MODIFY | `frontend/src/locales/en.json` | Add `decks.backToDecks`, `decks.notFound` keys |
| MODIFY | `frontend/src/locales/fr.json` | Same keys, French translations |
| MODIFY | `frontend/src/locales/de.json` | Same keys, German translations |
| MODIFY | `frontend/src/locales/it.json` | Same keys, Italian translations |

`vite.config.js`, `App.vue`, `api.js`, and all other pages are **unaffected**.

### Key Risks

1. **DeckSection extraction breaks DecksPage**: The inline component references closed-over variables from `DecksPage`'s script scope. All dependencies must be converted to explicit props before extraction. Test DecksPage accordion rendering after the move.
2. **404 / not-found state**: A missing or mismatched deck ID must render the not-found UI, not a blank page or JS error. Guard `this.deck = null` → show not-found template branch.
3. **Guest vs auth ID mismatch**: Auth deck IDs are UUIDs; guest IDs are `Date.now()` strings (`localId`). The load branch must correctly distinguish the two and look up the right field. A UUID-shaped param with a guest session (or vice versa) must fall through to the not-found state gracefully.
4. **Stats latency on mount**: Unlike the accordion (deferred until expanded), detail-page stats fire immediately. Show a loading spinner while `computeStats()` is in flight to prevent layout shift.

---

## Implementation Process

```
Parallelization Diagram
═══════════════════════

Wave 1 (all parallel)
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  Step 1         │   │  Step 2         │   │  Step 3         │
│  DeckSection    │   │  i18n keys      │   │  Router         │
│  extraction     │   │  (4 locales)    │   │  registration   │
│  [sonnet]       │   │  [sonnet]       │   │  [sonnet]       │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                     │                     │
         └──────────┬──────────┘                     │
                    │                                 │
Wave 2              ▼                                 ▼
         ┌─────────────────┐             ┌─────────────────┐
         │  Step 4         │             │  Step 5         │
         │  DeckDetailPage │             │  DecksPage nav  │
         │  .vue (CRITICAL)│             │  links          │
         │  [opus]         │             │  [sonnet]       │
         └─────────────────┘             └─────────────────┘

Step 4 depends on Steps 1 + 2 + 3 (all three must complete first)
Step 5 depends on Step 3 only (can run parallel to Step 4)
```

### Step 1: Extract DeckSection to shared component — Wave 1 [sonnet]
- **Agent**: sonnet
- **Wave**: 1 (Wave 1 — launch in parallel with Steps 2 and 3)
- **Parallel with**: Step 2 (i18n keys), Step 3 (router registration)
- **Blocks**: Step 4 (DeckDetailPage.vue)

- Extract the inline `DeckSection` `defineComponent` (lines 283–365 of `DecksPage.vue`) to `frontend/src/components/DeckSection.vue` as a proper Single File Component
- The inline component already has explicit props (`entries`, `cardMap`, `ownedIds`, `title`, `missingBadge`, `unknownBadge`) — no closed-over variables to untangle; extraction is straightforward
- Update `DecksPage.vue`: remove the `defineComponent` block and the local `const DeckSection = ...`, add `import DeckSection from '@/components/DeckSection.vue'` at the top of `<script>`
- `components: { DeckSection }` registration in DecksPage remains unchanged
- Verify DecksPage accordion still renders the card grid correctly after extraction (open an existing deck panel)
- Risk: if any import (`useI18n`, `cardImage`) is not re-imported in the new SFC, runtime will fail — include all imports in `DeckSection.vue`

#### Verification
- **Level**: Single Judge
- **Threshold**: 4.0 / 5.0
- **Criticality**: HIGH (regression risk)
- **Rubric**:
  | Criterion | Weight | Description |
  |-----------|--------|-------------|
  | Component interface preserved | 0.30 | All 6 props (`entries`, `cardMap`, `ownedIds`, `title`, `missingBadge`, `unknownBadge`) present in `DeckSection.vue` with identical types; no emits added or removed |
  | DecksPage still renders correctly | 0.30 | `DecksPage.vue` imports from `@/components/DeckSection.vue`; inline `defineComponent` block and `const DeckSection` removed; accordion expansion shows card grid identically to pre-extraction |
  | DeckSection.vue file exists with correct exports | 0.20 | File created at `frontend/src/components/DeckSection.vue`; exports a valid Vue SFC with `default` export; all necessary imports (`cardImage`, `useI18n` if used) re-declared inside the SFC |
  | No visual regression in card grid | 0.20 | Card owned/missing/unrecognized visual states (opacity, badges) render correctly in DecksPage after extraction; no blank panel or console errors |

### Step 2: i18n keys — Wave 1 [sonnet]
- **Agent**: sonnet
- **Wave**: 1 (Wave 1 — launch in parallel with Steps 1 and 3)
- **Parallel with**: Step 1 (DeckSection extraction), Step 3 (router registration)
- **Blocks**: Step 4 (DeckDetailPage.vue)

- Add the following keys to all 4 locale files (`frontend/src/locales/en.json`, `fr.json`, `de.json`, `it.json`) under the existing `decks` object:
  - `decks.backToDecks` — back-link label (en: "Back to Decks")
  - `decks.notFound` — not-found message (en: "Deck not found")
- Reuse existing keys where possible — no new top-level namespace needed:
  - Section titles: reuse `deckImport.sections.main / extra / side`
  - Badges: reuse `deckImport.missingBadge`, `deckImport.unknownBadge`
  - Stats: reuse `decks.totalCards`, `decks.ownedCount`, `decks.missingCount`, `decks.unrecognizedCount`
  - Add-to-wishlist button: reuse `decks.addMissing`
  - All-owned alert: reuse `decks.allOwned`
  - Loading spinner: reuse `common.loading`

#### Verification
- **Level**: Per-Item (one judge per locale file — 4 evaluations total)
- **Threshold**: 3.5 / 5.0
- **Criticality**: MEDIUM
- **Items**: `en.json`, `fr.json`, `de.json`, `it.json`
- **Rubric** (applied independently to each locale file):
  | Criterion | Weight | Description |
  |-----------|--------|-------------|
  | All required keys present | 0.40 | `decks.backToDecks` and `decks.notFound` both exist inside the `decks` object |
  | Valid JSON | 0.30 | File parses without error; no trailing commas, missing quotes, or structural issues introduced |
  | Consistent structure | 0.30 | New keys are placed inside the existing `decks` object (not at root level); key naming matches snake_case/camelCase convention of surrounding keys; translated values are non-empty strings appropriate to the target language |

### Step 3: Router registration — Wave 1 [sonnet]
- **Agent**: sonnet
- **Wave**: 1 (Wave 1 — launch in parallel with Steps 1 and 2)
- **Parallel with**: Step 1 (DeckSection extraction), Step 2 (i18n keys)
- **Blocks**: Step 4 (DeckDetailPage.vue), Step 5 (DecksPage navigation links)

- In `frontend/src/router/index.js`, add to `localeChildren` immediately after the `decks` entry:
  ```js
  { path: 'decks/:deckId', name: 'deckDetail', component: () => import(/* webpackChunkName: "deck-detail" */ '@/components/Pages/DeckDetailPage.vue') },
  ```
- Add a legacy redirect alongside the existing `/decks` redirect (before the `/:locale` parent route):
  ```js
  { path: '/decks/:deckId', redirect: (to) => `/${detectLocale()}/decks/${to.params.deckId}` },
  ```
- Note: the `/:locale` parent `beforeEnter` guard already handles locale validation for child routes — no additional guard needed on the new route

#### Verification
- **Level**: Single Judge
- **Threshold**: 4.0 / 5.0
- **Criticality**: MEDIUM
- **Rubric**:
  | Criterion | Weight | Description |
  |-----------|--------|-------------|
  | Route added to localeChildren correctly | 0.40 | `{ path: 'decks/:deckId', name: 'deckDetail', component: () => import('@/components/Pages/DeckDetailPage.vue') }` appears inside `localeChildren` immediately after the `decks` entry; path, name, and lazy-import are all present |
  | Legacy redirect present before catch-all | 0.30 | `{ path: '/decks/:deckId', redirect: ... }` is added before the `/:locale` parent route; redirect function correctly constructs locale-prefixed path using `detectLocale()` and `to.params.deckId` |
  | SSG exclusion confirmed | 0.30 | `vite.config.js` `ssgOptions.includedRoutes` allowlist does NOT include `deckDetail` or any `decks/:deckId` pattern; no changes made to vite.config.js that would cause the route to be prerendered |

### Step 4: Create DeckDetailPage.vue — Wave 2 [opus] (CRITICAL)
- **Agent**: opus
- **Wave**: 2 (Wave 2 — start only after Steps 1, 2, and 3 all complete)
- **Depends on**: Step 1 (DeckSection.vue must exist), Step 2 (i18n keys must be present), Step 3 (route name `deckDetail` must be registered)
- **Parallel with**: Step 5 (can run concurrently once Step 3 is done)

File: `frontend/src/components/Pages/DeckDetailPage.vue`

- Options API component matching the pattern of `DecksPage.vue`
- Props: `login: { type: Object, default: null }`
- Emits: `['requireAuth']`
- `setup()`: call `useHead({ title: computed(() => deckName + ' — One for One'), meta: [{ name: 'robots', content: 'noindex' }] })`
- `data()`: `{ loading: true, deck: null, stats: null, notFound: false, addingToWishlist: false, snackbar: { open, message, color, icon } }`
- `mounted()`: read `this.$route.params.deckId`, call `loadDeck()` then `computeStats()`
- `loadDeck()`: auth users — `supabase.from('decks').select('*').eq('id', deckId).eq('user_id', userId).single()`; guests — `readGuestDecks().find(d => d.localId === deckId)`; if null → set `this.notFound = true`
- `computeStats()`: same three-step pipeline as `DecksPage.computeStats()` — `parseYdk` → `getCardsByIds` → Supabase `Card` query for `ownedIds`
- Template structure:
  1. Back link: `<router-link :to="{ name: 'decks', params: { locale: $route.params.locale } }">{{ $t('decks.backToDecks') }}</router-link>`
  2. Not-found branch: `v-if="notFound"` — show `$t('decks.notFound')` + back link
  3. Loading branch: `v-else-if="loading"` — `<v-progress-circular>`
  4. Content branch: `v-else-if="stats"`:
     - `<h1>` with deck name
     - Stats chips row (total / owned / missing / unrecognized)
     - All-owned alert OR add-missing button (same logic as DecksPage accordion)
     - `<DeckSection>` × 3 (main / extra / side) — same props as DecksPage usage
- `addMissingToWishlist()`: copy from `DecksPage.addMissingToWishlist()`, referencing `this.stats` instead of `deckStats[deck.id]`; emit `requireAuth` if guest clicks

#### Verification
- **Level**: Panel of 2 Judges (independent evaluations, scores averaged)
- **Threshold**: 4.5 / 5.0
- **Criticality**: CRITICAL (new page component)
- **Rubric** (weighted criteria, each judge scores 0–5 per criterion; final = weighted average):
  | Criterion | Weight | Description |
  |-----------|--------|-------------|
  | Data loading correctness | 0.20 | Auth path uses `supabase.from('decks').select('*').eq('id', deckId).eq('user_id', userId).single()`; guest path reads from `localStorage` `tm_guest_decks` keyed by `localId`; `notFound = true` set when deck is null; SSR-safe (no `window`/`localStorage` access during SSR) |
  | Card grid rendering | 0.15 | Three `<DeckSection>` instances rendered for main/extra/side; owned cards at full opacity with no badge; missing cards at 0.35 opacity with red badge; unrecognized IDs show gray placeholder; matches visual states of DeckSection in DecksPage |
  | Wishlist add path | 0.15 | `addMissingToWishlist()` performs same Supabase insert as `DeckImport`/`DecksPage`; success snackbar shown; `addingToWishlist` loading state toggled; no duplicate data inserted |
  | Stats header | 0.15 | Total, owned, missing, and unrecognized counts displayed correctly from `this.stats`; unrecognized count hidden when 0; values match the three-step pipeline output |
  | Navigation UX | 0.15 | Back link uses `{ name: 'decks', params: { locale } }`; deck name rendered in `<h1>`; `useHead` sets title to `deckName + ' — One for One'` and `noindex` meta |
  | Auth gate | 0.10 | Guest clicking wishlist button emits `requireAuth` and returns without inserting; no Supabase call made for guest; login modal is triggered |
  | Vue/project patterns | 0.10 | Options API used (not Composition API); `$t()` for all user-facing strings; CSS variables used for theming consistent with DecksPage; no linting errors or Vue warnings |

### Step 5: Update DecksPage.vue — Wave 2 [sonnet]
- **Agent**: sonnet
- **Wave**: 2 (Wave 2 — start only after Step 3 completes)
- **Depends on**: Step 3 (route name `deckDetail` must be registered before adding router-link)
- **Parallel with**: Step 4 (can run concurrently once Step 3 is done)

- In the deck panel title area (the `<template v-else>` name + stats block), wrap the deck name `<span>` with a `<router-link>` navigating to the detail page:
  ```html
  <router-link
    :to="{ name: 'deckDetail', params: { locale: $route.params.locale, deckId: deck.id } }"
    class="text-subtitle-1 font-weight-medium text-truncate"
    style="color: inherit; text-decoration: none"
  >{{ deck.name }}</router-link>
  ```
- Keep the existing accordion expansion and inline stats — the link is an additive navigation affordance; the accordion remains for quick inline review
- The rename/delete buttons in the title stay in place and continue using `@click.stop` to prevent accordion toggle

#### Verification
- **Level**: Single Judge
- **Threshold**: 4.0 / 5.0
- **Criticality**: MEDIUM
- **Rubric**:
  | Criterion | Weight | Description |
  |-----------|--------|-------------|
  | Deck rows navigate to detail page | 0.40 | Deck name wrapped in `<router-link>` with `{ name: 'deckDetail', params: { locale: $route.params.locale, deckId: deck.id } }`; locale-prefixed path resolves correctly (e.g. `/en/decks/abc-123`); guest decks use `deck.localId` |
  | Existing accordion behavior preserved | 0.40 | Accordion panel still expands/collapses on header click; rename/delete buttons retain `@click.stop`; inline stats and wishlist button in the accordion body remain functional; `DeckSection` import switched to `@/components/DeckSection.vue` without breaking panel content |
  | No regressions | 0.20 | No console errors or Vue warnings introduced; router-link click does not simultaneously toggle accordion; all other DecksPage features (add deck, import, delete) unaffected |

---

## Verification Summary

| Step | Description | Judge Level | Evaluations | Threshold | Criticality |
|------|-------------|-------------|-------------|-----------|-------------|
| Step 1 | DeckSection extraction | Single Judge | 1 | 4.0 / 5.0 | HIGH |
| Step 2 | i18n keys (4 locale files) | Per-Item | 4 | 3.5 / 5.0 | MEDIUM |
| Step 3 | Router registration | Single Judge | 1 | 4.0 / 5.0 | MEDIUM |
| Step 4 | DeckDetailPage.vue | Panel of 2 Judges | 2 | 4.5 / 5.0 | CRITICAL |
| Step 5 | DecksPage navigation links | Single Judge | 1 | 4.0 / 5.0 | MEDIUM |
| **Total** | | | **9** | | |

---

### Execution Directive

**MUST launch Steps 1, 2, and 3 simultaneously in parallel (Wave 1).** These three steps have no inter-dependencies and each takes an independent file or set of files. Spawn three separate agents at once.

**MUST NOT start Step 4 until Steps 1, 2, AND 3 have all completed successfully.** Step 4 (DeckDetailPage.vue) imports `DeckSection.vue` (Step 1), uses i18n keys (Step 2), and references the route name `deckDetail` (Step 3). Any missing prerequisite will cause a runtime error.

**Step 5 may be launched as soon as Step 3 completes**, running in parallel with Step 4. Step 5 only needs the route name `deckDetail` to exist; it does not depend on Steps 1 or 2.

**Agent assignments**:
- Steps 1, 2, 3, 5 → **sonnet** (well-defined, mechanical transformations)
- Step 4 → **opus** (critical new component with complex logic, auth branching, stats pipeline, and multiple template branches)

---

## Definition of Done

- [ ] **AC 1 — Route renders**: `/[locale]/decks/:valid-id` mounts DeckDetailPage and shows deck name + card grid
- [ ] **AC 2 — Page title**: `<title>` contains the deck name when the page loads
- [ ] **AC 3 — Three sections**: Main Deck, Extra Deck, Side Deck headers rendered when deck has cards in all three
- [ ] **AC 4 — Owned visual state**: Owned cards display at full opacity with no badge
- [ ] **AC 5 — Missing visual state**: Missing cards display at 0.35 opacity with a red "Missing" badge
- [ ] **AC 6 — Unrecognized visual state**: Unrecognized IDs show gray placeholder with "Unrecognized" badge
- [ ] **AC 7 — Stats summary**: Total, owned, missing, unrecognized counts visible on page
- [ ] **AC 8 — Add missing (auth)**: Auth user can add all missing cards to wishlist; success snackbar shown
- [ ] **AC 9 — Wishlist auth gate (guest)**: Guest click emits `requireAuth`; no data inserted
- [ ] **AC 10 — All owned state**: "All owned" alert shown; no add-missing button rendered
- [ ] **AC 11 — Back navigation**: Back link navigates to `/[locale]/decks`
- [ ] **AC 12 — 404 / not-found state**: Unknown deck ID shows not-found message with back link
- [ ] **AC 13 — DecksPage links to detail**: Each deck name in DecksPage navigates to `/[locale]/decks/:id`
- [ ] **AC 14 — SSG exclusion**: No `/*/decks/*` HTML files in `dist` after vite-ssg build
- [ ] Route added to router; SSG exclusion confirmed in build output
- [ ] `DeckSection.vue` extracted as shared component; DecksPage accordion verified unchanged
- [ ] `DeckDetailPage.vue` created with noindex meta
- [ ] i18n keys added to all 4 locale files
- [ ] Code reviewed
