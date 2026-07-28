const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWantList, buildWantRows, wantListTitle } = require('./wantList');

// ── parseWantList ─────────────────────────────────────────────────────────────

test('every line is a wanted card, including the text after LF:', () => {
  const r = parseWantList('LF: Ash Blossom\nKashtira Fenrir\nMaxx "C"');
  assert.deepEqual(r.wantLines, [
    { qty: 1, query: 'Ash Blossom' },
    { qty: 1, query: 'Kashtira Fenrir' },
    { qty: 1, query: 'Maxx "C"' },
  ]);
  assert.equal(r.archetype, null);
  assert.equal(r.price, null);
});

test('an empty LF: first line yields no phantom card', () => {
  const r = parseWantList('LF:\n3x Ash Blossom\nKashtira Fenrir');
  assert.deepEqual(r.wantLines, [
    { qty: 3, query: 'Ash Blossom' },
    { qty: 1, query: 'Kashtira Fenrir' },
  ]);
});

test('supports the three quantity prefixes', () => {
  const r = parseWantList('LF:\n3x Ash Blossom\nx2 Maxx "C"\n4 Called by the Grave');
  assert.deepEqual(r.wantLines, [
    { qty: 3, query: 'Ash Blossom' },
    { qty: 2, query: 'Maxx "C"' },
    { qty: 4, query: 'Called by the Grave' },
  ]);
});

test('pulls the archetype from an explicit archetype: line, not from a card', () => {
  const r = parseWantList('LF: Ash Blossom\narchetype: Darklord');
  assert.equal(r.archetype, 'Darklord');
  assert.deepEqual(r.wantLines, [{ qty: 1, query: 'Ash Blossom' }]);
});

test('accepts archetype with a dash or a bare space separator', () => {
  assert.equal(parseWantList('LF:\narchetype - Sky Striker').archetype, 'Sky Striker');
  assert.equal(parseWantList('LF:\narchetype Blue-Eyes').archetype, 'Blue-Eyes');
});

test('a standalone budget line sets the price and is not a card', () => {
  const r = parseWantList('LF: Ash Blossom\nbudget 120€');
  assert.equal(r.price, 120);
  assert.equal(r.currency, 'EUR');
  assert.deepEqual(r.wantLines, [{ qty: 1, query: 'Ash Blossom' }]);
});

test('a bare price line and other currencies work as a budget', () => {
  assert.deepEqual(
    { price: parseWantList('LF:\n30 GBP').price, cur: parseWantList('LF:\n30 GBP').currency },
    { price: 30, cur: 'GBP' }
  );
  assert.equal(parseWantList('LF:\n19.99$').currency, 'USD');
});

test('a card line that merely contains a price is kept as a card', () => {
  // Not anchored to price-only, so it stays a want line rather than a budget.
  const r = parseWantList('LF:\nAsh Blossom 45€');
  assert.equal(r.price, null);
  assert.deepEqual(r.wantLines, [{ qty: 1, query: 'Ash Blossom 45€' }]);
});

test('# comment lines are ignored', () => {
  const r = parseWantList('LF: Ash Blossom\n# still hunting these\nKashtira Fenrir');
  assert.deepEqual(r.wantLines, [
    { qty: 1, query: 'Ash Blossom' },
    { qty: 1, query: 'Kashtira Fenrir' },
  ]);
});

test('the first archetype and first budget win; later ones are ignored', () => {
  const r = parseWantList('LF:\narchetype: Darklord\narchetype: Blue-Eyes\nbudget 100€\nbudget 200€');
  assert.equal(r.archetype, 'Darklord');
  assert.equal(r.price, 100);
});

// ── buildWantRows ─────────────────────────────────────────────────────────────

test('builds rows from resolved lines, keeping unresolved ones with a null id', () => {
  const rows = buildWantRows([
    { qty: 3, query: 'Ash Blossom', card: { id: 14558127, name: 'Ash Blossom & Joyous Spring' } },
    { qty: 1, query: 'Kashtira Fenrir (alt art)', card: null },
  ]);
  assert.deepEqual(rows, [
    { ygo_card_id: 14558127, card_name: 'Ash Blossom & Joyous Spring', qty: 3, sort_order: 0 },
    { ygo_card_id: null, card_name: 'Kashtira Fenrir (alt art)', qty: 1, sort_order: 1 },
  ]);
});

test('clamps qty to 1..99 and caps the name at 120 chars', () => {
  const long = 'A'.repeat(200);
  const rows = buildWantRows([
    { qty: 0, query: 'X', card: null },
    { qty: 500, query: 'Y', card: null },
    { qty: 2, query: long, card: null },
  ]);
  assert.equal(rows[0].qty, 1);
  assert.equal(rows[1].qty, 99);
  assert.equal(rows[2].card_name.length, 120);
});

test('drops a line that has no name at all', () => {
  const rows = buildWantRows([{ qty: 1, query: '   ', card: null }]);
  assert.equal(rows.length, 0);
});

// ── wantListTitle ─────────────────────────────────────────────────────────────

test('derives a "+N more" title from the rows', () => {
  const rows = buildWantRows([
    { qty: 1, query: 'Ash Blossom', card: null },
    { qty: 1, query: 'Kashtira Fenrir', card: null },
    { qty: 1, query: 'Maxx "C"', card: null },
  ]);
  assert.equal(wantListTitle(rows), 'Ash Blossom +2 more');
});

test('a single want has no "+N more" suffix; an empty list has no title', () => {
  assert.equal(wantListTitle(buildWantRows([{ qty: 1, query: 'Ash Blossom', card: null }])), 'Ash Blossom');
  assert.equal(wantListTitle([]), '');
});
