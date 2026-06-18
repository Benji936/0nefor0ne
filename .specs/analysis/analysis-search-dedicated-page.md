# Codebase Impact Analysis: Dedicated Card Search Page (/cards)

**Feature:** Dedicated card search page at `/:locale/cards`
**Status:** Analysis
**Date:** 2026-06-15

---

## 1. Executive Summary

The task moves the active card search/browse experience from the home page (`Search.vue`) to a new dedicated route (`/:locale/cards` -> `CardsPage.vue`). The home page becomes a pure landing/discovery page. The core search logic currently embedded in `App.vue` (Options API) must be extracted into a shared composable so both the global navbar input and `CardsPage.vue` can use it without race conditions. The filter panel (`SearchFiltersPanel.vue`) is reused as a sidebar with minor layout changes. The API supports pagination via `num`+`offset` already. Sort will be client-side only (YGOPRODeck API has no server-side sort param).

**Files to CREATE: 2** | **Files to MODIFY: 9** | **Files to DELETE: 0** | **Risk Level: MEDIUM**

---

## 2. Files to CREATE

### 2.1 `frontend/src/composables/useCardSearch.js` (NEW)

**Purpose:** Extract all search state and the single async writer out of `App.vue`'s Options API into a composable usable by `CardsPage.vue` (owns the writer) and the navbar (read-only input + navigate-to-/cards behavior).

**What to extract from `App.vue` (`frontend/src/views/App.vue`)**:

- **Module-level functions** (lines 298-493): `defaultFilters`, `serialize`, `deserialize`, `resolveTypeRace`, `cmpValue`, `deriveSearch`, `isFiltersDefault`, `PENDULUM_TYPES`, `LINK_ARROW_MARKERS` -- these are already plain functions with no component deps; move them to the composable and re-export `deriveSearch` (already exported at line 414).
- **`data()` state fields** (lines 518-542): `searchQuery` (string), `activeFilters` (object), `_searchTimer` (null), `_searchSeq` (0), `_lastWrittenQuery` (null). In the composable, these become `ref`/`reactive`.
- **`watch` handlers** (lines 545-567): The `$route.query` deep watcher (echo-guard + `deserialize` + `update()`) and the `activeFilters` deep watcher (calls `update()`). In the composable these become `watch(route.query, ...)` and `watch(activeFilters, ...)` using Composition API.
- **`update()` and `_doSearch()`** (lines 569-633): The debounced search dispatcher and the async race-guarded fetch. The single async writer stays here. The URL reflection logic (`router.replace`) becomes conditional on `route.name === 'cards'` (not `'search'`).
- **`mounted()` hydration block** (lines 691-697): `deserialize(route.query)` -> seed `searchQuery` + `activeFilters` -> conditionally call `_doSearch()`. Moves to `onMounted` inside the composable, called only from `CardsPage.vue`.
- **`cards` result state** (line 520): `{ data: CardObject[] }` shape -- moves into composable as `ref({})`.

**What stays in `App.vue`**: `filterCardName`, `authenticated`, `authDialogOpen`, `authUnsubscribe`, all auth methods, `changePage`, `openMatches`, `openProposals`, `toggleTheme`, `mobileTabs`, `page` computed.

**Composable API shape (proposed)**:
```js
export function useCardSearch({ routeName = 'cards' } = {}) {
  const searchQuery   = ref('')
  const activeFilters = ref(defaultFilters())
  const cards         = ref({})
  const isLoading     = ref(false)
  function update() { ... }
  function reset() { ... }
  function init() { ... } // hydrate from URL, call _doSearch if non-empty
  function navigateToCards(query) { router.push({ name: 'cards', query: serialize(query, activeFilters.value) }) }
  return { searchQuery, activeFilters, cards, isLoading, update, reset, init, navigateToCards,
           defaultFilters, serialize, deserialize, isFiltersDefault }
}
```

**New URL keys to add** (extend existing short-key schema):
- `so` = sort field (`name`, `atk`, `def`, `level`, `new`)
- `pg` = page number (1-based)
- `vw` = view density (`grid` | `compact` | `list`)

### 2.2 `frontend/src/components/Pages/CardsPage.vue` (NEW)

**Purpose:** The dedicated card search/browse page mounted at `/:locale/cards`.

**Pattern to follow:** `SetPage.vue` and `DecksPage.vue` for route structure and SSG guards; `Search.vue` lines 118-133 for the results grid + `CardYugi.vue` tiles.

**Key layout:**
```
<div class="flex gap-0 md:gap-6">
  <!-- Left sidebar (desktop persistent, mobile drawer/bottom-sheet) -->
  <aside class="hidden md:block w-72 shrink-0 sticky top-20 self-start">
    <SearchFiltersPanel :filters="activeFilters" layout="sidebar" @update:filters="activeFilters = $event" />
  </aside>
  <!-- Results area -->
  <main class="flex-1 min-w-0">
    <!-- Results header: count + sort + density toggle -->
    <!-- Loading skeleton -->
    <!-- Zero-results empty state -->
    <!-- Card grid (reuses exact markup from Search.vue lines 118-133) -->
    <!-- Pagination controls -->
  </main>
</div>
```

**Props received from RouterView**: `:login="authenticated"` (for @requireAuth guards). Does NOT use `:search-cards` or `:filters` from RouterView -- the page owns its own state via `useCardSearch`.

**SSG guard**: `if (typeof document === 'undefined') return` in `onMounted` -- same pattern as `CardPage.vue` and `SearchTrending.vue`.

**Sort**: Client-side only in V1. Sort keys: `name` (alpha asc), `atk` (desc), `def` (desc), `level` (desc), `new` (API order = default).

**Pagination**: `num=40, offset=(page-1)*40` using existing `searchByFilters` signature already in `api.js` (lines 96-113). Page state: `pageSize = 40`, `currentPage = ref(1)`.

**View density toggle**: `viewDensity = ref('grid')` with 3 states. URL key `vw`.

---

## 3. Files to MODIFY

### 3.1 `frontend/src/views/App.vue`

**Changes required:**

1. **Remove from `data()`** (lines 518-542): `searchQuery`, `cards`, `_searchTimer`, `_searchSeq`, `_lastWrittenQuery`, `activeFilters`. Keep `filterCardName`, `authenticated`, `authDialogOpen`, `authUnsubscribe`.

2. **Remove `watch` handlers** (lines 544-567): Both `$route.query` and `activeFilters` watchers. They move to the composable.

3. **Remove from `methods`** (lines 568-633): `update()`, `_doSearch()`. Keep all auth/navigation methods.

4. **Update `mounted()`** (lines 682-706): Remove the hydration block (lines 691-697).

5. **Update navbar `<input v-model="searchQuery">`** (line 119): Change to a local `navQuery = ref('')` in `<script setup>`. On `@keyup.enter` navigate to `/cards?q=navQuery`. On `@focus` (focusSearch, line 661) navigate to `/cards` if not already on it.

6. **Update `focusSearch()` method** (line 661): Change `this.page !== 'search'` to `this.page !== 'cards'`.

7. **Update `changePage()` pathMap** (lines 652-655): Add `cards: \`/${lc}/cards\`` entry.

8. **Update RouterView props** (lines 247-261): Keep `:search-cards` binding but point it to a stub `cards = ref({})` that is always empty. `Search.vue` (landing) will always show the hero since `hasSearchResults({}) === false`. `CardsPage.vue` ignores these props (no matching prop definitions).

9. **Update `mobileTabs`** (lines 506-514): Change `search` tab key/action to route to `cards`, or rename as "Browse"/"Cards". The home logo click (`changePage('search')` on line 111) may change to a `home` key or stay pointing to `search` depending on final navigation decisions.

10. **SEO `useHead`** (lines 23-79): No code change needed. `t(\`meta.${page}.title\`)` on line 36 automatically resolves `meta.cards.title` when `page === 'cards'`. Add only the locale keys.

### 3.2 `frontend/src/components/Pages/Search.vue`

**Becomes:** Pure landing/discovery page. Remove all search UI.

**Lines to REMOVE:**
- Line 5: `import SearchFiltersPanel`
- Lines 12-16: `defineProps` -- remove `searchCards` and `filters` (keep `login`)
- Line 18: `defineEmits` -- remove `"update:filters"` (keep `"TradeCenter"`, `"requireAuth"`)
- Lines 20-21: `hasSearchResults` function
- Line 39: Hero `v-if` condition -- simplify to `v-if="!login"`
- Line 100: `<SearchFiltersPanel ...>` -- remove
- Lines 102-108: Zero-results empty state section -- remove
- Lines 111-133: Search results section -- remove
- Line 141: Result divider after results section -- remove

**Lines to KEEP:**
- Lines 43-97: Hero section (card strip + headline + CTA + how-it-works) -- KEEP
- Lines 136-144: `SearchTrending`, `SearchSetBrowser`, `SearchLatestReleases` -- KEEP

**Add:** CTA/link to `/cards` for authenticated users who don't see the hero.

### 3.3 `frontend/src/components/Pages/search/SearchFiltersPanel.vue`

**Changes required:**

Add optional `layout` prop (`'panel'` | `'sidebar'`, default `'panel'`). In sidebar mode:
- Remove `<button class="filters__toggle">` expand/collapse toggle (lines 263-281) -- always expanded.
- Remove collapsed summary chips (lines 284-291).
- Remove `<Transition name="reveal">` wrapper.
- The `expanded` ref becomes unused in sidebar mode.
- Sidebar layout styling: border-radius 0 or lighter, padding adjustments.

The component's v-model:filters contract (props.filters + emit('update:filters')) is unchanged.

**Mobile drawer**: `CardsPage.vue` wraps `SearchFiltersPanel` in a `<v-navigation-drawer>` or `<v-bottom-sheet>` on mobile, passing `layout="sidebar"`.

### 3.4 `frontend/src/router/index.js`

**Changes required:**

1. Add to `localeChildren` array (after line 17):
   ```js
   { path: 'cards', name: 'cards', component: () => import(/* webpackChunkName: "cards" */ '@/components/Pages/CardsPage.vue') }
   ```

2. Add bare redirect (after line 29 block):
   ```js
   { path: "/cards", redirect: () => `/${detectLocale()}/cards` },
   ```

3. Route name `'cards'` matches `changePage` map key and `mobileTabs` key.

### 3.5 `frontend/src/api.js`

**No structural changes needed.** `searchByFilters` already accepts `num` and `offset` (line 96). The YGOPRODeck API has no server-side `sort` param so no addition needed. The composable manages `num`/`offset` for pagination.

### 3.6 `frontend/vite.config.js`

In `ssgOptions.includedRoutes` (lines 44-72), add after the homepages block (line 55):
```js
// Cards page: /en/cards, /fr/cards, /de/cards, /it/cards
for (const locale of locales) {
  included.push(`/${locale}/cards`)
}
```
Update count comment: 4 + 4 + 4 + 16 + 30 = 58 paths.

### 3.7 `frontend/scripts/generate-sitemap.mjs`

Add to `STATIC_PAGES` array (line 84):
```js
{ path: "/cards", changefreq: "weekly", priority: 0.9 },
```
Priority 0.9 -- second only to homepage. The existing `urlEntry` helper (lines 41-49) generates all 4 locale entries + hreflang automatically. Update total count in XML comment and console.log.

### 3.8 Locale files (en, fr, de, it)

**Existing keys to REUSE** (no change):
- `search.filters.*` -- all filter labels used by `SearchFiltersPanel.vue`
- `search.results`, `search.cardsCount`, `search.filters.noResults`

**New keys to ADD** under `cards` namespace and `meta.cards`:
```json
{
  "cards": {
    "title": "Card Database",
    "subtitle": "Browse all Yu-Gi-Oh! cards",
    "sort": { "label": "Sort by", "name": "Name", "atk": "ATK", "def": "DEF", "level": "Level / Rank", "new": "Newest" },
    "view": { "label": "View", "grid": "Grid", "compact": "Compact", "list": "List" },
    "pagination": { "prev": "Previous", "next": "Next", "pageOf": "Page {page} of {total}", "showing": "Showing {from}-{to} of {count} cards" },
    "results": { "count": "{count} cards", "noResults": "No cards match your search", "noResultsHint": "Try adjusting your filters or search query" },
    "filters": { "openDrawer": "Filters", "closeDrawer": "Close filters" },
    "emptyState": { "title": "Start searching", "body": "Use the search bar or filters to find cards" }
  },
  "meta": {
    "cards": {
      "title": "Card Database — Yu-Gi-Oh! | One for One",
      "desc": "Browse and filter the complete Yu-Gi-Oh! card database. Search by name, type, attribute, level, and more."
    }
  }
}
```
All 4 locale files need translated equivalents.

---

## 4. Integration Points (Top 3)

### IP-1: Navbar Input -> CardsPage State Handoff (CRITICAL)
**Current**: `v-model="searchQuery"` in App.vue (line 119) binds to App.vue's `searchQuery`, triggers `update()` -> `_doSearch()` -> writes to `App.vue`'s `cards`, passed via RouterView props to `Search.vue`.

**After**: Navbar input becomes navigation-only. `@keyup.enter` does `router.push({ name: 'cards', query: { q: navInput } })`. `CardsPage.vue`'s mounted `init()` reads `route.query.q` and searches. The `$route.query` watcher in the composable handles subsequent navigation.

**Risk**: If user is already on `/cards` and types in navbar + Enter, the router push triggers the composable's route-query watcher -> rehydrates + re-searches. Correct behavior, but needs echo-guard (copy from App.vue lines 549-558) to prevent double-fetch.

### IP-2: RouterView Prop Binding Cleanup (HIGH)
**Current**: App.vue RouterView (lines 247-261) passes `:search-cards="cards"`, `:filters="activeFilters"`, `@update:filters` to ALL pages.

**After**: `App.vue`'s `cards` and `activeFilters` are removed. Recommended approach: keep RouterView bindings but stub `cards = ref({})` in App.vue (always empty). `Search.vue` hero shows when `!hasSearchResults({})` = true (always). `CardsPage.vue` has no matching prop definitions so attrs are silently ignored. Clean up bindings fully once `Search.vue` landing conversion is verified.

### IP-3: `deriveSearch` Export + Single Async Writer (CRITICAL)
**Current**: `deriveSearch` is already exported from App.vue (line 414: `export function deriveSearch`). Used only internally in `_doSearch()`.

**After**: `deriveSearch` and all helper functions move to `useCardSearch.js` and are imported from there. `CardsPage.vue` instantiates the composable -- single async writer. Navbar does NOT instantiate the composable; it only fires navigation.

**Risk**: Two composable instances (one in App.vue for navbar local state, one in CardsPage.vue) create isolated state -- intentional, but must be documented. The navbar input is a "type and navigate" widget only.

---

## 5. Patterns to Follow

- **Route addition**: `localeChildren` in `router/index.js` -- follow line 16 (`decks`) pattern; lazy dynamic import with webpackChunkName
- **SSG guard**: `typeof document === 'undefined'` check in `onMounted` -- same as `SearchTrending.vue`, `SetPage.vue`
- **SSG prerender**: vite.config.js `includedRoutes` loop -- follow lines 51-54 (homepages) pattern
- **Results grid markup**: Copy Search.vue lines 118-133 exactly (including SEO anchor pattern)
- **Script setup style**: All new components use `<script setup>` (Composition API), not Options API

---

## 6. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Double-fetch when navbar routes to /cards and composable watcher fires | HIGH | MEDIUM | Echo-guard in composable watcher (copy from App.vue line 549) |
| RouterView prop bindings breaking Search.vue (landing) during transition | MEDIUM | LOW | Stub `cards = {}` in App.vue; clean Search.vue before removing bindings |
| SSG build fails if CardsPage.vue fetches in SSR context | MEDIUM | MEDIUM | `if (typeof document === 'undefined') return` in onMounted |
| deriveSearch import path change | LOW | LOW | Only App.vue uses it; update import path when moving |
| mobileTabs still pointing to 'search' key breaks bottom nav | LOW | HIGH | Update mobileTabs key from 'search' to 'cards' for the browse tab |
| Pagination + multi-attribute client predicate truncation | MEDIUM | MEDIUM | Document cap; when client predicates active, fetch 100 and paginate client-side |
| sort param not in YGOPRODeck API | LOW | CERTAIN | Client-side sort only in V1; document limitation |

**Overall risk: MEDIUM** -- Main risk is the state extraction refactor. Functions are already mostly pure/standalone in App.vue. Two-instance composable design is intentional and safe.

---

## 7. File Change Map

| File | Action | Notes |
|------|--------|-------|
| `frontend/src/composables/useCardSearch.js` | CREATE | Extracted search state + async writer + URL helpers |
| `frontend/src/components/Pages/CardsPage.vue` | CREATE | New dedicated search/browse page |
| `frontend/src/views/App.vue` | MODIFY | Remove search state/methods; navbar to navigate-only; update changePage/mobileTabs |
| `frontend/src/components/Pages/Search.vue` | MODIFY | Remove results grid + filter panel; pure landing page |
| `frontend/src/components/Pages/search/SearchFiltersPanel.vue` | MODIFY | Add `layout` prop for sidebar mode (always-expanded) |
| `frontend/src/router/index.js` | MODIFY | Add `cards` route + bare redirect |
| `frontend/vite.config.js` | MODIFY | Add 4 `/{locale}/cards` routes to `includedRoutes` |
| `frontend/scripts/generate-sitemap.mjs` | MODIFY | Add `/cards` to STATIC_PAGES with priority 0.9 |
| `frontend/src/locales/en.json` | MODIFY | Add `cards.*` and `meta.cards.*` keys |
| `frontend/src/locales/fr.json` | MODIFY | Translated `cards.*` and `meta.cards.*` |
| `frontend/src/locales/de.json` | MODIFY | Translated `cards.*` and `meta.cards.*` |
| `frontend/src/locales/it.json` | MODIFY | Translated `cards.*` and `meta.cards.*` |

Note: `frontend/src/api.js` requires NO structural changes (num/offset already supported).

---

## 8. Open Questions Resolved

1. **Where should search state live?** -> `useCardSearch` composable, instantiated in `CardsPage.vue` (single async writer). Navbar is navigation-only.
2. **Should the navbar search remain global?** -> Yes, global on every page, always routes to `/cards?q=...`.
3. **Sort: server-side or client-side?** -> Client-side only. YGOPRODeck `cardinfo.php` has no `sort` param.
4. **Pagination vs infinite scroll?** -> Pagination. Better for URL persistence, SSG, accessibility. `num=40, offset=(page-1)*40`.
5. **Does the nav "Search" tab point to `/cards`?** -> Yes. `mobileTabs` search key routes to `cards`. Logo click may change to a `home` key or stay as `search` (pointing to `/{lc}/`).

---

## 9. SEO / useHead Notes

- `useHead` computed in App.vue (lines 23-79): No code changes needed. `t(\`meta.${page}.title\`)` (line 36) auto-resolves `meta.cards.title` when `page === 'cards'`.
- `seoQuery` (line 20): `route.query?.q` also works on `/cards?q=...` -- no change.
- Hreflang: `/cards` is a locale-prefixed multi-locale route -- handled by the `!isCardPage` branch (line 46) automatically.
- The `titleWithQuery` branch (line 34) shows `"{query} -- Yu-Gi-Oh! Trading | One for One"` on `/cards?q=Exodia` -- appropriate behavior.
