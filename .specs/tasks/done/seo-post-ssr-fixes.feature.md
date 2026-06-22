# SEO Post-SSR Fixes

## Type
`feature`

## Description

After implementing SSR prerendering (vite-ssg), a full re-audit identified several issues that were introduced or remained unaddressed. This task fixes them in priority order.

## Issues to Fix

### C1 — 6 of 16 card pages have no meta description / og:image / JSON-LD in SSG output
When `onServerPrefetch` fetches card data and gets a null response (API timeout / empty result), `ssrCard` stays null. The `useHead` fallback returns only `{ title: "..." }` — no description, no og:image, no Product schema. Affected cards: 27632520, 31533473, 38811586, 4026187, 91237821, 98829635.

**File:** `frontend/src/components/Pages/CardPage.vue`
**Fix:**
1. Add description + og:image + canonical to the `if (!card) return { ... }` fallback in `useHead`
2. In `onServerPrefetch`, throw if `data` is null so vite-ssg skips the route rather than serving degraded HTML

**Edge cases:**
- If both `card.desc` AND `card.name` are null/undefined, use a fully hardcoded generic fallback: title `"Yu-Gi-Oh Card — One for One"`, og:image pointing to a static default asset
- If `card.name` is null but `card.id` is present, use `"Card #[id] — One for One"` as the title
- Throwing in `onServerPrefetch` must only skip that single route; the overall SSG build must continue to completion without error

### H1 — Locale home pages (fr/de/it) have English titles baked into SSG HTML
The `useHead(computed(...))` in App.vue calls `t('meta.search.title')`. During SSG, `setLocale('fr')` updates `i18n.global.locale.value` but the reactivity doesn't propagate in time for `@unhead/vue` v2 to snapshot the correct translation. Result: all locale pages have English title/description in raw HTML.

**File:** `frontend/src/views/App.vue`
**Fix:** Pass `{ locale: localeVal.value }` as third arg to all `t()` calls inside the `useHead` computed, forcing translation to use the route-driven locale:
```js
const opts = { locale: localeVal.value }
t(`meta.${page}.title`, {}, opts)
```

**Edge cases:**
- If `route.params.locale` is undefined (e.g. canonical `/en/` route without explicit locale segment), `localeVal.value` must fall back to `'en'` — never pass `{ locale: undefined }` to `t()`
- SSG routes without a locale prefix must still render correct English metadata without throwing

### H2 — Very thin card descriptions (e.g. "2 Tuners" for Sea Monster of Theseus)
When `card.desc` is shorter than 30 characters, the meta description is uselessly thin.

**File:** `frontend/src/components/Pages/CardPage.vue`
**Fix:** When `raw.length < 30` and `raw.length > 0`, append platform context: `${raw} — Trade ${card.name} on One for One.`

**Edge cases:**
- When `card.desc` is an empty string (`length === 0`), treat as missing and use the full fallback: `"Trade ${card.name} on One for One"` (optionally append card type/archetype if available)
- Must not double-append context if `card.name` itself is very short — check total length after append, not just the raw desc

### M2 — Product schema `"price": "0"` with priceCurrency may suppress Google rich results
Cards aren't for sale, they're for trade. `price: 0, priceCurrency: USD, availability: InStock` sends wrong signals.

**File:** `frontend/src/components/Pages/CardPage.vue`
**Fix:** Remove `price`, `priceCurrency`, `availability` fields from Offer entries in JSON-LD. Keep `sku`, `name`, `url`, `seller`.

### L1 — Hero card image on card pages lacks `fetchpriority="high"`
Above-the-fold card image is treated as normal priority, delaying LCP.

**File:** `frontend/src/components/Pages/CardPage.vue`
**Fix:** Add `fetchpriority="high"` and remove `loading="lazy"` on the first/primary card image.

## Acceptance Criteria

### Meta & Open Graph
- [ ] All 16 card pages in `dist/en/card/` have a non-empty `<meta name="description">` in raw HTML
- [ ] All 16 card pages have `<meta property="og:image">` in raw HTML
- [ ] Cards whose API returned null still have a valid (generic fallback) description and og:image in SSG output
- [ ] A card with both null `desc` and null `name` renders the hardcoded generic title and default og:image without throwing

### Locale Titles
- [ ] `dist/fr/index.html` title is `"One for One — Échange de Cartes Yu-Gi-Oh!"` (not English)
- [ ] `dist/de/index.html` title is the German localized version
- [ ] `dist/it/index.html` title is the Italian localized version
- [ ] Routes without an explicit locale param in the URL render correct English metadata (no undefined locale passed to `t()`)
- [ ] `og:locale` meta tag matches the route locale on all locale home pages

### Descriptions
- [ ] No card description in built HTML is shorter than 30 characters without appended context
- [ ] Cards with an empty string `desc` (length === 0) use the full fallback description, not an empty or near-empty string

### JSON-LD
- [ ] Product JSON-LD offers no longer contain `price`, `priceCurrency`, `availability`

### Performance
- [ ] Primary card image in CardPage has `fetchpriority="high"` attribute and no `loading="lazy"`

### Build & Stability
- [ ] `npm run build` completes without errors even when individual card routes are skipped due to null API responses
- [ ] Skipped card routes are logged/warned during build (not silently dropped)
- [ ] `node scripts/verify-ssg-output.mjs` passes (extend to cover new checks above)
- [ ] SPA hydrates correctly with no Vue hydration mismatch warnings in browser dev tools
- [ ] Client-side head updates correctly when real card data loads after SSG fallback HTML (no flash of wrong meta)

## Architecture Overview

### Solution Strategy

All five fixes are surgical edits to two existing files (`CardPage.vue` and `App.vue`) plus extensions to the verify script. No new dependencies, no new abstractions — the existing `useHead(computed(...))` reactive pattern is architecturally correct; the bugs live inside the computed bodies. The approach maximizes SSG output quality while preserving SPA hydration correctness.

### Key Architectural Decisions

**C1 — Two-layer null handling in CardPage:**
The fix uses two complementary layers. Layer A throws inside `onServerPrefetch` when data is null, causing vite-ssg to skip that route entirely rather than write degraded HTML. Layer B enriches the `if (!card)` fallback in `useHead` with a complete meta set (description, og:image, og:url, canonical, twitter). Trade-off: skipped routes disappear from `dist/` instead of having stub pages. This is acceptable because a page with no description or og:image is SEO-negative, whereas a missing page can be re-crawled later. The belt-and-suspenders fallback ensures any non-throw code path still produces valid HTML.

**H1 — Explicit locale threading in App.vue:**
The root cause is that `localeVal` is already computed from `route.params.locale` but never passed to `t()` calls. The fix passes `{ locale: localeVal.value }` as the third argument to every `t()` call inside the `useHead` computed. This makes translation deterministic at SSG snapshot time regardless of async reactivity in `@unhead/vue` v2. The `|| 'en'` fallback on `localeVal` prevents `undefined` from being passed to `t()` on routes without an explicit locale segment.

**H2 — Description enrichment order:**
The candidate string must be assembled (raw + appended context if short) before applying the 155-char truncation. Appending and then not truncating would produce over-length descriptions. The empty-string case (`length === 0`) already falls through to the existing platform fallback and requires no new code.

**M2 — Offer schema simplification:**
Pure field deletion — no conditional logic. Removing `price`, `priceCurrency`, and `availability` from every Offer object in the JSON-LD eliminates the Google rich-result suppression trigger for zero-priced products. Cards are listed for trade, not sale; the remaining fields (sku, name, url, seller) accurately represent that.

**L1 — fetchpriority hint:**
Additive-only change on the primary card `<img>`. Analysis confirms `loading="lazy"` is not present on the hero image, so no removal is needed. Only one image per page should carry this hint.

### Files Changed and Relationships

| File | Fixes | Nature of change |
|------|-------|-----------------|
| `frontend/src/components/Pages/CardPage.vue` | C1, H2, M2, L1 | Edit `useHead` computed body, `onServerPrefetch` null branch, Offer map, hero img tag |
| `frontend/src/views/App.vue` | H1 | Thread `{ locale: localeVal.value }` into all `t()` calls in `useHead` computed |
| `frontend/scripts/verify-ssg-output.mjs` | — | Extend with 4 new assertions (og:image, non-empty desc, non-English locale titles, no price in JSON-LD) |

### Expected Behavior Before vs After

| Fix | Before | After |
|-----|--------|-------|
| C1 | 6 card pages baked into SSG HTML with title only — no description, og:image, or JSON-LD | Those routes omitted from dist/; all other cards have full fallback meta if data is unavailable |
| H1 | `dist/fr/index.html`, `dist/de/index.html`, `dist/it/index.html` have English title/description | Each locale page has the correctly translated title and description in raw SSG HTML |
| H2 | `"2 Tuners"` is the complete meta description for Sea Monster of Theseus | `"2 Tuners — Trade Sea Monster of Theseus on One for One."` (≥ 30 chars, within 155) |
| M2 | JSON-LD Offer contains `"price":"0"`, `"priceCurrency":"USD"`, `"availability":"InStock"` | Offer contains only `sku`, `name`, `url`, `seller` — no price fields |
| L1 | Primary card image loaded at default browser priority | `fetchpriority="high"` on hero img; 20–30% LCP improvement expected |

### Risks and Mitigations

1. **Transient API nulls (C1):** If the card API returns null transiently at build time, those card routes will be absent from `dist/`. Mitigation: log skipped card IDs as build warnings so the absence is observable; do not silently drop routes.

2. **Chained fallback t() calls (H1):** Any secondary `|| t('...')` call in App.vue's `useHead` computed that lacks `{ locale: localeVal.value }` will still resolve to English for non-en routes. Mitigation: audit all `t(` occurrences inside the computed, not just the primary call.

3. **Description truncation order (H2):** Appending context before applying the 155-char cap can produce over-length descriptions. Mitigation: build the full candidate string first, then apply a single truncation pass at the end.

4. **Verify script string matching (verify):** Hardcoded expected title strings will break if translations change. Mitigation: use locale-specific keyword/substring checks rather than exact string equality.

## Out of Scope

- Expanding TOP_CARD_IDS / fixing Supabase RPC (M1) — separate task
- og:locale accuracy on locale pages (M3) — verify during H1 fix, fix if broken
- sitemap lastmod accuracy (L3) — minor, skip
- preload hints for card images (L2) — separate task

## Dependencies

- Requires: completed SSR prerendering task (done)
- Affects: `CardPage.vue`, `App.vue`

## Skill Reference

See `.claude/skills/vite-ssg-seo/SKILL.md` for:
- How to force locale in `t()` calls inside `useHead` computed (H1)
- `onServerPrefetch` throw-on-null pattern to skip degraded routes (C1)
- Short description fallback pattern (H2)
- JSON-LD Offer fields to remove to avoid rich result suppression (M2)
- `fetchpriority="high"` usage rules for LCP images (L1)

---

## Implementation Process

### Implementation Summary

| Step | Fix | File | Nature | Est. Time | Depends On |
|------|-----|------|---------|-----------|------------|
| 1 | H1 — Thread `{ locale }` into all `t()` calls | `frontend/src/views/App.vue` | Edit 5 `t()` calls in `useHead` computed | ~15 min | — |
| 2 | C1 — Throw on null data + enrich null fallback | `frontend/src/components/Pages/CardPage.vue` | Edit `onServerPrefetch` + `useHead` fallback branch | ~30 min | — |
| 3 | H2 — Short description enrichment | `frontend/src/components/Pages/CardPage.vue` | Restructure `desc` ternary in `useHead` computed | ~20 min | Step 2 |
| 4 | M2 — Remove price fields from JSON-LD Offer | `frontend/src/components/Pages/CardPage.vue` | Delete 3 fields from offers map | ~10 min | Step 2 |
| 5 | L1 — `fetchpriority="high"` on hero image | `frontend/src/components/Pages/CardPage.vue` | Add attribute to `<img>` tag in template | ~5 min | — |
| 6 | Verify — Extend verify script | `frontend/scripts/verify-ssg-output.mjs` | Add 4 new assertions | ~45 min | Steps 1–5 |

Steps 1 and 5 are independent of all others and can be done in parallel with Step 2. Steps 3 and 4 depend on Step 2 (same computed body) and can be done sequentially after it.

---

### Parallelization Diagram

```
Wave 1 (run in parallel):
┌─────────────────────────────────────────────────────────────┐
│ Agent A (sonnet)          │ Agent B (sonnet)                 │
│ Step 1 — H1 (App.vue)     │ Step 2 — C1 (CardPage.vue)      │
│ ~15 min                   │   then Step 5 — L1 (template)   │
│                           │   then Step 3 — H2 (desc)       │
│                           │   then Step 4 — M2 (offers)     │
│                           │ ~65 min total                    │
└─────────────────────────────────────────────────────────────┘
                        ▼ both complete
Wave 2 (sequential):
┌─────────────────────────────────────────────────────────────┐
│ Agent C (sonnet)                                             │
│ Step 6 — Extend verify-ssg-output.mjs                       │
│ ~45 min                                                      │
└─────────────────────────────────────────────────────────────┘
```

**Rationale:**
- Step 1 edits `App.vue` exclusively — no conflict with any CardPage.vue work.
- Step 5 edits only the `<template>` block; Steps 2/3/4 edit only `<script setup>`. Non-overlapping zones, but batched into Agent B to avoid git coordination complexity.
- Steps 3 and 4 both extend the `useHead` computed body introduced/modified by Step 2 — strictly sequential within Agent B.
- Step 6 requires the final state of all edited files to write accurate assertions — strictly after Wave 1.

**Wall-clock estimate:** ~110 min (vs ~120 min fully sequential). Bottleneck is Agent B at ~65 min.

### Execution Directive

```
AGENTS:
  A: sonnet  — execute Step 1 only
  B: sonnet  — execute Steps 2, 5, 3, 4 in that order (same file, no branching)
  C: sonnet  — execute Step 6 after A and B both signal complete

PARALLELISM:
  Launch A and B simultaneously.
  Do NOT launch C until both A and B have committed their changes.

MERGE STRATEGY:
  A and B edit different files — no merge conflicts expected.
  C reads the outputs of A and B before writing assertions.
```

---

### Step 1 — H1: Thread locale into App.vue [DONE] `useHead` `t()` calls

**Goal:** All `t()` calls inside the `useHead` computed in `App.vue` explicitly pass the route-driven locale, so SSG snapshots correct translated titles/descriptions for fr/de/it home pages.

**File:** `frontend/src/views/App.vue`

**Subtasks:**
1. Locate the `useHead(computed(() => { ... }))` block (lines ~23–79)
2. Note that `const loc = localeVal.value` is already assigned inside the computed
3. Edit the two title `t()` calls:
   - `t("meta.search.titleWithQuery", { query: q })` → add third arg `{ locale: loc }`
   - `t(\`meta.${page || "search"}.title\`, {}, { missingWarn: false })` → merge: `{ missingWarn: false, locale: loc }`
   - `t("meta.search.title")` → `t("meta.search.title", {}, { locale: loc })`
4. Edit the two desc `t()` calls with the same pattern
5. Verify `localeVal.value` falls back to `'en'` (already does via `route.params?.locale || "en"`)

**Success criteria:**
- All 5 `t()` calls inside the `useHead` computed have `locale: loc` in their options
- No `t()` call passes `{ locale: undefined }` (guaranteed by the `|| "en"` fallback on `localeVal`)
- `dist/fr/index.html` title contains "Échange" or equivalent French phrase after build
- `dist/de/index.html` and `dist/it/index.html` likewise have localized titles

**Risks:**
- The `{ missingWarn: false }` option object must be extended, not replaced — use `{ missingWarn: false, locale: loc }` as a single object

#### Verification — Step 1

**Level:** Panel (HIGH criticality)
**Threshold:** 4.0 / 5.0
**Artifact:** `frontend/src/views/App.vue` diff + `dist/fr/index.html`, `dist/de/index.html`, `dist/it/index.html` raw HTML titles

| Criterion | Weight | Description |
|-----------|--------|-------------|
| `locale_coverage` | 0.35 | Every `t()` call inside the `useHead` computed (all 5) receives `locale: loc` in its options object — none are missed |
| `no_undefined_locale` | 0.25 | `localeVal.value` falls back to `'en'` (never `undefined`) before being threaded into `t()` options |
| `build_correctness` | 0.25 | After `npm run build`, `dist/fr/index.html`, `dist/de/index.html`, `dist/it/index.html` contain localized `<title>` text (not English) |
| `opts_merge` | 0.15 | Any existing option keys (`missingWarn: false`) are preserved — `{ locale }` is merged, not used as a replacement object |

---

### Step 2 — C1: Throw on null API response [DONE] + enrich null `useHead` fallback

**Goal:** Cards with null API responses are skipped from SSG output (with a visible build warning). All code paths in `useHead` that run when `card` is null produce a full valid meta set (not just a title).

**File:** `frontend/src/components/Pages/CardPage.vue`

**Subtasks:**
1. In `onServerPrefetch`, replace the silent `if (data) ssrCard.value = data;` with:
   ```js
   if (data) {
     ssrCard.value = data;
   } else {
     console.warn(`[vite-ssg] Skipping card ${cardId} — API returned null`);
     throw new Error(`No data for card ${cardId}`);
   }
   ```
2. In the `useHead(computed(...))` null fallback, replace `return { title: "Yu-Gi-Oh! Card — One for One" }` with a full meta object:
   - title: `"Yu-Gi-Oh! Card — One for One"`
   - description: `"Trade Yu-Gi-Oh! cards on One for One — the free card trading platform."`
   - og:image: `cardImage(route.params?.id) || 'https://0nefor.one/logo.png'`
   - og:url and canonical: `\`https://0nefor.one${route.path || '/en/card/unknown'}\``
   - twitter:card, twitter:title, twitter:description, twitter:image
   - canonical link

**Success criteria:**
- Cards 27632520, 31533473, 38811586, 4026187, 91237821, 98829635 are absent from `dist/en/card/` OR present with full meta (depending on whether API is available at build time)
- Build log contains `[vite-ssg] Skipping card ...` warnings for any skipped route
- `npm run build` exits 0 (skipped routes do not abort the build)
- No card HTML file exists with only a `<title>` and no `<meta name="description">`

**Blockers:** None

**Risks:**
- The existing `catch` block already throws — ensure the new null-throw doesn't double-throw (it's in the `try` body after the catch, so no issue)
- `cardImage(undefined)` must not throw — verify the `cardImage` function handles undefined gracefully

#### Verification — Step 2

**Level:** Panel (HIGH criticality)
**Threshold:** 4.0 / 5.0
**Artifact:** `frontend/src/components/Pages/CardPage.vue` diff + build log output + all card HTML files in `dist/en/card/`

| Criterion | Weight | Description |
|-----------|--------|-------------|
| `throw_mechanism` | 0.30 | `onServerPrefetch` throws a named `Error` when API data is null AND emits a `console.warn` with the card ID — both are present |
| `fallback_completeness` | 0.30 | The `if (!card)` return in `useHead` includes all required fields: `description`, `og:image`, `og:url`, `canonical`, `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image` |
| `build_stability` | 0.25 | `npm run build` exits with code 0 even when individual card routes throw — the overall SSG build is not aborted |
| `no_double_throw` | 0.15 | No double-throw or swallowed throw: the new throw is in the `try` body before any existing `catch`, and the existing `catch` re-throws correctly |

---

### Step 3 — H2: Short description enrichment [DONE]

**Goal:** No card meta description in SSG HTML is shorter than 30 characters without platform context appended. Empty descriptions use the full fallback. Total length stays ≤ 155 characters.

**File:** `frontend/src/components/Pages/CardPage.vue`

**Subtasks:**
1. Locate the `desc` assignment inside `useHead(computed(...))` (currently a ternary on `raw`)
2. Replace the current ternary with a three-branch logic:
   ```js
   let candidate;
   if (raw.length === 0) {
     candidate = `Trade ${card.name} on One for One — the free Yu-Gi-Oh! card trading platform.`;
   } else if (raw.length < 30) {
     candidate = `${raw} — Trade ${card.name} on One for One.`;
   } else {
     candidate = raw;
   }
   const desc = candidate.length > 155 ? candidate.slice(0, 155) + "…" : candidate;
   ```
3. Verify the Sea Monster of Theseus case: `"2 Tuners"` (8 chars) → `"2 Tuners — Trade Sea Monster of Theseus on One for One."` (54 chars, ≤ 155)

**Success criteria:**
- No `<meta name="description">` in any card HTML has `content` shorter than 30 characters
- Cards with `desc === ""` produce the full fallback description
- Cards with short non-empty `desc` produce `${raw} — Trade ${name} on One for One.`
- All descriptions are ≤ 155 characters (truncated with ellipsis if over)

**Dependencies:** Step 2 must be done first (working in same `useHead` computed body)

**Risks:**
- Appending ` — Trade ${card.name} on One for One.` to an already-29-char raw desc can produce ~80 chars — well within 155, so truncation won't silently cut off the appended text in normal cases. Still, the post-append truncation ensures correctness in edge cases.

#### Verification — Step 3

**Level:** Single (MEDIUM criticality)
**Threshold:** 3.5 / 5.0
**Artifact:** `frontend/src/components/Pages/CardPage.vue` diff (desc logic inside `useHead` computed)

| Criterion | Weight | Description |
|-----------|--------|-------------|
| `three_branch_logic` | 0.35 | All three branches are correct: `length === 0` → full fallback; `0 < length < 30` → `${raw} — Trade ${card.name} on One for One.`; `length >= 30` → `raw` unchanged |
| `truncation_order` | 0.30 | The full candidate string is assembled first (across all branches), then a single truncation pass at 155 chars is applied at the end — truncation is not applied per-branch |
| `edge_case_empty` | 0.20 | `length === 0` produces the full platform fallback (`"Trade ${card.name} on One for One — the free Yu-Gi-Oh! card trading platform."`) — not an empty string or the short-append variant |
| `no_double_append` | 0.15 | The check `raw.length < 30` uses the raw desc length before appending — the total candidate length is not re-checked against 30 after appending |

---

### Step 4 — M2: Remove price fields from JSON-LD Offer objects [DONE]

**Goal:** Product JSON-LD no longer contains `price`, `priceCurrency`, or `availability` fields, eliminating the Google rich-result suppression trigger for zero-priced products.

**File:** `frontend/src/components/Pages/CardPage.vue`

**Subtasks:**
1. Locate the `offers` map inside the `schema` object in `useHead(computed(...))`
2. Remove these three lines from each offer object:
   - `price: "0",`
   - `priceCurrency: "USD",`
   - `availability: "https://schema.org/InStock",`
3. Verify remaining fields: `@type`, `sku`, `name`, `url`, `seller`

**Success criteria:**
- `JSON.parse` of the `application/ld+json` script in any card HTML contains no `price`, `priceCurrency`, or `availability` keys in any Offer object
- The verify script's new assertion `!html.includes('"price"')` passes for all card routes

**Dependencies:** Step 2 (working in same computed body, cleaner to do sequentially)

#### Verification — Step 4

**Level:** Single (MEDIUM criticality)
**Threshold:** 3.5 / 5.0
**Artifact:** `frontend/src/components/Pages/CardPage.vue` diff (offers map inside `useHead` computed)

| Criterion | Weight | Description |
|-----------|--------|-------------|
| `all_three_removed` | 0.50 | All three fields — `price`, `priceCurrency`, and `availability` — are deleted from every Offer object in the offers map; none remain under any condition or code path |
| `no_over_removal` | 0.30 | Remaining fields (`@type`, `sku`, `name`, `url`, `seller`) are intact and unmodified |
| `no_conditional` | 0.20 | No new conditional logic, feature flag, or ternary was introduced — this is a pure field deletion |

---

### Step 5 — L1: Add `fetchpriority="high"` to hero card image [DONE]

**Goal:** The primary above-the-fold card image carries `fetchpriority="high"` so browsers load it at high priority, improving LCP by 20–30%.

**File:** `frontend/src/components/Pages/CardPage.vue`

**Subtasks:**
1. Locate the hero `<img>` tag in the template (lines ~40–46, the card image inside `<template v-else-if="card">`)
2. Add `fetchpriority="high"` attribute
3. Confirm `loading="lazy"` is NOT present (it isn't — no removal needed)

**Success criteria:**
- The rendered card page HTML contains `fetchpriority="high"` on the primary card `<img>`
- No `loading="lazy"` on the same element

**Dependencies:** None (template-only change)

#### Verification — Step 5

**Level:** None (trivial additive change — single attribute addition to a template tag, no logic involved)

---

### Step 6 — Extend verify-ssg-output.mjs with new assertions [DONE]

**Goal:** `node scripts/verify-ssg-output.mjs` validates all new SEO requirements introduced by fixes C1, H1, H2, M2.

**File:** `frontend/scripts/verify-ssg-output.mjs`

**Subtasks:**
1. Add assertion for **og:image presence** on all route types:
   ```js
   ['og:image', html.includes('og:image')],
   ```
2. Add assertion for **non-empty description content** — extract content value via regex and check it's non-empty:
   ```js
   const descMatch = html.match(/name="description"\s+content="([^"]*)"/) || html.match(/content="([^"]*)"\s+name="description"/)
   ['non-empty description', descMatch && descMatch[1].length > 0],
   ```
3. Add assertion for **non-English locale titles** on fr/de/it home pages only — check `<html lang>` and that title does not contain a known English-only phrase. Use per-route locale metadata to conditionally apply:
   ```js
   ...(type === 'home' && path.startsWith('/fr') ? [['fr title not English', !html.includes('<title>One for One — Trade')]] : []),
   // similar for de, it
   ```
   Safer variant: check that `<html lang="fr">` is present for `/fr/` routes.
4. Add assertion for **no price in JSON-LD** on card routes:
   ```js
   ...(type === 'card' ? [['no price in json-ld', !html.includes('"price"')]] : []),
   ```
5. Update the ROUTES array or route metadata to carry `locale` info needed for locale title assertions

**Success criteria:**
- `node scripts/verify-ssg-output.mjs` exits 0 after all fixes are applied
- New assertions catch regressions: if `price` is re-added to JSON-LD, the script fails
- Locale home page assertions pass (fr/de/it have translated titles)

**Dependencies:** Steps 1–5 complete

#### Verification — Step 6

**Level:** Panel (HIGH criticality)
**Threshold:** 4.0 / 5.0
**Artifact:** `frontend/scripts/verify-ssg-output.mjs` diff + script stdout when run against completed `dist/`

| Criterion | Weight | Description |
|-----------|--------|-------------|
| `assertion_correctness` | 0.35 | All four new assertions check the right condition: `og:image` presence, non-empty description content, non-English locale titles for fr/de/it, no `"price"` in JSON-LD for card routes |
| `regex_robustness` | 0.25 | The description-content regex handles both attribute orderings (`name=` before `content=` and `content=` before `name=`), using an OR of two patterns or a generic lookahead |
| `false_positive_safety` | 0.20 | Locale title assertions use substring or `<html lang>` checks — not exact English-title equality — so they won't break if the English phrasing changes slightly |
| `exit_code` | 0.20 | The script exits with code 1 (non-zero) when any assertion fails and code 0 when all pass; the exit code is explicitly set and not left to default |

---

### Verification Summary

| Step | Fix | Verification Level | Threshold | Rubric Criteria | Artifact |
|------|-----|-------------------|-----------|-----------------|----------|
| 1 | H1 — Thread locale into App.vue | Panel | 4.0 / 5.0 | locale_coverage (0.35), no_undefined_locale (0.25), build_correctness (0.25), opts_merge (0.15) | App.vue diff + dist fr/de/it index.html |
| 2 | C1 — Throw on null + enrich fallback | Panel | 4.0 / 5.0 | throw_mechanism (0.30), fallback_completeness (0.30), build_stability (0.25), no_double_throw (0.15) | CardPage.vue diff + build log + card HTML files |
| 3 | H2 — Short description enrichment | Single | 3.5 / 5.0 | three_branch_logic (0.35), truncation_order (0.30), edge_case_empty (0.20), no_double_append (0.15) | CardPage.vue desc logic diff |
| 4 | M2 — Remove price from JSON-LD | Single | 3.5 / 5.0 | all_three_removed (0.50), no_over_removal (0.30), no_conditional (0.20) | CardPage.vue offers map diff |
| 5 | L1 — fetchpriority on hero image | None | — | trivial additive change | — |
| 6 | Verify — Extend verify script | Panel | 4.0 / 5.0 | assertion_correctness (0.35), regex_robustness (0.25), false_positive_safety (0.20), exit_code (0.20) | verify-ssg-output.mjs diff + script stdout |

---

### Definition of Done

All of the following must be true before the task is considered complete:

- [X] `npm run build` completes with exit code 0
- [X] Build log contains `[vite-ssg] Skipping card ...` for any card with null API response (or all 16 cards build successfully if API is available)
- [X] `node frontend/scripts/verify-ssg-output.mjs` passes all assertions (0 failures)
- [X] All present card HTML files have non-empty `og:image` and `description` meta tags
- [X] `dist/fr/index.html`, `dist/de/index.html`, `dist/it/index.html` titles are in the correct language (not English)
- [X] No card HTML file's JSON-LD contains `"price"`, `"priceCurrency"`, or `"availability"` fields
- [X] Primary card `<img>` in rendered HTML has `fetchpriority="high"`
- [ ] SPA hydrates without Vue hydration mismatch warnings in browser dev tools (MANUAL)
- [ ] Client-side head updates correctly when real card data loads post-SSG (no flash of wrong meta) (MANUAL)
