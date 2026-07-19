import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { searchCardBySetCode, searchById, searchByFilters } from "@/api";

// ─────────────────────────────────────────────────────────────────────────────
// Pure, component-free helpers — lifted VERBATIM from App.vue (≈ lines 298–493).
// No logic change. `deriveSearch` was already exported there; the rest are now
// named exports so both the navbar and the dedicated page share one source.
// ─────────────────────────────────────────────────────────────────────────────

// ── URL serialization helpers (plain functions, no component deps) ───────────

export function defaultFilters() {
  return {
    kind: null, category: null, spellType: null, trapType: null,
    attribute: [], level: null, levelComparator: 'eq',
    scale: null, scaleComparator: 'eq', race: null,
    linkRating: null, linkRatingComparator: 'eq', linkArrows: [],
  };
}

export function serialize(searchQuery, activeFilters) {
  const q = {};
  if (searchQuery) q.q = searchQuery;
  if (activeFilters.kind) q.k = activeFilters.kind;
  if (activeFilters.category) q.t = activeFilters.category;
  if (activeFilters.spellType) q.t = activeFilters.spellType;
  if (activeFilters.trapType) q.t = activeFilters.trapType;
  if (activeFilters.attribute?.length) q.a = activeFilters.attribute.join(',').toLowerCase();
  if (activeFilters.level != null) {
    q.lv = String(activeFilters.level);
    q.lvc = activeFilters.levelComparator ?? 'eq';
  }
  if (activeFilters.scale != null) {
    q.ps = String(activeFilters.scale);
    q.psc = activeFilters.scaleComparator ?? 'eq';
  }
  if (activeFilters.race) q.r = activeFilters.race;
  if (activeFilters.linkRating != null) {
    q.lr = String(activeFilters.linkRating);
    q.lrc = activeFilters.linkRatingComparator ?? 'eq';
  }
  if (activeFilters.linkArrows?.length) q.la = activeFilters.linkArrows.join(',');
  return q;
}

export function deserialize(query) {
  const f = defaultFilters();
  if (query.k) f.kind = query.k;
  if (query.t) {
    if (f.kind === 'spell') f.spellType = query.t;
    else if (f.kind === 'trap') f.trapType = query.t;
    else f.category = query.t;
  }
  if (query.a) f.attribute = query.a.split(',').map(s => s.toUpperCase());
  if (query.lv != null) {
    f.level = Number(query.lv);
    f.levelComparator = query.lvc ?? 'eq';
  }
  if (query.ps != null) {
    f.scale = Number(query.ps);
    f.scaleComparator = query.psc ?? 'eq';
  }
  if (query.r) f.race = query.r;
  if (query.lr != null) {
    f.linkRating = Number(query.lr);
    f.linkRatingComparator = query.lrc ?? 'eq';
  }
  if (query.la) f.linkArrows = query.la.split(',');
  return {
    searchQuery: query.q ?? '',
    activeFilters: f,
  };
}

// ── Filter → API bridge (plain functions, fully unit-testable) ──────────────

// "Pendulum Monster" is not a single YGOPRODeck `type`; it spans these sub-types.
// The API accepts a comma-separated `type` list, so we expand it server-side.
const PENDULUM_TYPE_LIST = [
  'Pendulum Effect Monster', 'Pendulum Normal Monster', 'Pendulum Effect Ritual Monster',
  'Pendulum Tuner Effect Monster', 'Synchro Pendulum Effect Monster', 'XYZ Pendulum Effect Monster',
  'Pendulum Flip Effect Monster', 'Pendulum Effect Fusion Monster',
];
export const PENDULUM_TYPES = PENDULUM_TYPE_LIST.join(',');

// "Monster" (no specific category) is likewise not a single YGOPRODeck `type` —
// the API has no umbrella "Monster" value, so a request with type omitted returns
// spells/traps too. Enumerate every monster type so the kind=monster filter stays
// server-side and exact. Includes Token and all pendulum sub-types.
const ALL_MONSTER_TYPE_LIST = [
  'Normal Monster', 'Effect Monster', 'Tuner Monster', 'Normal Tuner Monster',
  'Flip Effect Monster', 'Flip Tuner Effect Monster', 'Spirit Monster',
  'Toon Monster', 'Union Effect Monster', 'Gemini Monster',
  'Ritual Monster', 'Ritual Effect Monster',
  'Fusion Monster', 'Synchro Monster', 'Synchro Tuner Monster',
  'XYZ Monster', 'Link Monster', 'Token',
  ...PENDULUM_TYPE_LIST,
];
export const ALL_MONSTER_TYPES = ALL_MONSTER_TYPE_LIST.join(',');

// Monster types that are built into / summoned from the Extra Deck: Fusion,
// Synchro, XYZ, Link, plus their pendulum hybrids (which sit face-up in the
// Extra Deck). Main-deck pendulums (Pendulum Effect/Normal/…) are NOT here —
// they're deck-built like any other main-deck monster.
const EXTRA_DECK_TYPE_LIST = [
  'Fusion Monster', 'Pendulum Effect Fusion Monster',
  'Synchro Monster', 'Synchro Tuner Monster', 'Synchro Pendulum Effect Monster',
  'XYZ Monster', 'XYZ Pendulum Effect Monster',
  'Link Monster',
];
// Main Deck monsters = every monster type that isn't an Extra Deck type, so
// "Main Deck" ∪ "Extra Deck" == every monster (keeps the two groups exhaustive).
const MAIN_DECK_TYPE_LIST = ALL_MONSTER_TYPE_LIST.filter(t => !EXTRA_DECK_TYPE_LIST.includes(t));

// Several panel categories are umbrella labels that map to MORE THAN ONE
// YGOPRODeck type. e.g. the *type* "Ritual Monster" excludes "Ritual Effect
// Monster", so filtering "ritual" alone drops every ritual that has an effect.
// Expand those categories to the full set of variants (effect + pendulum forms)
// so the filter returns all of them. Categories not listed map 1:1 to their type.
const CATEGORY_TYPE_EXPANSIONS = {
  'Ritual Monster':      ['Ritual Monster', 'Ritual Effect Monster', 'Pendulum Effect Ritual Monster'],
  'Fusion Monster':      ['Fusion Monster', 'Pendulum Effect Fusion Monster'],
  'Synchro Monster':     ['Synchro Monster', 'Synchro Tuner Monster', 'Synchro Pendulum Effect Monster'],
  'XYZ Monster':         ['XYZ Monster', 'XYZ Pendulum Effect Monster'],
  'Tuner Monster':       ['Tuner Monster', 'Normal Tuner Monster', 'Synchro Tuner Monster', 'Flip Tuner Effect Monster', 'Pendulum Tuner Effect Monster'],
  'Flip Effect Monster': ['Flip Effect Monster', 'Flip Tuner Effect Monster', 'Pendulum Flip Effect Monster'],
  // Umbrella "Deck location" categories — each expands to its whole type set.
  'Main Deck Monster':   MAIN_DECK_TYPE_LIST,
  'Extra Deck Monster':  EXTRA_DECK_TYPE_LIST,
};

/** Map a panel category to its YGOPRODeck `type` param — expanded to all
 *  variants for umbrella categories, otherwise the category value unchanged. */
export function expandCategory(category) {
  const variants = CATEGORY_TYPE_EXPANSIONS[category];
  return variants ? variants.join(',') : category;
}

// Panel link-arrow tokens → YGOPRODeck `linkmarkers` strings.
export const LINK_ARROW_MARKERS = {
  tl: 'Top-Left',    t: 'Top',     tr: 'Top-Right',
  l:  'Left',                       r:  'Right',
  bl: 'Bottom-Left', b: 'Bottom',  br: 'Bottom-Right',
};

// Encode a numeric filter for YGOPRODeck: eq → "8", gte → "gte8", lte → "lte8".
export function cmpValue(comparator, n) {
  if (comparator === 'gte') return `gte${n}`;
  if (comparator === 'lte') return `lte${n}`;
  return `${n}`;
}

/**
 * Resolve the YGOPRODeck `type` and `race` request params from the current
 * kind/category/sub-type selection.
 *
 * Key API facts this encodes:
 *  - Spells/Traps always have type "Spell Card"/"Trap Card"; their sub-type
 *    (Quick-Play, Counter, …) is expressed through `race`, NOT `type`.
 *  - "Pendulum Monster" has no single type → expand to the pendulum sub-types.
 *  - Monster `race` (Dragon, Spellcaster, …) maps straight to `race`.
 *
 * @returns {{ type: string|null, race: string|null }}
 */
export function resolveTypeRace({ kind, category, spellType, trapType, race }) {
  if (kind === 'spell')  return { type: 'Spell Card', race: spellType || race || null };
  if (kind === 'trap')   return { type: 'Trap Card',  race: trapType  || race || null };
  if (kind === 'monster') {
    if (category === 'Pendulum Monster') return { type: PENDULUM_TYPES, race: race || null };
    // No specific category → constrain to every monster type, otherwise the API
    // (which has no umbrella "Monster" type) would also return spells & traps.
    // With a category, expand umbrella labels (e.g. ritual → ritual + ritual-effect).
    return { type: category ? expandCategory(category) : ALL_MONSTER_TYPES, race: race || null };
  }
  return { type: null, race: race || null }; // kind === null → no type constraint
}

/**
 * Derive the API request params and the list of client-side predicate functions
 * from the current search state.
 *
 * @param {{ searchQuery: string, activeFilters: Object }} opts
 * @returns {{ serverParams: Object, clientPredicates: Function[] }}
 */
export function deriveSearch({ searchQuery, activeFilters }) {
  const {
    kind,
    category,
    spellType,
    trapType,
    attribute,        // array
    level,
    levelComparator,
    scale,
    scaleComparator,
    race,
    linkRating,
    linkRatingComparator,
    linkArrows,       // array
  } = activeFilters;

  const serverParams = {};
  const clientPredicates = [];

  // fname
  if (searchQuery && searchQuery.trim()) {
    serverParams.fname = searchQuery.trim();
  }

  // type + race (kind → category/sub-type; spell/trap sub-type rides on `race`)
  const { type: apiType, race: apiRace } = resolveTypeRace({ kind, category, spellType, trapType, race });
  if (apiType) serverParams.type = apiType;
  if (apiRace) serverParams.race = apiRace;

  // attribute — single → server-side; multiple → client-side OR (the API's
  // `attribute` param can't express OR cleanly, so it's the one client predicate).
  if (Array.isArray(attribute) && attribute.length === 1) {
    serverParams.attribute = attribute[0];
  } else if (Array.isArray(attribute) && attribute.length > 1) {
    const attrs = attribute.map(a => a.toUpperCase());
    clientPredicates.push(card => attrs.includes((card.attribute || '').toUpperCase()));
  }

  // level / scale / link rating — all server-side; the API accepts comparator
  // syntax ("gte8"/"lte4") so range filters don't need client post-filtering.
  if (level != null && level !== '') {
    serverParams.level = cmpValue(levelComparator, Number(level));
  }
  if (scale != null && scale !== '') {
    serverParams.scale = cmpValue(scaleComparator, Number(scale));
  }
  if (linkRating != null && linkRating !== '') {
    serverParams.link = cmpValue(linkRatingComparator, Number(linkRating)); // API param is `link`
  }

  // linkArrows — server-side via `linkmarker` (comma-separated, AND semantics).
  // Panel emits tokens ('tl','t',…); the API expects marker names ('Top-Left','Top',…).
  if (Array.isArray(linkArrows) && linkArrows.length > 0) {
    const markers = linkArrows.map(tok => LINK_ARROW_MARKERS[tok]).filter(Boolean);
    if (markers.length) serverParams.linkmarker = markers.join(',');
  }

  // Raise the fetch cap when a client predicate is active (only multi-attribute),
  // so post-filtering has enough candidates and doesn't silently truncate matches.
  serverParams.num = clientPredicates.length > 0 ? 100 : 40;

  return { serverParams, clientPredicates };
}

/** Returns true when every filter field is at its default (inactive) state. */
export function isFiltersDefault(f) {
  return (
    f.kind === null &&
    f.category === null &&
    f.spellType === null &&
    f.trapType === null &&
    (!Array.isArray(f.attribute) || f.attribute.length === 0) &&
    (f.level === null || f.level === '') &&
    (f.scale === null || f.scale === '') &&
    f.race === null &&
    (f.linkRating === null || f.linkRating === '') &&
    (!Array.isArray(f.linkArrows) || f.linkArrows.length === 0)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// New: sort / page / view URL round-trip (so / pg / vw). Defaults are omitted
// from the URL per the URL-schema table (name / 1 / grid).
// ─────────────────────────────────────────────────────────────────────────────

const SORT_VALUES = ['name', 'atk', 'def', 'level', 'new'];
const DENSITY_VALUES = ['grid', 'compact'];
// Sort fields that read "high → low" and therefore need a client-side reverse of
// the server-paged (ascending) data. KD-3.
const REVERSED_SORTS = new Set(['atk', 'def', 'level']);

/** Serialize the full search state (filters + sort/page/view) to a query object. */
export function serializeView(searchQuery, activeFilters, { sort = 'name', pagesLoaded = 1, density = 'grid' } = {}) {
  const q = serialize(searchQuery, activeFilters);
  if (sort && sort !== 'name') q.so = sort;
  if (pagesLoaded && pagesLoaded > 1) q.pg = String(pagesLoaded);
  if (density && density !== 'grid') q.vw = density;
  return q;
}

/** Deserialize the full search state, including sort/page/view, from a query object. */
export function deserializeView(query) {
  const { searchQuery, activeFilters } = deserialize(query);
  const sort = SORT_VALUES.includes(query.so) ? query.so : 'name';
  const density = DENSITY_VALUES.includes(query.vw) ? query.vw : 'grid';
  let pagesLoaded = Number(query.pg);
  if (!Number.isInteger(pagesLoaded) || pagesLoaded < 1) pagesLoaded = 1;
  return { searchQuery, activeFilters, sort, pagesLoaded, density };
}

// ─────────────────────────────────────────────────────────────────────────────
// useCardSearch() — single source of truth + single async writer.
// Instantiate ONLY in CardsPage.vue. The navbar must NOT call this (KD-1, KD-2).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {{ routeName?: string, pageSize?: number }} [opts]
 */
export function useCardSearch({ routeName = 'cards', pageSize = 40 } = {}) {
  const route = useRoute();
  const router = useRouter();

  // ── state (writable refs) ──
  const searchQuery = ref('');
  const activeFilters = ref(defaultFilters());
  const cards = ref([]);          // the ONE list; only runSearch() writes it
  const totalRows = ref(0);
  const loading = ref(false);
  const sort = ref('name');
  const density = ref('grid');
  const pagesLoaded = ref(1);

  // Internal (non-reactive) sequence + echo-guard bookkeeping.
  let searchSeq = 0;
  let searchTimer = null;
  let lastWrittenQuery = null;
  // Raw server-ASCENDING accumulator (post client-predicate). The display list
  // `cards.value` is derived from this via applySortDirection so reversed sorts
  // (atk/def/level) are reversed ONCE over the whole merged set — keeping global
  // order correct across appended pages (FIX 1). Never reversed in place.
  let rawCards = [];

  // ── derived (readonly computed) ──
  const hasMore = computed(() => cards.value.length < totalRows.value);
  const isFiltersActive = computed(() => !isFiltersDefault(activeFilters.value));

  // Mutate activeFilters with a fresh merged object (never mutate in place), so
  // the deep watcher fires. Mirrors SearchFiltersPanel's emit_() semantics.
  const patchFilters = (delta) => { activeFilters.value = { ...activeFilters.value, ...delta }; };

  // Clear only the filters (leaves the text query, sort and density intact),
  // unlike `reset` which wipes the whole search state.
  const clearFilters = () => { activeFilters.value = defaultFilters(); };

  // Removable active-filter summary for the results header. Same chip set as
  // SearchFiltersPanel.vue (≈ line 138); labels default to the raw value (the
  // page localizes richer labels via its own i18n if desired). Each clear()
  // mirrors the panel's clearing semantics.
  const activeChips = computed(() => {
    const f = activeFilters.value || {};
    const chips = [];
    if (f.kind) {
      chips.push({ id: 'kind', label: f.kind, clear: () => { activeFilters.value = { ...defaultFilters() }; } });
    }
    if (f.category) {
      chips.push({
        id: 'cat',
        label: f.category,
        clear: () => patchFilters({ category: null, scale: null, scaleComparator: 'eq', linkRating: null, linkRatingComparator: 'eq', linkArrows: [] }),
      });
    }
    if (f.spellType) {
      chips.push({ id: 'sp', label: f.spellType, clear: () => patchFilters({ spellType: null }) });
    }
    if (f.trapType) {
      chips.push({ id: 'tr', label: f.trapType, clear: () => patchFilters({ trapType: null }) });
    }
    for (const attr of (f.attribute ?? [])) {
      chips.push({ id: `attr-${attr}`, label: attr, clear: () => patchFilters({ attribute: (activeFilters.value.attribute ?? []).filter(a => a !== attr) }) });
    }
    if (f.level != null) {
      chips.push({ id: 'lv', label: `${f.levelComparator ?? 'eq'} ${f.level}`, clear: () => patchFilters({ level: null, levelComparator: 'eq' }) });
    }
    if (f.scale != null) {
      chips.push({ id: 'ps', label: `${f.scaleComparator ?? 'eq'} ${f.scale}`, clear: () => patchFilters({ scale: null, scaleComparator: 'eq' }) });
    }
    if (f.race) {
      chips.push({ id: 'race', label: f.race, clear: () => patchFilters({ race: null }) });
    }
    if (f.linkRating != null) {
      chips.push({ id: 'lr', label: `${f.linkRatingComparator ?? 'eq'} ${f.linkRating}`, clear: () => patchFilters({ linkRating: null, linkRatingComparator: 'eq' }) });
    }
    for (const tok of (f.linkArrows ?? [])) {
      chips.push({ id: `arr-${tok}`, label: tok, clear: () => patchFilters({ linkArrows: (activeFilters.value.linkArrows ?? []).filter(a => a !== tok) }) });
    }
    return chips;
  });

  const activeCount = computed(() => activeChips.value.length);

  // Apply the canonical sort direction for the current `sort` field to an array.
  // Server already orders ascending; "high → low" fields are reversed client-side.
  const applySortDirection = (arr) => (REVERSED_SORTS.has(sort.value) ? arr.slice().reverse() : arr);

  // ── runSearch: the SOLE writer of cards.value (port of App.vue _doSearch) ──
  // Both the name search and the filtered search go through searchByFilters so the
  // server-side `sort` actually applies (fixing the old name-only path that ignored
  // sort and merely reversed the alphabetical list). YGOPRODeck only sorts ASCENDING,
  // so "high → low" fields (atk/def/level) paginate from the TAIL of the ascending
  // result set and each window is reversed — page 1 shows the global maximum first.
  async function runSearch({ append = false } = {}) {
    const query = searchQuery.value;
    const filtersActive = !isFiltersDefault(activeFilters.value);

    // If no query AND no filters, clear results.
    if (!query.trim() && !filtersActive) {
      rawCards = [];
      cards.value = [];
      totalRows.value = 0;
      return;
    }

    // Capture seq BEFORE the first await (guards against stale responses). AC-11.
    const seq = ++searchSeq;
    // FIX 2: remember the page count to roll back to if THIS append request
    // fails or is superseded, so pagesLoaded never sits ahead of the loaded set.
    const rollbackPages = append ? Math.max(1, pagesLoaded.value - 1) : pagesLoaded.value;
    let committed = false;
    loading.value = true;

    try {
      const { serverParams, clientPredicates } = deriveSearch({
        searchQuery: query,
        activeFilters: activeFilters.value,
      });
      const reversed = REVERSED_SORTS.has(sort.value);

      if (clientPredicates.length) {
        // ── Multi-attribute (client-OR) path ──
        // The API can't express an OR across attributes, so we over-fetch one
        // ascending window (deriveSearch raises `num`) and filter + order it
        // client-side. Pagination here stays the (pre-existing) approximate
        // head-based scheme; reversed fields are reversed over the merged base.
        const num = append ? pageSize : pagesLoaded.value * pageSize;
        const offset = append ? rawCards.length : 0;
        const response = await searchByFilters({ ...serverParams, sort: sort.value, num, offset });
        if (seq !== searchSeq) return; // stale

        const asc = (response.data?.data ?? []).filter(card => clientPredicates.every(pred => pred(card)));
        rawCards = append ? [...rawCards, ...asc] : asc;
        cards.value = applySortDirection(rawCards);

        const total = response.data?.meta?.total_rows;
        totalRows.value = total != null ? total : cards.value.length;
        committed = true;
        syncUrl();
        return;
      }

      // ── Standard path: server-side sort + pagination (no client predicate) ──
      // For reversed (high → low) fields the tail offset depends on the total, so
      // a cold load first probes meta.total_rows with a tiny request, then fetches
      // the tail. Ascending/name/new fields paginate from the head as before.
      let total = append ? totalRows.value : null;
      if (reversed && !append) {
        const probe = await searchByFilters({ ...serverParams, sort: sort.value, num: 1, offset: 0 });
        if (seq !== searchSeq) return; // stale
        total = probe.data?.meta?.total_rows ?? (probe.data?.data?.length ?? 0);
      }

      let num, offset;
      if (!reversed) {
        num = append ? pageSize : pagesLoaded.value * pageSize;
        offset = append ? rawCards.length : 0;
      } else {
        // rawCards holds the ascending TAIL already loaded; the next window sits
        // just below it (lower values), reversed into the display's bottom.
        const loadedAsc = append ? rawCards.length : 0;
        const want = append ? pageSize : pagesLoaded.value * pageSize;
        num = Math.max(0, Math.min(want, total - loadedAsc));
        offset = Math.max(0, total - loadedAsc - num);
      }

      let asc = [];
      if (num > 0) {
        const response = await searchByFilters({ ...serverParams, sort: sort.value, num, offset });
        if (seq !== searchSeq) return; // stale
        asc = response.data?.data ?? [];
        const metaTotal = response.data?.meta?.total_rows;
        if (metaTotal != null) total = metaTotal;
      }

      // setcode / id fallback: a query that isn't a card name (e.g. "LOB-001")
      // returns nothing from fname — resolve it via setcode → id. Cold load only.
      if (asc.length === 0 && !append && query.trim()) {
        const locale = route.params.locale || 'en';
        const alt = await searchCardBySetCode(query);
        if (seq !== searchSeq) return; // stale
        if (alt?.data?.id) {
          const byId = await searchById(alt.data.id, locale);
          if (seq !== searchSeq) return; // stale
          asc = byId.data?.data ?? (Array.isArray(byId.data) ? byId.data : []);
        }
        total = asc.length;
      }

      if (!reversed) {
        rawCards = append ? [...rawCards, ...asc] : asc;
        cards.value = rawCards; // already ascending = display order
      } else {
        // Grow the ascending tail toward index 0; reverse for the display so the
        // global maximum stays first and appended (lower) cards land at the bottom.
        rawCards = append ? [...asc, ...rawCards] : asc;
        cards.value = rawCards.slice().reverse();
      }
      totalRows.value = total != null ? total : cards.value.length;

      committed = true;
      // Reflect the full state in the URL (shareable / bookmarkable).
      syncUrl();
    } catch (err) {
    } finally {
      // FIX 2: only the CURRENT request owns pagesLoaded (preserves seq-guard
      // semantics). A stale/superseded request writes nothing — the winning
      // request fully determines pagesLoaded. If THIS (still-current) append
      // failed to commit, roll its increment back so the counter never sits
      // ahead of the loaded set.
      if (seq === searchSeq) {
        loading.value = false;
        if (append && !committed) pagesLoaded.value = rollbackPages;
      }
    }
  }

  // ── URL reflection (echo-guarded router.replace) — port of App.vue 624–629 ──
  function syncUrl() {
    if (route.name !== routeName) return;
    const serialized = serializeView(searchQuery.value, activeFilters.value, {
      sort: sort.value, pagesLoaded: pagesLoaded.value, density: density.value,
    });
    lastWrittenQuery = serialized;
    router.replace({ name: route.name, query: serialized }).catch(() => {});
  }

  // ── actions ──
  function update() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      pagesLoaded.value = 1;
      runSearch();
    }, 300);
  }

  function loadMore() {
    if (!hasMore.value) return;
    pagesLoaded.value += 1;
    runSearch({ append: true }); // no debounce; sequence-guarded inside runSearch
  }

  function setSort(v) {
    sort.value = v;
    update();
  }

  function setDensity(v) {
    density.value = v;
    syncUrl(); // no refetch
  }

  function reset() {
    clearTimeout(searchTimer);
    searchQuery.value = '';
    activeFilters.value = defaultFilters();
    rawCards = [];
    cards.value = [];
    totalRows.value = 0;
    loading.value = false;
    sort.value = 'name';
    density.value = 'grid';
    pagesLoaded.value = 1;
  }

  // ── init: hydrate from route.query; fetch iff query || filters active ──
  function init() {
    const hydrated = deserializeView(route.query);
    searchQuery.value = hydrated.searchQuery;
    activeFilters.value = hydrated.activeFilters;
    sort.value = hydrated.sort;
    density.value = hydrated.density;
    pagesLoaded.value = hydrated.pagesLoaded;
    if (searchQuery.value || !isFiltersDefault(activeFilters.value)) {
      runSearch(); // cold restore: pg>1 fetched in one request via runSearch
    }
  }

  // ── route → state watcher (echo guard) — port of App.vue 546–559 ──
  watch(
    () => route.query,
    (newQuery) => {
      if (route.name !== routeName) return;
      // Echo guard: skip if this is our own router.replace echoing back.
      if (lastWrittenQuery && JSON.stringify(newQuery) === JSON.stringify(lastWrittenQuery)) {
        lastWrittenQuery = null;
        return;
      }
      const hydrated = deserializeView(newQuery);
      searchQuery.value = hydrated.searchQuery;
      activeFilters.value = hydrated.activeFilters;
      sort.value = hydrated.sort;
      density.value = hydrated.density;
      pagesLoaded.value = hydrated.pagesLoaded;
      // External change (navbar push / back-forward / deep link): one search.
      runSearch();
    },
    { deep: true }
  );

  // Re-run search when the active filters change (debounced, same as text).
  watch(activeFilters, () => { update(); }, { deep: true });

  onBeforeUnmount(() => { clearTimeout(searchTimer); });

  return {
    // state
    searchQuery, activeFilters, cards, totalRows, loading, sort, density, pagesLoaded,
    // derived
    hasMore, isFiltersActive, activeChips, activeCount,
    // actions
    init, update, loadMore, setSort, setDensity, reset, clearFilters, runSearch, syncUrl,
  };
}
