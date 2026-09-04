import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, reduce, hydrate, CLIENT_ACTIONS, matchWinner, matchScore, roundsToWin,
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

/** A duel in a verified store's server: match tracking on, no tournament. */
function tracked() {
  return reduce(seated(), { t: 'context:set', host: { name: 'Red Line', slug: 'red-line' } });
}

/** The context a Worker hands over for a real tournament match. */
const MATCH_CTX = {
  tournamentId: 7,
  matchId: 42,
  roundNumber: 2,
  tableNumber: 3,
  bestOf: 3,
  community: { name: 'Red Line', slug: 'red-line' },
};

/** A duel that is round 2, table 3 of a tournament. */
function inTournament(ctx = MATCH_CTX) {
  return reduce(seated(), {
    t: 'context:set',
    host: { name: 'Red Line', slug: 'red-line' },
    tournament: ctx,
  });
}

test('a fresh duel is neither tracked nor a tournament match', () => {
  const s = initialState();
  assert.equal(s.tracked, false);
  assert.equal(s.tournament, null);
  assert.equal(s.reported, null);
  assert.equal(s.match, null);
  assert.equal(s.host, null);
});

test('context:set is not something a client may send', () => {
  // The whole gate rests on this: actions arrive as JSON over a socket, so a
  // player could otherwise hand themselves both a paid feature and a
  // tournament match they are not playing in.
  assert.equal(CLIENT_ACTIONS.has('context:set'), false);
  assert.equal(CLIENT_ACTIONS.has('tournament:enable'), false, 'the old name must not linger');
  assert.equal(CLIENT_ACTIONS.has('match:start'), true);
  assert.equal(CLIENT_ACTIONS.has('adjustLp'), true);
});

test('every action the reducer handles is either client-sendable or server-only', () => {
  // Guards against adding a case and forgetting the list exists.
  const known = new Set([...CLIENT_ACTIONS, 'join', 'offline', 'context:set']);
  const handled = [
    'join', 'offline', 'adjustLp', 'setLp', 'resetDuel', 'context:set',
    'match:start', 'match:round', 'match:undo', 'match:reset',
    'tournament:reported',
    'coin', 'dice', 'firstTurn', 'setTurn', 'chat',
    'timer:start', 'timer:pause', 'timer:reset',
  ];
  for (const t of handled) assert.ok(known.has(t), `${t} is neither client nor server action`);
});

test('match actions do nothing at all without the tracked flag', () => {
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
  let s = tracked();
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
  const s = reduce(tracked(), { t: 'match:start', bestOf: 7 });
  assert.equal(s.match.bestOf, 3);
});

test('a round records the life totals before it resets them', () => {
  let s = reduce(tracked(), { t: 'match:start', bestOf: 3 });
  s = reduce(s, { t: 'adjustLp', target: B, delta: -8000 });
  assert.equal(s.lp[B], 0);

  s = reduce(s, { t: 'match:round', winner: A });
  assert.equal(s.match.rounds.length, 1);
  assert.equal(s.match.rounds[0].winner, A);
  assert.equal(s.match.rounds[0].lp[B], 0, 'the score line survives the reset');
  assert.equal(s.lp[B], 8000, 'and the next round starts clean');
});

test('a round for somebody who is not playing is ignored', () => {
  let s = reduce(tracked(), { t: 'match:start', bestOf: 3 });
  s = reduce(s, { t: 'match:round', winner: 'a-stranger' });
  assert.equal(s.match.rounds.length, 0);
});

test('best of three is won at two, and further rounds are refused', () => {
  let s = reduce(tracked(), { t: 'match:start', bestOf: 3 });
  s = reduce(s, { t: 'match:round', winner: A });
  assert.equal(matchWinner(s.match), null);

  s = reduce(s, { t: 'match:round', winner: A });
  assert.equal(matchWinner(s.match), A);

  const after = reduce(s, { t: 'match:round', winner: B });
  assert.equal(after.match.rounds.length, 2, 'a decided match takes no more rounds');
  assert.equal(after.seq, s.seq);
});

test('the log says who won the match, not just the round', () => {
  let s = reduce(tracked(), { t: 'match:start', bestOf: 3 });
  s = reduce(s, { t: 'match:round', winner: A });
  s = reduce(s, { t: 'match:round', winner: A });
  assert.match(s.log.at(-1).text, /Ana wins the match 2–0/);
});

test('a split match reads the right way round', () => {
  let s = reduce(tracked(), { t: 'match:start', bestOf: 3 });
  s = reduce(s, { t: 'match:round', winner: B });
  s = reduce(s, { t: 'match:round', winner: A });
  s = reduce(s, { t: 'match:round', winner: A });
  assert.equal(matchWinner(s.match), A);
  assert.match(s.log.at(-1).text, /Ana wins the match 2–1/);
});

test('undo takes back the last round, and stops at empty', () => {
  let s = reduce(tracked(), { t: 'match:start', bestOf: 3 });
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
  let s = reduce(tracked(), { t: 'match:start', bestOf: 1 });
  s = reduce(s, { t: 'match:round', winner: B });
  assert.equal(matchWinner(s.match), B);
});

test('clearing a match puts life back and drops the record', () => {
  let s = reduce(tracked(), { t: 'match:start', bestOf: 3 });
  s = reduce(s, { t: 'adjustLp', target: A, delta: -1000 });
  s = reduce(s, { t: 'match:reset' });
  assert.equal(s.match, null);
  assert.equal(s.lp[A], 8000);
});

test('the host is remembered so the room can say who is running it', () => {
  const s = tracked();
  assert.deepEqual(s.host, { name: 'Red Line', slug: 'red-line' });
  assert.equal(s.tracked, true);
});

// Without this every reconnect would push a state update and a log line to
// both players.
test('re-sending the same context is not a state change', () => {
  const s = tracked();
  assert.equal(reduce(s, { t: 'context:set' }).seq, s.seq);
  assert.equal(reduce(s, { t: 'context:set', host: { name: 'Red Line', slug: 'red-line' } }).seq, s.seq);
});

test('the plain duel tools still work inside a tracked duel', () => {
  let s = reduce(tracked(), { t: 'match:start', bestOf: 3 });
  s = reduce(s, { t: 'adjustLp', target: A, delta: -1200 });
  assert.equal(s.lp[A], 6800);
  s = reduce(s, { t: 'chat', uid: A, text: 'gg' });
  assert.equal(s.chat.at(-1).text, 'gg');
});

// ── Tournament context ───────────────────────────────────────────────────────

test('a tournament match binds the room and sets its own format', () => {
  const s = inTournament();
  assert.equal(s.tracked, true);
  assert.equal(s.tournament.matchId, 42);
  assert.equal(s.tournament.tableNumber, 3);
  // Nobody taps "best of 3" at a table where the organizer already decided.
  assert.deepEqual(s.match, { bestOf: 3, rounds: [] });
});

test('the format comes from the tournament, not from a client', () => {
  const s = inTournament({ ...MATCH_CTX, bestOf: 5 });
  assert.equal(s.match.bestOf, 5);
  assert.equal(roundsToWin(s.match.bestOf), 3);
});

test('a nonsense best-of in the context still lands on a playable match', () => {
  const s = inTournament({ ...MATCH_CTX, bestOf: 4 });
  assert.equal(s.match.bestOf, 3);
});

test('the binding is announced in the log, so both players see the table', () => {
  const s = inTournament();
  assert.match(s.log.at(-1).text, /Round 2 . table 3/);
});

// Two people from different tables sharing a voice channel is a real thing
// that happens, and the second grant must not move the room out from under
// the first player.
test('a second, different match does not move a room that is already bound', () => {
  const s = inTournament();
  const other = reduce(s, {
    t: 'context:set',
    tournament: { ...MATCH_CTX, matchId: 99, tableNumber: 8 },
  });
  assert.equal(other.tournament.matchId, 42);
  assert.equal(other.tournament.tableNumber, 3);
  assert.equal(other.seq, s.seq, 'and it is not even a state change');
});

test('a tournament match cannot be restarted or cleared by a player', () => {
  const s = inTournament();
  // The tournament decided the format; disagreeing with it here would file the
  // result against a row that says something else.
  assert.equal(reduce(s, { t: 'match:start', bestOf: 5 }).seq, s.seq);
  assert.equal(reduce(s, { t: 'match:reset' }).seq, s.seq);
  assert.equal(reduce(s, { t: 'match:start', bestOf: 5 }).match.bestOf, 3);
});

// A misclick at a tournament table is exactly what undo is for, so it stays.
test('rounds can still be recorded and taken back at a tournament table', () => {
  let s = inTournament();
  s = reduce(s, { t: 'match:round', winner: A });
  assert.equal(s.match.rounds.length, 1);
  s = reduce(s, { t: 'match:undo' });
  assert.equal(s.match.rounds.length, 0);
  assert.equal(s.tournament.matchId, 42, 'undo does not unbind the room');
});

test('a tracked duel with no tournament still picks its own length', () => {
  const s = reduce(tracked(), { t: 'match:start', bestOf: 5 });
  assert.equal(s.match.bestOf, 5);
  assert.equal(reduce(s, { t: 'match:reset' }).match, null);
});

// ── Reporting ────────────────────────────────────────────────────────────────

test('a report is recorded so the other screen stops asking', () => {
  let s = inTournament();
  s = reduce(s, { t: 'tournament:reported', uid: A, scoreA: 2, scoreB: 1, draws: 0 });
  assert.deepEqual(
    { ...s.reported, at: 0 },
    { scoreA: 2, scoreB: 1, draws: 0, by: A, at: 0 },
  );
  assert.match(s.log.at(-1).text, /reported the result/);
});

test('reporting twice does not overwrite the first report', () => {
  let s = reduce(inTournament(), { t: 'tournament:reported', uid: A, scoreA: 2, scoreB: 0 });
  const again = reduce(s, { t: 'tournament:reported', uid: B, scoreA: 0, scoreB: 2 });
  assert.equal(again.reported.by, A);
  assert.equal(again.seq, s.seq);
});

test('a casual duel has nothing to report', () => {
  const s = reduce(tracked(), { t: 'tournament:reported', uid: A, scoreA: 2, scoreB: 0 });
  assert.equal(s.reported, null);
});

test('a report cannot carry negative or fractional games', () => {
  const s = reduce(inTournament(), {
    t: 'tournament:reported', uid: A, scoreA: -3, scoreB: 1.7, draws: -1,
  });
  assert.deepEqual(
    { a: s.reported.scoreA, b: s.reported.scoreB, d: s.reported.draws },
    { a: 0, b: 1, d: 0 },
  );
});

// ── Hydration across a deploy ────────────────────────────────────────────────

test('a room persisted under the old name keeps its match tracking', () => {
  // What a build before the rename wrote to Durable Object storage.
  const old = { ...initialState(), tournament: true, host: { name: 'Red Line', slug: 'red-line' } };
  delete old.tracked;
  const s = hydrate(old);
  assert.equal(s.tracked, true, 'a live duel must not lose tracking mid-event');
  assert.equal(s.tournament, null, 'and the old boolean is not mistaken for a match');
  assert.deepEqual(s.host, { name: 'Red Line', slug: 'red-line' });
});

test('hydrate fills in fields a stored snapshot never had', () => {
  const s = hydrate({ startLp: 4000, players: {}, seq: 9 });
  assert.equal(s.startLp, 4000);
  assert.equal(s.seq, 9);
  assert.equal(s.reported, null);
  assert.equal(s.tracked, false);
  assert.deepEqual(s.chat, []);
});

test('hydrate survives nothing at all', () => {
  assert.deepEqual(hydrate(null), initialState());
  assert.deepEqual(hydrate(undefined), initialState());
  assert.deepEqual(hydrate('junk'), initialState());
});
