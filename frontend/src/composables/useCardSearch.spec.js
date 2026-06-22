import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, effectScope } from 'vue';
import {
  defaultFilters,
  serialize,
  deserialize,
  serializeView,
  deserializeView,
  isFiltersDefault,
  deriveSearch,
  ALL_MONSTER_TYPES,
} from './useCardSearch.js';

// ── Mocks for the stateful useCardSearch() integration tests ────────────────
// onBeforeUnmount is a lifecycle API that warns when called outside setup(); we
// run the composable inside an effectScope and no-op the hook so the test stays
// quiet. Everything else from 'vue' is preserved.
vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, onBeforeUnmount: () => {} };
});

// vue-router: useRoute/useRouter normally require an app context.
const routeStub = { name: 'cards', params: { locale: 'en' }, query: {} };
const routerReplace = vi.fn(() => Promise.resolve());
vi.mock('vue-router', () => ({
  useRoute: () => routeStub,
  useRouter: () => ({ replace: routerReplace }),
}));

// @/api: the four search functions runSearch can call. Tests override per-case.
const searchByFilters = vi.fn();
const searchCardByName = vi.fn();
const searchCardBySetCode = vi.fn();
const searchById = vi.fn();
vi.mock('@/api', () => ({
  searchByFilters: (...a) => searchByFilters(...a),
  searchCardByName: (...a) => searchCardByName(...a),
  searchCardBySetCode: (...a) => searchCardBySetCode(...a),
  searchById: (...a) => searchById(...a),
}));

// Imported AFTER the mocks are registered.
const { useCardSearch } = await import('./useCardSearch.js');

// Run a few microtask ticks so the awaited api promise chain settles.
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('serialize / deserialize round-trip', () => {
  it('default (empty) state serializes to an empty query and round-trips', () => {
    const q = serialize('', defaultFilters());
    expect(q).toEqual({});
    const back = deserialize(q);
    expect(back.searchQuery).toBe('');
    expect(back.activeFilters).toEqual(defaultFilters());
  });

  it('round-trips query + every filter dimension', () => {
    const filters = {
      ...defaultFilters(),
      kind: 'monster',
      category: 'Synchro Monster',
      attribute: ['DARK', 'LIGHT'],
      level: 8, levelComparator: 'gte',
      race: 'Dragon',
    };
    const q = serialize('dragon', filters);
    const back = deserialize(q);
    expect(back.searchQuery).toBe('dragon');
    expect(back.activeFilters).toEqual(filters);
  });

  it('round-trips spell sub-type via the shared `t` key', () => {
    const filters = { ...defaultFilters(), kind: 'spell', spellType: 'Quick-Play' };
    const back = deserialize(serialize('', filters));
    expect(back.activeFilters.kind).toBe('spell');
    expect(back.activeFilters.spellType).toBe('Quick-Play');
    expect(back.activeFilters.category).toBeNull();
  });

  it('round-trips link filters (rating + arrows)', () => {
    const filters = {
      ...defaultFilters(),
      kind: 'monster', category: 'Link Monster',
      linkRating: 3, linkRatingComparator: 'lte',
      linkArrows: ['tl', 'br'],
    };
    const back = deserialize(serialize('', filters));
    expect(back.activeFilters).toEqual(filters);
  });
});

describe('serializeView / deserializeView (so / pg / vw)', () => {
  it('omits default sort/page/density from the URL', () => {
    const q = serializeView('dragon', defaultFilters(), { sort: 'name', pagesLoaded: 1, density: 'grid' });
    expect(q).toEqual({ q: 'dragon' });
    expect(q.so).toBeUndefined();
    expect(q.pg).toBeUndefined();
    expect(q.vw).toBeUndefined();
  });

  it('emits non-default sort/page/density and round-trips identically', () => {
    const filters = { ...defaultFilters(), kind: 'monster', attribute: ['DARK'] };
    const opts = { sort: 'atk', pagesLoaded: 3, density: 'compact' };
    const q = serializeView('dragon', filters, opts);
    expect(q.so).toBe('atk');
    expect(q.pg).toBe('3');
    expect(q.vw).toBe('compact');

    const back = deserializeView(q);
    expect(back.searchQuery).toBe('dragon');
    expect(back.activeFilters).toEqual(filters);
    expect(back.sort).toBe('atk');
    expect(back.pagesLoaded).toBe(3);
    expect(back.density).toBe('compact');
  });

  it('falls back to defaults for unknown/invalid so/pg/vw values', () => {
    const back = deserializeView({ so: 'bogus', pg: '0', vw: 'nope' });
    expect(back.sort).toBe('name');
    expect(back.pagesLoaded).toBe(1);
    expect(back.density).toBe('grid');
  });
});

describe('deriveSearch parity (matches pre-extraction App.vue behavior)', () => {
  it('builds fname-only server params for a pure name search', () => {
    const { serverParams, clientPredicates } = deriveSearch({ searchQuery: 'dragon', activeFilters: defaultFilters() });
    expect(serverParams.fname).toBe('dragon');
    expect(serverParams.num).toBe(40);
    expect(clientPredicates).toHaveLength(0);
  });

  it('expands spell sub-type onto `race`, type "Spell Card"', () => {
    const { serverParams } = deriveSearch({
      searchQuery: '',
      activeFilters: { ...defaultFilters(), kind: 'spell', spellType: 'Quick-Play' },
    });
    expect(serverParams.type).toBe('Spell Card');
    expect(serverParams.race).toBe('Quick-Play');
  });

  it('kind=monster with no category constrains `type` to monsters (excludes spells/traps)', () => {
    const { serverParams } = deriveSearch({
      searchQuery: '',
      activeFilters: { ...defaultFilters(), kind: 'monster' },
    });
    // Must send an explicit monster type list — not omit `type` (which would
    // let the API return Spell/Trap cards too). Regression for that leak.
    expect(serverParams.type).toBe(ALL_MONSTER_TYPES);
    const types = serverParams.type.split(',');
    expect(types).toContain('Effect Monster');
    expect(types).toContain('Link Monster');
    expect(types).not.toContain('Spell Card');
    expect(types).not.toContain('Trap Card');
  });

  it('kind=monster WITH a single-type category sends just that type', () => {
    const { serverParams } = deriveSearch({
      searchQuery: '',
      activeFilters: { ...defaultFilters(), kind: 'monster', category: 'Effect Monster' },
    });
    expect(serverParams.type).toBe('Effect Monster');
  });

  it('ritual category expands to every ritual variant (incl. effect rituals)', () => {
    const { serverParams } = deriveSearch({
      searchQuery: '',
      activeFilters: { ...defaultFilters(), kind: 'monster', category: 'Ritual Monster' },
    });
    const types = serverParams.type.split(',');
    expect(types).toContain('Ritual Monster');
    expect(types).toContain('Ritual Effect Monster');           // regression: was missing
    expect(types).toContain('Pendulum Effect Ritual Monster');
  });

  it('umbrella categories (fusion/synchro/xyz/tuner/flip) expand to their variants', () => {
    const typeFor = (category) =>
      deriveSearch({ searchQuery: '', activeFilters: { ...defaultFilters(), kind: 'monster', category } })
        .serverParams.type.split(',');
    expect(typeFor('Synchro Monster')).toContain('Synchro Tuner Monster');
    expect(typeFor('Fusion Monster')).toContain('Pendulum Effect Fusion Monster');
    expect(typeFor('XYZ Monster')).toContain('XYZ Pendulum Effect Monster');
    expect(typeFor('Tuner Monster')).toContain('Normal Tuner Monster');
    expect(typeFor('Flip Effect Monster')).toContain('Flip Tuner Effect Monster');
    // A single-type category is unaffected.
    expect(typeFor('Link Monster')).toEqual(['Link Monster']);
  });

  it('single attribute → server param; multiple → client predicate + num=100', () => {
    const single = deriveSearch({ searchQuery: '', activeFilters: { ...defaultFilters(), kind: 'monster', attribute: ['DARK'] } });
    expect(single.serverParams.attribute).toBe('DARK');
    expect(single.clientPredicates).toHaveLength(0);

    const multi = deriveSearch({ searchQuery: '', activeFilters: { ...defaultFilters(), kind: 'monster', attribute: ['DARK', 'LIGHT'] } });
    expect(multi.serverParams.attribute).toBeUndefined();
    expect(multi.clientPredicates).toHaveLength(1);
    expect(multi.serverParams.num).toBe(100);
    expect(multi.clientPredicates[0]({ attribute: 'DARK' })).toBe(true);
    expect(multi.clientPredicates[0]({ attribute: 'WIND' })).toBe(false);
  });

  it('encodes numeric comparators (gte/lte/eq) for level/scale/link', () => {
    const { serverParams } = deriveSearch({
      searchQuery: '',
      activeFilters: {
        ...defaultFilters(), kind: 'monster', category: 'Link Monster',
        level: 8, levelComparator: 'gte',
        linkRating: 3, linkRatingComparator: 'lte',
      },
    });
    expect(serverParams.level).toBe('gte8');
    expect(serverParams.link).toBe('lte3');
  });

  it('maps link-arrow tokens to YGOPRODeck marker names', () => {
    const { serverParams } = deriveSearch({
      searchQuery: '',
      activeFilters: { ...defaultFilters(), kind: 'monster', category: 'Link Monster', linkArrows: ['tl', 'b'] },
    });
    expect(serverParams.linkmarker).toBe('Top-Left,Bottom');
  });
});

describe('isFiltersDefault', () => {
  it('is true for a fresh default and false once any field is set', () => {
    expect(isFiltersDefault(defaultFilters())).toBe(true);
    expect(isFiltersDefault({ ...defaultFilters(), kind: 'monster' })).toBe(false);
    expect(isFiltersDefault({ ...defaultFilters(), attribute: ['DARK'] })).toBe(false);
  });
});

describe('runSearch — global sort order across appended pages (FIX 1)', () => {
  beforeEach(() => {
    searchByFilters.mockReset();
    searchCardByName.mockReset();
    searchCardBySetCode.mockReset();
    searchById.mockReset();
    routerReplace.mockClear();
    routeStub.query = {};
  });

  // Helper: run useCardSearch in an effectScope so watch/computed clean up.
  const withSearch = async (fn) => {
    const scope = effectScope();
    let api;
    scope.run(() => { api = useCardSearch({ routeName: 'cards', pageSize: 2 }); });
    try {
      await fn(api);
    } finally {
      scope.stop();
    }
  };

  it('descending sort (atk) shows the GLOBAL maximum first and stays ordered after Load more', async () => {
    // The API only sorts ASCENDING, so a reversed (high → low) field paginates
    // from the TAIL: a cold load probes total_rows then fetches the LAST window
    // (offset 2 → [30,40]) so page 1 = global max [40,30] — not a reverse of the
    // lowest page. Load more then appends the next-lower window (offset 0 →
    // [10,20]) at the bottom, giving [40,30,20,10].
    searchByFilters.mockImplementation(({ offset = 0 }) => {
      const page = offset === 0
        ? [{ id: 1, atk: 10 }, { id: 2, atk: 20 }]
        : [{ id: 3, atk: 30 }, { id: 4, atk: 40 }];
      return Promise.resolve({ data: { data: page, meta: { total_rows: 4 } } });
    });

    await withSearch(async (s) => {
      s.sort.value = 'atk';
      s.activeFilters.value = { ...defaultFilters(), kind: 'monster' }; // filtered path

      await s.runSearch();           // cold page 1 (tail window)
      await flush();
      expect(s.cards.value.map(c => c.atk)).toEqual([40, 30]);
      expect(s.totalRows.value).toBe(4);
      expect(s.hasMore.value).toBe(true);

      s.loadMore();                  // append the next-lower window (pagesLoaded → 2)
      await flush();

      expect(s.pagesLoaded.value).toBe(2);
      expect(s.cards.value.map(c => c.atk)).toEqual([40, 30, 20, 10]);
    });
  });

  it('ascending sort (name) preserves natural order across appended pages', async () => {
    searchByFilters.mockImplementation(({ offset = 0 }) => {
      const page = offset === 0
        ? [{ id: 1, atk: 10 }, { id: 2, atk: 20 }]
        : [{ id: 3, atk: 30 }, { id: 4, atk: 40 }];
      return Promise.resolve({ data: { data: page, meta: { total_rows: 4 } } });
    });

    await withSearch(async (s) => {
      s.sort.value = 'name'; // not reversed → identity
      s.activeFilters.value = { ...defaultFilters(), kind: 'monster' };

      await s.runSearch();
      await flush();
      s.loadMore();
      await flush();

      expect(s.cards.value.map(c => c.atk)).toEqual([10, 20, 30, 40]);
    });
  });

  it('rolls pagesLoaded back when an append:true runSearch fails (FIX 2)', async () => {
    let call = 0;
    searchByFilters.mockImplementation(({ offset = 0 }) => {
      call += 1;
      if (offset === 0) {
        return Promise.resolve({ data: { data: [{ id: 1, atk: 10 }, { id: 2, atk: 20 }], meta: { total_rows: 4 } } });
      }
      return Promise.reject(new Error('network')); // the append fails
    });

    await withSearch(async (s) => {
      // Use a non-reversed sort so this exercises the head-pagination append path
      // (the rollback logic is sort-direction independent — descending tail
      // pagination is covered by the test above).
      s.sort.value = 'name';
      s.activeFilters.value = { ...defaultFilters(), kind: 'monster' };

      await s.runSearch();
      await flush();
      expect(s.pagesLoaded.value).toBe(1);

      s.loadMore();                  // pagesLoaded → 2, then the request rejects
      await flush();

      // Rolled back to the pre-increment value; loaded set unchanged.
      expect(s.pagesLoaded.value).toBe(1);
      expect(s.cards.value.map(c => c.atk)).toEqual([10, 20]);
      expect(call).toBe(2);
    });
  });
});

describe('init() — cold restore from a deep-link route.query', () => {
  beforeEach(() => {
    searchByFilters.mockReset();
    searchCardByName.mockReset();
    searchCardBySetCode.mockReset();
    searchById.mockReset();
    routerReplace.mockClear();
    routeStub.query = {};
  });

  // Default pageSize (40) so the cold-restore math is 3 * 40 = 120 (KD-4 / AC-7).
  const withDefaultSearch = async (fn) => {
    const scope = effectScope();
    let api;
    scope.run(() => { api = useCardSearch({ routeName: 'cards' }); });
    try {
      await fn(api);
    } finally {
      scope.stop();
    }
  };

  it('cold-restores a deep link (pg=3 + filter) in ONE searchByFilters request (KD-4 / AC-7)', async () => {
    // Deep link: page 3 of an attribute-filtered search → filtered fetch path.
    routeStub.query = { q: 'dragon', k: 'monster', a: 'dark', pg: '3' };
    searchByFilters.mockResolvedValue({
      data: { data: [{ id: 1 }, { id: 2 }], meta: { total_rows: 200 } },
    });

    await withDefaultSearch(async (s) => {
      s.init();
      await flush();

      // The whole 3-page set is restored in a single request, not 3 paged calls.
      expect(searchByFilters).toHaveBeenCalledTimes(1);
      const [params] = searchByFilters.mock.calls[0];
      expect(params.num).toBe(3 * 40);   // 120
      expect(params.offset).toBe(0);
      expect(s.totalRows.value).toBe(200);
    });
  });

  it('does NOT fetch on a bare page (empty query) and leaves cards empty (AC-16)', async () => {
    routeStub.query = {}; // no q, no filters

    await withDefaultSearch(async (s) => {
      s.init();
      await flush();

      expect(searchByFilters).not.toHaveBeenCalled();
      expect(searchCardByName).not.toHaveBeenCalled();
      expect(s.cards.value).toEqual([]);
    });
  });
});
