<script setup>
import { ref, computed, Transition } from 'vue'
import { useI18n } from 'vue-i18n'
import { iconUrl } from '@/lib/cardIcons'

const props = defineProps({
  filters: Object,
  // 'panel'   — default top-of-page collapsible panel (current behavior, unchanged).
  // 'sidebar' — always-expanded, no toggle/summary/transition (used by CardsPage).
  layout: { type: String, default: 'panel' },
})
const emit  = defineEmits(['update:filters'])

const isSidebar = computed(() => props.layout === 'sidebar')

const { t } = useI18n()

// ─── Static option tables ────────────────────────────────────────────────────

const ATTRIBUTES = ['EARTH', 'WATER', 'FIRE', 'WIND', 'LIGHT', 'DARK', 'DIVINE']

// Monster category label → API `type` string
const MONSTER_CATEGORIES = [
  { label: 'normal',   value: 'Normal Monster' },
  { label: 'effect',   value: 'Effect Monster' },
  { label: 'ritual',   value: 'Ritual Monster' },
  { label: 'fusion',   value: 'Fusion Monster' },
  { label: 'synchro',  value: 'Synchro Monster' },
  { label: 'xyz',      value: 'XYZ Monster' },
  { label: 'pendulum', value: 'Pendulum Monster' },
  { label: 'link',     value: 'Link Monster' },
  { label: 'tuner',    value: 'Tuner Monster' },
  { label: 'flip',     value: 'Flip Effect Monster' },
  { label: 'toon',     value: 'Toon Monster' },
  { label: 'spirit',   value: 'Spirit Monster' },
  { label: 'union',    value: 'Union Effect Monster' },
  { label: 'gemini',   value: 'Gemini Monster' },
  { label: 'token',    value: 'Token' },
]

// "Pendulum Monster" is a logical group but the API has many pendulum subtypes.
// We match on the category value containing "Pendulum".
const PENDULUM_VALUE = 'Pendulum Monster'
const LINK_VALUE     = 'Link Monster'

// Broad "deck location" categories. They share the single-select `category`
// field with MONSTER_CATEGORIES above (picking one clears the others); the
// composable expands these umbrella values to their full `type` list server-side.
const DECK_GROUPS = [
  { key: 'main',  value: 'Main Deck Monster' },
  { key: 'extra', value: 'Extra Deck Monster' },
]

// Values are YGOPRODeck `race` tokens — spell/trap sub-types are filtered via
// `race` (with type "Spell Card"/"Trap Card"), not via `type`.
const SPELL_SUBTYPES = [
  { label: 'normal',     value: 'Normal' },
  { label: 'continuous', value: 'Continuous' },
  { label: 'field',      value: 'Field' },
  { label: 'equip',      value: 'Equip' },
  { label: 'quickplay',  value: 'Quick-Play' },
  { label: 'ritual',     value: 'Ritual' },
]

const TRAP_SUBTYPES = [
  { label: 'normal',     value: 'Normal' },
  { label: 'continuous', value: 'Continuous' },
  { label: 'counter',    value: 'Counter' },
]

const COMPARATORS = [
  { label: '≥', value: 'gte' },
  { label: '=', value: 'eq' },
  { label: '≤', value: 'lte' },
]

const RACES = [
  'Aqua', 'Beast', 'Beast-Warrior', 'Cyberse', 'Dinosaur', 'Divine-Beast',
  'Dragon', 'Fairy', 'Fiend', 'Fish', 'Insect', 'Machine', 'Plant',
  'Psychic', 'Pyro', 'Reptile', 'Rock', 'Sea Serpent', 'Spellcaster',
  'Thunder', 'Warrior', 'Winged Beast', 'Wyrm', 'Zombie',
]

// Link arrow grid: positions in a 3×3 matrix (top-left → bottom-right)
const LINK_ARROW_GRID = [
  { token: 'tl', label: '↖' },
  { token: 't',  label: '↑' },
  { token: 'tr', label: '↗' },
  { token: 'l',  label: '←' },
  { token: null, label: '' },   // center — no arrow
  { token: 'r',  label: '→' },
  { token: 'bl', label: '↙' },
  { token: 'b',  label: '↓' },
  { token: 'br', label: '↘' },
]

// ─── Derived visibility ──────────────────────────────────────────────────────

const typeCategory = computed(() => {
  const k = props.filters?.kind
  if (k === 'spell')   return 'spell'
  if (k === 'trap')    return 'trap'
  if (k === 'monster') return 'monster'
  return 'any'
})

const isMonster   = computed(() => typeCategory.value === 'monster')
const isSpell     = computed(() => typeCategory.value === 'spell')
const isTrap      = computed(() => typeCategory.value === 'trap')
const isAny       = computed(() => typeCategory.value === 'any')

const isPendulum  = computed(() => props.filters?.category === PENDULUM_VALUE)
const isLink      = computed(() => props.filters?.category === LINK_VALUE)

const canUseMonsterFilters = computed(() => isMonster.value || isAny.value)

// The card kind (monster/spell/trap) is auto-detected from whichever sub-filter
// the user clicks — there is no manual any/monster/spell/trap switch — so every
// section stays enabled; clicking a filter switches the kind and clears the
// incompatible ones (see the setters below).
const disabledMonsterFilters = computed(() => false)
const disabledSpellFilters   = computed(() => false)
const disabledTrapFilters    = computed(() => false)

const showAttribute = computed(() => true)
const showLevel     = computed(() => true)
const showScale     = computed(() => canUseMonsterFilters.value && isPendulum.value)
const showRace      = computed(() => true)
const showLink      = computed(() => canUseMonsterFilters.value && isLink.value)
const showCategory  = computed(() => true)
const showSpellType = computed(() => true)
const showTrapType  = computed(() => true)

// Level/Rank is picked via a 12-star strip (like a rating). `hoverLevel` drives
// the hover preview; the glyph switches to the Rank asset when Xyz is active.
const LEVEL_STARS = 12
const hoverLevel   = ref(0)
const isRankMode   = computed(() => props.filters?.category === 'XYZ Monster')
const levelStarUrl = computed(() => iconUrl(isRankMode.value ? 'rank' : 'level'))

// A divider sits between the "what kind of card" block and the "stats" block.
const showStatsBlock = computed(() =>
  showAttribute.value || showLevel.value || showScale.value || showRace.value || showLink.value
)

// ─── Active filter count (for badge) ─────────────────────────────────────────

const activeCount = computed(() => {
  const f = props.filters
  if (!f) return 0
  let n = 0
  if (f.kind)                n++
  if (f.category)            n++
  if (f.spellType)           n++
  if (f.trapType)            n++
  if (f.attribute?.length)   n += f.attribute.length
  if (f.level != null)       n++
  if (f.scale != null)       n++
  if (f.race)                n++
  if (f.linkRating != null)  n++
  if (f.linkArrows?.length)  n += f.linkArrows.length
  return n
})

// Open by default when arriving with filters already applied (e.g. a shared link).
// In 'sidebar' mode the panel is always expanded — no collapse toggle exists.
const expanded = ref(isSidebar.value || activeCount.value > 0)

// Sidebar mode renders the body directly (plain <div>, no animation); panel mode
// wraps it in the existing reveal <Transition>. Avoids duplicating the body markup.
const bodyWrapper = computed(() => (isSidebar.value ? 'div' : Transition))
const bodyWrapperProps = computed(() => (isSidebar.value ? {} : { name: 'reveal' }))

const cmpSym = c => t(`search.filters.comparator.${c || 'eq'}`)

// Flat list of active filters for the collapsed summary — each removable in one click.
const activeChips = computed(() => {
  const f = props.filters || {}
  const chips = []
  if (f.kind) {
    chips.push({ id: 'kind', label: t(`search.filters.kind.${f.kind}`), clear: () => setKind(null) })
  }
  if (f.category) {
    const deck = DECK_GROUPS.find(d => d.value === f.category)
    const key = MONSTER_CATEGORIES.find(c => c.value === f.category)?.label
    chips.push({
      id: 'cat',
      label: deck ? t(`search.filters.deck.${deck.key}`) : key ? t(`search.filters.category.${key}`) : f.category,
      clear: () => emit_({ category: null, scale: null, scaleComparator: 'eq', linkRating: null, linkRatingComparator: 'eq', linkArrows: [] }),
    })
  }
  if (f.spellType) {
    const key = SPELL_SUBTYPES.find(s => s.value === f.spellType)?.label
    chips.push({ id: 'sp', label: key ? t(`search.filters.spellType.${key}`) : f.spellType, clear: () => emit_({ spellType: null }) })
  }
  if (f.trapType) {
    const key = TRAP_SUBTYPES.find(s => s.value === f.trapType)?.label
    chips.push({ id: 'tr', label: key ? t(`search.filters.trapType.${key}`) : f.trapType, clear: () => emit_({ trapType: null }) })
  }
  for (const attr of (f.attribute ?? [])) {
    chips.push({ id: `attr-${attr}`, label: attr, clear: () => toggleAttribute(attr) })
  }
  if (f.level != null) {
    chips.push({ id: 'lv', label: `${t('search.filters.level.label')} ${cmpSym(f.levelComparator)} ${f.level}`, clear: () => emit_({ level: null, levelComparator: 'eq' }) })
  }
  if (f.scale != null) {
    chips.push({ id: 'ps', label: `${t('search.filters.scale.label')} ${cmpSym(f.scaleComparator)} ${f.scale}`, clear: () => emit_({ scale: null, scaleComparator: 'eq' }) })
  }
  if (f.race) {
    chips.push({ id: 'race', label: f.race, clear: () => emit_({ race: null }) })
  }
  if (f.linkRating != null) {
    chips.push({ id: 'lr', label: `${t('search.filters.linkRating.label')} ${cmpSym(f.linkRatingComparator)} ${f.linkRating}`, clear: () => emit_({ linkRating: null, linkRatingComparator: 'eq' }) })
  }
  for (const tok of (f.linkArrows ?? [])) {
    const glyph = LINK_ARROW_GRID.find(a => a.token === tok)?.label
    chips.push({ id: `arr-${tok}`, label: glyph ?? tok, clear: () => toggleLinkArrow(tok) })
  }
  return chips
})

// ─── Default filter shape (used by clear-all) ────────────────────────────────

function defaultFilters() {
  return {
    kind:                 null,
    category:             null,
    spellType:            null,
    trapType:             null,
    attribute:            [],
    level:                null,
    levelComparator:      'eq',
    scale:                null,
    scaleComparator:      'eq',
    race:                 null,
    linkRating:           null,
    linkRatingComparator: 'eq',
    linkArrows:           [],
  }
}

// ─── Emit helpers (never mutate the prop; always emit a fresh merged object) ──

function emit_(delta) {
  emit('update:filters', { ...props.filters, ...delta })
}

function setKind(kind) {
  // Changing kind clears every sub-filter that no longer applies.
  emit('update:filters', { ...defaultFilters(), kind })
}

function setCategory(value) {
  const newVal = props.filters?.category === value ? null : value
  if (props.filters?.kind !== 'monster') {
    emit('update:filters', { ...defaultFilters(), kind: 'monster', category: newVal })
    return
  }
  emit_({
    category: newVal,
    // Link/pendulum sub-filters only make sense for their category.
    linkRating: null, linkRatingComparator: 'eq', linkArrows: [],
    scale: null, scaleComparator: 'eq',
  })
}

function setSpellType(value) {
  const same = props.filters?.spellType === value
  if (props.filters?.kind !== 'spell') {
    emit('update:filters', { ...defaultFilters(), kind: 'spell', spellType: same ? null : value })
    return
  }
  emit_({ spellType: same ? null : value })
}

function setTrapType(value) {
  const same = props.filters?.trapType === value
  if (props.filters?.kind !== 'trap') {
    emit('update:filters', { ...defaultFilters(), kind: 'trap', trapType: same ? null : value })
    return
  }
  emit_({ trapType: same ? null : value })
}

function toggleAttribute(attr) {
  const current = props.filters?.attribute ?? []
  // Single-select: picking a new attribute replaces the previous one; clicking
  // the active attribute clears it.
  const next = current.includes(attr) ? [] : [attr]
  if (props.filters?.kind !== 'monster' && next.length > 0) {
    emit('update:filters', { ...defaultFilters(), kind: 'monster', attribute: next })
    return
  }
  emit_({ attribute: next })
}

function toggleLinkArrow(token) {
  const current = props.filters?.linkArrows ?? []
  const next = current.includes(token) ? current.filter(a => a !== token) : [...current, token]
  if (props.filters?.kind !== 'monster' && next.length > 0) {
    emit('update:filters', { ...defaultFilters(), kind: 'monster', linkArrows: next })
    return
  }
  emit_({ linkArrows: next })
}

function setLevel(val) {
  const n = val === '' || val == null ? null : Number(val)
  if (props.filters?.kind !== 'monster' && n != null) {
    emit('update:filters', { ...defaultFilters(), kind: 'monster', level: Number.isNaN(n) ? null : n })
    return
  }
  emit_({ level: Number.isNaN(n) ? null : n })
}

function setScale(val) {
  const n = val === '' || val == null ? null : Number(val)
  if (props.filters?.kind !== 'monster' && n != null) {
    emit('update:filters', { ...defaultFilters(), kind: 'monster', scale: Number.isNaN(n) ? null : n })
    return
  }
  emit_({ scale: Number.isNaN(n) ? null : n })
}

function setLinkRating(val) {
  const n = val === '' || val == null ? null : Number(val)
  if (props.filters?.kind !== 'monster' && n != null) {
    emit('update:filters', { ...defaultFilters(), kind: 'monster', linkRating: Number.isNaN(n) ? null : n })
    return
  }
  emit_({ linkRating: Number.isNaN(n) ? null : n })
}

function setRace(value) {
  if (value && props.filters?.kind !== 'monster') {
    emit('update:filters', { ...defaultFilters(), kind: 'monster', race: value })
    return
  }
  emit_({ race: value || null })
}

function clearAll() {
  emit('update:filters', defaultFilters())
}
</script>

<template>
  <div class="filters" :class="{ 'filters--sidebar': isSidebar }">
    <!-- ── Toggle row (panel mode only — sidebar is always expanded) ── -->
    <button
      v-if="!isSidebar"
      class="filters__toggle"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="filters__title">
        <svg class="filters__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 5h18l-7 8v6l-4-2v-4z" />
        </svg>
        {{ t('search.filters.title') }}
        <span v-if="activeCount > 0" class="count">{{ activeCount }}</span>
      </span>
      <svg class="chev" :class="{ 'chev--open': expanded }" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <!-- ── Collapsed preview: active filters as removable facets (panel mode only) ── -->
    <div v-if="!isSidebar && !expanded && activeCount > 0" class="summary">
      <span v-for="chip in activeChips" :key="chip.id" class="facet">
        {{ chip.label }}
        <button class="facet__x" :aria-label="`✕ ${chip.label}`" @click="chip.clear">✕</button>
      </span>
      <button class="clear" @click="clearAll">{{ t('search.filters.clear') }}</button>
    </div>

    <!-- ── Expanded controls ──
         Panel mode (default): unchanged — wrapped in the <Transition name="reveal">, gated by `expanded`.
         Sidebar mode: `expanded` is always true (no toggle exists to flip it back) and the
         wrapper is a plain <div> — the <Transition> component is not rendered at all. ── -->
    <component :is="bodyWrapper" v-bind="bodyWrapperProps">
      <div v-if="expanded" class="body">

        <!-- Deck location (broad monster grouping). Kind is auto-detected from the
             sub-filter you pick; clearing lives in the results toolbar now. -->
        <div class="group type-grid" style="--type-grid-cols: 2" :class="{ 'group--disabled': disabledMonsterFilters }">
          <span class="legend">{{ t('search.filters.deck.label') }}</span>
          <div class="pills">
            <button
              v-for="g in DECK_GROUPS"
              :key="g.value"
              class="chip chip--sm"
              :class="{ 'chip--on': filters?.category === g.value }"
              :aria-pressed="filters?.category === g.value"
              :disabled="disabledMonsterFilters"
              @click="setCategory(g.value)"
            >
              {{ t(`search.filters.deck.${g.key}`) }}
            </button>
          </div>
        </div>

        <!-- Spell sub-type -->
        <div class="group spell-trap-inline" :class="{ 'group--disabled': disabledSpellFilters }">
          <span class="legend">{{ t('search.filters.kind.spell') }}</span>
          <div class="pills">
            <button
              v-for="st in SPELL_SUBTYPES"
              :key="st.value"
              class="chip chip--sm spell-trap-inline__chip"
              :class="{ 'chip--on': filters?.spellType === st.value }"
              :aria-pressed="filters?.spellType === st.value"
              :disabled="disabledSpellFilters"
              :title="t(`search.filters.spellType.${st.label}`)"
              @click="setSpellType(st.value)"
            >
              <img v-if="iconUrl(st.value)" :src="iconUrl(st.value)" alt="" aria-hidden="true" class="chip__icon" />
            </button>
          </div>
        </div>

        <!-- Trap sub-type -->
        <div class="group spell-trap-inline" :class="{ 'group--disabled': disabledTrapFilters }">
          <span class="legend">{{ t('search.filters.kind.trap') }}</span>
          <div class="pills">
            <button
              v-for="tt in TRAP_SUBTYPES"
              :key="tt.value"
              class="chip chip--sm spell-trap-inline__chip"
              :class="{ 'chip--on': filters?.trapType === tt.value }"
              :aria-pressed="filters?.trapType === tt.value"
              :disabled="disabledTrapFilters"
              :title="t(`search.filters.trapType.${tt.label}`)"
              @click="setTrapType(tt.value)"
            >
              <img v-if="iconUrl(tt.value)" :src="iconUrl(tt.value)" alt="" aria-hidden="true" class="chip__icon" />
            </button>
          </div>
        </div>

        <!-- Monster category -->
        <div class="group type-grid" :class="{ 'group--disabled': disabledMonsterFilters }">
          <span class="legend">{{ t('search.filters.kind.monster') }}</span>
          <div class="pills">
            <button
              v-for="cat in MONSTER_CATEGORIES"
              :key="cat.value"
              class="chip chip--sm"
              :class="{ 'chip--on': filters?.category === cat.value }"
              :aria-pressed="filters?.category === cat.value"
              :disabled="disabledMonsterFilters"
              @click="setCategory(cat.value)"
            >
              {{ t(`search.filters.category.${cat.label}`) }}
            </button>
          </div>
        </div>

        <hr v-if="showStatsBlock" class="divider" />

        <!-- Attribute -->
        <div class="group attribute-row" :class="{ 'group--disabled': disabledMonsterFilters }">
          <span class="legend">{{ t('search.filters.attribute.label') }}</span>
          <div class="pills">
            <button
              v-for="attr in ATTRIBUTES"
              :key="attr"
              class="chip chip--sm"
              :class="{ 'chip--on': (filters?.attribute ?? []).includes(attr), 'chip--icon': iconUrl(attr), 'chip--mono': !iconUrl(attr) }"
              :aria-pressed="(filters?.attribute ?? []).includes(attr)"
              :aria-label="attr"
              :title="attr"
              :disabled="disabledMonsterFilters"
              @click="toggleAttribute(attr)"
            >
              <img v-if="iconUrl(attr)" :src="iconUrl(attr)" :alt="attr" class="chip__icon chip__icon--lg" />
              <template v-else>{{ attr }}</template>
            </button>
          </div>
        </div>

        <!-- Level / Rank -->
        <div class="group" :class="{ 'group--disabled': disabledMonsterFilters }">
          <span class="legend">{{ t('search.filters.level.label') }}</span>
          <div class="row">
            <div class="seg" role="group" :aria-label="t('search.filters.level.label')">
              <button
                v-for="cmp in COMPARATORS"
                :key="cmp.value"
                :class="{ on: (filters?.levelComparator ?? 'eq') === cmp.value }"
                :aria-pressed="(filters?.levelComparator ?? 'eq') === cmp.value"
                :disabled="disabledMonsterFilters"
                @click="emit_({ levelComparator: cmp.value })"
              >{{ cmp.label }}</button>
            </div>
            <div class="stars" role="group" :aria-label="t('search.filters.level.label')" @mouseleave="hoverLevel = 0">
              <button
                v-for="n in LEVEL_STARS"
                :key="n"
                class="star"
                :class="{ 'star--on': n <= (hoverLevel || filters?.level || 0) }"
                :aria-pressed="filters?.level === n"
                :aria-label="String(n)"
                :title="String(n)"
                :disabled="disabledMonsterFilters"
                @mouseenter="hoverLevel = n"
                @focus="hoverLevel = n"
                @blur="hoverLevel = 0"
                @click="setLevel(filters?.level === n ? null : n)"
              >
                <img v-if="levelStarUrl" :src="levelStarUrl" alt="" aria-hidden="true" class="star__img" />
                <template v-else>★</template>
              </button>
            </div>
            <button v-if="filters?.level != null" class="iconbtn" :aria-label="`✕ ${t('search.filters.level.label')}`" :disabled="disabledMonsterFilters" @click="emit_({ level: null, levelComparator: 'eq' })">✕</button>
          </div>
        </div>

        <!-- Pendulum scale -->
        <div v-if="showScale" class="group" :class="{ 'group--disabled': disabledMonsterFilters }">
          <span class="legend">{{ t('search.filters.scale.label') }}</span>
          <div class="row">
            <div class="seg" role="group" :aria-label="t('search.filters.scale.label')">
              <button
                v-for="cmp in COMPARATORS"
                :key="cmp.value"
                :class="{ on: (filters?.scaleComparator ?? 'eq') === cmp.value }"
                :aria-pressed="(filters?.scaleComparator ?? 'eq') === cmp.value"
                :disabled="disabledMonsterFilters"
                @click="emit_({ scaleComparator: cmp.value })"
              >{{ cmp.label }}</button>
            </div>
            <input
              class="field"
              type="number" min="0" max="13" placeholder="0–13"
              :value="filters?.scale ?? ''"
              :disabled="disabledMonsterFilters"
              @input="setScale($event.target.value)"
            />
            <button v-if="filters?.scale != null" class="iconbtn" :aria-label="`✕ ${t('search.filters.scale.label')}`" :disabled="disabledMonsterFilters" @click="emit_({ scale: null, scaleComparator: 'eq' })">✕</button>
          </div>
        </div>

        <!-- Type / Race -->
        <div class="group" :class="{ 'group--disabled': disabledMonsterFilters }">
          <span class="legend">{{ t('search.filters.race.label') }}</span>
          <div class="row">
            <span class="select">
              <select :value="filters?.race ?? ''" :disabled="disabledMonsterFilters" @change="setRace($event.target.value || null)">
                <option value="">—</option>
                <option v-for="race in RACES" :key="race" :value="race">{{ race }}</option>
              </select>
              <svg class="select__chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </span>
            <button v-if="filters?.race" class="iconbtn" :aria-label="`✕ ${t('search.filters.race.label')}`" :disabled="disabledMonsterFilters" @click="setRace(null)">✕</button>
          </div>
        </div>

        <!-- Link rating + arrows -->
        <div v-if="showLink" class="group" :class="{ 'group--disabled': disabledMonsterFilters }">
          <span class="legend">{{ t('search.filters.linkRating.label') }}</span>
          <div class="row">
            <div class="seg" role="group" :aria-label="t('search.filters.linkRating.label')">
              <button
                v-for="cmp in COMPARATORS"
                :key="cmp.value"
                :class="{ on: (filters?.linkRatingComparator ?? 'eq') === cmp.value }"
                :aria-pressed="(filters?.linkRatingComparator ?? 'eq') === cmp.value"
                :disabled="disabledMonsterFilters"
                @click="emit_({ linkRatingComparator: cmp.value })"
              >{{ cmp.label }}</button>
            </div>
            <input
              class="field"
              type="number" min="1" max="6" placeholder="1–6"
              :value="filters?.linkRating ?? ''"
              :disabled="disabledMonsterFilters"
              @input="setLinkRating($event.target.value)"
            />
            <button v-if="filters?.linkRating != null" class="iconbtn" :aria-label="`✕ ${t('search.filters.linkRating.label')}`" :disabled="disabledMonsterFilters" @click="emit_({ linkRating: null, linkRatingComparator: 'eq' })">✕</button>
          </div>

          <span class="legend" style="margin-top: 8px">{{ t('search.filters.linkArrows.label') }}</span>
          <div class="compass" role="group" :aria-label="t('search.filters.linkArrows.label')">
            <template v-for="(arrow, idx) in LINK_ARROW_GRID" :key="idx">
              <div v-if="arrow.token === null" class="arrow arrow--center" aria-hidden="true">
                {{ filters?.linkRating ?? '·' }}
              </div>
              <button
                v-else
                class="arrow"
                :class="{ 'arrow--on': (filters?.linkArrows ?? []).includes(arrow.token) }"
                :aria-pressed="(filters?.linkArrows ?? []).includes(arrow.token)"
                :aria-label="arrow.token"
                :disabled="disabledMonsterFilters"
                @click="toggleLinkArrow(arrow.token)"
              >{{ arrow.label }}</button>
            </template>
          </div>
        </div>

      </div>
    </component>
  </div>
</template>

<style scoped>
.filters {
  /* Selection accent = amethyst (brand primary). Hot-pink stays reserved for
     wishlist, lime for mutual matches — filters never borrow those roles. */
  --sel:      var(--c-trade);
  --sel-soft: color-mix(in oklch, var(--c-trade) 15%, transparent);
  --sel-line: color-mix(in oklch, var(--c-trade) 48%, transparent);

  font-weight: bold;
  border-right: 1px solid var(--c-border);
  border-radius: 10px;
  color: var(--c-text);
  overflow: clip;

  overflow: scroll;
}

/* Toggle ------------------------------------------------------------------- */
.filters__toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  background: transparent;
  border: none;
  color: var(--c-text);
  cursor: pointer;
  font: inherit;
}
.filters__toggle:focus-visible { outline: 2px solid var(--sel-line); outline-offset: -2px; border-radius: 16px; }
.filters__title { display: flex; align-items: center; gap: 10px; font-size: .875rem; font-weight: 700; letter-spacing: .02em; }
.filters__icon { color: var(--c-muted); }
.count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 20px; padding: 0 6px;
  border-radius: 9999px;
  background: var(--sel-soft); border: 1px solid var(--sel-line); color: var(--c-text);
  font-size: .6875rem; font-weight: 700;
}
.chev { color: var(--c-muted); transition: transform .2s cubic-bezier(0.22, 1, 0.36, 1); }
.chev--open { transform: rotate(180deg); }

/* Collapsed summary -------------------------------------------------------- */
.summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 0 16px 14px; }
.facet {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 4px 4px 12px; border-radius: 9999px;
  background: var(--sel-soft); border: 1px solid var(--sel-line); color: var(--c-text);
  font-size: .75rem; font-weight: 600;
}
.facet__x {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 9999px;
  border: none; background: transparent; color: var(--c-muted);
  font-size: .625rem; cursor: pointer;
  transition: background-color .16s ease-out, color .16s ease-out;
}
.facet__x:hover { background: color-mix(in oklch, var(--c-trade) 28%, transparent); color: var(--c-text); }
.facet__x:focus-visible { outline: 2px solid var(--sel-line); outline-offset: 1px; }

/* Expanded body ------------------------------------------------------------ */
.body { display: flex; flex-direction: column; gap: 18px; padding: 20px 20px;  scrollbar-color: transparent !important; scrollbar-width: 0px;}
/* Sidebar mode hides the toggle header, so the body needs its own top padding
   (panel mode gets that gap from the toggle row above it). */
.filters--sidebar .body { padding-top: 16px; }

.clear {
  background: transparent; border: none; color: var(--c-muted);
  font: inherit; font-size: .75rem; font-weight: 600; cursor: pointer;
  padding: 4px 2px; border-radius: 6px;
  transition: color .16s ease-out;
}
.clear:hover { color: var(--c-text); text-decoration: underline; text-underline-offset: 3px; }
.clear:focus-visible { outline: 2px solid var(--sel-line); outline-offset: 2px; }

.group { display: flex; flex-direction: column; gap: 8px; }
  /* Borderless text cells in an equal-width grid — shared by the Monster type
     grid and the Deck (Main/Extra) grid. Column count via --type-grid-cols. */
  .type-grid .pills {
    display: grid;
    grid-template-columns: repeat(var(--type-grid-cols, 3), minmax(0, 1fr));
    gap: 6px;

  }
  .type-grid .chip {
    width: 100%;
    justify-content: center;
    border: 0;
    border-radius: 0px;
    min-height: 40px;
    background: var(--c-surface);
  }
  .type-grid .chip:hover,
  .type-grid .chip.chip--on {
    background: var(--c-surface-2);
    color: var(--c-text);
  }
  .spell-trap-inline .pills {
    display: flex;
    flex-wrap: nowrap;
  }
  /* Bare-icon spell/trap chips. Qualified with `.chip` to out-specify the base
     `.chip` / `.chip--sm` rules that are declared later in this stylesheet.
     Each chip is an equal-width box (flex: 1) with its icon centered inside. */
  .spell-trap-inline__chip.chip {
    flex: 1 1 0;
    min-width: 0;
    height: 32px;
    padding: 0;
    justify-content: center;
    border: 0;
    border-radius: 0;
    background: var(--c-surface-2);
    opacity: .5;
  }
  .spell-trap-inline__chip.chip .chip__icon {width: 24px; height: 24px; }
  .spell-trap-inline__chip.chip:hover { background: var(--c-surface-2); opacity: .8; }
  .spell-trap-inline__chip.chip.chip--on { background: transparent; border: 0; opacity: 1; }
  .spell-trap-inline__chip.chip:disabled { background: transparent; opacity: .4; }
.pills { display: flex; flex-wrap: wrap; gap: 3px; }
/* Each icon fills an equal-width box across the row, centered inside it. */
.attribute-row .pills { flex-wrap: nowrap;}
.row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.divider { height: 1px; width: 100%; background: var(--c-border); border: none; }

/* Pills -------------------------------------------------------------------- */
.chip {
  appearance: none; cursor: pointer; font: inherit;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 9999px;
  border: 1px solid var(--c-border); background: transparent;
  color: var(--c-muted); font-size: .8125rem; font-weight: 600;
  transition: background-color .16s ease-out, border-color .16s ease-out, color .16s ease-out;
}
.chip:hover { background: var(--c-surface-2); color: var(--c-text); }
.chip:focus-visible { outline: 2px solid var(--sel-line); outline-offset: 2px; }
.chip--sm { padding: 4px 12px; font-size: .75rem; }
.chip--mono { font-family: ui-monospace, 'Cascadia Code', monospace; letter-spacing: .03em; }
.chip--on { background: var(--sel-soft); border-color: var(--sel); color: var(--c-text); }

/* Icon-bearing chips (attribute / spell-trap sub-type) */
.chip__icon { width: 18px; height: 18px; object-fit: contain; display: block; flex-shrink: 0; }
.chip__icon--lg { width: 22px; height: 22px; }
/* Icon-only attribute chips: bare icon, no border/background/padding.
   Selection state is shown via opacity instead of the pill treatment. */
.chip--icon {
  flex: 1 1 0;
  min-width: 0;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  opacity: .5;
}
.chip--icon:hover { background: transparent; opacity: .8; }
.chip--icon.chip--on { background: transparent; border: 0; opacity: 1; }
.chip--icon:disabled { background: transparent; }

/* Segmented comparator ----------------------------------------------------- */
.seg { display: inline-flex; border: 1px solid var(--c-border); border-radius: 9999px; overflow: clip; }
.seg button {
  appearance: none; cursor: pointer; font: inherit;
  min-width: 36px; padding: 6px 0;
  background: transparent; color: var(--c-muted);
  border: none; border-right: 1px solid var(--c-border);
  font-size: .8125rem; font-weight: 700;
  transition: background-color .16s ease-out, color .16s ease-out;
}
.seg button:last-child { border-right: none; }
.seg button:hover { background: var(--c-surface-2); color: var(--c-text); }
.seg button.on { background: var(--sel-soft); color: var(--c-text); }
.seg button:focus-visible { outline: 2px solid var(--sel-line); outline-offset: -2px; }

/* Level/Rank star strip ---------------------------------------------------- */
/* The strip claims its own row and the 12 stars share its width, each shrinking
   to fit while staying square (aspect-ratio) — so they never distort even in the
   narrow sidebar. flex-grow 0 caps them at ~20px in the wider panel layout. */
.stars { display: flex; align-items: center; gap: 3px; flex: 1 1 100%; }
.star {
  appearance: none; cursor: pointer;
  border: 0; background: transparent; padding: 0;
  line-height: 0; border-radius: 6px;
  flex: 0 1 20px; min-width: 0;
  opacity: .3;
  transition: opacity .12s ease-out;
}
.star__img { width: 100%; height: auto; aspect-ratio: 1 / 1; display: block; }
.star.star--on { opacity: 1; }
.star:focus-visible { outline: 2px solid var(--sel-line); outline-offset: 1px; }
.star:disabled { cursor: not-allowed; }

/* Inputs (sit in a darker well for inset depth) ---------------------------- */
.field {
  height: 34px; width: 84px;
  background: var(--c-bg); border: 1px solid var(--c-border); border-radius: 8px;
  color: var(--c-text); padding: 0 10px;
  font: inherit; font-size: .8125rem;
  transition: border-color .16s ease-out, box-shadow .16s ease-out;
}
.field:focus { outline: none; border-color: var(--sel); box-shadow: 0 0 0 3px var(--sel-soft); }

.select { position: relative; display: inline-flex; align-items: center; }
.select select {
  appearance: none; height: 34px; min-width: 180px;
  background: var(--c-bg); border: 1px solid var(--c-border); border-radius: 8px;
  color: var(--c-text); padding: 0 34px 0 12px;
  font: inherit; font-size: .8125rem; cursor: pointer;
  transition: border-color .16s ease-out, box-shadow .16s ease-out;
}
.select select:focus { outline: none; border-color: var(--sel); box-shadow: 0 0 0 3px var(--sel-soft); }
.select__chev { position: absolute; right: 10px; pointer-events: none; color: var(--c-muted); }

.group--disabled { opacity: .56; }
.group--disabled .legend { color: var(--c-muted); }
.chip:disabled {
  cursor: not-allowed;
  opacity: .6;
  background: var(--c-surface-2);
  color: var(--c-muted);
  border-color: var(--c-border);
}
.seg button:disabled {
  cursor: not-allowed;
  opacity: .6;
  color: var(--c-muted);
  background: transparent;
}
.field:disabled,
.select select:disabled {
  background: var(--c-surface-2);
  color: var(--c-muted);
  border-color: var(--c-border);
  cursor: not-allowed;
}
.iconbtn:disabled,
.arrow:disabled {
  cursor: not-allowed;
  opacity: .6;
}

.iconbtn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 9999px;
  border: none; background: transparent; color: var(--c-muted);
  font-size: .75rem; cursor: pointer;
  transition: background-color .16s ease-out, color .16s ease-out;
}
.iconbtn:hover { background: var(--c-surface-2); color: var(--c-text); }
.iconbtn:focus-visible { outline: 2px solid var(--sel-line); outline-offset: 1px; }

/* Link compass ------------------------------------------------------------- */
.compass { display: grid; grid-template-columns: repeat(3, 38px); gap: 6px; }
.arrow {
  width: 38px; height: 38px; border-radius: 9px;
  border: 1px solid var(--c-border); background: transparent; color: var(--c-muted);
  font-size: 1rem; font-weight: 700; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background-color .16s ease-out, border-color .16s ease-out, color .16s ease-out;
}
.arrow:hover { background: var(--c-surface-2); color: var(--c-text); }
.arrow:focus-visible { outline: 2px solid var(--sel-line); outline-offset: 2px; }
.arrow--on { background: var(--sel-soft); border-color: var(--sel); color: var(--c-text); }
.arrow--center {
  border-style: dashed; cursor: default;
  font-family: ui-monospace, 'Cascadia Code', monospace; font-size: .8125rem;
  color: var(--c-muted);
}

/* Reveal transition (opacity + transform only — never layout properties) --- */
.reveal-enter-active, .reveal-leave-active { transition: opacity .18s ease-out, transform .18s ease-out; }
.reveal-enter-from, .reveal-leave-to { opacity: 0; transform: translateY(-4px); }

@media (prefers-reduced-motion: reduce) {
  .filters *, .chev { transition: none !important; }
  .reveal-enter-active, .reveal-leave-active { transition: none; }
  .reveal-enter-from, .reveal-leave-to { transform: none; }
}
</style>
