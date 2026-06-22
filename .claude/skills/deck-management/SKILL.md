# Skill: Deck Management Page

## Overview

This skill covers implementing a dedicated Deck Management page in the TradeMarket Vue 3 + Supabase + vite-ssg app. It defines persistence strategy, routing, component architecture, and common pitfalls.

---

## 1. Deck Persistence Strategy

### Recommended: Supabase `Deck` table with JSONB cards column

Create a new `Deck` table in Supabase:

```sql
create table public."Deck" (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  cards      jsonb not null default '{"main":[],"extra":[],"side":[]}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table public."Deck" enable row level security;

create policy "Users can manage their own decks"
  on public."Deck"
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

The `cards` JSONB column stores the parsed YDK structure:
```json
{ "main": [{"id": 12345, "qty": 3}], "extra": [...], "side": [...] }
```

Cards are **not** stored relationally — they are fetched from the external YGOPRODeck API at view time. This avoids a join table and matches the existing DeckImport pattern.

### Guest (unauthenticated) strategy: localStorage

```js
// lib/deckStorage.js — abstraction layer
const STORAGE_KEY = 'trademarket_decks'

export function getLocalDecks() {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

export function saveLocalDeck(deck) {
  const decks = getLocalDecks()
  const existing = decks.findIndex(d => d.id === deck.id)
  if (existing >= 0) decks[existing] = deck
  else decks.push(deck)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks))
}

export function deleteLocalDeck(id) {
  const decks = getLocalDecks().filter(d => d.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks))
}
```

On login, offer to migrate localStorage decks to Supabase (one-time prompt).

---

## 2. Vue Router Pattern

### Add routes to `localeChildren` in `router/index.js`

```js
// In localeChildren array — both lazy-loaded, not prerendered
{ path: 'decks',         name: 'decks',  component: () => import(/* webpackChunkName: "decks" */  '@/components/Pages/DecksPage.vue') },
{ path: 'decks/:deckId', name: 'deck',   component: () => import(/* webpackChunkName: "deck" */   '@/components/Pages/DeckPage.vue') },
```

### Add legacy redirects at root level (before the `/:locale` catch-all)

```js
{ path: '/decks',          redirect: () => `/${detectLocale()}/decks` },
{ path: '/decks/:deckId',  redirect: to => `/${detectLocale()}/decks/${to.params.deckId}` },
```

### Navigation from list to detail

```js
// In DecksPage.vue — navigate to deck detail
this.$router.push({ name: 'deck', params: { locale: this.$route.params.locale, deckId: deck.id } })

// Or with router-link
<router-link :to="{ name: 'deck', params: { locale: $route.params.locale, deckId: deck.id } }">
```

---

## 3. Key Patterns from Existing Code to Reuse

### DeckImport.vue — `/frontend/src/components/DeckImport.vue`

The existing `DeckImport` component handles the full import flow. For the deck management pages:

- **Reuse `CardSlot`** (inline sub-component): renders owned/missing/unrecognized card states
- **Reuse `processFile()`** logic: drag-drop → `parseYdk` → `getCardsByIds` → ownership check
- **Reuse `addMissingToWishlist()`**: inserts into `Card` table with `wish=true`
- The `DeckImport` component can be embedded in `DecksPage` for the import flow, but save the parsed result to persistence before showing it

**Extract `CardSlot` pattern for `DeckPage`**:
```js
import { parseYdk } from '@/lib/ydk'
import { getCardsByIds } from '@/api'
import { getClient } from '@/lib/supabaseClient'
```

### ydk.js — `/frontend/src/lib/ydk.js`

Pure function, no changes needed:
```js
import { parseYdk } from '@/lib/ydk'
// parseYdk(ydkText) → { main: [{id, qty}], extra: [{id, qty}], side: [{id, qty}] }
```

Store the raw YDK text or the parsed `cards` object in the `Deck` table. Storing parsed JSON is simpler for re-display; storing raw YDK text allows re-parsing if the format changes.

### Supabase CRUD pattern (from AddCard.vue and DeckImport.vue)

```js
import { getClient } from '@/lib/supabaseClient'

// Load decks for current user
const supabase = getClient()
const { data: userData } = await supabase.auth.getUser()
const { data: decks } = await supabase
  .from('Deck')
  .select('id, name, cards, created_at')
  .eq('user_id', userData.user.id)
  .order('created_at', { ascending: false })

// Save a new deck
const { data, error } = await supabase
  .from('Deck')
  .insert([{ user_id: userData.user.id, name: deckName, cards: parsedCards }])
  .select()
  .single()

// Delete a deck
await supabase.from('Deck').delete().eq('id', deckId)
```

---

## 4. SSG/SSR Pitfalls

### Do NOT prerender deck pages

The decks list and detail pages are user-specific. Do not add them to `ssgOptions.includedRoutes` in `vite.config.js`. The existing config pattern:

```js
// vite.config.js — only static/public routes here
ssgOptions: {
  includedRoutes: async (paths) => {
    // DO NOT include /en/decks or /en/decks/:id
    return paths.filter(p => !p.includes('/decks'))
  }
}
```

### Guard localStorage access

```js
// Always guard localStorage in component code
if (typeof window !== 'undefined') {
  // safe to use localStorage
}
```

### Use `onMounted` for data fetching, not `onServerPrefetch`

```js
// Correct for auth-gated pages
onMounted(async () => {
  await loadDecks()
})
```

### No SEO head tags needed

Auth-gated pages don't need `useHead()` SEO meta. A simple `<title>` via `useHead` for the tab title is sufficient.

---

## 5. Component Architecture

```
frontend/src/
├── components/
│   ├── DeckImport.vue          ← existing, reuse as-is for import UI
│   └── Pages/
│       ├── DecksPage.vue       ← NEW: list of saved decks + import CTA
│       └── DeckPage.vue        ← NEW: single deck detail view
├── lib/
│   ├── ydk.js                  ← existing, no changes
│   ├── deckStorage.js          ← NEW: localStorage + Supabase abstraction
│   └── supabaseClient.js       ← existing, no changes
└── router/
    └── index.js                ← add 2 routes to localeChildren + 2 redirects
```

### DecksPage.vue skeleton

```vue
<template>
  <div class="flex flex-col gap-6 p-4 max-w-4xl mx-auto">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold">{{ $t('decks.title') }}</h1>
      <v-btn @click="showImport = !showImport" prepend-icon="mdi-file-import-outline">
        {{ $t('deckImport.title') }}
      </v-btn>
    </div>

    <!-- Import panel -->
    <div v-if="showImport">
      <DeckImport :login="login" @added="onImportAdded" />
      <!-- After import: show name input + save button -->
    </div>

    <!-- Deck grid -->
    <div class="grid gap-4" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))">
      <DeckCard v-for="deck in decks" :key="deck.id" :deck="deck" @delete="deleteDeck" />
    </div>
  </div>
</template>
```

### DeckPage.vue skeleton

```vue
<template>
  <div class="flex flex-col gap-4 p-4 max-w-4xl mx-auto">
    <!-- Header with name + stats -->
    <!-- Card grid (reuse DeckImport's CardSlot logic) -->
    <!-- Add missing to wishlist button -->
    <!-- Delete deck button -->
  </div>
</template>
```

---

## 6. i18n Keys to Add

Add to all locale files (`en.json`, `fr.json`, `de.json`, `it.json`):

```json
"decks": {
  "title": "My Decks",
  "empty": "No decks saved yet. Import a .ydk file to get started.",
  "saveDeck": "Save deck",
  "deckName": "Deck name",
  "deleteDeck": "Delete deck",
  "confirmDelete": "Delete this deck?",
  "stats": "{total} cards · {owned} owned · {missing} missing"
}
```

---

## 7. Quick Reference

| File | Action |
|------|--------|
| `router/index.js` | Add 2 children + 2 redirects |
| `Pages/DecksPage.vue` | Create — deck list + import |
| `Pages/DeckPage.vue` | Create — deck detail |
| `lib/deckStorage.js` | Create — localStorage/Supabase abstraction |
| `locales/*.json` | Add `decks.*` keys |
| Supabase dashboard | Create `Deck` table with RLS policies |
| `vite.config.js` | Exclude `/decks` from prerender routes |

---

## 8. Deck Detail Page — Implementation Findings

> Added from research phase for the `deck-detail-page` feature.

### What already exists (as of the completed DecksPage.vue)

The live `DecksPage.vue` **does NOT use a separate `DeckPage.vue`**. It stores decks in a Supabase `decks` table (lowercase, with `ydk_content` text column — NOT the `cards JSONB` shape originally planned). The actual schema in use:

```
decks table: { id uuid, user_id uuid, name text, ydk_content text, created_at timestamptz }
```

Guest decks are stored in `localStorage` under key `tm_guest_decks` with shape:
```json
[{ "localId": "1234567890", "name": "...", "ydkContent": "...", "importedAt": "ISO" }]
```

The `DeckSection` sub-component (inline in `DecksPage.vue`) is the canonical card grid renderer. It is virtually identical to the `CardSlot` pattern in `DeckImport.vue` but uses Vuetify grid classes instead of Tailwind. The `DeckSection` component must be **extracted or copied** into `DeckDetailPage.vue`.

### Route to add for deck detail

```js
// router/index.js — add to localeChildren
{ path: 'decks/:deckId', name: 'deckDetail', component: () => import(/* webpackChunkName: "deckDetail" */ '@/components/Pages/DeckDetailPage.vue') },
```

Add a legacy redirect at root level:
```js
{ path: '/decks/:deckId', redirect: to => `/${detectLocale()}/decks/${to.params.deckId}` },
```

### Navigation from DecksPage to detail

Add a "View" / "Open" button/link inside each deck row in `DecksPage.vue`:

```js
// Options API — inside a deck panel
this.$router.push({ name: 'deckDetail', params: { locale: this.$route.params.locale, deckId: deck.id } })

// Or router-link in template
<router-link :to="{ name: 'deckDetail', params: { locale: $route.params.locale, deckId: deck.id } }">
```

### Back navigation from detail page

```js
// DeckDetailPage.vue method
goBack() {
  this.$router.push({ name: 'decks', params: { locale: this.$route.params.locale } })
}
```

Or use `$router.back()` if history is reliable.

### Data loading in DeckDetailPage.vue

The detail page receives `deckId` via `this.$route.params.deckId`. It must:

1. Load the deck from Supabase (for logged-in users) or localStorage (for guests)
2. Parse `ydk_content` with `parseYdk()`
3. Batch-fetch card data with `getCardsByIds(allIds)`
4. Fetch owned card IDs from Supabase `Card` table

```js
async mounted() {
  const deckId = this.$route.params.deckId
  const userId = this.login?.user?.id ?? null

  if (userId) {
    const supabase = getClient()
    const { data } = await supabase
      .from('decks')
      .select('*')
      .eq('id', deckId)
      .eq('user_id', userId)
      .single()
    this.deck = data
  } else {
    // Guest: find by localId in localStorage
    const raw = JSON.parse(window.localStorage.getItem('tm_guest_decks') || '[]')
    const found = raw.find(d => d.localId === deckId)
    if (found) {
      this.deck = { id: found.localId, name: found.name, ydk_content: found.ydkContent }
    }
  }

  if (this.deck) {
    await this.computeStats()
  }
}
```

The `computeStats()` method is a direct copy of the same method in `DecksPage.vue` (lines 641–706).

### DeckSection component

`DeckSection` is currently defined inline in `DecksPage.vue`. For the detail page, either:

- **Option A (recommended)**: Extract `DeckSection` into `@/components/DeckSection.vue` and import in both pages.
- **Option B**: Copy the inline component definition directly into `DeckDetailPage.vue`.

The component props are:
```js
props: {
  entries:      Array,   // [{ id, qty }]
  cardMap:      Object,  // { [numericId]: cardData }
  ownedIds:     Object,  // Set<number>
  title:        String,
  missingBadge: String,
  unknownBadge: String,
}
```

### Individual card selection for wishlist (new feature)

The user request asks to **select which cards are missing** before adding to wishlist. This is a new interaction not in the current code:

- Add a `selectedMissing` Set in data (initialized with all missing card IDs)
- Wrap each `DeckSection` card slot with a checkbox or click-to-toggle
- Replace the "Add all missing" button with "Add selected missing (N)"
- On click, use the same Supabase insert pattern as `addMissingToWishlist()` in `DecksPage.vue`

### SSR / SSG safety

- Add `meta: [{ name: 'robots', content: 'noindex' }]` via `useHead()` — already done in DecksPage, same pattern needed
- Do NOT add `decks/:deckId` to `ssgOptions.includedRoutes` in `vite.config.js`
- Guard all localStorage access with `typeof window !== 'undefined'`
- Load data in `mounted()`, not `created()` or `onServerPrefetch()`

### cardImage helper

```js
import { cardImage } from '@/lib/cardImage'
// cardImage(numericId) → full URL to card image (R2 or YGOPRODeck CDN fallback)
```
