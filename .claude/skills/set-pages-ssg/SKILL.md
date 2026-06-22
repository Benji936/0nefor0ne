# Skill: Set Pages SSG

Reusable patterns for building static Yu-Gi-Oh! card set/collection pages in this stack:
Vue 3 (Options API + Composition API setup) + vite-ssg + @unhead/vue v2 + YGOProdeck API.

---

## Stack Context

| File | Role |
|------|------|
| `frontend/src/router/index.js` | Route definitions — add `set/:setCode` to `localeChildren` |
| `frontend/vite.config.js` | `ssgOptions.includedRoutes` — add set routes at build time |
| `frontend/src/api.js` | Already has `getCardSets()` and `getCardsBySet(setName, locale)` |
| `frontend/src/components/Pages/CardPage.vue` | Reference implementation for `onServerPrefetch` + `useHead` |
| `frontend/src/data/card-ids.js` | Pattern for curated ID list — mirror with `set-codes.js` |

---

## 1. YGOProdeck API: Set Data

### Set List (`cardsets.php`)

```js
import { getCardSets } from '@/api'
// Returns all 1000+ sets in one response — no pagination
const res = await getCardSets() // { data: SetObject[] }
```

**SetObject shape:**
```json
{
  "set_name": "Legend of Blue Eyes White Dragon",
  "set_code": "LOB",
  "num_of_cards": 126,
  "tcg_date": "2002-03-08",
  "set_image": "https://images.ygoprodeck.com/images/sets/LOB.jpg"
}
```
- `set_image` may be null for some sets
- `tcg_date` may be null for unreleased sets
- `set_code` is the route param (short, URL-safe, e.g. "LOB", "LEDE")

### Cards in a Set (`cardinfo.php?cardset=`)

```js
import { getCardsBySet } from '@/api'
// setName must be the FULL set name (not the code!)
const res = await getCardsBySet(setMeta.set_name, locale)
// res.data.data → CardObject[]
```

**CardObject shape** (same as searchById response):
```json
{
  "id": 89631139,
  "name": "Blue-Eyes White Dragon",
  "type": "Normal Monster",
  "level": 8,
  "atk": 3000, "def": 2500,
  "attribute": "LIGHT",
  "race": "Dragon",
  "desc": "...",
  "archetype": "Blue-Eyes",
  "card_sets": [{ "set_name": "...", "set_code": "LOB-001", "set_rarity": "Ultra Rare", "set_price": "62.15" }],
  "card_images": [{ "id": 89631139, "image_url": "...", "image_url_small": "...", "image_url_cropped": "..." }],
  "card_prices": [{ "tcgplayer_price": "0.15", "cardmarket_price": "0.09", ... }]
}
```

No pagination — returns all cards in one call. Sets typically have 40–200 cards.

### Set Code ↔ Set Name Mapping

The route uses `set_code` (e.g. "LOB") but `getCardsBySet` requires the full `set_name`.
Resolve at render time:
```js
const setsRes = await getCardSets()
const setMeta = (setsRes.data || []).find(s => s.set_code === route.params.setCode)
```

---

## 2. Router: Adding the Set Route

**File:** `frontend/src/router/index.js`

```js
const localeChildren = [
  // ... existing routes ...
  { path: "set/:setCode", name: "set", component: () => import("@/components/Pages/SetPage.vue") },
]

// In the route array (legacy redirect without locale):
{ path: "/set/:setCode", redirect: (to) => `/${detectLocale()}/set/${to.params.setCode}` },
```

---

## 3. vite.config.js: Including Set Routes in SSG Build

**File:** `frontend/vite.config.js`

Two options:

### Option A: Curated list (recommended — deterministic builds)

Create `frontend/src/data/set-codes.js` (mirrors `card-ids.js` pattern):
```js
// Top set codes to prerender — curated list
export const TOP_SET_CODES = ['LOB', 'MRD', 'PSV', 'LON', 'DCR', 'LEDE', 'PHNI', /* ... */]
```

In `vite.config.js`:
```js
import { TOP_SET_CODES } from './src/data/set-codes.js'
// In includedRoutes:
for (const code of TOP_SET_CODES) {
  included.push(`/en/set/${encodeURIComponent(code)}`)
}
```

### Option B: Dynamic (most recent N sets from API)

```js
// In includedRoutes (async):
const { getCardSets } = await import('./src/api.js')  // NOTE: api.js uses axios, works in Node
const setsRes = await getCardSets().catch(() => ({ data: [] }))
const allSets = setsRes.data || []
const topSets = allSets
  .filter(s => s.tcg_date && s.num_of_cards >= 40) // skip promos/tins
  .sort((a, b) => new Date(b.tcg_date) - new Date(a.tcg_date))
  .slice(0, 50)
for (const s of topSets) {
  included.push(`/en/set/${encodeURIComponent(s.set_code)}`)
}
```

**Build time note:** Each set route calls `getCardsBySet()` during SSG — 50 sets adds ~30–60s.

---

## 4. SetPage Component: onServerPrefetch Pattern

Mirror `CardPage.vue` exactly. Key rules:
- `ssrSet` and `ssrCards` refs MUST be declared in `setup()`, not `data()` — so `onServerPrefetch` can populate them before `renderToString` snapshots the HTML
- `throw` inside `onServerPrefetch` → vite-ssg skips the route cleanly (no broken HTML written)
- `useHead(computed(...))` driven by the same `ssrSet` ref — reactive on client too

```js
import { ref, computed, onServerPrefetch } from 'vue'
import { useRoute } from 'vue-router'
import { useHead } from '@unhead/vue'
import { getCardSets, getCardsBySet } from '@/api'
import { cardImage } from '@/lib/cardImage'

export default {
  setup() {
    const route    = useRoute()
    const ssrSet   = ref(null)
    const ssrCards = ref([])
    const loading  = ref(true)

    // Build-time prefetch: vite-ssg awaits this before snapshotting HTML
    onServerPrefetch(async () => {
      const setCode = route.params.setCode
      try {
        const setsRes = await getCardSets()
        const setMeta = (setsRes.data || []).find(s => s.set_code === setCode)
        if (!setMeta) throw new Error(`Unknown set ${setCode}`)

        const cardsRes = await getCardsBySet(setMeta.set_name, 'en')
        const data = cardsRes?.data?.data ?? []
        if (!data.length) throw new Error(`No cards for set ${setCode}`)

        ssrSet.value   = setMeta
        ssrCards.value = data
        loading.value  = false
      } catch (err) {
        console.error(`[vite-ssg] Skipping set ${setCode}:`, err?.message ?? err)
        throw err // causes vite-ssg to skip this route silently
      }
    })

    // SEO — reactive to ssrSet (populated by SSR prefetch and client load)
    useHead(computed(() => {
      const set   = ssrSet.value
      const cards = ssrCards.value
      const BASE  = 'https://0nefor.one'
      const path  = route.path || `/en/set/${route.params.setCode}`
      const canonical = `${BASE}${path}`

      if (!set) {
        return {
          title: 'Yu-Gi-Oh! Card Set — One for One',
          meta: [
            { name: 'description', content: 'Browse Yu-Gi-Oh! card sets on One for One.' },
            { property: 'og:url', content: canonical },
            { name: 'twitter:card', content: 'summary_large_image' },
          ],
          link: [{ rel: 'canonical', href: canonical }],
        }
      }

      const title = `${set.set_name} | Yu-Gi-Oh! Card Set — One for One`
      const desc  = `Browse all ${set.num_of_cards} cards in ${set.set_name}. Trade any card on One for One — the free Yu-Gi-Oh! card trading platform.`.slice(0, 155)
      const image = set.set_image || `${BASE}/logo.png`

      const collectionPage = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: set.set_name,
        description: desc,
        url: canonical,
        numberOfItems: cards.length,
        ...(set.set_image ? { image: set.set_image } : {}),
        hasPart: cards.slice(0, 20).map(c => ({
          '@type': 'Product',
          name: c.name,
          image: `https://images.ygoprodeck.com/images/cards/${c.id}.jpg`,
          url: `${BASE}/en/card/${c.id}`,
        })),
      }

      const itemList = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: set.set_name,
        numberOfItems: cards.length,
        itemListElement: cards.slice(0, 50).map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `${BASE}/en/card/${c.id}`,
          name: c.name,
        })),
      }

      const breadcrumb = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home',     item: `${BASE}/en/` },
          { '@type': 'ListItem', position: 2, name: 'Sets',     item: `${BASE}/en/` },
          { '@type': 'ListItem', position: 3, name: set.set_name, item: canonical },
        ],
      }

      return {
        title,
        meta: [
          { name: 'description',          content: desc },
          { property: 'og:type',          content: 'website' },
          { property: 'og:title',         content: title },
          { property: 'og:description',   content: desc },
          { property: 'og:image',         content: image },
          { property: 'og:url',           content: canonical },
          { name: 'twitter:card',          content: 'summary_large_image' },
          { name: 'twitter:title',         content: title },
          { name: 'twitter:description',   content: desc },
          { name: 'twitter:image',         content: image },
        ],
        link: [
          { rel: 'canonical',  href: canonical },
          { rel: 'alternate',  hreflang: 'en',        href: canonical },
          { rel: 'alternate',  hreflang: 'x-default', href: canonical },
        ],
        script: [
          { type: 'application/ld+json', innerHTML: JSON.stringify(collectionPage) },
          { type: 'application/ld+json', innerHTML: JSON.stringify(itemList) },
          { type: 'application/ld+json', innerHTML: JSON.stringify(breadcrumb) },
        ],
      }
    }))

    return { ssrSet, ssrCards, loading }
  },

  data() {
    return {
      error: null,
      setMeta: null,  // client-side set metadata (mirrors ssrSet after load)
      cards: [],      // client-side card list (mirrors ssrCards after load)
    }
  },

  async mounted() {
    await this.load()
  },

  methods: {
    async load() {
      this.loading = true
      this.error   = null
      try {
        const setCode  = this.$route.params.setCode
        const locale   = this.$route.params.locale || 'en'
        const setsRes  = await getCardSets()
        const setMeta  = (setsRes.data || []).find(s => s.set_code === setCode)
        if (!setMeta) { this.error = 'Set not found.'; return }
        const cardsRes = await getCardsBySet(setMeta.set_name, locale)
        const data     = cardsRes?.data?.data ?? []
        this.setMeta   = setMeta
        this.cards     = data
        this.ssrSet    = setMeta   // drive useHead() reactively
        this.ssrCards  = data
      } catch (err) {
        this.error = err?.message ?? 'Failed to load set.'
      } finally {
        this.loading = false
      }
    },
  },
}
```

---

## 5. Template Structure

```html
<template>
  <div class="flex flex-col gap-8 py-6 md:py-10 max-w-5xl mx-auto">

    <!-- Back link -->
    <a href="/" @click.prevent="$router.back()"
       class="flex items-center gap-2 text-sm no-underline transition-opacity hover:opacity-70 w-fit"
       style="color: var(--c-muted)">
      <v-icon icon="mdi-arrow-left" size="16" />
      {{ $t('setPage.backToSearch') }}
    </a>

    <!-- Loading skeleton -->
    <div v-if="loading" class="flex flex-col gap-4 animate-pulse">
      <div class="h-8 rounded w-1/2" style="background: var(--c-skeleton)" />
      <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
        <div v-for="i in 24" :key="i"
             class="rounded-lg aspect-[59/86]"
             style="background: var(--c-skeleton)" />
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center py-16">
      <p style="color: var(--c-muted)">{{ $t('setPage.notFound') }}</p>
    </div>

    <!-- Set content -->
    <template v-else-if="ssrSet">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row gap-6 items-start">
        <img v-if="ssrSet.set_image"
             :src="ssrSet.set_image"
             :alt="ssrSet.set_name"
             class="rounded-lg shadow-lg"
             style="width: 120px; object-fit: contain"
             fetchpriority="high" />
        <div class="flex flex-col gap-2">
          <h1 class="text-2xl font-bold" style="color: var(--c-text)">{{ ssrSet.set_name }}</h1>
          <p class="text-sm" style="color: var(--c-muted)">
            {{ $t('setPage.cardCount', { count: ssrCards.length }) }}
            <span v-if="ssrSet.tcg_date"> · {{ $t('setPage.releaseDate', { date: ssrSet.tcg_date }) }}</span>
          </p>
        </div>
      </div>

      <!-- Card grid -->
      <div class="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
        <router-link
          v-for="c in ssrCards"
          :key="c.id"
          :to="`/${$route.params.locale || 'en'}/card/${c.id}`"
          class="flex flex-col gap-1 no-underline transition-opacity hover:opacity-80"
        >
          <img :src="cardImage(c.id)"
               :alt="c.name"
               loading="lazy"
               class="rounded w-full shadow-sm"
               style="aspect-ratio: 59/86; object-fit: cover" />
          <span class="text-[10px] text-center leading-tight"
                style="color: var(--c-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden">
            {{ c.name }}
          </span>
        </router-link>
      </div>
    </template>

  </div>
</template>
```

---

## 6. Linking from CardPage Printings

In `CardPage.vue` printings section, `s.set_code` is like "LOB-EN001".
Strip to base code and link to set page:
```js
// Computed helper or inline:
const baseCode = s.set_code.split('-')[0]  // "LOB-EN001" → "LOB"
```

```html
<!-- Replace static set_name text with a router-link -->
<router-link
  :to="`/${$route.params.locale || 'en'}/set/${s.set_code.split('-')[0]}`"
  class="truncate grow no-underline transition-opacity hover:opacity-70"
  style="color: var(--c-accent)"
>{{ s.set_name }}</router-link>
```

---

## 7. i18n Keys

Add to `frontend/src/locales/en.json` (and mirror in fr.json, de.json, it.json):
```json
"setPage": {
  "backToSearch": "Back",
  "cardCount": "{count} cards",
  "releaseDate": "Released {date}",
  "notFound": "Set not found",
  "browseAll": "Browse all cards"
}
```

---

## 8. Schema.org: CollectionPage vs ItemList

- Use **`CollectionPage`** as the primary type — describes the page itself as a curated collection.
- Use **`ItemList`** as a second JSON-LD block — gives Google an explicit ordered list of cards for potential rich results.
- Use **`BreadcrumbList`** as a third block — improves site structure signals and breadcrumb display in SERPs.
- `og:type` → `"website"` (not `"product"`) for collection pages.
- Limit `hasPart` to 20 items and `itemListElement` to 50 items to keep JSON-LD payload under 10KB.

---

## 9. CSS Variables (Existing Tokens)

```
--c-text        primary text
--c-muted       secondary/muted text
--c-border      border color
--c-surface-2   card/panel background
--c-skeleton    skeleton pulse background
--c-accent      links, highlights
--c-trade       trade action color
```

---

## 10. Verification Checklist

After `npm run build` (from `frontend/`):

```bash
# Set pages were generated
ls dist/en/set/

# Each has a title and description
grep '<title>' dist/en/set/LOB/index.html
grep 'description' dist/en/set/LOB/index.html

# CollectionPage JSON-LD present
grep 'CollectionPage' dist/en/set/LOB/index.html

# ItemList JSON-LD present
grep 'ItemList' dist/en/set/LOB/index.html

# Canonical link present
grep 'canonical' dist/en/set/LOB/index.html

# og:image not empty
grep 'og:image' dist/en/set/LOB/index.html
```
