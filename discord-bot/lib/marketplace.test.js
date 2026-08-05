const test = require('node:test');
const assert = require('node:assert/strict');
const { groupCollection, relevance, normalizeQuery } = require('./marketplace');

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
