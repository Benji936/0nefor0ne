# One for One

**One for One** is a free peer-to-peer Yu-Gi-Oh! card trading platform. Users build a trade pile (cards they can give away) and a wishlist (cards they're hunting for), and the platform surfaces mutual matches automatically — so you spend less time searching and more time trading.

🌐 **[0nefor.one](https://0nefor.one)**

---

## Features

- **Card search** — search the full YGOProdeck database by name or set code; preview card detail, ATK/DEF, rarity, printings, and Cardmarket links directly from the results
- **Trade pile & wishlist** — add cards to your collection with set, condition, language, and quantity; mark them as available for trade or add them to your wishlist
- **Mutual match system** — the platform compares your trade pile against other users' wishlists (and vice versa) and surfaces mutual matches, one-sided matches, and traders who have what you want
- **Propose a trade** — two-column negotiation UI to select which cards go on each side of the deal, then send directly to the other trader
- **Notifications** — real-time bell indicator for incoming trade proposals
- **Trader profiles** — avatar, location, trade history, and a direct "propose trade" shortcut
- **Multilingual** — full UI and card data in English, French, German, and Italian; locale-prefixed URLs (`/en/`, `/fr/`, `/de/`, `/it/`) with hreflang SEO

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Vue 3 (Options API + Composition API) |
| UI components | Vuetify 3 |
| Styling | Tailwind CSS v4 |
| Routing | Vue Router 4 (locale-prefixed, `createWebHistory`) |
| i18n | vue-i18n v11 (Composition API mode) |
| Backend / Auth / DB | Supabase (PostgreSQL + Row Level Security + Auth) |
| Card data API | [YGOProdeck API](https://db.ygoprodeck.com/api-guide/) |
| Build tool | Vite |
| Deployment | Vercel |

---

## Project Structure

```
frontend/
├── public/
│   ├── sitemap.xml        # Locale-prefixed URLs with hreflang
│   └── robots.txt
├── src/
│   ├── api.js             # YGOProdeck API calls (name search always English; detail fetch by locale)
│   ├── i18n.js            # Locale detection, switching, supported locales
│   ├── router/index.js    # /:locale parent route + locale-aware children
│   ├── locales/           # en.json  fr.json  de.json  it.json
│   ├── lib/
│   │   ├── supabaseClient.js   # Auth helpers, session management
│   │   ├── matches.js          # fetchTradersWithCard, fetchTrendingCards
│   │   ├── proposals.js        # Trade proposal CRUD
│   │   └── notifications.js
│   ├── components/
│   │   ├── CardYugi.vue        # Card preview overlay (fetches localized data by ID on open)
│   │   ├── AddCard.vue         # Add-to-trade / add-to-wishlist dialog
│   │   ├── ProposeTradeDialog.vue
│   │   ├── TraderProfileDialog.vue
│   │   ├── ProposalRow.vue     # Collapsible trade proposal row
│   │   └── Pages/
│   │       ├── Search.vue
│   │       ├── Library.vue
│   │       ├── TradeCenter.vue
│   │       ├── Account.vue
│   │       └── CardPage.vue    # SEO-friendly card permalink
│   └── views/App.vue           # Shell: nav, search, meta/hreflang injection
├── vercel.json            # SPA rewrite (all paths → index.html, static files excluded)
└── vite.config.js
supabase/
└── migrations/            # SQL migrations (RLS policies, triggers, indexes)
```

---

## Local Development

### Prerequisites

- Node.js 20+
- A Supabase project (free tier works)

### Setup

```bash
# Install dependencies
cd frontend
npm install

# Start the dev server
npm run dev
```

The app runs at `http://localhost:5173`. The Supabase URL and anon key are currently hard-coded in `src/lib/supabaseClient.js` — replace them with your own project credentials if you fork the repo.

### Build

```bash
npm run build      # Production build → dist/
npm run preview    # Preview the production build locally
```

---

## Localization

The app supports **English, French, German, and Italian**.

- Translation strings live in `src/locales/{locale}.json`
- The active locale is stored in `localStorage` and reflected in the URL (`/:locale/...`)
- **Card name search** always queries the YGOProdeck API in English (so users can find cards by English name regardless of UI language)
- **Card detail views** (overlay and permalink page) fetch card data by ID in the current locale, so names and descriptions appear in the selected language; cards without a translation fall back to English automatically

---

## Database

Supabase (PostgreSQL) stores:

| Table | Contents |
|---|---|
| `Card` | User card entries: name (English canonical), extension, rarity, condition, language, quantity, `wish` flag |
| `Trade` | Accepted trade records |
| `Proposal` | Pending trade proposals with card selections for each side |
| `Trader` | User profiles: display name, avatar, city, country |

Row Level Security is enabled on all tables. Cards are always stored with their **English canonical name** (`name_en ?? name`) so cross-language lookups work regardless of which locale was active when the card was added.

---

## Deployment

The app is deployed on **Vercel**. `vercel.json` rewrites all paths to `index.html` (SPA mode) while serving static assets (`sitemap.xml`, `robots.txt`, `favicon.ico`, etc.) directly.

The sitemap at `/sitemap.xml` lists canonical `/en/` URLs with `xhtml:link` hreflang alternates for all supported locales.

---

## Scripts

```bash
# Sync card images to Cloudflare R2 (bulk upload)
npm run cards:bulk-upload

# Sync card data from YGOProdeck API to R2
npm run cards:sync
```

---

## License

Private — all rights reserved.
