# Analysis: Set Collection Progress & Missing Cards

## Feature summary
Show logged-in users how many cards from a given set they already own, render a completion progress bar, and list the missing cards with a direct "Find a trade" shortcut. Auth-gated: only visible to signed-in users.

---

## Data model

### SetPage card shape (from ygoprodeck API)
Each card in `SetPage.cards`: `{ id: Number, name: String, image: String, setCode: String, rarity: String }`
`card.id` is the ygoprodeck numeric card ID.

### Supabase `Card` table (user's library)
Key fields relevant to this feature:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Supabase PK |
| `image_id` | number | **ygoprodeck card ID** — the join key |
| `wish` | bool | true = wishlist, false = trade pile |
| `trader` | uuid | FK to Trader (user id) |
| `status` | text | 'active' / 'locked' / 'traded' |
| `quantity` | number | copies owned |

**Cross-reference key**: `SetPage.cards[].id === Card.image_id`

### Ownership definition
A user "owns" a set card if there is at least one `Card` row where:
- `image_id` matches the set card's `id`
- `status != 'traded'`
- `quantity > 0` OR `status == 'locked'`

Both trade-pile and wishlist entries count as "owned" for progress purposes (both signal active collecting intent). Alternatively, only `wish=false` (physically owned) can be used — this is a UX decision left for implementation.

---

## Auth access pattern

`login` prop is passed from `App.vue` to every route component via the `RouterView` slot:
```vue
<component :is="Component" :login="authenticated" ... />
```
`authenticated` shape: `{ user: { id, email }, session }` or `null`.

**SetPage.vue currently does NOT declare a `login` prop** — this must be added.
`getCurrentSession()` from `@/lib/supabaseClient` can also be called directly inside SetPage, but receiving via prop is consistent with Library.vue, TradeCenter, and Account patterns.

---

## Client-side cross-reference algorithm

```js
// In SetPage.mounted(), after login check:
const { data } = await getClient()
  .from('Card')
  .select('image_id')
  .eq('trader', login.user.id)
  .neq('status', 'traded')

const ownedIds = new Set((data ?? []).map(c => c.image_id))

// Computed properties:
// ownedCards   = cards.filter(c => ownedIds.has(c.id))
// missingCards = cards.filter(c => !ownedIds.has(c.id))
// completionPct = Math.round((ownedCards.length / cards.length) * 100)
```

Performance: set has ~50–200 cards; `select image_id` query returns ~100–500 lightweight rows. All in-memory, client-side — negligible cost.

---

## SSR/SSG compatibility

The owned-cards Supabase query is **user-specific** and must never run during `onServerPrefetch` (which executes at build time without a user session). It must be called only in `mounted()`, guarded by `login` being non-null.

SetPage already uses `onServerPrefetch` for the public set-cards fetch. The collection progress layer sits entirely client-side and does not interfere with SSG pre-rendering.

---

## Files to CREATE (2 new components)

### 1. `frontend/src/components/SetProgressBar.vue`
**Purpose**: Displays `X / Y cards owned (Z%)` with a styled progress bar.

Props: `{ owned: Number, total: Number }`

Template pattern:
```vue
<div class="flex flex-col gap-2 p-4 rounded-xl" style="background: var(--c-surface-2)">
  <div class="flex justify-between text-sm">
    <span style="color: var(--c-text)">{{ $t('setProgress.title') }}</span>
    <span style="color: var(--c-muted)">{{ owned }} / {{ total }} ({{ pct }}%)</span>
  </div>
  <div class="h-2 rounded-full overflow-hidden" style="background: var(--c-border)">
    <div class="h-full rounded-full transition-all"
         :style="{ width: pct + '%', background: 'var(--c-trade)' }" />
  </div>
</div>
```

### 2. `frontend/src/components/MissingCardsSection.vue`
**Purpose**: Collapsible grid of missing cards; each tile has a "Find a trade" link navigating to search pre-querying the card name.

Props: `{ cards: Array, locale: String }`

Each card links to `/${locale}/card/${card.id}`. The "Find a trade" button pushes to `/${locale}/?q=${encodeURIComponent(card.name)}`.

---

## Files to MODIFY (6 files)

### 1. `frontend/src/components/Pages/SetPage.vue`
Changes:
1. Add `props: ['login']`
2. Add `ownedIds` (Set), `progressLoading` (bool) to `data()`
3. Add computed: `ownedCards`, `missingCards`, `completionPct`
4. In `mounted()`: if `login` truthy, fetch owned IDs from Supabase
5. Template: inject `<SetProgressBar>` + `<MissingCardsSection>` after rarity pills, before card grid (auth-gated)
6. Card grid tiles: add small owned badge overlay (`position: absolute` green checkmark) on cards where `ownedIds.has(card.id)`

New imports:
```js
import { getClient } from '@/lib/supabaseClient'
import SetProgressBar from '@/components/SetProgressBar.vue'
import MissingCardsSection from '@/components/MissingCardsSection.vue'
```

### 2–5. `frontend/src/locales/en.json`, `fr.json`, `de.json`, `it.json`
New key group `setProgress`:
```json
"setProgress": {
  "title": "Your collection progress",
  "owned": "{owned} / {total} owned",
  "complete": "{pct}% complete",
  "missingTitle": "Missing cards ({count})",
  "findTrade": "Find a trade",
  "loginPrompt": "Sign in to track your collection progress"
}
```

---

## Template injection point in SetPage.vue

```
[Back link]
[Error / Loading states]
[Loaded block]
  [H1 + card count]          ← existing
  [Rarity distribution]      ← existing
  ── INSERT HERE ──
  [SetProgressBar]           ← new, auth-gated (v-if="login && !progressLoading")
  [MissingCardsSection]      ← new, auth-gated, collapsed by default
  ──────────────────
  [Card grid]                ← existing (with owned badge overlay per tile)
```

---

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Supabase query runs during SSG build | High | Guard inside `mounted()` only, never in `onServerPrefetch` |
| `login` prop not forwarded to SetPage | Low | App.vue already forwards all props via RouterView slot; just add `props: ['login']` |
| Library pagination added in future | Low | Current library never paginates; progress uses independent `select image_id` query |
| "Owned" definition ambiguity | Low | Document chosen definition in component; recommended default = both wish and trade count |
| i18n keys missing | Low | Add placeholder translations for fr/de/it; refine with native speakers later |

**Overall risk: MEDIUM** — primarily from SSR/SSG guard requirement on a route that currently has no auth-dependent code path.

---

## Implementation order (suggested)

1. Add `login` prop + Supabase `image_id` fetch to `SetPage.vue` (data layer, no UI yet)
2. Build `SetProgressBar.vue` (pure presentational, no Supabase)
3. Build `MissingCardsSection.vue` (presentational + search link)
4. Wire components into `SetPage.vue` template
5. Add owned badge overlay to card grid tiles
6. Add `setProgress` i18n keys to all 4 locale files
7. Test scenarios: logged-out (no progress), logged-in 0% owned, partially owned, 100% complete
