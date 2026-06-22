# Search Filters Skill

Reusable guidance for implementing advanced search filters in TradeMarket using the YGOPRODeck API.

---

## YGOPRODeck cardinfo.php — Filter Parameters

Base URL: `https://db.ygoprodeck.com/api/v7/cardinfo.php`

All params are AND-combined. No OR support across param types.

| Param | Type | Notes |
|---|---|---|
| `fname` | string | Fuzzy name search |
| `type` | string | Exact card type string (see below) |
| `attribute` | string | Monster attribute — **must be lowercase** when sent |
| `level` | integer | Level (1–12) or Rank (XYZ, 1–13) |
| `race` | string | Monster sub-type OR Spell/Trap property |
| `linkrating` | integer | Link rating 1–6 (Link monsters only) |
| `num` | integer | Max results (default = all) |
| `staple` | 1 | Staple cards only |
| `banlist` | string | "TCG", "OCG", or "Goat" |
| `cardset` | string | Exact set name |
| `archetype` | string | Archetype name |
| `id` | string | Comma-separated card IDs |

### `type` valid values

**Extra Deck monsters:**
- "Fusion Monster", "Pendulum Effect Fusion Monster"
- "Synchro Monster", "Synchro Pendulum Effect Monster", "Synchro Tuner Monster"
- "XYZ Monster", "XYZ Pendulum Effect Monster"
- "Link Monster"

**Main Deck monsters:**
- "Effect Monster", "Normal Monster", "Normal Tuner Monster", "Tuner Monster"
- "Flip Effect Monster", "Flip Tuner Effect Monster"
- "Gemini Monster", "Spirit Monster", "Toon Monster", "Union Effect Monster"
- "Pendulum Effect Monster", "Pendulum Normal Monster", "Pendulum Tuner Effect Monster"
- "Pendulum Flip Effect Monster", "Pendulum Effect Ritual Monster"
- "Ritual Monster", "Ritual Effect Monster"
- "Skill Card", "Token"

**Spell/Trap:**
- "Spell Card"
- "Trap Card"

### `attribute` valid values (send lowercase, displayed uppercase)
`earth` `water` `fire` `wind` `light` `dark` `divine`

### `race` valid values

**Monster sub-types:**
Aqua, Beast, Beast-Warrior, Cyberse, Dinosaur, Divine-Beast, Dragon, Fairy, Fiend, Fish, Insect, Machine, Plant, Psychic, Pyro, Reptile, Rock, Sea Serpent, Spellcaster, Thunder, Warrior, Winged Beast, Wyrm, Zombie

**Spell properties (used as `race` for Spell Card type):**
Continuous, Counter, Equip, Field, Normal, Quick-Play, Ritual

**Trap properties (used as `race` for Trap Card type):**
Continuous, Counter, Normal

### Pendulum Scale
**Not filterable via API.** Pendulum cards have a `scale` field in response data — apply client-side filtering after fetching if needed.

### API error handling
- Returns HTTP 400 (not empty array) when no cards match — always wrap in `.catch(() => ({ data: { data: [] } }))`
- `fname` + other filters combine correctly

---

## Extended `searchByFilters` in api.js

The existing `searchByFilters({ level, attribute, num })` should be expanded:

```js
export const searchByFilters = ({ fname, type, attribute, level, race, linkrating, num } = {}) => {
  const p = new URLSearchParams();
  if (fname)       p.set('fname', fname);
  if (type)        p.set('type', type);
  if (attribute)   p.set('attribute', attribute.toLowerCase());
  if (level != null) p.set('level', level);
  if (race)        p.set('race', race);
  if (linkrating != null) p.set('linkrating', linkrating);
  if (num != null) p.set('num', num);
  return axios.get(`${API_URL}cardinfo.php?${p.toString()}`)
    .catch(() => ({ data: { data: [] } }));
};
```

---

## Vue 3 Filter Panel Patterns

### Component location
`/frontend/src/components/Pages/search/SearchFiltersPanel.vue`

### Filter state with URL persistence (`<script setup>`)

```js
import { reactive, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const filters = reactive({
  type: '',
  attribute: '',
  level: null,
  race: '',
  linkrating: null,
})

// Initialize from URL on mount
onMounted(() => {
  if (route.query.type)       filters.type = route.query.type
  if (route.query.attribute)  filters.attribute = route.query.attribute
  if (route.query.level)      filters.level = Number(route.query.level)
  if (route.query.race)       filters.race = route.query.race
  if (route.query.linkrating) filters.linkrating = Number(route.query.linkrating)
})

// Sync filters to URL
watch(filters, (f) => {
  const query = { ...route.query }
  const map = { type: f.type, attribute: f.attribute, level: f.level, race: f.race, linkrating: f.linkrating }
  for (const [k, v] of Object.entries(map)) {
    if (v != null && v !== '') query[k] = String(v)
    else delete query[k]
  }
  router.replace({ query })
}, { deep: true })

function clearFilters() {
  Object.assign(filters, { type: '', attribute: '', level: null, race: '', linkrating: null })
}
```

### Conditional filter visibility

Show/hide secondary filters based on selected type category:

```js
const typeCategory = computed(() => {
  if (!filters.type) return 'any'
  if (filters.type.includes('Spell')) return 'spell'
  if (filters.type.includes('Trap')) return 'trap'
  return 'monster'
})

// Only show for monsters
const showAttribute = computed(() => ['any', 'monster'].includes(typeCategory.value))
const showLevel = computed(() => showAttribute.value && !filters.type.includes('Link'))
const showLinkRating = computed(() => filters.type === 'Link Monster')
const showRace = computed(() => typeCategory.value !== 'any')
```

### UI chip pattern for attributes

```vue
<div class="flex flex-wrap gap-2">
  <button
    v-for="attr in ATTRIBUTES"
    :key="attr"
    :class="filters.attribute === attr ? 'ring-2 ring-[var(--c-accent)]' : 'opacity-60'"
    class="px-3 py-1 rounded-full text-xs font-bold uppercase"
    style="background: var(--c-surface-2); color: var(--c-text)"
    @click="filters.attribute = filters.attribute === attr ? '' : attr"
  >
    {{ attr.toUpperCase() }}
  </button>
</div>
```

### Type category grouping for UI

Group the 20+ type strings into 4 display categories for the top-level pill row:

```js
const TYPE_GROUPS = {
  Monster: ['Effect Monster', 'Normal Monster', 'Tuner Monster', /* ... */],
  Fusion: ['Fusion Monster', 'Pendulum Effect Fusion Monster'],
  Synchro: ['Synchro Monster', 'Synchro Pendulum Effect Monster', 'Synchro Tuner Monster'],
  XYZ: ['XYZ Monster', 'XYZ Pendulum Effect Monster'],
  Link: ['Link Monster'],
  Ritual: ['Ritual Monster', 'Ritual Effect Monster', 'Pendulum Effect Ritual Monster'],
  Pendulum: ['Pendulum Effect Monster', 'Pendulum Normal Monster', 'Pendulum Tuner Effect Monster', 'Pendulum Flip Effect Monster'],
  Spell: ['Spell Card'],
  Trap: ['Trap Card'],
}
```

---

## Integration with App.vue Search Flow

### Option A: Search.vue owns filter search (recommended for clean separation)
- Search.vue watches `route.query` for filter params
- When any filter param is present, Search.vue calls `searchByFilters` directly (via `import { searchByFilters } from '@/api'`)
- Emits results up via `update:searchCards` or manages its own `localCards` ref
- App.vue `_doSearch` handles name-only search; filter search handled in Search.vue

### Option B: App.vue owns everything
- App.vue watches all filter query params in addition to `?q=`
- Calls `searchByFilters({ fname: searchQuery, ...filters })` when any filter active
- Passes results as `:search-cards` prop (existing pattern)

### URL query params to use
`?q=` (existing) + `&type=` + `&attribute=` + `&level=` + `&race=` + `&linkrating=`

---

## Files to Create/Modify

| File | Action |
|---|---|
| `frontend/src/api.js` | Extend `searchByFilters` to full param set |
| `frontend/src/components/Pages/search/SearchFiltersPanel.vue` | New component |
| `frontend/src/components/Pages/Search.vue` | Import + render SearchFiltersPanel, pass/emit filters |
| `frontend/src/views/App.vue` | Watch additional filter URL params if Option B chosen |
