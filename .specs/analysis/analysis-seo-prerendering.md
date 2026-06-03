# Codebase Impact Analysis: SEO Prerendering

**Task:** SEO: Prerender Static HTML for Crawlers
**Date:** 2026-06-03
**Risk Level:** HIGH

---

## Files to MODIFY

| File | Change Type | Reason |
|------|-------------|--------|
| `frontend/vite.config.js` | Modify | Add prerender plugin (vite-ssg or @prerenderer/vite-plugin) and config |
| `frontend/src/i18n.js` | Modify | `detectLocale()` calls `localStorage` + `navigator.languages` at module init — crashes Node; must be guarded |
| `frontend/src/views/App.vue` | Modify | 15+ raw `document.head.*` / `document.createElement` / `document.documentElement` calls in `_updateMeta()`, `_updateHreflang()`, `_setMeta()` — need SSR guards or `@unhead/vue` migration |
| `frontend/src/components/Pages/CardPage.vue` | Modify | `_injectSeo()` uses `document.createElement`, `document.head.appendChild`, `document.head.querySelector` after async fetch — needs guards + `window.prerenderReady` signal |
| `frontend/src/main.js` | Modify | SSR entry point needs `createMemoryHistory` instead of `createWebHistory` when running in Node |

## Files to CREATE

| File | Reason |
|------|--------|
| `frontend/src/main.server.js` (or `entry-server.js`) | SSR-compatible entry point for vite-ssg or prerender runner |
| `frontend/scripts/prerender.mjs` | (If using headless approach) Build-time script: enumerate routes, fetch card data, emit static HTML |

## Integration Points

### 1. `detectLocale()` — HIGHEST PRIORITY BLOCKER
`frontend/src/i18n.js` line ~13: `locale: detectLocale()` executes at module import time.
`detectLocale()` calls `localStorage.getItem()` and `navigator.languages` synchronously.
Both APIs are undefined in Node/SSR → **TypeError crash before any rendering starts**.
Fix: wrap with `typeof localStorage !== 'undefined'` guard; return `'en'` fallback in SSR context.

### 2. `App.vue` DOM mutations
`_updateMeta()`, `_updateHreflang()`, `_setMeta()` contain 15+ direct DOM calls.
During SSR these execute against `undefined` — throws or silently produces wrong output.
Fix: migrate to `@unhead/vue` (`useHead()`) OR add `if (typeof document === 'undefined') return` guard at top of each method.

### 3. `CardPage._injectSeo()` — async data + DOM
Fires after `searchById()` resolves (async API call). Uses `document.createElement` and `document.head.appendChild`.
For prerendered card pages to contain card-specific tags, the prerenderer must:
- Wait for `window.prerenderReady = true` signal before snapshotting
- Set a timeout (e.g. 10s) to avoid hanging the build if the API is slow/unavailable

### 4. `_redirects` SPA fallback
`/* /index.html 200` — Netlify/Cloudflare serve exact-match static files **before** fallback rules.
Prerendered routes emit exact HTML files (e.g. `dist/en/index.html`) → served directly, no conflict.
No changes to `_redirects` required.

### 5. Vuetify SSR
Vuetify requires `createVuetify({ ssr: true })` and `@vuetify/ssr-plugin` for SSR rendering.
Without this, Vuetify throws during server-side rendering.

### 6. vue-router history mode
`createWebHistory` is browser-only. SSR entry needs `createMemoryHistory`.

### 7. vue-i18n
Requires `legacy: false` + `globalInjection: true` for SSR compatibility.

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| `localStorage`/`navigator` crash in Node | Critical | Guard in `i18n.js` with `typeof localStorage !== 'undefined'` |
| Vuetify SSR throws without `ssr: true` | High | Add `ssr: true` to `createVuetify()` + install `@vuetify/ssr-plugin` |
| Card API timeout hangs build | High | `window.prerenderReady` with 10s timeout; skip + warn on failure |
| DOM mutations in App.vue break SSR | High | `@unhead/vue` migration or `typeof document` guards |
| vue-router `createWebHistory` in Node | Medium | Use `createMemoryHistory` in SSR entry |
| Hydration mismatch flicker for users | Medium | Ensure SSR output matches client render (same initial state) |

---

## Recommended Approach

**`vite-ssg`** (build-time SSG, no headless browser required):
- Uses Vue's SSR renderer at build time to generate static HTML
- No Puppeteer/Chrome dependency in CI
- Requires fixing the 3 critical blockers first (i18n guard, DOM guards, Vuetify SSR)
- Card pages: use `vite-ssg`'s `includedRoutes` + async data fetch per route

**Alternative: `@prerenderer/vite-plugin`** (headless Chromium):
- Sidesteps the SSR compatibility issues entirely (runs real browser)
- Requires Puppeteer in CI (heavier, slower)
- `window.prerenderReady` signal needed for async card data
- Better fit if SSR compatibility fixes prove too risky

---

## Summary

- **Files to modify:** 5
- **Files to create:** 1–2
- **Primary blockers:** `detectLocale()` localStorage crash, DOM mutations in App.vue + CardPage.vue
- **Deployment impact:** None (existing `_redirects` works as-is)
