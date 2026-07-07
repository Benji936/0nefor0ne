---
name: landing-page-construction
description: Build or extend a marketing/landing page in this Vue 3 + Vuetify + Tailwind v4 + vite-ssg codebase (One for One / TradeMarket). Use when creating a hero, feature sections, value props, CTAs, or any logged-out marketing surface. Covers locale routing, SSG pre-render, useHead SEO, CSS-variable theming, and the Tailwind v4 responsive gotcha. Do NOT introduce a new framework.
---

# Landing Page Construction (this repo)

Reusable guidance for building landing / marketing pages in the `frontend/` Vue
app. Stack is fixed — never add a new UI/marketing framework. Everything below is
achievable with the existing Vue 3 + vue-router + vue-i18n + Vuetify 3 + Tailwind
v4 + @unhead/vue + vite-ssg stack.

## 1. Reuse before you build
A logged-out marketing hero ALREADY exists inside `Search.vue`
(`<section v-if="!login">`): card-strip hero, headline, subheadline, two CTAs,
and a 4-step "how it works" grid, with i18n keys under `hero.*`. Prefer
extracting/enriching that pattern over inventing a new one. Reusable section
sub-components live in `src/components/Pages/search/` — mirror that structure
(e.g. `src/components/Pages/landing/`) for new sections.

## 2. Theming — use CSS variables, NOT Tailwind colors
Theme is driven by CSS custom properties in `src/assets/main.css` (`:root` and
`html.dark`): `--c-bg, --c-surface, --c-surface-2, --c-border, --c-text,
--c-muted, --c-accent, --c-trade, --c-mutual, --c-skeleton`.
- Apply via inline `style="color: var(--c-text)"`, `style="background:
  var(--c-surface); border: 1px solid var(--c-border)"`.
- Primary CTA: `var(--c-trade)`; accent/pink: `var(--c-accent)`.
- Do NOT use Tailwind color utilities (e.g. `bg-purple-600`) — they won't react
  to dark/light mode. Use Tailwind ONLY for layout/spacing/typography.
- Common layout idiom: `flex flex-col gap-6 md:gap-10`, container
  `max-w-screen-xl mx-auto w-full md:px-6 lg:px-12`, cards `rounded-xl`.

## 3. CRITICAL gotcha — Tailwind v4 `hidden sm:flex` is broken here
`main.css` defines a plain `.hidden { display:none }` rule after the Tailwind
import (for a hover trick). It overrides Tailwind's responsive `sm:flex`, so
`class="hidden sm:flex"` stays `display:none` even at >= sm. For any
responsive show/hide (very common on landing heroes/nav/columns), drive it from
**scoped component CSS media queries** instead:
```css
/* scoped */
.desktop-only { display: none; }
@media (min-width: 640px) { .desktop-only { display: flex; } }
```

## 4. i18n — all copy is translated (en/fr/de/it)
- Never hardcode user-facing strings. Add keys to ALL FOUR files in
  `src/locales/{en,fr,de,it}.json`.
- In `<script setup>`: `const { t } = useI18n()`; in template `$t('...')`.
  Headlines that need markup use `v-html="$t('hero.headline')"` (the key may
  contain `<br>`). Composition mode (`legacy:false`), `globalInjection:true`.

## 5. Routing + SSG pre-render (don't skip)
- Pages are children of `/:locale` in `src/router/index.js`. The locale index
  (`path: ""`) is the home/landing route (eagerly loaded). Other pages lazy-load
  via `() => import(/* webpackChunkName: "x" */ ...)`.
- A NEW landing route requires THREE edits:
  1. add to `localeChildren` in `src/router/index.js`,
  2. add a legacy unprefixed redirect there too,
  3. add `/${locale}/<path>` for all 4 locales to `ssgOptions.includedRoutes`
     in `frontend/vite.config.js` (else it's not pre-rendered or in the sitemap).
- Keep components SSR-safe: ViteSSG pre-renders in Node. Guard
  `window`/`localStorage`/`document` (`typeof window !== 'undefined'`) and do
  browser-only work in `onMounted`. A null-vnode unmount crash during SSG/preview
  is almost always an upstream render throw, not a teleport bug.

## 6. SEO via useHead
- `src/views/App.vue` has ONE global reactive `useHead` that resolves
  `meta.<route.name>.title` / `.desc` from i18n and emits canonical + hreflang
  (en/fr/de/it + x-default) + OG/Twitter. BASE = `https://0nefor.one`.
- For a new page: add a `meta.<routeName>.{title,desc}` block to all 4 locale
  files — App.vue picks it up by route name automatically.
- Optionally add a page-level `useHead(computed(() => ({ title, meta: [...] })))`
  for self-sufficiency, using `t("meta.x.title", {}, { locale: loc })` (see
  `CardsPage.vue`). Do NOT call `createUnhead()` — ViteSSG owns the head instance.

## 7. CTAs & auth
- Logged-out CTAs trigger auth by emitting `requireAuth` up to App.vue's shared
  `AuthDialog` — reuse this, don't build a new modal.
- CTA buttons use Vuetify `v-btn` (`variant="flat"` primary / `variant="outlined"`
  secondary) with inline `:style` using `var(--c-*)`; secondary nav CTAs can use
  `:to="`/${$route.params.locale || 'en'}/cards`"`.

## 8. Checklist before "done"
- [ ] No new dependency added.
- [ ] All copy in en/fr/de/it.json (no hardcoded strings).
- [ ] Colors via `var(--c-*)`, layout via Tailwind only.
- [ ] Responsive show/hide via scoped CSS, never `hidden sm:flex`.
- [ ] New route registered in router (child + legacy redirect) AND in
      vite.config.js ssgOptions.includedRoutes for all 4 locales.
- [ ] `meta.<routeName>.{title,desc}` added to all 4 locales.
- [ ] SSR-safe (no top-level window/document; reduced-motion respected).
- [ ] CTA emits `requireAuth` to the shared AuthDialog.
