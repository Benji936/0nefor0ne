import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduce } from './duelReducer.js';
import { matchScoreForRow, canReport, resultForViewer, opponentName } from './tournamentResult.js';

// A Durable Object uid IS the Discord user id, which is what makes the seat map
// a direct lookup rather than a join.
const ANA = '100000000000000001';
const BO  = '200000000000000002';
const CY  = '300000000000000003';

const CTX = {
  tournamentId: 7,
  matchId: 42,
  roundNumber: 2,
  tableNumber: 3,
  bestOf: 3,
  playerA: 11,
  playerB: 22,
  names: { 11: 'Ana', 22: 'Bo' },
  seats: { [ANA]: 11, [BO]: 22 },
};

/** A bound room with both players seated. */
function table(ctx = CTX) {
  let s = initialState();
  s = reduce(s, { t: 'join', uid: ANA, name: 'Ana' });
  s = reduce(s, { t: 'join', uid: BO, name: 'Bo' });
  return reduce(s, { t: 'context:set', tournament: ctx });
}

const won = (s, uid) => reduce(s, { t: 'match:round', winner: uid });

// ── The mapping ──────────────────────────────────────────────────────────────

test('rounds land in the row order the pairing was made in', () => {
  let s = table();
  s = won(s, ANA);
  s = won(s, BO);
  s = won(s, ANA);
  assert.deepEqual(matchScoreForRow(s.match, CTX), { scoreA: 2, scoreB: 1, draws: 0, unknown: 0 });
});

// The bug this module exists to prevent: seat A of the pairing is not always
// the player who happened to open the Activity first.
test('the mapping does not follow join order', () => {
  // Same games, but the pairing has Bo as player_a.
  const flipped = { ...CTX, playerA: 22, playerB: 11, seats: { [ANA]: 11, [BO]: 22 } };
  let s = table(flipped);
  s = won(s, ANA);
  s = won(s, ANA);
  assert.deepEqual(
    matchScoreForRow(s.match, flipped),
    { scoreA: 0, scoreB: 2, draws: 0, unknown: 0 },
    'Ana is player_b in this pairing, so her wins are score_b',
  );
});

test('a round won by somebody outside the pairing is counted as unknown', () => {
  let s = table();
  s = reduce(s, { t: 'join', uid: CY, name: 'Cy' });
  s = won(s, ANA);
  s = won(s, CY);
  assert.deepEqual(matchScoreForRow(s.match, CTX), { scoreA: 1, scoreB: 0, draws: 0, unknown: 1 });
});

test('an empty match maps to nothing rather than throwing', () => {
  assert.deepEqual(matchScoreForRow(null, CTX), { scoreA: 0, scoreB: 0, draws: 0, unknown: 0 });
  assert.deepEqual(matchScoreForRow({ rounds: [] }, CTX), { scoreA: 0, scoreB: 0, draws: 0, unknown: 0 });
  assert.deepEqual(matchScoreForRow({ rounds: [] }, null), { scoreA: 0, scoreB: 0, draws: 0, unknown: 0 });
});

// ── Whether it can be filed ──────────────────────────────────────────────────

test('a decided match is ready to file', () => {
  let s = table();
  s = won(s, ANA);
  s = won(s, ANA);
  assert.deepEqual(canReport(s), { ok: true, scoreA: 2, scoreB: 0, draws: 0 });
});

// A tournament match that ran out of time at one game each is a real result.
// Refusing to file it would push the players into inventing a third game.
test('an undecided match is still filable', () => {
  let s = table();
  s = won(s, ANA);
  s = won(s, BO);
  assert.deepEqual(canReport(s), { ok: true, scoreA: 1, scoreB: 1, draws: 0 });
});

test('nothing played is not a result', () => {
  const r = canReport(table());
  assert.equal(r.ok, false);
  assert.match(r.reason, /Play a game first/);
});

test('a casual duel has nothing to file', () => {
  let s = initialState();
  s = reduce(s, { t: 'join', uid: ANA, name: 'Ana' });
  const r = canReport(s);
  assert.equal(r.ok, false);
  assert.match(r.reason, /not a tournament match/);
});

test('a filed result is not offered twice', () => {
  let s = table();
  s = won(s, ANA);
  s = won(s, ANA);
  s = reduce(s, { t: 'tournament:reported', uid: ANA, scoreA: 2, scoreB: 0 });
  const r = canReport(s);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Already reported/);
});

// Silently dropping a stranger's rounds would file a score nobody played.
test('a stranger at the table blocks filing rather than being ignored', () => {
  let s = table();
  s = reduce(s, { t: 'join', uid: CY, name: 'Cy' });
  s = won(s, ANA);
  s = won(s, CY);
  const r = canReport(s);
  assert.equal(r.ok, false);
  assert.match(r.reason, /not in the pairing/);
  assert.match(r.reason, /0nefor\.one/, 'and it says where to fix it');
});

test('canReport survives a state with no match at all', () => {
  assert.equal(canReport(null).ok, false);
  assert.equal(canReport({}).ok, false);
});

// ── Reading it from a seat ───────────────────────────────────────────────────

// A line that says "0-2" to the player who just won is how somebody comes to
// hesitate over a confirm button.
test('the score reads from the reader own seat', () => {
  let s = table();
  s = won(s, ANA);
  s = won(s, ANA);
  assert.deepEqual(resultForViewer(s, ANA), { mine: 2, theirs: 0, won: true });
  assert.deepEqual(resultForViewer(s, BO), { mine: 0, theirs: 2, won: false });
});

test('the opponent is named from the pairing, not from who joined the room', () => {
  const s = table();
  assert.equal(opponentName(s, ANA), 'Bo');
  assert.equal(opponentName(s, BO), 'Ana');
});

test('a casual duel has no opponent to name and no result to read', () => {
  const s = reduce(initialState(), { t: 'join', uid: ANA, name: 'Ana' });
  assert.equal(opponentName(s, ANA), null);
  assert.equal(resultForViewer(s, ANA), null);
});
