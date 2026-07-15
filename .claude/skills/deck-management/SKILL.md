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

---

## 9. Deck Completion Bar & Richer Deck Data

> Added from research phase for the `deck-completion-page` feature (dedicated
> deck page with a visual completion bar + more deck statistics).

### What already exists vs. what's missing

Both `DecksPage.vue` and `DeckDetailPage.vue` **already compute** owned/total
counts per deck — `computeStats(deck)` in `DecksPage.vue` (~lines 641–706) and
`resolveStats()` in `DeckDetailPage.vue` build a `stats` object shaped:

```js
{
  cardMap, ownedIds,           // Object<id, card>, Set<number>
  main, extra, side,           // parsed YDK entries [{id, qty}]
  total, owned, missing, unrecognized,
  missingEntries,              // entries eligible for "add to wishlist"
}
```

Today this is only ever rendered as **plain text** (`decks.ownedCount` /
`decks.missingCount` spans, `deckDetail.summary` interpolated string). There is
**no visual progress bar anywhere in the decks area** — grepping the repo shows
the only live `v-progress-linear` usage is an upload progress bar in
`frontend/src/components/library/BulkAddCards.vue` (unrelated). Do not go
hunting for an existing deck completion-bar component to reuse — there isn't
one yet; build it fresh, reusing the `stats.owned`/`stats.total` numbers that
already exist.

### Completion bar — reuse existing stats, add a computed + a bar element

No new Supabase query is needed for the bar itself. Add a `completionPct`
computed on top of the existing `stats` (or per-deck `deckStats[deck.id]`):

```js
computed: {
  completionPct() {
    return this.stats.total > 0
      ? Math.round((this.stats.owned / this.stats.total) * 100)
      : 0;
  },
},
```

Render with Vuetify's `v-progress-linear`, themed via CSS vars (never hardcode
colors), matching the pattern documented in `.claude/skills/collection-progress/
SKILL.md` for `SetPage.vue`'s (still-unbuilt, `todo/`) set-level progress bar —
treat that skill as a **design reference**, not working code to copy, since
`SetPage.vue` does not implement it yet either:

```vue
<v-progress-linear
  :model-value="completionPct"
  color="var(--c-accent)"
  bg-color="var(--c-surface-2)"
  rounded
  height="8"
  :aria-label="$t('deckDetail.completionAria', { owned: stats.owned, total: stats.total, pct: completionPct })"
/>
```

For the `DecksPage.vue` list view, add the same computed per deck (e.g. a
`completionPct(deckId)` method reading `this.deckStats[deckId]`) and render a
compact bar inside each deck card/row, next to the existing owned/missing text.

### Open product question — does "SOURCED" (ignored) count toward completion?

Per `.claude/skills/deck-card-ignore/SKILL.md`, users can mark a missing card as
"not needed" (`ignoredIds` Set, persisted per-deck). Ignored cards are already
excluded from `stats.missing` / `missingEntries`. Decide explicitly during
architecture whether the completion % denominator/numerator should:
- **A. Strict**: `completionPct = owned / total` (ignored cards still count
  against you) — simplest, matches `stats.owned`/`stats.total` as-is.
- **B. Adjusted**: `completionPct = (owned + ignoredCount) / total` — a
  "practically complete" view consistent with `missing` already excluding
  ignored cards.
Flag this to the user/PM rather than silently picking one; whichever is chosen,
compute `ignoredCount` the same way `resolveStats()`/`onToggleIgnore()` already
do (`allEntries.filter(c => cardMap[c.id] && !ownedIds.has(c.id) &&
ignoredIds.has(c.id))`).

### Richer deck data — data sources already available, no new API needed

`stats.cardMap` (built via `getCardsByIds()` in `frontend/src/api.js`) already
holds full YGOPRODeck card objects for every card in the deck — `type`,
`frameType`, `race`, `attribute`, `level`, `card_prices`, `card_sets`, etc. Build
breakdown computeds directly off `stats.cardMap` + `stats.main/extra/side`
instead of fetching anything new:

```js
computed: {
  // Monster / Spell / Trap counts (and sub-types) via frameType, reusing the
  // same classification helpers SetPage/CardPage already use:
  typeBreakdown() {
    const counts = {};
    for (const entry of [...this.stats.main, ...this.stats.extra, ...this.stats.side]) {
      const card = this.stats.cardMap[entry.id];
      if (!card) continue;
      const key = card.frameType || 'unknown'; // 'normal','effect','fusion','synchro','xyz','link','pendulum*','spell','trap'
      counts[key] = (counts[key] || 0) + entry.qty;
    }
    return counts;
  },
  // Approximate deck market value from card_prices (cardmarket_price is EUR,
  // matches the trading-market context of this app)
  estimatedPriceEur() {
    let total = 0;
    for (const entry of [...this.stats.main, ...this.stats.extra, ...this.stats.side]) {
      const card = this.stats.cardMap[entry.id];
      const price = parseFloat(card?.card_prices?.[0]?.cardmarket_price ?? '0');
      if (!Number.isNaN(price)) total += price * entry.qty;
    }
    return total;
  },
},
```

Reuse `frontend/src/lib/cardIcons.js` helpers (`attributeIconFor`,
`propertyIconFor`, `levelIconFor`, `isSpellTrap`) instead of re-deriving
frame-type/attribute logic when rendering breakdown chips/icons — they already
handle the `frameType`/`race` normalization and icon-asset lookup used
elsewhere (e.g. attribute icons, Spell/Trap property icons).

### i18n keys — extend `deckDetail.*` / `decks.*`, don't create a new namespace

Existing keys already cover summary text (`deckDetail.summary`,
`decks.ownedCount`, `decks.missingCount`). Add new keys alongside them, in all
4 locale files (`en.json`, `fr.json`, `de.json`, `it.json`), matching the
interpolation style already used (`{owned}`, `{total}`, `{missing}`):

```json
"deckDetail": {
  "completionPct": "{pct}% complete",
  "completionAria": "Deck completion: {owned} of {total} cards owned ({pct}%)",
  "typeBreakdown": "Card types",
  "estimatedValue": "Estimated value"
}
```

No em dashes in any locale copy (repo-wide UI copy convention) — use commas or
periods instead.

### Pitfalls specific to this feature

- **Don't add a second card/ownership fetch.** `DeckDetailPage.vue` and
  `DecksPage.vue` already fetch `cardMap` and `ownedIds` once per deck
  (`resolveStats()` / `computeStats()`). Compute the bar % and richer-data
  breakdowns as `computed` properties over the existing `stats` object — adding
  a parallel fetch duplicates YGOPRODeck API calls and risks stats/bar
  disagreeing after a realtime update.
- **Realtime resync already recomputes `stats`.** Both pages subscribe to a
  Supabase `postgres_changes` channel on the `Card` table
  (`deck-owned-${deckId}` / `decks-page-owned-watch`) and call
  `resolveStats()`/`computeStats()` on change. Any computed built on top of
  `stats` updates for free — no new subscription needed for the completion bar.
- **`card_prices` can be an empty array** for cards YGOPRODeck hasn't priced;
  guard `card?.card_prices?.[0]` before reading `cardmarket_price`, and treat
  `NaN`/missing as `0` rather than throwing off the total.
- **SSR/SSG risk is low here** (unlike `SetPage.vue`): deck pages are
  auth-gated and already excluded from `vite.config.js`
  `ssgOptions.includedRoutes`, so there's no prerendered-HTML leak risk to
  guard against — still call all Supabase/localStorage reads from `mounted()`
  only, per existing convention, but this is not a build-breaking risk class
  the way it is for `SetPage.vue`.
- **Vue 3 Set reactivity**: if the completion feature adds any new
  Set-typed reactive state, reassign rather than mutate in place (see §
  Deck Card Ignore skill for the canonical `next = new Set(...); this.x =
  next;` pattern) — plain `.add()`/`.delete()` on a `data()` Set does not
  trigger a re-render.

### File references for this feature

| File | Role |
|---|---|
| `frontend/src/components/Pages/App/DecksPage.vue` | List view — add completion bar per deck card, reuse `deckStats` |
| `frontend/src/components/Pages/App/DeckDetailPage.vue` | Detail view — add completion bar + richer stats block, reuse `stats` |
| `frontend/src/components/library/DeckSection.vue` | Card grid renderer — unchanged; bar/stats live in the parent page |
| `frontend/src/api.js` | `getCardsByIds()` — source of `type`/`frameType`/`card_prices` etc., already fetched |
| `frontend/src/lib/cardIcons.js` | Reuse `attributeIconFor`/`propertyIconFor`/`levelIconFor`/`isSpellTrap` for breakdown chips |
| `frontend/src/lib/deckIgnore.js` | `ignoredIds` load/save — needed if completion % adjusts for ignored/SOURCED cards |
| `frontend/src/locales/{en,fr,de,it}.json` | Extend `deckDetail.*` / `decks.*` with completion/breakdown keys |
| `.claude/skills/collection-progress/SKILL.md` | Design reference for progress-bar UX/copy (SetPage's analogous, not-yet-built feature) |
| `.claude/skills/deck-card-ignore/SKILL.md` | `ignoredIds` semantics — read before deciding the completion % formula |
