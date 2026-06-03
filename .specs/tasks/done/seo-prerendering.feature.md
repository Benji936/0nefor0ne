# SEO: Prerender Static HTML for Crawlers

**Type:** feature
**Status:** draft

## Description

The site is a pure client-side Vue 3 SPA (Vite build, deployed to Netlify/Cloudflare Pages). All SEO-critical tags — page title, meta description, canonical, hreflang, og:url, og:title, JSON-LD Product schema — are injected by JavaScript after the page mounts. Google uses a two-pass rendering pipeline that can delay indexing by days or weeks. Social crawlers (WhatsApp, Discord, Twitter) never execute JS at all.

The goal is to generate static HTML at build time for crawlers, so that the raw HTML response already contains the correct title, canonical, hreflang, and schema markup — without breaking the SPA behavior for real users.

**Why this is needed (business value):** Reliable, fast Google indexing of card and landing pages drives organic discovery, and correct social-share previews increase click-through. As a marketplace, discovery of card pages directly feeds traffic and trade activity. Today crawlers receive an empty HTML shell, so indexing is delayed and social previews are broken.

**Who benefits:** Search and social crawlers (immediate consumers of the static HTML), end users via improved discovery, and the business via organic traffic. Real human users must experience no behavioral regression.

**Key constraints:** Build-time only (no SSR server); must work with static hosting and the existing `_redirects` SPA fallback; per-route card data must be fetched from the external API at build time; runtime JS that mutates `document.title`/`document.head` must continue to work for users without invalidating the crawler-facing tags.

**User Scenarios:**
1. **Primary Flow:** Build runs → for each target route a static HTML file is emitted containing the correct SEO tags → deployed → a crawler (JS disabled) fetching the URL sees the correct tags in the raw response; a human loads the same URL and the SPA hydrates and behaves normally.
2. **Alternative Flow:** A route not in the prerender target list is requested → served via the existing SPA fallback (`/* /index.html 200`) exactly as today.
3. **Error Handling:** The external card API is unreachable for a card during build → the build surfaces a clear error or skips that card without emitting a corrupt page or empty tags and without corrupting other pages.

## User Request

> "Let's work on C1 now" — referring to the critical SEO issue identified in the SEO audit: no SSR/prerendering means all SEO tags are JS-only.

## Scope

**In scope:**
- Prerender the homepage for all 4 locales: `/en/`, `/fr/`, `/de/`, `/it/`
- Prerender the privacy page for all 4 locales: `/en/privacy`, `/fr/privacy`, `/de/privacy`, `/it/privacy`
- Prerender the top card pages in the sitemap (currently 16 cards × English only = 16 URLs: `/en/card/:id`)
- Static HTML must contain: `<title>`, `<meta name="description">`, `<link rel="canonical">`, hreflang `<link>` tags, `og:title`, `og:description`, `og:url`, JSON-LD schema
- SPA must continue to function normally after prerendering (hydration, navigation, auth flows unchanged)
- Must not break existing Netlify/Cloudflare Pages deployment (uses `_redirects` file)

**Out of scope:**
- Full SSR / Nuxt migration
- Server-side rendering of auth-required pages (library, trade, account)
- Real-time dynamic card pages (only top 16 from sitemap prerendered)
- ISR (incremental static regeneration)

Skill: .claude/skills/vite-prerender/SKILL.md

## Constraints

- Stack: Vue 3, Vite, Vue Router (createWebHistory), Vuetify, vue-i18n, Tailwind
- No separate SSR server — must work with static file hosting
- Card page data comes from external API (ygoprodeck.com) — must be fetched at build time for prerendered pages
- App uses `document.title =` and `document.head.querySelector()` extensively — any prerender approach must handle this gracefully
- Deployment: Netlify / Cloudflare Pages via `_redirects` — static files served, SPA fallback via `/* /index.html 200`

---

## Acceptance Criteria

### Functional Requirements

- [ ] **Homepage prerendered for all locales**: A static HTML file is produced for `/en/`, `/fr/`, `/de/`, `/it/`.
  - Given: the build has completed
  - When: the emitted dist HTML for each homepage locale is inspected
  - Then: each file contains a correct `<title>`, `<meta name="description">`, `<link rel="canonical">`, the hreflang `<link>` set, `og:title`, `og:description`, `og:url`, and JSON-LD schema

- [ ] **Privacy page prerendered for all locales**: A static HTML file is produced for `/en/privacy`, `/fr/privacy`, `/de/privacy`, `/it/privacy`.
  - Given: the build has completed
  - When: the emitted dist HTML for each privacy locale is inspected
  - Then: each file contains the correct SEO tag set (title, description, canonical, hreflang, OG fields, JSON-LD)

- [ ] **Top 16 English card pages prerendered**: A static HTML file is produced for each of the top 16 `/en/card/:id` URLs.
  - Given: the build has completed
  - When: the emitted dist HTML for each card URL is inspected
  - Then: each contains card-specific title, description, canonical, hreflang set, OG fields, and JSON-LD Product schema

- [ ] **SEO tags present without JavaScript**: The required tags exist in the raw HTML before any JS runs.
  - Given: a prerendered route
  - When: the raw HTML is fetched / loaded with JavaScript disabled
  - Then: the required SEO tags are present in the response before any client script executes

- [ ] **Tag values are absolute and correct**: Canonical, hreflang, and og:url use absolute URLs.
  - Given: a prerendered route
  - When: its canonical, hreflang, and og:url tags are inspected
  - Then: values are absolute `https://0nefor.one/{locale}{path}` and hreflang covers `en`, `fr`, `de`, `it` plus `x-default`

- [ ] **SPA behavior unchanged**: Real users see no regression after prerendering.
  - Given: a prerendered route loaded in a JS-enabled browser
  - When: the user loads, navigates, and uses auth flows
  - Then: the SPA hydrates and navigation, auth flows, and runtime title/meta updates work as before with no user-visible flicker or breakage

- [ ] **Deployment artifacts intact**: Static hosting and SPA fallback remain functional.
  - Given: the build has completed
  - When: the dist output is inspected
  - Then: `_redirects` and `sitemap.xml` are present, the SPA fallback rule (`/* /index.html 200`) is preserved, and non-prerendered routes are still served via the fallback

- [ ] **Card data fetched at build time**: Prerendered card pages embed real card data.
  - Given: a card page is being prerendered
  - When: external card data is required
  - Then: the card metadata is fetched at build time and embedded in the static HTML

- [ ] **Build-failure handling**: External API failures do not silently corrupt output.
  - Given: the external card API is unreachable for a card during build
  - When: the build runs
  - Then: the build surfaces a clear error or skips that card without producing a corrupt page or empty tags, and without affecting other pages

### Non-Functional Requirements

- [ ] **Performance**: Required SEO tags are present in the initial HTML response (no JS execution required by a crawler).
- [ ] **Reliability**: A failed external fetch for one card does not silently corrupt other pages or the overall build.
- [ ] **Compatibility**: Works with static hosting (Netlify / Cloudflare Pages) and the existing `_redirects`; `npm run build` remains the build entry point.

### Definition of Done

- [ ] All acceptance criteria pass
- [ ] Tests / verification written and passing
- [ ] Documentation updated
- [ ] Code reviewed

---

## Architecture Overview

### Solution Strategy

**Chosen approach: `vite-ssg`** (build-time SSG via Vue's `renderToString`), not `@prerenderer/vite-plugin`.

- **Justification:** `vite-ssg` runs purely in Node — no Puppeteer/Chromium dependency in CI, so builds are fast, deterministic, and light. It has first-class `vue-router` and `vue-i18n` integration and, critically, automatically uses `createMemoryHistory` for the SSR pass and `createWebHistory` for the client bundle, which directly resolves the router-history blocker without a hand-written server entry. The project skill is purpose-written for this exact stack (Vue 3 + Vite + Vuetify + vue-i18n + `_redirects`) and recommends it.
- **Why safe (no headless browser):** Rendering is `renderToString` in Node. The only cost is making the app SSR-safe — three small, well-understood guards/migrations (locale detection, head management, async data). These changes also harden the app generally. No runtime server is introduced; output is pure static HTML, fully compatible with the static-hosting + `_redirects` constraint.
- **Build pipeline:** `npm run build` switches from `vite build` to `vite-ssg build`. The existing sitemap-generation step runs unchanged. `vite-ssg` emits one HTML file per route (`dist/en/index.html`, `dist/en/card/<id>/index.html`, …). `public/_redirects` is copied as today; the CDN serves exact-match static files before the `/* /index.html 200` SPA fallback, so no deploy or redirect changes are needed.

### Key Decisions

1. **`detectLocale()` localStorage crash (SSR guard):** `detectLocale()` runs at module-init (`locale: detectLocale()`) and touches `localStorage`/`navigator` — a hard Node crash. Fix: (a) guard with `typeof localStorage === 'undefined' || typeof navigator === 'undefined'` returning `'en'`; (b) initialize i18n with a static default (`'en'`) and set the active locale from the **route param** (`/en/`, `/fr/`…) in a shared setup/router hook that runs identically on server and client. Using the route param — not browser detection — is also required to avoid hydration mismatch. `setLocale()` localStorage/`document` writes are likewise guarded (client-only path, cheap).

2. **App.vue DOM mutations (`@unhead/vue` migration, not guards):** The 15+ `document.*` calls in `_updateMeta()`/`_updateHreflang()`/`_setMeta()` are migrated to `useHead()`. This is the durable fix: `useHead` writes into the HTML string during SSR and patches the live DOM during CSR through one code path — no scattered `typeof document` guards, no double-injection, no flicker. Title/meta/hreflang become reactive `computed()` head entries so locale/route changes update the head on the client as before.

3. **CardPage async data + `window.prerenderReady`:** With `vite-ssg` there is **no** `prerenderReady` signal. Instead, `onServerPrefetch(async () => await fetchCard(id))` makes `renderToString` await the API fetch before snapshotting (the same fetch still runs `onMounted` for normal client loads). The fetched card is stored in reactive state serialized to `window.__INITIAL_STATE__` and rehydrated on the client, which skips the refetch. `_injectSeo()`'s `document.createElement`/`appendChild` is replaced by `useHead()`, with JSON-LD via `script: [{ type: 'application/ld+json', children: JSON.stringify(schema) }]`. **Build-failure handling:** the prefetch is wrapped in try/catch; on a failed/unreachable API the route is logged and skipped (not emitted as a corrupt page), and other routes continue building — satisfying the "clear error or skip" acceptance criterion.

4. **Vuetify SSR setup:** `createVuetify({ ssr: true, ... })`. The instance moves into the `ViteSSG` setup callback. No extra plugin is required — `vite-ssg` provides the SSR context. CSS imports (`vuetify/styles`, `@mdi/font`) remain as SSR no-ops.

5. **vue-i18n:** Already `legacy: false` ✅; add `globalInjection: true` for safety. The i18n instance is registered in the `ViteSSG` setup callback.

6. **Router export:** `router/index.js` exports the raw `routes` array (so `vite-ssg` constructs the router with the correct history per mode). `main.js` no longer imports a pre-built router instance.

7. **Route enumeration:** `ssgOptions.includedRoutes(paths, routes)` returns an explicit list — `/en/`, `/fr/`, `/de/`, `/it/`, the four `/{locale}/privacy`, plus the top-16 `/en/card/:id`. The 16 card IDs reuse the same source as `frontend/scripts/generate-sitemap.mjs` (Supabase top-cards) so sitemap and prerender stay in sync; extracted into a shared IDs list if not directly importable.

### Expected File Changes

| File | Change | What |
|------|--------|------|
| `frontend/package.json` | modify | Add deps `vite-ssg`, `@unhead/vue`; change `build` script to `vite-ssg build` |
| `frontend/src/main.js` | modify | Replace `createApp(...).mount()` with exported `createApp = ViteSSG(App, { routes }, setupFn)`; move Vuetify (`ssr: true`), i18n, route wiring into the setup callback |
| `frontend/src/router/index.js` | modify | Export raw `routes` array (alongside/instead of the instance) |
| `frontend/src/i18n.js` | modify | Guard `detectLocale()`/`setLocale()` for SSR; default locale `'en'`; route-param-driven locale; `globalInjection: true` |
| `frontend/src/views/App.vue` | modify | Replace `_updateMeta`/`_updateHreflang`/`_setMeta` `document.*` calls with `useHead()` (reactive computed entries) |
| `frontend/src/components/Pages/CardPage.vue` | modify | Add `onServerPrefetch` build-time fetch + `initialState` serialization; replace `_injectSeo()` with `useHead()`; try/catch skip-on-failure |
| `frontend/vite.config.js` | modify | Add `ssgOptions` (`script: 'async'`, `formatting: 'minify'`, `includedRoutes`) |
| `frontend/src/data/card-ids.js` (optional) | create | Shared top-16 card ID list if sitemap IDs aren't directly importable into `includedRoutes` |

### Trade-offs

- **vite-ssg vs `@prerenderer/vite-plugin` (headless):** Headless sidesteps SSR-compat entirely by running a real browser, but adds Puppeteer/Chromium to CI (heavier, slower, flaky with Vuetify component trees per the skill) and needs the brittle `window.prerenderReady` + timeout signal for async card data. `vite-ssg` requires the up-front SSR refactor (locale guard, head migration, `onServerPrefetch`), but those changes are small, deterministic, harden the app, and remove the entire headless-browser dependency. The refactor cost is paid once; the build stays fast and CI-light forever.
- **`@unhead/vue` migration vs `typeof document` guards in App.vue:** Guards are less code now but leave two divergent code paths (SSR no-op vs client DOM mutation) that risk drift, double-injection, and hydration flicker. The `useHead` migration unifies both paths and is the recommended pattern; chosen despite the larger diff.

---

## Implementation Process

Ordered phases. Phase A blockers MUST be complete before `vite-ssg build` can run at all (the locale crash fails at module-init, before any route renders). **Critical path: 1 → 4 → 5 → 6 → 8/9 → 11.** Phase A steps (1, 2, 3) are independent of each other and can be done in parallel. All file paths are under `frontend/`.

### Phase A — Blockers (SSR-safety; required before vite-ssg can run)

#### Step 1 — Guard `detectLocale()` / `setLocale()` against SSR
- **Goal:** Make `src/i18n.js` import-safe in Node so `renderToString` does not crash at module init.
- **Subtasks:**
  - In `detectLocale()`, early-return `'en'` when `typeof localStorage === 'undefined' || typeof navigator === 'undefined'`.
  - Initialize i18n with static `locale: 'en'` instead of `locale: detectLocale()` (active locale comes from the route param, set in Step 5's setup/router hook).
  - Guard the `localStorage.setItem` and `document.documentElement` writes in `setLocale()` behind `typeof window !== 'undefined'`.
  - Add `globalInjection: true` to the `createI18n` options.
- **Success criteria:** `node -e "import('./src/i18n.js')"` (or a minimal SSR render) runs with no `localStorage is not defined` / `navigator is not defined` error; client locale still resolves from saved preference/browser as before.
- **Blockers/risks:** Switching the init locale to `'en'` means locale must be driven by route param everywhere (depends on Step 5 wiring) — otherwise non-en first paint regresses.
- **Estimate:** XS

#### Step 2 — Guard App.vue DOM mutations against SSR
- **Goal:** Prevent `_updateMeta()`/`_updateHreflang()`/`_setMeta()` `document.*` calls (App.vue lines ~267–387) from executing during SSR before they are migrated in Step 8.
- **Subtasks:**
  - Wrap the bodies of `_updateMeta`, `_updateHreflang`, `_setMeta` with an early return when `typeof document === 'undefined'` (interim guard; Step 8 supersedes with `useHead`).
  - Confirm the `mounted()` and `$route`/`searchQuery` watcher call sites are client-only paths after guarding.
  - Guard the `document.documentElement.classList.toggle('dark', …)` theme calls (lines ~462, ~471).
- **Success criteria:** SSR render of a route mounting App.vue completes with no `document is not defined` error; client meta behavior unchanged.
- **Blockers/risks:** This is a temporary scaffold replaced by Step 8; keep the guard minimal to avoid rework churn.
- **Estimate:** S

#### Step 3 — Guard `CardPage._injectSeo()` + add async-data readiness
- **Goal:** Prevent `CardPage._injectSeo()` `document.*` calls (lines ~280–338) from crashing SSR before Step 9 migrates them.
- **Subtasks:**
  - Early-return from `_injectSeo()` when `typeof document === 'undefined'`.
  - Verify the fetch that drives `_injectSeo()` (called at line ~266) does not assume browser globals; isolate the data fetch from the DOM write so Step 9 can reuse the fetch in `onServerPrefetch`.
  - Note: with vite-ssg there is no `window.prerenderReady`; readiness is handled by `onServerPrefetch` in Step 9. (No prerenderReady signal is added — documented here to close the original blocker.)
- **Success criteria:** SSR render of a `/en/card/:id` route completes with no `document is not defined` error.
- **Blockers/risks:** Interim guard superseded by Step 9.
- **Estimate:** S

### Phase B — vite-ssg Setup

#### Step 4 — Install dependencies
- **Goal:** Add the vite-ssg toolchain.
- **Subtasks:**
  - `npm i -D vite-ssg` and `npm i @unhead/vue` (head management) in `frontend/`.
  - Confirm `vue` ≥ 3.x and `vite` versions are compatible with the installed `vite-ssg`; no `@vuetify/ssr-plugin` needed (vite-ssg provides SSR context).
  - Lockfile committed.
- **Success criteria:** `npm ls vite-ssg @unhead/vue` resolves cleanly; no peer-dep errors.
- **Blockers/risks:** Version-compat between vite-ssg, vite, and the Vuetify major version — verify before proceeding.
- **Estimate:** XS

#### Step 5 — Create SSR-compatible app factory
- **Goal:** Refactor `src/main.js` from `createApp().mount()` to the `ViteSSG(App, { routes }, setupFn)` export.
- **Subtasks:**
  - Replace the mount call with `export const createApp = ViteSSG(App, { routes }, ({ app, router, isClient }) => { … })`.
  - Inside the setup callback register Vuetify (Step 7), i18n (Step 1), `@unhead/vue` head, and any plugins.
  - Add a router hook (`router.beforeEach` or shared setup) that sets the active i18n locale from the route's `:locale` param — runs identically on server and client (avoids hydration mismatch).
  - Import the raw `routes` array from `router/index.js` (Step 6) instead of a prebuilt instance.
- **Success criteria:** `npm run dev` still boots and the SPA mounts/navigates; module exports `createApp`.
- **Blockers/risks:** Structural pivot — Steps 6/7 depend on it. Plugin registration order (Vuetify before app use) matters.
- **Estimate:** M

#### Step 6 — Configure `vite.config.js` with ssgOptions + route list
- **Goal:** Wire vite-ssg build options while preserving existing chunking.
- **Subtasks:**
  - Add `ssgOptions: { script: 'async', formatting: 'minify', includedRoutes(paths, routes) { … } }`.
  - `includedRoutes` returns the explicit list: `/en/`, `/fr/`, `/de/`, `/it/`, the four `/{locale}/privacy`, plus top-16 `/en/card/:id` (IDs from the shared list in Step 10).
  - Preserve the existing `manualChunks` vendor split and `@` alias.
  - Export the raw `routes` array from `src/router/index.js` (keep `createWebHistory` out of the export so vite-ssg picks history per mode).
- **Success criteria:** `includedRoutes` returns exactly 24 paths (4 home + 4 privacy + 16 card); `manualChunks` config unchanged in the build output.
- **Blockers/risks:** Card IDs must come from the shared source (Step 10) — circular ordering avoided by hardcoding IDs in a `card-ids.js` consumed by both.
- **Estimate:** S

#### Step 7 — Configure Vuetify for SSR
- **Goal:** Make Vuetify SSR-safe.
- **Subtasks:**
  - Add `ssr: true` to `createVuetify({ … })` and move the instance into the Step 5 setup callback.
  - Keep `vuetify/styles` and `@mdi/font` CSS imports (SSR no-ops).
  - Verify theme config (`neonDusk`) is unaffected.
- **Success criteria:** SSR render produces Vuetify markup with no `window`/`document` crash; client hydrates without console hydration-mismatch warnings on a baseline route.
- **Blockers/risks:** Vuetify SSR hydration mismatches are a known pain point (see Step 12).
- **Estimate:** S

### Phase C — SEO Injection (SSR-compatible)

#### Step 8 — Migrate App.vue meta to `useHead()`
- **Goal:** Replace imperative `_updateMeta`/`_updateHreflang`/`_setMeta` DOM mutation with reactive `useHead()` entries that render into the SSR HTML string and patch the client DOM through one path.
- **Subtasks:**
  - Compute title, description, og:* , twitter:*, canonical, content-language, html `lang`, and the full hreflang link set (`en/fr/de/it` + `x-default`, absolute `https://0nefor.one/{locale}{path}`) as reactive `computed` head entries.
  - Wire via the Options-API `head()` option or a `setup()` returning `useHead(...)`; remove the interim guards from Step 2 and the imperative methods.
  - Drive title/meta off the active locale + route so locale/route changes update the head reactively (replacing the `$route`/`searchQuery` watcher behavior).
- **Success criteria:** Built `dist/{en,fr,de,it}/index.html` and `dist/{locale}/privacy/index.html` each contain correct `<title>`, `<meta name=description>`, canonical, hreflang set, og:title/description/url, JSON-LD — present in raw HTML; client locale switch still updates the visible title/meta.
- **Blockers/risks:** Largest, most error-prone diff (15+ call sites); risk of hydration mismatch or lost reactivity on locale switch. HIGH RISK.
- **Estimate:** L

#### Step 9 — Migrate `CardPage._injectSeo()` to `useHead()` with async data
- **Goal:** Fetch card data at build time and emit card-specific SEO (incl. JSON-LD Product schema) into static HTML, with safe build-failure handling.
- **Subtasks:**
  - Add `onServerPrefetch(async () => { try { await fetchCard(id) } catch(e) { /* log + mark skip */ } })`; same fetch still runs `onMounted` for client loads.
  - Serialize fetched card into `initialState` → `window.__INITIAL_STATE__`; on client, rehydrate and skip the refetch when present.
  - Replace `_injectSeo()` DOM writes with `useHead()`: title, meta (description, og:*, twitter:*), canonical, hreflang, and JSON-LD via `script: [{ type: 'application/ld+json', children: JSON.stringify(schema) }]`. Remove Step 3 guard.
  - On failed/unreachable API for a card: log a clear error and skip emitting that route (no corrupt page / empty tags); other routes continue building.
- **Success criteria:** Each `dist/en/card/<id>/index.html` contains card-specific title, description, canonical, hreflang, OG fields, and valid JSON-LD Product schema in raw HTML; a deliberately broken card ID is skipped with a logged error and does not corrupt other pages; client load of a prerendered card does not double-fetch.
- **Blockers/risks:** initialState key mismatch → double fetch or hydration mismatch. Skip-semantics must not break `includedRoutes` count expectations. HIGH RISK.
- **Estimate:** L

#### Step 10 — Sync `generate-sitemap.mjs` with prerendered route list
- **Goal:** Single source of truth for the top-16 card IDs shared by sitemap and `includedRoutes`.
- **Subtasks:**
  - Extract the top-16 card IDs (Supabase top-cards source used by `frontend/scripts/generate-sitemap.mjs`) into a shared `src/data/card-ids.js` (or equivalent) importable by both the sitemap script and `vite.config.js`.
  - Update `generate-sitemap.mjs` to consume the shared list.
  - Confirm `_redirects`, `sitemap.xml` still emitted to `dist` and the `/* /index.html 200` fallback rule preserved.
- **Success criteria:** Sitemap card URLs and prerendered card routes match exactly; `dist/_redirects` and `dist/sitemap.xml` present with the SPA fallback intact.
- **Blockers/risks:** Build-order/import ergonomics (ESM in both Node script and Vite config).
- **Estimate:** S

### Phase D — Verification

#### Step 11 — Build and verify static HTML output
- **Goal:** Prove crawler-facing tags exist in raw HTML for every target route.
- **Subtasks:**
  - Run `npm run build` (now `vite-ssg build`); confirm 24 HTML files emitted at expected paths.
  - Grep each emitted HTML for `<title>`, `meta[name=description]`, `link[rel=canonical]`, hreflang set, og:title/description/url, and (card pages) JSON-LD Product schema; assert absolute `https://0nefor.one/...` values.
  - Add/automate a check script asserting the tag set per route (verification artifact).
- **Success criteria:** All target routes' raw HTML contain the required tags with correct absolute values; build exits 0; broken-card case handled per Step 9.
- **Blockers/risks:** None beyond upstream steps.
- **Estimate:** S

#### Step 12 — Verify SPA hydration / UX unchanged
- **Goal:** Confirm no user-visible regression after prerendering.
- **Subtasks:**
  - Serve `dist` and load prerendered routes in a JS-enabled browser; confirm hydration with no console hydration-mismatch warnings and no title/meta flicker.
  - Exercise navigation, locale switch, and auth flows (library/trade/account still SPA-served via fallback).
  - Load a JS-disabled fetch of a prerendered route and confirm tags present (cross-check with Step 11).
- **Success criteria:** SPA hydrates and behaves identically to pre-change; auth and runtime title/meta updates work; non-prerendered routes served via `/* /index.html 200`.
- **Blockers/risks:** Vuetify/locale hydration mismatches surfacing only at runtime.
- **Estimate:** M

### Definition of Done
- [x] All Acceptance Criteria (Functional + Non-Functional) pass.
- [x] Phase A SSR guards in place; `vite-ssg build` runs without `localStorage`/`navigator`/`document` crashes.
- [x] All 24 target routes emit static HTML containing the correct, absolute SEO tag set (title, description, canonical, hreflang+x-default, og:*, JSON-LD; Product schema on card pages) — present in raw HTML with no JS.
- [x] Card data fetched at build time via `onServerPrefetch`; unreachable-API cards skipped with a clear logged error and no corrupt/other-page impact.
- [x] `_redirects`, `sitemap.xml` emitted to `dist`; SPA fallback preserved; sitemap card IDs match prerendered card IDs (shared source).
- [x] SPA hydrates with no hydration-mismatch warnings, no flicker; navigation, locale switch, auth flows unchanged.
- [x] `npm run build` remains the build entry point.
- [x] Verification script/check for per-route tags added and passing.
- [ ] Code reviewed; documentation updated.

---

## Execution Plan

This reorganizes the 12 implementation steps into 4 dependency-ordered waves for maximum parallel execution. All file paths are under `frontend/`. Critical path: **4 → 5 → 8/9 → 11/12** (with 1/2/3 also gating 5).

### Sub-Agent Execution Directive

**Implementers MUST launch all parallel-eligible steps within a wave in a single Agent tool message** (one message containing multiple Agent tool calls). Do not dispatch them sequentially. Only proceed to the next wave after all steps in the current wave have completed and their success criteria are met.

### Per-Step Assignment

| Step | Agent | Model | Depends on | Parallel with | Rationale |
|------|-------|-------|-----------|---------------|-----------|
| 1 — Guard `detectLocale()`/`setLocale()` | general-purpose | haiku | — | 2, 3, 4 | XS, mechanical localStorage/navigator guards in one file; low risk. |
| 2 — Guard App.vue DOM mutations | general-purpose | sonnet | — | 1, 3, 4 | S, interim guards across ~15 call sites in App.vue; needs care but bounded. |
| 3 — Guard `CardPage._injectSeo()` + isolate fetch | general-purpose | sonnet | — | 1, 2, 4 | S, guard + fetch/DOM separation to prep Step 9; modest reasoning. |
| 4 — Install dependencies | general-purpose | sonnet | — | 1, 2, 3 | XS install but version-compat verification (vite-ssg/vite/Vuetify peers) warrants sonnet judgment. |
| 5 — SSR app factory (`main.js` → `ViteSSG`) | general-purpose | opus | 1, 2, 3, 4 | 6, 7 | M structural pivot; highest-leverage refactor everything else hangs on; plugin order + locale router hook. |
| 6 — `vite.config.js` ssgOptions + route list | general-purpose | sonnet | 1, 2, 3, 4 | 5, 7 | S config; defines `includedRoutes` (24 paths) and raw `routes` export; preserve `manualChunks`/alias. |
| 7 — Vuetify SSR config | general-purpose | sonnet | 1, 2, 3, 4 | 5, 6 | S; `ssr: true` + move instance into setup callback; preserve `neonDusk` theme. |
| 8 — App.vue meta → `useHead()` | general-purpose | opus | 5, 6, 7 | 9, 10 | L, HIGH RISK; largest diff (15+ sites), reactive computed head entries, hydration-mismatch risk. |
| 9 — CardPage `useHead()` + `onServerPrefetch` | general-purpose | opus | 5, 6, 7 | 8, 10 | L, HIGH RISK; async build-time fetch, initialState hydration, JSON-LD, skip-on-failure. |
| 10 — Sync `generate-sitemap.mjs` + `card-ids.js` | general-purpose | sonnet | 6 | 8, 9 | S; single-source top-16 IDs shared by sitemap + `includedRoutes`; only needs Step 6 route list. |
| 11 — Build + verify static HTML | general-purpose | sonnet | 8, 9 | 12 | S; run `vite-ssg build`, assert 24 files + tag set via check script. |
| 12 — Verify SPA hydration / UX | general-purpose | sonnet | 8, 9 | 11 | M; serve dist, runtime hydration/flicker/auth/locale checks + JS-disabled cross-check. |

### Parallelization Diagram

```
WAVE 1  (4 parallel — widest wave)  — SSR guards + deps; no dependencies
  ┌─ Step 1  (haiku)   i18n SSR guards
  ├─ Step 2  (sonnet)  App.vue interim guards
  ├─ Step 3  (sonnet)  CardPage interim guard + fetch isolation
  └─ Step 4  (sonnet)  install vite-ssg + @unhead/vue
        │
        ▼   (all of 1,2,3,4 complete)
WAVE 2  (3 parallel)  — vite-ssg setup
  ┌─ Step 5  (opus)    main.js → ViteSSG factory  [structural pivot]
  ├─ Step 6  (sonnet)  vite.config ssgOptions + routes export
  └─ Step 7  (sonnet)  Vuetify ssr: true
        │
        ▼   (5,6,7 complete; 10 needs only 6)
WAVE 3  (3 parallel)  — SEO injection + sitemap sync
  ┌─ Step 8  (opus)    App.vue → useHead()       [HIGH RISK]
  ├─ Step 9  (opus)    CardPage useHead + onServerPrefetch  [HIGH RISK]
  └─ Step 10 (sonnet)  card-ids.js + sitemap sync   (dep: Step 6)
        │
        ▼   (8,9 complete)
WAVE 4  (2 parallel)  — verification
  ┌─ Step 11 (sonnet)  build + raw-HTML tag verification
  └─ Step 12 (sonnet)  SPA hydration / UX / no-JS verification
```

**Max parallelization depth:** 4 (Wave 1).
**Agent distribution:** opus: 3 (5, 8, 9) · sonnet: 8 (2, 3, 4, 6, 7, 10, 11, 12) · haiku: 1 (1).

---

## Verifications

Verification levels per step. **Panel** = 3 judges (HIGH criticality, threshold 4.0/5.0). **Single** = 1 judge (MEDIUM, 3.5/5.0). **None** = no judge (LOW/trivial).

### Step 1 — Guard `detectLocale()` / `setLocale()` against SSR
- **Verification Level:** Single (1 judge, MEDIUM)
- **Artifact:** `frontend/src/i18n.js`
- **Rubric:**
  - SSR-safety of guards (0.40): `detectLocale()` early-returns `'en'` when `localStorage`/`navigator` undefined; `setLocale()` `localStorage`/`document` writes guarded behind `typeof window !== 'undefined'`. Importing the module in Node throws no `localStorage`/`navigator is not defined`.
  - Static init locale + globalInjection (0.25): i18n initialized with static `locale: 'en'` (not `detectLocale()`); `globalInjection: true` present.
  - Client behavior preserved (0.25): saved-preference/browser locale resolution still works on the client path; no regression to existing locale persistence.
  - Minimal, scoped change (0.10): change confined to `i18n.js`, no unrelated edits.
- **Threshold:** 3.5/5.0

### Step 2 — Guard App.vue DOM mutations against SSR
- **Verification Level:** Single (1 judge, MEDIUM)
- **Artifact:** `frontend/src/views/App.vue`
- **Rubric:**
  - Complete guard coverage (0.45): `_updateMeta`, `_updateHreflang`, `_setMeta`, and the `classList.toggle('dark', …)` theme calls all early-return / are skipped under `typeof document === 'undefined'`; no `document is not defined` on SSR render.
  - Client meta behavior unchanged (0.30): JS-enabled call sites (`mounted()`, `$route`/`searchQuery` watcher) still update title/meta as before.
  - Interim-guard discipline (0.25): guards are minimal and clearly interim (superseded by Step 8); no premature refactor that would churn Step 8.
- **Threshold:** 3.5/5.0

### Step 3 — Guard `CardPage._injectSeo()` + isolate fetch
- **Verification Level:** Single (1 judge, MEDIUM)
- **Artifact:** `frontend/src/components/Pages/CardPage.vue`
- **Rubric:**
  - SSR guard correctness (0.40): `_injectSeo()` early-returns under `typeof document === 'undefined'`; SSR render of `/en/card/:id` completes with no `document is not defined`.
  - Fetch/DOM separation (0.35): the card data fetch is isolated from the DOM write so Step 9 can reuse it in `onServerPrefetch`; fetch makes no browser-global assumptions.
  - Interim discipline + no fetch regression (0.25): guard is minimal/interim; client fetch + SEO injection behavior unchanged.
- **Threshold:** 3.5/5.0

### Step 4 — Install dependencies
- **Verification Level:** None (LOW)
- **Rationale:** Mechanical `npm i -D vite-ssg` + `npm i @unhead/vue`; success is binary (`npm ls` resolves, lockfile committed, no peer-dep errors). No judgment artifact to score.

### Step 5 — Create SSR-compatible app factory (`main.js` → `ViteSSG`)
- **Verification Level:** Panel (3 judges, HIGH criticality)
- **Artifact:** `frontend/src/main.js`
- **Rubric:**
  - ViteSSG factory correctness (0.35): `export const createApp = ViteSSG(App, { routes }, setupFn)` replaces `createApp().mount()`; raw `routes` imported (no prebuilt instance / no hardcoded `createWebHistory`).
  - Plugin registration in setup callback (0.30): Vuetify, i18n, `@unhead/vue`, and other plugins registered inside the setup callback in correct order (Vuetify before app use).
  - Route-param locale hook (0.25): a `beforeEach`/shared-setup hook sets active i18n locale from the `:locale` route param, running identically on server and client (no browser detection → no hydration mismatch).
  - Dev parity (0.10): `npm run dev` still boots, SPA mounts and navigates.
- **Threshold:** 4.0/5.0

### Step 6 — Configure `vite.config.js` ssgOptions + route list
- **Verification Level:** Single (1 judge, MEDIUM)
- **Artifact:** `frontend/vite.config.js` (and `src/router/index.js` routes export)
- **Rubric:**
  - includedRoutes correctness (0.45): returns exactly 24 paths — 4 home (`/en/ /fr/ /de/ /it/`), 4 privacy (`/{locale}/privacy`), 16 `/en/card/:id` from the shared ID source.
  - ssgOptions config (0.25): `script: 'async'`, `formatting: 'minify'` present and well-formed.
  - Existing config preserved (0.30): `manualChunks` vendor split and `@` alias unchanged; routes exported raw so vite-ssg picks history per mode.
- **Threshold:** 3.5/5.0

### Step 7 — Configure Vuetify for SSR
- **Verification Level:** Single (1 judge, MEDIUM)
- **Artifact:** `frontend/src/main.js` (Vuetify instance)
- **Rubric:**
  - SSR flag + placement (0.45): `ssr: true` added to `createVuetify`; instance moved into the Step 5 setup callback; SSR render produces Vuetify markup with no `window`/`document` crash.
  - Theme preserved (0.30): `neonDusk` theme config unaffected.
  - CSS imports intact (0.25): `vuetify/styles` and `@mdi/font` imports retained (SSR no-ops); no baseline-route hydration-mismatch warnings.
- **Threshold:** 3.5/5.0

### Step 8 — Migrate App.vue meta to `useHead()`
- **Verification Level:** Panel (3 judges, HIGH criticality)
- **Artifact:** `frontend/src/views/App.vue`
- **Rubric:**
  - Complete tag coverage as reactive entries (0.35): title, description, og:*, twitter:*, canonical, content-language, html `lang`, and full hreflang set (`en/fr/de/it` + `x-default`) computed as reactive `useHead` entries; absolute `https://0nefor.one/{locale}{path}` values.
  - Imperative code removed cleanly (0.25): `_updateMeta`/`_updateHreflang`/`_setMeta` and Step 2 interim guards removed; single SSR+CSR code path (no double-injection).
  - Reactivity on locale/route change (0.25): head updates reactively on locale switch and route change (replaces `$route`/`searchQuery` watcher behavior); no lost reactivity.
  - Hydration safety (0.15): no hydration-mismatch risk introduced (server/client head identical for a given route).
- **Threshold:** 4.0/5.0

### Step 9 — Migrate `CardPage._injectSeo()` to `useHead()` with async data
- **Verification Level:** Panel (3 judges, HIGH criticality)
- **Artifact:** `frontend/src/components/Pages/CardPage.vue`
- **Rubric:**
  - Build-time prefetch correctness (0.30): `onServerPrefetch(async () => await fetchCard(id))` awaits API before snapshot; same fetch still runs `onMounted` for client loads.
  - initialState hydration (0.25): fetched card serialized to `window.__INITIAL_STATE__`; client rehydrates and skips refetch when present (no double-fetch, no hydration mismatch from key mismatch).
  - useHead SEO incl. JSON-LD Product schema (0.25): title, meta (description, og:*, twitter:*), canonical, hreflang, and JSON-LD via `script:[{ type:'application/ld+json', children: JSON.stringify(schema) }]`; Step 3 guard removed.
  - Build-failure skip semantics (0.20): failed/unreachable API for a card is caught, logged with a clear error, and the route skipped (no corrupt page/empty tags); other routes unaffected.
- **Threshold:** 4.0/5.0

### Step 10 — Sync `generate-sitemap.mjs` + `card-ids.js`
- **Verification Level:** None (LOW)
- **Rationale:** Mechanical single-source extraction; success is verifiable by Step 11 (sitemap card URLs == prerendered card routes; `dist/_redirects` + `dist/sitemap.xml` present with fallback intact). No separate judgment artifact.

### Step 11 — Build and verify static HTML output
- **Verification Level:** Panel (3 judges, HIGH criticality — acceptance test)
- **Artifact:** built `dist/` HTML + verification check script
- **Rubric:**
  - Route completeness (0.30): `npm run build` (vite-ssg) exits 0 and emits all 24 HTML files at expected paths (`dist/{locale}/index.html`, `dist/{locale}/privacy/index.html`, `dist/en/card/<id>/index.html`).
  - Tag set present in raw HTML (0.35): each route's raw HTML contains `<title>`, `meta[name=description]`, `link[rel=canonical]`, hreflang set (+`x-default`), og:title/description/url; card pages contain valid JSON-LD Product schema — all present before any JS.
  - Absolute/correct values (0.20): canonical, hreflang, og:url use absolute `https://0nefor.one/...` values matching the route.
  - Verification artifact + failure handling (0.15): an automated per-route check script asserts the tag set; deliberately-broken card case handled per Step 9 (skipped, logged, no corruption).
- **Threshold:** 4.0/5.0

### Step 12 — Verify SPA hydration / UX unchanged
- **Verification Level:** Single (1 judge, MEDIUM)
- **Artifact:** served `dist` runtime behavior
- **Rubric:**
  - Clean hydration (0.40): prerendered routes hydrate in a JS-enabled browser with no console hydration-mismatch warnings and no title/meta flicker.
  - Behavior parity (0.35): navigation, locale switch, and auth flows (library/trade/account via SPA fallback) work identically to pre-change; runtime title/meta updates work.
  - No-JS + fallback cross-check (0.25): JS-disabled fetch of a prerendered route shows tags (cross-checks Step 11); non-prerendered routes served via `/* /index.html 200`.
- **Threshold:** 3.5/5.0

### Verification Summary

| Step | Level | Threshold | Artifact |
|------|-------|-----------|----------|
| 1 — i18n SSR guards | Single | 3.5/5.0 | `frontend/src/i18n.js` |
| 2 — App.vue interim guards | Single | 3.5/5.0 | `frontend/src/views/App.vue` |
| 3 — CardPage guard + fetch isolation | Single | 3.5/5.0 | `frontend/src/components/Pages/CardPage.vue` |
| 4 — Install dependencies | None | — | `frontend/package.json` + lockfile |
| 5 — SSR app factory | Panel | 4.0/5.0 | `frontend/src/main.js` |
| 6 — vite.config ssgOptions + routes | Single | 3.5/5.0 | `frontend/vite.config.js` |
| 7 — Vuetify SSR | Single | 3.5/5.0 | `frontend/src/main.js` (Vuetify) |
| 8 — App.vue → useHead() | Panel | 4.0/5.0 | `frontend/src/views/App.vue` |
| 9 — CardPage useHead + onServerPrefetch | Panel | 4.0/5.0 | `frontend/src/components/Pages/CardPage.vue` |
| 10 — sitemap sync + card-ids.js | None | — | `frontend/scripts/generate-sitemap.mjs`, `card-ids.js` |
| 11 — Build + raw-HTML verification | Panel | 4.0/5.0 | `dist/` HTML + check script |
| 12 — SPA hydration / UX | Single | 3.5/5.0 | served `dist` runtime |
