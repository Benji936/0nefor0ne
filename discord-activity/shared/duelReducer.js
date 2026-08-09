// Pure, shared duel state. Only the server calls `reduce` (it is the single
// source of truth), so coin/dice randomness stays authoritative and every
// client renders the exact same state it receives over the socket.

export function initialState() {
  return {
    startLp: 8000,
    players: {}, // uid -> { name, avatar, online, order }
    lp: {}, // uid -> number
    order: [], // uids in join order (stable index = seat)
    turn: null, // uid whose turn it is
    coin: null, // { result: 'heads' | 'tails', by, seq }
    dice: null, // { value: 1..6, by, seq }
    timer: { running: false, startedAt: null, baseElapsedMs: 0 },
    log: [], // [{ seq, text, at }]
    chat: [], // [{ seq, uid, name, text, at }]
    // Set by the server from a verified store's grant, never by a client
    // message. See CLIENT_ACTIONS below and the Worker's /api/tournament.
    tournament: false,
    host: null, // { name, slug } — the verified community hosting this duel
    match: null, // { bestOf, rounds: [{ n, winner, lp, at }] }
    seq: 0,
  };
}

/**
 * Everything a client is allowed to ask for.
 *
 * Actions arrive as JSON over a socket, so without this list a player could
 * send `{ t: 'tournament:enable' }` and hand themselves a paid feature. The
 * server-only actions are deliberately absent.
 */
export const CLIENT_ACTIONS = new Set([
  'adjustLp', 'setLp', 'resetDuel',
  'coin', 'dice', 'firstTurn', 'setTurn',
  'chat',
  'timer:start', 'timer:pause', 'timer:reset',
  'match:start', 'match:round', 'match:undo', 'match:reset',
]);

const BEST_OF = [1, 3, 5];

/** Rounds needed to take the match. Best of 3 is two. */
export function roundsToWin(bestOf) {
  return Math.floor((BEST_OF.includes(bestOf) ? bestOf : 3) / 2) + 1;
}

/** Rounds won per player, as a plain object. */
export function matchScore(match) {
  const tally = {};
  for (const round of match?.rounds ?? []) {
    tally[round.winner] = (tally[round.winner] ?? 0) + 1;
  }
  return tally;
}

/** Who has taken the match, or null while it is still open. */
export function matchWinner(match) {
  if (!match) return null;
  const need = roundsToWin(match.bestOf);
  const tally = matchScore(match);
  for (const [uid, won] of Object.entries(tally)) {
    if (won >= need) return uid;
  }
  return null;
}

const CHAT_MAX_LEN = 240;
const CHAT_HISTORY = 60;

const STOPPED_TIMER = { running: false, startedAt: null, baseElapsedMs: 0 };

/** Everyone back to full life. Used at a reset and between rounds. */
function freshLp(state, startLp = state.startLp) {
  const lp = {};
  for (const id of state.order) lp[id] = startLp;
  return lp;
}

function commit(state, patch, logText) {
  const seq = state.seq + 1;
  const next = { ...state, ...patch, seq };
  if (logText) {
    next.log = [...state.log, { seq, text: logText, at: Date.now() }].slice(-40);
  }
  return next;
}

export function reduce(state, action) {
  const uid = action.uid;
  const actorName = state.players[uid]?.name || 'A duelist';

  switch (action.t) {
    case 'join': {
      const players = { ...state.players };
      const lp = { ...state.lp };
      let order = state.order;
      const isNew = !players[uid];
      if (isNew) {
        order = [...state.order, uid];
        lp[uid] = state.startLp;
      }
      players[uid] = {
        name: action.name || players[uid]?.name || 'Duelist',
        avatar: action.avatar || players[uid]?.avatar || null,
        online: true,
        order: order.indexOf(uid),
      };
      return commit(
        state,
        { players, lp, order },
        isNew ? `${players[uid].name} joined the duel` : null,
      );
    }

    case 'offline': {
      if (!state.players[uid]) return state;
      const players = { ...state.players, [uid]: { ...state.players[uid], online: false } };
      return commit(state, { players });
    }

    case 'adjustLp': {
      const target = action.target || uid;
      if (state.lp[target] == null) return state;
      const delta = Math.trunc(action.delta || 0);
      if (!delta) return state;
      const value = Math.max(0, state.lp[target] + delta);
      const lp = { ...state.lp, [target]: value };
      const targetName = state.players[target]?.name || 'Duelist';
      const sign = delta >= 0 ? '+' : '';
      return commit(state, { lp }, `${targetName}: ${sign}${delta} → ${value} LP`);
    }

    case 'setLp': {
      const target = action.target || uid;
      if (state.lp[target] == null) return state;
      const value = Math.max(0, Math.floor(action.value || 0));
      const lp = { ...state.lp, [target]: value };
      const targetName = state.players[target]?.name || 'Duelist';
      return commit(state, { lp }, `${targetName}: set to ${value} LP`);
    }

    case 'resetDuel': {
      const startLp = Math.max(1, Math.floor(action.startLp || state.startLp));
      return commit(
        state,
        {
          startLp,
          lp: freshLp(state, startLp),
          turn: null,
          coin: null,
          dice: null,
          timer: { ...STOPPED_TIMER },
        },
        `New duel — ${startLp} LP each`,
      );
    }

    // ── Tournament, for a verified store ──────────────────────────────────────
    // Server-only: set from the grant the Worker issues, not from a socket
    // message. It is absent from CLIENT_ACTIONS on purpose.
    case 'tournament:enable': {
      if (state.tournament && !action.host) return state;
      return commit(state, { tournament: true, host: action.host ?? state.host });
    }

    case 'match:start': {
      if (!state.tournament) return state;
      const bestOf = BEST_OF.includes(action.bestOf) ? action.bestOf : 3;
      return commit(
        state,
        {
          match: { bestOf, rounds: [] },
          lp: freshLp(state),
          turn: null,
          coin: null,
          dice: null,
          timer: { ...STOPPED_TIMER },
        },
        `Match started — best of ${bestOf}`,
      );
    }

    // One round decided. The life totals are snapshotted before they are reset,
    // because the score line of a round is part of the result a judge is asked
    // to confirm afterwards.
    case 'match:round': {
      if (!state.tournament || !state.match) return state;
      if (matchWinner(state.match)) return state;
      const winner = action.winner;
      if (!state.players[winner]) return state;

      const round = {
        n: state.match.rounds.length + 1,
        winner,
        lp: { ...state.lp },
        at: Date.now(),
      };
      const match = { ...state.match, rounds: [...state.match.rounds, round] };
      const winnerName = state.players[winner].name;
      const decided = matchWinner(match);
      const score = matchScore(match);

      return commit(
        state,
        { match, lp: freshLp(state), turn: null, timer: { ...STOPPED_TIMER } },
        decided
          ? `${winnerName} wins the match ${score[decided]}–${Math.max(0, match.rounds.length - score[decided])}`
          : `${winnerName} takes round ${round.n}`,
      );
    }

    // A misclick during a match is a result somebody has to argue about, so it
    // is undoable rather than only resettable.
    case 'match:undo': {
      if (!state.tournament || !state.match?.rounds.length) return state;
      const rounds = state.match.rounds.slice(0, -1);
      return commit(state, { match: { ...state.match, rounds } }, `Round ${rounds.length + 1} taken back`);
    }

    case 'match:reset': {
      if (!state.tournament || !state.match) return state;
      return commit(
        state,
        { match: null, lp: freshLp(state), turn: null, timer: { ...STOPPED_TIMER } },
        'Match cleared',
      );
    }

    case 'coin': {
      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      return commit(
        state,
        { coin: { result, by: uid, seq: state.seq + 1 } },
        `${actorName} flipped a coin: ${result}`,
      );
    }

    case 'dice': {
      const value = 1 + Math.floor(Math.random() * 6);
      return commit(
        state,
        { dice: { value, by: uid, seq: state.seq + 1 } },
        `${actorName} rolled a die: ${value}`,
      );
    }

    case 'firstTurn': {
      if (state.order.length === 0) return state;
      const pick = state.order[Math.floor(Math.random() * state.order.length)];
      const pickName = state.players[pick]?.name || 'Duelist';
      return commit(state, { turn: pick }, `${pickName} goes first`);
    }

    case 'setTurn': {
      return commit(state, { turn: action.target || null });
    }

    case 'chat': {
      // Chat is not part of the duel record, so it never touches the log.
      const text = String(action.text ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);
      if (!text) return state;
      const seq = state.seq + 1;
      const entry = { seq, uid, name: actorName, text, at: Date.now() };
      // `?? []` covers rooms persisted before chat existed.
      return { ...state, seq, chat: [...(state.chat ?? []), entry].slice(-CHAT_HISTORY) };
    }

    case 'timer:start': {
      if (state.timer.running) return state;
      return commit(state, { timer: { ...state.timer, running: true, startedAt: Date.now() } });
    }

    case 'timer:pause': {
      if (!state.timer.running) return state;
      const extra = state.timer.startedAt ? Date.now() - state.timer.startedAt : 0;
      return commit(state, {
        timer: { running: false, startedAt: null, baseElapsedMs: state.timer.baseElapsedMs + extra },
      });
    }

    case 'timer:reset': {
      return commit(state, { timer: { running: false, startedAt: null, baseElapsedMs: 0 } });
    }

    default:
      return state;
  }
}
