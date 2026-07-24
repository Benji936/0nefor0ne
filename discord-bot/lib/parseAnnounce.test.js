const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAnnounce, ANNOUNCE_KIND } = require('./parseAnnounce');

const ARCHETYPES = ['Darklord', 'Blue-Eyes', 'HERO', 'Sky Striker', 'Dark Magician'];

test('parses a classic WTS post as a sell announce', () => {
  const r = parseAnnounce('WTS: Blue-Eyes White Dragon PSA 9\nMint condition.\nPrice: 45€', ARCHETYPES);
  assert.equal(r.kind, ANNOUNCE_KIND.SELL);
  assert.equal(r.title, 'Blue-Eyes White Dragon PSA 9');
  assert.equal(r.price, 45);
  assert.equal(r.currency, 'EUR');
  assert.equal(r.archetype, null);
});

test('detects the LF prefix and pulls out the archetype', () => {
  const r = parseAnnounce('LF: Darklord deck base', ARCHETYPES);
  assert.equal(r.kind, ANNOUNCE_KIND.LOOKING_FOR);
  assert.equal(r.archetype, 'Darklord');
  assert.equal(r.wantDetail, 'deck base');
  assert.equal(r.title, 'Darklord deck base');
});

test('accepts LF without a colon and in lower case', () => {
  const r = parseAnnounce('lf sky striker playset', ARCHETYPES);
  assert.equal(r.kind, ANNOUNCE_KIND.LOOKING_FOR);
  assert.equal(r.archetype, 'Sky Striker');
  assert.equal(r.wantDetail, 'playset');
});

test('does not treat LFP or Golfer as an LF prefix', () => {
  assert.equal(parseAnnounce('LFP playmat 20€', ARCHETYPES).kind, ANNOUNCE_KIND.SELL);
  assert.equal(parseAnnounce('Golfer deck 30€', ARCHETYPES).kind, ANNOUNCE_KIND.SELL);
});

test('an LF post with no recognised archetype keeps the text as the detail', () => {
  const r = parseAnnounce('LF: some obscure promo', ARCHETYPES);
  assert.equal(r.kind, ANNOUNCE_KIND.LOOKING_FOR);
  assert.equal(r.archetype, null);
  assert.equal(r.wantDetail, 'some obscure promo');
  assert.equal(r.title, 'some obscure promo');
});

test('price is null when the message states none', () => {
  assert.equal(parseAnnounce('LF: Darklord deck base', ARCHETYPES).price, null);
});

test('a sell post with no stated price yields price null, not 0', () => {
  const r = parseAnnounce('WTS: some card', ARCHETYPES);
  assert.equal(r.kind, ANNOUNCE_KIND.SELL);
  assert.equal(r.price, null);
});

test('a sell post that states 0€ still yields 0, not null', () => {
  const r = parseAnnounce('WTS: some card\n0€', ARCHETYPES);
  assert.equal(r.kind, ANNOUNCE_KIND.SELL);
  assert.equal(r.price, 0);
});

test('reads a budget out of an LF post', () => {
  const r = parseAnnounce('LF: Darklord deck base\nBudget 120€', ARCHETYPES);
  assert.equal(r.price, 120);
  assert.equal(r.currency, 'EUR');
});

test('recognises the three currencies', () => {
  assert.equal(parseAnnounce('WTS card\n30$', ARCHETYPES).currency, 'USD');
  assert.equal(parseAnnounce('WTS card\n30£', ARCHETYPES).currency, 'GBP');
  assert.equal(parseAnnounce('WTS card\n30 EUR', ARCHETYPES).currency, 'EUR');
});

test('truncates an over-long title to the first 117 characters plus an ellipsis', () => {
  const r = parseAnnounce('WTS: ' + 'a'.repeat(200) + '\n10€', ARCHETYPES);
  assert.equal(r.title.length, 118);
  assert.equal(r.title.slice(0, 117), 'a'.repeat(117));
  assert.equal(r.title.slice(117), '…');
});

test('strips the WTS prefix regardless of separator style', () => {
  assert.equal(parseAnnounce('WTS Blue-Eyes White Dragon', ARCHETYPES).title, 'Blue-Eyes White Dragon');
  assert.equal(parseAnnounce('WTS - Blue-Eyes White Dragon', ARCHETYPES).title, 'Blue-Eyes White Dragon');
  assert.equal(parseAnnounce('WTS: Blue-Eyes White Dragon', ARCHETYPES).title, 'Blue-Eyes White Dragon');
});

test('an empty message falls back to Untitled', () => {
  assert.equal(parseAnnounce('', ARCHETYPES).title, 'Untitled');
});

test('a message that strips to nothing yields an empty title, not Untitled', () => {
  assert.equal(parseAnnounce('WTS:', ARCHETYPES).title, '');
  assert.equal(parseAnnounce('LF:', ARCHETYPES).title, '');
});

test('truncates an over-long want_detail to satisfy the 120-char DB constraint', () => {
  const r = parseAnnounce('LF: ' + 'a'.repeat(200), ARCHETYPES);
  assert.equal(r.kind, ANNOUNCE_KIND.LOOKING_FOR);
  assert.equal(r.archetype, null);
  assert.ok(r.wantDetail.length <= 120);
  assert.equal(r.wantDetail.length, 118);
  assert.equal(r.wantDetail.slice(0, 117), 'a'.repeat(117));
  assert.equal(r.wantDetail.slice(117), '…');
});

test('does not match an archetype that only prefixes a longer word', () => {
  // "HERO" used to match inside "heroic" because the pattern was word-bounded
  // at the start only.
  const r = parseAnnounce('LF: heroic challenger reprint', ARCHETYPES);
  assert.equal(r.archetype, null);
  assert.equal(r.wantDetail, 'heroic challenger reprint');
});

test('does not let a one-letter archetype match the start of a word', () => {
  // "P" is a real YGOPRODeck archetype; it must not swallow "playset".
  const r = parseAnnounce('LF: playset of Ash Blossom', [...ARCHETYPES, 'P']);
  assert.equal(r.archetype, null);
  assert.equal(r.wantDetail, 'playset of Ash Blossom');
});

test('still matches a pluralised archetype and strips the plural', () => {
  const r = parseAnnounce('LF: Darklords deck base', ARCHETYPES);
  assert.equal(r.archetype, 'Darklord');
  assert.equal(r.wantDetail, 'deck base');
});

test('matches an -es plural', () => {
  const r = parseAnnounce('LF: heroes for my deck', ARCHETYPES);
  assert.equal(r.archetype, 'HERO');
  assert.equal(r.wantDetail, 'for my deck');
});

test('matches an archetype whose name ends in a non-word character', () => {
  const r = parseAnnounce('LF: D.D. playset', [...ARCHETYPES, 'D.D.']);
  assert.equal(r.archetype, 'D.D.');
  assert.equal(r.wantDetail, 'playset');
});

test('survives an empty archetype list', () => {
  const r = parseAnnounce('LF: Darklord deck base', []);
  assert.equal(r.kind, ANNOUNCE_KIND.LOOKING_FOR);
  assert.equal(r.archetype, null);
  assert.equal(r.wantDetail, 'Darklord deck base');
});
