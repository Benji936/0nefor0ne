# Skill: Vite Prerendering for Vue 3 SPA

## Context

This skill covers adding build-time prerendering to a Vue 3 + Vite SPA deployed on Netlify or Cloudflare Pages (no SSR server). The goal is to serve static HTML containing correct SEO tags to crawlers while keeping the SPA fully functional for real users.

Stack in this project: Vue 3, Vite, Vue Router (`createWebHistory`), Vuetify, vue-i18n, Tailwind, deployed via `_redirects`.

---

## Plugin Comparison

### 1. `vite-plugin-prerender` (legacy, not recommended)
- Wraps Puppeteer/jsdom to visit each route in a headless browser and dump the HTML.
- Pros: framework-agnostic, no code changes to app.
- Cons: requires Puppeteer/Chrome at build time (heavy CI dependency), slow, does not work well with Vuetify's SSR setup, jsdom mode misses CSS-in-JS rendering.
- **Not recommended** for Vuetify projects.

### 2. `@prerenderer/vite-plugin` (community fork)
- Same headless-browser approach as above, slightly more actively maintained.
- Same cons: Puppeteer dependency, slow builds, flaky with complex component trees.
- **Not recommended**.

### 3. `vite-ssg` (recommended for this project)
- Build-time SSG using Vue's `renderToString`. No headless browser required.
- Replaces `createApp` with `ViteSSG()` — a thin wrapper that handles both SSR (build) and CSR (runtime) modes.
- Pros: fast (Node.js only), first-class Vue 3 + vue-router + vue-i18n support, tree-shakeable, generates one HTML file per route.
- Cons: requires refactoring `main.js` to use the `ViteSSG` export; Vuetify needs SSR-safe setup.
- **Recommended for this project.**

### 4. `vite-plugin-ssr` / `vike` (full SSR framework)
- Full server + client rendering. Overkill for static hosting, requires a Node server.
- **Out of scope** — project constraint is static file hosting only.

---

## Implementation Guide: `vite-ssg`

### Install

```bash
npm install vite-ssg @vueuse/head
```

`@vueuse/head` (or `unhead`) is used by vite-ssg to manage `<head>` tags during SSR.

### Refactor `main.js`

Replace `createApp(...).mount('#app')` with the `ViteSSG` export:

```js
// src/main.js
import { ViteSSG } from 'vite-ssg'
import App from './views/App.vue'
import router from './router/index.js' // export routes array, not router instance
import i18n from './i18n.js'
import { createVuetify } from 'vuetify'

export const createApp = ViteSSG(
  App,
  { routes },          // pass raw routes array
  ({ app, router, isClient }) => {
    app.use(i18n)
    app.use(vuetify)
  }
)
```

The router must export the raw `routes` array (not a router instance) so vite-ssg can create it internally with `createMemoryHistory` during SSR and `createWebHistory` during CSR.

### Configure `vite.config.js`

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { ViteSSGOptions } from 'vite-ssg' // types only

export default defineConfig({
  plugins: [vue()],
  ssgOptions: {
    script: 'async',
    formatting: 'minify',
    // List all routes to prerender:
    includedRoutes(paths, routes) {
      return [
        '/en/', '/fr/', '/de/', '/it/',
        '/en/privacy', '/fr/privacy', '/de/privacy', '/it/privacy',
        // Card pages — fetch top 16 IDs at build time:
        ...TOP_CARD_IDS.flatMap(id => ['/en/card/' + id]),
      ]
    },
    onFinished() { /* post-build hook if needed */ },
  },
})
```

---

## Vuetify SSR Compatibility

Vuetify requires SSR mode to be enabled explicitly. Without this, `document` / `window` accesses during `renderToString` will throw.

```js
const vuetify = createVuetify({
  ssr: true,   // <-- critical
  components,
  directives,
  theme: { ... },
})
```

With `ssr: true`, Vuetify defers all DOM access to the client hydration phase.

---

## Vue-i18n SSR Compatibility

vue-i18n v9+ is SSR-compatible out of the box when using the Composition API (`useI18n()`). No special setup needed beyond the normal `createI18n` call.

Ensure `legacy: false` is set on the i18n instance (Composition API mode). Legacy Options API mode has known issues with SSR.

```js
const i18n = createI18n({ legacy: false, ... })
```

---

## Fetching API Data for Dynamic Card Routes

For card pages, data must be fetched at build time inside the component's `setup()` using `onServerPrefetch`:

```js
// CardPage.vue
import { onServerPrefetch } from 'vue'

onServerPrefetch(async () => {
  // This runs during vite-ssg's renderToString pass
  await fetchCardData(route.params.id)
})
```

Alternatively, use a Pinia store with `onServerPrefetch` to populate shared state that is serialized into the HTML as `window.__INITIAL_STATE__` and rehydrated on the client.

For the top 16 card IDs: maintain a static list in `vite.config.js` `ssgOptions.includedRoutes` and fetch the API data inside `onServerPrefetch` in CardPage. The component already fetches data on mount — add `onServerPrefetch` to run the same fetch during build.

---

## SEO Tags During Prerender

Use `useHead` from `@vueuse/head` (installed with vite-ssg) instead of direct `document.title =` and `document.head.querySelector()` calls:

```js
import { useHead } from '@vueuse/head'

useHead({
  title: computed(() => card.value?.name ?? 'TradeMarket'),
  meta: [
    { name: 'description', content: computed(() => card.value?.desc) },
    { property: 'og:title', content: computed(() => card.value?.name) },
    { property: 'og:url', content: computed(() => canonicalUrl.value) },
  ],
  link: [
    { rel: 'canonical', href: computed(() => canonicalUrl.value) },
  ],
})
```

During SSR, `useHead` writes tags into the HTML string. During CSR, it updates the live DOM. This replaces all manual `document.*` manipulation.

**Migration path:** search for `document.title =` and `document.head.querySelector('meta[...]')` and replace with `useHead` calls. The existing `useHead`/`useSeoMeta` calls in the project can remain — vite-ssg is compatible with them.

---

## Avoiding Hydration Mismatches

1. **Do not render locale-detected content differently on server vs client.** Server-side locale detection must match what the client will detect (use route param, not `navigator.language`).
2. **Wrap client-only code in `if (typeof window !== 'undefined')` or `onMounted`.** Any code that accesses `window`, `localStorage`, `document` outside of lifecycle hooks will throw during SSR.
3. **Vuetify theme:** with `ssr: true`, Vuetify injects a `<style>` tag during SSR. The client will reconcile it. Do not suppress this.
4. **`createWebHistory` vs `createMemoryHistory`:** vite-ssg handles this automatically — it uses `createMemoryHistory` for the SSR pass and `createWebHistory` for the client bundle. Do NOT manually create the router; let vite-ssg do it.

---

## Common Pitfalls

| Pitfall | Fix |
|---|---|
| `document is not defined` at build time | Wrap in `onMounted` or `if (typeof window !== 'undefined')` |
| Vuetify crashes during SSR | Set `ssr: true` in `createVuetify()` |
| vue-i18n legacy mode errors | Set `legacy: false` |
| Router created with `createWebHistory` crashes in Node | Export raw `routes` array, not a router instance; let vite-ssg create the router |
| Hydration mismatch on locale-detected text | Use route param for locale, not `navigator.language` |
| `@mdi/font` CSS import crashes SSR | Safe — CSS imports are no-ops in SSR mode |
| Card page shows empty HTML (data not fetched) | Add `onServerPrefetch` to fetch data before render |
| `window.__INITIAL_STATE__` not rehydrated | Use Pinia with vite-ssg's built-in state serialization |

---

## Deployment: Netlify / Cloudflare Pages with `_redirects`

vite-ssg outputs one `.html` file per route under `dist/`:

```
dist/
  en/index.html
  en/privacy/index.html
  en/card/12345/index.html
  fr/index.html
  ...
  index.html  (root)
```

The existing `_redirects` SPA fallback (`/* /index.html 200`) still works for non-prerendered routes. Prerendered routes are served directly as static files — the CDN serves the `.html` file before the fallback fires.

No changes to `_redirects` are needed. The CDN's static file serving takes priority over the catch-all redirect.

Verify on Netlify: `Redirects and rewrites` will show the static file as a match before the `200` rewrite rule.

---

## Checklist for Implementation

- [ ] Install `vite-ssg` and `@vueuse/head`
- [ ] Refactor `main.js` to use `ViteSSG()`, export raw routes
- [ ] Set `ssr: true` on Vuetify instance
- [ ] Set `legacy: false` on vue-i18n instance
- [ ] Replace `document.title =` / `document.head.querySelector()` with `useHead()`
- [ ] Add `onServerPrefetch` to CardPage for build-time data fetch
- [ ] Configure `ssgOptions.includedRoutes` in `vite.config.js` with all target URLs
- [ ] Run `npm run build` and verify `dist/en/index.html` contains `<title>` and meta tags in raw HTML
- [ ] Verify SPA hydration works (no console errors, navigation works, auth flows unchanged)
- [ ] Deploy and confirm social crawlers (og:title visible in e.g. https://opengraph.xyz)
