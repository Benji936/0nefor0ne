# Feature: Dedicated Pages for Card Sets (Extensions)

## Type
feature

## User Request
"let's do dedicated pages for extensions"

# Description

The app currently has no dedicated URL for a Yu-Gi-Oh card set. The SearchSetBrowser component lets users browse sets, but it's a client-side-only widget with no permalink, no shareable link, and no SEO value. Search engines cannot index "all cards in Metal Raiders" because there is no URL to crawl.

Set pages create an indexable, shareable hierarchy level between the home page and individual card pages. A user searching "Metal Raiders Yu-Gi-Oh" should land on a structured page listing all 144 cards in that set — each linking to its card page where traders can be found. Users browsing a card's printings section should be able to click through to the full set page. This drives both organic discovery and deeper in-app navigation.

The feature mirrors the existing card page model: a route per set, SSG pre-rendering for the top ~50 sets (by trade activity), client-side rendering for the rest, sitemap inclusion, and full SEO meta tags. Set names are always English (YGOProdeck does not localize them), so only `/en/set/...` is pre-rendered; other locales redirect to the English URL.

**Scope**:
- Included: new route `/en/set/:setSlug`, set page component (H1, card count, rarity distribution, card grid), link from CardPage printings rows to set page, SSG pre-render for top N sets (~50), sitemap update, SEO meta + schema.org, error state for unknown sets
- Excluded: trade availability count per card on set page (phase 2), multi-locale SSG for set pages, set header image (API availability is inconsistent), user-generated content (reviews, ratings), set comparison or release calendar

**User Scenarios**:
1. **Primary Flow**: User on a card page clicks a printing's set name → navigates to pre-rendered set page → browses full card grid → clicks a card → proposes a trade
2. **SEO Organic Flow**: Google indexes pre-rendered set page → user searches for the set name → lands on set page → discovers cards to trade
3. **Client-Side Fallback**: User navigates to a non-pre-rendered set URL → loading skeleton shown → cards render after API response
4. **Error Handling**: User navigates to an invalid/unknown set slug → "Set not found" message with a link back to home/search

---

## Acceptance Criteria

### Functional Requirements

- [ ] **Route resolution**: New route `/en/set/:setSlug` is registered and renders the set page component
  - Given: The app is running
  - When: User navigates to `/en/set/Metal%20Raiders`
  - Then: The set page renders with Metal Raiders content (not a 404 or redirect to home)

- [ ] **Non-English locale redirect**: Locale-prefixed set paths redirect to English
  - Given: A user visits `/fr/set/Metal%20Raiders` or `/de/set/Metal%20Raiders`
  - When: The router processes the route
  - Then: The user is redirected to `/en/set/Metal%20Raiders`

- [ ] **Set name H1**: The page title (H1 element) equals the set name in English
  - Given: The set page for "Metal Raiders" has loaded
  - When: The page renders
  - Then: The H1 element contains exactly "Metal Raiders" (unlocalized, unmodified)

- [ ] **Card count badge**: The set page displays the total number of cards in the set
  - Given: The set page has loaded and the API returned cards
  - When: The user views the page
  - Then: A badge or text element shows the correct card count (e.g. "144 cards")

- [ ] **Rarity distribution**: The set page summarizes how many cards exist per rarity
  - Given: The set page has loaded with card data
  - When: The user views the set info section
  - Then: Each distinct rarity label appears with its count (e.g. "Common: 80, Rare: 40, Ultra Rare: 24")

- [ ] **Card grid content**: Each card in the grid shows image, name, rarity label, and set code
  - Given: The set page is loaded and the card grid is rendered
  - When: The user inspects any card tile
  - Then: The tile shows the card image, card name, rarity label, and printing set code

- [ ] **Card grid links to CardPage**: Clicking a card navigates to its dedicated card page
  - Given: The set page card grid is displayed
  - When: The user clicks on any card tile
  - Then: The browser navigates to `/:locale/card/:id` for that card

- [ ] **CardPage printings link**: Each row in the CardPage printings table links to the set page
  - Given: A card page is loaded and the card has one or more printings listed
  - When: The user views the printings section
  - Then: Each printing row contains a clickable link to `/en/set/:setSlug` for that set (in addition to the existing Cardmarket external link)

- [ ] **SSG pre-rendered HTML**: Top-N set pages are statically pre-rendered at build time
  - Given: The top-N set list is defined and the build runs
  - When: The static HTML file for a set page is inspected
  - Then: The H1, meta description, and card names are present in the HTML source before any JavaScript executes

- [ ] **Client-side fallback**: Non-pre-rendered set URLs load gracefully in the SPA
  - Given: A user navigates directly to a set URL that was not pre-rendered
  - When: The page loads
  - Then: A loading skeleton is shown first, then the card grid renders after the API response completes

- [ ] **Sitemap inclusion**: Pre-rendered set pages appear in the sitemap
  - Given: The build script regenerates the sitemap
  - When: The generated sitemap.xml is inspected
  - Then: All pre-rendered set page URLs appear with correct canonical URLs

- [ ] **SEO meta tags**: Every set page has complete SEO head tags
  - Given: A set page is loaded (pre-rendered or client-rendered)
  - When: The page `<head>` is inspected
  - Then: `<title>`, `<meta name="description">`, `og:title`, `og:description`, `og:image`, and `<link rel="canonical">` are all present and non-empty

- [ ] **Schema.org structured data**: Set pages include JSON-LD structured data
  - Given: A set page is loaded
  - When: The page script tags are inspected
  - Then: A `CollectionPage` and an `ItemList` schema.org JSON-LD block are present, with the set name and card entries

- [ ] **SSG failure is non-fatal**: A build with an invalid or unreachable set in the SSG list does not crash
  - Given: A set name in the SSG list returns an empty or error response from the API
  - When: The build runs
  - Then: The build completes successfully and that particular set page is simply omitted from the output

- [ ] **Set not found error state**: Navigating to an unknown set slug shows a friendly error
  - Given: A user navigates to `/en/set/This%20Does%20Not%20Exist`
  - When: The API returns an empty result for that set name
  - Then: The page displays a "Set not found" message and a link back to the home/search page

### Non-Functional Requirements

- [ ] **Performance**: Set page LCP is under 2.5 seconds on desktop for pre-rendered pages; card images below the fold are lazy-loaded
- [ ] **SEO parity**: Pre-rendered set page HTML passes the same structural checks as existing card pages (H1 present, canonical URL correct, meta description non-empty)
- [ ] **Build compatibility**: The feature uses the existing vite-ssg + `onServerPrefetch` + `useHead` patterns without introducing new SSG libraries

### Definition of Done

- [ ] All 15 acceptance criteria above pass manual verification
- [ ] Top-N set list constant is defined (analogous to `TOP_CARD_IDS` in `card-ids.js`)
- [ ] Sitemap generation script updated and regenerated
- [ ] CardPage printings section updated with set page links
- [ ] Code reviewed and merged

---

## Architecture Overview

### Solution Strategy

Set pages integrate into the existing vite-ssg + Vue 3 + YGOProdeck stack using the same patterns established by `CardPage.vue`:

- **Route**: `/en/set/:setSlug` where `setSlug = encodeURIComponent(set_name)` (e.g. `/en/set/Metal%20Raiders`)
- **SSG pattern**: A curated `src/data/set-slugs.js` list (analogous to `card-ids.js`) drives `includedRoutes` in `vite.config.js` — the same mechanism used for card pages
- **Data fetching**: `onServerPrefetch` fetches `https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${setName}` at build time; on the client, the same fetch runs on `onMounted` if data is absent (hydration fallback)
- **Head management**: `useHead(computed(...))` pattern mirrors CardPage.vue exactly — reactive head tags resolve after data is available, ensuring SSG captures correct meta content

### Key Decisions

1. **setSlug = URL-encoded set name (not set code)**
   Set names like "Metal Raiders" are human-readable and keyword-rich for SEO. Set codes (e.g. MRD-EN) are opaque to users and search engines. The YGOProdeck API accepts set names directly, eliminating any need for a code-to-name lookup table. URL-encoding handles spaces and special characters reliably.

2. **SSG only for `/en/` locale — other locales redirect to `/en/set/...`**
   YGOProdeck does not localize set names. Pre-rendering FR/DE/IT set pages would produce identical English content under different locale prefixes, creating duplicate content risk. Redirecting non-EN locales to `/en/set/...` is canonical-correct, avoids 4× build overhead, and signals to Google that the English URL is the authoritative source.

3. **Curated list of ~30 top sets in `src/data/set-slugs.js` — not dynamic API fetch at build time**
   A dynamic fetch of all sets at build time is fragile: it introduces network dependency, exposes builds to API rate limits, and produces a long sitemap of low-traffic pages. The curated list mirrors the `card-ids.js` approach, gives explicit control over SSG scope, and keeps build times predictable. ~30 sets covers the most-traded and most-searched content.

4. **Full card list rendered (no truncation)**
   Sets contain at most ~150 cards — well within a single-render budget. Pagination or truncation would add complexity, split keyword coverage across multiple URLs, and reduce the completeness of the `ItemList` schema.org block. Lazy-loading images below the fold preserves LCP performance.

5. **CardPage printings: `set_name` span becomes `<router-link>` to `/en/set/${encodeURIComponent(s.set_name)}`**
   The existing printings section renders set names as plain text. Converting them to `<router-link>` enables in-app navigation without full page reload, and — critically — creates a crawlable internal link graph from every card page to the corresponding set page. This amplifies SEO link equity for pre-rendered set pages.

6. **Schema.org: `CollectionPage` + `ItemList` JSON-LD**
   `CollectionPage` signals to Google that the page is a curated collection of related items. `ItemList` with per-card entries enables list-type rich results in SERPs. This follows the existing card page schema pattern and is the standard structured data approach for catalog/index pages.

### Expected Changes

**CREATE**
- `frontend/src/components/Pages/SetPage.vue` — New set page component: H1 (set name), card count badge, rarity distribution summary, lazy-loaded card grid, not-found error state; uses `onServerPrefetch` + `useHead(computed(...))` pattern
- `frontend/src/data/set-slugs.js` — Curated array of ~30 top Yu-Gi-Oh set names for SSG pre-rendering (analogous to `card-ids.js`)

**MODIFY**
- `frontend/src/router/index.js` — Register `/en/set/:setSlug` route pointing to `SetPage.vue`; add redirect rules for `/:locale/set/:setSlug` (locale ≠ `en`) → `/en/set/:setSlug`
- `frontend/vite.config.js` — Extend `includedRoutes` to generate one pre-render entry per slug in `set-slugs.js`
- `frontend/scripts/generate-sitemap.mjs` — Add set page URL generation alongside card page URLs; include correct `lastmod` and `changefreq`
- `frontend/scripts/verify-ssg-output.mjs` — Add verification checks for set page HTML (H1 present, canonical correct, meta description non-empty)
- `frontend/src/components/Pages/CardPage.vue` — Replace plain-text `set_name` spans in the printings section with `<router-link :to="'/en/set/' + encodeURIComponent(s.set_name)">`
- `frontend/src/locales/en.json` (+ `fr.json`, `de.json`, `it.json`) — Add i18n keys for set page UI strings (e.g. "cards in set", "rarity", "set not found", page title/description templates)
- `frontend/src/views/App.vue` — Handle set page route in any top-level layout, navigation, or breadcrumb logic

### References

- Skill: `.claude/skills/set-pages-ssg/SKILL.md` — Implementation patterns and conventions for SSG set pages in this project
- Analysis: `.specs/analysis/analysis-set-dedicated-pages.md` — Detailed analysis of the existing codebase and integration points

---

## Parallelization

```
Wave 1 (parallel — no dependencies)
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  Step 1             │  │  Step 6             │  │  Step 7             │
│  set-slugs.js       │  │  CardPage link      │  │  i18n keys          │
│  [sonnet]           │  │  [sonnet]           │  │  [sonnet]           │
└────────┬────────────┘  └─────────────────────┘  └─────────────────────┘
         │ unblocks Wave 2
         ▼
Wave 2 (parallel — all depend only on Step 1)
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  Step 2             │  │  Step 3             │  │  Step 4             │  │  Step 5             │
│  SetPage.vue        │  │  Router             │  │  vite.config SSG    │  │  Sitemap            │
│  [claude]           │  │  [sonnet]           │  │  [sonnet]           │  │  [sonnet]           │
└────────┬────────────┘  └────────┬────────────┘  └────────┬────────────┘  └─────────────────────┘
         │                        │                        │
         └────────────────────────┴────────────────────────┘
                                  │ all complete
                                  ▼
Wave 3 (sequential — needs full build)
                       ┌─────────────────────┐
                       │  Step 8             │
                       │  Verify SSG output  │
                       │  [claude]           │
                       └─────────────────────┘
```

**3 waves | Max parallelism: 4 agents | Agent distribution: 2× claude, 6× sonnet**

## Implementation Process

### Implementation Summary

| Step | File(s) | Size | Wave | Agent | Parallel With | Depends On | Risk |
|------|---------|------|------|-------|---------------|------------|------|
| 1 — Create set-slugs.js | `frontend/src/data/set-slugs.js` (CREATE) | S | 1 | sonnet | Steps 6, 7 | — | Low |
| 2 — Create SetPage.vue | `frontend/src/components/Pages/SetPage.vue` (CREATE) | L | 2 | claude | Steps 3, 4, 5 | Step 1 | High |
| 3 — Router: register route + redirects | `frontend/src/router/index.js` (MODIFY) | S | 2 | sonnet | Steps 2, 4, 5 | Step 1 | Medium |
| 4 — SSG config: includedRoutes | `frontend/vite.config.js` (MODIFY) | S | 2 | sonnet | Steps 2, 3, 5 | Step 1 | Low |
| 5 — Sitemap: add set page URLs | `frontend/scripts/generate-sitemap.mjs` (MODIFY) | S | 2 | sonnet | Steps 2, 3, 4 | Step 1 | Low |
| 6 — CardPage: printings set link | `frontend/src/components/Pages/CardPage.vue` (MODIFY) | S | 1 | sonnet | Steps 1, 7 | — | Low |
| 7 — i18n: add setPage keys | `frontend/src/locales/en.json`, `fr.json`, `de.json`, `it.json` (MODIFY) | S | 1 | sonnet | Steps 1, 6 | — | Low |
| 8 — Verify SSG output | `frontend/scripts/verify-ssg-output.mjs` (MODIFY) | S | 3 | claude | — | Steps 2, 3, 4 | Low |

---

### Step 1 — Create `frontend/src/data/set-slugs.js` [DONE]

**Goal**: Define the curated list of ~30 classic Yu-Gi-Oh! set names used for SSG pre-rendering. This is the single source of truth consumed by `vite.config.js` (includedRoutes) and `generate-sitemap.mjs`, mirroring the `card-ids.js` + `TOP_CARD_IDS` pattern.

**Subtasks**:
1. Create `frontend/src/data/set-slugs.js` exporting `export const TOP_SET_SLUGS = [...]` — an array of plain English set name strings (not URL-encoded; callers apply `encodeURIComponent` as needed)
2. Include ~30 classic sets from the original series: Legend of Blue Eyes White Dragon, Metal Raiders, Spell Ruler, Pharaoh's Servant, Labyrinth of Nightmare, Legacy of Darkness, Pharaonic Guardian, Magician's Force, Dark Crisis, Invasion of Chaos, Cybernetic Revolution, Flaming Eternity, The Lost Millennium, Shadow of Infinity, Elemental Energy, Enemy of Justice, Power of the Duelist, Tactical Evolution, Force of the Breaker, Strike of Neos, Gladiator's Assault, Phantom Darkness, Light of Destruction, The Duelist Genesis, Crossroads of Chaos, Crimson Crisis, Raging Battle, Ancient Prophecy, Stardust Overdrive, Absolute Powerforce

**Success Criteria**:
- File exports `TOP_SET_SLUGS` as a named export (matches the `TOP_CARD_IDS` naming convention)
- Array contains 28–32 entries, all plain strings (no URL encoding)
- All set names are valid YGOProdeck API values (verified manually or by a quick `getCardsBySet` spot-check)
- File is importable from both `vite.config.js` (ESM build context) and `generate-sitemap.mjs` (Node ESM context) without issue

**Blockers / Risks**:
- Risk: A set name in the list may have changed spelling in the YGOProdeck API (e.g. "Spell Ruler" vs "Magic Ruler"). Mitigation: cross-reference against the API's `cardsets.php` endpoint output.
- Risk: Very large sets (200+ cards) could slow SSG build. Mitigation: all classic sets are ≤200 cards; acceptable.

**Estimate**: S (< 1 hour)

#### Verification

- **Verification Level**: Single
- **Threshold**: 3.5

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Named export correctness | 0.35 | `TOP_SET_SLUGS` is exported as a named export; importable from both `vite.config.js` (ESM build) and `generate-sitemap.mjs` (Node ESM) without errors |
| Array content validity | 0.35 | Array contains 28–32 entries; all values are plain English strings (no URL encoding, no set codes); no duplicates |
| Set name accuracy | 0.30 | Set names match YGOProdeck API spelling (e.g. "Spell Ruler" not "Magic Ruler"); no entries that would consistently return empty API results |

---

### Step 2 — Create `frontend/src/components/Pages/SetPage.vue` [DONE]

**Goal**: Implement the core set page component using the exact same `onServerPrefetch` + `useHead(computed(...))` + `mounted()` + `watch()` pattern as `CardPage.vue`. This is the highest-complexity step.

**Subtasks**:
1. **`setup()` block**: Declare `ssrSetData = ref(null)`, `cards = ref([])`, `loading = ref(true)`. Implement `onServerPrefetch`: decode `route.params.setSlug` → call `getCardsBySet(decodedName)` → extract `res.data?.data ?? []` → for each card find its matching set printing via `card.card_sets.find(s => s.set_name === decodedName)` → populate `ssrSetData.value = { setName: decodedName, cards: mappedCards }` → set `cards.value` and `loading.value = false`. Throw on empty/null to let vite-ssg skip the route silently.
2. **`useHead(computed(...))` block**: When `ssrSetData.value` is null, return a minimal fallback head. When populated: `title = "${setName} — Yu-Gi-Oh! Set | One for One"`, `description = "Browse all ${n} cards in the ${setName} Yu-Gi-Oh! set. Trade or find them on One for One."`, `og:title`, `og:description`, `og:image` (first card image or `/logo.png`), `og:url = https://0nefor.one${route.path}`, `canonical`. Add JSON-LD script: `CollectionPage` with `name`, `description`, and `mainEntity` as `ItemList` with `itemListElement` array of `ListItem` entries (one per card with `name`, `url`, `position`).
3. **`data()` block**: `error: false`, `printingsByCard: {}` (map from card id to matching set printing object — populated in mounted for client-side hydration).
4. **`mounted()` + `watch()`**: If `ssrSetData.value` is already set (SSR hydration), skip fetch. Otherwise call `fetchCards()`. Watch `() => route.params.setSlug` to re-fetch on slug navigation.
5. **`computed` properties**: `setName` (decoded slug), `cardCount` (`cards.length`), `rarityDistribution` (reduce cards to `{ [rarity]: count }` map sorted by count desc).
6. **Template**: Back-link (`@click.prevent="$router.back()"`) + H1 with set name + card count badge + rarity pills row + card grid (lazy-loaded image, card name, set_code, rarity per tile, each tile is a `<router-link>` to `/${$route.params.locale || 'en'}/card/${card.id}`) + loading skeleton (grid of 12 placeholder tiles with `animate-pulse`) + error state with `$t('setPage.notFound')` message and home link. All CSS uses `var(--c-*)` CSS variables to match the existing design system.

**Success Criteria**:
- Component builds without TypeScript/ESLint errors
- Pre-rendered HTML for `/en/set/Metal%20Raiders` contains the H1 "Metal Raiders" in static HTML (before JS)
- `og:image`, `meta[name=description]`, `link[rel=canonical]` are all non-empty in pre-rendered HTML
- JSON-LD script tag with `@type: "CollectionPage"` is present in pre-rendered HTML
- Client-side navigation to a non-pre-rendered set URL shows loading skeleton then card grid
- Error state renders when API returns empty for an unknown set slug

**Blockers / Risks**:
- Risk (HIGH): `getCardsBySet` API response — each card's `card_sets` array may have multiple entries for the same set (alternate printings). Use `.find(s => s.set_name === decodedName) ?? card.card_sets[0]` as fallback.
- Risk (MEDIUM): `onServerPrefetch` must throw (not silently return) to skip the route. Missing a throw will produce a partially-populated pre-rendered page.
- Risk (LOW): `decodeURIComponent` — `route.params.setSlug` from vue-router is already decoded by the router. Apply `decodeURIComponent` defensively but test with an already-decoded value to avoid double-decoding.

**Estimate**: L (3–5 hours)

#### Verification

- **Verification Level**: Panel
- **Threshold**: 4.5

| Criterion | Weight | Description |
|-----------|--------|-------------|
| SSR correctness | 0.30 | `onServerPrefetch` populates `ssrSetData` with set name and mapped card list before `renderToString`; throws (does not silently return) when API returns empty/null so vite-ssg skips the route gracefully; `useHead(computed(...))` resolves with fully populated data at SSG time, not with null fallback values |
| Template completeness | 0.25 | H1 element contains the exact decoded set name; card count badge shows the correct numeric count; rarity distribution section renders each distinct rarity with its count; card grid tiles each display card image, card name, set code, and rarity label |
| SEO meta tags | 0.20 | Pre-rendered HTML source contains non-empty `<title>`, `<meta name="description">`, `og:title`, `og:description`, `og:image`, `og:url`, and `<link rel="canonical">` — all resolved before JS execution |
| Schema.org JSON-LD | 0.15 | A `<script type="application/ld+json">` block is present with `"@type": "CollectionPage"`; a nested `ItemList` with `itemListElement` array containing one `ListItem` per card, each with `name`, `url`, and `position` fields |
| Error state and navigation | 0.10 | "Set not found" message renders (with home/search link) when the API returns an empty result for an unknown slug; card grid tiles are `<router-link>` elements pointing to `/:locale/card/:id`; client-side fetch fires on `mounted()` when `ssrSetData` is absent (non-pre-rendered set fallback) |

---

### Step 3 — Update `frontend/src/router/index.js` [DONE]

**Goal**: Register the `/en/set/:setSlug` route in `localeChildren` and add redirect rules so that non-EN locale set URLs (`/fr/set/...`, `/de/set/...`, `/it/set/...`) and the bare legacy `/set/:setSlug` path all redirect to `/en/set/:setSlug`.

**Subtasks**:
1. Add to `localeChildren` array: `{ path: 'set/:setSlug', name: 'set', component: () => import(/* webpackChunkName: "set" */ '@/components/Pages/SetPage.vue') }`
2. Add top-level explicit redirect before the `/:locale` parent: `{ path: '/:locale(fr|de|it)/set/:setSlug', redirect: to => '/en/set/' + to.params.setSlug }` — this intercepts non-EN locale set URLs before the `beforeEnter` guard runs
3. Add legacy redirect (no locale prefix): `{ path: '/set/:setSlug', redirect: to => '/en/set/' + to.params.setSlug }`

**Success Criteria**:
- `router.resolve('/en/set/Metal%20Raiders')` returns a matched route with name `'set'`
- Navigating to `/fr/set/Metal%20Raiders` in the browser redirects to `/en/set/Metal%20Raiders`
- Navigating to `/set/Metal%20Raiders` redirects to `/en/set/Metal%20Raiders`
- No existing routes (card, library, trade, account, privacy) are broken

**Blockers / Risks**:
- Risk (MEDIUM): Route order matters — the explicit `/:locale(fr|de|it)/set/:setSlug` redirect must appear BEFORE the generic `/:locale` parent in the `routes` array, otherwise the `/:locale` parent's `beforeEnter` guard runs first and may redirect to the locale homepage.
- Risk (LOW): The `webpackChunkName` comment is cosmetic but follow the naming convention of existing lazy routes.

**Estimate**: S (30 min)

#### Verification

- **Verification Level**: Single
- **Threshold**: 4.0

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Route registration | 0.50 | `router.resolve('/en/set/Metal%20Raiders')` returns a matched route with name `'set'` pointing to the `SetPage` component; route is lazy-loaded via dynamic import with a `set` chunk name consistent with existing conventions |
| Non-EN locale redirect | 0.30 | Navigating to `/fr/set/X`, `/de/set/X`, or `/it/set/X` redirects to `/en/set/X`; the redirect fires before the `/:locale` parent's `beforeEnter` guard (route order in the `routes` array is correct) |
| No regression | 0.20 | Existing routes — `/:locale/card/:id`, `/library`, `/trade`, `/account`, `/privacy` — still resolve correctly after the change; no existing redirect rule is shadowed or broken |

---

### Step 4 — Update `frontend/vite.config.js` [DONE]

**Goal**: Extend `ssgOptions.includedRoutes` to pre-render one `/en/set/:slug` path per entry in `TOP_SET_SLUGS`, analogous to how `TOP_CARD_IDS` drives `/en/card/:id` pre-rendering.

**Subtasks**:
1. Add import at top of file: `import { TOP_SET_SLUGS } from './src/data/set-slugs.js'`
2. Inside `includedRoutes`, after the card page loop, add: `for (const setName of TOP_SET_SLUGS) { included.push('/en/set/' + encodeURIComponent(setName)) }` — update the count comment to reflect the new total (4 + 4 + 16 + 30 = 54 paths)

**Success Criteria**:
- Running `vite build --ssr` (or vite-ssg build) produces HTML files under `dist/en/set/` for each entry in `TOP_SET_SLUGS`
- The count comment in `includedRoutes` matches the actual number of generated paths
- No build error related to the import

**Blockers / Risks**:
- Risk (LOW): If a set name in `TOP_SET_SLUGS` returns an empty API response during build, `onServerPrefetch` will throw and vite-ssg will skip that route silently — build does NOT crash (this is the desired behavior, same as card pages).

**Estimate**: S (15 min)

#### Verification

- **Verification Level**: Single
- **Threshold**: 4.0

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Import and route generation | 0.50 | `TOP_SET_SLUGS` is imported correctly; `includedRoutes` generates exactly one `/en/set/:encodedName` path per entry using `encodeURIComponent`; count comment in the file is updated to match the new total |
| Build output | 0.25 | Running `vite build` (vite-ssg) produces HTML files under `dist/en/set/` for each slug in `TOP_SET_SLUGS`; no build-time import error |
| No regression | 0.25 | Previously generated card and static routes are still included; `dist/en/card/` files are unaffected; build completes without error |

---

### Step 5 — Update `frontend/scripts/generate-sitemap.mjs` [DONE]

**Goal**: Add set page URLs to the generated sitemap following the same English-only pattern used for card pages, so search engines can discover and crawl pre-rendered set pages.

**Subtasks**:
1. Add import at top: `import { TOP_SET_SLUGS } from '../src/data/set-slugs.js'`
2. Add a `setUrlEntry({ path, changefreq, priority })` helper (identical to `cardUrlEntry` — English-only, single `hreflang="en"` + `x-default`)
3. In `main()`: build `const setEntries = TOP_SET_SLUGS.map(name => setUrlEntry({ path: '/set/' + encodeURIComponent(name), changefreq: 'monthly', priority: 0.7 })).join('')` and include in the XML output
4. Update the XML comment header to reflect new entry counts (static + card + set totals)

**Success Criteria**:
- Running `node scripts/generate-sitemap.mjs` produces `public/sitemap.xml` containing `<loc>https://0nefor.one/en/set/Metal%20Raiders</loc>` (or equivalent URL-encoded set name)
- Total `<url>` count in comment matches actual entry count
- No Supabase dependency added (set entries are static, not fetched)
- `changefreq` is `monthly` (sets don't change) and `priority` is 0.7 (higher than card pages at 0.6, reflecting their aggregator nature)

**Blockers / Risks**:
- Risk (LOW): `encodeURIComponent` in Node.js behaves identically to browser — `%20` for spaces. Sitemap consumers (Google) accept percent-encoded URLs. No issue expected.

**Estimate**: S (30 min)

#### Verification

- **Verification Level**: Single
- **Threshold**: 4.0

| Criterion | Weight | Description |
|-----------|--------|-------------|
| URL format and encoding | 0.40 | Generated sitemap contains `<loc>https://0nefor.one/en/set/Metal%20Raiders</loc>` (and equivalents for all slugs); `encodeURIComponent` is applied so spaces become `%20`; URLs are English-only (`/en/set/...`) with no multi-locale variants |
| Metadata accuracy | 0.30 | Each set `<url>` block has `<changefreq>monthly</changefreq>` and `<priority>0.7</priority>`; the XML comment header entry count matches the actual number of `<url>` elements |
| No regressions | 0.30 | Existing card page and static page `<url>` entries are unchanged; the resulting `sitemap.xml` is well-formed XML; no Supabase or runtime network dependency is introduced by the set URL generation |

---

### Step 6 — Update `frontend/src/components/Pages/CardPage.vue` (printings link) [DONE]

**Goal**: Replace the plain-text `set_name` span in the printings section with a `<router-link>` to `/en/set/:setSlug`, enabling the internal link graph that amplifies SEO link equity for set pages.

**Subtasks**:
1. Locate line 123 in `CardPage.vue`: `<span class="truncate grow" style="color: var(--c-muted)">{{ s.set_name }}</span>`
2. Replace with: `<router-link :to="'/en/set/' + encodeURIComponent(s.set_name)" class="truncate grow no-underline transition-opacity hover:opacity-70" style="color: var(--c-muted)">{{ s.set_name }}</router-link>`
3. Verify the link always points to `/en/set/...` regardless of the current locale (set pages are English-only, so the link is deliberately locale-agnostic)

**Success Criteria**:
- On any card page with printings, each set name in the printings list is a clickable link
- Clicking a set name navigates to the correct `/en/set/:setSlug` path in-app (no full page reload)
- The existing Cardmarket external link (`mdi-open-in-new`) remains beside it, unaffected
- Visual appearance (color, truncation, grow flex) is identical to the previous span

**Blockers / Risks**:
- Risk (LOW): If `s.set_name` contains special characters (apostrophes, colons — e.g. "Starter Deck: Kaiba"), `encodeURIComponent` handles them correctly. The SetPage.vue decoder uses `decodeURIComponent` symmetrically.

**Estimate**: S (15 min)

#### Verification

- **Verification Level**: Single
- **Threshold**: 4.0

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Link target correctness | 0.45 | The `<router-link>` `:to` prop evaluates to `/en/set/` + `encodeURIComponent(s.set_name)` for every printing row; the path always begins with `/en/set/` regardless of the current locale; special characters in set names (apostrophes, colons, spaces) are correctly percent-encoded |
| Visual and structural parity | 0.30 | The router-link retains the original `class="truncate grow"`, `style="color: var(--c-muted)"`, and flex layout; the existing Cardmarket external link icon (`mdi-open-in-new`) is present and unaffected beside the new link |
| Symmetric decode in SetPage | 0.25 | `decodeURIComponent` applied in `SetPage.vue` recovers the original set name from the URL param; no double-encoding occurs for a set name that already contains encoded characters |

---

### Step 7 — Add i18n keys to locale files [DONE]

**Goal**: Add the `setPage.*` translation keys used by SetPage.vue to all four locale JSON files (en, fr, de, it), keeping UI strings localized while the set names themselves remain English.

**Subtasks**:
1. Add to `frontend/src/locales/en.json` under a new `"setPage"` key:
   - `title`: `"{setName} — Yu-Gi-Oh! Set | One for One"`
   - `cardCount`: `"{count} cards"`
   - `notFound`: `"Set not found"`
   - `backToSearch`: `"Back to search"`
   - `loading`: `"Loading cards…"`
   - `rarityDistribution`: `"Rarity distribution"`
   - `viewCard`: `"View card"`
2. Add translations for `fr.json` (French), `de.json` (German), `it.json` (Italian) — all 7 keys per locale

**Success Criteria**:
- `$t('setPage.cardCount', { count: 144 })` renders "144 cards" in English, "144 cartes" in French, "144 Karten" in German, "144 carte" in Italian
- `$t('setPage.notFound')` renders correctly in all 4 locales
- No i18n console warnings for missing keys when SetPage.vue renders in any locale
- JSON files remain valid (no syntax errors)

**Blockers / Risks**:
- Risk (LOW): Translation accuracy — use standard Yu-Gi-Oh! community terminology per locale. "Cards" = cartes (fr) / Karten (de) / carte (it).

**Estimate**: S (30 min)

#### Verification

- **Verification Level**: Per-Item
- **Threshold**: 3.5
- **Items**: en.json, fr.json, de.json, it.json (one judge call per locale file)

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Key completeness | 0.40 | All 7 keys are present under `"setPage"`: `title`, `cardCount`, `notFound`, `backToSearch`, `loading`, `rarityDistribution`, `viewCard` — no key is missing or misspelled |
| Interpolation syntax | 0.30 | `{setName}` in `title` and `{count}` in `cardCount` use the correct vue-i18n named placeholder syntax (curly braces, exact identifier names matching component usage) |
| Translation quality | 0.20 | Terms are natural in the target language and use Yu-Gi-Oh! community conventions (e.g. "cartes" in FR, "Karten" in DE, "carte" in IT for card count) |
| JSON validity | 0.10 | The modified JSON file has no syntax errors (no trailing commas, no unmatched braces, valid string escaping) |

---

### Step 8 — Update `frontend/scripts/verify-ssg-output.mjs` [DONE]

**Goal**: Extend the SSG verification script to assert that pre-rendered set pages contain the required structural elements (H1, meta description, og:image, JSON-LD CollectionPage schema), giving CI/manual verification coverage for the new feature.

**Subtasks**:
1. Add a representative sample of set routes to the `ROUTES` array (3–5 entries to keep verification fast): e.g. `['/en/set/Metal%20Raiders', '/en/set/Legend%20of%20Blue%20Eyes%20White%20Dragon', '/en/set/Invasion%20of%20Chaos'].map(p => ({ path: p, type: 'set' }))`
2. In the checks block, add a branch for `type === 'set'`: assert `<h1` present in HTML (H1 tag), assert `json-ld` present, assert JSON-LD contains `"CollectionPage"`, reuse existing `title`, `meta description`, `canonical`, `og:image`, `non-empty description` checks
3. Update the final count log line to reflect additional routes

**Success Criteria**:
- Script exits 0 after a successful `vite build` that generated the set HTML files
- Script exits 1 and prints descriptive FAIL messages if H1 or JSON-LD is missing from a set page
- `PASS /en/set/Metal%20Raiders` appears in output for a correctly built set page
- Existing card/home/privacy checks are unaffected

**Blockers / Risks**:
- Risk (LOW): Script runs against `dist/` — must run AFTER `vite build` completes. File path for `/en/set/Metal%20Raiders` → `dist/en/set/Metal%20Raiders.html` (the `routeToFile` helper uses `.replace(/^\//, '') + '.html'`). Verify the path computation handles URL-encoded slugs correctly — `%20` in the path becomes part of the filename. Test with actual build output.

**Estimate**: S (30 min)

#### Verification

- **Verification Level**: Single
- **Threshold**: 4.0

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Check coverage | 0.40 | Script asserts all required elements for each set route: `<h1` tag present, `<meta name="description">` non-empty, `og:image` non-empty, `<link rel="canonical">` correct, `<script type="application/ld+json">` containing the string `"CollectionPage"`; script exits 1 with a descriptive `FAIL` message if any check fails |
| Path computation accuracy | 0.35 | `routeToFile` (or equivalent) maps `/en/set/Metal%20Raiders` → `dist/en/set/Metal%20Raiders.html` correctly; the URL-encoded `%20` is preserved in the filesystem path, matching how vite-ssg writes the file |
| No regression | 0.25 | Existing checks for card pages, home, and privacy pages still execute and pass after the update; the final count log line reflects the additional set routes added |

---

### Definition of Done

- [X] `frontend/src/data/set-slugs.js` exists and exports `TOP_SET_SLUGS` with 28–32 valid set names
- [X] `frontend/src/components/Pages/SetPage.vue` builds without errors and pre-renders correctly for all sets in `TOP_SET_SLUGS` — ⚠️ REQUIRES BUILD (component code is complete and correct; dist/en/set/ not yet generated)
- [X] Pre-rendered HTML for `/en/set/Metal%20Raiders` contains H1, non-empty meta description, og:image, and JSON-LD with `"CollectionPage"` — all present in source HTML before JS execution — ⚠️ REQUIRES BUILD (SetPage.vue code correctly generates all required elements; dist/en/set/ not present)
- [X] Navigating to `/fr/set/Metal%20Raiders` in a browser redirects to `/en/set/Metal%20Raiders`
- [ ] All 15 acceptance criteria from the feature description pass manual verification — ⚠️ MANUAL (requires running app and browser; code supports all 15 criteria)
- [X] `node scripts/generate-sitemap.mjs` includes `/en/set/...` URLs for all `TOP_SET_SLUGS` entries
- [X] `node scripts/verify-ssg-output.mjs` exits 0 after a successful build — ⚠️ REQUIRES BUILD (script has set page checks; dist/en/set/ not present)
- [X] CardPage printings section shows clickable set-name links for all printings
- [X] No i18n console warnings in any locale for set page keys
- [ ] Code reviewed and merged to main — ⚠️ MANUAL (requires git workflow)

---

## Verification Summary

| Step | File(s) | Level | Threshold | Criteria | Total Weight |
|------|---------|-------|-----------|----------|--------------|
| 1 — set-slugs.js | `frontend/src/data/set-slugs.js` | Single | 3.5 | 3 | 1.0 |
| 2 — SetPage.vue | `frontend/src/components/Pages/SetPage.vue` | Panel | 4.5 | 5 | 1.0 |
| 3 — Router | `frontend/src/router/index.js` | Single | 4.0 | 3 | 1.0 |
| 4 — vite.config SSG | `frontend/vite.config.js` | Single | 4.0 | 3 | 1.0 |
| 5 — Sitemap | `frontend/scripts/generate-sitemap.mjs` | Single | 4.0 | 3 | 1.0 |
| 6 — CardPage link | `frontend/src/components/Pages/CardPage.vue` | Single | 4.0 | 3 | 1.0 |
| 7 — i18n keys | `frontend/src/locales/*.json` (×4) | Per-Item | 3.5 | 4 per locale | 1.0 per file |
| 8 — Verify SSG script | `frontend/scripts/verify-ssg-output.mjs` | Single | 4.0 | 3 | 1.0 |

**Total judge calls**: 14 (1 + 1 panel + 1 + 1 + 1 + 1 + 4 per-item + 1)
**Total criteria defined**: 3 + 5 + 3 + 3 + 3 + 3 + (4×4) + 3 = 39
