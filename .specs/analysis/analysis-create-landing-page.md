# Codebase Impact Analysis — Create Landing Page

Task: `.specs/tasks/draft/create-landing-page.feature.md`
Phase: 2b — Codebase Impact Analysis
Project: TradeMarket / "One for One" — Vue 3 SPA in `frontend/`, vite-ssg (SSR/SSG), Vuetify 3, Tailwind v4, vue-i18n (en/fr/de/it), vue-router 4.

---

## 0. The central decision (read first)

There is **no dedicated landing/home page today**. The root locale route `""` (name `search`)
maps directly to `Search.vue`, which the router comments call *"the landing page every user
hits first"* and is the only **eagerly-loaded** page (`frontend/src/router/index.js:5,9`).
`vite.config.js` explicitly pre-renders `/{locale}/` as the SSG homepage, and the sitemap +
`useHead` SEO logic both treat root (`page === 'search' || !page`) as the canonical homepage
with priority 1.0.

So "add a landing page" forks into two viable strategies. The plan phase must pick one.

- **Strategy A — Landing at root (`/{locale}/`); search served at `/{locale}/cards`.**
  Marketing home page becomes the indexed homepage. Higher SEO value, touches the most files
  (root route, eager import, SEO `isSearch` branch, sitemap, nav "home" targets). `CardsPage.vue`
  already lives at `/cards` and is the real search destination, so root currently double-serves
  search — A resolves that. Cleaner long term.
- **Strategy B — Landing at a new path (e.g. `/{locale}/home`), root unchanged.** Lowest risk,
  purely additive. Root keeps serving Search. Downside: landing page is not the indexed homepage.

**Recommendation: Strategy A** (navbar search + SideNav "Search" already route to `cards`, so
root serving Search is redundant). Rest of doc assumes A, notes B deltas.

---

## 1. Files to CREATE

| Path | Purpose |
|------|---------|
| `frontend/src/components/Pages/LandingPage.vue` | New landing/home page. Mirror page conventions (see §5). `<script setup>`, uses `useI18n`/`useRouter`; CTAs route to `cards` or `emit('requireAuth')`. |
| (optional) `frontend/src/components/landing/*.vue` | Only if decomposing into hero/feature/CTA sections. Not required for a single-file page. |

No new router file, store, or composable — routing is centralized in one file.

## 2. Files to MODIFY

| Path | Change | Strategy |
|------|--------|----------|
| `frontend/src/router/index.js` | Add route. (A) `""` → `LandingPage` (name e.g. `home`); search stays available at existing `cards` route. (B) add `{ path: 'home', name: 'home', component: () => import(...) }` to `localeChildren` + a `/home` legacy redirect. Lazy-load like every non-Search page. | A & B |
| `frontend/vite.config.js` | `ssgOptions.includedRoutes` (:42-77). (A) `/{locale}/` already pre-rendered → now renders LandingPage, verify. (B) push `/{locale}/home`. | A & B |
| `frontend/src/locales/{en,fr,de,it}.json` | Add `meta.<routeName>.title`/`.desc` (App.vue reads `meta.${page}.*`) + `landing.*` content keys (hero, CTAs, features). All 4 locales. `meta` block at `en.json:604`. | A & B |
| `frontend/src/views/App.vue` | (A) SEO `useHead` `isSearch = page === 'search' \|\| !page` (:62) hardcodes root===search — retitle so homepage meta comes from landing keys. `changePage` pathMap (:368) + SideNav logo (`'search'`) send home to `/{locale}/`; decide logo → landing vs cards. Mobile-tab `search` already → cards (:322), fine. (B) minimal/none. | A heavy, B light |
| `frontend/scripts/generate-sitemap.mjs` | `STATIC_PAGES` (:83): `/` pri 1.0 daily. (A) now = landing, keep 1.0. (B) optionally add `/home`. Re-run `npm run sitemap`. | A & B |
| `frontend/src/components/SideNav.vue` | Logo emits `navigate('search')` (:50) → `/{locale}/`. (A) confirm logo lands on landing. Rail "Search" item targets `cards` (:28), unaffected. | A (verify) |

## 3. Files to DELETE

None. `Search.vue` is kept. Under A its content is largely duplicated by `CardsPage.vue`; a
follow-up could retire `Search.vue`, but that is a separate task — do not delete here.

---

## 4. Key interfaces & contracts

### Router (`frontend/src/router/index.js`)
- `localeChildren[]` of `{ path, name, component }`. Root `{ path:"", name:"search", component: Search }` (eager). Non-root pages lazy: `() => import(/* webpackChunkName */ "@/components/Pages/X.vue")`.
- Two layers: locale parent `/:locale` with `beforeEnter` validating `SUPPORTED`; plus top-level legacy redirects (`/library → /{detectLocale()}/library`, lines 27-36). **Any new non-root path needs a matching legacy redirect.**
- `scrollBehavior` resets top on path change; `to.hash` jumps with 80px offset (useful for anchor nav).

### Page-component contract (`<RouterView>` in App.vue:255-266)
Each page rendered `<component :is="Component" ... />` receives props `:login` (session|null), `:filter-card-name`; listens `@TradeCenter`, `@requireAuth` (opens AuthDialog), `@logout`, `@clear-filter`. Landing page need not declare them, but a "Sign up" CTA should `emit('requireAuth')` (declare via `defineEmits(['requireAuth'])`) or route to `cards`.

### SEO head (`App.vue:52-108`, `@unhead/vue`)
- Title/desc via `t('meta.<route.name>.title')`, fallback `meta.search.*`.
- `isSearch = (page === 'search' || !page)` (:62) is hardcoded root===search → Strategy A must update it.
- Canonical + hreflang auto-derived from `route.path` — no per-page work.

### i18n
- `useI18n()` (composition); `$t` global in templates. `meta.<name>` block at `en.json:604`. New copy under a new top-level `landing` key.

### Reusable building blocks the landing page CAN use
- Vuetify globals (`v-icon`, `v-btn`, `v-tooltip`), MDI icon font.
- `NavItem.vue`, `CardElement.vue`/`CardYugi.vue` (card thumbnails), `UserCard.vue`, `TcgPlayerAd.vue`.
- CSS theme vars (§6) instead of Vuetify color props.
- Locale-aware link pattern: `:to="`/${$route.params.locale || 'en'}/cards`"` (App.vue:291, PrivacyPage.vue:6).

---

## 5. Pattern to mirror (existing page conventions)

`PrivacyPage.vue` + `Search.vue` are the closest templates for a mostly-static content page:
- Wrapper `<div class="max-w-2xl mx-auto py-10 md:py-16 flex flex-col gap-8">` (wider `max-w-*` for a hero).
- Layout via Tailwind utilities + **inline `style="color: var(--c-text)"`** for theme colors (dominant repo pattern — colors from CSS vars so they switch with theme).
- `<script setup>`, page-local data as plain consts (`PrivacyPage.SECTIONS`).
- Locale-aware internal links; lazy registration with `webpackChunkName` comment.

---

## 6. Integration points

1. **Routing** — route + (non-root) legacy redirect in `router/index.js`; register in `vite.config.js includedRoutes` for all 4 locales.
2. **Navigation** — SideNav logo (`navigate('search')`), App `changePage` pathMap, mobile-tab `search` action. Top navbar search box always → `cards` (App.vue:25-45), never lands home.
3. **Global styling** — `src/assets/main.css` defines `--c-*` vars (light `:root`, dark `html.dark`); Vuetify themes (`neonDusk`/`neonDuskLight`) in `main.js`. Consume `--c-*`; scoped styles only for custom bits.
4. **i18n** — meta + content keys across 4 locale JSONs.
5. **Responsive** — `sm` = 640px; bottom tab bar shows only when authenticated & `< 640px`; side rail only `≥ 640px`.

---

## 7. Repo gotcha — Tailwind v4 `hidden sm:flex` bug (HARD CONSTRAINT)

In this repo's Tailwind v4, base `.hidden` is ordered **after** `sm:` variants, so
`class="hidden sm:flex"` stays `display:none` at **all** breakpoints incl. desktop. Documented
in `SideNav.vue:91-108` and the user's memory file.

**Mitigation:** drive responsive show/hide from **scoped CSS media queries**, like SideNav:
```css
.foo { display: none; }
@media (min-width: 640px) { .foo { display: flex; } }
```
Do NOT use `hidden sm:flex` / `hidden md:block`. (`sm:hidden` to HIDE on larger screens, as the
mobile nav does at App.vue:229, is the safe direction and works.)

---

## 8. Risk assessment

**Overall: LOW–MEDIUM.** New content page is low-risk; risk concentrates in the root-route
policy change (Strategy A).

| Area | Risk | Mitigation |
|------|------|-----------|
| Repointing root `""` Search → Landing (A) | **MEDIUM** — breaks implicit "root===search" in SEO (App.vue:62), sitemap, nav; could regress search-homepage SEO. | Update `isSearch` branch + meta keys with the route; keep `/cards` as canonical search URL (already indexed at 0.9); QA prerendered `/{locale}/` HTML. Or pick Strategy B. |
| SSG prerender of route with auth/CTA logic | LOW | Keep SSR-safe: guard `localStorage`/`window`/`document` (App.vue uses `typeof document === 'undefined'`). Avoid on-mount fetching. |
| Tailwind responsive bug | LOW (if rule followed) | Scoped-CSS media queries only (§7). |
| Missing locale keys | LOW | Add `meta.<name>` + `landing.*` to all 4 JSONs; `missingWarn:false` already set for meta. |
| Legacy redirect omission (B) | LOW | Add `/<path> → /{detectLocale()}/<path>` alongside lines 27-36. |
| Theme mismatch from Vuetify color props | LOW | Use `--c-*` CSS vars. |

---

## 9. Open questions for plan phase
1. Strategy A or B? (recommend A.) Determines blast radius.
2. If A: SideNav logo + `changePage('search')` → landing or `/cards`? (Logo → landing conventional.)
3. Retire `Search.vue` in a follow-up once root no longer uses it? (Out of scope here.)
4. Does landing need live data (trending cards/counts) or fully static copy? Static keeps SSG trivial.
