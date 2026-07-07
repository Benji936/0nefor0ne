---
title: Create landing page for the project
---

## Initial User Prompt

I would like to make a landing page for my project.

## Description

Today the application's root route renders the card Search tool directly. Anonymous and first-time visitors are dropped into a functional tool with no explanation of what TradeMarket is, why it exists, or where to start. This causes confusion and lost activation — visitors who would convert into engaged users or sign-ups instead bounce. This task adds a dedicated public landing (entry/marketing) page that introduces the product, communicates its core value, and guides visitors into the existing features.

The landing page is a static, localized, responsive marketing surface. It leads with a hero (product name, headline, subheadline, primary call-to-action), then highlights the four core capabilities — searching cards, building/importing decks, tracking collection progress, and trading — each with a call-to-action that deep-links into that feature's existing page. It offers a get-started / sign-in entry point through the existing authentication flow, and a footer with secondary links. The page reuses the existing routing, localization, and authentication; it does not introduce new functional features or backend changes.

Beneficiaries: anonymous first-time visitors (orientation and a clear starting point), returning logged-out users (fast path back into the app), and the product owner (higher conversion, a shareable marketing/SEO entry URL). Logged-in users are not forced through marketing copy — they are offered a direct path into the app.

**Scope**:
- Included:
  - A public landing page reachable without authentication, within the existing locale-prefixed routing.
  - Hero section: product name, headline, subheadline, primary CTA.
  - Feature-highlight sections for Search cards, Decks, Collection tracking, and Trade, each with a CTA linking to that feature's existing route.
  - Get-started / sign-in entry via the existing authentication flow.
  - Footer with at least the Privacy link.
  - Full localization across all supported locales (en, fr, de, it).
  - Responsive layout (mobile through desktop) and basic SEO meta (page title, description).
- Excluded:
  - Any new functional feature (search, decks, collection, trade already exist) or backend/API change.
  - Pricing, blog, changelog, testimonials, or live/social-proof statistics.
  - Analytics/event instrumentation on CTAs and A/B testing of copy.
  - Non-basic animations or interactive hero/video demos.
  - Changes to the authentication system itself.

**User Scenarios**:
1. **Primary Flow**: An anonymous visitor opens the landing page, reads the hero and the four feature highlights, clicks a feature CTA (e.g. "Search cards"), and is taken to that feature's existing page.
2. **Alternative Flow (Get started)**: The visitor clicks the hero's primary CTA and the existing get-started / sign-in flow opens.
3. **Alternative Flow (Logged-in)**: An already-authenticated visitor sees a "Go to app" primary CTA that routes straight into the app instead of a sign-up prompt.
4. **Alternative Flow (Locale)**: A visitor on a non-default supported locale sees fully translated content.
5. **Error Handling**: An unsupported/missing locale falls back to the app-wide locale handling with no crash and no untranslated keys; on a very small viewport the layout stacks with no overflow and all CTAs remain reachable; if an image asset fails to load, text and CTAs still render and remain usable.

---

## Acceptance Criteria

### Functional Requirements

- [ ] **Reachable anonymously**: The landing page renders for unauthenticated visitors.
  - Given: An unauthenticated visitor
  - When: They open the landing page URL
  - Then: The landing page renders fully without requiring login

- [ ] **Hero present**: The hero communicates the product and offers a primary action.
  - Given: The landing page is loaded
  - When: The visitor views the top of the page
  - Then: Product name, a headline, a subheadline, and a primary CTA are visible

- [ ] **Feature highlights**: The four core features are presented.
  - Given: The landing page is loaded
  - When: The visitor scrolls through the page
  - Then: Distinct sections for Search cards, Decks, Collection tracking, and Trade are shown

- [ ] **Feature CTA navigation**: Each feature highlight links into its existing page.
  - Given: A feature highlight with a CTA
  - When: The visitor clicks the CTA
  - Then: The app navigates to that feature's existing route

- [ ] **Primary CTA (anonymous)**: The hero primary CTA starts the entry flow.
  - Given: The hero primary CTA shown to an anonymous visitor
  - When: The visitor clicks it
  - Then: The get-started / sign-in flow (existing authentication dialog) opens, or the visitor is routed into the main entry feature

- [ ] **Logged-in experience**: Authenticated users are routed into the app, not asked to sign up.
  - Given: An authenticated user
  - When: They view the landing page
  - Then: The primary CTA is "Go to app" and routes into the app

- [ ] **Localization**: All copy is translated in every supported locale.
  - Given: A supported locale (en, fr, de, or it)
  - When: The page is loaded in that locale
  - Then: All visible copy is translated and no raw i18n keys appear

- [ ] **Footer**: A footer with secondary links is present.
  - Given: The landing page is loaded
  - When: The visitor scrolls to the bottom
  - Then: A footer with at least the Privacy link is present and navigates correctly

- [ ] **Missing-locale fallback**: Unsupported locales degrade gracefully.
  - Given: An unsupported or missing locale
  - When: The landing page is requested
  - Then: The app-wide locale fallback applies, with no crash and no untranslated keys shown

### Non-Functional Requirements

- [ ] **Responsive**: At a ~375px mobile viewport the content stacks vertically, with no horizontal overflow or overlapping content, and all CTAs remain reachable; the layout also renders correctly at desktop widths.
- [ ] **Accessibility**: The page has a single H1 with a logical heading order, all CTAs are keyboard-focusable and operable, and all images have alt text.
- [ ] **SEO**: The page sets a descriptive document title and meta description.
- [ ] **Performance**: The page renders its content and CTAs on first paint without blocking on any API/data fetch.

### Resolved Decisions

- [x] **Routing strategy — RESOLVED (Strategy A).** The landing page becomes the public home at the root locale route `/{locale}/`. The card Search tool stays fully available at `/{locale}/cards`, which already serves the real search experience via `CardsPage.vue`. The root route, the nav logo target, and the SSG/sitemap homepage are repointed to the landing page. (Root previously double-served search, since the navbar search box and SideNav "Search" item both already route to `cards`.)
  - **Rollback:** revert the root entry in `localeChildren` back to `{ path: "", name: "search", component: Search }` in `frontend/src/router/index.js`; the landing page then becomes inert (no route) and search is restored at root with no other changes required.

### Definition of Done

- [ ] All acceptance criteria pass
- [ ] Tests written and passing
- [ ] Documentation updated
- [ ] Code reviewed

---

## Architecture Overview

Synthesized from:
- Skill: [`.claude/skills/landing-page-construction/SKILL.md`](../../../.claude/skills/landing-page-construction/SKILL.md)
- Analysis: [`.specs/analysis/analysis-create-landing-page.md`](../../analysis/analysis-create-landing-page.md)

### Solution strategy

Add one new SSR-safe Vue page, `LandingPage.vue`, and promote it to the public home at the
root locale route (`/{locale}/`, **Strategy A — resolved**). Search continues to live at
`/{locale}/cards` (`CardsPage.vue`), which is already the canonical search destination that the
navbar search box and the SideNav "Search" item route to — so root no longer double-serves search.

The page is **fully static and SSG-pre-rendered**: hero (product name, headline, subheadline,
primary CTA), four feature-highlight sections (Search cards, Decks, Collection tracking, Trade)
each deep-linking into its existing feature route, an auth entry point, and a footer with the
Privacy link. No new dependency, no new framework, no backend change. All copy is i18n across
`en/fr/de/it`. Theme colors come from CSS custom properties (`--c-*`); Tailwind is used only for
layout/spacing/typography. Responsive show/hide is driven by **scoped CSS media queries** (never
`hidden sm:flex`). CTAs reuse the existing shared `AuthDialog` by emitting `requireAuth` up to
`App.vue`; feature CTAs are locale-aware `router-link`s.

### Key architectural decisions

1. **Landing at root `/{locale}/`; search at `/{locale}/cards` (Strategy A).**
   *Reasoning:* highest SEO value (marketing page becomes the indexed, priority-1.0 homepage);
   resolves the existing redundancy where root and `/cards` both rendered search.
   *Trade-off:* MEDIUM blast radius — touches the SEO `isSearch` branch, sitemap, and nav "home"
   targets that implicitly assumed root===search. Mitigated by keeping `/cards` as the canonical
   search URL (already indexed) and a one-line rollback (revert the root `localeChildren` entry).

2. **New route name `home`, eagerly imported (mirror the old root).**
   *Reasoning:* the root route is the first page every visitor hits; the existing convention
   eager-loads root and lazy-loads everything else (`router/index.js:3-9`). Naming it `home`
   lets `App.vue`'s `page()` (route-name-driven, `App.vue:317`) resolve `meta.home.*` for SEO.
   *Trade-off:* eager import adds the landing page to the initial bundle, but it is small/static
   and replaces the previously-eager `Search.vue` at root, so net initial weight is comparable.

3. **Fully static content — no live data (no trending cards/counts).**
   *Reasoning:* keeps SSG trivial and satisfies the NFR that content + CTAs paint on first paint
   with no API/data dependency; avoids SSR hydration hazards.
   *Trade-off:* no dynamic social proof, but that is explicitly out of scope.

4. **Reuse the shared `AuthDialog` via `requireAuth`; do not build a new modal.**
   *Reasoning:* `App.vue`'s RouterView already wires `@requireAuth="openLogin()"` for every page
   (`App.vue:262`). The hero "Get started / Sign in" CTA emits `requireAuth`; the logged-in
   variant ("Go to app") routes into the app instead. *Trade-off:* none — strictly reuse.

5. **Keep `Search.vue`; do not delete it in this task.**
   *Reasoning:* under Strategy A its content is largely duplicated by `CardsPage.vue`, but
   retiring it is a separate cleanup with its own risk surface. *Trade-off:* temporary dead-ish
   component remains; flagged for a follow-up, not this scope.

### Components

- **`frontend/src/components/Pages/LandingPage.vue`** (new) — single-file `<script setup>` page.
  Hero + 4 feature sections + footer-adjacent CTA. Uses `useI18n` for copy; locale-aware
  `router-link`s for feature CTAs; `defineEmits(['requireAuth'])` for the auth CTA. SSR-safe:
  no top-level `window`/`document`/`localStorage`; any browser-only work goes in `onMounted`.
- **(optional) `frontend/src/components/Pages/landing/*.vue`** — only if decomposing hero/feature
  sections; mirror the `src/components/Pages/search/` sub-component structure. Not required.

### Contracts

**Landing page component (rendered by `App.vue:255-266` `<RouterView>`).**
The shell forwards props and listens for emits on every page; the landing page reuses the
relevant subset:
```
// props supplied by App.vue (declare the ones used):
defineProps({
  login:          { type: [Object, null], default: null }, // session | null — drives logged-in CTA
  filterCardName: { type: String,         default: '' },     // unused by landing; safe to omit
})
// emits consumed by App.vue's RouterView handlers:
defineEmits(['requireAuth']) // → App.vue openLogin() opens shared AuthDialog
// (App.vue also listens for: TradeCenter, logout, clearFilter — landing only needs requireAuth)
```
- Anonymous primary CTA: `emit('requireAuth')`.
- Logged-in primary CTA (`login` truthy): "Go to app" → locale-aware route into the app
  (e.g. `/{locale}/cards`).
- Feature CTAs: locale-aware `router-link`, e.g.
  `:to="`/${$route.params.locale || 'en'}/cards`"` — mirror the real example at **`App.vue:291`**
  (the privacy footer link). Do NOT mirror `PrivacyPage.vue:6` (hardcoded `to="/"`).

**Router (`frontend/src/router/index.js`).**
- Replace the root entry: `{ path: "", name: "home", component: LandingPage }` (eager import,
  mirroring the current `Search` import at line 5). Root needs **no** legacy unprefixed redirect
  (the `/` → `/${detectLocale()}/` redirect at line 24 already covers it).
- Search remains reachable via the existing `{ path: 'cards', name: 'cards', ... }` child and its
  `/cards` legacy redirect — no change needed there.

**Navigation wiring (`frontend/src/views/App.vue`).**
- Add a `home` entry to the `changePage(name)` pathMap at **`App.vue:366-369`**:
  `const pathMap = { home: `/${lc}/`, search: `/${lc}/cards`, library: ..., decks: ..., TradeCenter: ..., account: ..., cards: `/${lc}/cards` };`
  (Point `home → /{lc}/`; repoint the legacy `search` key to `/{lc}/cards` so any "search" nav
  intent lands on the real search page, not the new landing page.)
- SideNav logo emits `navigate('search')` (`SideNav.vue:50`). Repoint the logo to home: change the
  emitted arg to `'home'` (or map `'search'`→home in the handler). Logo → landing is the
  conventional "home" affordance.

**SEO / meta (`frontend/src/views/App.vue:52-108`, `@unhead/vue`).**
- `App.vue:62` hardcodes `isSearch = page === "search" || !page`. With root renamed to `home`,
  the homepage's meta now resolves from `meta.home.*` automatically via `page()` (`App.vue:317`).
  Verify the `isSearch`/`titleWithQuery` branch no longer fires for the homepage (it was only for
  search query strings, which now live on `/cards`); the homepage should pull `meta.home.{title,desc}`.
- Add `meta.home.{title,desc}` to all four locale files. Canonical + hreflang are auto-derived
  from `route.path`; no per-page head work required (an optional page-level `useHead` may be added
  for self-sufficiency, per the skill — do not call `createUnhead()`).

**i18n.** New top-level `landing` key (hero, feature cards, CTAs, footer) + `meta.home.{title,desc}`,
added to **all four** of `src/locales/{en,fr,de,it}.json`. No hardcoded user-facing strings.

**Responsive (HARD CONSTRAINT).** Any responsive show/hide uses scoped CSS media queries,
mirroring `SideNav.vue:91-108`:
```css
/* scoped */
.desktop-only { display: none; }
@media (min-width: 640px) { .desktop-only { display: flex; } }
```
Never use `hidden sm:flex` (Tailwind v4 base `.hidden` is ordered after `sm:` variants in this
repo, so it stays `display:none` even on desktop). `sm:hidden` to hide on larger screens is safe.

### Expected file changes

| Path | Change |
|------|--------|
| `frontend/src/components/Pages/LandingPage.vue` | **CREATE** — new static, localized, SSR-safe landing page (hero, 4 feature sections, CTAs, footer link). |
| `frontend/src/router/index.js` | **MODIFY** — root `localeChildren[0]` → `{ path:"", name:"home", component: LandingPage }` (eager import). Search stays at the existing `cards` child. |
| `frontend/src/views/App.vue` | **MODIFY** — add `home` to `changePage` pathMap (`:366-369`), repoint legacy `search` key → `/cards`; repoint SideNav logo target → home; verify SEO `isSearch` branch (`:62`) resolves homepage meta from `meta.home.*`. |
| `frontend/src/components/SideNav.vue` | **MODIFY** — logo emits `navigate('home')` (was `'search'`) so the logo lands on the landing page. |
| `frontend/src/locales/{en,fr,de,it}.json` | **MODIFY** — add `landing.*` content keys + `meta.home.{title,desc}` in all 4 locales. |
| `frontend/vite.config.js` | **VERIFY/MODIFY** — `ssgOptions.includedRoutes` already pre-renders `/{locale}/`; confirm it now renders `LandingPage`. No new path to add under Strategy A. |
| `frontend/scripts/generate-sitemap.mjs` | **VERIFY** — `STATIC_PAGES` root `/` stays priority 1.0 (now the landing page). Re-run `npm run sitemap`. |
| `frontend/src/components/Pages/Search.vue` | **KEEP** — not deleted; retirement is a separate follow-up task. |

---

## Implementation Process

Phases: **Setup → Foundational → User-facing content → Polish/SEO**. Steps are ordered by dependency. No step exceeds a Medium estimate.

---

### Parallel Execution Plan

> Each step below is annotated with explicit **Depends on:** / **Parallel with:** / **Agent:** lines and grouped into execution **Waves**. Two independent axes decide concurrency: (A) a **data/logic** dependency (a step needs another's output to function) and (B) a **file-conflict** dependency (two steps editing the **same file** must never run concurrently). The waves honor BOTH. This is a frontend Vue feature with a **mostly-sequential critical path** (`i18n keys → LandingPage.vue → router root swap → App.vue pathMap/SEO → SSG verify`); parallelism is applied only where steps are genuinely independent. The original linear order (`1 → 2 → 3 → 4 → 5 → 6 → 7 → 8`) remains a valid serial fallback; the waves below are the parallel-optimized schedule.

**Waves (run steps within a wave concurrently; finish a wave before starting the next):**

| Wave | Steps (run in parallel) | Gate to enter | Files touched (disjoint within wave) |
|---|---|---|---|
| **Wave 1** | **S1** *(internal fan-out: 4 locales)* | — (start) | `src/locales/{en,fr,de,it}.json` |
| **Wave 2** | **S2** | Wave 1 done | `LandingPage.vue` (new) |
| **Wave 3** | **S3, S7** | Wave 2 done | `router/index.js` · `LandingPage.vue` |
| **Wave 4** | **S4** | Wave 3 done | `App.vue` |
| **Wave 5** | **S5, S6** | Wave 4 done **+ root-route SEO regression verified** | `SideNav.vue` · (`vite.config.js` verify + sitemap output) |
| **Wave 6** | **S8** | Wave 5 done | (E2E verification — no source file) |

**Max parallelization depth = 2** at step/wave granularity (Wave 3 runs S3+S7 concurrently; Wave 5 runs S5+S6 concurrently). **Wave 1 (S1) additionally fans out internally to up to 4 concurrent `sonnet` locale sub-agents** (translate `en` first to lock the key tree, then `fr`/`de`/`it` in parallel) — so the true maximum number of concurrent agents in flight is **4** (during S1).

**Parallelization diagram (waves → steps; arrows = cross-wave dependency):**

```
WAVE 1 (1 step; internal fan-out to 4 locale sub-agents)
  └── S1  i18n landing.* + meta.home.*   [foundational]
          en ─►(locks key tree)─► { fr ∥ de ∥ it }  (3 parallel sonnet sub-agents)
        │
        ▼ (keys exist)
WAVE 2 (1)
  └── S2  LandingPage.vue  hero + 4 feature sections + footer CTA  [critical]
        │
        ├───────────────────────────────────────┐
        ▼ (component exists)                      ▼ (same file, polish pass)
WAVE 3 (2 concurrent — disjoint files: router/index.js vs LandingPage.vue)
   S3  repoint router root → LandingPage  [critical]
   S7  responsive + a11y pass on LandingPage.vue
        │ (root renamed 'home')
        ▼
WAVE 4 (1 — HIGH-risk root-route SEO)
   S4  App.vue pathMap (home / search→/cards) + verify SEO isSearch branch  [critical]
        │ (pathMap 'home' key)               │ (homepage meta.home.*)
        ▼                                     ▼
WAVE 5 (2 concurrent — disjoint files: SideNav.vue vs vite.config/sitemap)
   S5  SideNav logo emit 'search' → 'home'
   S6  SSG prerender + sitemap verify  ◄── S2 (component) + S3 (route) + S4 (meta)
        │
        ▼
WAVE 6 (1)
   S8  E2E verification against Acceptance Criteria (DoD gate)  [verification]
```

**Sub-agent execution directive (for the orchestrator):**

- **Agent type:** ALL implementation/verification steps use **`general-purpose`** (the `sdd:*` agents are not installed in this repo). Model per step is on each step's `Agent:` line and summarized below. The lone trivial edit (S5) uses **`haiku`**; S1 uses **`sonnet`**; everything else uses **`opus`**.
- **MUST run in parallel within their wave** (dispatch as separate sub-agents in a **single batch** — one message, multiple `Agent` calls): **Wave 3 → {S3, S7}**, **Wave 5 → {S5, S6}**. Do NOT serialize these; they are file-disjoint and must run concurrently.
- **S1 internal fan-out (MUST):** within Wave 1, translate `en` **first** (to lock the shared key tree), then dispatch `fr`, `de`, `it` as **3 parallel `sonnet` sub-agents** in one batch. Each writes only its own locale file — no file conflict.
- **Ordering constraints between waves (hard, sequential):** do **not** start wave _N+1_ until **every** step in wave _N_ has completed and (for code waves) the app still builds. Specifically: `Wave 1 → Wave 2 → Wave 3 → Wave 4 → Wave 5 → Wave 6`.
- **Single-file guard:** never run two steps that edit the **same file** in the same wave. The layout already enforces this — **S2** and **S7** both write `LandingPage.vue` and are split across Waves 2/3 (S7 polishes the file S2 created).
- **Data-dependency gate (Wave 5):** **S5** repoints the SideNav logo to emit `'home'`, which only resolves because **S4** added the `home` key to the `changePage` pathMap. Do not dispatch S5 until S4 is merged.
- **HIGH-risk gate (blocks Wave 5):** **S4** carries the root-route SEO regression risk. Before entering Wave 5, **explicitly verify** the homepage now pulls `meta.home.*` and that the search-query meta branch (`App.vue:62`) is unaffected on `/cards?q=…` — verify, do not assume.
- **Optional review:** after Wave 5 (before S8), an optional review pass may run with **`pr-review-toolkit:code-reviewer`** over the full diff.

**Agent / model distribution:** `general-purpose` for all 8 steps. Models — **opus ×6** (S2, S3, S4, S6, S7, S8), **sonnet ×1** (S1), **haiku ×1** (S5). Optional `pr-review-toolkit:code-reviewer` review step (not counted).

---

### Phase 1 — Setup

#### Step 1 — Add i18n content + meta keys for all four locales [DONE]

> **Wave 1.** **Depends on:** nothing (foundational). **Parallel with:** nothing at the step level, but **fans out internally** to up to 4 concurrent locale sub-agents (translate `en` first to lock the key tree, then `fr`/`de`/`it` in parallel). **Agent:** general-purpose (model: sonnet).

- **Goal:** Create the full localized copy surface the page and SEO will bind to, so the component is written against real keys (no hardcoded strings, no missing-key fallbacks).
- **Output/Artifact:** A new top-level `landing` object and a new `meta.home` object added to each of `frontend/src/locales/en.json`, `fr.json`, `de.json`, `it.json`.
  - `landing.hero.{productName, headline, subheadline, ctaGetStarted, ctaGoToApp}`
  - `landing.features.{search,decks,collection,trade}.{title, body, cta}`
  - `landing.footer.*` (reuse existing `footer.privacy`/`footer.contact` where possible; only add landing-specific labels)
  - `meta.home.{title, desc}`
- **Success criteria (testable):**
  - `python3 -c "import json;[print(p, 'landing' in json.load(open(p)) and 'home' in json.load(open(p))['meta']) for p in ['src/locales/%s.json'%l for l in ('en','fr','de','it')]]"` prints `True` for all four.
  - Key sets are identical across the four files (no locale missing a subkey).
  - `npm run build` (or i18n lint if present) shows no missing-key warnings for `landing.*`/`meta.home.*`.
- **Subtasks:** draft EN copy first; translate to fr/de/it; mirror the existing `meta.*` shape (`title`,`desc`); keep keys flat and consistent with neighbours.
- **Blockers:** none (foundational).
- **Risks/Mitigation:** *Locale drift / one file missing a key* → diff the key trees across all four files before moving on (the architecture mandates all four).

- **Verification (LLM-as-Judge):**
  - **Level:** Per-Item — run the rubric once per locale file (en, fr, de, it). Aggregate = **min across the 4 items** (the worst locale gates the step); this directly surfaces the per-locale drift risk from the 4-way parallel fan-out.
  - **Threshold:** 4.0 / 5.0 (per item; min of the 4 must clear 4.0).
  - **Rubric (weights sum to 1.0):**
    | Criterion | Weight | 5 = excellent / 1 = failing |
    |---|---|---|
    | Key-tree parity with EN | 0.35 | 5: this locale's `landing.*` + `meta.home.*` key set is byte-for-byte identical in structure to `en.json` (same nested keys: `hero.{productName,headline,subheadline,ctaGetStarted,ctaGoToApp}`, `features.{search,decks,collection,trade}.{title,body,cta}`, `footer.*`, `meta.home.{title,desc}`). 1: any key missing, extra, or misnested vs EN. |
    | Translation completeness & fidelity | 0.30 | 5: every value is genuinely translated into the target language (no English left in fr/de/it, no placeholder/echo of the key), and meaning matches EN. 1: untranslated, machine-garbled, or wrong-meaning strings. |
    | Shape consistency with existing `meta.*` | 0.20 | 5: `meta.home` mirrors the existing sibling `meta.*` entries' `{title,desc}` field names and string conventions exactly. 1: divergent field names or structure. |
    | No raw-key / no-hardcode hygiene | 0.15 | 5: values are human copy, not i18n key paths; no trailing dev artifacts; valid JSON. 1: leftover `landing.x.y`-style values or invalid JSON. |

### Phase 2 — Foundational

#### Step 2 — Create `LandingPage.vue` (SSR-safe, static, localized)  — *largest step (Medium)* [DONE]

> **Wave 2.** **Depends on:** S1 (binds `t('landing.*')` / `meta.home.*` keys — written against real keys). **Parallel with:** nothing (alone in its wave; downstream steps need this file, and S7 conflicts on the same file). **Agent:** general-purpose (model: opus).

- **Goal:** Build the page component: hero + four feature sections + footer-adjacent CTA, fully driven by Step 1 keys, reusing the shell's prop/emit contract.
- **Output/Artifact:** `frontend/src/components/Pages/LandingPage.vue` (`<script setup>`).
  - `useI18n()` for all copy; theme via `--c-*` CSS vars; Tailwind for layout/spacing/typography only.
  - `defineProps({ login: { type: [Object, null], default: null } })`.
  - `defineEmits(['requireAuth'])`.
  - Hero primary CTA: anonymous → `emit('requireAuth')`; logged-in (`login` truthy) → "Go to app" locale-aware `router-link` to `/{locale}/cards`.
  - Feature CTAs: locale-aware `router-link`s mirroring `App.vue:291`, e.g. `:to="`/${$route.params.locale || 'en'}/cards`"` (search → `/cards`, decks → `/decks`, collection → `/library`, trade → `/trade`). Do NOT mirror `PrivacyPage.vue:6` hardcoded `to="/"`.
  - Footer area links to `/{locale}/privacy`.
  - SSR-safe: no top-level `window`/`document`/`localStorage`; browser-only work inside `onMounted`.
- **Success criteria (testable):**
  - File contains exactly one `<h1>` (hero headline) and logical `<h2>` section headings.
  - No occurrence of `class="hidden` combined with a `sm:`/`md:` show variant (grep clean); responsive show/hide done in scoped `<style>`.
  - No top-level reference to `window`/`document`/`localStorage` outside `onMounted` (grep).
  - Component imports and compiles (`npm run build` succeeds once routed in Step 3).
- **Subtasks:** scaffold template (hero, 4 sections, footer CTA); wire props/emits; bind all text to `t('landing.*')`; add `alt` text keys for any imagery; add scoped responsive CSS.
- **Blockers:** Step 1 (keys must exist).
- **Risks/Mitigation:**
  - *Tailwind v4 `hidden sm:flex` stays hidden on desktop* → use scoped CSS media queries mirroring `SideNav.vue:91-108`; `sm:hidden` (hide-on-large) is safe.
  - *SSR build crash from browser globals at module top level* → keep all DOM access in `onMounted`; verify in Step 6 prerender.

- **Verification (LLM-as-Judge):**
  - **Level:** **Panel (3 judges)** — HIGH criticality (largest step; SSR-safety + Tailwind-v4 gotcha + shell-contract reuse). Judges apply independent lenses: **J1 Spec/Correctness**, **J2 SSR-safety & Tailwind-v4 risk**, **J3 Architecture/Convention-fit**. Final score = mean of the 3 judge scores against the shared rubric below. **Gate:** mean ≥ 4.0 **and** no single judge < 3.5.
  - **Threshold:** 4.0 / 5.0 (panel mean).
  - **Rubric (weights sum to 1.0):**
    | Criterion | Weight | 5 = excellent / 1 = failing |
    |---|---|---|
    | i18n binding (no hardcoded copy) | 0.20 | 5: all hero/feature/footer text bound via `t('landing.*')`; image `alt` also keyed. 1: any user-facing literal string. |
    | Shell prop/emit contract reuse | 0.20 | 5: `defineProps({ login:{type:[Object,null],default:null} })` + `defineEmits(['requireAuth'])`; anonymous primary CTA emits `requireAuth`, logged-in (`login` truthy) renders "Go to app" locale-aware `router-link` to `/{locale}/cards`. 1: invents a new modal or breaks the App.vue contract. |
    | Feature-CTA locale-aware routing | 0.20 | 5: 4 feature CTAs are locale-aware `router-link`s mirroring `App.vue:291` (search→`/cards`, decks→`/decks`, collection→`/library`, trade→`/trade`); does NOT mirror the hardcoded `PrivacyPage.vue:6 to="/"`. 1: hardcoded/non-locale paths or wrong targets. |
    | SSR-safety | 0.20 | 5: zero top-level `window`/`document`/`localStorage`; any DOM work inside `onMounted`. 1: browser global at module/setup top level (would crash SSG prerender). |
    | Responsive technique + heading structure | 0.20 | 5: exactly one `<h1>` + logical `<h2>`s; all responsive show/hide in scoped `<style>` media queries (no `class="hidden"` + `sm:`/`md:` show variant). 1: Tailwind `hidden sm:flex` pattern present or multiple/zero H1. |

### Phase 3 — User-facing content (wiring + navigation)

#### Step 3 — Repoint the router root to LandingPage (Strategy A)

> **Wave 3.** **Depends on:** S2 (eager-imports `LandingPage.vue`; the target file must exist). **Parallel with:** S7 (disjoint files — `router/index.js` vs `LandingPage.vue`; no data dependency between them). **Agent:** general-purpose (model: opus).

- **Goal:** Make the landing page the public home at `/{locale}/` while keeping search at `/{locale}/cards`.
- **Output/Artifact:** `frontend/src/router/index.js`.
  - Add eager import mirroring line 5: `import LandingPage from "@/components/Pages/LandingPage.vue";`
  - Replace `localeChildren[0]` (`:9`): `{ path: "", name: "home", component: LandingPage }`.
  - Leave the `cards` child (`:19`), the `/` → locale redirect (`:24`), and all legacy redirects unchanged.
- **Success criteria (testable):**
  - Navigating to `/en/` renders LandingPage; `/en/cards` still renders `CardsPage`.
  - `route.name` at root is `home`.
  - No new unprefixed root redirect added (the `:24` redirect already covers `/`).
- **Subtasks:** add import; swap child entry; smoke-test both routes in dev.
- **Blockers:** Step 2.
- **Risks/Mitigation:** *Eager import bloats initial bundle* → it replaces the previously-eager `Search.vue` at root; net weight comparable (accepted in architecture). One-line rollback documented in Resolved Decisions.

- **Verification (LLM-as-Judge):**
  - **Level:** **Panel (3 judges)** — HIGH criticality (root-route swap = direct SEO/index regression surface). Lenses: **J1 Route-correctness**, **J2 Regression (search still intact)**, **J3 Convention/rollback-fit**. Final = mean of 3 against the rubric. **Gate:** mean ≥ 4.3 **and** no single judge < 4.0.
  - **Threshold:** 4.3 / 5.0 (panel mean; raised for HIGH-criticality root-route swap).
  - **Rubric (weights sum to 1.0):**
    | Criterion | Weight | 5 = excellent / 1 = failing |
    |---|---|---|
    | Root entry correctly repointed | 0.35 | 5: `localeChildren[0]` is `{ path:"", name:"home", component: LandingPage }` with the eager import mirroring line 5; `/en/` renders LandingPage and `route.name` at root is `home`. 1: wrong name, lazy import where eager expected, or root still mounts Search. |
    | Search path preserved (regression) | 0.30 | 5: the `cards` child and `/cards` legacy redirect are untouched; `/en/cards` still renders `CardsPage`. 1: search route altered, removed, or broken. |
    | No redundant/incorrect redirects | 0.20 | 5: no new unprefixed root redirect added (the existing `/`→`/{detectLocale()}/` at `:24` already covers it); all legacy redirects untouched. 1: duplicate/conflicting redirect introduced. |
    | Rollback integrity & scope discipline | 0.15 | 5: change is exactly the documented one-line-revertible swap; no unrelated router edits. 1: extra changes that complicate the documented rollback. |

#### Step 4 — Update `App.vue` navigation pathMap + verify SEO branch

> **Wave 4.** **Depends on:** S1 (`meta.home.*` keys for the SEO branch) + S3 (root renamed `home`, so homepage meta resolves via `page()`). **Parallel with:** nothing (alone — edits `App.vue`; S5 has a data dependency on the pathMap added here, and S6 needs the homepage SEO meta verified here). **Agent:** general-purpose (model: opus). *HIGH-risk: root-route SEO regression — verify, do not assume.*

- **Goal:** Ensure "home" nav intent resolves to the landing page, "search" intent lands on real search, and homepage SEO meta now resolves from `meta.home.*`.
- **Output/Artifact:** `frontend/src/views/App.vue`.
  - In `changePage` pathMap (`:366-369`): add `home: `/${lc}/``; repoint `search: `/${lc}/cards`` (so any legacy "search" nav goes to real search, not landing). Keep `cards: `/${lc}/cards``.
  - Verify SEO branch (`:62`): with root renamed `home`, `meta.home.{title,desc}` resolves via `page()` (`:317`); confirm the `isSearch`/`titleWithQuery` branch no longer fires for the homepage (it only ever applied to search `q` strings, now living on `/cards`).
- **Success criteria (testable):**
  - `changePage('home')` pushes `/{lc}/`; `changePage('search')` pushes `/{lc}/cards`.
  - On `/en/`, `document.title` equals `meta.home.title` (not `meta.search.title`).
  - On `/en/cards?q=foo`, the `titleWithQuery` search meta still works (regression check).
- **Subtasks:** edit pathMap; load `/en/` and assert title; load `/en/cards?q=x` and assert query title intact.
- **Blockers:** Steps 1, 3.
- **Risks/Mitigation:** *Root-route SEO regression* (HIGH) → explicitly verify homepage pulls `meta.home.*` and that the search-query meta branch is unaffected, rather than assuming.

- **Verification (LLM-as-Judge):**
  - **Level:** **Panel (3 judges)** — HIGH criticality (this step carries the named #1 high-priority root-route SEO regression risk). Lenses: **J1 SEO-meta-correctness**, **J2 Search-query-meta regression**, **J3 pathMap/nav-intent correctness**. Final = mean of 3 against the rubric. **Gate:** mean ≥ 4.3 **and** no single judge < 4.0. *Evidence required: actual observed `document.title` on `/en/` and `/en/cards?q=foo`, not assertion.*
  - **Threshold:** 4.3 / 5.0 (panel mean; raised — this is the highest-risk step in the plan).
  - **Rubric (weights sum to 1.0):**
    | Criterion | Weight | 5 = excellent / 1 = failing |
    |---|---|---|
    | Homepage meta resolves from `meta.home.*` | 0.30 | 5: on `/en/`, observed `document.title` equals `meta.home.title` (verified, not assumed); the `isSearch`/`titleWithQuery` branch (`:62`) no longer fires for the homepage. 1: homepage still pulls `meta.search.*` or raw/empty title. |
    | Search-query meta unregressed | 0.30 | 5: on `/en/cards?q=foo` the `titleWithQuery` branch still produces the query-aware title exactly as before. 1: search query title broken or changed. |
    | pathMap correctness | 0.25 | 5: `home: `/${lc}/`` added, `search: `/${lc}/cards`` repointed, `cards: `/${lc}/cards`` kept; `changePage('home')`→`/{lc}/`, `changePage('search')`→`/{lc}/cards`. 1: missing `home` key or `search` still points at root. |
    | Verification rigor (evidence not assumption) | 0.15 | 5: both title assertions backed by observed values from a real route load. 1: branch behavior asserted without loading the routes. |

#### Step 5 — Repoint SideNav logo to home

> **Wave 5.** **Depends on:** S4 (logo emits `'home'`; `changePage('home')` only resolves because S4 added the `home` key to the pathMap). **Parallel with:** S6 (disjoint files — `SideNav.vue` vs `vite.config.js`/sitemap). **Agent:** general-purpose (model: haiku — one-line emit-arg edit).

- **Goal:** The logo (conventional "home" affordance) lands on the landing page, not search.
- **Output/Artifact:** `frontend/src/components/SideNav.vue:50` — change `emit('navigate', 'search')` → `emit('navigate', 'home')` (App.vue's `changePage('home')` from Step 4 maps it to `/{lc}/`).
- **Success criteria (testable):** Clicking the SideNav logo navigates to `/{locale}/` (LandingPage).
- **Subtasks:** edit emit arg; confirm `home` key exists in pathMap (Step 4).
- **Blockers:** Step 4.
- **Risks/Mitigation:** *Logo dead-clicks if pathMap lacks `home`* → Step 4 adds the key; `changePage` already falls back to `/${lc}/` so even an unmapped name is safe.

- **Verification (LLM-as-Judge):**
  - **Level:** **None** — LOW criticality. Single-line emit-arg change (`'search'`→`'home'`) with a built-in safe fallback (`changePage` already defaults to `/${lc}/` for any unmapped name). Covered by the deterministic success criterion (clicking the logo navigates to `/{locale}/`) and re-checked in S8; no LLM evaluation warranted.
  - **Threshold:** n/a.

### Phase 4 — Polish / SEO

#### Step 6 — Verify SSG prerender + sitemap

> **Wave 5.** **Depends on:** S2 (component must prerender) + S3 (root route) + S4 (homepage SEO meta). **Parallel with:** S5 (disjoint files — `vite.config.js` verify + sitemap output vs `SideNav.vue`). **Agent:** general-purpose (model: opus — prerender inspection + hydration-mismatch reasoning).

- **Goal:** Confirm the landing page prerenders statically and the sitemap still treats root as the priority-1.0 homepage.
- **Output/Artifact:** Verified `frontend/vite.config.js` `includedRoutes` (already pushes `/{locale}/` at `:50-53` — no edit expected); regenerated sitemap.
- **Success criteria (testable):**
  - `npm run build` completes; emitted `dist/{en,fr,de,it}/index.html` contain rendered landing hero copy (not an empty shell).
  - `npm run sitemap` runs clean; `STATIC_PAGES` root `/` stays `priority 1.0`.
- **Subtasks:** run build; inspect a prerendered index.html for hero text; run sitemap; diff output.
- **Blockers:** Steps 2–4.
- **Risks/Mitigation:** *SSG prerender fails on browser globals / hydration mismatch* (HIGH) → Step 2's SSR-safety; if a mismatch appears, move offending logic into `onMounted`.

- **Verification (LLM-as-Judge):**
  - **Level:** **Panel (3 judges)** — HIGH criticality (SSG/SEO verify: static prerender integrity + priority-1.0 homepage in the sitemap). Lenses: **J1 Prerender-output integrity**, **J2 Sitemap/SEO-priority correctness**, **J3 Hydration/build-health**. Final = mean of 3 against the rubric. **Gate:** mean ≥ 4.3 **and** no single judge < 4.0. *Evidence required: actual emitted `dist/{locale}/index.html` contents and sitemap output, not assertion.*
  - **Threshold:** 4.3 / 5.0 (panel mean; raised for SEO-critical SSG verify).
  - **Rubric (weights sum to 1.0):**
    | Criterion | Weight | 5 = excellent / 1 = failing |
    |---|---|---|
    | Prerendered hero content present | 0.35 | 5: `npm run build` succeeds and `dist/{en,fr,de,it}/index.html` each contain rendered landing hero copy (not an empty `#app` shell). 1: empty shell, missing locale output, or build failure. |
    | Sitemap homepage priority preserved | 0.30 | 5: `npm run sitemap` runs clean and `STATIC_PAGES` root `/` stays `priority 1.0` (now the landing page). 1: priority changed/dropped or sitemap errors. |
    | No hydration mismatch / build warnings | 0.20 | 5: build/prerender emits no hydration-mismatch warning attributable to LandingPage; no browser-global crash. 1: hydration mismatch or SSR crash. |
    | Config discipline | 0.15 | 5: `includedRoutes` already covers `/{locale}/` — verified, no spurious edit needed (or a minimal justified one). 1: unnecessary/incorrect config change. |

#### Step 7 — Responsive + accessibility pass

> **Wave 3.** **Depends on:** S2 (polishes the `LandingPage.vue` file S2 created). **Parallel with:** S3 (disjoint files — `LandingPage.vue` vs `router/index.js`). **Agent:** general-purpose (model: opus). *Single-file guard: S7 and S2 both write `LandingPage.vue` and are therefore split across Waves 2/3 — never the same wave.*

- **Goal:** Meet the responsive and a11y NFRs.
- **Output/Artifact:** Scoped-CSS adjustments in `LandingPage.vue` as needed.
- **Success criteria (testable):**
  - At ~375px: content stacks vertically, no horizontal overflow, no overlap, all CTAs reachable.
  - Single H1, logical heading order; all CTAs keyboard-focusable/operable; all images have `alt`.
  - Image-load-failure: text + CTAs still render and remain usable.
- **Subtasks:** test 375px and desktop in preview; tab through CTAs; null an image src and confirm graceful fallback.
- **Blockers:** Step 2.
- **Risks/Mitigation:** *Tailwind v4 hidden gotcha resurfacing* → re-grep for `hidden ` + responsive variants; keep all show/hide in scoped CSS.

- **Verification (LLM-as-Judge):**
  - **Level:** **Single** — MEDIUM criticality (NFR polish on an existing file; testable in preview, not SEO-critical). One judge applies the rubric. **Gate:** score ≥ 4.0.
  - **Threshold:** 4.0 / 5.0.
  - **Rubric (weights sum to 1.0):**
    | Criterion | Weight | 5 = excellent / 1 = failing |
    |---|---|---|
    | Mobile (~375px) layout integrity | 0.30 | 5: content stacks vertically with no horizontal overflow, no overlap, all CTAs reachable. 1: overflow, overlap, or unreachable CTA. |
    | Heading & keyboard a11y | 0.30 | 5: single H1 + logical heading order; every CTA keyboard-focusable and operable. 1: multiple/zero H1, broken order, or non-focusable CTA. |
    | Image alt + load-failure resilience | 0.20 | 5: all images have `alt`; with an image src nulled, text + CTAs still render and stay usable. 1: missing alt or broken layout on image failure. |
    | Responsive technique compliance | 0.20 | 5: show/hide stays in scoped CSS media queries; re-grep confirms no `class="hidden"` + `sm:`/`md:` show variant. 1: Tailwind hidden+responsive pattern present. |

#### Step 8 — End-to-end verification against Acceptance Criteria (DoD gate)

> **Wave 6.** **Depends on:** S1–S7 (final DoD walkthrough across every acceptance scenario and all four locales). **Parallel with:** nothing (alone — terminal verification gate). **Agent:** general-purpose (model: opus). *Optional `pr-review-toolkit:code-reviewer` diff review may precede this step.*

- **Goal:** Walk every acceptance scenario and confirm pass.
- **Output/Artifact:** Verification notes; any tests added.
- **Success criteria (testable):** Anonymous render; hero present; 4 feature sections; feature CTA navigation; anonymous primary CTA opens AuthDialog; logged-in shows "Go to app" → app; all 4 locales translated with no raw keys; footer Privacy link works; unsupported locale falls back (handled by `beforeEnter` `:46`) with no crash/untranslated keys.
- **Subtasks:** drive each scenario in preview (use the real router per the vnode-crash memory note); add/adjust tests; confirm DoD checklist.
- **Blockers:** Steps 1–7.
- **Risks/Mitigation:** *Untranslated keys in a non-default locale* → covered by Step 1 key-tree diff; re-verify here per locale.

- **Verification (LLM-as-Judge):**
  - **Level:** **Single** — MEDIUM criticality (terminal DoD gate; broad coverage but largely re-verifies work already gated by S1–S7's own verifications). One judge applies the rubric across all acceptance scenarios and four locales. **Gate:** score ≥ 4.0.
  - **Threshold:** 4.0 / 5.0.
  - **Rubric (weights sum to 1.0):**
    | Criterion | Weight | 5 = excellent / 1 = failing |
    |---|---|---|
    | Core flows pass | 0.30 | 5: anonymous render; hero present; 4 distinct feature sections; each feature CTA navigates to its existing route. 1: any core flow broken. |
    | Auth-state CTA behavior | 0.25 | 5: anonymous primary CTA opens the shared AuthDialog (`requireAuth`); logged-in shows "Go to app" → routes into the app. 1: wrong CTA per auth state or no AuthDialog. |
    | Localization completeness (4 locales) | 0.25 | 5: en/fr/de/it all fully translated with zero raw i18n keys visible; unsupported locale falls back via `beforeEnter` (`:46`) with no crash and no untranslated keys. 1: raw keys, missing locale, or fallback crash. |
    | Footer + DoD-checklist closure | 0.20 | 5: footer Privacy link present and navigates correctly; every DoD checkbox substantiated by an observed result (tests added/passing where claimed). 1: broken footer link or unsubstantiated DoD claims. |

### Implementation Summary

| # | Step | Phase | Wave | Primary artifact | Est. | Depends on | Parallel with | Agent (model) |
|---|------|-------|------|------------------|------|------------|---------------|---------------|
| 1 | i18n content + `meta.home` keys (4 locales) | Setup | W1 | `src/locales/{en,fr,de,it}.json` | S | — | — *(internal fan-out ×4 locales)* | general-purpose (sonnet) |
| 2 | Create `LandingPage.vue` (SSR-safe) | Foundational | W2 | `src/components/Pages/LandingPage.vue` | M | 1 | — | general-purpose (opus) |
| 3 | Repoint router root → LandingPage | User-facing | W3 | `src/router/index.js` | S | 2 | 7 | general-purpose (opus) |
| 4 | App.vue pathMap + SEO branch verify | User-facing | W4 | `src/views/App.vue` | S | 1,3 | — | general-purpose (opus) |
| 5 | SideNav logo → home | User-facing | W5 | `src/components/SideNav.vue` | S | 4 | 6 | general-purpose (haiku) |
| 6 | SSG prerender + sitemap verify | Polish/SEO | W5 | `vite.config.js`, sitemap output | S | 2,3,4 | 5 | general-purpose (opus) |
| 7 | Responsive + a11y pass | Polish/SEO | W3 | `LandingPage.vue` | S | 2 | 3 | general-purpose (opus) |
| 8 | E2E verification (DoD gate) | Polish/SEO | W6 | tests / verification notes | M | 1–7 | — | general-purpose (opus) |

**Critical path:** 1 → 2 → 3 → 4 → 6 → 8 (Step 4 also feeds 5; Step 2 also feeds 7).

**Waves:** W1 {1} · W2 {2} · W3 {3 ∥ 7} · W4 {4} · W5 {5 ∥ 6} · W6 {8}. **Max parallelization depth = 2** at step granularity (W3, W5); **up to 4 concurrent agents** during S1's internal locale fan-out. **Agent/model distribution:** general-purpose ×8 — opus ×6 (2,3,4,6,7,8), sonnet ×1 (1), haiku ×1 (5).

**High-priority risks:**
1. **Root-route SEO regression** — homepage meta must now resolve from `meta.home.*` and the search-query meta branch (`App.vue:62`) must be unaffected. *Mitigation:* explicit verification in Step 4, not assumption.
2. **Tailwind v4 `hidden`+responsive gotcha** — `hidden sm:flex` stays `display:none` on desktop in this repo. *Mitigation:* scoped CSS media queries only (mirror `SideNav.vue:91-108`); enforced in Steps 2 & 7.
3. **SSG prerender / hydration** — landing page must be SSR-safe to prerender into static index.html. *Mitigation:* no top-level browser globals (Step 2); build-time verification (Step 6).

### Definition of Done

- [ ] All acceptance criteria (Functional + Non-Functional) pass via Step 8 walkthrough.
- [ ] `LandingPage.vue` created, SSR-safe, single H1, scoped-CSS responsive (no `hidden sm:*`).
- [ ] Router root renders LandingPage at `/{locale}/`; search intact at `/{locale}/cards`.
- [ ] `App.vue` pathMap has `home`; `search`→`/cards`; homepage SEO resolves `meta.home.*`; search-query meta unregressed.
- [ ] SideNav logo lands on home.
- [ ] `landing.*` + `meta.home.*` present and consistent across en/fr/de/it; no raw keys in any locale.
- [ ] `npm run build` prerenders landing hero into `dist/{locale}/index.html`; `npm run sitemap` clean with root priority 1.0.
- [ ] Tests written and passing; code reviewed; docs updated.

---

## Verification Summary

LLM-as-Judge verifications, calibrated to per-step criticality. Panel steps use 3 independent judges (J1 Correctness/Spec, J2 Regression/Risk, J3 Architecture/Convention-fit) scored against the shared step rubric; final = panel mean, gated additionally so no single judge falls more than 0.5 below threshold. Per-Item (S1) runs once per locale and aggregates as the **min** across the 4 files.

| Step | Artifact | Criticality | Level | Evaluations | Threshold | Notes |
|---|---|---|---|---|---|---|
| S1 | `locales/{en,fr,de,it}.json` | MEDIUM | **Per-Item** | 4 (one/locale) | 4.0 (min of 4) | Aggregate = worst locale; surfaces parallel-fan-out drift. |
| S2 | `LandingPage.vue` | HIGH | **Panel** | 3 | 4.0 | SSR-safety + Tailwind-v4 + shell contract. |
| S3 | `router/index.js` | HIGH | **Panel** | 3 | 4.3 | Root-route swap (SEO/index regression). |
| S4 | `App.vue` pathMap + SEO | HIGH | **Panel** | 3 | 4.3 | #1 risk: root-route SEO regression; evidence-backed. |
| S5 | `SideNav.vue` (1-line emit) | LOW | **None** | 0 | n/a | Trivial; safe fallback; covered by det. criterion + S8. |
| S6 | SSG prerender + sitemap | HIGH | **Panel** | 3 | 4.3 | Static prerender + priority-1.0 homepage integrity. |
| S7 | `LandingPage.vue` (a11y/responsive) | MEDIUM | **Single** | 1 | 4.0 | NFR polish; preview-testable. |
| S8 | E2E / DoD gate | MEDIUM | **Single** | 1 | 4.0 | Terminal walkthrough; re-verifies gated work. |

**Totals:** 7 of 8 steps verified · **18 evaluations** total.
**Level breakdown:** Panel ×4 (S2, S3, S4, S6 → 12 judge-evals) · Per-Item ×1 (S1 → 4 locale-evals) · Single ×2 (S7, S8 → 2 evals) · None ×1 (S5).
