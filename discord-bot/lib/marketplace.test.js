const test = require('node:test');
const assert = require('node:assert/strict');
const { searchListings, groupCollection, relevance, normalizeQuery } = require('./marketplace');

// ── normalizeQuery ────────────────────────────────────────────────────────────

test('collapses whitespace and rejects anything shorter than two characters', () => {
  assert.equal(normalizeQuery('  Blue-Eyes   White  Dragon '), 'Blue-Eyes White Dragon');
  assert.equal(normalizeQuery('a'), null);
  assert.equal(normalizeQuery('   '), null);
  assert.equal(normalizeQuery(undefined), null);
});

// ── relevance ─────────────────────────────────────────────────────────────────

test('ranks exact over prefix over word-start over mid-word', () => {
  assert.equal(relevance('Ash', 'ash'), 0);
  assert.equal(relevance('Ash Blossom & Joyous Spring', 'ash'), 1);
  assert.equal(relevance('Yuki-Onna, the Ash Mayakashi', 'ash'), 2);
  assert.equal(relevance('Kashtira Fenrir', 'ash'), 3);
});

test('treats a query with regex characters literally', () => {
  assert.equal(relevance('Maxx "C"', 'maxx "c"'), 0);
  // Would throw or match everything if the query were used as a raw pattern.
  assert.equal(relevance('Number 39: Utopia', '('), 3);
});

// ── groupCollection ───────────────────────────────────────────────────────────

const row = (over) => ({
  name: 'Maxx "C"',
  quantity: 1,
  trader: 't1',
  condition: 'Near Mint',
  rarity: 'common',
  language: 'English',
  first_edition: false,
  ...over,
});

test('sums copies of the same card held by the same trader', () => {
  const out = groupCollection([row({ quantity: 2 }), row({ quantity: 3, rarity: 'ultra' })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].qty, 5);
  assert.equal(out[0].variants, 2);
});

test('keeps the same card separate per trader', () => {
  const out = groupCollection([row({ trader: 't1' }), row({ trader: 't2' })]);
  assert.equal(out.length, 2);
});

test('quantity arrives as a numeric string from PostgREST and is still summed', () => {
  const out = groupCollection([row({ quantity: '4' }), row({ quantity: '2' })]);
  assert.equal(out[0].qty, 6);
});

test('orders by relevance first, then by number of copies', () => {
  const out = groupCollection(
    [
      row({ name: 'Kashtira Fenrir', quantity: 9, trader: 'a' }),
      row({ name: 'Ash Blossom & Joyous Spring', quantity: 1, trader: 'b' }),
      row({ name: 'Ash', quantity: 1, trader: 'c' }),
    ],
    'ash',
  );
  assert.deepEqual(
    out.map((c) => c.name),
    ['Ash', 'Ash Blossom & Joyous Spring', 'Kashtira Fenrir'],
  );
});

test('a missing name does not crash grouping', () => {
  const out = groupCollection([row({ name: null })], 'ash');
  assert.equal(out.length, 1);
  assert.equal(out[0].name, '');
});

// ── searchListings expiry ─────────────────────────────────────────────────────

// Nothing flips `status` when an announce's window runs out - expiry is applied
// at read time. A query that filters only on status therefore keeps serving
// listings the website stopped showing a month ago, and it does so silently.
// This asserts every announce read the bot makes carries the cut-off, for both
// kinds - a missing one has no visible symptom on the bot's side, so only a
// test catches it.
function recordingSupabase(calls) {
  return {
    from(table) {
      const call = { table, filters: [] };
      calls.push(call);
      const builder = {
        select: () => builder,
        eq: (col, val) => { call.filters.push(['eq', col, val]); return builder; },
        gt: (col, val) => { call.filters.push(['gt', col, val]); return builder; },
        ilike: (col, val) => { call.filters.push(['ilike', col, val]); return builder; },
        in: (col, val) => { call.filters.push(['in', col, val]); return builder; },
        limit: () => builder,
        then: (resolve) => resolve({ data: [], error: null }),
      };
      return builder;
    },
  };
}

test('hides expired announces from Discord search, both kinds', async () => {
  const calls = [];
  const before = new Date().toISOString();
  await searchListings(recordingSupabase(calls), 'Blue-Eyes');
  const after = new Date().toISOString();

  const announceCalls = calls.filter((c) => c.table === 'announce');
  assert.ok(announceCalls.length >= 4, `expected several announce reads, got ${announceCalls.length}`);

  const kinds = new Set();
  for (const call of announceCalls) {
    const cutoff = call.filters.find(([op, col]) => op === 'gt' && col === 'expires_at');
    const kind = call.filters.find(([op, col]) => op === 'eq' && col === 'kind');
    assert.ok(cutoff, `announce read without an expires_at cut-off: ${JSON.stringify(call.filters)}`);
    assert.ok(cutoff[2] >= before && cutoff[2] <= after, 'cut-off must be now, not a stale constant');
    if (kind) kinds.add(kind[2]);
  }
  assert.deepEqual([...kinds].sort(), ['looking_for', 'sell']);
});
