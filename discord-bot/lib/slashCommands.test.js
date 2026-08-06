const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSearchEmbed, commandDefinitions, formatPrice } = require('./slashCommands');

const APP = 'https://0nefor.one';
const ID = '008fefa0-e896-40e5-9ca7-ca2ce3740333';
const desc = (r) => buildSearchEmbed(r, APP).toJSON().description;

// ── trader links ──────────────────────────────────────────────────────────────

test('links a trader name to their profile route', () => {
  const d = desc({
    query: 'maxx',
    trading: [{ name: 'Maxx "C"', qty: 2, traderId: ID, traderName: 'TinyHex' }],
  });
  assert.match(d, /\[\*\*TinyHex\*\*\]\(https:\/\/0nefor\.one\/en\/trader\/008fefa0-e896-40e5-9ca7-ca2ce3740333\)/);
});

test('falls back to a plain name when the trader id is unknown', () => {
  const d = desc({ query: 'maxx', trading: [{ name: 'Maxx "C"', qty: 1, traderName: 'Ghost' }] });
  assert.match(d, /\*\*Ghost\*\*/);
  assert.doesNotMatch(d, /\/en\/trader\//);
});

test('a trader name cannot inject its own link', () => {
  const d = desc({
    query: 'x',
    trading: [{ name: 'Card', qty: 1, traderId: ID, traderName: 'a](https://evil.example)x' }],
  });
  // The profile route must be the only link target in the output.
  const urls = [...d.matchAll(/\]\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(urls, [`${APP}/en/trader/${ID}`]);
  assert.doesNotMatch(d, /evil\.example\)/);
});

test('links traders in the wanted and listings sections too', () => {
  const d = desc({
    query: 'darklord',
    wanted: [{ source: 'announce', id: 56, label: 'Darklord', traderId: ID, traderName: 'The one' }],
    listings: [
      { id: 38, title: 'Dominus Impulse', price: 25, currency: 'EUR', traderId: ID, traderName: 'juiicy' },
    ],
  });
  assert.equal([...d.matchAll(/\/en\/trader\//g)].length, 2);
  assert.match(d, /\/en\/announces\/56/);
  assert.match(d, /\/en\/announces\/38/);
});

// ── rendering details ─────────────────────────────────────────────────────────

test('shows quantity and condition, and hides noise like common/English', () => {
  const d = desc({
    query: 'x',
    trading: [
      {
        name: 'Card',
        qty: 3,
        condition: 'Near Mint',
        rarity: 'common',
        language: 'English',
        firstEdition: false,
        traderId: ID,
        traderName: 'T',
      },
    ],
  });
  assert.match(d, /×3 · Near Mint/);
  assert.doesNotMatch(d, /common|English/);
});

test('a single copy shows no multiplier', () => {
  const d = desc({ query: 'x', trading: [{ name: 'Card', qty: 1, traderId: ID, traderName: 'T' }] });
  assert.doesNotMatch(d, /×/);
});

test('empty results explain what to do instead of showing blank sections', () => {
  const d = desc({ query: 'nothing', trading: [], wanted: [], listings: [] });
  assert.match(d, /Nobody is trading/);
  assert.doesNotMatch(d, /Trading \(/);
});

test('prices render number-then-symbol, and a null price reads as trade only', () => {
  assert.equal(formatPrice(45, 'EUR'), '45€');
  assert.equal(formatPrice(19.99, 'EUR'), '19.99€');
  assert.equal(formatPrice(30, 'GBP'), '30£');
  assert.equal(formatPrice(null, 'EUR'), 'Trade only');
});

// ── definitions ───────────────────────────────────────────────────────────────

test('registers exactly search, lf and duel, with duel as a launch entry point', () => {
  const defs = commandDefinitions();
  assert.deepEqual(defs.map((d) => d.name), ['search', 'lf', 'duel']);
  const duel = defs.find((d) => d.name === 'duel');
  assert.equal(duel.type, 4); // PrimaryEntryPoint
  assert.equal(duel.handler, 2); // DiscordLaunchActivity
  assert.equal(duel.options, undefined);
});
