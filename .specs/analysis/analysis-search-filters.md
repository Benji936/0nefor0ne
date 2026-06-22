# Codebase Impact Analysis: Advanced Search Filters Panel

## Current Search Data Flow

App.vue (Options API) owns:
- data: { searchQuery, cards, _searchTimer }
- watch: $route.query.q → _doSearch()
- mounted: restores ?q= from URL → _doSearch()
- _doSearch(query): calls searchCardByName → fallback searchCardBySetCode → fallback searchById → sets this.cards → $router.replace({ name:'search', query:{ q } })
- template: <RouterView :search-cards="cards" />

Search.vue (script setup):
- defineProps({ searchCards, login })
- renders card grid when hasSearchResults(searchCards)

## API Capabilities (YGOPRODeck cardinfo.php)

Params combinable in one request:
- fname: fuzzy name (current primary)
- type: "Effect Monster", "Spell Card", "Trap Card", "Fusion Monster", "Xyz Monster", "Link Monster", etc.
- attribute: EARTH, WIND, FIRE, WATER, LIGHT, DARK, DIVINE
- level: 1-12 (covers both Monster Level AND Xyz Rank)
- race: Monster subtype (Dragon, Warrior…) OR Spell subtype (Normal, Quick-Play, Field…) OR Trap subtype (Normal, Continuous, Counter)
- linkrating: 1-6 (Link monsters only)
- num: result cap

Current searchByFilters in api.js only handles level + attribute. Used in CardPage.vue for related-card widgets, NOT in the main search flow.

## Files to Modify (7)

1. frontend/src/api.js
   - Replace narrow searchByFilters({ level, attribute }) with unified searchWithFilters({ fname, type, attribute, level, race, linkrating, num })
   - Keep searchByFilters as thin wrapper to avoid breaking CardPage.vue callers at lines ~555 and ~565
   - Risk: Low

2. frontend/src/views/App.vue
   - Add activeFilters: {} to data()
   - Update _doSearch() to pass filters to unified API function
   - Update $router.replace to merge filter URL params (attr, t, lvl, race, lr) alongside existing q
   - Add route.query watcher to restore filter state on back/forward navigation
   - Pass activeFilters as prop via RouterView slot; handle update:activeFilters emit from Search.vue
   - Risk: Medium (mixed Options API + Composition API style; stale-check must snapshot both query + filters)

3. frontend/src/components/Pages/Search.vue
   - Add activeFilters prop + update:activeFilters emit
   - Import and render SearchFiltersPanel above results section
   - Show active filter count badge
   - Risk: Low (pure display component)

4. frontend/src/locales/en.json
   - Add search.filters.* keys: panel title, clear, filter group labels, attribute value labels, type group labels
   - Risk: Low (additive only)

5. frontend/src/locales/fr.json — mirror French translations
6. frontend/src/locales/de.json — mirror German translations
7. frontend/src/locales/it.json — mirror Italian translations

## Files to Create (1)

8. frontend/src/components/Pages/search/SearchFiltersPanel.vue
   - Filter groups: Card Type (Monster/Spell/Trap + subtypes), Attribute (7-value grid), Level/Rank (pills 1-12), Race (chip list), Link Rating (pills 1-6)
   - v-model pattern: modelValue prop + update:modelValue emit
   - Clear all button
   - Risk: Low (new file)

## Key Integration Points

URL sync extension — current pattern:
  $router.replace({ name:'search', query: q ? { q } : undefined })
Must become:
  $router.replace({ name:'search', query: { ...(q ? { q } : {}), ...filterQuery } })

Stale search guard — must snapshot both query + filters before async call and compare after to avoid race conditions.

CardPage.vue — imports searchByFilters at line 274, calls at lines ~555 and ~565. Keep old function as wrapper to avoid regression.

## Risk Summary

| Risk | Level |
|------|-------|
| API rate limiting | Low — existing 300ms debounce is sufficient |
| URL param conflicts | Low — new short keys don't overlap with q= |
| SSR / vite-ssg | Low — filter panel is client-only interactive; static build snapshots no-filter state (acceptable) |
| App.vue mixed API style | Medium — filter state in Options API data() alongside searchQuery |
| Stale search race condition | Medium — snapshot both query+filters before async call |
| CardPage.vue regression | Low-Medium — keep searchByFilters wrapper |
| Pendulum scale filter | High (scope) — NOT filterable server-side; would need client-side post-filtering; recommend deferring |

## File Count

- Modify: 7 files
- Create: 1 file
- Total: 8 files
- Risk level: LOW-MEDIUM
