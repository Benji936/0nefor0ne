import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, reduce, CLIENT_ACTIONS, matchWinner, matchScore, roundsToWin,
} from './duelReducer.js';

const A = 'user-a';
const B = 'user-b';

/** Two players joined, which is what every match test needs first. */
function seated() {
  let s = initialState();
  s = reduce(s, { t: 'join', uid: A, name: 'Ana' });
  s = reduce(s, { t: 'join', uid: B, name: 'Bo' });
  return s;
}

function tournament() {
  return reduce(seated(), { t: 'tournament:enable', host: { name: 'Red Line', slug: 'red-line' } });
}

test('a fresh duel is not a tournament', () => {
  const s = initialState();
  assert.equal(s.tournament, false);
  assert.equal(s.match, null);
  assert.equal(s.host, null);
});

test('tournament:enable is not something a client may send', () => {
  // The whole gate rests on this: actions arrive as JSON over a socket.
  assert.equal(CLIENT_ACTIONS.has('tournament:enable'), false);
  assert.equal(CLIENT_ACTIONS.has('match:start'), true);
  assert.equal(CLIENT_ACTIONS.has('adjustLp'), true);
});

test('every action the reducer handles is either client-sendable or server-only', () => {
  // Guards against adding a case and forgetting the list exists.
  const known = new Set([...CLIENT_ACTIONS, 'join', 'offline', 'tournament:enable']);
  const handled = [
    'join', 'offline', 'adjustLp', 'setLp', 'resetDuel', 'tournament:enable',
    'match:start', 'match:round', 'match:undo', 'match:reset',
    'coin', 'dice', 'firstTurn', 'setTurn', 'chat',
    'timer:start', 'timer:pause', 'timer:reset',
  ];
  for (const t of handled) assert.ok(known.has(t), `${t} is neither client nor server action`);
});

test('match actions do nothing at all without the tournament flag', () => {
  const s = seated();
  assert.equal(reduce(s, { t: 'match:start', bestOf: 3 }).match, null);
  assert.equal(reduce(s, { t: 'match:start', bestOf: 3 }).seq, s.seq);
});

test('roundsToWin is a majority, and an odd length is assumed', () => {
  assert.equal(roundsToWin(1), 1);
  assert.equal(roundsToWin(3), 2);
  assert.equal(roundsToWin(5), 3);
  assert.equal(roundsToWin(99), 2, 'an unknown length falls back to best of 3');
});

test('starting a match resets life and clears the table', () => {
  let s = tournament();
  s = reduce(s, { t: 'adjustLp', target: A, delta: -3000 });
  s = reduce(s, { t: 'timer:start' });
  s = reduce(s, { t: 'match:start', bestOf: 3 });

  assert.equal(s.match.bestOf, 3);
  assert.deepEqual(s.match.rounds, []);
  assert.equal(s.lp[A], 8000);
  assert.equal(s.timer.running, false);
  assert.equal(s.turn, null);
});

test('an unknown best-of falls back to three rather than being trusted', () => {
  const s = reduce(tournament(), { t: 'match:start', bestOf: 7 });
  assert.equal(s.match.bestOf, 3);
});

test('a round records the life totals before it resets them', () => {
  let s = reduce(tournament(), { t: 'match:start', bestOf: 3 });
  s = reduce(s, { t: 'adjustLp', target: B, delta: -8000 });
  assert.equal(s.lp[B], 0);

  s = reduce(s, { t: 'match:round', winner: A });
  assert.equal(s.match.rounds.length, 1);
  assert.equal(s.match.rounds[0].winner, A);
  assert.equal(s.match.rounds[0].lp[B], 0, 'the score line survives the reset');
  assert.equal(s.lp[B], 8000, 'and the next round starts clean');
});

test('a round for somebody who is not playing is ignored', () => {
  let s = reduce(tournament(), { t: 'match:start', bestOf: 3 });
  s = reduce(s, { t: 'match:round', winner: 'a-stranger' });
  assert.equal(s.match.rounds.length, 0);
});

test('best of three is won at two, and further rounds are refused', () => {
  let s = reduce(tournament(), { t: 'match:start', bestOf: 3 });
  s = reduce(s, { t: 'match:round', winner: A });
  assert.equal(matchWinner(s.match), null);

  s = reduce(s, { t: 'match:round', winner: A });
  assert.equal(matchWinner(s.match), A);

  const after = reduce(s, { t: 'match:round', winner: B });
  assert.equal(after.match.rounds.length, 2, 'a decided match takes no more rounds');
  assert.equal(after.seq, s.seq);
});

test('the log says who won the match, not just the round', () => {
  let s = reduce(tournament(), { t: 'match:start', bestOf: 3 });
  s = reduce(s, { t: 'match:round', winner: A });
  s = reduce(s, { t: 'match:round', winner: A });
  assert.match(s.log.at(-1).text, /Ana wins the match 2–0/);
});

test('a split match reads the right way round', () => {
  let s = reduce(tournament(), { t: 'match:start', bestOf: 3 });
  s = reduce(s, { t: 'match:round', winner: B });
  s = reduce(s, { t: 'match:round', winner: A });
  s = reduce(s, { t: 'match:round', winner: A });
  assert.equal(matchWinner(s.match), A);
  assert.match(s.log.at(-1).text, /Ana wins the match 2–1/);
});

test('undo takes back the last round, and stops at empty', () => {
  let s = reduce(tournament(), { t: 'match:start', bestOf: 3 });
  s = reduce(s, { t: 'match:round', winner: A });
  s = reduce(s, { t: 'match:round', winner: A });
  assert.equal(matchWinner(s.match), A);

  s = reduce(s, { t: 'match:undo' });
  assert.equal(s.match.rounds.length, 1);
  assert.equal(matchWinner(s.match), null, 'undoing a decider reopens the match');

  s = reduce(s, { t: 'match:undo' });
  assert.equal(s.match.rounds.length, 0);

  const empty = reduce(s, { t: 'match:undo' });
  assert.equal(empty.seq, s.seq, 'nothing to undo is not a state change');
});

test('matchScore counts rounds per player and ignores nothing', () => {
  assert.deepEqual(matchScore(null), {});
  assert.deepEqual(matchScore({ rounds: [] }), {});
  assert.deepEqual(matchScore({ rounds: [{ winner: A }, { winner: B }, { winner: A }] }), { [A]: 2, [B]: 1 });
});

test('best of one is decided by a single round', () => {
  let s = reduce(tournament(), { t: 'match:start', bestOf: 1 });
  s = reduce(s, { t: 'match:round', winner: B });
  assert.equal(matchWinner(s.match), B);
});

test('clearing a match puts life back and drops the record', () => {
  let s = reduce(tournament(), { t: 'match:start', bestOf: 3 });
  s = reduce(s, { t: 'adjustLp', target: A, delta: -1000 });
  s = reduce(s, { t: 'match:reset' });
  assert.equal(s.match, null);
  assert.equal(s.lp[A], 8000);
});

test('the host is remembered so the room can say who is running it', () => {
  const s = tournament();
  assert.deepEqual(s.host, { name: 'Red Line', slug: 'red-line' });
});

test('enabling twice with no new host is not a state change', () => {
  const s = tournament();
  assert.equal(reduce(s, { t: 'tournament:enable' }).seq, s.seq);
});

test('the plain duel tools still work inside a tournament', () => {
  let s = reduce(tournament(), { t: 'match:start', bestOf: 3 });
  s = reduce(s, { t: 'adjustLp', target: A, delta: -1200 });
  assert.equal(s.lp[A], 6800);
  s = reduce(s, { t: 'chat', uid: A, text: 'gg' });
  assert.equal(s.chat.at(-1).text, 'gg');
});
