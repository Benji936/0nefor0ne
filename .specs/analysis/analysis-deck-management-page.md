# Impact Analysis: Deck Management Page

## Summary

A dedicated `/en/decks` (and `/:locale/decks`) page for managing saved YDK decks. The feature reuses the existing `DeckImport.vue` component and `parseYdk()` / `getCardsByIds()` utilities. Deck persistence is handled via `localStorage` in the MVP (no Supabase schema changes required).

---

## Files to Create

### 1. `frontend/src/components/Pages/DecksPage.vue`
**Purpose:** The main page component rendered at `/:locale/decks`. Responsibilities:
- Displays list of saved decks (from localStorage) with stats: name, total cards, owned count, missing count.
- "Import new deck" section that embeds `DeckImport.vue` in a save-able flow: after parse, prompts user for a deck name, then persists to localStorage under key `oneforone_decks_${userId}`.
- Per-deck detail view (either inline expand or separate section) showing the DeckImport card grid for that deck.
- Delete deck action.
- "Add missing to wishlist" button (delegates to DeckImport's existing logic).
- Requires `props: ['login']` and `emits: ['requireAuth']` to match App.vue's slot pattern.
- Shows auth-gate message if `login` is null.

**localStorage schema:**
```json
{
  "oneforone_decks_<userId>": [
    {
      "id": "uuid-v4",
      "name": "Dark Magician Control",
      "createdAt": "ISO-string",
      "main": [{ "id": 46986414, "qty": 3 }],
      "extra": [],
      "side": []
    }
  ]
}
```
Note: store only parsed card IDs (not the full cardMap) — cardMap is re-fetched on demand to avoid localStorage bloat.

---

## Files to Modify

### 1. `frontend/src/router/index.js`
**Changes:**
- Add `{ path: "decks", name: "decks", component: () => import(/* webpackChunkName: "decks" */ "@/components/Pages/DecksPage.vue") }` to the `localeChildren` array.
- Add legacy redirect: `{ path: "/decks", redirect: () => \`/${detectLocale()}/decks\` }`.

### 2. `frontend/src/views/App.vue`
**Changes:**
- `changePage` pathMap: add `decks` entry mapping to `/${lc}/decks`.
- `logout` guard: add `"decks"` to the auth-page list so logout bounces to search.
- Desktop nav: add `NavItem` for decks (icon `mdi-layers-outline` / `mdi-layers`, tooltip `$t('nav.decks')`), shown when `authenticated`.
- Mobile `mobileTabs` array: add 5th tab `{ key: 'decks', label: $t('nav.decks'), icon: 'mdi-layers-outline', iconActive: 'mdi-layers', action: () => changePage('decks') }`.

### 3. `frontend/src/locales/en.json`
New keys to add:
- `nav.decks`: "Decks"
- `meta.decks.title`: "My Decks | One for One"
- `meta.decks.desc`: description string
- `decks.*`: full namespace with title, empty state, import, save, delete, stats, loginRequired, importedOn strings

### 4. `frontend/src/locales/fr.json`
Same keys as en.json, translated to French.

### 5. `frontend/src/locales/de.json`
Same keys, German translations.

### 6. `frontend/src/locales/it.json`
Same keys, Italian translations.

---

## Card Table Columns (from AddCard.vue + DeckImport.vue)

The existing `Card` table has these columns relevant to the feature:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `wish` | boolean | true = wishlist, false = trade pile |
| `game` | string | Always "YGO" |
| `url` | string | YGOPRODeck API URL |
| `name` | string | English canonical name |
| `extension` | string or null | Set code (e.g. "LOB-EN005") |
| `rarity` | string or null | Set rarity |
| `quantity` | number | Card count |
| `trader` | UUID (FK) | User ID |
| `image_id` | number | Konami passcode |
| `language` | string | "English" default |
| `condition` | string | "Near Mint" default |
| `first_edition` | boolean | false default |
| `status` | string | 'traded', 'locked', null |
| `locked_original_card_id` | UUID or null | FK to Card.id |

No new Supabase tables or columns are needed for the MVP (localStorage persistence).

---

## Auth Threading

`authenticated` state lives in `App.vue` data, updated via `getCurrentSession()` on mount and `onAuthChange()` subscription. It is passed to all page components via the `RouterView` slot:

```vue
<RouterView v-slot="{ Component }">
  <component :is="Component" :login="authenticated" ... @requireAuth="openLogin()" />
</RouterView>
```

`DecksPage.vue` must follow the same pattern as `Library.vue`:
- `props: ['login']`
- `emits: ['requireAuth']`
- Guard all localStorage operations behind `this.login?.user?.id`
- Call `this.$emit('requireAuth')` when an unauthenticated user tries to save a deck

---

## How New Routes Are Added

1. Add entry to `localeChildren` array in `router/index.js`
2. Add legacy redirect (bare `/decks` -> `/${locale}/decks`) in the `routes` array
3. Create the page component with `props: ['login']` and `emits: ['requireAuth']`
4. Add navigation entry in `App.vue` (desktop NavItem + mobile tab)
5. Add i18n strings to all 4 locale files

---

## Risk Areas

### 1. SSG / Prerendering — LOW RISK
The decks page is auth-gated. Do NOT add it to `ssgOptions.includedRoutes` in `vite.config.js`. The route will render as a normal SPA page. The App.vue `useHead()` will pick up `meta.decks.title` when the route is active — no SSR involvement needed.

### 2. Supabase Auth Dependency — MEDIUM RISK
The page is useless without login. Pattern: show a locked-state UI prompting sign-in when `!login?.user?.id`. Same approach used in Library and TradeCenter — check `login?.user?.id` before accessing localStorage.

### 3. localStorage Key Collision — LOW RISK
Use a namespaced key `oneforone_decks_${userId}` to avoid collisions between users on shared devices. Parse with `JSON.parse` inside try/catch to handle corruption gracefully.

### 4. Mobile Nav Crowding — MEDIUM RISK
Adding a 5th tab to `mobileTabs` will make each tab narrower (~75 px at 375 px viewport). Tight but usable. Alternative: replace or combine tabs. Simplest safe option: add the 5th tab.

### 5. i18n meta keys — LOW RISK
App.vue's `useHead` falls back to `meta.search.title` when a key is missing (`{ missingWarn: false }`). Non-breaking but all 4 locale files should be patched in the same PR.

### 6. DeckImport Duplication in Library — LOW RISK (deferred)
`Library.vue` still has its own `DeckImport` button after this feature ships. This is a fine convenience shortcut. Removing it from Library is a separate cleanup task.

---

## Reused Utilities (no changes needed)

- `frontend/src/components/DeckImport.vue` — reused as-is inside DecksPage
- `frontend/src/lib/ydk.js` — `parseYdk()` reused as-is
- `frontend/src/api.js` — `getCardsByIds()` reused as-is
- `frontend/src/lib/supabaseClient.js` — `getClient()` reused as-is
- `frontend/src/lib/cardImage.js` — `cardImage(id)` reused as-is
