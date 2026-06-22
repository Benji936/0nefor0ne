---
title: "Advanced Search Filters Panel"
type: feature
---

# Advanced Search Filters Panel

## User Request

"I would like to add filters in my search vue like in card cluster search"

## Description

Today the search page only finds cards by name text. This fails users who are exploring or sourcing cards by gameplay characteristics rather than an exact name — for example "a LIGHT level-8 Synchro monster" or "a Quick-Play Spell". On a card-trading marketplace, search is the entry point to the core loop: find a card → add it to a trade pile / wishlist → get matched with other traders. A failed search is a dead end that pushes users to external card databases.

This feature adds an advanced filter panel to the search page (Card Cluster-style) that lets users narrow the card catalogue by structured attributes: monster category, Spell sub-type, Trap sub-type, attribute, level/rank (with comparators), pendulum scale, race/type, and link rating + arrow directions. Filters work **together with** the existing name/text search (results must satisfy both), and can also be used on their own when the text box is empty. The active filter set is reflected in the URL query string so filtered searches are shareable and bookmarkable, and so browser back/forward restores prior state.

This benefits traders and collectors browsing by characteristics, new users who don't have card names memorized, and deck-builders sourcing cards that fit an archetype/attribute/level profile.

**Key constraints:**
- Card data comes from the external YGOPRODeck `cardinfo.php` API. It supports server-side filtering for `fname`, `type`, `attribute`, `level`, `race`, `linkrating`, and `num` only. Dimensions the API cannot express — comparators (>=, =, <=), pendulum scale, and link-arrow directions — must be applied client-side over the candidate set returned by the supported parameters.
- The app uses vite-ssg (SSR/SSG); the filter UI must not break static build or client hydration. (Search itself already runs client-side only.)
- All filter labels and option values must be localized across the four supported locales (en, fr, de, it). Card name and enum values remain English (API behavior).
- Default state (no filters active) must preserve the current name-search behavior exactly.

**Scope**:
- Included: collapsible filter panel on the search page; the filter dimensions listed below; conditional visibility of sub-filters by card kind; combining filters with text; filter-only search; URL persistence of active filters; clear-all action; mobile-responsive behavior; i18n of all labels/options.
- Excluded: saved filter presets, sort/order controls, banlist/staple/format filters, archetype autocomplete filter, server-side persistence of last-used filters per account.

**Filter dimensions**:
- Monster category (single-select + "All"): Normal, Effect, Ritual, Fusion, Synchro, Xyz, Pendulum, Link, Tuner, Flip, Toon, Spirit, Union, Gemini, Token.
- Spell sub-type (single-select + "All"): Normal, Continuous, Field, Equip, Quick-Play, Ritual.
- Trap sub-type (single-select + "All"): Normal, Continuous, Counter.
- Attribute (multi-select toggle chips, OR semantics): EARTH, WIND, FIRE, WATER, LIGHT, DARK, DIVINE.
- Level / Rank (value 1–12 + comparator >=, =, <=).
- Pendulum Scale (value + comparator).
- Race / Type (dropdown).
- Link Rating (value + comparator) and Link Arrow directions (directional toggles).

**User Scenarios**:
1. **Primary Flow**: User opens the filter panel, selects Monster category = Synchro and Attribute = LIGHT, optionally types text; results update to LIGHT Synchro monsters matching the text; the URL reflects the filters.
2. **Alternative Flow**: User leaves the text box empty, sets only filters (e.g. Trap sub-type = Counter), and gets the matching cards (filter-only search).
3. **Error Handling**: A filter combination matching no cards shows a clear empty/no-results state without crashing or showing stale results; an API/network failure leaves the panel usable and shows no-results rather than erroring.

---

## Architecture Overview

### Solution Strategy

App.vue remains the **single source of truth and the only async writer** to the search result set. It already owns `searchQuery`, `cards`, the 300ms debounce, the stale guard, and the `router.replace` URL sync. We add a sibling `activeFilters` object to its `data()` and extend the existing `_doSearch` pipeline to fetch with filters. The new `SearchFiltersPanel.vue` is a **fully controlled, display-only component** (`v-model:filters`): it renders controls, emits `update:filters`, and performs **no fetching and no URL writes** of its own. This avoids the alternative (Search.vue fetches filtered results) which would create two competing async writers to one `cards` object and duplicate the stale-guard logic.

Filters that the YGOPRODeck API can express (`type`, `attribute` single, `level` exact, `race`, `linkrating`) are sent as request params. Filters the API **cannot** express — comparators (`>=`, `<=`), pendulum scale, link-arrow directions, and multi-attribute OR — are applied **client-side** as predicates over the candidate set. When any client predicate is active, the request `num` cap is raised (~100) before filtering and the result sliced back to the display cap, so post-filtering does not silently drop matches.

### Component Diagram

```
App.vue (Options API — OWNS state)
 ├─ data: searchQuery, cards, activeFilters, _searchTimer, _searchSeq
 ├─ update() ── 300ms debounce ──▶ _doSearch()
 ├─ _doSearch(): derive {serverParams, clientPredicates}
 │        └─▶ api.searchByFilters(serverParams)  ──▶ filter(predicates).slice(cap) ──▶ cards
 │        └─▶ router.replace(serialize(query, filters))
 ├─ watch '$route.query' (deep) ──▶ deserialize ──▶ re-run update()   [back/fwd]
 └─ <RouterView :search-cards="cards" v-model:filters="activeFilters">
        └─ Search.vue (<script setup>, display-only)
             ├─ props: searchCards, filters, activeCount
             ├─ renders result grid (existing)
             └─ <SearchFiltersPanel v-model:filters="filters">   [NEW, controlled]
                    └─ kind pills · category pills · attribute chips · level/rank+comparator
                       · pendulum scale+comparator · race dropdown · link rating+comparator
                       · link-arrow toggles · Clear-all
```

### Data Flow

1. User edits text or any filter control → `App.update()` (300ms debounce).
2. `_doSearch()`: `const seq = ++this._searchSeq` (replaces the query-only stale check; covers filter-only searches where `query === ''`).
3. Derive `serverParams` + `clientPredicates` from `{ searchQuery, activeFilters }`.
4. `await searchByFilters(serverParams)` (extended fn, `.catch(() => ({ data: { data: [] } }))`).
5. Bail if `seq !== this._searchSeq` (stale).
6. `this.cards = { data: response.data.data.filter(clientPredicates).slice(0, cap) }`.
7. `router.replace({ name: 'search', query: serialize(searchQuery, activeFilters) })`.
8. Browser back/forward: `watch('$route.query', deep)` deserializes into `searchQuery` + `activeFilters` and re-runs `update()`, guarding against the echo of its own `router.replace`.

### URL Param Schema

Short keys, namespaced on the existing `search` route alongside `q`. Absent ⇒ inactive; `clearFilters` strips all but `q`.

| Key | Meaning | Example |
|---|---|---|
| `q` | name text (existing) | `q=dark+magician` |
| `k` | kind | `k=monster` \| `spell` \| `trap` |
| `t` | monster category token | `t=synchro` |
| `a` | attribute(s) CSV (OR) | `a=light,dark` |
| `lv` / `lvc` | level/rank value + comparator | `lv=8&lvc=gte` |
| `ps` / `psc` | pendulum scale value + comparator | `ps=4&psc=eq` |
| `r` | race / type | `r=Dragon` |
| `lr` / `lrc` | link rating value + comparator | `lr=3&lrc=gte` |
| `la` | link arrows CSV | `la=tl,t,tr` |

### API Extension Plan (`frontend/src/api.js`)

Extend `searchByFilters` **additively** (no new export name, lowest risk) from `{ level, attribute, num }` to `{ fname, type, attribute, level, race, linkrating, num }`:

```js
export const searchByFilters = ({ fname, type, attribute, level, race, linkrating, num = 20 } = {}) => {
  const p = new URLSearchParams();
  if (fname)              p.set('fname', fname);
  if (type)               p.set('type', type);
  if (attribute)          p.set('attribute', String(attribute).toLowerCase());
  if (level != null)      p.set('level', level);
  if (race)               p.set('race', race);
  if (linkrating != null) p.set('linkrating', linkrating);
  if (num != null)        p.set('num', num);
  return axios.get(`${API_URL}cardinfo.php?${p.toString()}`)
    .catch(() => ({ data: { data: [] } }));
};
```

`CardPage.vue` callers that pass `{ level, attribute }` continue to work unchanged.

### i18n Keys (`en/fr/de/it`, additive)

`search.filters.{title,toggle,clear,activeCount,noResults}`; `.kind.{monster,spell,trap,any}`; `.category.{normal,effect,ritual,fusion,synchro,xyz,pendulum,link,tuner,flip,toon,spirit,union,gemini,token}`; `.spellType.{normal,continuous,field,equip,quickplay,ritual}`; `.trapType.{normal,continuous,counter}`; `.attribute.label` (EARTH–DIVINE remain uppercase enum, untranslated); `.level.label`/`.rank.label`; `.comparator.{gte,eq,lte}`; `.scale.label`; `.race.label`; `.linkRating.label`; `.linkArrows.label`.

### SSG Note

The panel is client-only interactive; the static build snapshots the no-filter state (acceptable). App.vue search already runs client-side only behind a `typeof document` guard. Filter hydration from the URL happens on mount, so SSG and hydration are unaffected.

---

## Acceptance Criteria

### Functional Requirements

- [x] **Filter panel visibility**: A filter control is present and discoverable on the search page and can be expanded/collapsed.
  - Given: a user is on the search page
  - When: the page loads
  - Then: a filter panel/affordance is visible and, when toggled, expands to reveal the filter controls and collapses to hide them; with no filters set the default search behavior is unchanged

- [x] **Monster category filter**: Selecting a monster category narrows results to that category.
  - Given: the filter panel is open
  - When: the user selects a Monster category (e.g. Synchro)
  - Then: every returned card is a monster of that category

- [x] **Spell / Trap sub-type filters**: Selecting a Spell or Trap sub-type narrows results to that sub-type.
  - Given: the filter panel is open
  - When: the user selects a Spell sub-type (e.g. Quick-Play) or a Trap sub-type (e.g. Counter)
  - Then: every returned card is a Spell/Trap of the selected sub-type

- [x] **Attribute filter (multi-select)**: Toggling one or more attribute chips narrows results to cards of those attributes.
  - Given: the filter panel is open
  - When: the user toggles one or more attribute chips (e.g. FIRE, WATER)
  - Then: every returned card has one of the selected attributes; toggling a chip off removes that constraint

- [x] **Level / Rank with comparator**: Setting a level/rank value and comparator narrows results accordingly.
  - Given: a monster category is in effect
  - When: the user sets Level/Rank with a comparator (e.g. >= 8)
  - Then: every returned card's level/rank satisfies the comparator relative to the value

- [x] **Pendulum Scale with comparator**: Setting a pendulum scale value and comparator narrows results to Pendulum monsters satisfying it.
  - Given: the filter panel is open
  - When: the user sets a Pendulum Scale value with a comparator
  - Then: every returned card is a Pendulum monster whose scale satisfies the comparator

- [x] **Race / Type filter**: Selecting a race/type narrows results to that race/type.
  - Given: the filter panel is open
  - When: the user selects a Race/Type from the dropdown
  - Then: every returned card matches the selected race/type

- [x] **Link Rating and Link Arrows**: Setting link rating and/or arrow directions narrows results to matching Link monsters.
  - Given: the filter panel is open
  - When: the user sets a Link Rating (with comparator) and/or toggles arrow directions
  - Then: every returned card is a Link monster whose rating and arrows satisfy the selected criteria

- [x] **Conditional sub-filter visibility**: Sub-filters relevant only to a card kind are shown/hidden based on the selected card kind.
  - Given: the filter panel is open
  - When: the user selects a card kind (Monster / Spell / Trap)
  - Then: only sub-filters relevant to that kind are shown (e.g. selecting Spell hides attribute/level/scale/link-arrow controls and shows the Spell sub-type control)

- [x] **Combine filters with text search**: Active filters and a text query both apply.
  - Given: a text query and one or more filters are active
  - When: the search runs
  - Then: every returned card matches the text query AND all active filters

- [x] **Filter-only search**: Filters work with an empty text box.
  - Given: the text box is empty and one or more filters are active
  - When: the search runs
  - Then: results are returned that match the active filters

- [x] **Clear filters**: A single action resets all filters.
  - Given: one or more filters are active
  - When: the user activates the Clear action
  - Then: all filter controls return to their default state, filter parameters are removed from the URL, and results revert to the text-only (or empty) state

- [x] **Filter state persists in URL**: Active filters are encoded in the URL and restored from it.
  - Given: the user has set filters (e.g. attribute=DARK, level>=8)
  - When: the search executes, then the URL is reloaded, shared, or navigated to via browser back/forward
  - Then: the URL query string contains the active filters (including comparators), and loading that URL reproduces the same filter UI state and the same filtered results

- [~] **Zero-results state**: A no-match filter combination shows an empty state.  *(PARTIAL: no crash and no stale results are guaranteed — single async writer sets `cards = { data: [] }`, `.catch` empty envelope — but no explicit "no cards found" message is rendered. Search.vue gates the results section on `hasSearchResults`, so an empty filtered result simply hides the grid and falls through to the trending/browse sections. The localized `search.filters.noResults` key exists in all 4 locales but is never referenced in any component.)*
  - Given: a filter combination that matches no cards
  - When: the search runs
  - Then: a clear "no cards found" / empty state is shown, with no crash and no stale previous results

### Non-Functional Requirements

- [x] **Performance**: A change to any filter triggers a debounced search (consistent with the existing ~300ms search debounce) rather than firing a request per keystroke/click, and the returned result set is capped to a sensible maximum.
- [x] **Compatibility**: The filter UI does not break the static (SSG) build or client-side hydration, and works for both guest and authenticated users.
- [x] **Localization**: All filter labels and option values are translated across the four supported locales (en, fr, de, it).
- [x] **Resilience**: An API or network failure during a filtered search leaves the panel usable and shows the no-results state rather than crashing.

### Definition of Done

- [~] All acceptance criteria pass — 17/18 PASS. Criterion 14 (zero-results state) is PARTIAL: no crash / no stale results is guaranteed, but no explicit "no cards found" empty message is rendered (the `search.filters.noResults` i18n key is defined in all 4 locales but never used in any component).
- [ ] Tests written and passing — no test files found for `deriveSearch`/`serialize`/`deserialize` or the panel; build passes but no automated tests were added.
- [ ] Documentation updated — not verified (no doc changes located).
- [ ] Code reviewed — not part of this verification pass.

---

## Implementation Steps

### Step 1: Extend `searchByFilters` in `frontend/src/api.js` [critical] [DONE]

**Description:** Widen the existing `searchByFilters` from `{ level, attribute, num }` to the full server-supported param set `{ fname, type, attribute, level, race, linkrating, num }`. This is the data foundation every later step depends on. The change is additive — existing `CardPage.vue` callers that pass only `{ level, attribute }` must keep working unchanged, so we keep the same export name and signature shape (single options object with defaults).

**Subtasks:**
- [x] Locate the current `searchByFilters` export in `frontend/src/api.js` and confirm the `API_URL` constant and `axios` import already in scope.
- [x] Replace the body to build a `URLSearchParams` from all seven params, only setting each key when present (`if (fname)`, `if (level != null)`, etc.).
- [x] Lowercase `attribute` before sending (`String(attribute).toLowerCase()`) per API contract; default `num = 20`.
- [x] Keep the `.catch(() => ({ data: { data: [] } }))` so a 400 (no-match) or network error resolves to an empty result set rather than rejecting.
- [x] Grep for all `searchByFilters(` call sites (notably `CardPage.vue` lines ~555/~565) and confirm each still passes an object that the new signature accepts.

**Expected Output:** `frontend/src/api.js` modified — one function rewritten, no new exports. `searchByFilters({ level: 8, attribute: 'LIGHT' })` and `searchByFilters({ fname: 'dark', type: 'Synchro Monster', num: 100 })` both produce a valid `cardinfo.php` request URL.

**Risks:** Sending an empty/blank param (e.g. `attribute: ''`) would over-constrain the query — mitigate with truthy/`!= null` guards so falsy values are omitted. `attribute` not lowercased causes silent zero-results — covered by explicit lowercase. Regression risk to `CardPage.vue` related-card widgets — mitigate by verifying call sites and keeping the signature additive.

#### Verification
- Calling with only `{ level, attribute }` yields the same URL shape as before this change (plus `num=20` default, which CardPage already tolerated or can be confirmed harmless).
- Calling with the full param set produces `cardinfo.php?fname=...&type=...&attribute=light&level=8&race=...&linkrating=...&num=...` with absent keys omitted.
- An API 400 / network error resolves (not rejects) to `{ data: { data: [] } }`.

---

### Step 2: Create `SearchFiltersPanel.vue` (controlled, display-only) [standard] [DONE]

**Description:** Build the new `frontend/src/components/Pages/search/SearchFiltersPanel.vue` as a fully controlled component exposing `v-model:filters`. It renders all controls (kind pills, monster category, spell/trap sub-type, attribute chips, level/rank + comparator, pendulum scale + comparator, race dropdown, link rating + comparator, link-arrow toggles, Clear-all) and emits `update:filters` on every change. It performs NO fetching and NO URL writes — App.vue owns all async and routing. Localized labels come from i18n keys (added in Step 4); use placeholder/raw keys here and they resolve once Step 4 lands.

**Subtasks:**
- [x] Scaffold the component with `<script setup>`, `defineProps({ filters: Object })` and `defineEmits(['update:filters'])`; treat `filters` as read-only and emit a merged copy on each change (do not mutate the prop).
- [x] Define the static option tables: `TYPE_GROUPS` (4 kind categories → API type strings), monster categories, spell sub-types, trap sub-types, `ATTRIBUTES`, comparators (`gte`/`eq`/`lte`), race lists, link-arrow directions.
- [x] Implement a collapse/expand toggle for the whole panel and an active-filter count badge.
- [x] Implement conditional visibility via computed `typeCategory` (any/monster/spell/trap): hide attribute/level/scale/link controls for spell/trap; show spell-subtype only for spell, trap-subtype only for trap; show link rating + arrows only for Link kind; show pendulum scale only when Pendulum category is active.
- [x] Implement attribute multi-select as toggle chips (OR semantics) writing a CSV/array into `filters.attribute`.
- [x] Implement level/rank, pendulum scale, and link rating as value + comparator pairs.
- [x] Implement Clear-all that emits a fully reset filters object.
- [x] Use the existing theme CSS variables (`var(--c-accent)`, `var(--c-surface-2)`, `var(--c-text)`) and ensure flex-wrap layout is mobile-responsive.

**Expected Output:** New file `frontend/src/components/Pages/search/SearchFiltersPanel.vue`. In isolation it renders controls, reflects the bound `filters` prop, and emits `update:filters` with a new object on every interaction. No network or router calls.

**Risks:** Mutating the prop directly breaks the controlled contract and creates a second writer — mitigate by always emitting a fresh merged object. Multi-attribute representation (array vs CSV) must match what App.vue serializes in Step 5 — agree on the in-memory shape (array) and serialize to CSV only at the URL boundary. Conditional-visibility logic clearing values silently can confuse users — when a kind change hides a control, also drop its now-irrelevant filter value in the emitted object so URL/results stay consistent.

#### Verification
- Binding a filters object renders the matching control states; clicking a control emits `update:filters` with the expected delta and does not mutate the input prop.
- Selecting Spell hides attribute/level/scale/link-arrow controls and shows the spell sub-type control; selecting Link shows link rating + arrow toggles.
- Clear-all emits a fully default filters object.
- Component imports cleanly with no router/axios usage (display-only).

---

### Step 3: Wire filter state into `App.vue` [critical] [DONE]

**Description:** Make App.vue the single async writer and source of truth for filtered search. Add `activeFilters` to `data()`, upgrade the stale guard from a query-string comparison to a monotonic `_searchSeq++` counter (so filter-only searches where `query === ''` are still guarded), derive `{ serverParams, clientPredicates }` from `{ searchQuery, activeFilters }`, fetch via the extended `searchByFilters`, apply client predicates, slice to the display cap, and assign `this.cards`. Pass `activeFilters` down through `RouterView` and accept `update:filters` from the child.

**Subtasks:**
- [x] Add `activeFilters: { /* default empty shape */ }` and `_searchSeq: 0` to `data()`; remove or supersede the old query-only stale variable.
- [x] In `_doSearch`, capture `const seq = ++this._searchSeq` before the await; after the await, bail if `seq !== this._searchSeq`.
- [x] Implement a `deriveSearch({ searchQuery, activeFilters })` helper returning `serverParams` (fname/type/attribute-when-single/level-when-eq/race/linkrating, plus a raised `num` cap ~100 when any client predicate is active) and `clientPredicates` (comparators for level/scale/link rating, pendulum scale, link-arrow directions, multi-attribute OR).
- [x] Call `await searchByFilters(serverParams)`, then `response.data.data.filter(applyAll(clientPredicates)).slice(0, cap)` and assign to `this.cards = { data: ... }`.
- [x] Ensure default state (no filters, no client predicates) reproduces the current name-search results exactly, including the existing setcode/id fallbacks — decide whether fallbacks run only in the no-filter path (recommended: keep fallbacks for pure name search; skip them when filters are active).
- [x] Pass `v-model:filters="activeFilters"` (or `:filters` + `@update:filters`) through `RouterView` to `Search.vue`; trigger the debounced `update()` when filters change.
- [x] Confirm the search path stays behind the existing client-only guard (`typeof document`) so SSG/hydration is unaffected.

**Expected Output:** `frontend/src/views/App.vue` modified. Editing text or any filter runs the 300ms-debounced pipeline; results satisfy text AND filters; filter-only search works; stale responses are dropped by `_searchSeq`. `cards` remains the only async-written result object.

**Risks:** Race conditions if the stale guard still keys on query string — mitigated by `_searchSeq`. Mixing Options API (`data()`) with the panel's Composition style is fine but the derive/predicate helpers should be plain functions to stay testable. Raising `num` only sometimes can drop matches when a client predicate is active but `num` wasn't raised — ensure the raise triggers whenever ANY client predicate exists. Fallback search (setcode/id) firing during a filtered search could return off-target cards — gate fallbacks to the pure-name path.

#### Verification
- Text-only search (no filters) returns identical results to current behavior, including setcode/id fallbacks.
- Category=Synchro + attribute=LIGHT returns only LIGHT Synchro monsters; empty text box with Trap sub-type=Counter returns Counter Traps.
- A comparator filter (level >= 8) returns only cards satisfying it, and the result count is not silently truncated below the cap due to a too-low `num`.
- Rapidly changing filters never leaves a stale result set displayed (verified via `_searchSeq` bail).
- A filter combo matching nothing shows the empty state with no crash and no stale results.

---

### Step 4: Add i18n keys to all four locales [standard] [DONE]

**Description:** Add the additive `search.filters.*` key tree to `en.json`, `fr.json`, `de.json`, `it.json`. Card names and enum values (EARTH–DIVINE) stay English/uppercase per API behavior; everything else (panel title, toggle, clear, active count, no-results, kind/category/sub-type/comparator/group labels) is localized.

**Subtasks:**
- [x] In `frontend/src/locales/en.json`, add `search.filters.{title,toggle,clear,activeCount,noResults}`, `.kind.{monster,spell,trap,any}`, `.category.{normal,effect,ritual,fusion,synchro,xyz,pendulum,link,tuner,flip,toon,spirit,union,gemini,token}`, `.spellType.{normal,continuous,field,equip,quickplay,ritual}`, `.trapType.{normal,continuous,counter}`, `.attribute.label`, `.level.label`, `.rank.label`, `.comparator.{gte,eq,lte}`, `.scale.label`, `.race.label`, `.linkRating.label`, `.linkArrows.label`.
- [x] Mirror the identical key structure into `fr.json`, `de.json`, `it.json` with translated values.
- [x] Keep attribute enum values untranslated (the `.attribute.label` is the group heading, not the chip values).
- [x] Confirm `SearchFiltersPanel.vue` references match these exact key paths.
- [x] Validate all four JSON files parse (no trailing commas / duplicate keys).

**Expected Output:** Four locale files modified with a parallel `search.filters` subtree. No missing-key warnings when the panel renders in any locale.

**Risks:** Key drift between locales (a key present in en but missing in others) shows raw key strings — mitigate by adding the same key set to all four in one pass and diffing the key paths. JSON syntax errors break the whole bundle — validate parse after edit.

#### Verification
- All four files are valid JSON and share an identical set of `search.filters.*` key paths.
- Rendering the panel under each locale shows translated labels with no raw-key fallbacks.
- Attribute chip values remain uppercase English in all locales.

---

### Step 5: URL query param persistence [critical] [DONE]

**Description:** Encode active filters into the `search` route query using the short-key schema (`k,t,a,lv,lvc,ps,psc,r,lr,lrc,la`) alongside the existing `q`, and restore them on load / share / back-forward. App.vue writes the query via `router.replace` after each search and watches `$route.query` (deep) to deserialize into `searchQuery` + `activeFilters`, guarding against the echo of its own replace.

**Subtasks:**
- [x] Implement `serialize(searchQuery, activeFilters)` → query object using the short keys; omit absent/default values; CSV-join attribute and link-arrow arrays; emit comparator keys (`lvc/psc/lrc`) only when their value is set.
- [x] Implement `deserialize(query)` → `{ searchQuery, activeFilters }`, parsing CSVs back to arrays and numbers back to numbers, defaulting missing keys to inactive.
- [x] In `_doSearch`, after assigning `cards`, call `router.replace({ name: 'search', query: serialize(...) })`.
- [x] Add/extend the `watch('$route.query', { deep: true })` handler to deserialize and re-run the debounced `update()`; add an echo guard (e.g. compare incoming query to the last one this component wrote, or a boolean flag) so the self-triggered `replace` does not cause an infinite loop or redundant fetch.
- [x] On `mounted`, hydrate `searchQuery` + `activeFilters` from `route.query` before the first `_doSearch`, so a deep-linked filtered URL reproduces UI state and results.
- [x] Ensure `clearFilters` strips all filter keys but preserves `q`.

**Expected Output:** `frontend/src/views/App.vue` finalized. Setting filters updates the URL with short keys; reloading or sharing the URL reproduces the same panel state and the same filtered results; browser back/forward restores prior states without loops.

**Risks:** Echo loop between `router.replace` and the `$route.query` watcher is the highest risk — mitigate with an explicit echo guard and using `replace` (not `push`) to avoid history spam. Type coercion bugs (string `"8"` vs number `8`, comparator tokens) cause restored state to mismatch — centralize parsing in `deserialize`. Multi-value CSV round-trip must match the in-memory array shape agreed in Step 2. SSG: hydration reads `route.query` on mount only, so static build is unaffected — confirm no query access during SSR render.

#### Verification
- Setting attribute=DARK and level>=8 produces `?a=dark&lv=8&lvc=gte` (plus `q` if text present); reloading that URL restores the exact panel state and results.
- Browser back/forward steps through prior filter states with no infinite replace loop and no duplicate fetch storm.
- Clear-all removes every filter key from the URL while keeping `q`.
- A deep-linked filtered URL with an empty text box reproduces a correct filter-only result set on first load.

---

## Execution Plan

The five implementation steps resolve into three execution waves. Steps within the same wave have no dependencies on one another and can be executed in parallel; each wave must complete before the next begins.

### Wave 1 — Foundation (sequential, blocks everything)

Run alone first. Every other step consumes the extended API contract this step establishes.

- **Step 1 — Extend `searchByFilters` in `frontend/src/api.js`** [critical]
  - The full server-supported param set (`fname, type, attribute, level, race, linkrating, num`) is the data foundation for the search pipeline, the panel's option-to-param mapping, and URL round-tripping.

### Wave 2 — Parallel build (3 steps in parallel, after Wave 1)

These three steps touch disjoint files and share no runtime dependency on each other — they only depend on Step 1. Run all three concurrently.

- **Step 2 — Create `SearchFiltersPanel.vue`** [standard] — `frontend/src/components/Pages/search/SearchFiltersPanel.vue`
- **Step 3 — Wire filter state into `App.vue`** [critical] — `frontend/src/views/App.vue`
- **Step 4 — Add i18n keys to all four locales** [standard] — `frontend/src/locales/{en,fr,de,it}.json`

> Coordination note: Steps 2 and 5 must agree on the in-memory filter shape (attribute and link-arrow as **arrays**, serialized to CSV only at the URL boundary). Agree on this shape before Wave 2 starts so Step 2 and Step 5 stay compatible. Step 2 may reference the i18n key paths produced by Step 4 — labels resolve once Step 4 lands; missing keys render as raw key strings until then, which does not block the build.

### Wave 3 — Integration (after Wave 2)

Depends on the completed `App.vue` async pipeline (Step 3) and the localized panel controls (Steps 2 and 4) being in place so URL state can be round-tripped through real filter controls and labels.

- **Step 5 — URL query param persistence** [critical] — finalizes `frontend/src/views/App.vue`
  - Builds on Step 3's `_doSearch` / `_searchSeq` pipeline and `RouterView` wiring (adds `router.replace` + `$route.query` watcher + mount hydration), and on Step 2's filter shape and Step 4's keys so deep-linked URLs reproduce panel state and results.

### Critical Path

Step 1 → (Step 3) → Step 5. Steps 2 and 4 run alongside Step 3 in Wave 2 and are not on the longest dependency chain, but both must land before Step 5 completes its verification (panel render + localized round-trip).

---

## Dependencies

Explicit per-step dependency list. "Depends on" means the named step(s) must be complete before this step can be executed and verified.

| Step | Title | Depends on | Wave | Parallelizable with |
|---|---|---|---|---|
| 1 | Extend `searchByFilters` in `api.js` | — (none) | 1 | — (runs alone) |
| 2 | Create `SearchFiltersPanel.vue` | Step 1 | 2 | Steps 3, 4 |
| 3 | Wire filter state into `App.vue` | Step 1 | 2 | Steps 2, 4 |
| 4 | Add i18n keys to all four locales | Step 1 | 2 | Steps 2, 3 |
| 5 | URL query param persistence | Steps 3, 4 (+ Step 2 for shape/render) | 3 | — (runs alone) |

**Notes:**
- **Step 1** is the sole Wave 1 step; it has no dependencies and unblocks all others.
- **Steps 2, 3, 4** each depend only on Step 1 and are mutually independent (disjoint files: panel component, `App.vue`, locale JSONs), so they form Wave 2 and run in parallel.
- **Step 5** depends on **Step 3** (the `App.vue` async pipeline, `_searchSeq` guard, and `RouterView` wiring it extends) and on **Step 4** (localized labels) for its verification, plus a soft dependency on **Step 2** for the agreed filter shape and panel render used to confirm URL round-tripping. It is the sole Wave 3 step.

---

## Verification Rubrics

These rubrics are for an LLM-as-Judge agent evaluating the implementation of each `critical` step. The judge should read the actual changed source (not the task description) and score each criterion. Each criterion is **PASS / FAIL / PARTIAL** with a one-line evidence note citing the file and line. A step **passes** only if every MUST criterion passes; SHOULD criteria affect quality score but not pass/fail.

### Scoring legend

- **MUST** — a correctness or contract requirement; any FAIL fails the step.
- **SHOULD** — a quality/robustness expectation; FAIL lowers the quality score (0–5) but does not by itself fail the step.
- The judge must quote the exact code (file path + line range) that satisfies or violates each criterion. "Looks fine" without a citation is not acceptable evidence. If the relevant code cannot be found, the criterion is FAIL, not PARTIAL.

---

### Step 1 Rubric — Extend `searchByFilters` in `frontend/src/api.js` [critical]

Evaluate the rewritten `searchByFilters` export. Read the actual function body in `frontend/src/api.js` and all call sites found via grep for `searchByFilters(`.

**MUST-1 — Full param set accepted.** The function signature destructures all seven params: `fname`, `type`, `attribute`, `level`, `race`, `linkrating`, `num`, from a single options object with a default (`= {}`) so a no-arg call does not throw.
- PASS evidence: signature line shows all seven names plus `= {}` default.
- FAIL if any of the seven is missing, or if the function takes positional args instead of an options object.

**MUST-2 — Null/undefined/empty params omitted from URL.** Each param is conditionally added to `URLSearchParams`. String params (`fname`, `type`, `attribute`, `race`) are guarded by truthiness (so `''` is omitted, not sent as an empty value). Numeric params (`level`, `linkrating`) are guarded by `!= null` (so a legitimate `0` would pass, but `undefined`/`null` is omitted). `num` is guarded by `!= null`.
- PASS evidence: cite each guard, e.g. `if (fname)`, `if (level != null)`.
- FAIL if any param is unconditionally set, or if a falsy string can produce `?attribute=` with an empty value, or if a numeric guard uses truthiness (`if (level)`) such that `level=0` is silently dropped where the API would accept it. (Note: level 0 is not valid in this domain, so a truthiness guard on `level` is PARTIAL, not FAIL — but `!= null` is the specified and preferred form.)

**MUST-3 — `attribute` lowercased.** `attribute` is lowercased before being sent (`String(attribute).toLowerCase()` or `attribute.toLowerCase()`), per the API contract. The in-memory/displayed value may be uppercase, but the wire value MUST be lowercase.
- PASS evidence: cite the `.toLowerCase()` call on the attribute path.
- FAIL if `attribute` is sent as-is (uppercase reaches the API → silent zero-results).

**MUST-4 — Failure resolves, not rejects.** The axios call is followed by `.catch(() => ({ data: { data: [] } }))` (or equivalent) so an HTTP 400 (no-match) or network error resolves to an empty result envelope shaped `{ data: { data: [] } }` rather than rejecting the promise.
- PASS evidence: cite the `.catch` returning the empty envelope with the exact nested shape.
- FAIL if there is no catch, or the catch returns a differently-shaped object that would break `response.data.data` consumers.

**MUST-5 — Backward compatible with existing callers.** Every existing call site (notably `CardPage.vue`, reportedly ~lines 555/565) passes an options object that the new signature accepts and still produces a valid request. The judge MUST open each grep hit and confirm the passed object's keys are a subset of the seven accepted keys.
- PASS evidence: list each call site file:line and the object it passes, confirming compatibility.
- FAIL if any existing caller passes positional args, or a key the new function ignores in a way that changes the previous request semantics.

**SHOULD-1 — `num` default and raise behavior.** `num` defaults to a sensible base (the task specifies 40 as the display cap intent, though the skill/spec snippets show 20 — accept either documented default, but flag the discrepancy). The judge confirms that when client-side predicates are active the *caller* (App.vue, Step 3) raises `num` to ~100; `searchByFilters` itself only needs to pass through whatever `num` it receives. The judge MUST note which default value is actually in the code and whether it matches the spec the implementer chose.
- PASS evidence: cite the `num = <N>` default and confirm `num` is passed through untouched.
- PARTIAL if the default differs from the chosen spec value without justification.

**SHOULD-2 — Single function, no new export.** The change is additive: same export name `searchByFilters`, no duplicate/parallel export introduced.
- FAIL→SHOULD: a new export name would be a quality issue (spec said additive, lowest risk), not a hard correctness break.

**Step 1 verdict:** PASS only if MUST-1..5 all pass. Record a quality score 0–5 reflecting the SHOULD criteria and code clarity.

---

### Step 3 Rubric — Wire filter state into `App.vue` [critical]

Evaluate `frontend/src/views/App.vue`. Read `data()`, the search/debounce pipeline (`update`, `_doSearch`), the derive helper, and the `RouterView` template binding.

**MUST-1 — `activeFilters` in `data()`.** `data()` returns an `activeFilters` object containing every filter key used by the panel and serializer: at minimum the kind/category (`type`), `attribute` (array shape), `level` + level comparator, pendulum scale + comparator, `race`, `linkrating` + comparator, and link arrows (array shape). Defaults represent the inactive state.
- PASS evidence: cite the `activeFilters` default object and confirm key coverage against the URL schema table (`k,t,a,lv,lvc,ps,psc,r,lr,lrc,la`).
- FAIL if `activeFilters` is missing, or omits keys that the serializer (Step 5) or panel (Step 2) relies on, or stores `attribute`/arrows as CSV strings instead of arrays (the agreed in-memory shape is arrays).

**MUST-2 — `_searchSeq` monotonic stale guard implemented correctly.** A `_searchSeq` counter exists in `data()` (or instance state) initialized to 0. Inside `_doSearch`, `const seq = ++this._searchSeq` is captured **before** the `await`, and **after** the await the function bails (returns without writing `this.cards`) when `seq !== this._searchSeq`. The old query-string-only stale check is removed or superseded (it cannot guard filter-only searches where `query === ''`).
- PASS evidence: cite the increment-before-await line and the `seq !== this._searchSeq` bail-after-await line.
- FAIL if the increment happens after the await, if the bail is missing, if the comparison is against the query string instead of the seq, or if a stale response can still overwrite `this.cards`.

**MUST-3 — `deriveSearch` separates server params from client predicates.** A helper (e.g. `deriveSearch({ searchQuery, activeFilters })`) returns a `serverParams` object (the API-expressible subset: `fname`, `type`, single `attribute`, `level` only when comparator is `eq`, `race`, `linkrating`, plus a raised `num`) and a `clientPredicates` collection (comparator level/scale/linkrating, pendulum scale, link-arrow directions, multi-attribute OR). The split MUST be correct: dimensions the API cannot express (comparators ≠ eq, pendulum scale, arrows, multi-attribute OR) MUST appear as client predicates, not server params.
- PASS evidence: cite the derive helper and confirm each dimension lands on the correct side.
- FAIL if a comparator like `>=8` is sent as `level=8` server-side (wrong results), or if pendulum scale / link arrows are passed as server params (API ignores or errors), or if multi-attribute is sent as a single server `attribute` (drops OR matches).

**MUST-4 — `num` raised when any client predicate active.** When `clientPredicates` is non-empty, `serverParams.num` is raised to ~100 (or the documented raised cap) so post-filtering does not silently truncate matches below the display cap. The raise MUST trigger whenever ANY client predicate exists, not only for specific ones.
- PASS evidence: cite the conditional that raises `num` keyed on predicate presence.
- FAIL if `num` stays at the base cap while client predicates are active, or the raise is gated on only one predicate type.

**MUST-5 — Single async writer to `this.cards`.** `_doSearch` is the only place that assigns `this.cards` from an async result. The assignment applies the client predicates and slices to the display cap: `this.cards = { data: response.data.data.filter(applyAll(clientPredicates)).slice(0, cap) }`. No other method, watcher, or child component writes `this.cards` from a fetch. (Synchronous resets like clearing are acceptable but should also route through the single writer or be clearly non-async.)
- PASS evidence: cite the single assignment site; confirm via grep that no other async path writes `this.cards`.
- FAIL if a second async writer exists (e.g. Search.vue or the route watcher fetching and assigning), or if filter/slice is missing so client predicates aren't applied or the cap isn't enforced.

**MUST-6 — Panel wired via `v-model:filters` and triggers debounced search.** `RouterView` passes `v-model:filters="activeFilters"` (or `:filters` + `@update:filters`) down to `Search.vue`/the panel, and a change to `activeFilters` triggers the existing 300ms-debounced `update()` (not an immediate per-click fetch).
- PASS evidence: cite the `RouterView` binding and the watcher/handler that calls the debounced `update()` on filter change.
- FAIL if filters are passed read-only with no update channel, if the update channel mutates the child prop, or if filter changes bypass the debounce and fire a request per click.

**SHOULD-1 — Fallbacks gated to pure-name path.** The existing setcode/id fallback search runs only when no filters/client predicates are active (pure name search); it is skipped when filters are active so off-target cards are not mixed into a filtered result set.
- PARTIAL/FAIL→SHOULD: cite where fallbacks are gated; flag if fallbacks can fire during a filtered search.

**SHOULD-2 — Default state byte-for-byte unchanged.** With `activeFilters` at defaults and empty client predicates, the derived `serverParams` and result handling reproduce the current name-search behavior (same params, same fallbacks, same cap).
- Evidence: reason about the no-filter path and confirm no behavioral drift.

**SHOULD-3 — Derive/predicate helpers are plain testable functions.** `deriveSearch` and the predicate builders are plain functions (not buried in component method closures depending on `this`), so they are unit-testable.

**SHOULD-4 — Client-only guard preserved.** The search path stays behind the existing `typeof document` (or equivalent) client-only guard so SSG/hydration is unaffected.

**Step 3 verdict:** PASS only if MUST-1..6 all pass. Record quality score 0–5 from the SHOULD criteria.

---

### Step 5 Rubric — URL query param persistence in `App.vue` [critical]

Evaluate the `serialize`/`deserialize` helpers, the `router.replace` call, the `$route.query` watcher, and the `mounted` hydration in `frontend/src/views/App.vue`.

**MUST-1 — Short keys used per schema.** Serialization uses exactly the short keys from the URL schema: `q` (existing), `k`, `t`, `a`, `lv`, `lvc`, `ps`, `psc`, `r`, `lr`, `lrc`, `la`. (The prompt lists `k,t,a,lv,lvc,r,lr,lrc,la`; the spec table also includes `ps`/`psc` for pendulum scale — both pendulum keys MUST be present if pendulum scale is implemented.) No long/verbose keys (`type`, `attribute`, `linkrating`) leak into the URL.
- PASS evidence: cite the serialize key map; confirm against the schema table.
- FAIL if any key differs from the schema, or verbose keys are emitted, or a comparator value is written without its short key.

**MUST-2 — Lossless serialize/deserialize roundtrip.** `deserialize(serialize(q, filters))` reproduces the original `searchQuery` + `activeFilters` for representative states: empty, text-only, single attribute, multi-attribute (CSV split back to array), level+comparator, pendulum scale+comparator, race, link rating+comparator, link arrows (CSV→array). Types are coerced correctly: numbers parsed via `Number(...)`, comparator tokens (`gte`/`eq`/`lte`) preserved as strings, arrays reconstructed from CSV. Absent keys deserialize to the inactive default.
- PASS evidence: trace at least the multi-attribute and level+comparator cases through both functions, confirming string `"8"`→number `8` and CSV `"light,dark"`→`['light','dark']`.
- FAIL if any field round-trips to a different type/shape (e.g. `level` stays a string and later mismatches the server `eq` comparison, or attribute stays CSV and breaks the panel's array contract), or if a default-valued filter is serialized (should be omitted) and reappears as active.

**MUST-3 — `router.replace` (not push) after search.** After assigning `cards` in `_doSearch`, the URL is updated with `router.replace({ name: 'search', query: serialize(...) })`. It MUST be `replace`, not `push` (push would spam browser history on every keystroke/filter change).
- PASS evidence: cite the `router.replace` call and confirm it is `replace`.
- FAIL if `push` is used, or if the query is written before `cards` is assigned in a way that can desync URL from results.

**MUST-4 — Echo guard prevents re-search on own write.** The `$route.query` deep watcher deserializes and re-runs the debounced search for *external* navigation (reload, share, back/forward), but does NOT re-trigger a fetch in response to the component's own `router.replace`. There is an explicit echo guard: a flag set before the self-`replace` and checked/cleared in the watcher, or a comparison of the incoming query against the last query this component wrote.
- PASS evidence: cite the guard mechanism (flag set/clear pair, or last-written-query comparison) and the watcher branch that skips on echo.
- FAIL if there is no echo guard (infinite `replace`↔watcher loop or a redundant double-fetch on every search), or the guard is a fragile timing hack with no clear set/clear pairing.

**MUST-5 — Back/forward restores state without double-fetch.** Browser back/forward changes `$route.query`; the watcher deserializes into `searchQuery` + `activeFilters` and runs the search exactly once per navigation (not twice — once from the watcher and again from a cascading filter-change watcher). The restored panel state matches the URL.
- PASS evidence: reason through the back/forward path: query change → deserialize → single `update()` → single fetch; confirm no second fetch is triggered by the `activeFilters` mutation that the deserialize performs (i.e. the same echo/guard or a coalescing debounce prevents the duplicate).
- FAIL if back/forward fires two fetches (deserialize writes `activeFilters` which itself triggers `update()`, plus the watcher also calls `update()`), or if restored state is partial/incorrect.

**MUST-6 — Mount hydration before first search.** On `mounted`, `searchQuery` + `activeFilters` are hydrated from `route.query` (via `deserialize`) before the first `_doSearch`, so a deep-linked filtered URL reproduces both the panel UI state and the filtered results on first load — including the filter-only case (empty `q`, filters present).
- PASS evidence: cite the mounted hydration and confirm it precedes the initial search.
- FAIL if hydration happens after the first fetch (first results would be unfiltered/wrong), or if a filter-only deep link yields no/incorrect results on first load.

**MUST-7 — Clear-all strips filter keys, preserves `q`.** `clearFilters` resets `activeFilters` to defaults and results in a URL containing at most `q`; every filter short key is removed.
- PASS evidence: cite clearFilters and confirm the resulting serialized query omits all filter keys.
- FAIL if any filter key persists in the URL after clear, or if `q` is dropped.

**SHOULD-1 — No query access during SSR render.** `route.query` is read only on mount / client-side (behind the client-only guard), not during SSR render, so the static build is unaffected.
- Evidence: confirm no top-level/`setup`-time query read that would run under SSG.

**SHOULD-2 — Centralized parsing.** Type coercion lives in `deserialize` (single source), not scattered across watchers, reducing coercion-bug surface.

**Step 5 verdict:** PASS only if MUST-1..7 all pass. Record quality score 0–5 from the SHOULD criteria.

---

### Definition of Done — Acceptance Criteria Verification

A final judge pass verifying all 13 functional acceptance criteria from the Acceptance Criteria section. For each, the judge should exercise the running app (or trace the code path end-to-end if running is not possible) and record PASS/FAIL with concrete evidence (observed result set, URL string, or cited code path). DoD passes only if all 13 functional criteria PASS and the four non-functional criteria are satisfied.

**Functional (13):**

1. **Filter panel visibility** — A filter affordance is present on the search page; toggling it expands/collapses the controls. With no filters set, search behaves exactly as before. *Evidence:* observe the toggle expand/collapse and confirm no-filter results match baseline.
2. **Monster category filter** — Selecting a category (e.g. Synchro) returns only monsters of that category. *Evidence:* every returned card's `type` belongs to the selected category group.
3. **Spell / Trap sub-type filters** — Selecting a Spell sub-type (e.g. Quick-Play) or Trap sub-type (e.g. Counter) returns only Spells/Traps of that sub-type. *Evidence:* every result is a Spell/Trap with matching `race` property.
4. **Attribute filter (multi-select)** — Toggling one or more attribute chips returns only cards with one of the selected attributes (OR); toggling off removes the constraint. *Evidence:* result attributes ⊆ selected set; verify OR with two chips.
5. **Level / Rank with comparator** — Setting level/rank + comparator (e.g. ≥8) returns only cards whose level/rank satisfies it. *Evidence:* every result's level satisfies the comparator; confirm `>=`, `=`, `<=` each work.
6. **Pendulum Scale with comparator** — Setting scale + comparator returns only Pendulum monsters whose scale satisfies it. *Evidence:* every result is Pendulum and `scale` satisfies the comparator (client-side predicate, since API cannot express it).
7. **Race / Type filter** — Selecting a race/type returns only cards of that race/type. *Evidence:* every result matches the selected race.
8. **Link Rating and Link Arrows** — Setting link rating (+comparator) and/or arrow directions returns only Link monsters matching. *Evidence:* every result is a Link monster; rating satisfies comparator; `linkmarkers` include the selected arrows (client-side).
9. **Conditional sub-filter visibility** — Selecting a kind shows only relevant sub-filters (e.g. Spell hides attribute/level/scale/link-arrows, shows Spell sub-type). *Evidence:* observe control visibility per kind.
10. **Combine filters with text** — A text query + filters returns only cards matching text AND all filters. *Evidence:* results satisfy both `fname` and every active filter.
11. **Filter-only search** — Empty text box + active filters returns matching cards. *Evidence:* with `q` empty, filtered results are returned (confirms the `_searchSeq` guard covers `query === ''`).
12. **Clear filters** — One action resets all controls, removes filter params from the URL, and reverts results to text-only/empty. *Evidence:* post-clear URL has at most `q`; results revert.
13. **Filter state persists in URL** — Active filters (with comparators) are encoded in the URL; reload/share/back-forward reproduces the same UI state and the same filtered results. *Evidence:* set attribute=DARK & level≥8 → URL contains `a=dark&lv=8&lvc=gte`; reload reproduces state and results.
14. **Zero-results state** — A no-match combination shows a clear empty state, no crash, no stale results. *Evidence:* observe empty state; confirm previous results are cleared (single async writer + `.catch` empty envelope).

**Non-functional (4):**

- **Performance** — Filter changes go through the ~300ms debounce (not per-click requests); result set capped to the display max. *Evidence:* observe a single debounced request after rapid changes; confirm `.slice(0, cap)`.
- **Compatibility** — SSG build succeeds and client hydration does not error with the panel present; works for guest and authenticated users. *Evidence:* build passes; search path behind client-only guard; no auth coupling in filter logic.
- **Localization** — All filter labels/options are translated in en, fr, de, it with identical key paths; attribute enum values remain uppercase English. *Evidence:* all four locale files share the same `search.filters.*` key set; panel renders no raw-key fallbacks.
- **Resilience** — An API/network failure during a filtered search leaves the panel usable and shows the no-results state. *Evidence:* the `.catch(() => ({ data: { data: [] } }))` path drives the empty state without crashing.

**DoD verdict:** PASS only if all 14 functional checks (criteria 1–13, with the zero-results criterion enumerated as item 14 above) and all four non-functional checks PASS. Any FAIL blocks Done. The judge MUST cite, for each criterion, either an observed runtime result or the exact code path that guarantees it.
