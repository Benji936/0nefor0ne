# CardPage — Enriched Card Information

## Type
`feature`

## Description

The CardPage already shows the card image, name, stats, effect text, card sets/printings, archetype cards, matching cards, and traders. Several collector-relevant gaps remain: inline price data is not displayed (despite being available in the API response), the printings list is not collapsible on mobile, the archetype-null fallback section has no contextual label, and the "matching cards" criteria parser silently fails for non-English locales.

The goal is to surface price data, improve mobile usability of the printings section, and fix the locale bug in related-card discovery — without adding new API dependencies or changing the overall page layout.

## Scope Clarification

The following are **already implemented** and must not be re-built:
- Card sets / printings table (set_code, set_name, set_rarity, Cardmarket link)
- Archetype cards horizontal carousel with skeleton loading
- Matching cards (Level + Attribute) horizontal carousel with skeleton loading
- Traders section with kind badges
- Add to Trade / Add to Wishlist actions

## Acceptance Criteria

### Prices
- [ ] When `card.card_prices` is present, display at least one non-zero price near the existing market links (TCGPlayer and/or Cardmarket price preferred)
- [ ] Prices that are "0.00" or missing are shown as "—" rather than "$0.00" or "€0.00"
- [ ] Price display is locale-aware for currency symbol (USD for TCGPlayer, EUR for Cardmarket)
- [ ] Prices do not cause layout reflow — shown as part of the existing market links row or as a compact badge

### Card Sets — Mobile Collapse
- [ ] On mobile (viewport < sm breakpoint), the printings list defaults to showing only the first 5 entries collapsed
- [ ] A "Show all X printings" toggle expands to the full scrollable list
- [ ] On desktop (sm and above), the current 180px scrollable behavior is preserved unchanged
- [ ] The collapse state resets when navigating to a different card

### Archetype Null — Fallback Label
- [ ] When `card.archetype` is null AND the matching-cards section is visible, the matching-cards section header clearly states the criteria (e.g. "Similar Level 4 LIGHT Monsters") rather than generic "Matching Cards"
- [ ] When `card.archetype` is null AND the matching-cards section has no results (Spell/Trap with no criteria match), no placeholder label or empty section is rendered
- [ ] When `card.archetype` is non-null, the archetype section header continues to show the archetype name as before

### Localization Fix — Matching Cards Criteria Parser
- [ ] `parseSearchCriteria` must work regardless of the card's display locale
- [ ] Fix: derive criteria from the card's English name/desc (use `card.level` and `card.attribute` fields directly from the API response instead of regex-parsing `card.desc`)
- [ ] After fix: matching-cards section appears correctly for DE, FR, and IT locale users on eligible cards
- [ ] Remove the `parseSearchCriteria` regex approach entirely; replace with direct field access (`card.level`, `card.attribute`) guarded by card type (only for Monster cards)

### General
- [ ] No new external API calls beyond what is already fetched (`searchById` already returns `card_prices`)
- [ ] All new UI elements respect existing CSS variables (`--c-text`, `--c-muted`, `--c-border`, `--c-surface-2`, etc.)
- [ ] Mobile layout produces no horizontal overflow after changes
- [ ] Page does not flash or reflow on first load (prices shown only after card data resolves)

## Edge Cases

| Scenario | Expected Behavior |
|---|---|
| All prices are "0.00" | Price row hidden entirely (no empty badges) |
| Card has 0 printings | Printings section hidden (already works, no change) |
| Card has ≤ 5 printings on mobile | No collapse toggle shown; full list visible |
| Card is a Spell/Trap with no archetype | Matching-cards section hidden (no criteria from level/attribute) |
| Card is a Monster with no archetype | Matching-cards section shows using card.level + card.attribute fields |
| `card.attribute` is null on a Monster | Matching-cards section uses level only if present |
| Archetype API returns 0 cards | Archetype section disappears after skeleton (current behavior, no change) |
| Non-English locale | Criteria parsed from API fields, not desc text — section shows correctly |

## Dependencies

- `card.card_prices` — already in `searchById` API response (ygoprodeck), no new call needed
- `card.level`, `card.attribute` — already in API response, replace desc regex parsing
- `card.card_sets` — already in API response and rendered
- Related cards API calls: `searchByArchetype` and `searchByFilters` — already wired up

## Skill

Research, implementation patterns, and codebase analysis: `.claude/skills/cardpage-enrichment/SKILL.md`

---

## Architecture Overview

### Solution Strategy

#### Gap 1 — Prices (lines 447–454 computed, 64–77 template)

Add a `prices` computed property that reads `card.card_prices?.[0]` and extracts `tcgplayer_price` (USD) and `cardmarket_price` (EUR). Values of `"0.00"`, `""`, or `null` are normalized to `null`; the computed returns `null` when both sources are absent (enabling a clean `v-if` guard). Render as compact text badges in a sibling `<div>` immediately after the existing market-links row, sharing `flex flex-wrap gap-2 text-xs` so the parent layout is never disturbed. The price row is hidden entirely when both prices are absent — no empty whitespace on first load.

**Currency symbols are hard-coded per source** (TCGPlayer → USD, Cardmarket → EUR) rather than derived from the active locale. This is correct by product intent — these are fixed-currency marketplaces — and avoids a locale-lookup side-effect in the computed.

#### Gap 2 — Mobile Collapse for Printings (lines 98–123 template, 429–441 data, 472–481 load)

Use **two sibling divs** inside the printings container:
- `<div class="sm:hidden">` — mobile branch: renders `card.card_sets.slice(0, 5)` when `!printingsExpanded`, full list when `printingsExpanded`. Toggle button shown only when `card.card_sets.length > 5`.
- `<div class="hidden sm:block overflow-y-auto" style="max-height: 180px">` — desktop branch: exact copy of current behavior, fully isolated.

Add `printingsExpanded: false` to `data()` and reset it in `load()` alongside other resets. This is pure CSS + reactive boolean — no media-query JS or ResizeObserver needed. The desktop path has zero regression risk because it is entirely inside its own branch.

#### Gap 3 — Archetype-Null Fallback Label (lines 150–152 template, all 4 locale files)

Add a `matchingCardsLabel` computed that checks `card.archetype` and `searchCriteria`. When archetype is null and criteria contain both level and attribute, return an enriched i18n string (e.g. "Similar Level 4 LIGHT Monsters"). When only one criterion is present, return a partial variant. Fallback to the existing `cardPage.matchingCards` key. The section `v-if` guard already handles the null-archetype + no-results case correctly — no guard change needed. This is a purely additive heading change.

Three new i18n keys: `matchingCardsCriteria` (both level+attribute), `matchingCardsLevel` (level only), `matchingCardsAttribute` (attribute only). Card stat tokens (Level, LIGHT, etc.) are proper nouns kept in English across all locales.

#### Gap 4 — parseSearchCriteria Locale Bug (lines 505–515)

**Full method replacement.** The current implementation regex-parses `card.desc` which is returned in the user's locale, causing silent failures for DE/FR/IT users. The fix reads `card.level` (integer) and `card.attribute` (string) directly from the API response — both are always English regardless of locale param.

The new guard is `card.type.toLowerCase().includes('monster')` which correctly matches all Monster subtypes (Effect, Fusion, Synchro, Xyz, Link, Pendulum, etc.) and excludes Spell/Trap cards. The return threshold changes from `>= 2 keys` to `> 0 keys` — this is intentional: Link Monsters (no level) and monsters with only one classifying field now trigger the matching-cards section as required by the acceptance criteria.

---

### Key Decisions & Trade-offs

| Decision | Chosen | Rejected | Reason |
|---|---|---|---|
| Price display placement | Sibling `<div>` after market links | Inline in same row | Cleaner separation; avoids mixing `<a>` and text nodes in one flex container |
| Currency symbol source | Hard-coded per marketplace | Derived from active locale | Marketplaces have fixed currencies; locale-lookup adds complexity for no benefit |
| Mobile collapse mechanism | Tailwind `sm:hidden` / `hidden sm:block` branches | JS viewport detection | No JS overhead; zero desktop regression; purely declarative |
| `parseSearchCriteria` fix scope | Full replacement | Patch regex | Old method is fundamentally broken for non-English; replacement is simpler and correct |
| `matchingCardsLabel` location | Computed property | Inline template ternary | Computed is testable and keeps template readable |

---

### Files Changing

| File | Change Type | Lines Affected |
|---|---|---|
| `frontend/src/components/Pages/CardPage.vue` | Modify | computed: 447–454 (add `prices`); template: 64–77 (price badges), 98–123 (printings dual-branch), 150–152 (matching-cards heading); data: 429–441 (add `printingsExpanded`); load(): 472–481 (reset); method: 505–515 (replace `parseSearchCriteria`); computed: add `matchingCardsLabel` |
| `frontend/src/locales/en.json` | Modify | Add 6 keys under `cardPage`: `priceTcg`, `priceCm`, `showAllPrintings`, `showLess`, `matchingCardsCriteria`, `matchingCardsLevel`, `matchingCardsAttribute` |
| `frontend/src/locales/fr.json` | Modify | Same 6 keys |
| `frontend/src/locales/de.json` | Modify | Same 6 keys |
| `frontend/src/locales/it.json` | Modify | Same 6 keys |
| `frontend/src/api.js` | No change | `searchByFilters` already accepts `{ level, attribute }` partial params |

---

### Expected Before / After

| Area | Before | After |
|---|---|---|
| Prices | No price data visible anywhere on CardPage | Compact TCGPlayer (USD) and Cardmarket (EUR) badges below market links; hidden when all prices are "0.00" |
| Printings on mobile | Fixed 180px scroll on all viewports | First 5 entries shown; "Show all X printings" toggle expands to full list |
| Printings on desktop | 180px scroll container | Unchanged (isolated branch) |
| Archetype-null heading | "Can interact with" (generic) | "Similar Level 4 LIGHT Monsters" when both criteria present |
| Matching cards for DE/FR/IT | Section never renders (regex fails on translated desc) | Section renders correctly using locale-invariant API fields |

---

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| i18n key mismatch across locale files | Medium | Add all 6 keys to all 4 files in the same commit; fallback behavior in vue-i18n shows key name instead of crashing |
| Desktop printings scroll regression | Low | Desktop path is inside a completely isolated `hidden sm:block` branch — no shared logic |
| Price reflow on load | Low | Price badges are inside `v-else-if="card"` — only rendered after card data resolves, same as all other card content |
| `parseSearchCriteria` behavioral delta (one-criterion cards) | Low | Intentional per acceptance criteria; Link Monsters now correctly trigger matching-cards section |
| `card.card_prices` null on old/unofficial cards | Low | `?.` optional chaining on `card.card_prices?.[0]` guards against null; computed returns `null` and row is hidden |

---

## Implementation Process

### Implementation Summary

| Step | Gap | Goal | Files | Est. Time | Depends On |
|---|---|---|---|---|---|
| 1 | All | Add 7 new i18n keys to all 4 locale files | en.json, fr.json, de.json, it.json | 20–30 min | — |
| 2 | Gap 4 | Replace `parseSearchCriteria` with direct field access | CardPage.vue (method ~line 505) | 20–30 min | — |
| 3 | Gap 1 | Add `prices` computed + price badge template | CardPage.vue (computed + template ~line 77) | 30–45 min | Step 1 |
| 4 | Gap 2 | Mobile collapse for printings (dual-branch template + data + load reset) | CardPage.vue (template ~lines 98–123, data, load) | 30–45 min | Step 1 |
| 5 | Gap 3 | Add `matchingCardsLabel` computed + swap template heading | CardPage.vue (computed + template ~line 151) | 20–30 min | Steps 1, 2 |

### Step 1 — i18n Keys (All 4 Locale Files) [DONE]

**Goal:** Add all 7 new translation keys to `en.json`, `fr.json`, `de.json`, `it.json` before any template changes.

**Output:** `cardPage` section in each locale file gains 7 keys: `priceTcg`, `priceCm`, `showAllPrintings`, `showLess`, `matchingCardsCriteria`, `matchingCardsLevel`, `matchingCardsAttribute`.

**Success criteria:**
- vue-i18n resolves all 7 keys in all 4 locales with no console warnings
- Card stat tokens (Level, LIGHT, etc.) remain in English across all locales — they are proper nouns, not translated

**Subtasks:**
- `en.json` — add under `cardPage`: `"priceTcg": "TCGPlayer {price}"`, `"priceCm": "Cardmarket {price}"`, `"showAllPrintings": "Show all {count} printings"`, `"showLess": "Show less"`, `"matchingCardsCriteria": "Similar Level {level} {attribute} Monsters"`, `"matchingCardsLevel": "Similar Level {level} Monsters"`, `"matchingCardsAttribute": "Similar {attribute} Monsters"`
- `fr.json` — add same keys with French translations (`priceTcg`/`priceCm` are untranslated brand names; `showAllPrintings`: "Voir les {count} éditions"; `showLess`: "Réduire"; `matchingCardsCriteria`: "Monstres Niveau {level} {attribute}"; `matchingCardsLevel`: "Monstres Niveau {level}"; `matchingCardsAttribute`: "Monstres {attribute}")
- `de.json` — (`showAllPrintings`: "Alle {count} Drucke anzeigen"; `showLess`: "Weniger anzeigen"; `matchingCardsCriteria`: "Ähnliche Level-{level}-{attribute}-Monster"; `matchingCardsLevel`: "Ähnliche Level-{level}-Monster"; `matchingCardsAttribute`: "Ähnliche {attribute}-Monster")
- `it.json` — (`showAllPrintings`: "Mostra tutte le {count} edizioni"; `showLess`: "Mostra meno"; `matchingCardsCriteria`: "Mostri Livello {level} {attribute} simili"; `matchingCardsLevel`: "Mostri Livello {level} simili"; `matchingCardsAttribute`: "Mostri {attribute} simili")

**Blockers/Dependencies:** None.

**Risks:** Translation quality — acceptable for a collector tool; vue-i18n shows the key name as fallback (no crash).

#### Verification — Step 1

**Level:** MEDIUM — Single Judge | **Threshold:** 3.5 / 5.0

**Artifact:** `cardPage` section in `frontend/src/locales/en.json`, `fr.json`, `de.json`, `it.json`

**Rubric:**

| Criterion | Weight |
|---|---|
| All 7 keys present in every one of the 4 locale files | 0.35 |
| Key names match spec exactly (`priceTcg`, `priceCm`, `showAllPrintings`, `showLess`, `matchingCardsCriteria`, `matchingCardsLevel`, `matchingCardsAttribute`) | 0.25 |
| Named parameter tokens correct (`{price}`, `{count}`, `{level}`, `{attribute}`) in every value string | 0.20 |
| Card-stat tokens (`Level`, `LIGHT`, etc.) remain English across all non-EN locale files | 0.10 |
| All 4 JSON files remain syntactically valid (no trailing commas, no broken strings) | 0.10 |

---

### Step 2 — Gap 4: Replace `parseSearchCriteria` [DONE]

**Goal:** Eliminate the locale-dependent regex and replace with direct `card.level` / `card.attribute` field access.

**Output:** `parseSearchCriteria` method in `CardPage.vue` (lines ~504–515) fully replaced. Method now returns criteria for any Monster card type regardless of the user's locale.

**Success criteria:**
- `searchCriteria` is populated for Monster cards when loaded in DE, FR, or IT locale
- `searchCriteria` is `null` for Spell/Trap cards
- Link Monsters (no `card.level`) still populate `searchCriteria` when `card.attribute` is present
- No regression for EN locale users

**Subtasks:**
- Replace method body: guard on `card.type?.toLowerCase().includes('monster')`
- Build `result` object: add `result.level = card.level` if `card.level != null`; add `result.attribute = card.attribute` if `card.attribute`
- Change return threshold from `>= 2` to `> 0` (intentional — Link Monsters qualify with attribute alone)
- Verify: `card.level` and `card.attribute` are already used in the template (lines 56–57), confirming field availability

**Blockers/Dependencies:** None (standalone method, no i18n dependency).

**Risks:** Behavioral delta for one-criterion cards is intentional per acceptance criteria. Low risk.

#### Verification — Step 2

**Level:** HIGH — Panel (3 judges) | **Threshold:** 4.0 / 5.0

**Artifact:** `parseSearchCriteria` method in `frontend/src/components/Pages/CardPage.vue`

**Rubric:**

| Criterion | Weight |
|---|---|
| Regex-based `card.desc` parsing fully removed; no regex patterns remain in the method | 0.20 |
| Monster guard uses `card.type?.toLowerCase().includes('monster')` to match all Monster subtypes | 0.20 |
| `card.level` and `card.attribute` read directly from the API response fields, not derived from text | 0.20 |
| Both fields are individually null/undefined-guarded before being added to the result object | 0.15 |
| Return threshold is `> 0` (not `>= 2`), so single-criterion cards (e.g. Link Monsters) qualify | 0.15 |
| Spell/Trap cards receive no `level`/`attribute` fields and therefore the method returns `null` | 0.10 |

---

### Step 3 — Gap 1: Price Badges [DONE]

**Goal:** Surface `card.card_prices` data as compact badges immediately below the market links row.

**Output:** New `prices` computed property in `CardPage.vue`; new `<div>` after market links row (after template line 77).

**Success criteria:**
- TCGPlayer (USD `$`) and Cardmarket (EUR `€`) prices appear when non-zero
- All prices "0.00" → entire row hidden (no empty whitespace)
- Prices render only after `card` resolves — no reflow on first load
- No horizontal overflow introduced on mobile
- Uses existing CSS variables (`--c-surface-2`, `--c-text`, `--c-muted`)

**Subtasks:**
- Add `prices` computed:
  ```js
  prices() {
    const p = this.card?.card_prices?.[0];
    if (!p) return null;
    const normalize = v => (!v || v === '0.00') ? null : v;
    const tcg = normalize(p.tcgplayer_price);
    const cm  = normalize(p.cardmarket_price);
    return (tcg || cm) ? { tcg, cm } : null;
  }
  ```
- Add template block after line 77 (closing `</div>` of market links row):
  ```html
  <div v-if="prices" class="flex flex-wrap gap-2 mt-1">
    <span v-if="prices.tcg" class="text-xs px-2 py-0.5 rounded" style="background: var(--c-surface-2); color: var(--c-text)">
      {{ $t('cardPage.priceTcg', { price: `$${prices.tcg}` }) }}
    </span>
    <span v-if="prices.cm" class="text-xs px-2 py-0.5 rounded" style="background: var(--c-surface-2); color: var(--c-text)">
      {{ $t('cardPage.priceCm', { price: `€${prices.cm}` }) }}
    </span>
  </div>
  ```

**Blockers/Dependencies:** Step 1 (i18n keys `priceTcg`, `priceCm`).

**Risks:** `card.card_prices` null on old/unofficial cards — guarded by `?.` optional chaining; computed returns `null`, row hidden.

#### Verification — Step 3

**Level:** MEDIUM — Single Judge | **Threshold:** 3.5 / 5.0

**Artifact:** `prices` computed property and price badge `<div>` block in `frontend/src/components/Pages/CardPage.vue`

**Rubric:**

| Criterion | Weight |
|---|---|
| `prices` computed returns `null` when `card.card_prices` is absent or null (optional chaining used) | 0.20 |
| Values `"0.00"`, `""`, and `null` are each normalized to `null` (not displayed as zero prices) | 0.25 |
| When both `tcg` and `cm` normalize to `null`, computed returns `null` and the badge row is entirely hidden | 0.15 |
| Template badge block is guarded by `v-if="prices"` so nothing renders before card data resolves | 0.15 |
| Currency symbols are hard-coded per marketplace (`$` for TCGPlayer, `€` for Cardmarket), not locale-derived | 0.10 |
| Badge elements use existing CSS variables (`--c-surface-2`, `--c-text`) for theming | 0.10 |
| Badge container uses `flex flex-wrap gap-2` to prevent horizontal overflow on mobile | 0.05 |

---

### Step 4 — Gap 2: Mobile Collapse for Printings [DONE]

**Goal:** On mobile, show first 5 printings collapsed with a "Show all" toggle. Desktop behavior unchanged.

**Output:** `printingsExpanded` data property; reset in `load()`; dual-branch template replacing single `overflow-y-auto` div (lines 102–122).

**Success criteria:**
- Mobile (< sm): ≤5 entries → no toggle shown; >5 entries → first 5 visible + toggle button
- Toggling expands to full list; toggling again collapses
- Navigating to a new card resets `printingsExpanded` to `false`
- Desktop (≥ sm): renders exact same 180px scroll container as today — zero regression
- No horizontal overflow added to mobile layout

**Subtasks:**
- Add to `data()` return: `printingsExpanded: false`
- Add to `load()` reset block: `this.printingsExpanded = false;`
- Replace lines 102–122 (the single `<div class="overflow-y-auto" style="max-height: 180px">` block) with:
  ```html
  <!-- Mobile branch -->
  <div class="sm:hidden">
    <div
      v-for="s in printingsExpanded ? card.card_sets : card.card_sets.slice(0, 5)"
      :key="s.set_code"
      class="flex items-center gap-2 px-4 py-2 border-b last:border-0 text-xs"
      style="border-color: var(--c-border)"
    >
      <!-- existing row content: set_code, set_name, set_rarity, CM link -->
    </div>
    <button
      v-if="card.card_sets.length > 5"
      class="w-full text-xs py-2 text-center transition-opacity hover:opacity-70"
      style="color: var(--c-muted)"
      @click="printingsExpanded = !printingsExpanded"
    >
      {{ printingsExpanded ? $t('cardPage.showLess') : $t('cardPage.showAllPrintings', { count: card.card_sets.length }) }}
    </button>
  </div>
  <!-- Desktop branch -->
  <div class="hidden sm:block overflow-y-auto" style="max-height: 180px">
    <div
      v-for="s in card.card_sets"
      :key="s.set_code"
      class="flex items-center gap-2 px-4 py-2 border-b last:border-0 text-xs"
      style="border-color: var(--c-border)"
    >
      <!-- exact copy of existing row content -->
    </div>
  </div>
  ```

**Blockers/Dependencies:** Step 1 (i18n keys `showAllPrintings`, `showLess`).

**Risks:** Desktop regression risk is minimal — desktop branch is a fully isolated copy of today's code. Toggle button only appears when `card.card_sets.length > 5`.

#### Verification — Step 4

**Level:** MEDIUM — Single Judge | **Threshold:** 3.5 / 5.0

**Artifact:** `printingsExpanded` data field, `load()` reset, and dual-branch printings template in `frontend/src/components/Pages/CardPage.vue`

**Rubric:**

| Criterion | Weight |
|---|---|
| Desktop branch (`hidden sm:block overflow-y-auto` with `max-height: 180px`) is a complete isolated copy of the original printings code — zero behavioral change on desktop | 0.25 |
| Mobile branch (`sm:hidden`) renders `card.card_sets.slice(0, 5)` when `printingsExpanded` is false, full list when true | 0.25 |
| Toggle button is only rendered when `card.card_sets.length > 5` (no spurious toggle for short lists) | 0.15 |
| `printingsExpanded: false` is declared in `data()` | 0.10 |
| `load()` resets `printingsExpanded` to `false` (state resets on card navigation) | 0.15 |
| Toggle button label uses `$t('cardPage.showAllPrintings', { count })` / `$t('cardPage.showLess')` i18n keys | 0.10 |

---

### Step 5 — Gap 3: `matchingCardsLabel` Computed + Heading [DONE]

**Goal:** Show enriched heading when `card.archetype` is null and level/attribute criteria are present.

**Output:** `matchingCardsLabel` computed in `CardPage.vue`; template line 151 updated to use it.

**Success criteria:**
- When archetype null + both level and attribute present → heading shows e.g. "Similar Level 4 LIGHT Monsters"
- When archetype null + level only → "Similar Level 4 Monsters"
- When archetype null + attribute only → "Similar LIGHT Monsters"
- When archetype non-null → heading unchanged (falls back to `matchingCards` key)
- When `searchCriteria` is null → `matchingCardsLabel` never displayed (section `v-if` guard prevents render)
- No visual change for EN locale; DE/FR/IT now also show the enriched heading (dependency on Step 2 fix)

**Subtasks:**
- Add `matchingCardsLabel` computed:
  ```js
  matchingCardsLabel() {
    if (this.card?.archetype) return this.$t('cardPage.matchingCards');
    const c = this.searchCriteria;
    if (!c) return this.$t('cardPage.matchingCards');
    if (c.level && c.attribute) return this.$t('cardPage.matchingCardsCriteria', { level: c.level, attribute: c.attribute });
    if (c.level)                return this.$t('cardPage.matchingCardsLevel',    { level: c.level });
    if (c.attribute)            return this.$t('cardPage.matchingCardsAttribute', { attribute: c.attribute });
    return this.$t('cardPage.matchingCards');
  }
  ```
- In template at line 151: replace `{{ $t('cardPage.matchingCards') }}` with `{{ matchingCardsLabel }}`
- Existing section `v-if` guard unchanged — it already handles empty/null cases

**Blockers/Dependencies:** Step 1 (i18n keys); Step 2 (criteria populated correctly for non-EN locales).

**Risks:** Purely additive. The existing fallback key `matchingCards` is used in all non-matching code paths.

#### Verification — Step 5

**Level:** MEDIUM — Single Judge | **Threshold:** 3.5 / 5.0

**Artifact:** `matchingCardsLabel` computed property and matching-cards heading in the template of `frontend/src/components/Pages/CardPage.vue`

**Rubric:**

| Criterion | Weight |
|---|---|
| `card.archetype` non-null → computed returns `$t('cardPage.matchingCards')` unchanged (no regression for archetype cards) | 0.20 |
| `card.archetype` null + both `level` and `attribute` present in `searchCriteria` → returns `$t('cardPage.matchingCardsCriteria', { level, attribute })` | 0.25 |
| `card.archetype` null + `level` only → returns `$t('cardPage.matchingCardsLevel', { level })` | 0.15 |
| `card.archetype` null + `attribute` only → returns `$t('cardPage.matchingCardsAttribute', { attribute })` | 0.15 |
| `searchCriteria` is null → computed returns fallback `$t('cardPage.matchingCards')` key | 0.10 |
| Template heading uses `{{ matchingCardsLabel }}` instead of a direct `$t(...)` call | 0.15 |

---

## Verification Summary

| Step | Description | Level | Judge | Threshold | Primary Artifact |
|---|---|---|---|---|---|
| 1 | i18n keys in all 4 locale files | MEDIUM | Single | 3.5 | `en.json`, `fr.json`, `de.json`, `it.json` — `cardPage` section |
| 2 | Replace `parseSearchCriteria` | HIGH | Panel (3) | 4.0 | `parseSearchCriteria` method in `CardPage.vue` |
| 3 | `prices` computed + price badge template | MEDIUM | Single | 3.5 | `prices` computed + badge `<div>` in `CardPage.vue` |
| 4 | Mobile collapse for printings | MEDIUM | Single | 3.5 | Dual-branch printings template + `printingsExpanded` in `CardPage.vue` |
| 5 | `matchingCardsLabel` computed + heading swap | MEDIUM | Single | 3.5 | `matchingCardsLabel` computed + template heading in `CardPage.vue` |

---

---

## Parallelization Plan

### Dependency Diagram

```
Wave 1 (parallel — no dependencies)
┌─────────────────────────────┐   ┌─────────────────────────────────┐
│ Agent A — Step 1            │   │ Agent B — Step 2                │
│ i18n keys (4 locale files)  │   │ Replace parseSearchCriteria     │
│ en/fr/de/it.json            │   │ CardPage.vue ~lines 505–515     │
└────────────┬────────────────┘   └─────────────────┬───────────────┘
             │ (Step 1 done)                         │ (Step 2 done)
             ▼                                       │
Wave 2 (parallel — unblocked when Step 1 done)      │
┌─────────────────────┐  ┌──────────────────────┐   │
│ Agent C — Step 3    │  │ Agent D — Step 4     │   │
│ prices computed     │  │ Mobile printings     │   │
│ + price badges      │  │ collapse (dual-      │   │
│ template ~line 77   │  │ branch template)     │   │
└──────────┬──────────┘  └──────────┬───────────┘   │
           └──────────┬─────────────┘               │
                      │ (Steps 3+4 done)             │
                      └──────────────┬───────────────┘
                                     ▼
                       Wave 3 (sequential — requires Steps 1+2)
                       ┌───────────────────────────────────────┐
                       │ Agent E — Step 5                      │
                       │ matchingCardsLabel computed            │
                       │ + template heading swap ~line 151      │
                       └───────────────────────────────────────┘
```

### Execution Directive

**Wave 1 — launch both in parallel:**
- Agent A: implement Step 1 (i18n keys in all 4 locale files)
- Agent B: implement Step 2 (replace `parseSearchCriteria` in `CardPage.vue`)

**Wave 2 — launch both in parallel once Agent A (Step 1) completes:**
- Agent C: implement Step 3 (prices computed + badge template)
- Agent D: implement Step 4 (mobile collapse dual-branch + data + load reset)
- Note: Agent B (Step 2) may still be running during Wave 2 — that is fine. Steps 3 and 4 have no dependency on Step 2.

**Wave 3 — launch once Agent A (Step 1) AND Agent B (Step 2) both complete:**
- Agent E: implement Step 5 (`matchingCardsLabel` computed + template heading)

### File Conflict Guidance

All `CardPage.vue` changes target non-overlapping regions:
| Agent | File region |
|---|---|
| Agent B (Step 2) | method `parseSearchCriteria` ~lines 505–515 |
| Agent C (Step 3) | new `prices` computed + template ~lines 64–77 |
| Agent D (Step 4) | `data()` new field + `load()` reset + template ~lines 98–123 |
| Agent E (Step 5) | new `matchingCardsLabel` computed + template ~line 151 |

Agents C and D work on fully separate template sections — no merge conflict risk when run in parallel.

---

### Definition of Done

- [X] All 7 new i18n keys present and resolving in all 4 locales (en, fr, de, it)
- [X] Non-zero prices display as compact `$` / `€` badges below market links; all-zero → badges hidden entirely
- [X] Mobile: ≤5 printings render without toggle; >5 show first 5 + toggle; toggle expands/collapses correctly
- [X] Desktop: printings section renders identically to before this change (180px scroll)
- [X] Navigating to a new card resets `printingsExpanded` to `false`
- [X] Monster cards with DE/FR/IT locale now show the matching-cards section
- [X] Link Monsters trigger matching-cards section when `card.attribute` is present (no level required)
- [X] Spell/Trap cards never render the matching-cards section
- [X] Archetype-null Monster cards show enriched heading (Level/Attribute) instead of generic "Can interact with"
- [X] No horizontal overflow on mobile introduced by any of the changes
- [X] No price reflow on first page load
