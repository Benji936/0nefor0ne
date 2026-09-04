const test = require('node:test');
const assert = require('node:assert/strict');

const { pickTournament, pickMessage, friendlyError, roundStartedMessage } =
  require('./tournamentCommands');

const APP = 'https://0nefor.one';

const t = (id, status, name = `T${id}`) => ({ tournament_id: id, status, name });

// ── picking ──────────────────────────────────────────────────────────────────

test('one candidate needs no question', () => {
  const r = pickTournament([t(7, 'registration')], null, 'join');
  assert.equal(r.ok, true);
  assert.equal(r.tournament.tournament_id, 7);
});

test('an explicit id is taken when it is running here', () => {
  const r = pickTournament([t(7, 'registration'), t(9, 'active')], 9, 'pairing');
  assert.equal(r.ok, true);
  assert.equal(r.tournament.tournament_id, 9);
});

// The RPCs would refuse a foreign tournament anyway, but "that is not running
// here" beats a permission error about somebody else's event.
test('an id from another server is refused by name, not by permission error', () => {
  const r = pickTournament([t(7, 'registration')], 999, 'join');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_here');
  assert.match(pickMessage(r, 'join'), /not running in this server/);
});

test('a string id from the interaction still matches', () => {
  const r = pickTournament([t(7, 'active')], '7', 'pairing');
  assert.equal(r.ok, true);
});

test('join looks only at what you can still get into', () => {
  const rows = [t(1, 'active'), t(2, 'registration')];
  assert.equal(pickTournament(rows, null, 'join').tournament.tournament_id, 2);
  assert.equal(pickTournament(rows, null, 'checkin').tournament.tournament_id, 2);
});

test('pairing and round look only at what is being played', () => {
  const rows = [t(1, 'active'), t(2, 'registration')];
  assert.equal(pickTournament(rows, null, 'pairing').tournament.tournament_id, 1);
  assert.equal(pickTournament(rows, null, 'round').tournament.tournament_id, 1);
});

// You can leave right up until the event ends, so drop is the one that spans
// both stages — and with one of each it is genuinely ambiguous.
test('drop spans both stages and asks when there is one of each', () => {
  const r = pickTournament([t(1, 'active'), t(2, 'registration')], null, 'drop');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'ambiguous');
  assert.equal(r.candidates.length, 2);
});

test('two candidates produce a question listing the ids', () => {
  const r = pickTournament([t(1, 'registration', 'Locals'), t(2, 'registration', 'Regional')], null, 'join');
  assert.equal(r.reason, 'ambiguous');
  const msg = pickMessage(r, 'join');
  assert.match(msg, /id:1.*Locals/s);
  assert.match(msg, /id:2.*Regional/s);
});

test('a very long ambiguous list is capped', () => {
  const many = Array.from({ length: 20 }, (_, i) => t(i + 1, 'registration'));
  const msg = pickMessage(pickTournament(many, null, 'join'), 'join');
  assert.ok(msg.split('\n').length <= 9, 'header plus at most eight options');
});

// "This server runs nothing" and "nothing is at the right stage" are different
// problems: one is a wait, the other is a setup mistake.
test('nothing here reads differently from nothing at this stage', () => {
  const empty = pickTournament([], null, 'join');
  assert.equal(empty.reason, 'none_here');
  assert.match(pickMessage(empty, 'join'), /not running any tournaments/);

  const wrongStage = pickTournament([t(1, 'active')], null, 'join');
  assert.equal(wrongStage.reason, 'none_at_stage');
  assert.match(pickMessage(wrongStage, 'join'), /open for sign-ups/);
  assert.match(pickMessage(wrongStage, 'pairing'), /under way/);
});

test('picking survives a null or junk list', () => {
  assert.equal(pickTournament(null, null, 'join').reason, 'none_here');
  assert.equal(pickTournament([null, undefined], null, 'join').reason, 'none_here');
});

// ── errors ───────────────────────────────────────────────────────────────────

// The one refusal a player cannot act on without being told what to do.
test('an unlinked Discord account is told how to link it', () => {
  const msg = friendlyError(new Error('no_account'), APP);
  assert.match(msg, /not linked/);
  assert.match(msg, /https:\/\/0nefor\.one/);
});

test('the refusals worth rewording are reworded', () => {
  assert.match(friendlyError(new Error('only the organizer can start a round'), APP), /Only the organizer/);
  assert.match(friendlyError(new Error('registration is closed'), APP), /Registration is closed/);
  assert.match(friendlyError(new Error('tournament is full'), APP), /full/);
  assert.match(friendlyError(new Error('you are not registered'), APP), /not registered/);
  assert.match(friendlyError(new Error('check-in is not open'), APP), /has not opened/);
  assert.match(friendlyError(new Error('need at least 2 players to start'), APP), /not enough players/);
});

test('the round-still-open refusal keeps the count the database gave', () => {
  const msg = friendlyError(new Error('round 2 still has 3 unfinished match(es)'), APP);
  assert.match(msg, /3 unfinished/);
});

// A raw Postgres error in a public channel helps nobody and leaks table names.
test('an unrecognised failure returns null so the caller logs it instead', () => {
  assert.equal(friendlyError(new Error('duplicate key value violates unique constraint "x_pkey"'), APP), null);
  assert.equal(friendlyError(null, APP), null);
  assert.equal(friendlyError(undefined, APP), null);
  assert.equal(friendlyError({}, APP), null);
});

test('a plain string error is handled like an Error', () => {
  assert.match(friendlyError('registration is closed', APP), /Registration is closed/);
});

// ── the round-started line ───────────────────────────────────────────────────

test('a paired round says how many tables and whether anyone sat out', () => {
  assert.match(roundStartedMessage({ created: true, round_number: 2, matches: 3, bye: 12 }), /Round 2 is paired — 3 table/);
  assert.match(roundStartedMessage({ created: true, round_number: 2, matches: 3, bye: 12 }), /bye/);
  assert.doesNotMatch(roundStartedMessage({ created: true, round_number: 1, matches: 4, bye: null }), /bye/);
});

// Idempotency, surfaced: clicking twice must read as "already done", not as a
// second round having been created.
test('a repeated call says the round was already paired', () => {
  assert.match(roundStartedMessage({ created: false, round_number: 2 }), /already paired/);
});

test('the line survives a missing result', () => {
  assert.equal(roundStartedMessage(null), 'Round started.');
});
