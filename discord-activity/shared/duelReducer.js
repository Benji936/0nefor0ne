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
    seq: 0,
  };
}

const CHAT_MAX_LEN = 240;
const CHAT_HISTORY = 60;

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
      const lp = {};
      for (const id of state.order) lp[id] = startLp;
      return commit(
        state,
        {
          startLp,
          lp,
          turn: null,
          coin: null,
          dice: null,
          timer: { running: false, startedAt: null, baseElapsedMs: 0 },
        },
        `New duel — ${startLp} LP each`,
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
