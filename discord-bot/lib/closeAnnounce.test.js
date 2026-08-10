const test = require('node:test');
const assert = require('node:assert');
const { isCloseCommand, closedStatusFor, canCloseAnnounce } = require('./closeAnnounce');

// ── command recognition ──────────────────────────────────────────────────────

test('recognises every closing alias, case-insensitively', () => {
  for (const w of ['!close', '!sold', '!found', '!cancel', '!SOLD', '  !Close ']) {
    assert.equal(isCloseCommand(w), true, w);
  }
});

test('does not recognise other commands or bare words', () => {
  for (const w of ['!help', '!closed', 'close', '!', '', null, undefined]) {
    assert.equal(isCloseCommand(w), false, String(w));
  }
});

test('sold and found record a sale; close and cancel just retire the listing', () => {
  assert.equal(closedStatusFor('!sold'),   'sold');
  assert.equal(closedStatusFor('!found'),  'sold');
  assert.equal(closedStatusFor('!close'),  'archived');
  assert.equal(closedStatusFor('!cancel'), 'archived');
  assert.equal(closedStatusFor('!help'),   null);
});

// ── authorisation ────────────────────────────────────────────────────────────

const SELLER  = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER   = 'aaaaaaaa-0000-0000-0000-000000000002';
const AUTHOR_DISCORD = '1536285435867955290';
const OTHER_DISCORD  = '9999999999999999999';

test('the account that owns the listing may close it', () => {
  assert.equal(canCloseAnnounce({
    announce: { seller: SELLER, discord_author_id: null },
    discordUserId: OTHER_DISCORD,
    supabaseUserId: SELLER,
  }), true);
});

test('a different account may not', () => {
  assert.equal(canCloseAnnounce({
    announce: { seller: SELLER, discord_author_id: null },
    discordUserId: OTHER_DISCORD,
    supabaseUserId: OTHER,
  }), false);
});

test('the Discord author of a community announce may close it without an account', () => {
  assert.equal(canCloseAnnounce({
    announce: { seller: null, discord_author_id: AUTHOR_DISCORD },
    discordUserId: AUTHOR_DISCORD,
    supabaseUserId: null,
  }), true);
});

test('another Discord user may not close a community announce', () => {
  assert.equal(canCloseAnnounce({
    announce: { seller: null, discord_author_id: AUTHOR_DISCORD },
    discordUserId: OTHER_DISCORD,
    supabaseUserId: null,
  }), false);
});

// The regression this module exists for.
test('a signed-out stranger cannot close a community announce by matching null to null', () => {
  assert.equal(canCloseAnnounce({
    announce: { seller: null, discord_author_id: AUTHOR_DISCORD },
    discordUserId: null,
    supabaseUserId: null,
  }), false);
});

test('a null seller does not match a signed-out visitor', () => {
  assert.equal(canCloseAnnounce({
    announce: { seller: null, discord_author_id: null },
    discordUserId: null,
    supabaseUserId: null,
  }), false);
});

test('mods may close on the author behalf', () => {
  assert.equal(canCloseAnnounce({
    announce: { seller: SELLER, discord_author_id: null },
    discordUserId: OTHER_DISCORD,
    supabaseUserId: OTHER,
    isMod: true,
  }), true);
});

test('a missing announce is never closable', () => {
  assert.equal(canCloseAnnounce({
    announce: null, discordUserId: AUTHOR_DISCORD, supabaseUserId: SELLER, isMod: true,
  }), false);
});
