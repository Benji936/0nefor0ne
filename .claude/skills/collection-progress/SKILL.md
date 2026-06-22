# Skill: Set Collection Progress & Missing Cards

## Purpose
Implement per-set collection completion tracking in SetPage.vue. Show logged-in users how many cards from a set they already own, a visual progress bar, and a filterable "missing cards" view — each with "Add to wishlist" and "Find a trade" shortcuts. Drives engagement through completion psychology and reduces friction to trade initiation.

---

## Data Model

### Supabase `Card` table (relevant fields)
| Field | Type | Notes |
|---|---|---|
| `id` | uuid | DB row PK |
| `name` | string | English canonical name (always English, language-agnostic) |
| `image_id` | number | YGOProdeck card numeric ID — matches `card.id` in the API |
| `extension` | string | Set code e.g. "DUNE-EN042" |
| `rarity` | string | e.g. "Ultra Rare" |
| `quantity` | number | Integer ≥ 1 |
| `wish` | boolean | `false` = trade pile, `true` = wishlist |
| `trader` | uuid | User ID |
| `status` | string | 'available' \| 'locked' \| 'traded' |

### Join key
`Card.name` (Supabase) === `card.name` (YGOProdeck API) — both are English canonical names.
Alternate: `Card.image_id` === `card.id` (YGOProdeck numeric ID).

### Collection query
```js
import { getClient } from "@/lib/supabaseClient";

const { data: authData } = await getClient().auth.getSession();
const userId = authData?.session?.user?.id;
if (!userId) return; // not logged in

const { data } = await getClient()
  .from('Card')
  .select('name, image_id, wish')
  .eq('trader', userId)
  .neq('status', 'traded');
// Include both trade pile AND wishlist — both count as "owned"

const ownedNames = new Set((data ?? []).map(c => c.name));
```

---

## SetPage.vue Card Object

Each card in `this.cards` (after `fetchCards()`) has:
```js
{
  id: Number,       // YGOProdeck card ID — matches Card.image_id
  name: String,     // English card name — matches Card.name
  image: String,    // Image URL (small)
  setCode: String,  // e.g. "DUNE-EN042" — may be null
  rarity: String,   // e.g. "Super Rare" — may be null
}
```

SetPage is fetched via `getCardsBySet(setName)` from `@/api` (YGOProdeck external API).

---

## Architecture

### Files to modify/create

| File | Change |
|---|---|
| `frontend/src/components/Pages/SetPage.vue` | Add collection fetch, owned Set, filter toggle, owned overlay, missing CTAs |
| `frontend/src/components/SetCollectionBanner.vue` | NEW — progress bar + stats header |
| `frontend/src/locales/en.json` | Add `setProgress.*` keys |
| `frontend/src/locales/fr.json` | Add `setProgress.*` keys |
| `frontend/src/locales/de.json` | Add `setProgress.*` keys |
| `frontend/src/locales/it.json` | Add `setProgress.*` keys |

### SetCollectionBanner.vue (new component)
```vue
<template>
  <div v-if="!loading && total > 0"
    class="rounded-xl p-4 mb-6 flex flex-col gap-3"
    style="background: var(--c-surface-2); border: 1px solid var(--c-border)"
  >
    <!-- Stats row -->
    <div class="flex items-center justify-between">
      <p class="text-sm font-semibold" style="color: var(--c-text)">
        {{ $t('setProgress.owned', { owned, total }) }}
      </p>
      <span class="text-xs px-2 py-0.5 rounded-full font-mono"
        style="background: var(--c-surface); color: var(--c-muted)">
        {{ completionPct }}%
      </span>
    </div>
    <!-- Progress bar -->
    <v-progress-linear
      :model-value="completionPct"
      color="var(--c-accent)"
      bg-color="var(--c-surface)"
      rounded
      height="8"
    />
    <!-- Missing count + toggle -->
    <div class="flex items-center justify-between">
      <span v-if="missing > 0" class="text-xs" style="color: var(--c-muted)">
        {{ $t('setProgress.missingCount', { count: missing }) }}
      </span>
      <span v-else class="text-xs font-semibold" style="color: var(--c-accent)">
        {{ $t('setProgress.completeYourSet') }}
      </span>
      <v-btn
        v-if="missing > 0"
        size="x-small"
        variant="tonal"
        color="var(--c-accent)"
        @click="$emit('toggle-missing')"
      >
        {{ showMissingOnly ? $t('setProgress.showAll') : $t('setProgress.showMissing') }}
      </v-btn>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({
  owned:           { type: Number, default: 0 },
  total:           { type: Number, default: 0 },
  loading:         { type: Boolean, default: false },
  showMissingOnly: { type: Boolean, default: false },
});
defineEmits(['toggle-missing']);
const missing = computed(() => Math.max(0, props.total - props.owned));
const completionPct = computed(() =>
  props.total > 0 ? Math.round((props.owned / props.total) * 100) : 0
);
</script>
```

### SetPage.vue additions

#### Data properties to add
```js
data() {
  return {
    // ... existing ...
    ownedNames: new Set(),      // card names the user owns
    collectionLoaded: false,    // loading state for collection
    showMissingOnly: false,     // filter toggle
  };
},
```

#### Computed properties to add
```js
computed: {
  // ... existing ...
  ownedCount() {
    return this.cards.filter(c => this.ownedNames.has(c.name)).length;
  },
  filteredCards() {
    if (!this.showMissingOnly) return this.cards;
    return this.cards.filter(c => !this.ownedNames.has(c.name));
  },
  isLoggedIn() {
    // check via Supabase session — set after collectionLoaded
    return this.collectionLoaded && this.ownedNames !== undefined;
  },
},
```

#### Method to add (call in mounted, after fetchCards)
```js
async fetchUserCollection() {
  // MUST be called client-side only (mounted, not onServerPrefetch)
  const { data: authData } = await getClient().auth.getSession();
  const userId = authData?.session?.user?.id;
  if (!userId) { this.collectionLoaded = true; return; }

  const { data } = await getClient()
    .from('Card')
    .select('name')
    .eq('trader', userId)
    .neq('status', 'traded');

  this.ownedNames = new Set((data ?? []).map(c => c.name));
  this.collectionLoaded = true;
},
```

#### mounted() hook
```js
async mounted() {
  if (this.ssrSetData) {
    this.cards = this.ssrSetData.cards;
    this.loading = false;
  } else {
    await this.fetchCards();
  }
  // Always fetch collection client-side after cards are loaded
  await this.fetchUserCollection();
},
```

#### Template additions
```vue
<!-- After rarity distribution chips, before card grid -->
<SetCollectionBanner
  v-if="collectionLoaded"
  :owned="ownedCount"
  :total="cardCount"
  :show-missing-only="showMissingOnly"
  @toggle-missing="showMissingOnly = !showMissingOnly"
/>

<!-- Card grid: replace `cards` with `filteredCards` -->
<div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
  <div v-for="card in filteredCards" :key="card.id" class="relative">
    <!-- Owned overlay -->
    <div
      v-if="ownedNames.has(card.name)"
      class="absolute top-1 right-1 z-10 rounded-full p-0.5"
      style="background: var(--c-accent)"
    >
      <v-icon icon="mdi-check" size="12" color="white" />
    </div>
    <!-- router-link card (existing) -->
    <router-link :to="`/${$route.params.locale || 'en'}/card/${card.id}`" ...>
      ...
    </router-link>
    <!-- Missing card CTAs (shown below card when not owned) -->
    <div
      v-if="collectionLoaded && !ownedNames.has(card.name)"
      class="flex gap-1 mt-1"
    >
      <v-btn
        size="x-small"
        variant="tonal"
        style="color: var(--c-accent); flex: 1"
        @click.prevent="$router.push(`/${$route.params.locale || 'en'}/card/${card.id}`)"
      >
        {{ $t('setProgress.findTrade') }}
      </v-btn>
    </div>
  </div>
</div>
```

---

## i18n Keys

Add to all 4 locale files (`en.json`, `fr.json`, `de.json`, `it.json`):

### en.json
```json
"setProgress": {
  "owned": "You own {owned} of {total} cards",
  "complete": "{pct}% complete",
  "missingCount": "{count} missing",
  "showMissing": "Show missing only",
  "showAll": "Show all cards",
  "addToWishlist": "Add to wishlist",
  "findTrade": "Find a trade",
  "completeYourSet": "Set complete!"
}
```

### fr.json
```json
"setProgress": {
  "owned": "Vous possédez {owned} sur {total} cartes",
  "complete": "{pct}% complet",
  "missingCount": "{count} manquantes",
  "showMissing": "Voir les manquantes",
  "showAll": "Tout afficher",
  "addToWishlist": "Ajouter à la wishlist",
  "findTrade": "Trouver un échange",
  "completeYourSet": "Set complet !"
}
```

### de.json
```json
"setProgress": {
  "owned": "Du besitzt {owned} von {total} Karten",
  "complete": "{pct}% vollständig",
  "missingCount": "{count} fehlend",
  "showMissing": "Nur fehlende anzeigen",
  "showAll": "Alle anzeigen",
  "addToWishlist": "Zur Wunschliste",
  "findTrade": "Tausch finden",
  "completeYourSet": "Set vollständig!"
}
```

### it.json
```json
"setProgress": {
  "owned": "Possiedi {owned} di {total} carte",
  "complete": "{pct}% completo",
  "missingCount": "{count} mancanti",
  "showMissing": "Mostra solo mancanti",
  "showAll": "Mostra tutto",
  "addToWishlist": "Aggiungi alla wishlist",
  "findTrade": "Trova uno scambio",
  "completeYourSet": "Set completo!"
}
```

---

## SSR Safety

The collection fetch MUST be in `mounted()` only — never in `onServerPrefetch()`.

Reason: `getClient().auth.getSession()` requires browser localStorage (JWT stored there). During vite-ssg prerender there is no auth context. The `SetCollectionBanner` renders nothing if `collectionLoaded` is false, so the SSR HTML is unchanged and SEO is not affected.

Guard pattern:
```js
// Safe — mounted() only runs in browser
async mounted() {
  await this.fetchUserCollection(); // reads auth session from localStorage
},
```

---

## Engagement Psychology Rationale

- **Zeigarnik / completion bias**: "12 missing" frames the gap as finite and achievable — stronger motivator than showing all 144 cards
- **Progress bar**: visual game-like feedback loop; percentage makes progress tangible
- **Green checkmark overlay**: immediate ownership signal; transforms the set grid into a personal checklist
- **Per-card "Find a trade" CTA**: reduces friction from browsing to acting — one click vs navigating to TradeCenter → filtering by card name
- **Missing-only filter**: focused task mode — user sees exactly what they need, not noise

---

## Key Dependencies

- `getClient` from `@/lib/supabaseClient` — Supabase client
- `getCardsBySet` from `@/api` — YGOProdeck set card list
- `v-progress-linear` — Vuetify (already installed)
- `useI18n` / `$t()` — vue-i18n (already installed)
- `mdi-check` icon — MDI icon set (already installed)
- `AddCard.vue` — for "Add to wishlist" headless mode (optional enhancement)

---

## Existing Patterns to Follow

- `SetPage.vue` uses Vue 3 Options API (not Composition API for data/methods) — match this style
- `Library.vue` uses `props: ['login']` to receive user — SetPage should use `getClient().auth.getSession()` directly in mounted() instead (simpler, avoids prop threading)
- All page-level styles use CSS variables: `var(--c-text)`, `var(--c-muted)`, `var(--c-surface-2)`, `var(--c-accent)`, `var(--c-border)` — never hardcode colors
- Loading states use `animate-pulse` skeleton divs (see SetPage loading state pattern)
- Vuetify buttons: `density="comfortable"` or `size="x-small"`, `variant="tonal"` or `variant="flat"`
