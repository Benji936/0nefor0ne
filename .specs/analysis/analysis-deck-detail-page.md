# Impact Analysis: Deck Detail Page

**Feature:** Dedicated page for a single deck (`/:locale/decks/:id`)
**Date:** 2026-06-08
**Risk Level:** LOW

---

## Files to CREATE

| File | Purpose |
|------|---------|
| `frontend/src/components/DeckSection.vue` | Extract `DeckSection` inline component from `DecksPage.vue` into a standalone SFC for reuse |
| `frontend/src/components/Pages/DeckDetailPage.vue` | New page component — loads a single deck by route param ID, computes stats, renders DeckSection |

---

## Files to MODIFY

| File | Change required |
|------|----------------|
| `frontend/src/router/index.js` | Add `{ path: 'decks/:id', name: 'deck', component: () => import(...DeckDetailPage.vue) }` to `localeChildren`; add legacy redirect `{ path: '/decks/:id', redirect: (to) => ... }` |
| `frontend/src/components/Pages/DecksPage.vue` | (a) Remove the inline `DeckSection` defineComponent block (it moves to DeckSection.vue); (b) Import `DeckSection` from the new file; (c) Add a router-link or click handler on each deck row to navigate to `/:locale/decks/:id` |
| `frontend/src/locales/en.json` | Add keys under `decks.*`: `backToDecks`, `notFound` (and optionally `meta.deck.title`, `meta.deck.desc`) |
| `frontend/src/locales/fr.json` | Same new keys, French translations |
| `frontend/src/locales/de.json` | Same new keys, German translations |
| `frontend/src/locales/it.json` | Same new keys, Italian translations |

`frontend/vite.config.js` — NO change required. The `includedRoutes` function is an explicit allowlist; `/:locale/decks/:id` is not listed and will not be prerendered.

`frontend/src/views/App.vue` — NO change required. `RouterView` renders the new page automatically. The `changePage()` helper and the `page` computed (based on `$route.name`) do not conflict with the new route name `deck`.

---

## Key Interfaces

### Deck data shape (`decks` Supabase table)

Observed in `DecksPage.loadDecks()` and `DecksPage.saveDeck()`:

```js
{
  id:          string,   // UUID for authenticated users; Date.now().toString() for guests
  name:        string,   // max 60 chars
  ydk_content: string,   // raw .ydk file text
  created_at:  string,   // ISO 8601 timestamp
  // user_id only present on Supabase rows (not exposed to the component layer)
}
```

Guest decks live in `localStorage` under key `tm_guest_decks` as:
```js
[{ localId: string, name: string, ydkContent: string, importedAt: string }]
```

### How DeckDetailPage receives the deck ID

Route param: `this.$route.params.id` (string).

Load strategy:
- Authenticated user: `supabase.from('decks').select('*').eq('id', id).eq('user_id', userId).single()`
- Guest: `JSON.parse(localStorage.getItem('tm_guest_decks')).find(d => d.localId === id)`

### Stats computation pattern (reused from `DecksPage.computeStats`)

```
parseYdk(deck.ydk_content)
  -> { main: [{id, qty}], extra: [{id, qty}], side: [{id, qty}] }

getCardsByIds(allIds)          // api.js
  -> cardMap: { [cardId]: CardObject }

supabase.from('Card')
  .select('image_id')
  .eq('trader', userId)
  .eq('wish', false)
  .not('status', 'in', '("traded","locked")')
  -> ownedIds: Set<number>

Derived: total, owned, missing, unrecognized, missingEntries[]
```

---

## Integration Points

### 1. Router registration

`frontend/src/router/index.js` — `localeChildren` array (line 8-17).

Add after the existing `decks` entry:
```js
{ path: 'decks/:id', name: 'deck', component: () => import(/* webpackChunkName: "deck-detail" */ '@/components/Pages/DeckDetailPage.vue') },
```

Add legacy redirect alongside the existing `/decks` redirect (lines 28-30):
```js
{ path: '/decks/:id', redirect: (to) => `/${detectLocale()}/decks/${to.params.id}` },
```

### 2. DecksPage navigation link

In `DecksPage.vue`, each deck row (`v-expansion-panel-title`) needs a "View detail" action — either a `<router-link>` button/icon or a `@click.stop` handler calling `this.$router.push(...)`. Recommended: small icon button alongside the existing rename/delete buttons.

### 3. App.vue

No changes needed. The `page` computed derives active-state from `$route.name`; `deck` is a new name that does not appear in any existing nav tab comparisons.

---

## Risk: Lazy Loading Stats on Detail Page

Pattern is identical to `DecksPage.computeStats()` — `parseYdk` + `getCardsByIds` + Supabase `Card` query.

On the detail page, stats fire immediately on mount (not deferred behind accordion open). For decks with many unique IDs this is a single batched request via `getCardsByIds`. The detail page should show a loading spinner while stats compute.

---

## SSG Risk: Dynamic Route Must NOT Be Prerendered

`/:locale/decks/:id` is a user-private, authenticated-only page. Prerendering it would fail at build time (no deck data exists statically).

Current state: `vite.config.js` `ssgOptions.includedRoutes` is an explicit allowlist. The deck detail route is not listed and will not be prerendered. Safe without any code change.

`DeckDetailPage` should set `noindex` in its `useHead()` call, matching `DecksPage`:
```js
useHead({ meta: [{ name: 'robots', content: 'noindex' }] });
```

---

## Summary

- Files to create: 2
- Files to modify: 6 (router + DecksPage + 4 locale files)
- Files unaffected: App.vue, vite.config.js, api.js, all other pages
- Total files affected: 8
- Risk level: LOW
