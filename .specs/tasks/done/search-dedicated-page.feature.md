# Dedicated Card Search Page (cardcluster-style /cards)

**Type:** feature
**Status:** draft

## User Request

> "very great let's make some changes I want to make a dedicated page for search like we have in cardcluster website (go check it)."

## Description

**What.** Create a dedicated, full-page card search/browse experience at its own route (`/cards`), modeled on cardcluster's `/cards`: a focused database browser with a persistent filter sidebar and a results grid — the kind of surface a collector uses to hunt cards by characteristics. Search moves OFF the home page entirely; the home page (`/`) becomes a landing/discovery page (hero, trending, set browser, latest releases, CTA) with no live search grid or filter panel. The dedicated page also adds four capabilities the current search lacks: sort options, the ability to browse beyond the first page of results, a results header (result count + active-filter summary), and a view-density toggle.

**Why.** Finding a card is the on-ramp to the product's core trade-matching flow (add to trade pile / wishlist → mutual match). Today the search experience is cramped and underpowered: it shares the home route with a marketing hero, trending, a set browser, and latest releases, capping a hunt at 40 unsorted results with no result count. Those two jobs — landing/discovery and active search — compete on one route. Splitting search onto its own focused, deep-linkable surface lets collectors hunt more effectively (more filters visible, sortable, paginated, sized to taste), which increases the rate of library/wishlist additions that feed the matching engine; it also frees the home page to orient and convert visitors. A dedicated, prerenderable `/cards` route additionally gives the site a clean, indexable surface for "browse Yu-Gi-Oh cards" intent.

**Who.** Collectors and players hunting specific cards (the primary beneficiary — they have limited time and specific cards in mind); new and returning visitors landing on `/` (who get a clearer, undiluted landing page); and the product itself (more cards found = more match fuel).

**Key constraints.** Reuse — do not duplicate — the existing filter logic (`SearchFiltersPanel.vue` and the `deriveSearch`/`serialize`/`deserialize`/`resolveTypeRace`/`cmpValue` helpers + `searchByFilters`, which already supports the `num`/`offset` pagination params). Results must have a single async writer so no two components race to write the card list. The page must not break the vite-ssg static build or hydration — search runs client-only behind the established guards. Dark-first design system (amethyst = primary/selection, hot-pink = wishlist, lime = mutual). WCAG AA, keyboard navigation, and `prefers-reduced-motion` apply. i18n covers en/fr/de/it. Card-tile/overlay visuals (`CardYugi.vue`) and the add-to-pile/wishlist auth flow are unchanged.

> The confirmed product decisions below are FIXED. The architecture phase decides HOW (where search state lives, whether to extract the filter helpers into a shared module, and whether pagination or infinite scroll is used); this specification does not prescribe those.

## Reference: cardcluster

- cardcluster's dedicated card search lives at [cardcluster.com/cards](https://cardcluster.com/cards) (help docs: [cardcluster.com/docs/card-search](https://cardcluster.com/docs/card-search)).
- It is a full-page card-database browser, separate from the home page, with a filter panel, a results grid of card images, sorting, and pagination.
- NOTE: cardcluster is a client-rendered SPA; it could not be rendered headlessly during drafting. The research phase should attempt to inspect it more deeply (or rely on the confirmed decisions below + the YGOPRODeck API capabilities) rather than guess at pixel specifics.

## Confirmed Product Decisions (from the user)

1. **Search moves off the home page.** Search lives ONLY on the new dedicated page. The home page (`/`) becomes a landing/discovery page (trending, set browser, latest releases, hero/CTA) with no live search grid or filter panel.
2. **Layout = left filter sidebar + results grid** (desktop), cardcluster-style. On mobile the sidebar collapses into a drawer / bottom sheet. Reuse the filter logic already built in `SearchFiltersPanel.vue` (and `deriveSearch`/`serialize`/`deserialize` in `App.vue`), restyled/recomposed for a sidebar.
3. **Add these capabilities** (beyond what search has today):
   - Sort options (e.g. name, level/rank, ATK, DEF, newest).
   - Pagination or infinite scroll (browse beyond today's 40-card cap, using the YGOPRODeck `num`/`offset` params — both confirmed required together).
   - Results header (result count + active-filter summary, e.g. "X cards").
   - View density toggle (grid vs compact list, or adjustable card size).
4. **Route path = `/cards`** (locale-prefixed: `/:locale/cards`), matching cardcluster.

## Scope

**In scope:**
- New route `/cards` (locale-prefixed) and a new dedicated page component (e.g. `CardsPage.vue`).
- Persistent left filter sidebar on desktop (recomposition of the existing `SearchFiltersPanel.vue`), drawer/sheet on mobile.
- Results grid reusing `CardYugi.vue` tiles, with the zero-results empty state and loading skeletons.
- Sort control, pagination/infinite scroll, results header (count + active filters), and a grid/list density toggle.
- Ownership of search state + fetching for the dedicated page (currently in `App.vue`); decide and document where it should live so there is a single async writer.
- Navbar search input behavior: typing/submitting should route the user to `/cards?q=...` and hand off to the dedicated page.
- URL query persistence on `/cards` (reuse the existing short-key schema `q,k,t,a,lv,lvc,ps,psc,r,lr,lrc,la`; extend for sort/page/view as needed).
- Home page (`Search.vue`) becomes a landing/discovery page: remove the live search results grid + filter panel; keep/relocate hero, trending, set browser, latest releases.
- i18n for all new labels across en, fr, de, it.
- SEO: `/cards` route registered for SSG/prerender (vite-ssg) and sitemap; appropriate `useHead` meta; keep search itself client-only behind the existing guards.

**Out of scope:**
- Saved searches / saved filter presets per account.
- New filter dimensions beyond those already in `SearchFiltersPanel.vue` (banlist/format/archetype autocomplete, etc.).
- Server-side persistence of last-used filters.
- Redesigning `CardYugi.vue` card tiles or the card detail overlay.
- Changes to Library, Trade Center, Decks, Account pages.

## Key Constraints

- Stack: Vue 3 (App.vue is Options API; new components use `<script setup>`), Vuetify 3, Tailwind v4, vite-ssg (SSR/SSG), vue-i18n (en/fr/de/it), YGOPRODeck API for card data.
- vite-ssg: the page must not break static build or hydration; search runs client-only (behind `typeof document`/mounted guards as established).
- Reuse, don't duplicate, the filter→API logic: `searchByFilters` (api.js, now sends `num`+`offset`, supports `type` CSV, `race`, `level/scale/link` comparator syntax, `linkmarker`), and `deriveSearch`/`serialize`/`deserialize`/`resolveTypeRace`/`cmpValue` currently in `App.vue`. These likely need to be extracted to a shared module so both the navbar and the dedicated page use them.
- Single async writer principle for results (avoid two components racing to write the card list).
- Dark-first design system (DESIGN.md): amethyst = primary/selection, hot-pink = wishlist, lime = mutual match. Filters already follow this after the recent restyle.
- Accessibility: WCAG AA, keyboard navigation, `prefers-reduced-motion`.

## Open Questions (for analysis/architecture to resolve)

- Where should search state + the single async writer live now that search leaves `App.vue`/`Search.vue`? (e.g. inside `CardsPage.vue`, or a composable / Pinia-less shared store.)
- Should the navbar search box remain global (on every page) and always route to `/cards`, or only appear contextually?
- Sort: which fields does the YGOPRODeck API support server-side (`sort=name|atk|def|level|new|...`) vs. needing client-side sorting?
- Pagination vs infinite scroll: which fits the existing UX and SSG best, and how does it interact with URL persistence (page/offset in the query)?
- Does the nav "Search" tab point to `/cards` now, and what becomes of the home tab/label?

---

## Acceptance Criteria

> Business-analysis defaults applied to the open questions above (consistent with the FIXED decisions; the architecture phase may refine the HOW but not these outcomes):
> - **Sort options**: Name (A→Z, default when a query/filter is active), Level/Rank, ATK, DEF, Newest. Use the YGOPRODeck server-side `sort=` where supported; client-side reverse only for descending if the API lacks it.
> - **Browse-beyond-40 mechanism**: criteria are written mechanism-agnostic — either pagination or infinite scroll is acceptable, but the current position (page/offset) MUST be reflected in the URL and restorable.
> - **Density**: at least two options — "comfortable" (default) and "compact".
> - **Navbar search**: stays global on every page; submitting always routes to `/:locale/cards?q=…`.
> - **Nav tabs**: the "Search" tab (desktop + mobile) points to `/:locale/cards`; the logo continues to point to home `/`.
> - **Result count**: header shows the API-reported total when present (YGOPRODeck `meta.total_rows`), otherwise the loaded-so-far count.
> - **Empty `/cards` state**: with no query and no filters, show a neutral initial state (no error, no skeletons) and fetch nothing until a query or filter is set.

### Functional Requirements

- [ ] **AC-1 — Dedicated route**: A dedicated search/browse page exists at `/cards`.
  - Given the app is running
  - When the user navigates to `/:locale/cards` (e.g. `/en/cards`)
  - Then the dedicated search page renders; and navigating to the legacy `/cards` (no locale) redirects to `/{detectedLocale}/cards`; and an unsupported locale falls back to the detected locale.

- [ ] **AC-2 — Home has no live search**: The home page is landing/discovery only.
  - Given the home route `/:locale/`
  - When it loads
  - Then no filter panel and no live search results grid are present, and the hero, trending, set browser, and latest releases are present.

- [ ] **AC-3 — Navbar search handoff**: The global navbar search routes to the dedicated page.
  - Given the user is on any page (e.g. `/en/library`)
  - When they type a query in the navbar search input and submit
  - Then the app navigates to `/:locale/cards?q=<query>` and the dedicated page applies and runs that query.

- [ ] **AC-4 — Filter sidebar (desktop) / drawer (mobile)**: All existing filter dimensions are available beside the grid.
  - Given the dedicated page is open with the full set of filter dimensions from `SearchFiltersPanel` (kind, category/sub-type, attribute, level/rank, scale, race, link rating, link arrows)
  - When viewed on desktop, the filters render as a persistent left sidebar alongside the results grid; and when viewed on mobile, the filters are hidden behind a drawer/bottom-sheet toggle that exposes the same controls
  - Then applying a filter narrows the results identically to the current search behavior.

- [ ] **AC-5 — Results grid and states**: Results render as card tiles with loading and empty states.
  - Given a query or active filter on the dedicated page
  - When results are loading, loading skeletons (59:86 aspect) are shown; when results return, matching cards render as `CardYugi` tiles in a grid; when a query/filter returns zero cards, a zero-results empty state is shown
  - Then the user can open a card tile's overlay and add it to their trade pile / wishlist (prompted to sign in if unauthenticated — existing behavior).

- [ ] **AC-6 — Sort control**: Results can be sorted.
  - Given results are displayed for a query/filter
  - When the user selects a sort option (e.g. "ATK, high→low")
  - Then the results re-order accordingly (each adjacent pair satisfies the chosen ordering, e.g. ATK of card N ≥ card N+1) and a sort key is reflected in the URL.

- [ ] **AC-7 — Browse beyond the first page**: Results are no longer capped at 40.
  - Given a query/filter that matches more than one page of cards
  - When the user advances to the next page or scrolls to the end of the current results (whichever mechanism is implemented)
  - Then additional, distinct cards load via the `num`/`offset` params, the current page/offset is reflected in the URL, and reloading the URL restores the same position.

- [ ] **AC-8 — Results header**: A header summarizes the result set.
  - Given a query/filter that yields results
  - When the results load
  - Then a header shows the result count (API total when present, else loaded-so-far) and a summary of the active query/filters; and clearing a filter updates the header accordingly.

- [ ] **AC-9 — View density toggle**: The user can change result density.
  - Given the dedicated page with results displayed
  - When the user toggles between densities (at least "comfortable" and "compact")
  - Then the grid rendering changes (tile size and/or column count), a view key is reflected in the URL, and reloading preserves the selected density.

- [ ] **AC-10 — Full URL persistence**: The complete search state is shareable and restorable.
  - Given a URL on `/cards` encoding query + filters + sort + page + density using the short-key schema (existing `q,k,t,a,lv,lvc,ps,psc,r,lr,lrc,la` plus new keys for sort/page/view)
  - When the URL is opened in a fresh tab, or the user uses browser back/forward, or switches locale on `/cards`
  - Then the exact state and results are restored (locale switch keeps the user on `/cards` with state intact and the UI re-localized), with no echo/redirect loop.

- [ ] **AC-11 — Single async writer**: Stale responses never overwrite newer results.
  - Given the user fires several queries/filter changes in rapid succession
  - When the responses return out of order
  - Then only the result set for the most recent request is rendered; earlier (slower) responses are discarded.

- [ ] **AC-12 — i18n complete**: All new UI is localized in all four locales.
  - Given the app in each of en, fr, de, it
  - When the dedicated page and its new controls (sort fields and directions, density options, pagination/"load more", results-header text, page meta) are displayed
  - Then every label is localized and no raw i18n key is visible.

- [ ] **AC-13 — SEO / SSG**: The route is prerendered, in the sitemap, and has meta.
  - Given a production build
  - When the build completes
  - Then a per-locale `/cards` HTML file is emitted, the sitemap includes `/cards`, the page source contains title + description + canonical meta (following the existing `useHead` pattern), and the page hydrates with no hydration-mismatch warning. Search execution remains client-only behind the established SSG guards.

### Error / Edge-Case Criteria

- [ ] **AC-14 — Zero results**: A search/filter combination that matches nothing shows the zero-results empty state, the header reflects a count of 0, and the user can adjust filters to recover.
- [ ] **AC-15 — API failure**: If a card request fails or times out, the page stays usable (no crash), results render as an empty list, and changing the query/filters retries.
- [ ] **AC-16 — Empty initial state**: Opening `/cards` with no query and no filters shows a neutral initial state (no error, no skeletons) and triggers no fetch until a query or filter is set.
- [ ] **AC-17 — End of results**: At the last page / end of the result set, the "next page" control is disabled (pagination) or infinite scroll stops fetching, with no duplicate or phantom loads.

### Non-Functional Requirements

- [ ] **Performance**: Query/filter changes are debounced (~300ms, preserving current behavior); card images use `loading="lazy"`; skeletons use the fixed 59:86 aspect so the grid does not shift layout (CLS) when images arrive.
- [ ] **Accessibility (WCAG AA)**: The sidebar/drawer, sort control, density toggle, and pagination/load-more are fully keyboard-operable with visible focus indicators; the mobile filter drawer is focus-trapped and dismissible; `prefers-reduced-motion` is respected for any non-essential motion.
- [ ] **Design fidelity**: Dark-first tokens; amethyst for selection/primary, hot-pink for wishlist actions, lime reserved for mutual-match signals only; no pure grays; no `transition: all`.
- [ ] **Build integrity**: The vite-ssg static build and SPA hydration both succeed; existing pages (Library, Trade Center, Decks, Account) and the `CardYugi` overlay are unchanged.

### Definition of Done

- [ ] All functional and error/edge acceptance criteria pass.
- [ ] Non-functional requirements verified.
- [ ] i18n keys added for en, fr, de, it.
- [ ] Production build prerenders `/cards`, sitemap updated, hydration clean.
- [ ] Tests written and passing where applicable; code reviewed.

---

## Architecture Overview

> The Confirmed Product Decisions above are FIXED. This section decides the technical **HOW**. It is grounded in the current code: `App.vue` is a hybrid `<script setup>` + Options `<script>` file that today owns ALL search state and is the single async writer; `searchByFilters` in `api.js` already sends `num`+`offset` together; `SearchFiltersPanel.vue` is a controlled `v-model:filters` component. The strategy moves that single-writer responsibility out of `App.vue` into a page-scoped composable owned exclusively by the new `CardsPage.vue`, and reduces the navbar to a navigation-only widget.

### Solution Strategy

1. **Extract, don't duplicate.** Lift the pure, component-free helpers currently defined at module scope in `App.vue` (`defaultFilters`, `serialize`, `deserialize`, `resolveTypeRace`, `cmpValue`, `deriveSearch`, `isFiltersDefault`, `PENDULUM_TYPES`, `LINK_ARROW_MARKERS`) into a new `frontend/src/composables/useCardSearch.js`. They are already `this`-free; `deriveSearch` is already `export`ed, so moving it is non-breaking once import paths update.
2. **One source of truth + one async writer.** The same module exports a `useCardSearch()` factory that owns the reactive search state (query, filters, results, total, loading, sort, density, pages-loaded), the debounced dispatcher, the sequence-guarded async fetch (the **sole writer** of the card list), the URL reflection, and the route→state echo guard. **Only `CardsPage.vue` instantiates it.**
3. **Navbar becomes navigation-only.** `App.vue` drops its search data, watchers, `update()`/`_doSearch()`, and the `mounted()` hydration block. The navbar `<input>` binds a tiny local `navQuery` ref; Enter → `router.push({ name: 'cards', query: { q } })`. The navbar never instantiates `useCardSearch()` and never writes results → **no two-writer race** (review concern #3).
4. **`CardsPage.vue`** renders a CSS-grid shell (filter sidebar + results area), recomposes `SearchFiltersPanel.vue` in a new `layout="sidebar"` mode, reuses `CardYugi` tiles (with the existing SEO anchor), and adds the results header, sort control, density toggle, and a "Load more" control — all driven by the composable.
5. **Home (`Search.vue`)** is reduced to landing/discovery: filter panel, results grid, zero-results state, and the dead `searchCards`/`filters`/`update:filters` props/emits are removed; hero condition simplifies to `v-if="!login"`; a CTA links to `/cards`.
6. **SSG/SEO**: register `/:locale/cards` in `vite.config` `includedRoutes` and add `/cards` to the sitemap's `STATIC_PAGES`; `App.vue`'s existing `useHead` auto-resolves `meta.cards.*` from `route.name`. Search stays client-only behind the established `onMounted`/`typeof document` guards; the prerendered page is an empty shell.

### Key Decisions

**KD-1 — Page-scoped composable as single source of truth + single async writer.**
`useCardSearch()` is instantiated once, inside `CardsPage.vue`. It is *not* a global singleton/store.
- *Reasoning:* Only one page performs search at a time; a factory composable gives a clean reactive surface without adding Pinia. Confining the writer to one instance structurally guarantees the single-writer invariant (AC-11).
- *Trade-off:* If two instances were ever co-mounted they would hold isolated state — accepted and documented; the navbar deliberately does not instantiate it (KD-2).

**KD-2 — Navbar does NOT instantiate the fetching composable (no two-writer race).**
The navbar keeps only a local `navQuery` string and on submit calls `router.push({ name:'cards', query:{ q } })`. All fetching happens inside `CardsPage`'s composable, reached via the route.
- *Reasoning:* Today `App.vue` is itself a writer; removing that and routing through the URL means there is exactly one code path that writes `cards`. (Review concern #3.)
- *Trade-off:* Typing in the navbar while already on `/cards` triggers a `router.push` whose query change the composable's watcher observes → handled by the echo guard (KD-9) so it hydrates+searches exactly once.

**KD-3 — Sort is server-side via YGOPRODeck `sort=`; descending is a client `.reverse()`.**
Add a `sort` param to `searchByFilters` (`if (sort) p.set('sort', sort)`). UI mapping: Name A→Z → `sort=name`; ATK/DEF/Level "high→low" → `sort=atk|def|level` then reverse the array client-side; Newest → `sort=new`. Default `name` is omitted from the URL.
- *Reasoning:* The skill's **live API probes** confirm `name|atk|def|level|new` work server-side on `cardinfo.php`; server-side sort is correct across the full result set, not just the loaded page. (This deliberately supersedes the codebase analysis's "client-side only" note, which predated those probes.) YGOPRODeck has no `sort_dir`, so descending uses a cheap client reverse of the already-paged data. For the multi-attribute client-predicate path, sorting is applied client-side to the filtered array as a fallback.
- *Trade-off:* `sort=atk` places `None`/`-1` ATK cards first; the reverse for "high→low" naturally pushes them last, which matches the UX. Document the label as "high → low".

**KD-4 — Browse mechanism = "Load more" (append), not numbered pages, not pure infinite scroll.**
A single "Load more" button appends the next 40 cards. URL key `pg` = number of pages loaded (default 1, omitted).
- *Reasoning:* (a) Append matches a browse/hunt flow better than discrete pages; (b) one button is trivially keyboard-operable with visible focus (NFR accessibility) versus an `IntersectionObserver` sentinel; (c) it is deterministic for SSG — nothing observes layout on mount; (d) **URL restore is one request**: on cold load with `pg=N`, fetch `num = N*40, offset = 0` in a single call (YGOPRODeck honors arbitrary `num`), restoring the exact set without N round-trips or scroll-anchor guessing.
- *URL/API/`meta` mapping:* incremental load = fetch `num=40, offset=loadedCount` and append; cold restore = single `num=pg*40, offset=0`. `num` and `offset` are always sent together (API errors otherwise — already enforced). `meta.total_rows` drives the header count and the end-of-results condition.
- *End of results (AC-17):* hide "Load more" when `cards.length >= totalRows`; the appended fetch is sequence-guarded so no duplicate/phantom loads.
- *Trade-off:* A deep `pg` produces one large initial request on cold load; acceptable for a card browser and far simpler than replaying paged requests.

**KD-5 — SSG hydration safety: deterministic empty-first render; fetch in `onMounted`; gate dynamic text behind `isMounted`.**
The prerendered `/cards` is a static shell — H1, sidebar layout, sort/density controls, neutral empty state — with **no card data and no numeric count baked into the HTML**. The first client render is byte-identical (empty grid + neutral state); `onMounted` then hydrates from `route.query` and fetches only if a query/filter is present.
- *Reasoning:* Matching the first client render to the prerendered HTML eliminates hydration mismatch and layout shift (review concern #1). The result count (`meta.total_rows`) is rendered only when `isMounted` is true (otherwise an empty placeholder), so SSG's `0` never disagrees with the client. Skeletons use the fixed 59:86 aspect so the grid reserves space (CLS-safe). This mirrors the existing `App.vue.mounted()` and `SetPage.vue` guards. **No `onServerPrefetch`** — unlike `SetPage`, results are always dynamic and never prerendered.

**KD-6 — Composable lifecycle on navigate-away-and-back = RESET; the URL is the only persistence.**
`CardsPage.vue` is `<script setup>`; leaving `/cards` unmounts it and the composable's refs are released. Returning re-instantiates and re-hydrates from `route.query`.
- *Reasoning:* The URL already encodes the full state (query + filters + `so`/`pg`/`vw`, AC-10), so persistence is free, shareable, and back/forward-correct. A fresh instance avoids flashing stale results from a previous hunt and avoids a module-level singleton that would hold memory and drift from the URL. (Review concern #2.)
- *Trade-off:* Returning re-fetches rather than reusing an in-memory cache; acceptable and consistent, and bfcache still serves the DOM instantly while Vue re-derives from the URL.

**KD-7 — `SearchFiltersPanel.vue` gains a `layout` prop (`'panel' | 'sidebar'`, default `'panel'`).**
In `sidebar` mode the panel is always expanded and skips its collapse toggle, collapsed summary chips, and reveal transition. The `v-model:filters` contract (`props.filters` + `emit('update:filters', merged)`) is unchanged.
- *Reasoning:* Reuse over duplication (FIXED constraint). The existing `activeChips`/`activeCount` computeds are reused for the results-header active-filter summary and the mobile Filters-button badge.

**KD-8 — Layout = pure CSS grid; mobile filters via `v-dialog` (not `v-navigation-drawer`).**
Desktop shell: `grid-template-columns: 272px 1fr`, sticky sidebar (`top: 72px`), collapsing to one column below 960px. Mobile: a `v-dialog fullscreen` hosts the same `SearchFiltersPanel`, opened by a Filters button gated on `isMounted`.
- *Reasoning:* A CSS grid needs no JS and renders identically under SSG. `v-navigation-drawer` reads `window.innerWidth` on mount and can produce hydration mismatches; `v-dialog` teleports to `<body>` and only renders once opened (always client-side).

**KD-9 — Echo-guarded route→state watcher in the composable; URL writes via `router.replace`.**
Port the `_lastWrittenQuery` guard from `App.vue`: the composable's own `router.replace` is ignored when it echoes back; external query changes (navbar push, back/forward, deep link) trigger one hydrate+search. URL writes only fire when `route.name === 'cards'`.
- *Reasoning:* Prevents the double-fetch when the navbar pushes `/cards?q=…` while already on the page, and the self-induced loop, with no redirect cycle (AC-3, AC-10).

### Component Diagram

```
                         router.push({ name:'cards', query:{ q } })
   ┌──────────────────────────────┐  ───────────────────────────────────►  URL  /:locale/cards?q&k&t&a&…&so&pg&vw
   │  App.vue  (shell, hybrid)    │                                          │  (single source of truth, shareable)
   │  • navbar <input> navQuery   │                                          │
   │    (navigation ONLY)         │                                          ▼
   │  • useHead → meta.cards.*    │                               ┌───────────────────────────────────────────┐
   │  • RouterView (cards stub)   │                               │  CardsPage.vue   <script setup>           │
   │  • mobileTabs/changePage     │                               │  ─ instantiates ──► useCardSearch()       │
   └──────────────┬───────────────┘                               │                     (SOLE async writer)   │
                  │ renders                                        │                                           │
                  ▼                                                │  state: query, activeFilters, cards,      │
   ┌──────────────────────────────┐                               │         totalRows, loading, sort,         │
   │  Search.vue (home, landing)  │                               │         density, pagesLoaded              │
   │  hero • trending • set       │                               │  actions: init / update(debounced) /      │
   │  browser • latest releases   │                               │           loadMore / runSearch(seq-guard) │
   │  (NO filter panel/results)   │                               │           syncUrl(echo-guard)             │
   └──────────────────────────────┘                               └───────┬───────────────┬───────────┬───────┘
                                                                          │ v-model       │ tiles     │ fetch
                                                                          ▼               ▼           ▼
                                              ┌────────────────────────────────┐  ┌──────────────┐  ┌───────────────────────┐
                                              │ SearchFiltersPanel.vue          │  │ CardYugi.vue │  │ api.js                │
                                              │ layout="sidebar" (desktop aside │  │ (unchanged)  │  │ searchByFilters(...    │
                                              │  / v-dialog on mobile)          │  │ tile+overlay │  │   + sort, num, offset) │
                                              │ emits update:filters            │  └──────────────┘  │ → YGOPRODeck cardinfo  │
                                              └────────────────────────────────┘                     │   meta.total_rows      │
                                                                                                      └───────────────────────┘
```

### Contracts — `useCardSearch()` public API

```js
// frontend/src/composables/useCardSearch.js

// Named pure helpers (moved from App.vue; importable directly):
export { defaultFilters, serialize, deserialize, isFiltersDefault,
         deriveSearch, resolveTypeRace, cmpValue, PENDULUM_TYPES, LINK_ARROW_MARKERS }

/**
 * Single source of truth + single async writer for the dedicated search page.
 * Instantiate ONLY in CardsPage.vue. The navbar must NOT call this.
 *
 * @param {{ routeName?: string, pageSize?: number }} [opts]
 * @returns {{
 *   // ── state (writable refs) ──
 *   searchQuery:   Ref<string>,
 *   activeFilters: Ref<Filters>,            // shape below; v-model target for SearchFiltersPanel
 *   cards:         Ref<Card[]>,             // the ONE list; only runSearch() writes it
 *   totalRows:     Ref<number>,             // from meta.total_rows (fallback: cards.length)
 *   loading:       Ref<boolean>,
 *   sort:          Ref<'name'|'atk'|'def'|'level'|'new'>,   // default 'name'
 *   density:       Ref<'grid'|'compact'>,                   // default 'grid'
 *   pagesLoaded:   Ref<number>,             // 1-based; default 1
 *
 *   // ── derived (readonly computed) ──
 *   hasMore:         ComputedRef<boolean>,  // cards.length < totalRows
 *   isFiltersActive: ComputedRef<boolean>,  // !isFiltersDefault(activeFilters)
 *   activeChips:     ComputedRef<Chip[]>,   // removable active-filter summary for the header
 *   activeCount:     ComputedRef<number>,   // for the mobile Filters badge
 *
 *   // ── actions ──
 *   init():        void,    // onMounted: hydrate from route.query; fetch iff query || filters active
 *   update():      void,    // debounced 300ms → resets pagesLoaded=1, runSearch(), syncUrl()
 *   loadMore():    void,    // pagesLoaded++, runSearch({ append:true }); guarded; no debounce
 *   setSort(v):    void,    // set sort → update()
 *   setDensity(v): void,    // set density → syncUrl() (no refetch)
 *   reset():       void,    // restore all state to defaults
 *   runSearch(o?): Promise<void>,  // { append?:boolean } — SOLE seq-guarded async writer
 *   syncUrl():     void,    // router.replace(serialized) when route.name===routeName; sets echo guard
 * }}
 */
export function useCardSearch({ routeName = 'cards', pageSize = 40 } = {}) { /* … */ }
```

```ts
// Supporting shapes
type Filters = {
  kind: 'monster'|'spell'|'trap'|null, category: string|null,
  spellType: string|null, trapType: string|null,
  attribute: string[], level: number|null, levelComparator: 'gte'|'eq'|'lte',
  scale: number|null, scaleComparator: 'gte'|'eq'|'lte', race: string|null,
  linkRating: number|null, linkRatingComparator: 'gte'|'eq'|'lte', linkArrows: string[],
}
type Chip = { id: string, label: string, clear: () => void }
```

**`searchByFilters` contract change (api.js):** accept an optional `sort` and append it
(`if (sort) p.set('sort', sort)`); `num`/`offset` semantics unchanged (always sent together).

**URL query schema (extends the existing short-key scheme):**

| Key | Meaning | Default (omitted) |
|---|---|---|
| `q,k,t,a,lv,lvc,ps,psc,r,lr,lrc,la` | query + filters (existing, reused via `serialize`/`deserialize`) | per existing rules |
| `so` | sort field — `name`/`atk`/`def`/`level`/`new` | `name` |
| `pg` | pages loaded (1-based) | `1` |
| `vw` | density — `grid`/`compact` | `grid` |

`so` stores the field only; the page applies the canonical direction per field (name asc; atk/def/level reversed client-side for "high → low"; new as returned).

### Expected Changes

**Create (2)**

| File | Purpose |
|---|---|
| `frontend/src/composables/useCardSearch.js` | Single source of truth + single async writer; re-exports the pure helpers lifted from `App.vue`; extends `serialize`/`deserialize` with `so`/`pg`/`vw`. |
| `frontend/src/components/Pages/CardsPage.vue` | Dedicated `/cards` page: CSS-grid shell, sidebar (`SearchFiltersPanel layout="sidebar"`) + mobile `v-dialog`, results header (count + `activeChips`), sort control, density toggle, `CardYugi` grid with SEO anchors, "Load more", `useHead`, instantiates `useCardSearch()`; empty-first render, fetch in `onMounted`. |

**Modify (9)**

| File | Change |
|---|---|
| `frontend/src/views/App.vue` | Remove search `data` (`searchQuery`, `cards`, `activeFilters`, `_searchTimer`, `_searchSeq`, `_lastWrittenQuery`), both watchers, `update()`/`_doSearch()`, and the `mounted()` hydration block. Navbar `<input>` → local `navQuery`; Enter → `router.push({ name:'cards', query:{ q } })`; `focusSearch` compares against `'cards'`. Add `cards: \`/${lc}/cards\`` to `changePage`; point the `search`/browse `mobileTab` to `cards`. RouterView: stub `cards = {}` (always empty) so `Search.vue`'s hero stays visible; `@update:filters` no-op (drop once `Search.vue` is converted). |
| `frontend/src/components/Pages/Search.vue` | Landing/discovery only: remove `SearchFiltersPanel`, results section, zero-results state, and the `searchCards`/`filters`/`update:filters` props/emits + `hasSearchResults`. Hero `v-if="!login"`. Keep trending/set-browser/latest-releases; add a CTA to `/cards`. |
| `frontend/src/components/Pages/search/SearchFiltersPanel.vue` | Add `layout` prop (`'panel'｜'sidebar'`); sidebar mode is always-expanded (no toggle/summary/transition). `v-model:filters` contract unchanged. |
| `frontend/src/router/index.js` | Add `{ path:'cards', name:'cards', component: () => import('@/components/Pages/CardsPage.vue') }` to `localeChildren`; add bare `{ path:'/cards', redirect: () => \`/${detectLocale()}/cards\` }`. |
| `frontend/src/api.js` | Add optional `sort` to `searchByFilters` and append it to the query. (Diverges from the analysis, which assumed no server sort; justified by KD-3's confirmed probes.) |
| `frontend/vite.config.js` | In `ssgOptions.includedRoutes`, push `/${locale}/cards` for all 4 locales; update the count comment (→ 58). |
| `frontend/scripts/generate-sitemap.mjs` | Add `{ path:'/cards', changefreq:'weekly', priority:0.9 }` to `STATIC_PAGES` (counts auto-update). |
| `frontend/src/locales/en.json` | Add `cards.*` (title, sort.*, density.*, loadMore, results count/noResults, filters drawer, emptyState) and `meta.cards.{title,desc}`. |
| `frontend/src/locales/fr.json` · `de.json` · `it.json` | Translated equivalents of the above keys. |

> `api.js` is modified (sort param) — this is the one intentional divergence from the codebase analysis's file map (which listed `api.js` as no-change). All other files match the analysis's change map.

---

## Implementation Process

Dependency-ordered steps grouped into phases. Critical-path / foundational steps are marked **[critical]**.

> **No separate Setup phase.** `vite-ssg`, `@unhead/vue`, and `vue-i18n` are already installed and wired (the SSR app factory, Vuetify-for-SSR, and the `useHead`/`onServerPrefetch` patterns all exist — see `SetPage.vue` and `App.vue`). There is nothing to scaffold or install; the process starts at Foundational. Config-level prerequisites (route registration, includedRoutes) are folded into their owning steps.

> **Single-writer safety window (read first).** `App.vue` is *today* the sole async writer of the card list. The new sole writer is `CardsPage.vue`'s `useCardSearch()`. Therefore **Step 6 (remove App.vue's writer) MUST land after Step 4 (CardsPage is a working writer)** — otherwise search is broken in the interim. The critical ordering is: S1 → S2 → S3 → S4a → S4b → S5 → S6 → S7 → S9 → S8 → S10.

> **i18n soft-dependency.** Step 9 (i18n keys) is placed in Polish for grouping, but Step 4b's UI labels and Step 8's meta both consume `cards.*` / `meta.cards.*`. Add the keys *before or alongside* Step 4b so no label is hardcoded. Each affected step notes this.

---

### Parallel Execution Plan

> The steps below are also annotated with explicit **Depends on:** / **Parallel with:** lines and grouped into execution **Waves**. Two independent axes decide concurrency: (A) a **data/logic** dependency (a step needs another's output) and (B) a **file-conflict** dependency (two steps editing the **same file** must never run concurrently). The waves honor BOTH. The original linear order (`S1 → S2 → S3 → S4a → S4b → S5 → S6 → S7 → S9 → S8 → S10`) remains a valid serial fallback; the waves below are the parallel-optimized schedule.

**Waves (run steps within a wave concurrently; finish a wave before starting the next):**

| Wave | Steps (run in parallel) | Gate to enter | Files touched (disjoint within wave) |
|---|---|---|---|
| **Wave 1** | **S1, S2, S3, S9** | — (start) | `useCardSearch.js` (new) · `api.js` · `SearchFiltersPanel.vue` · `{en,fr,de,it}.json` |
| **Wave 2** | **S4a** | Wave 1 done | `CardsPage.vue` (new) |
| **Wave 3** | **S4b, S5** | Wave 2 done | `CardsPage.vue` · (`router/index.js` + `App.vue`) |
| **Wave 4** | **S6** | Wave 3 done **+ search verified working on `/cards`** (single-writer gate) | `App.vue` |
| **Wave 5** | **S7, S8** | Wave 4 done | `Search.vue` (+ drop App.vue stub) · (`vite.config.js` + `generate-sitemap.mjs`) |
| **Wave 6** | **S10** | Wave 5 done | (build verification — no source file) |

**Max parallelization depth = 4** (Wave 1 runs S1, S2, S3, S9 concurrently). Wave 3 and Wave 5 each run 2 steps concurrently.

**Parallelization diagram (waves → steps; arrows = cross-wave dependency):**

```
WAVE 1 (4 concurrent — foundational, fully independent files)
  ┌── S1  useCardSearch.js (composable)  [critical]
  ├── S2  api.js  sort param             [critical]
  ├── S3  SearchFiltersPanel layout prop [critical]
  └── S9  i18n cards.* / meta.cards.* ×4
        │        │              │            │
        │        │              │            └────────────────────────────┐
        ▼        ▼              ▼                                          │
WAVE 2 (1)   S1+S3 ───────►  S4a  CardsPage shell + empty-first render [critical]
                                   │                                       │
                 ┌─────────────────┴───────────────┐                       │
                 ▼ (S4a)                            ▼ (S4a)                 │
WAVE 3 (2 concurrent — disjoint files)                                      │
   S4b  CardsPage results/sort/density/load-more [critical] ◄── S9 (labels)─┘
   S5   router child + bare redirect + App.vue nav wiring
        │ (S4b+S5)                         │ (S5: route exists)
        ▼                                  │
WAVE 4 (1 — single-writer cutover; GATE: search works on /cards)            │
   S6   App.vue navbar→nav-only; remove old writer; RouterView stub [critical]
        │ (S6: stub in place)              │
        ▼                                  ▼
WAVE 5 (2 concurrent — disjoint files)
   S7   Search.vue → landing/discovery (drops App.vue stub)
   S8   vite-ssg includedRoutes + sitemap  ◄── S5 (route name) + S9 (meta keys)
        │
        ▼
WAVE 6 (1)
   S10  SSG hydration + deep-link verification [verification]
```

**Sub-agent execution directive (for the orchestrator):**

- **Agent type:** ALL implementation/verification steps use **`general-purpose`** (the `sdd:*` agents are not installed). Model per step is listed on each step's `Agent:` line and summarized below.
- **MUST run in parallel within their wave** (dispatch as separate `general-purpose` sub-agents in a single batch): **Wave 1 → {S1, S2, S3, S9}**, **Wave 3 → {S4b, S5}**, **Wave 5 → {S7, S8}**.
- **Ordering constraints between waves (hard, sequential):** do **not** start wave _N+1_ until **every** step in wave _N_ has completed and (for code waves) the app still builds. Specifically: `Wave 1 → Wave 2 → Wave 3 → Wave 4 → Wave 5 → Wave 6`.
- **Single-writer gate (CRITICAL, blocks Wave 4):** S6 removes `App.vue`'s old search writer. It must **not** start until **S4a _and_ S4b are merged and search is verified working on `/cards`** — otherwise search is broken in the interim. Verify before dispatching S6.
- **Single-file guard:** never run two steps that edit the **same file** in the same wave. The wave layout already enforces this — `S4a`/`S4b` are split across Waves 2/3 (both write `CardsPage.vue`); `S5`/`S6` across Waves 3/4 (both edit `App.vue`); `S6`/`S7` across Waves 4/5 (S7 drops the stub S6 added).
- **Optional review:** after Wave 5 (before S10), an optional review pass may run with **`pr-review-toolkit:code-reviewer`** over the full diff.

**Agent / model distribution:** `general-purpose` for all 11 steps. Models — **opus ×6** (S1, S4a, S4b, S6, S7, S10), **sonnet ×5** (S2, S3, S5, S8, S9), **haiku ×0**. Optional `pr-review-toolkit:code-reviewer` review step (not counted).

---

### Phase A — Foundational

#### Step 1 — Extract `useCardSearch` composable from `App.vue` **[critical]**

> **Wave 1.** **Depends on:** nothing (foundational). **Parallel with:** S2, S3, S9 (disjoint files). **Agent:** general-purpose (model: opus).

**Goal.** Lift the `this`-free pure helpers out of `App.vue` and build the page-scoped `useCardSearch()` factory that becomes the single source of truth + single async writer. Behavior of the extracted helpers must be byte-for-byte identical (anchors KD-1, KD-2, KD-9; AC-11).

**Expected Output.**
- `frontend/src/composables/useCardSearch.js` (new) — exports the named pure helpers **and** the `useCardSearch()` factory, per the "Contracts" section of the Architecture Overview.

**Success Criteria.**
- `frontend/src/composables/useCardSearch.js` exports, as named exports: `defaultFilters`, `serialize`, `deserialize`, `isFiltersDefault`, `deriveSearch`, `resolveTypeRace`, `cmpValue`, `PENDULUM_TYPES`, `LINK_ARROW_MARKERS` — copied verbatim from `App.vue` (lines 298–493) with no logic change.
- `useCardSearch({ routeName='cards', pageSize=40 })` returns the exact surface in the contract: state refs `searchQuery`, `activeFilters`, `cards`, `totalRows`, `loading`, `sort` (default `'name'`), `density` (default `'grid'`), `pagesLoaded` (default `1`); computeds `hasMore`, `isFiltersActive`, `activeChips`, `activeCount`; actions `init`, `update`, `loadMore`, `setSort`, `setDensity`, `reset`, `runSearch`, `syncUrl`.
- `runSearch({ append })` is the **only** function that assigns `cards.value`; it captures a `seq` counter before the first `await` and discards stale responses (port of `_doSearch` lines 573–633) — satisfies **AC-11**.
- `runSearch` extends `serialize`/`deserialize` to round-trip `so`/`pg`/`vw` (defaults `name`/`1`/`grid` omitted from the URL) per the URL-schema table.
- `update()` debounces 300 ms, resets `pagesLoaded=1`, calls `runSearch()` then `syncUrl()`; `loadMore()` increments `pagesLoaded`, calls `runSearch({ append:true })` (no debounce), is sequence-guarded.
- `syncUrl()` calls `router.replace` only when `route.name === routeName` and sets the `_lastWrittenQuery` echo guard (port of lines 624–629); the route→state watcher honours that guard (port of lines 546–559) — satisfies **AC-10**, **AC-9** (no echo loop).
- File imports `searchByFilters`, `searchCardByName`, `searchCardBySetCode`, `searchById` from `@/api` (the name-search fallback chain at lines 600–621 is preserved for the no-filters path).

**Subtasks.**
- Create `useCardSearch.js`; move the 9 pure helpers verbatim from `App.vue`; keep `deriveSearch` exported (it already is) so existing imports resolve.
- Implement the factory's reactive refs and the four readonly computeds (`activeChips` re-derives the same chip list as `SearchFiltersPanel.vue` line 138, or imports a shared chip builder).
- Port `_doSearch` → `runSearch({ append })`: seq guard, filtered path (`searchByFilters(serverParams)` + client predicates), no-filters name-search fallback chain, `append` mode (concat instead of replace), set `totalRows` from `response.data?.meta?.total_rows` else `cards.length`.
- Wire `sort` into `serverParams` (passes to `searchByFilters`) and apply the client `.reverse()` for atk/def/level "high→low"; multi-attribute predicate path sorts the filtered array client-side.
- Implement `update()` (debounce 300 ms, reset page), `loadMore()` (append, guarded), `setSort`/`setDensity`, `reset()`.
- Implement `init()` (hydrate from `route.query`, fetch iff `searchQuery || isFiltersActive`), `syncUrl()` (echo-guarded `router.replace`), and the route→state watcher with `_lastWrittenQuery`.
- Extend `serialize`/`deserialize` with `so`/`pg`/`vw` round-trip.
- Add focused unit-style assertions (or a smoke harness) for `serialize`/`deserialize` round-trip incl. the new keys, and `deriveSearch` parity vs the old `App.vue` output.

**Blockers (resolved).**
- *Composable needs `useRouter`/`useRoute`, which require an active component instance.* → Resolution: the factory calls them at instantiation time; only `CardsPage.vue` (a component) instantiates it (KD-1). Documented invariant.

**Risks (mitigated).**
- *Behavioral drift while moving helpers* → Mitigation: copy verbatim, re-export `deriveSearch` from the new path, diff against `App.vue` originals; round-trip assertions on `serialize`/`deserialize`.
- *Two co-mounted instances would hold isolated state* → Mitigation: documented that only `CardsPage` instantiates; navbar never does (KD-2).

**Effort.** Large. *(Foundational; if it grows past Large during build, split state/helpers from the async `runSearch`+URL logic — but keep as one step for the spec.)*

#### Verification

**Level: Panel (2 judges) — critical.** Behavior of the extracted helpers and the sole-async-writer invariant must be preserved exactly; a panel cross-checks behavioral parity against URL/echo/sort correctness. **Threshold: 4.5 / 5** (both judges must average ≥ 4.5).

**Judge A — Behavioral parity & single-writer invariant** (anchors KD-1, AC-11)

| # | Criterion | Weight |
|---|---|---|
| A1 | The 9 pure helpers (`defaultFilters`, `serialize`, `deserialize`, `isFiltersDefault`, `deriveSearch`, `resolveTypeRace`, `cmpValue`, `PENDULUM_TYPES`, `LINK_ARROW_MARKERS`) are present as **named exports**, copied verbatim from `App.vue` (≈ lines 298–493) with **no logic change** (a side-by-side diff of each helper body shows only import-path/formatting deltas). | 0.25 |
| A2 | `runSearch({ append })` is the **only** function that assigns `cards.value`; it captures a `seq` counter **before the first `await`** and discards a response whose `seq` is stale, so out-of-order responses never overwrite newer ones (faithful port of `_doSearch` lines 573–633). **AC-11.** | 0.30 |
| A3 | The factory returns the **complete** contract surface: state refs `searchQuery`, `activeFilters`, `cards`, `totalRows`, `loading`, `sort` (default `'name'`), `density` (default `'grid'`), `pagesLoaded` (default `1`); computeds `hasMore`, `isFiltersActive`, `activeChips`, `activeCount`; actions `init`, `update`, `loadMore`, `setSort`, `setDensity`, `reset`, `runSearch`, `syncUrl`. | 0.20 |
| A4 | The no-filters **name-search fallback chain** (`searchCardByName` → `searchCardBySetCode` → `searchById`, App.vue lines 600–621) is preserved for the query-only path; `searchByFilters`/`searchCardByName`/`searchCardBySetCode`/`searchById` are imported from `@/api`. | 0.15 |
| A5 | Round-trip / parity checks exist (smoke harness or assertions): `serialize`→`deserialize` is identity incl. new keys, and `deriveSearch` output matches the pre-extraction `App.vue` behavior. | 0.10 |

**Judge B — URL reflection, echo guard & sort wiring** (anchors KD-3, KD-9, AC-6, AC-9, AC-10)

| # | Criterion | Weight |
|---|---|---|
| B1 | `serialize`/`deserialize` are extended to round-trip `so`/`pg`/`vw` with defaults (`name`/`1`/`grid`) **omitted** from the URL, per the URL-schema table. **AC-10.** | 0.30 |
| B2 | The `_lastWrittenQuery` echo guard is ported and `syncUrl()` calls `router.replace` **only** when `route.name === routeName`; the composable's own URL write does not retrigger a hydrate/fetch (no echo loop). **AC-9, AC-10.** | 0.25 |
| B3 | A route→state watcher hydrates from `route.query` and triggers **exactly one** hydrate+search on an external query change (navbar push / back-forward / deep link), honouring the echo guard. | 0.15 |
| B4 | Sort is wired into `serverParams` (passed to `searchByFilters`), descending for `atk`/`def`/`level` is a client `.reverse()`, and the multi-attribute client-predicate path sorts the filtered array client-side as a fallback. **KD-3, AC-6.** | 0.20 |
| B5 | `update()` debounces ~300 ms and resets `pagesLoaded = 1` before `runSearch()` then `syncUrl()`; `loadMore()` increments `pagesLoaded`, calls `runSearch({ append:true })` with **no debounce**, and is sequence-guarded. | 0.10 |

---

#### Step 2 — Add server-side `sort` param to `searchByFilters` **[critical]**

> **Wave 1.** **Depends on:** nothing (foundational). **Parallel with:** S1, S3, S9 (disjoint files — only `api.js`). **Agent:** general-purpose (model: sonnet).

**Goal.** Teach the API bridge to forward YGOPRODeck's server-side `sort=` so `runSearch` can sort across the full result set (anchors KD-3; AC-6). This is the one intentional divergence from the codebase analysis (which assumed no server sort).

**Expected Output.**
- `frontend/src/api.js` — `searchByFilters` accepts an optional `sort` and appends it.

**Success Criteria.**
- `searchByFilters` (line 96) destructures an additional `sort` and runs `if (sort) p.set('sort', sort)` before the `num`/`offset` block; `num`/`offset` semantics unchanged (always sent together, line 107).
- A call `searchByFilters({ fname:'dragon', sort:'atk', num:40, offset:0 })` produces a URL containing `&sort=atk&num=40&offset=0`; a call with no `sort` produces no `sort` key.
- The JSDoc block above the function documents the `sort` param (`name|atk|def|level|new`).

**Subtasks.**
- Add `sort` to the destructured options object (default `undefined`).
- Append `if (sort) p.set('sort', sort)`.
- Update the JSDoc to list `@param {string} [sort]` and the accepted values.
- Manually hit the live endpoint once (or in S10) to confirm `name|atk|def|level|new` return ordered results (validates the KD-3 probe assumption).

**Blockers.** None.

**Risks (mitigated).**
- *Analysis claimed sort is client-only; if a field is unsupported it could 500* → Mitigation: KD-3 trusts the recorded live probes; `runSearch` keeps a client `.reverse()` for descending and a client-sort fallback for the multi-attribute predicate path, so a server hiccup degrades to client sort of the loaded array rather than crashing (AC-15).

**Effort.** Small.

#### Verification

**Level: Single — medium.** A focused, additive contract change to one function; a single judge over the `api.js` diff is sufficient. **Threshold: 4.0 / 5.**

| # | Criterion | Weight |
|---|---|---|
| 1 | `searchByFilters` destructures an optional `sort` (default `undefined`) and appends `if (sort) p.set('sort', sort)` **before** the `num`/`offset` block (line ≈ 96/107). | 0.40 |
| 2 | `num`/`offset` semantics are **unchanged** — still always sent together (no regression to the existing pagination contract that errors otherwise). | 0.25 |
| 3 | URL correctness: `searchByFilters({ fname:'dragon', sort:'atk', num:40, offset:0 })` yields a query containing `&sort=atk&num=40&offset=0`; a call with **no** `sort` produces **no** `sort` key. **AC-6.** | 0.20 |
| 4 | The JSDoc above the function documents `@param {string} [sort]` and the accepted values `name｜atk｜def｜level｜new`. | 0.15 |

---

#### Step 3 — Add `layout` prop to `SearchFiltersPanel.vue` **[critical]**

> **Wave 1.** **Depends on:** nothing (foundational, additive prop). **Parallel with:** S1, S2, S9 (disjoint files — only `SearchFiltersPanel.vue`). **Agent:** general-purpose (model: sonnet).

**Goal.** Let the existing filter panel render as an always-expanded sidebar without breaking its current top-panel (`'panel'`) usage (anchors KD-7; AC-4). Reuse-not-duplicate is a FIXED constraint.

**Expected Output.**
- `frontend/src/components/Pages/search/SearchFiltersPanel.vue` — gains `layout: { type: String, default: 'panel' }`.

**Success Criteria.**
- New prop `layout` with values `'panel' | 'sidebar'`, default `'panel'`.
- In `'sidebar'` mode: the collapse toggle button (line 266), the collapsed summary chips block (line 284), and the `<Transition name="reveal">` (line 293) are not rendered / the body is always expanded (`expanded` forced true).
- In `'panel'` mode the component renders **identically to today** (default path unchanged) — verified on the current home/`Search.vue` usage until Step 7 removes it.
- The `v-model:filters` contract is unchanged: still `props.filters` in, `emit('update:filters', merged)` out; `activeChips`/`activeCount` computeds still exported/usable.

**Subtasks.**
- Add the `layout` prop.
- Compute an `isSidebar` flag; force `expanded` true when `isSidebar`.
- Guard the toggle button, collapsed-summary block, and reveal transition behind `!isSidebar` (or render the body unconditionally in sidebar mode).
- Add minimal sidebar-mode styling hooks (e.g. drop the outer card chrome if the sidebar provides it) without touching `'panel'` styles.
- Verify the default (`'panel'`) render is pixel-unchanged on the current home page.
- Confirm `activeChips`/`activeCount` remain available for `CardsPage` header + mobile badge reuse.

**Blockers.** None (additive prop).

**Risks (mitigated).**
- *Regressing the existing top-panel usage* → Mitigation: default `'panel'` preserves all current branches; only `'sidebar'` adds behavior; visual diff the home page before Step 7.

**Effort.** Medium.

#### Verification

**Level: Single — medium.** An additive prop with a default that preserves current behavior; one judge over the `SearchFiltersPanel.vue` diff checks the new branch and the no-regression guarantee. **Threshold: 4.0 / 5.**

| # | Criterion | Weight |
|---|---|---|
| 1 | A new prop `layout: { type: String, default: 'panel' }` is added, accepting `'panel' \| 'sidebar'`. | 0.25 |
| 2 | In `'sidebar'` mode the collapse toggle (≈ line 266), the collapsed summary-chips block (≈ line 284), and the `<Transition name="reveal">` (≈ line 293) are **not** rendered, and the body is always expanded (`expanded` forced true via an `isSidebar` flag). **AC-4.** | 0.30 |
| 3 | In `'panel'` mode the component renders **identically to today** — the default code path and its `'panel'` styles are untouched (no regression to the current home/`Search.vue` usage). | 0.25 |
| 4 | The `v-model:filters` contract is unchanged (`props.filters` in, `emit('update:filters', merged)` out), and the `activeChips` / `activeCount` computeds remain exported/usable for the `CardsPage` header + mobile Filters badge. | 0.20 |

---

### Phase B — Main implementation

#### Step 4a — Create `CardsPage.vue` shell (layout + composable wiring + empty-first render) **[critical]**

> **Wave 2.** **Depends on:** S1 (instantiates `useCardSearch()`), S3 (`SearchFiltersPanel layout="sidebar"`). **Parallel with:** none (runs alone — S4b conflicts on the same file; downstream steps need this file to exist). **Agent:** general-purpose (model: opus).

**Goal.** Build the `/cards` page skeleton: CSS-grid shell (sidebar + results area), instantiate `useCardSearch()`, render the sidebar via `SearchFiltersPanel layout="sidebar"` (desktop) + `v-dialog` (mobile), wire `useHead`, and guarantee a deterministic empty-first render with the fetch deferred to `onMounted` (anchors KD-5, KD-8; AC-1, AC-4, AC-13, AC-16).

**Expected Output.**
- `frontend/src/components/Pages/CardsPage.vue` (new) — `<script setup>`, CSS-grid shell, sidebar + mobile dialog, `useCardSearch()` instance, `useHead`, `onMounted → init()`.

**Success Criteria.**
- File `frontend/src/components/Pages/CardsPage.vue` exists and instantiates `useCardSearch()` exactly once.
- Desktop: a pure CSS grid `grid-template-columns: 272px 1fr`, sticky sidebar `top:72px`, collapsing to one column below 960px (no Vuetify layout component for the shell) — per KD-8.
- Mobile: a `v-dialog fullscreen` hosts the same `SearchFiltersPanel`, opened by a Filters button **gated on `isMounted`** (so it never renders during SSG) — per KD-8.
- The sidebar binds `:filters` / `@update:filters` to the composable's `activeFilters` (v-model contract from Step 3).
- **Empty-first render (AC-13/AC-16):** with no card data, the prerendered + first-client render is byte-identical — H1, sidebar layout, sort/density controls, and a neutral empty state, with **no card tiles and no numeric count** baked into HTML. The result count renders only when `isMounted` is true.
- `useHead(computed(...))` is called in setup so it runs during SSR; it resolves `meta.cards.title`/`meta.cards.desc` (App.vue's existing `useHead` already auto-resolves `meta.<route.name>.*`, so this can be minimal/aligned) — supports **AC-13**.
- `onMounted` calls `init()`; no fetch fires unless `route.query` carries a query or active filter — satisfies **AC-16**.

**Subtasks.**
- Scaffold `<script setup>`: import `useCardSearch`, `SearchFiltersPanel`, `CardYugi`; instantiate composable; destructure refs/actions.
- Build the CSS-grid template (sidebar `<aside>` + results `<main>`); add the sticky/responsive CSS (mirror the skill's `.cards-layout`/`.cards-sidebar`).
- Render `SearchFiltersPanel layout="sidebar"` in the aside, bound to `activeFilters`.
- Add `isMounted` ref set in `onMounted`; build the mobile Filters button (gated) + `v-dialog fullscreen` hosting the same panel with the `activeCount` badge.
- Add the neutral empty-state block (no skeletons, no count) for the no-query/no-filter case.
- Add `useHead(computed(...))` for title/description/canonical aligned with the App.vue pattern.
- Call `init()` in `onMounted`; verify zero fetch on a bare `/cards`.
- Confirm the prerendered shell and first client render match (hand-verify markup; full build check in S10).

**Blockers (resolved).**
- *`v-navigation-drawer` reads `window.innerWidth` on mount → hydration mismatch.* → Resolution: use `v-dialog` (teleports to body, renders only when opened — always client-side), per KD-8.

**Risks (mitigated).**
- *Any dynamic value in the prerendered HTML breaks hydration* → Mitigation: gate count/cards/dialog behind `isMounted`; neutral empty-first render; validated in S10.

**Effort.** Large. *(Split from S4b deliberately to keep each ≤ Large.)*

#### Verification

**Level: Panel (2 judges) — critical.** This shell carries the SSG hydration-safety contract (empty-first render) and the single-instantiation of the writer; one judge audits hydration/empty-first, the other the layout/composable wiring. **Threshold: 4.5 / 5** (both judges must average ≥ 4.5).

**Judge A — SSG hydration & empty-first render** (anchors KD-5, AC-13, AC-16)

| # | Criterion | Weight |
|---|---|---|
| A1 | The prerendered + first-client render is **byte-identical**: H1, sidebar layout, sort/density controls, and a neutral empty state, with **no card tiles and no numeric count baked into the HTML**. **AC-13, AC-16.** | 0.35 |
| A2 | The result count (`meta.total_rows`) is rendered **only** when `isMounted` is true (an empty placeholder otherwise), so SSG's absent/`0` count never disagrees with the client. | 0.20 |
| A3 | `onMounted` calls `init()`, and **no fetch fires** unless `route.query` carries a query or an active filter — a bare `/cards` triggers zero network calls. **AC-16.** | 0.25 |
| A4 | `useHead(computed(...))` is called in `setup` (so it runs during SSR) and resolves `meta.cards.title` / `meta.cards.desc`, aligned with App.vue's auto-resolve-by-`route.name` pattern. **AC-13.** | 0.20 |

**Judge B — Layout shell & composable wiring** (anchors KD-1, KD-8, AC-1, AC-4)

| # | Criterion | Weight |
|---|---|---|
| B1 | `CardsPage.vue` instantiates `useCardSearch()` **exactly once** (the sole-writer instance; the navbar does not). **KD-1.** | 0.25 |
| B2 | Desktop shell is a **pure CSS grid** `grid-template-columns: 272px 1fr`, sticky sidebar `top: 72px`, collapsing to one column below 960px — **no Vuetify layout component** for the shell. **KD-8.** | 0.25 |
| B3 | Mobile filters use a `v-dialog fullscreen` (teleported, renders only when opened) gated on `isMounted`, **not** `v-navigation-drawer` (avoids `window.innerWidth` hydration mismatch). **KD-8.** | 0.25 |
| B4 | The sidebar renders `SearchFiltersPanel layout="sidebar"` and binds `:filters` / `@update:filters` to the composable's `activeFilters` (v-model contract from S3). **AC-4.** | 0.25 |

---

#### Step 4b — `CardsPage.vue` results: grid, header, sort, density, load-more, states **[critical]**

> **Wave 3.** **Depends on:** S4a (extends the same `CardsPage.vue`), S9 (consumes `cards.*` labels), S2 (runtime — `sort` param, already landed in Wave 1). **Parallel with:** S5 (disjoint files — S4b edits `CardsPage.vue`, S5 edits `router/index.js` + `App.vue`). **Agent:** general-purpose (model: opus).

**Goal.** Add the data-driven UI on top of the S4a shell: results grid (CardYugi tiles + SEO anchor), results header (count + active-filter chips), sort control, density toggle, "Load more", loading skeletons, zero-results, and end-of-results handling (anchors KD-3, KD-4; AC-5, AC-6, AC-7, AC-8, AC-9, AC-14, AC-15, AC-17, NFR perf/a11y).

> Uses `cards.*` i18n keys — coordinate with **Step 9** (add keys first/alongside; do not hardcode labels). S9 lands in Wave 1, so the keys exist before this step.

**Expected Output.**
- `frontend/src/components/Pages/CardsPage.vue` (extended) — full results area.

**Success Criteria.**
- Results render `CardYugi :componentCard="card"` tiles in the grid, each wrapped with the SEO anchor `<a :href="/${locale}/card/${card.id}" class="absolute inset-0 z-0 pointer-events-none" tabindex="-1">` (copied from `Search.vue` 123–128); overlay add-to-pile/wishlist still works — satisfies **AC-5**.
- Loading state shows skeletons at fixed `aspect-ratio: 59/86`; images use `loading="lazy"` (CardYugi already does) — CLS-safe per NFR.
- Zero results shows the empty state and the header reads count 0; user can change filters to recover — satisfies **AC-14**, **AC-17** (no phantom loads).
- Results header shows `totalRows` (API `meta.total_rows`, else loaded count) and the active-filter summary via the composable's `activeChips` (each removable); clearing a chip updates header + results — satisfies **AC-8**.
- Sort control exposes Name (A→Z, default), Level/Rank, ATK (high→low), DEF (high→low), Newest; selecting one calls `setSort` → re-orders (each adjacent pair satisfies the ordering) and writes `so` to the URL — satisfies **AC-6**.
- Density toggle exposes "comfortable" (`grid`, default) and "compact"; toggling calls `setDensity`, changes tile size/columns, writes `vw` to the URL, no refetch — satisfies **AC-9**.
- "Load more" calls `loadMore()` (appends next 40 via `num`/`offset`), is hidden when `cards.length >= totalRows`; cold-load with `pg=N` restores via a single `num=N*40, offset=0` request — satisfies **AC-7**, **AC-17**.
- API failure leaves the page usable (empty list, no crash); changing query/filters retries — satisfies **AC-15**.
- Sort control, density toggle, and Load-more are keyboard-operable with visible focus; mobile dialog focus-trapped + dismissible; `prefers-reduced-motion` respected — NFR a11y.

**Subtasks.**
- Build the results grid binding `cards`, with the SEO anchor wrapper + `CardYugi` (forward `@showTraders`→ parent's `TradeCenter`, `@requireAuth`).
- Add skeleton placeholders (fixed 59:86) shown while `loading`.
- Build the results header: count text (`isMounted`-gated) + `activeChips` removable facets.
- Build the sort control (menu/select) mapping UI options → `setSort('name'|'atk'|'def'|'level'|'new')`; label the descending ones "high → low".
- Build the density toggle (`grid`/`compact`) → `setDensity`; add the `compact` grid CSS (smaller tiles / more columns).
- Build "Load more" button → `loadMore()`; bind visibility to `hasMore`.
- Add the zero-results empty state and the error-tolerant empty list.
- Add focus styles, ensure dialog focus-trap/dismiss, honour `prefers-reduced-motion`.
- Verify all labels read from `cards.*` keys (no hardcoded strings).

**Blockers.**
- *Soft dependency on Step 9 (i18n keys).* → Resolution: land `cards.*` keys before/with this step.

**Risks (mitigated).**
- *Descending sort placing `None`/`-1` ATK first* → Mitigation: `sort=atk` + client `.reverse()` pushes them last (matches UX); label "high → low" (KD-3).
- *Deep `pg` → one large cold-load request* → Mitigation: accepted trade-off (KD-4); single request is far simpler than replaying N pages and YGOPRODeck honours arbitrary `num`.

**Effort.** Large.

#### Verification

**Level: Panel (2 judges) — critical.** This step lands the bulk of the user-facing acceptance criteria (AC-5/6/7/8/9/14/15/17 + NFRs); one judge audits the grid/header/states, the other the sort/density/load-more/a11y. **Threshold: 4.5 / 5** (both judges must average ≥ 4.5).

**Judge A — Results grid, header & states** (anchors AC-5, AC-8, AC-14, AC-15, NFR perf)

| # | Criterion | Weight |
|---|---|---|
| A1 | Results render `CardYugi :componentCard="card"` tiles, each wrapped with the SEO anchor `<a :href="/${locale}/card/${card.id}" class="absolute inset-0 z-0 pointer-events-none" tabindex="-1">` (copied from `Search.vue` 123–128); the overlay add-to-pile / wishlist still works. **AC-5.** | 0.25 |
| A2 | Loading shows skeletons at a fixed `aspect-ratio: 59/86` and images use `loading="lazy"` so the grid does not shift (CLS-safe). **NFR perf.** | 0.15 |
| A3 | A query/filter returning zero cards shows the zero-results empty state, the header reads count **0**, and adjusting filters recovers — with no phantom loads. **AC-14, AC-17.** | 0.20 |
| A4 | The results header shows `totalRows` (API `meta.total_rows`, else loaded-so-far count) plus the active-filter summary via the composable's `activeChips` (each removable); clearing a chip updates both header and results. **AC-8.** | 0.25 |
| A5 | An API failure leaves the page usable (renders an empty list, no crash) and changing the query/filters retries. **AC-15.** | 0.15 |

**Judge B — Sort, density, load-more & a11y** (anchors KD-3, KD-4, AC-6, AC-9, AC-7, AC-17, NFR a11y/i18n)

| # | Criterion | Weight |
|---|---|---|
| B1 | The sort control exposes Name (A→Z, default), Level/Rank, ATK (high→low), DEF (high→low), Newest; selecting one calls `setSort`, re-orders so each adjacent pair satisfies the ordering, and writes `so` to the URL (descending labeled "high → low"). **AC-6.** | 0.25 |
| B2 | The density toggle exposes "comfortable" (`grid`, default) and "compact"; toggling calls `setDensity`, changes tile size / column count, writes `vw` to the URL, and does **not** refetch. **AC-9.** | 0.20 |
| B3 | "Load more" calls `loadMore()` (appends the next 40 via `num`/`offset`), is **hidden when `cards.length >= totalRows`**, and a cold load with `pg=N` restores via a **single** `num=N*40, offset=0` request with no duplicate/phantom loads. **AC-7, AC-17.** | 0.30 |
| B4 | Sort control, density toggle, and Load-more are keyboard-operable with visible focus; the mobile dialog is focus-trapped and dismissible; `prefers-reduced-motion` is respected for non-essential motion. **NFR a11y.** | 0.15 |
| B5 | All labels read from `cards.*` i18n keys (no hardcoded strings). **AC-12.** | 0.10 |

---

#### Step 5 — Router route + navigation wiring

> **Wave 3.** **Depends on:** S4a (lazy-import target `CardsPage.vue` must exist). **Parallel with:** S4b (disjoint files — S5 edits `router/index.js` + `App.vue` nav wiring; S4b edits `CardsPage.vue`). **Agent:** general-purpose (model: sonnet). *Note: S5 edits `App.vue` (changePage/mobileTabs only); S6 also edits `App.vue` but runs in the next wave, so no same-wave file conflict.*

**Goal.** Register the `/cards` route (locale-prefixed + bare redirect) and point the nav at it (anchors AC-1, AC-3 nav-tabs).

**Expected Output.**
- `frontend/src/router/index.js` — child route + bare redirect.
- `frontend/src/views/App.vue` — `changePage` map entry + mobile tab target (partial; the navbar-input/strip work is Step 6).

**Success Criteria.**
- `localeChildren` (line 8) gains `{ path:'cards', name:'cards', component: () => import('@/components/Pages/CardsPage.vue') }`.
- A bare redirect `{ path:'/cards', redirect: () => \`/${detectLocale()}/cards\` }` is added to the legacy-redirect block (lines 25–32); navigating to `/cards` lands on `/{detectedLocale}/cards`, and an unsupported locale falls through the existing `/:locale` `beforeEnter` to the detected locale — satisfies **AC-1**.
- `App.vue` `changePage` `pathMap` (line 654) gains `cards: \`/${lc}/cards\``; the desktop/mobile "Search" tab (`mobileTabs` line 508, key `search`) routes to the cards page; the logo still calls `changePage('search')` → home `/` — satisfies **AC-3** (nav tabs) and keeps the logo→home rule.

**Subtasks.**
- Add the `cards` child to `localeChildren`.
- Add the bare `/cards` redirect using `detectLocale()`.
- Add `cards` to `App.vue`'s `changePage` pathMap.
- Point the "Search" mobile tab (and any desktop browse affordance) at `cards` (decide: rename label to "Browse"/keep "Search" — use the i18n key from Step 9).
- Verify `/cards`, `/en/cards`, `/fr/cards` all resolve; `/zz/cards` → detected locale.
- Confirm lazy import path matches the file created in S4a.

**Blockers.**
- *Lazy import target must exist.* → Resolution: sequence after S4a creates `CardsPage.vue`.

**Risks (mitigated).**
- *Mobile tab key/label confusion (`search` now points to cards)* → Mitigation: keep the tab `key` stable but repoint its action; localize the label via Step 9.

**Effort.** Small.

#### Verification

**Level: Single — medium.** Mechanical route + nav-map wiring across two files; one judge over the `router/index.js` + `App.vue` (changePage/mobileTabs only) diff verifies resolution and the logo/tab rules. **Threshold: 4.0 / 5.**

| # | Criterion | Weight |
|---|---|---|
| 1 | `localeChildren` (≈ line 8) gains `{ path:'cards', name:'cards', component: () => import('@/components/Pages/CardsPage.vue') }` with a lazy-import path matching the file created in S4a. **AC-1.** | 0.30 |
| 2 | A bare redirect `{ path:'/cards', redirect: () => \`/${detectLocale()}/cards\` }` is added; `/cards` lands on `/{detectedLocale}/cards`, and an unsupported locale falls through the existing `/:locale` `beforeEnter` to the detected locale. **AC-1.** | 0.25 |
| 3 | `App.vue`'s `changePage` `pathMap` (≈ line 654) gains `cards: \`/${lc}/cards\``. **AC-3.** | 0.20 |
| 4 | The desktop/mobile "Search" tab (`mobileTabs`, key `search`) is repointed to the `cards` page (label localized via S9), while the logo still calls `changePage('search')` → home `/` (logo→home rule preserved). **AC-3.** | 0.25 |

---

#### Step 6 — `App.vue`: navbar → navigation-only; remove search state/writer; RouterView stub **[critical]**

> **Wave 4.** **Depends on:** S1 (composable now owns the search logic), S5 (`cards` route to `router.push` to), **and S4a + S4b** (single-writer safety window — the new writer must work before the old one is removed). **Parallel with:** none — **single-writer cutover; runs alone** (conflicts with S5 on `App.vue`; S7 must follow). **GATE:** do not start until search is verified working on `/cards`. **Agent:** general-purpose (model: opus).

**Goal.** Make the navbar a pure navigator and delete `App.vue`'s search state, watchers, `update()`/`_doSearch()`, and the `mounted()` hydration block, so there is exactly one writer of `cards` (anchors KD-2, KD-3; AC-3, AC-11). **Must land after Step 4** so search is never broken.

**Expected Output.**
- `frontend/src/views/App.vue` — navbar bound to a local `navQuery`; search data/watchers/methods/mounted-hydration removed; RouterView props reduced to a stub.

**Success Criteria.**
- The navbar `<input>` (lines 117–127) binds a new local `navQuery` ref; `@keyup.enter` calls `router.push({ name:'cards', query:{ q: navQuery } })`; `@focus` (`focusSearch`) compares against `'cards'` (not `'search'`).
- `App.vue` `data()` no longer contains `searchQuery`, `cards`, `activeFilters`, `_searchTimer`, `_searchSeq`, `_lastWrittenQuery` (lines 519–541); the `$route.query` and `activeFilters` watchers (lines 546–566) are removed; `update()` and `_doSearch()` (lines 569–633) are removed; the search-hydration block in `mounted()` (lines 691–697) is removed (theme + auth init remain).
- The RouterView (lines 247–261) no longer references the deleted state: `:search-cards` binds a constant empty stub (`{}`), `@update:filters` is a no-op (both to be dropped once Step 7 lands), and the page still mounts.
- After this step, search runs **only** through `CardsPage`'s composable — there is one and only one writer of the card list — satisfies **AC-11**; typing in the navbar while already on `/cards` hydrates+searches exactly once via the composable's echo guard — satisfies **AC-3**.

**Subtasks.**
- Add `const navQuery = ref('')` in the `<script setup>` block; bind it to the navbar input.
- Replace `@keyup.enter="update"` with a handler that `router.push({ name:'cards', query:{ q: navQuery.value } })` (omit empty `q`).
- Update `focusSearch` to compare against `'cards'`.
- Delete the search fields from `data()`.
- Delete both watchers and `update()`/`_doSearch()`.
- Delete the search-hydration lines from `mounted()` (keep theme + auth).
- Reduce RouterView bindings to a stub (`:search-cards="{}"`, no-op `@update:filters`).
- Smoke-test: navbar Enter from `/library` → `/en/cards?q=...` runs the query once; back/forward intact.

**Blockers.**
- *Removing the old writer before the new one works breaks search.* → Resolution: hard-sequence after S4a+S4b; smoke-test search on `/cards` before deleting `_doSearch`.

**Risks (mitigated).**
- *Double-fetch / echo loop when pushing `/cards?q=` while already there* → Mitigation: composable `_lastWrittenQuery` guard + `syncUrl` gated on `route.name==='cards'` (KD-9).
- *RouterView still forwarding deleted props to other pages* → Mitigation: stub `:search-cards="{}"`; other pages ignore extra attrs; clean up after Step 7.

**Effort.** Medium.

#### Verification

**Level: Panel (2 judges) — critical.** This is the single-writer cutover: removing App.vue's old writer must leave **exactly one** writer of the card list while keeping the navbar handoff intact. One judge audits the writer removal / single-writer invariant, the other the navbar→navigation-only conversion. **Threshold: 4.5 / 5** (both judges must average ≥ 4.5). **Gate:** this verification presumes S4a+S4b are merged and search is verified working on `/cards`.

**Judge A — Writer removal & single-writer invariant** (anchors KD-2, AC-11)

| # | Criterion | Weight |
|---|---|---|
| A1 | `App.vue` `data()` no longer contains any search fields: `searchQuery`, `cards`, `activeFilters`, `_searchTimer`, `_searchSeq`, `_lastWrittenQuery` (≈ lines 519–541). | 0.25 |
| A2 | The `$route.query` and `activeFilters` watchers (≈ 546–566), `update()` and `_doSearch()` (≈ 569–633), and the search-hydration block in `mounted()` (≈ 691–697) are removed — while theme + auth init in `mounted()` remain. | 0.30 |
| A3 | After this step there is **one and only one** writer of the card list (`CardsPage`'s `useCardSearch()`); `App.vue` no longer assigns or fetches `cards`. **AC-11.** | 0.25 |
| A4 | The RouterView (≈ 247–261) no longer references deleted state: `:search-cards` binds a constant empty stub (`{}`), `@update:filters` is a no-op, and the page still mounts (other pages ignore the extra attrs). | 0.20 |

**Judge B — Navbar → navigation-only** (anchors KD-2, KD-9, AC-3)

| # | Criterion | Weight |
|---|---|---|
| B1 | The navbar `<input>` (≈ 117–127) binds a new local `navQuery` ref (added as `const navQuery = ref('')` in `<script setup>`); it no longer binds the deleted `searchQuery`. | 0.25 |
| B2 | `@keyup.enter` calls `router.push({ name:'cards', query:{ q: navQuery.value } })`, omitting an empty `q`. **AC-3.** | 0.30 |
| B3 | `focusSearch` compares against `'cards'` (not `'search'`). | 0.15 |
| B4 | Typing in the navbar while already on `/cards` produces exactly one hydrate+search via the composable's echo guard — no double-fetch, no redirect loop. **AC-3, AC-11.** | 0.30 |

---

#### Step 7 — `Search.vue` → landing/discovery page

> **Wave 5.** **Depends on:** S6 (the RouterView stub must be in place; this step drops those stub bindings once `Search.vue` no longer declares the props). **Parallel with:** S8 (disjoint files — S7 edits `Search.vue` + drops the now-free `App.vue` stub bindings; S8 edits `vite.config.js` + `generate-sitemap.mjs`). **Agent:** general-purpose (model: opus).

**Goal.** Strip live search from the home page so `/` is landing/discovery only (anchors AC-2).

**Expected Output.**
- `frontend/src/components/Pages/Search.vue` — no filter panel, no results grid, no zero-results state; hero + trending + set browser + latest releases retained; a CTA links to `/cards`.

**Success Criteria.**
- `SearchFiltersPanel` import + usage (line 100), the results `<section v-if="hasSearchResults">` (lines 111–133), and the zero-results `<section>` (lines 103–108) are removed; `hasSearchResults` (line 20) and the `searchCards`/`filters` props + `update:filters` emit (lines 12–18) are removed.
- The hero `v-if` simplifies from `!login && !hasSearchResults(searchCards)` to `v-if="!login"` (line 39).
- `SearchTrending`, `SearchSetBrowser`, `SearchLatestReleases` and the hero/how-it-works remain and render — satisfies **AC-2** (home has the four discovery sections, no panel/grid).
- A CTA (button/link) routes to `/:locale/cards`.
- With `Search.vue` no longer declaring those props, the Step 6 RouterView stub bindings (`:search-cards`, `@update:filters`) can be dropped.

**Subtasks.**
- Remove the `SearchFiltersPanel` import and template usage.
- Remove the results section and zero-results section.
- Remove `hasSearchResults` and the `searchCards`/`filters`/`update:filters` props/emits.
- Simplify the hero `v-if` to `!login`.
- Add a CTA to `/cards` (localized via Step 9).
- Drop the now-dead RouterView stub bindings in `App.vue`.

**Blockers.** None (depends on S6's stub being in place first).

**Risks (mitigated).**
- *Hero visibility regressing after removing `hasSearchResults`* → Mitigation: hero condition becomes the simpler `!login`; verify logged-out home still shows hero.

**Effort.** Medium.

#### Verification

**Level: Single — medium.** A removal-focused change to one component (plus dropping the now-dead App.vue stub); one judge over the `Search.vue` diff verifies the home page is landing/discovery only with the discovery sections intact. **Threshold: 4.0 / 5.**

| # | Criterion | Weight |
|---|---|---|
| 1 | The `SearchFiltersPanel` import + usage (≈ line 100), the results `<section v-if="hasSearchResults">` (≈ 111–133), and the zero-results `<section>` (≈ 103–108) are removed — no filter panel and no live results grid remain. **AC-2.** | 0.30 |
| 2 | `hasSearchResults` (≈ line 20) and the `searchCards`/`filters` props + the `update:filters` emit (≈ 12–18) are removed. | 0.20 |
| 3 | The hero `v-if` is simplified from `!login && !hasSearchResults(searchCards)` to `v-if="!login"` (≈ line 39); a logged-out home still shows the hero. | 0.20 |
| 4 | `SearchTrending`, `SearchSetBrowser`, `SearchLatestReleases`, and the hero/how-it-works remain and render, and a CTA (button/link) routes to `/:locale/cards` (localized via S9). **AC-2.** | 0.20 |
| 5 | With `Search.vue` no longer declaring those props, the S6 RouterView stub bindings (`:search-cards`, `@update:filters`) are dropped in `App.vue`. | 0.10 |

---

### Phase C — Polish & SEO

#### Step 9 — i18n keys (`cards.*` + `meta.cards.*`) across en/fr/de/it

> Ordered before Step 8 and consumed by Step 4b. Listed in Polish for grouping; **add before/with Step 4b's label work.**

> **Wave 1.** **Depends on:** nothing (pure-additive JSON, zero code dependency). **Parallel with:** S1, S2, S3 (disjoint files — only the four locale JSONs). **Pulled forward** from Polish into Wave 1 so the `cards.*` / `meta.cards.*` keys exist well before S4b (Wave 3) and S8 (Wave 5) consume them. **Agent:** general-purpose (model: sonnet).

**Goal.** Add every new label so all four locales are complete and no raw key shows (anchors AC-12).

**Expected Output.**
- `frontend/src/locales/en.json`, `fr.json`, `de.json`, `it.json` — new `cards.*` block + `meta.cards.{title,desc}`.

**Success Criteria.**
- `en.json` gains a `cards` block: `title`, `sort.label` + `sort.{name,level,atk,def,new}` (with direction wording, e.g. ATK "high → low"), `density.{label,comfortable,compact}`, `loadMore`, `results.count` (pluralized, mirroring `search.cardsCount`), `results.noResults`, `filters.button` (+ badge), `emptyState` (neutral initial copy); plus `meta.cards.title` and `meta.cards.desc` (mirroring `meta.card.*` shape).
- The nav label key used by the repointed Search/Browse tab (Step 5) exists in all four locales.
- `fr.json`, `de.json`, `it.json` contain the **same key paths** with translated values (no missing keys, no English fallback visible) — satisfies **AC-12**.
- App.vue's existing `useHead` resolves `meta.cards.*` from `route.name === 'cards'` with no `missingWarn`.

**Subtasks.**
- Define the `cards.*` key tree in `en.json` under a new top-level `cards` block.
- Add `meta.cards.{title,desc}` to `en.json`'s `meta`.
- Translate the full tree into `fr.json`.
- Translate into `de.json`.
- Translate into `it.json`.
- Cross-check all four files have identical key paths (a quick key-diff); confirm no raw key renders on `/cards`.

**Blockers.** None.

**Risks (mitigated).**
- *Key drift across locales* → Mitigation: key-path diff across the four files as the final subtask.

**Effort.** Medium.

#### Verification

**Level: Per-Item (4 items — `en.json`, `fr.json`, `de.json`, `it.json`) — low.** Pure-additive JSON; the risk is per-locale key drift, so the rubric below is applied **once per locale file** (4 evaluations) to catch a missing/renamed path in a specific file that a single blended score would mask. **Threshold: 4.0 / 5** per item. (For `en.json`, criterion 4 reads as self-consistency against the spec'd `cards.*` tree, since `en` is the reference.)

**Per-item rubric (applied to each of en / fr / de / it)** — anchors AC-12

| # | Criterion | Weight |
|---|---|---|
| 1 | The `cards` block is complete: `title`, `sort.label` + `sort.{name,level,atk,def,new}` (with direction wording, e.g. ATK "high → low"), `density.{label,comfortable,compact}`, `loadMore`, `results.count` (pluralized, mirroring `search.cardsCount`), `results.noResults`, `filters.button` (+ badge), `emptyState` (neutral initial copy). | 0.40 |
| 2 | `meta.cards.title` and `meta.cards.desc` are present (mirroring the `meta.card.*` shape) so App.vue's `useHead` resolves them by `route.name === 'cards'` with no `missingWarn`. | 0.20 |
| 3 | The nav label key used by the repointed Search/Browse tab (S5) is present. | 0.15 |
| 4 | Key-path **parity vs `en.json`**: this file has the identical key paths with **translated** values — no missing key, no raw key, and no visible English fallback on `/cards`. **AC-12.** | 0.25 |

---

#### Step 8 — vite-ssg prerender + sitemap + meta registration

> **Wave 5.** **Depends on:** S5 (route name `cards` must exist), S9 (`meta.cards.*` keys must exist). **Parallel with:** S7 (disjoint files — S8 edits `vite.config.js` + `generate-sitemap.mjs`; S7 edits `Search.vue`). **Agent:** general-purpose (model: sonnet). *Note: deps S5+S9 are satisfied after Wave 3, so S8 could fold into Wave 4; it is held to Wave 5 to keep Wave 4 a clean single-writer cutover (S6 alone). Moving S8 to Wave 4 is a safe optional optimization since it shares no file with S6.*

**Goal.** Register `/cards` for static prerender, add it to the sitemap, and ensure per-locale meta (anchors AC-13).

**Expected Output.**
- `frontend/vite.config.js` — `includedRoutes` pushes `/${locale}/cards` ×4 (+ updated count comment).
- `frontend/scripts/generate-sitemap.mjs` — `STATIC_PAGES` gains `/cards`.

**Success Criteria.**
- `ssgOptions.includedRoutes` (vite.config line 45) pushes `/en/cards`, `/fr/cards`, `/de/cards`, `/it/cards`; the trailing count comment (line 71) updates `54 → 58`.
- `generate-sitemap.mjs` `STATIC_PAGES` (line 83) gains `{ path:'/cards', changefreq:'weekly', priority:0.9 }`; the XML comment + console counts auto-update (they derive from `STATIC_PAGES.length`).
- A production build emits a per-locale `/cards` HTML file; the sitemap includes the four `/cards` locale URLs with hreflang; the page source contains title + description + canonical meta following the existing `useHead` pattern — satisfies **AC-13** (prerender + sitemap + meta).

**Subtasks.**
- Add the `for (const locale of locales) included.push(\`/${locale}/cards\`)` block in `includedRoutes`.
- Update the route-count comment to 58.
- Add the `/cards` entry to `STATIC_PAGES`.
- Run `node scripts/generate-sitemap.mjs` and confirm the four `/cards` URLs appear.
- Run the production build and confirm `dist/.../cards/index.html` per locale.

**Blockers.**
- *Route name `cards` and `meta.cards.*` must exist.* → Resolution: depends on Step 5 (route) + Step 9 (meta keys).

**Risks (mitigated).**
- *Prerendering a page that fetches at build time* → Mitigation: KD-5 — no `onServerPrefetch`; the prerendered page is an empty shell; fetch is client-only in `onMounted`.

**Effort.** Small.

#### Verification

**Level: Single — medium.** Config-level registration across two build files with a verifiable build artifact; one judge over the `vite.config.js` + `generate-sitemap.mjs` diff (and the emitted `dist`/sitemap) confirms prerender + sitemap. **Threshold: 4.0 / 5.**

| # | Criterion | Weight |
|---|---|---|
| 1 | `ssgOptions.includedRoutes` (≈ vite.config line 45) pushes `/en/cards`, `/fr/cards`, `/de/cards`, `/it/cards` (e.g. via a `for (const locale of locales)` loop), and the trailing route-count comment (≈ line 71) updates `54 → 58`. **AC-13.** | 0.35 |
| 2 | `generate-sitemap.mjs` `STATIC_PAGES` (≈ line 83) gains `{ path:'/cards', changefreq:'weekly', priority:0.9 }`; the XML comment + console counts auto-update (they derive from `STATIC_PAGES.length`). **AC-13.** | 0.30 |
| 3 | A production build emits a per-locale `/cards` HTML file (`dist/.../cards/index.html` ×4) and the sitemap includes the four `/cards` locale URLs with hreflang; the page source carries title + description + canonical following the existing `useHead` pattern. **AC-13.** | 0.25 |
| 4 | No `onServerPrefetch` is added for this route — the prerendered page stays an empty shell and search fetch remains client-only. **KD-5.** | 0.10 |

---

#### Step 10 — SSG hydration verification (empty-first render parity) **[verification]**

> **Wave 6.** **Depends on:** ALL prior steps (final build + hydration + deep-link verification). **Parallel with:** none (runs alone, last). **Agent:** general-purpose (model: opus). *Optional `pr-review-toolkit:code-reviewer` pass may precede this over the full diff.*

**Goal.** Prove the prerendered `/cards` and the first client render are identical and the build/hydration are clean (anchors KD-5; AC-13 hydration-clean, NFR build integrity).

**Expected Output.**
- No new source file; a verified production build + a short verification note (in the PR / task notes).

**Success Criteria.**
- `npm run build` (vite-ssg) completes without error; `dist` contains per-locale `/cards/index.html`.
- Loading `/cards` in the browser produces **no hydration-mismatch warning** in the console; the empty grid + neutral state from the prerender matches the first client render (no flash, no layout shift).
- A deep link such as `/en/cards?q=dragon&so=atk&pg=2&vw=compact` restores query + filters + sort + page + density and the same result set — satisfies **AC-10**; loading `/en/cards` with no query fetches nothing — satisfies **AC-16**.
- Existing pages (Library, Trade Center, Decks, Account) and the `CardYugi` overlay are unchanged — NFR build integrity.

**Subtasks.**
- Run the production build; confirm the `/cards` HTML files exist.
- Serve the build; open `/cards`, check console for hydration warnings.
- Verify the prerendered shell == first client render (no count/cards in the static HTML).
- Test a full deep-link restore (`q`+filters+`so`+`pg`+`vw`) and a bare `/cards` (no fetch).
- Smoke-test back/forward and locale switch on `/cards` (state intact, re-localized).
- Regression-check the other pages + overlay still work.

**Blockers.** None (final step; depends on all prior).

**Risks (mitigated).**
- *Latent dynamic value sneaking into prerendered HTML* → Mitigation: this step is the explicit gate; if a warning appears, trace to an un-gated value and wrap it in `isMounted`.

**Effort.** Medium.

#### Verification

**Level: Single — medium.** A whole-system verification gate (build + hydration + deep-link), best judged as one holistic pass over the build output and observed runtime behavior rather than split judges. **Threshold: 4.0 / 5.**

| # | Criterion | Weight |
|---|---|---|
| 1 | `npm run build` (vite-ssg) completes without error and `dist` contains the per-locale `/cards/index.html`. **AC-13, NFR build integrity.** | 0.25 |
| 2 | Loading `/cards` in the browser produces **no hydration-mismatch warning** in the console; the empty grid + neutral state from the prerender matches the first client render (no flash, no layout shift). **AC-13, KD-5.** | 0.30 |
| 3 | A deep link such as `/en/cards?q=dragon&so=atk&pg=2&vw=compact` restores query + filters + sort + page + density and the same result set (back/forward + locale-switch keep state, re-localized); loading a bare `/en/cards` with no query fetches nothing. **AC-10, AC-16.** | 0.30 |
| 4 | Existing pages (Library, Trade Center, Decks, Account) and the `CardYugi` overlay are unchanged. **NFR build integrity.** | 0.15 |

---

## Implementation Summary

| Step | Wave | Output (primary files) | Effort | Critical? | Agent (model) |
|---|---|---|---|---|---|
| **S1** — Extract `useCardSearch` composable | 1 | `frontend/src/composables/useCardSearch.js` (new) | Large | ✅ | general-purpose (opus) |
| **S2** — `sort` param in `searchByFilters` | 1 | `frontend/src/api.js` | Small | ✅ | general-purpose (sonnet) |
| **S3** — `layout` prop on filter panel | 1 | `frontend/src/components/Pages/search/SearchFiltersPanel.vue` | Medium | ✅ | general-purpose (sonnet) |
| **S9** — i18n `cards.*` + `meta.cards.*` (×4 locales) | 1 | `frontend/src/locales/{en,fr,de,it}.json` | Medium | — | general-purpose (sonnet) |
| **S4a** — `CardsPage` shell + empty-first render | 2 | `frontend/src/components/Pages/CardsPage.vue` (new) | Large | ✅ | general-purpose (opus) |
| **S4b** — `CardsPage` results/header/sort/density/load-more | 3 | `frontend/src/components/Pages/CardsPage.vue` | Large | ✅ | general-purpose (opus) |
| **S5** — Router route + nav wiring | 3 | `frontend/src/router/index.js`, `frontend/src/views/App.vue` | Small | — | general-purpose (sonnet) |
| **S6** — App.vue navbar→nav-only; remove writer; RouterView stub | 4 | `frontend/src/views/App.vue` | Medium | ✅ | general-purpose (opus) |
| **S7** — `Search.vue` → landing/discovery | 5 | `frontend/src/components/Pages/Search.vue` | Medium | — | general-purpose (opus) |
| **S8** — vite-ssg + sitemap + meta | 5 | `frontend/vite.config.js`, `frontend/scripts/generate-sitemap.mjs` | Small | — | general-purpose (sonnet) |
| **S10** — SSG hydration verification | 6 | (build verification; no new file) | Medium | — | general-purpose (opus) |

**Wave schedule (parallel-optimized):**
`Wave 1 {S1, S2, S3, S9}` → `Wave 2 {S4a}` → `Wave 3 {S4b, S5}` → `Wave 4 {S6}` → `Wave 5 {S7, S8}` → `Wave 6 {S10}`.
Max parallel depth = **4** (Wave 1). Concurrent waves: 1 (×4), 3 (×2), 5 (×2). Run steps within a wave as parallel `general-purpose` sub-agents; finish a wave (and confirm the build) before the next.

**Serial fallback (valid if not parallelizing):** S1 → S2 → S3 → S4a → S4b → S5 → S6 → S7 → S9 → S8 → S10.
(S9 pulled into Wave 1 in the parallel schedule so its keys precede S4b labels and S8 meta.)

**Single-writer gate (CRITICAL):** Wave 4 (S6, removes `App.vue`'s old search writer) must not start until S4a + S4b are merged and search is verified working on `/cards`.

**Agent/model distribution:** `general-purpose` for all 11 steps. Models: **opus ×6** (S1, S4a, S4b, S6, S7, S10), **sonnet ×5** (S2, S3, S5, S8, S9), **haiku ×0**. Optional `pr-review-toolkit:code-reviewer` review pass before S10 (not counted).

---

## Verification Summary

Each implementation step carries a `#### Verification` rubric (LLM-as-Judge). Level is matched to criticality: **Panel (2 judges)** for the critical-path / single-writer steps, **Per-Item** for the per-locale i18n step, **Single** for the medium steps. Critical steps use a **4.5** threshold; the rest use **4.0**. Rubric criteria within every step (or every judge, for panels) are weighted to sum to **1.0**.

| Step | Title | Criticality | Verification level | Evaluations | Threshold |
|---|---|---|---|---|---|
| **S1** | Extract `useCardSearch` composable | HIGH / critical | **Panel (2 judges)** | 2 | **4.5** |
| **S2** | `sort` param in `searchByFilters` (api.js) | Medium | **Single** | 1 | 4.0 |
| **S3** | `layout` prop on `SearchFiltersPanel` | Medium | **Single** | 1 | 4.0 |
| **S4a** | `CardsPage` shell + empty-first render | HIGH / critical | **Panel (2 judges)** | 2 | **4.5** |
| **S4b** | `CardsPage` results / sort / density / load-more | HIGH / critical | **Panel (2 judges)** | 2 | **4.5** |
| **S5** | Router `/cards` route + nav wiring | Medium | **Single** | 1 | 4.0 |
| **S6** | Remove App.vue's old search writer (single-writer cutover) | HIGH / critical | **Panel (2 judges)** | 2 | **4.5** |
| **S7** | `Search.vue` → landing/discovery page | Medium | **Single** | 1 | 4.0 |
| **S8** | vite-ssg `includedRoutes` + sitemap + meta | Medium | **Single** | 1 | 4.0 |
| **S9** | i18n `cards.*` / `meta.cards.*` ×4 locales | Low | **Per-Item (en, fr, de, it)** | 4 | 4.0 |
| **S10** | SSG hydration + deep-link verification | Medium | **Single** | 1 | 4.0 |

**Totals:** 11 steps with a Verification section · **18 evaluations** defined · breakdown: **Panel ×4** (S1, S4a, S4b, S6 → 8 judge-evaluations) · **Per-Item ×1** (S9 → 4 item-evaluations) · **Single ×6** (S2, S3, S5, S7, S8, S10) · **None ×0**.

---

## Definition of Done

Derived from the 17 acceptance criteria; each maps to its owning step(s).

- [ ] **AC-1** Dedicated `/cards` route renders; bare `/cards` → `/{detectedLocale}/cards`; unsupported locale falls back. → **S5** (route/redirect) + **S4a** (render).
- [ ] **AC-2** Home is landing/discovery only (no panel, no results grid; hero/trending/set-browser/latest-releases present). → **S7**.
- [ ] **AC-3** Global navbar search routes to `/:locale/cards?q=…` and the page applies+runs it; nav "Search" tab points to `/cards`; logo → `/`. → **S6** (navbar) + **S5** (tab).
- [ ] **AC-4** Filter sidebar on desktop / drawer (dialog) on mobile with all existing dimensions; filtering narrows results identically. → **S3** (`layout` prop) + **S4a** (sidebar/dialog wiring).
- [ ] **AC-5** Results render as `CardYugi` tiles with loading skeletons (59:86) and zero-results state; overlay add-to-pile/wishlist works. → **S4b**.
- [ ] **AC-6** Sort control (Name/Level/ATK/DEF/Newest) re-orders results and writes `so` to the URL. → **S2** (API) + **S4b** (UI).
- [ ] **AC-7** Browse beyond 40 via `num`/`offset`; current page reflected in URL (`pg`) and restorable on reload. → **S1** (load-more logic) + **S4b** (control).
- [ ] **AC-8** Results header shows count (API total else loaded) + active-filter summary; clearing a filter updates it. → **S4b** (+ `activeChips` from **S1/S3**).
- [ ] **AC-9** Density toggle (comfortable/compact) changes grid, writes `vw`, persists on reload. → **S4b** (+ `setDensity`/URL in **S1**).
- [ ] **AC-10** Full URL state (query+filters+sort+page+density) shareable/restorable; back/forward + locale switch keep state with no echo/redirect loop. → **S1** (serialize/echo guard) + **S10** (verify).
- [ ] **AC-11** Single async writer — stale responses never overwrite newer results. → **S1** (seq guard) + **S6** (old writer removed).
- [ ] **AC-12** All new UI localized in en/fr/de/it; no raw key visible. → **S9**.
- [ ] **AC-13** `/cards` prerendered per locale, in the sitemap, with title+description+canonical meta; hydrates with no mismatch; search stays client-only. → **S8** + **S4a** (meta/empty-first) + **S10** (verify).
- [ ] **AC-14** Zero-results shows empty state, header count 0, recoverable by adjusting filters. → **S4b**.
- [ ] **AC-15** API failure keeps page usable (empty list, no crash); changing query/filters retries. → **S1** (catch) + **S4b** (state).
- [ ] **AC-16** Empty initial `/cards` (no query/filters) shows neutral state and fetches nothing. → **S4a** (`init` gate).
- [ ] **AC-17** End of results disables "next"/stops fetching, no duplicate/phantom loads. → **S4b** (+ `hasMore`/seq guard in **S1**).
- [ ] **NFR — Performance:** 300 ms debounce preserved; `loading="lazy"` images; 59:86 skeletons (CLS-safe). → **S1** + **S4b**.
- [ ] **NFR — Accessibility (WCAG AA):** sidebar/drawer, sort, density, load-more keyboard-operable with visible focus; mobile dialog focus-trapped + dismissible; `prefers-reduced-motion` respected. → **S3** + **S4a** + **S4b**.
- [ ] **NFR — Design fidelity:** dark-first tokens; amethyst selection/primary, hot-pink wishlist, lime mutual-only; no pure grays; no `transition: all`. → **S3** + **S4a** + **S4b**.
- [ ] **NFR — Build integrity:** vite-ssg build + SPA hydration both succeed; Library/Trade/Decks/Account + `CardYugi` overlay unchanged. → **S8** + **S10**.
- [ ] i18n keys added for en/fr/de/it; production build prerenders `/cards`; sitemap updated; hydration clean; code reviewed. → **S8** + **S9** + **S10**.
