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

// ─────────────────────────────────────────────────────────────────────────────
// Relevance tiering — a text query matches card NAMES and card TEXT, and the
// listing puts the strongest match first: name and text, then name only, then
// text only.
//
// The tiering has to happen here rather than server-side: YGOPRODeck's `fname`
// and `desc` params UNION when sent together (fname=Exodia 7 rows, desc=Exodia
// 6, both 11) and it offers no way to ask for the intersection, nor to order by
// relevance. So the two streams are fetched separately and ranked on arrival.
// ─────────────────────────────────────────────────────────────────────────────

// How deep the ranking reaches per request. Tiering is only meaningful across a
// set held in full, so the name stream is pulled this many rows at a time
// instead of one display page at a time. Three pages is enough that a normal
// query (a card name matches tens of cards, not hundreds) is ranked in one go,
// while a broad query still costs one bounded request rather than the whole
// database — `fname=a` alone is 12,016 rows.
const RANK_WINDOW = 120;

// Ceiling on how many stream reads one search may chain while topping up a
// short page. See the top-up loop in runRankedSearch.
const MAX_TOP_UP_READS = 8;

const contains = (haystack, needle) =>
  typeof haystack === 'string' && haystack.toLowerCase().includes(needle);

/**
 * Split a batch of cards by how the query matched them. Each bucket keeps the
 * order it arrived in, so the server's sort still decides who leads a tier.
 *
 * @param {Array<{name?: string, desc?: string}>} cards
 * @param {string} query
 * @returns {{both: Array, nameOnly: Array, textOnly: Array}}
 */
export function tierByMatch(cards = [], query = '') {
  const q = String(query ?? '').trim().toLowerCase();
  const both = [], nameOnly = [], textOnly = [];
  for (const card of cards) {
    // With no query every card is here on a filter alone; treat that as the
    // weakest tier so the buckets still concatenate to the original order.
    const inName = q ? contains(card?.name, q) : false;
    const inText = q ? contains(card?.desc, q) : false;
    if (inName && inText) both.push(card);
    else if (inName) nameOnly.push(card);
    else textOnly.push(card);
  }
  return { both, nameOnly, textOnly };
}

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
  // Relevance-search bookkeeping, rebuilt on every cold ranked load. Tracks how
  // far into each of the two streams we have read, and every card id the name
  // stream has produced so the text stream can skip them. Non-reactive — only
  // runRankedSearch reads or writes it.
  let rank = null;

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


  // ── Relevance path: the query searches card text as well as card names ─────
  //
  // Two streams feed it. `fname` returns every card whose NAME matches, which
  // is tier 1 ("name and text") plus tier 2 ("name only"). `desc` returns every
  // card whose TEXT matches, which is those same tier-1 cards plus tier 3
  // ("text only").
  //
  // They are consumed in that order, and that is what makes the listing exact:
  // the text stream is not touched until the name stream is spent, so by the
  // time a text-only card can appear every name match is already known and
  // nothing that belongs in tier 1 can be mistaken for tier 3.
  //
  // Within the name stream, tier 1 leads tier 2 across everything we hold — one
  // RANK_WINDOW-sized read rather than a page. Past that window later batches
  // rank among themselves and land underneath what is already on screen, so the
  // list grows downward and never reshuffles under the reader.
  async function runRankedSearch({ append, seq, query, serverParams, clientPredicates, reversed }) {
    const q = query.trim();
    // fname AND desc together is the UNION of the two streams — that is where
    // the result count comes from. Dropping fname (below) is what isolates the
    // text stream on its own.
    const unionParams = { ...serverParams, desc: q };
    const stale = () => seq !== searchSeq;

    // One batch of rows → display order, with the sort direction applied inside
    // each tier. Reversing the whole batch instead would put tier 3 on top.
    const orderBatch = (rows) => {
      const kept = clientPredicates.length
        ? rows.filter((card) => clientPredicates.every((pred) => pred(card)))
        : rows;
      const { both, nameOnly, textOnly } = tierByMatch(kept, q);
      if (reversed) { both.reverse(); nameOnly.reverse(); textOnly.reverse(); }
      return [...both, ...nameOnly, ...textOnly];
    };

    // Read the next slice of a stream. Ascending sorts walk from the head;
    // "high → low" sorts walk the ascending tail backwards, so page 1 opens on
    // the global maximum exactly as the standard path does.
    const readWindow = async (params, loaded, total, num) => {
      const size = Math.max(0, Math.min(num, total - loaded));
      if (size === 0) return [];
      const offset = reversed ? Math.max(0, total - loaded - size) : loaded;
      const res = await searchByFilters({ ...params, sort: sort.value, num: size, offset });
      return stale() ? [] : (res.data?.data ?? []);
    };

    if (!append || !rank) {
      // Cold load. The name window and the union count go out together; the
      // union total is what the result count reports, and it is the only way to
      // know how many cards the two streams add up to without reading both.
      const windowSize = Math.max(RANK_WINDOW, pagesLoaded.value * pageSize);
      const unionProbe = searchByFilters({ ...unionParams, sort: sort.value, num: 1, offset: 0 });

      let nameRows = [];
      let nameTotal = 0;
      if (reversed) {
        // A tail read needs the total first, so the window costs an extra hop.
        const [nameProbe, union] = await Promise.all([
          searchByFilters({ ...serverParams, sort: sort.value, num: 1, offset: 0 }),
          unionProbe,
        ]);
        if (stale()) return false;
        nameTotal = nameProbe.data?.meta?.total_rows ?? 0;
        rank = { nameLoaded: 0, nameTotal, textLoaded: 0, textTotal: null, seen: new Set(),
                 unionTotal: union.data?.meta?.total_rows ?? nameTotal };
        nameRows = await readWindow(serverParams, 0, nameTotal, windowSize);
        if (stale()) return false;
      } else {
        const [nameRes, union] = await Promise.all([
          searchByFilters({ ...serverParams, sort: sort.value, num: windowSize, offset: 0 }),
          unionProbe,
        ]);
        if (stale()) return false;
        nameRows = nameRes.data?.data ?? [];
        nameTotal = nameRes.data?.meta?.total_rows ?? nameRows.length;
        rank = { nameLoaded: 0, nameTotal, textLoaded: 0, textTotal: null, seen: new Set(),
                 unionTotal: union.data?.meta?.total_rows ?? nameTotal };
      }

      rank.nameLoaded = nameRows.length;
      for (const card of nameRows) rank.seen.add(card.id);
      rawCards = orderBatch(nameRows);
    }

    // Top up until the display has the rows it asked for, or both streams run
    // dry. A window can yield less than it costs — client predicates drop rows,
    // and the text stream skips every card the name stream already produced.
    //
    // Capped, because "yielded less than asked for" is also what a server that
    // pages more tightly than we requested looks like: without the cap a stream
    // handing back a few rows at a time would be read over and over inside a
    // single call. Falling short here is harmless — the page shows what arrived
    // and "Load more" picks the read back up.
    const want = pagesLoaded.value * pageSize;
    let reads = 0;
    while (rawCards.length < want && reads < MAX_TOP_UP_READS) {
      reads += 1;
      if (rank.nameLoaded < rank.nameTotal) {
        const rows = await readWindow(serverParams, rank.nameLoaded, rank.nameTotal, RANK_WINDOW);
        if (stale()) return false;
        if (!rows.length) { rank.nameLoaded = rank.nameTotal; continue; }
        rank.nameLoaded += rows.length;
        for (const card of rows) rank.seen.add(card.id);
        rawCards = [...rawCards, ...orderBatch(rows)];
        continue;
      }

      // Name stream spent — tier 3 starts here.
      if (rank.textTotal === null) {
        const probe = await searchByFilters({ ...serverParams, desc: q, fname: undefined, sort: sort.value, num: 1, offset: 0 });
        if (stale()) return false;
        rank.textTotal = probe.data?.meta?.total_rows ?? 0;
      }
      if (rank.textLoaded >= rank.textTotal) break;

      const textOnlyParams = { ...serverParams, desc: q, fname: undefined };
      const rows = await readWindow(textOnlyParams, rank.textLoaded, rank.textTotal, RANK_WINDOW);
      if (stale()) return false;
      if (!rows.length) { rank.textLoaded = rank.textTotal; continue; }
      rank.textLoaded += rows.length;
      const fresh = rows.filter((card) => !rank.seen.has(card.id));
      for (const card of fresh) rank.seen.add(card.id);
      rawCards = [...rawCards, ...orderBatch(fresh)];
    }

    // A window is read in RANK_WINDOW-sized bites, so it routinely holds more
    // than the page asked for — show the page and keep the rest. "Load more"
    // then costs nothing until the held rows run out.
    cards.value = rawCards.slice(0, want);
    // Once both streams are spent the loaded length IS the total — say so, or
    // "Load more" would sit there offering rows that do not exist (client
    // predicates and the tier-1 overlap both make the union count an overshoot).
    const spent = rank.nameLoaded >= rank.nameTotal
      && rank.textTotal !== null && rank.textLoaded >= rank.textTotal;
    totalRows.value = spent ? rawCards.length : Math.max(rank.unionTotal, rawCards.length);
    return true;
  }

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
      rank = null;
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

      // ── Relevance path ──
      // Any text query goes through the ranked reader, which searches card text
      // as well as names. It also honours client predicates, so it supersedes
      // the multi-attribute path below whenever a query is present.
      if (query.trim()) {
        const ok = await runRankedSearch({ append, seq, query, serverParams, clientPredicates, reversed });
        if (seq !== searchSeq) return; // stale
        if (ok && cards.value.length > 0) {
          committed = true;
          syncUrl();
          return;
        }
        // Nothing matched either stream. A query that is not a card name at all
        // (a set code like "LOB-001") still has one more route to try, below.
        if (!append) {
          const locale = route.params.locale || 'en';
          const alt = await searchCardBySetCode(query);
          if (seq !== searchSeq) return; // stale
          let asc = [];
          if (alt?.data?.id) {
            const byId = await searchById(alt.data.id, locale);
            if (seq !== searchSeq) return; // stale
            asc = byId.data?.data ?? (Array.isArray(byId.data) ? byId.data : []);
          }
          rawCards = asc;
          cards.value = asc;
          totalRows.value = asc.length;
          committed = true;
          syncUrl();
        }
        return;
      }

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
      console.error('Search failed', err);
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
    rank = null;
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
