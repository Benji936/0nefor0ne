---
title: Deck Management Page
type: feature
skill: .claude/skills/deck-management/SKILL.md
analysis: .specs/analysis/analysis-deck-management-page.md
---

# Deck Management Page

## User Request

> "I would like to have a dedicated page for decks import where you can see all your decks and select which card you're missing etc"

## Description

A dedicated `/[locale]/decks` page that gives Yu-Gi-Oh! collectors a persistent, multi-deck workspace. Unlike the one-shot DeckImport widget in the Library page, this page lets users import and save multiple `.ydk` decks, compare their collection against each deck at a glance, identify which cards are missing, and bulk-add missing cards to their wishlist — all without losing their work between sessions.

**For whom:** Logged-in collectors who build or follow competitive/casual decks and want to track what they still need to acquire. Guests can use the page with a clear prompt to log in to persist their decks.

**Why a dedicated page:** The Library's DeckImport widget is intentionally transient (analyse once, close). The new page is a permanent management tool — import many decks, keep them, revisit them — without cluttering the Library.

## Persistence Strategy

- **Logged-in users:** decks are stored in a new Supabase table `decks` (see Schema Requirements). On login after a guest session, guest decks from localStorage are offered for migration.
- **Guests:** decks are stored in `localStorage` under key `tm_guest_decks` (array of `{ localId, name, ydkContent, importedAt }`). A persistent banner informs the guest that decks will be lost if they clear browser data, and prompts them to log in.

### Schema Requirements (Supabase)

A new table must be created before implementation:

```
table: decks
columns:
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid()
  user_id      uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
  name         text          NOT NULL
  ydk_content  text          NOT NULL   -- raw .ydk file contents
  created_at   timestamptz   NOT NULL DEFAULT now()
indexes:
  (user_id, created_at DESC)
RLS: users can only SELECT/INSERT/UPDATE/DELETE their own rows (user_id = auth.uid())
```

## Acceptance Criteria

1. **Route exists:** Navigating to `/[locale]/decks` renders a dedicated Decks page (not a modal or Library sub-section). The page title and `<title>` tag read "Decks" (localised).

2. **Import via dropzone:** The page includes a dropzone/button to import a `.ydk` file. Dragging a file or clicking to browse both work. Non-`.ydk` files are rejected with a user-facing error message.

3. **Deck naming on import:** After a file is selected, the user is prompted to confirm or edit a deck name (defaulting to the filename without the `.ydk` extension, max 60 chars). The deck is saved only after the name is confirmed.

4. **Multiple decks saved:** The user can import and save any number of decks. All saved decks appear in a list on the page, persisted across page reloads (Supabase for logged-in users, localStorage for guests).

5. **Deck list stats:** Each deck row in the list displays at minimum: deck name, total card count, owned count, and missing count. These counts are computed against the user's current collection at load time.

6. **Sort by missing:** The deck list defaults to sorting by missing count descending (most cards still needed first). The user can toggle this sort.

7. **In-page deck detail:** Clicking a deck row expands it in-place (accordion) to show the full card grid — the same three sections (Main Deck, Extra Deck, Side Deck) as the existing DeckImport component, with owned/missing/unrecognized visual states.

8. **Missing cards visible:** Within the expanded detail view, missing cards are visually distinct (dimmed image + red "Missing" badge), and a count of missing cards is shown in the section header.

9. **Unrecognized cards handled:** Cards with IDs not found in the YGOPRODeck API show a placeholder image and grey "Unrecognized" badge; they do not count as missing or owned.

10. **Add missing to wishlist:** Each expanded deck shows an "Add X missing to wishlist" button. Clicking it inserts all missing cards into the `Card` table (`wish: true`) using the same logic as the existing `DeckImport.addMissingToWishlist()`. A success snackbar confirms how many cards were added.

11. **Auth required for wishlist:** If a guest tries to add missing cards to the wishlist, they are shown an auth prompt (same pattern as the rest of the app). The action does not proceed until the user is logged in.

12. **Rename deck:** The user can rename a saved deck inline (click pencil icon → editable field → confirm). The new name is saved to Supabase (or localStorage for guests) immediately.

13. **Delete deck:** Each deck row has a delete action (trash icon with confirmation). Deleting a deck removes it from Supabase (or localStorage) permanently. The list updates immediately without a full page reload.

14. **Guest persistence banner:** When a guest has at least one saved deck, a non-dismissible (but unobtrusive) banner is shown below the page title explaining that decks are saved in the browser only and prompting the user to log in to save them permanently.

15. **Navigation integration:** A "Decks" link is added to the main navigation (navbar). The existing DeckImport widget in the Library page remains unchanged; it gains a small secondary link ("Save & manage all decks →") that navigates to `/[locale]/decks`.

## Non-Goals

- No public/shareable deck URLs (decks are private to the user).
- No separate `/decks/:id` route — detail is expanded in-page.
- No deck editing (adding/removing individual cards from a saved deck); only re-import replaces a deck.
- No duplicate-card deduplication across decks.
- No YDK export feature.
- No Supabase migration file in this feature — schema requirements are described above and must be applied manually or via a separate migration task before implementation begins.

## User Scenarios

### Happy Path — Logged-in user managing decks

1. User navigates to `/en/decks`.
2. Page shows an empty state with an import dropzone and the message "No decks yet. Import a .ydk file to get started."
3. User drags a `.ydk` file onto the dropzone.
4. A name input appears pre-filled with the filename (e.g., "dragonlink"). User edits it to "Dragon Link" and confirms.
5. The deck appears in the list: "Dragon Link — 40 cards total, 35 owned, 5 missing".
6. User imports a second deck "Branded Despia — 40 cards total, 28 owned, 12 missing".
7. The list sorts by missing count: Branded Despia first.
8. User clicks "Branded Despia" → deck expands showing all cards with owned/missing states.
9. User clicks "Add 12 missing to wishlist" → snackbar: "12 cards added to your wishlist".
10. User reloads the page → both decks still listed, counts unchanged.

### Edge Case — Guest imports a deck then logs in

1. Guest imports a deck; it saves to localStorage.
2. Guest sees the persistence banner.
3. Guest clicks "Log in" in the banner → auth flow completes.
4. After login, a prompt appears: "You have 1 deck saved in your browser. Would you like to save it to your account?" with "Save" and "Discard" options.
5. Guest clicks "Save" → deck migrates to Supabase; localStorage entry removed.

### Edge Case — Import invalid file

1. User drops a `.txt` file onto the dropzone.
2. Error message: "Only .ydk files are supported."
3. User drops a valid `.ydk` file with some IDs not in the API.
4. Deck saves; unrecognized cards show placeholder; missing count only includes API-recognized cards.

### Edge Case — All cards owned

1. User imports a deck for which they own every card.
2. Deck row shows "0 missing". The "Add to wishlist" button is absent.
3. Expanded view shows the "All cards owned" success state (same as existing DeckImport).

## Architecture Overview

### Solution Strategy

Build `DecksPage.vue` on top of the existing foundations: `DeckImport.vue` (card rendering logic and `addMissingToWishlist()`), `ydk.js` (`parseYdk()`), `getCardsByIds` from `api.js`, and the Supabase client. The core insight is to wrap the existing DeckImport component's card rendering in a persistence layer — not to rewrite it. The page is a permanent management tool; DeckImport stays as a transient analyser that gains one small secondary link.

### Persistence Layer Architecture

**Logged-in users — Supabase `decks` table** (schema defined in Schema Requirements above):
- All CRUD operations are inline methods on `DecksPage.vue` (`loadDecks()`, `saveDeck()`, `renameDeck()`, `deleteDeck()`).
- Raw `ydk_content` text is stored (not parsed JSONB) so the deck can be re-parsed on demand without schema coupling.
- Queries use `getClient()` from `supabaseClient.js`, pattern matches existing `AddCard.vue` and `DeckImport.vue`.

**Guests — `localStorage` key `tm_guest_decks`**:
- Array of `{ localId, name, ydkContent, importedAt }`.
- All localStorage access is inside `onMounted()` / lifecycle methods to be SSR-safe.
- `typeof window !== 'undefined'` guard wraps any utility access called outside lifecycle hooks.

**Guest→logged-in migration**:
- On auth state change (login event), `DecksPage.vue` checks for `tm_guest_decks` entries.
- If found, a one-time prompt offers "Save to your account" or "Discard".
- On "Save": each guest deck is inserted to Supabase, then `tm_guest_decks` is cleared.

### Component Architecture

- **`DecksPage.vue`** — single new page component using Options API (consistent with `Library.vue`, `CardPage.vue`, etc.). Contains the deck list, inline accordion detail, import dropzone, name confirmation input, rename/delete actions, guest persistence banner, and migration prompt.
- No new sub-component files — the deck list row, expanded card grid, and import flow are all inlined in `DecksPage.vue`.
- Card slot rendering in the expanded accordion reuses the same CardSlot pattern from `DeckImport.vue` directly (owned / missing / unrecognized visual states).
- Route: `{ path: 'decks', name: 'decks', component: () => import('@/components/Pages/DecksPage.vue') }` added to `localeChildren` in `router/index.js`. A bare `/decks` legacy redirect is added before the `/:locale` catch-all.
- **Not prerendered**: the route must not appear in `vite.config.js` `ssgOptions.includedRoutes`. Auth-gated pages are already excluded by the existing filter; verify this covers `decks`.

### Data Flow

1. **Mount**: read `this.login?.user?.id`.
   - Authenticated → query Supabase `decks` table for the user's rows, ordered by `created_at DESC`.
   - Guest → parse `tm_guest_decks` from localStorage (inside `mounted()`).
2. **Stats computation is lazy**: deck rows display a loading skeleton until first expanded. On expansion, `parseYdk(deck.ydk_content)` runs, then `getCardsByIds(allIds)` fetches card metadata, then the user's owned cards are cross-referenced. This avoids N API calls on initial load when many decks are saved.
3. **Expanded deck**: full card grid rendered with the same three sections (Main / Extra / Side) and the same owned / missing / unrecognized states as `DeckImport.vue`.
4. **Wishlist action**: delegates to the same insert logic as `DeckImport.addMissingToWishlist()` — inserts into the `Card` table with `wish: true`.

### Files to Create / Modify

| Action | File |
|--------|------|
| CREATE | `frontend/src/components/Pages/DecksPage.vue` |
| MODIFY | `frontend/src/router/index.js` — add `decks` child route + legacy redirect |
| MODIFY | `frontend/src/App.vue` — desktop NavItem, mobile tab, `changePage` map, logout guard |
| MODIFY | `frontend/src/locales/en.json` — add `nav.decks`, `meta.decks.*`, `decks.*` keys |
| MODIFY | `frontend/src/locales/fr.json` — same keys, French translations |
| MODIFY | `frontend/src/locales/de.json` — same keys, German translations |
| MODIFY | `frontend/src/locales/it.json` — same keys, Italian translations |
| MODIFY | `frontend/src/components/DeckImport.vue` — add "Save & manage all decks →" secondary link |

Total: 1 file created, 7 files modified.

### Key Architectural Decisions

- **Inline accordion, no child route**: detail view expands in-place on `DecksPage.vue`. This matches the ACs, avoids SSG complexity, and keeps navigation shallow.
- **Lazy stats**: card metadata and ownership counts are fetched only when a deck row is first expanded (not on initial page load), preventing N+1 API calls for users with many decks.
- **Dual persistence, no sync needed**: localStorage is the source of truth for guests; Supabase is the source of truth for authenticated users. Migration is explicit and one-time — there is no background sync between the two stores.
- **No new lib file**: persistence methods live directly on `DecksPage.vue`. The feature does not yet justify a separate composable; if the pattern grows (e.g., deck sharing), extract to a `useDecks()` composable then.
- **DeckImport.vue minimal change**: the only modification is a secondary text link at the bottom of the existing import result view — the component's core contract and rendering logic are untouched.

---

## Implementation Process

### Step 1: i18n Keys — 4 locale files

**Agent:** `sonnet`
**Wave:** 1 (parallel)
**Parallel with:** Steps 2, 3, 5

Add `decks.*` and `nav.decks` keys to all four locale files.

**Success criteria:** All four locale files parse as valid JSON and contain every key listed below with appropriate translations. No existing key is altered.

**Subtasks:**
- Add the following keys to `frontend/src/locales/en.json` (English values as specified):
  - `nav.decks`: `"Decks"`
  - `decks.title`: `"My Decks"`
  - `decks.empty`: `"No decks yet. Import a .ydk file to get started."`
  - `decks.importButton`: `"Import Deck (.ydk)"`
  - `decks.confirmName`: `"Deck name"`
  - `decks.confirmImport`: `"Save deck"`
  - `decks.sortByMissing`: `"Sort by missing"`
  - `decks.totalCards`: `"{total} cards"`
  - `decks.ownedCount`: `"{owned} owned"`
  - `decks.missingCount`: `"{missing} missing"`
  - `decks.addMissing`: `"Add {count} missing cards to wishlist"`
  - `decks.allOwned`: `"You own all cards in this deck"`
  - `decks.rename`: `"Rename"`
  - `decks.delete`: `"Delete deck"`
  - `decks.deleteConfirm`: `"Delete this deck?"`
  - `decks.guestBanner`: `"Your decks are saved in your browser. Log in to save them permanently."`
  - `decks.migratePrompt`: `"You have {count} deck(s) saved in your browser. Save them to your account?"`
  - `decks.migrateSave`: `"Save to account"`
  - `decks.migrateDiscard`: `"Discard"`
  - `decks.manageLink`: `"Save & manage all decks →"`
  - `decks.unrecognizedCount`: `"{count} unrecognized"`
- Replicate the same keys with French translations in `frontend/src/locales/fr.json`.
- Replicate with German translations in `frontend/src/locales/de.json`.
- Replicate with Italian translations in `frontend/src/locales/it.json`.

**Risks/blockers:**
- Translation quality for fr/de/it — must be reviewed by a native speaker or cross-checked against existing locale style.
- JSON syntax errors will silently break all i18n; validate with `JSON.parse` after editing.

**Expected output (files modified):**
- `frontend/src/locales/en.json`
- `frontend/src/locales/fr.json`
- `frontend/src/locales/de.json`
- `frontend/src/locales/it.json`

#### Verification

- **Level:** Per-Item Judges (one judge per locale file — 4 evaluations total)
- **Threshold:** 3.5 / 5.0
- **Rubric:**
  - All keys present (0.50): every key listed in the spec exists in the output file
  - Valid JSON (0.30): file parses without error; no trailing commas, no missing quotes
  - Structure consistency (0.20): keys are nested correctly matching existing locale structure

---

### Step 2: Router + vite.config (no prerender)

**Agent:** `sonnet`
**Wave:** 1 (parallel)
**Parallel with:** Steps 1, 3, 5

Add the `decks` route to `router/index.js` localeChildren and confirm `vite.config.js` does not include `/en/decks` in prerendered routes.

**Success criteria:** Navigating to `/en/decks` (or any locale prefix) resolves to `DecksPage.vue` without a 404. The SSG build does not attempt to prerender `/*/decks`. A bare `/decks` redirect is present before the `/:locale` catch-all.

**Subtasks:**
- In `frontend/src/router/index.js`, add to `localeChildren`:
  ```js
  { path: 'decks', name: 'decks', component: () => import(/* webpackChunkName: "decks" */ '@/components/Pages/DecksPage.vue') }
  ```
- Add a bare redirect before the `/:locale` catch-all:
  ```js
  { path: '/decks', redirect: () => `/${detectLocale()}/decks` }
  ```
- In `frontend/vite.config.js`, inspect `ssgOptions.includedRoutes` (or equivalent filter). The `decks` route must not be included — auth-gated pages should already be excluded by the existing filter, but verify explicitly. If a manual exclusion is needed, add `'decks'` to the exclusion list.

**Risks/blockers:**
- If `vite.config.js` uses a glob or explicit allowlist for SSG routes, the route might accidentally get prerendered, causing an SSR crash on mount (localStorage access before hydration).
- The bare `/decks` redirect must be placed before the `/:locale` catch-all to avoid being swallowed.

**Expected output (files modified):**
- `frontend/src/router/index.js`
- `frontend/vite.config.js` (verification only; modify only if exclusion is needed)

#### Verification

- **Level:** Single Judge
- **Threshold:** 4.0 / 5.0
- **Rubric:**
  - Route correctness (0.40): `decks` route added to `localeChildren` with correct path/name/component; bare `/decks` redirect present before catch-all
  - Pattern alignment (0.30): lazy import uses same pattern as sibling routes, no deviation
  - SSG exclusion verified (0.30): `vite.config.js` confirmed or modified so `/*/decks` is not prerendered

---

### Step 3: App.vue navigation

**Agent:** `sonnet`
**Wave:** 1 (parallel)
**Parallel with:** Steps 1, 2, 5

Add a "Decks" nav link to both the desktop navbar and the mobile bottom tab bar in `frontend/src/views/App.vue`.

**Success criteria:** The "Decks" link appears in the desktop navbar between Library and Trades (or at an equivalent position). It appears in the mobile bottom tab bar. Clicking it navigates to `/[locale]/decks`. The active state is highlighted correctly when the current page is `decks`.

**Subtasks:**
- In the desktop `<nav>` block, add a `<NavItem>` for decks, using `$t('nav.decks')` as the tooltip, an appropriate icon, and `@click="changePage('decks')"`.
- In the `mobileTabs` computed array, add an entry `{ key: 'decks', label: this.$t('nav.decks'), icon: 'mdi-cards-variant', iconActive: 'mdi-cards-variant', action: () => this.changePage('decks') }`.
- In `changePage`'s `pathMap`, add `decks: \`/${lc}/decks\``.
- In the auth guard check (the block that redirects certain pages on logout — `["library", "TradeCenter", "account"].includes(this.page)`), add `"decks"` to the list so guests are redirected appropriately on logout.

**Risks/blockers:**
- Mobile bottom nav has 4 slots; adding a 5th may require dropping one tab or redesigning the bar — confirm whether the 4-tab constraint is a design requirement.
- Icon choice: `mdi-cards-variant` is a guess; verify against the Vuetify MDI set available in the project.

**Expected output (files modified):**
- `frontend/src/views/App.vue`

#### Verification

- **Level:** Single Judge
- **Threshold:** 4.0 / 5.0
- **Rubric:**
  - Integration correctness (0.45): NavItem, `mobileTabs` entry, `changePage` pathMap entry, and auth guard list all updated correctly
  - Pattern consistency (0.35): icon, label via `$t()`, click handler match existing tab entries exactly
  - UX placement (0.20): Decks link placed at a sensible position in desktop nav and mobile tabs

---

### Step 4: DecksPage.vue — Core component

**Agent:** `opus`
**Wave:** 2 (depends on Steps 1 + 2)
**Depends on:** Step 1 (i18n keys must exist for correct $t() calls), Step 2 (route must be registered)

Create `frontend/src/components/Pages/DecksPage.vue` as the main page component.

**Success criteria:** All 15 acceptance criteria from the feature spec pass:
- Route renders the page with correct `<title>`.
- Dropzone accepts `.ydk` only; rejects other formats with an error.
- Name confirmation step works (defaults to filename, max 60 chars).
- Multiple decks persist across reload (Supabase for auth, localStorage for guest).
- Deck rows show total / owned / missing stats.
- Sort by missing toggle works.
- Accordion expands to full card grid (Main / Extra / Side sections).
- Missing cards are visually distinct; unrecognized cards show placeholder.
- "Add X missing to wishlist" inserts into `Card` table; success snackbar shown.
- Auth prompt shown if guest attempts wishlist action.
- Rename works inline; persists immediately.
- Delete works with confirmation; list updates without reload.
- Guest banner shown when at least one deck exists.
- Guest→auth migration prompt shown after login; Save migrates to Supabase; Discard clears localStorage.

**Subtasks:**
- Scaffold `DecksPage.vue` using Options API (consistent with `Library.vue`, `CardPage.vue`).
- Implement `mounted()`: detect auth state, load decks from Supabase or localStorage.
- Implement import dropzone: file input + drag-and-drop, `.ydk` validation, name confirmation input.
- Implement deck list: `v-for` over saved decks, stats row (total/owned/missing), sort toggle.
- Implement accordion expand: on click, run `parseYdk(deck.ydk_content)` + `getCardsByIds(allIds)`, then render card grid with same owned/missing/unrecognized states as `DeckImport.vue`.
- Implement `addMissingToWishlist()` delegating to same Supabase insert logic as existing `DeckImport`.
- Implement rename inline: pencil icon → `<input>` → confirm → persist.
- Implement delete: trash icon → confirm dialog → remove from Supabase/localStorage → update list.
- Implement guest banner (non-dismissible, shown when `isGuest && decks.length > 0`).
- Implement guest→auth migration: watch auth state change event; if `tm_guest_decks` has entries, show migration prompt; on "Save" insert each deck to Supabase and clear localStorage; on "Discard" clear localStorage only.
- Add `<title>` / meta tag using the pattern established by other pages (`useHead` or direct DOM, match project convention).
- Add all `typeof window !== 'undefined'` guards around localStorage access.
- Add SSR-safe guards — no localStorage access outside lifecycle hooks.

**Risks/blockers:**
- **Supabase schema must exist before this step can be tested end-to-end.** If the `decks` table does not exist, all Supabase operations will fail. This is the single highest-risk external dependency.
- YGOPRODeck API rate limits may throttle rapid accordion expansions — add a loading skeleton and graceful error state.
- Auth state change listener for migration must be idempotent (HMR re-registration could fire it twice).
- Card slot rendering must visually match `DeckImport.vue` exactly — copy owned/missing/unrecognized CSS classes, do not invent new ones.

**Expected output (files created/modified):**
- `frontend/src/components/Pages/DecksPage.vue` (CREATE)

#### Verification

- **Level:** Panel of 2 Judges
- **Threshold:** 4.5 / 5.0
- **Rubric:**
  - Persistence Layer (0.20): Supabase CRUD + localStorage correctly implemented, SSR-safe
  - Card Grid Rendering (0.15): 3 visual states (owned/missing/unrecognized) match `DeckImport.vue`
  - Wishlist Add Path (0.15): Same Supabase call as `AddCard.vue`/`DeckImport.vue`
  - Deck List UX (0.15): Stats shown, sort by missing, accordion expand works
  - Guest Features (0.15): Banner shown, localStorage persists, migration offered on login
  - Auth Gate (0.10): `requireAuth` emitted for unauthenticated wishlist actions
  - Vue/Project Patterns (0.10): Options API, `$t()` for all strings, CSS vars

---

### Step 5: DeckImport.vue — Add "Save & manage" link

**Agent:** `sonnet`
**Wave:** 1 (parallel)
**Parallel with:** Steps 1, 2, 3

Add a small secondary link at the bottom of `DeckImport.vue` that navigates to `/[locale]/decks`.

**Success criteria:** After a deck is imported and analysed in the Library's DeckImport widget, a text link reading "Save & manage all decks →" (localised via `$t('decks.manageLink')`) appears below the result. Clicking it navigates to `/[locale]/decks`. The component's existing contract, card rendering logic, and `addMissingToWishlist()` are untouched.

**Subtasks:**
- Locate the bottom of the import result view in `DeckImport.vue`.
- Add a `<router-link>` or `<a @click="goToDecks">` using `$t('decks.manageLink')`.
- Use `this.$router.push(\`/${this.$i18n.locale}/decks\`)` for navigation, or a `<router-link :to="\`/${$i18n.locale}/decks\`">`.
- Ensure the link is only shown when a deck result is displayed (not in the initial empty state).

**Risks/blockers:**
- Minimal risk — purely additive change to existing component.
- Locale prefix must be dynamic (not hardcoded to `en`).

**Expected output (files modified):**
- `frontend/src/components/DeckImport.vue`

#### Verification

- **Level:** Single Judge
- **Threshold:** 4.0 / 5.0
- **Rubric:**
  - Link present and correct (0.50): "Save & manage all decks →" link appears only when a deck result is displayed, navigates to `/${locale}/decks`
  - Pattern consistency (0.30): uses `<router-link>` or `$router.push` pattern matching existing navigation in the component
  - No regressions (0.20): existing card rendering, `addMissingToWishlist()`, and component contract are untouched

---

## Execution Directive

MUST launch Wave 1 steps in parallel (Steps 1, 2, 3, 5 simultaneously).
MUST wait for Steps 1 and 2 to complete before launching Step 4 (Wave 2).
Step 3 and Step 5 can complete independently — they do not block Step 4.

## Parallelization Diagram

```
Wave 1 (launch simultaneously)
├── Step 1: i18n keys          [sonnet]  ──┐
├── Step 2: router + vite      [sonnet]  ──┼──► Wave 2
├── Step 3: App.vue nav        [sonnet]     │
└── Step 5: DeckImport link    [sonnet]     │

Wave 2 (launch after Steps 1 + 2 complete)
└── Step 4: DecksPage.vue      [opus]   ◄──┘
```

- Wave 1: 4 agents in parallel
- Wave 2: 1 agent (opus), blocked only on Steps 1 + 2
- Steps 3 and 5 complete independently and do not gate Wave 2
- Max parallelization depth: 2 waves

---

## Definition of Done

- [ ] All four locale files contain the full `decks.*` and `nav.decks` key set with correct translations and valid JSON.
- [ ] Navigating to `/en/decks`, `/fr/decks`, `/de/decks`, `/it/decks` renders `DecksPage.vue` without errors.
- [ ] The SSG build completes without attempting to prerender `/*/decks`.
- [ ] "Decks" link is present in the desktop navbar and mobile bottom tab bar; active state is correct.
- [ ] A logged-in user can import, save, view, rename, and delete decks; data persists across page reloads.
- [ ] A guest user can import decks to localStorage; the guest banner is visible; decks persist across reloads until browser data is cleared.
- [ ] After a guest logs in with decks in localStorage, the migration prompt appears and both "Save" and "Discard" paths work correctly.
- [ ] Accordion expansion shows the correct card grid with owned/missing/unrecognized visual states matching `DeckImport.vue`.
- [ ] "Add X missing to wishlist" inserts cards into the `Card` table with `wish: true` and shows a success snackbar; the button is absent when missing count is 0.
- [ ] DeckImport.vue shows the "Save & manage all decks →" link after a deck is analysed and it navigates to the correct locale-prefixed route.

---

## Implementation Summary

| Step | Title | Files Affected |
|------|-------|---------------|
| 1 | i18n Keys — 4 locale files | `locales/en.json`, `locales/fr.json`, `locales/de.json`, `locales/it.json` |
| 2 | Router + vite.config (no prerender) | `router/index.js`, `vite.config.js` (verify) |
| 3 | App.vue navigation | `src/views/App.vue` |
| 4 | DecksPage.vue — Core component | `Pages/DecksPage.vue` (CREATE) |
| 5 | DeckImport.vue — "Save & manage" link | `components/DeckImport.vue` |

---

## Verification Summary

| Step | Title | Verification Level | Threshold | Judge Count |
|------|-------|--------------------|-----------|-------------|
| 1 | i18n Keys — 4 locale files | Per-Item (one per locale file) | 3.5 / 5.0 | 4 |
| 2 | Router + vite.config | Single Judge | 4.0 / 5.0 | 1 |
| 3 | App.vue navigation | Single Judge | 4.0 / 5.0 | 1 |
| 4 | DecksPage.vue — Core component | Panel of 2 Judges | 4.5 / 5.0 | 2 |
| 5 | DeckImport.vue — "Save & manage" link | Single Judge | 4.0 / 5.0 | 1 |

**Total judge evaluations required: 9**

- Panel: 1 step (Step 4)
- Single: 3 steps (Steps 2, 3, 5)
- Per-Item: 1 step (Step 1)
- None: 0 steps
