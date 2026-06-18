# Skill: Dedicated Card Search Page (/cards)

**Feature:** Cardcluster-style full-page card browser at `/cards` — left filter sidebar + results grid, sort, pagination, results header, density toggle. Search moves off the home page.

**Stack:** Vue 3 (`<script setup>`), Vuetify 3, Tailwind v4, vite-ssg, vue-i18n, YGOPRODeck API.

---

## 1. Sidebar Layout — CSS Grid + Mobile Dialog

### Desktop: CSS Grid (SSR-safe, no JS required)

Use a CSS grid on the page wrapper. No Vuetify layout components — pure CSS grid works during SSG without hydration risk.

```html
<!-- CardsPage.vue template skeleton -->
<div class="cards-layout">
  <aside class="cards-sidebar" aria-label="Filters">
    <!-- SearchFiltersPanel (restyled, always expanded on desktop) -->
    <SearchFiltersPanel :filters="filters" @update:filters="onFiltersUpdate" />
  </aside>
  <main class="cards-main">
    <!-- sort bar + results header + grid -->
  </main>
</div>
```

```css
.cards-layout {
  display: grid;
  grid-template-columns: 272px 1fr;
  gap: 24px;
  align-items: start;
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 16px;
}

/* Sticky sidebar — navbar is ~56px on mobile, ~64px on desktop */
.cards-sidebar {
  position: sticky;
  top: 72px;
  max-height: calc(100vh - 88px);
  overflow-y: auto;
  scrollbar-width: thin;
}

/* Mobile: collapse sidebar, show via drawer trigger */
@media (max-width: 960px) {
  .cards-layout {
    grid-template-columns: 1fr;
  }
  .cards-sidebar {
    display: none;
  }
}
```

### Mobile: `v-dialog` (NOT `v-navigation-drawer`)

`v-navigation-drawer` is problematic in SSG (temporary drawer state causes hydration mismatch). Use a `v-dialog` instead — it teleports to body and is client-only by nature.

```html
<!-- Mobile filter trigger (only rendered client-side) -->
<v-btn
  v-if="isMounted"
  class="d-flex d-md-none mb-4"
  variant="outlined"
  @click="filterDialogOpen = true"
>
  Filters <span v-if="activeCount">({{ activeCount }})</span>
</v-btn>

<v-dialog v-model="filterDialogOpen" fullscreen>
  <v-card>
    <v-toolbar>
      <v-toolbar-title>Filters</v-toolbar-title>
      <v-btn icon @click="filterDialogOpen = false">
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </v-toolbar>
    <v-card-text>
      <SearchFiltersPanel :filters="filters" @update:filters="onFiltersUpdate" />
    </v-card-text>
  </v-card>
</v-dialog>
```

```js
// SSG guard: only render mobile dialog after hydration
const isMounted = ref(false)
onMounted(() => { isMounted.value = true })
```

### Why not Vuetify drawer?

The `v-navigation-drawer` with `rail` / `temporary` props reads `window.innerWidth` on mount and can produce HTML mismatches between SSG output and client hydration. A `v-dialog` avoids this entirely since it only renders after `v-model` becomes true (always client-side).

---

## 2. Pagination vs Infinite Scroll

### Recommended: "Load More" hybrid (not numbered pagination, not pure infinite scroll)

- Start with page 1 (40 cards).
- A "Load more" button at the bottom appends the next page to the existing list.
- URL param `pg` tracks current page count (how many pages loaded), defaulting to 1 (omit from URL).
- Back button restores `pg=N` from URL — re-fetch all pages up to N (or just the first, showing a "Show X more" button).

This fits the card-browsing UX better than numbered pagination and avoids the IntersectionObserver complexity for SSG.

### IntersectionObserver sentinel (if infinite scroll is preferred)

```js
const sentinel = ref(null)
let observer = null

onMounted(() => {
  if (!sentinel.value) return
  observer = new IntersectionObserver(
    ([entry]) => { if (entry.isIntersecting && !loading.value && hasMore.value) loadMore() },
    { rootMargin: '200px' }
  )
  observer.observe(sentinel.value)
})

onUnmounted(() => observer?.disconnect())
```

```html
<div ref="sentinel" aria-hidden="true" style="height: 1px" />
```

**URL sync with infinite scroll:** Update `?offset=N` via `router.replace` after each page load (without `pushState` — use `replace` to avoid polluting history). On mount, read `offset` from URL to restore position (re-fetch all cards up to that offset, or just fetch page 1 and show "Show more" button).

### YGOPRODeck pagination (CONFIRMED from live API probes)

```
GET cardinfo.php?type=Effect+Monster&num=40&offset=0&sort=name
```

Response includes:
```json
{
  "data": [...],
  "meta": {
    "total_rows": 5067,
    "total_pages": 127,
    "rows_remaining": 5027,
    "current_rows": 40,
    "next_page_offset": 40,
    "next_page": "https://db.ygoprodeck.com/api/v7/cardinfo.php?...&num=40&offset=40&sort=name"
  }
}
```

**Critical:** `num` alone (without `offset`) returns `{"error": "..."}`. Always send both together. The existing `searchByFilters` in `api.js` already enforces this — `offset` defaults to 0.

Use `meta.total_rows` for the results header count ("5,067 cards").

---

## 3. YGOPRODeck API — Sort Param (CONFIRMED)

Live probes against `cardinfo.php` confirm these `sort=` values work:

| Value | Behavior |
|---|---|
| `name` | Alphabetical A→Z |
| `atk` | ATK ascending (lowest first; None/-1 before numeric values) |
| `def` | DEF ascending (same ordering as atk) |
| `level` | Level ascending (1→12; None first) |
| `new` | Most recently released first |

**No descending sort via API.** For "highest ATK first" UX, sort `atk` server-side then reverse the array client-side — cheap since results are already paged.

**Extend `searchByFilters` in `api.js`:**

```js
export const searchByFilters = ({
  fname, type, attribute, level, race, link, scale, linkmarker,
  num = 40, offset = 0,
  sort = null   // NEW
} = {}) => {
  const p = new URLSearchParams();
  // ... existing params ...
  if (sort) p.set('sort', sort);
  // num+offset always together (API errors if num without offset)
  if (num != null) { p.set('num', num); p.set('offset', offset); }
  return axios.get(`${API_URL}cardinfo.php?${p.toString()}`)
    .catch(() => ({ data: { data: [] } }));
};
```

**URL key:** `s` → sort value. Default (`name`) omitted from URL.

---

## 4. Current Search Architecture — What to Extract, What to Keep

### Extract to `src/composables/useCardSearch.js`

All module-level functions in `App.vue` are already pure (no component deps) and export-ready:

```js
// src/composables/useCardSearch.js
export { deriveSearch }        // already exported from App.vue — move here
export { serialize }
export { deserialize }
export { defaultFilters }
export { isFiltersDefault }
export { resolveTypeRace }
export { cmpValue }
export const PENDULUM_TYPES = '...'
export const LINK_ARROW_MARKERS = { tl: 'Top-Left', ... }
```

Keep the **composable function** (reactive search state + fetch) inside `CardsPage.vue` — not globally shared, because only one page uses it at a time.

```js
// Inside CardsPage.vue <script setup>
const searchQuery = ref(route.query.q ?? '')
const activeFilters = ref(deserialize(route.query).activeFilters)
const cards = ref([])
const totalRows = ref(0)
const loading = ref(false)
const _searchSeq = ref(0)
const _lastWrittenQuery = ref(null)
```

### What stays in `App.vue`

- Navbar search `<input>` — still global, but on submit: `router.push({ name: 'cards', query: { q: inputValue } })`
- Auth state, theme toggle, locale switching — unchanged
- Remove: `activeFilters`, `searchQuery` data, `_doSearch`, `activeFilters` watcher, `$route.query` watcher

### Home page (`Search.vue`) after the move

- Remove: `<SearchFiltersPanel>`, `searchCards` prop, results section, `update:filters` emit
- Keep: hero section (v-if="!login"), `<SearchTrending>`, `<SearchSetBrowser>`, `<SearchLatestReleases>`
- The prop `searchCards` and emit `@update:filters` become dead code and should be removed

### Prior art: `SetPage.vue` page structure

SetPage uses Options API `data()`, a `loading` ref, an error ref, and `onServerPrefetch`. CardsPage.vue uses `<script setup>` + Composition API. The pattern is:

```js
// SetPage pattern (Options API, has onServerPrefetch for SSG data)
// CardsPage: NO onServerPrefetch needed — results are always dynamic
// Just useHead() for static meta + onMounted() guard for search
```

---

## 5. vite-ssg: Prerender + Sitemap

### Add `/cards` to prerendered routes

In `frontend/vite.config.js`, `ssgOptions.includedRoutes`:

```js
// Add after homepages:
const locales = ['en', 'fr', 'de', 'it']
for (const locale of locales) {
  included.push(`/${locale}/cards`)
}
```

This prerendering renders only the shell (H1, meta, sidebar layout, empty results state). The actual card data is always fetched client-side.

### Add to sitemap

In `frontend/scripts/generate-sitemap.mjs`, add to `STATIC_PAGES`:

```js
const STATIC_PAGES = [
  { path: "/",        changefreq: "daily",  priority: 1.0 },
  { path: "/cards",   changefreq: "weekly", priority: 0.9 },  // ADD
  { path: "/privacy", changefreq: "yearly", priority: 0.3 },
];
```

The `urlEntry()` helper already handles all 4 locales + hreflang alternates automatically.

### Client-only search guard pattern

```js
// <script setup> in CardsPage.vue
onMounted(() => {
  // typeof document check is implicit — onMounted never runs in SSG context
  // This is the established pattern from App.vue mounted() and SetPage.vue
  const { searchQuery: q, activeFilters: f } = deserialize(route.query)
  searchQuery.value = q
  activeFilters.value = f
  if (q || !isFiltersDefault(f)) doSearch()
})
```

### useHead for CardsPage

```js
useHead(computed(() => ({
  title: t('meta.cards.title'),
  meta: [
    { name: 'description', content: t('meta.cards.desc') },
    { property: 'og:title', content: t('meta.cards.title') },
    // ... standard og/twitter tags
  ],
  link: [
    { rel: 'canonical', href: `https://0nefor.one${route.path}` },
    // hreflang for all 4 locales (same pattern as App.vue)
  ],
})))
```

---

## 6. Pitfalls and Guards

### Pitfall 1: `num` without `offset` errors

**Problem:** `GET cardinfo.php?fname=dark&num=40` returns `{"error": "..."}`.
**Fix:** Always pass both. `searchByFilters` in api.js already enforces `offset = 0` as default.
**For pagination:** Pass the correct `offset = (page - 1) * pageSize`.

### Pitfall 2: Watcher echo loop

**Problem:** The `route.query` watcher fires when we write to the URL via `router.replace`, triggering another search.
**Fix:** Use the `_lastWrittenQuery` echo guard pattern already established in App.vue:

```js
watch(() => route.query, (newQ) => {
  if (
    _lastWrittenQuery.value &&
    JSON.stringify(newQ) === JSON.stringify(_lastWrittenQuery.value)
  ) {
    _lastWrittenQuery.value = null
    return // Skip: this is our own router.replace echoing back
  }
  const { searchQuery: q, activeFilters: f } = deserialize(newQ)
  searchQuery.value = q
  activeFilters.value = f
  doSearch()
}, { deep: true })
```

### Pitfall 3: SSR `typeof document` guards

The sidebar mobile-dialog trigger uses `isMounted` to avoid rendering Vuetify `v-dialog` during SSG. SSG runs in Node; any code touching `document`, `window`, or `localStorage` must be guarded.

```js
const isMounted = ref(false)
onMounted(() => { isMounted.value = true })
```

Do not call `localStorage` or `IntersectionObserver` outside `onMounted`.

### Pitfall 4: Single async writer — stale response guard

Multiple searches can be in-flight simultaneously (user types fast, filters change). Use a sequence counter:

```js
const _searchSeq = ref(0)

async function doSearch() {
  const seq = ++_searchSeq.value  // capture BEFORE first await
  loading.value = true

  try {
    const { serverParams, clientPredicates } = deriveSearch({
      searchQuery: searchQuery.value,
      activeFilters: activeFilters.value,
    })
    // Add sort + pagination to serverParams:
    serverParams.sort = sortKey.value === 'name' ? undefined : sortKey.value
    serverParams.num = PAGE_SIZE
    serverParams.offset = (currentPage.value - 1) * PAGE_SIZE

    const res = await searchByFilters(serverParams)
    if (seq !== _searchSeq.value) return  // stale — a newer request won

    let results = res.data?.data ?? []
    totalRows.value = res.data?.meta?.total_rows ?? results.length

    if (clientPredicates.length) {
      results = results.filter(card => clientPredicates.every(p => p(card)))
    }
    cards.value = results
  } catch (err) {
    if (seq !== _searchSeq.value) return
    console.error('Search failed', err)
    cards.value = []
  } finally {
    if (seq === _searchSeq.value) loading.value = false
  }
}
```

### Pitfall 5: Filter logic duplication

Do NOT copy `deriveSearch`, `serialize`, `deserialize` from App.vue into CardsPage.vue. Extract them to `src/composables/useCardSearch.js` first. Both the navbar (App.vue) and CardsPage.vue import from there. `deriveSearch` is already exported from App.vue — moving it is non-breaking for the existing import.

### Pitfall 6: sort=atk behavior (None/-1 first)

When `sort=atk` is used, cards with no ATK (Divine-Beast tokens, ?-ATK monsters) appear first with value `None` or `-1`. If "highest ATK" is the desired UX, fetch `sort=atk` then `.reverse()` the results array before rendering. Document this in the sort control labels.

### Pitfall 7: Hydration mismatch with dynamic result count in H1/H2

If the results count appears in prerendered HTML (e.g. `<h2>5067 cards</h2>`), SSG outputs 0 and client hydrates with actual count — Vuex mismatch. Use `v-if="isMounted"` on the count display or render an empty placeholder:

```html
<span v-if="isMounted">{{ totalRows.toLocaleString() }} cards</span>
<span v-else aria-hidden="true"> </span>
```

---

## 7. Router + URL Schema Extension

### New route

Add to `localeChildren` in `frontend/src/router/index.js`:

```js
{
  path: 'cards',
  name: 'cards',
  component: () => import(/* webpackChunkName: "cards" */ '@/components/Pages/CardsPage.vue')
}
```

Also add legacy redirect:
```js
{ path: '/cards', redirect: () => `/${detectLocale()}/cards` }
```

### Extended URL query schema

Existing short keys: `q,k,t,a,lv,lvc,ps,psc,r,lr,lrc,la`

New keys for CardsPage:
| Key | Meaning | Default (omit from URL) |
|---|---|---|
| `s` | sort value (name/atk/def/level/new) | `name` |
| `pg` | page number (1-based) | `1` |
| `vw` | view density (grid/compact) | `grid` |

Update `serialize()` and `deserialize()` in the extracted composable to handle these.

---

## 8. i18n Keys Required

Add to all four locale files (`en.json`, `fr.json`, `de.json`, `it.json`):

```json
{
  "cards": {
    "title": "Card Search",
    "resultsHeader": "{total} cards",
    "noResults": "No cards match your filters.",
    "loading": "Searching…",
    "sort": {
      "label": "Sort by",
      "name": "Name (A–Z)",
      "atk": "ATK (low → high)",
      "def": "DEF (low → high)",
      "level": "Level (low → high)",
      "new": "Newest"
    },
    "density": {
      "grid": "Grid",
      "compact": "Compact"
    },
    "loadMore": "Load more cards",
    "filtersButton": "Filters",
    "filtersDrawerTitle": "Filters"
  },
  "meta": {
    "cards": {
      "title": "Yu-Gi-Oh! Card Search — TradeMarket",
      "desc": "Browse and filter every Yu-Gi-Oh! card by type, attribute, level, race, and more. Find cards to trade on TradeMarket."
    }
  }
}
```

---

## 9. Implementation Checklist

In recommended wave order:

**Wave 1 — Extraction (no visible change)**
- [ ] Create `src/composables/useCardSearch.js` — move all pure functions from App.vue
- [ ] Add `sort` param to `searchByFilters` in `api.js`
- [ ] Add i18n keys to all 4 locales

**Wave 2 — New Page**
- [ ] Create `CardsPage.vue` with CSS grid layout, desktop sidebar, mobile filter dialog
- [ ] Wire `useCardSearch` composable, `useHead`, URL sync
- [ ] Sort control (select + 5 options), results header (total_rows from meta), density toggle
- [ ] Pagination: "Load more" appends; `pg` in URL

**Wave 3 — Router + SSG**
- [ ] Add `cards` route to `router/index.js` + legacy redirect
- [ ] Add `/*/cards` to `vite.config.js` ssgOptions.includedRoutes
- [ ] Add `/cards` to `STATIC_PAGES` in `generate-sitemap.mjs`

**Wave 4 — Nav + Home cleanup**
- [ ] Navbar: route to `/cards?q=...` on search submit
- [ ] Navbar `changePage` map: add `{ cards: '/${lc}/cards' }`
- [ ] Mobile tabs: rename `search` key to `cards`, update action
- [ ] `Search.vue`: remove `<SearchFiltersPanel>`, results section, dead props/emits
- [ ] `App.vue`: remove `activeFilters`, `searchQuery` data, `_doSearch`, watchers

**Wave 5 — Verification**
- [ ] `vite build` succeeds (no SSR errors from `document`/`window` in new code)
- [ ] `/en/cards` prerendered HTML contains H1 + sidebar layout but no card data
- [ ] `/en/cards?q=dark+magician` hydrates correctly client-side
- [ ] Sort param changes trigger new fetch, URL updates
- [ ] "Load more" appends to list, URL updates `pg`
- [ ] Mobile filter dialog opens, filter changes apply and close dialog
- [ ] Sitemap includes `/en/cards`, `/fr/cards`, `/de/cards`, `/it/cards`

---

## 10. Cardcluster Reference — Observation

`https://cardcluster.com/cards` and `https://cardcluster.com/docs/card-search` were fetched during research. Both return empty HTML (confirmed client-rendered SPA). Reference behavior is inferred from the task file's confirmed decisions: left filter sidebar, results grid, sort, pagination, density toggle. No pixel-level specifics available.
