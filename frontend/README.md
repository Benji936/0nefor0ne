# One for One — Frontend

Peer-to-peer Yu-Gi-Oh! card trading platform. Built with Vue 3, Vuetify 3, Tailwind CSS v4, and Vite SSG.

## Stack

- **Framework:** Vue 3 (Options + Composition API)
- **UI:** Vuetify 3 (`neonDusk` / `neonDuskLight` themes)
- **Styling:** Tailwind CSS v4 (`@tailwindcss/vite`)
- **Routing:** Vue Router 4 (locale-prefixed: `/en/`, `/fr/`, `/de/`, `/it/`)
- **i18n:** vue-i18n v11
- **Build / SSG:** Vite + `vite-ssg`
- **Auth / DB:** Supabase (`src/lib/supabaseClient.js`)
- **Card data:** YGOProdeck API (`src/api.js`)

## Env Setup

Copy `.env.example` to `.env` and fill in your Supabase values (see `.env.example`).

```sh
cp .env.example .env
```

Required variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_R2_CARDS_BASE` (optional; falls back to YGOPRODeck CDN in dev)

## Scripts

```sh
npm install
npm run dev          # hot reload
npm run build        # SSG + sitemap + data sync
npm run preview      # preview build
npm run sitemap      # generate sitemap.xml
npm run sitemap:large # generate sitemap (500-card limit)
npm run data:ots    # sync OTS data
npm test             # vitest (unit tests in src/lib/)
```

## Project Structure (high-level)

- `src/lib/supabaseClient.js` — auth, session, RPC helpers
- `src/lib/announces.js`, `proposals.js` — trade logic
- `src/components/Pages/App/` — lazy-loaded locale routes
- `src/components/Pages/Public/LandingPage.vue` — eager-loaded public home
- `public/` — SSG output, sitemap, robots.txt, static assets
- `scripts/` — sitemap generator, R2 sync, edopro data builds

## Design

Theme tokens and design definitions live at repo root (`DESIGN.md`, `DESIGN.json`). The active theme is `neonDusk` (dark purple/indigo palette with `#9A52F5` primary, `#F42D87` secondary).

## Routes

Locale-prefixed parent (`/:locale`) validates locale (`en`, `fr`, `de`, `it`) and activates i18n. Legacy bare paths redirect to the detected locale. Auth callback (`/auth/callback`) preserves URL hash/query for Supabase OAuth.

## Testing

Unit tests: `src/lib/*.test.js`, `src/composables/*.spec.js`. Run with `npm test`.
