# Codebase Impact Analysis: Dedicated Pages for Card Sets

**Feature:** `/set/:setCode` dedicated pages (extensions)
**Date:** 2026-06-07
**Task file:** `.specs/tasks/draft/set-dedicated-pages.feature.md`

---

## 1. Existing Infrastructure (No Changes Needed)

### API (api.js)
Both required API functions already exist:
- `getCardSets()` — fetches all sets metadata (`cardsets.php`): set_name, set_code, tcg_date, num_of_cards
- `getCardsBySet(setName, locale)` — fetches all cards in a set (`cardinfo.php?cardset=<setName>`)

No new API functions are required.

### Data available on CardPage
`card.card_sets` already provides: `set_code`, `set_name`, `set_rarity` per printing. The link from CardPage to SetPage can be built directly from these fields.

---

## 2. Files to CREATE

### 2.1 `frontend/src/components/Pages/SetPage.vue`
New component following the exact CardPage SSG pattern:
- `setup()` with `ssrSetData` ref, `setCards` ref (cards array), `loading` ref
- `onServerPrefetch` calls `getCardsBySet(setName, 'en')` — `setName` from `route.query.name`; throws on failure (vite-ssg skips the route silently)
- `useHead(computed(...))` with title, description, og:*, canonical, hreflang (English-only), Schema.org ItemList + BreadcrumbList
- `mounted()` → `load()` for client hydration
- `watch: setCode` re-triggers `load()` on navigation
- Template: back link, loading skeleton, error state, set header (name + code + card count), card grid with router-links to `/en/card/:id`

### 2.2 `frontend/src/data/set-codes.js`
New data file mirroring `card-ids.js`. Hardcodes top ~30 set codes for SSG pre-render. Stores both `code` and `name` because the API call requires the set name, not the code:
```js
export const TOP_SET_CODES = [
  { code: 'LOB', name: 'Legend of Blue Eyes White Dragon' },
  // ...
]
```

---

## 3. Files to MODIFY

### 3.1 `frontend/src/router/index.js`
1. Add to `localeChildren` array: `{ path: "set/:setCode", name: "set", component: () => import("@/components/Pages/SetPage.vue") }`
2. Add legacy redirect: `{ path: "/set/:setCode", redirect: (to) => \`/\${detectLocale()}/set/\${to.params.setCode}\` }`

### 3.2 `frontend/vite.config.js`
1. Import `TOP_SET_CODES` from `./src/data/set-codes.js`
2. Add set routes loop in `includedRoutes`: push `/en/set/${code}` for each entry
3. Update path count comment

**SSG risk note:** Each set route triggers `onServerPrefetch` → `getCardsBySet()` API call. With 30 sets = 30 concurrent calls to YGOProdeck during build. Start with 10-15 sets.

### 3.3 `frontend/scripts/generate-sitemap.mjs`
1. Import `TOP_SET_CODES` from `../src/data/set-codes.js`
2. Add set URL entries (reuse `cardUrlEntry` pattern, English-only, `changefreq: "monthly"`, `priority: 0.5`)
3. Update XML comment to include set count

### 3.4 `frontend/scripts/verify-ssg-output.mjs`
1. Add set routes to `ROUTES` array with type `'set'`
2. Add checks for set type: title, meta description, canonical, og:url, og:image, hreflang, json-ld

### 3.5 `frontend/src/views/App.vue`
At line 44, add `isSetPage` alongside `isCardPage`:
```js
const isSetPage = /^\/[a-z]{2}\/set\//.test(path);
```
Update hreflang conditional: `if (!isCardPage && !isSetPage)` to treat set pages as English-only (same reason as card pages — YGOProdeck data is English-primary).

### 3.6 `frontend/src/locales/en.json`
Add under `"setPage"`:
```json
"setPage": {
  "backToSearch": "Back to search",
  "setNotFound": "Set not found",
  "searchOther": "Search for another set",
  "cardsInSet": "{count} cards in this set",
  "setCode": "Set code",
  "viewCard": "View card"
}
```
Add under `"meta"`:
```json
"set": {
  "title": "Yu-Gi-Oh! Card Set — One for One",
  "desc": "Browse all cards in this Yu-Gi-Oh! set and find traders on One for One."
}
```

### 3.7–3.9 `frontend/src/locales/fr.json`, `de.json`, `it.json`
Same keys as en.json, translated. The `meta.set.*` keys are used by App.vue's fallback head (before SetPage.vue's `useHead` takes over).

### 3.10 `frontend/src/components/Pages/CardPage.vue`
**Printings section line 123** — change set_name `<span>` to `<router-link>`:
```html
<router-link
  :to="{ name: 'set', params: { setCode: s.set_code.split('-')[0] }, query: { name: s.set_name } }"
  class="truncate grow no-underline transition-opacity hover:opacity-70"
  style="color: var(--c-muted)"
>{{ s.set_name }}</router-link>
```
Note: `s.set_code` format is `LOB-EN001` — split on `-` and take index 0 to get the set prefix.

---

## 4. Architecture Notes

### SSG Pattern (replicate from CardPage exactly)
```
onServerPrefetch → getCardsBySet(name) → set ssrSetData ref → throw on error
useHead(computed(ssrSetData)) → SEO tags baked into static HTML
mounted() → load() → re-fetch → set setCards ref → drives template
watch: setCode → load() on SPA navigation
```

### URL Design: `/en/set/:setCode`
- Route param is set prefix only (e.g., `LOB`, not `LOB-EN001`)
- Set name passed via `?name=` query param when navigating from CardPage
- SetPage uses `route.query.name` for direct API call (avoids full sets list fetch)
- SSG: `onServerPrefetch` uses `name` from `TOP_SET_CODES` (not from query param, injected via route at build time)
- This requires vite-ssg to pass query params in included routes — alternative: store name mapping in set-codes.js and look it up in `onServerPrefetch` by `route.params.setCode`

### hreflang: English-only
Set pages mirror card pages. Only emit `hreflang="en"` and `hreflang="x-default"`.

---

## 5. Risk Assessment

| Risk | Level | Mitigation |
|------|-------|-----------|
| API rate limits during SSG build (parallel `getCardsBySet` calls) | MEDIUM | Start with 10-15 sets; vite-ssg has concurrency option |
| Large set card lists (200+ cards) causing slow render or large HTML | LOW-MEDIUM | Truncate to first 50 in SSG; full list on client |
| SSG route query params — vite-ssg may not support `?name=` in includedRoutes | MEDIUM | Store set name in set-codes.js and look up by code in `onServerPrefetch` |
| URL design edge cases (set codes with unusual formats) | LOW | Test with LOB, MFC, etc. |
| Sitemap bloat | LOW | Max 30-50 set entries at priority 0.5 |

---

## 6. Summary

- **Files to CREATE:** 2 (`SetPage.vue`, `set-codes.js`)
- **Files to MODIFY:** 10 (`router/index.js`, `vite.config.js`, `generate-sitemap.mjs`, `verify-ssg-output.mjs`, `App.vue`, `CardPage.vue`, `en.json`, `fr.json`, `de.json`, `it.json`)
- **Total files affected:** 12
- **Risk level:** MEDIUM
- **API changes:** None required (both `getCardSets` and `getCardsBySet` already exist in api.js)
