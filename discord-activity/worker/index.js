import { initialState, reduce } from '../shared/duelReducer.js';

// ── Worker entrypoint ─────────────────────────────────────────────────────────
// Three jobs: the OAuth token exchange, upgrading /ws into the room's Durable
// Object, and falling back to the static Vite build for everything else.

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Discord serves the activity from discordsays.com and forwards `/.proxy/*`
    // to the mapped host. It strips the prefix itself, but tolerate it here so
    // routing is correct either way.
    const path = url.pathname.startsWith('/.proxy/')
      ? url.pathname.slice('/.proxy'.length)
      : url.pathname;

    if (path === '/api/health') return json({ ok: true });
    // The client id is public. Serving it keeps one source of truth (wrangler.jsonc)
    // and avoids baking it into the bundle at build time.
    if (path === '/api/config') return json({ clientId: env.DISCORD_CLIENT_ID ?? null });
    if (path === '/api/token') return handleToken(request, env);
    if (path === '/ws') return handleSocket(request, env, url);

    // Anything else is the built SPA.
    return env.ASSETS.fetch(request);
  },
};

// OAuth code -> access_token. The client secret stays server-side.
async function handleToken(request, env) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let code;
  try {
    ({ code } = await request.json());
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  if (!code) return json({ error: 'missing code' }, 400);
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
    return json({ error: 'server missing Discord credentials' }, 500);
  }

  const res = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
    }),
  });

  const data = await res.json();
  if (!res.ok) return json({ error: data }, 400);
  return json({ access_token: data.access_token });
}

// Route the socket to the one Durable Object that owns this duel. `idFromName`
// on the Discord instanceId guarantees both players land on the same object.
function handleSocket(request, env, url) {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected a WebSocket upgrade.', { status: 426 });
  }
  const room = url.searchParams.get('room') || 'default';
  const id = env.DUEL_ROOM.idFromName(room);
  return env.DUEL_ROOM.get(id).fetch(request);
}

// ── Durable Object: one per duel ──────────────────────────────────────────────
// Uses the WebSocket Hibernation API, so an idle duel is evicted from memory
// while the sockets stay open. Because of that, duel state lives in storage
// rather than only on `this`.
export class DuelRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async duel() {
    if (!this._duel) {
      this._duel = (await this.state.storage.get('duel')) ?? initialState();
    }
    return this._duel;
  }

  async apply(action) {
    const next = reduce(await this.duel(), action);
    this._duel = next;
    await this.state.storage.put('duel', next);
    this.broadcast(next);
  }

  broadcast(duel) {
    const payload = JSON.stringify({ type: 'state', state: duel });
    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        /* socket is going away; close handler will clean up */
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const uid = url.searchParams.get('uid') || 'anon';
    const name = url.searchParams.get('name') || 'Duelist';
    const avatar = url.searchParams.get('avatar') || null;

    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server);
    // Identity is bound to the socket and survives hibernation, so it is never
    // trusted from the message payload.
    server.serializeAttachment({ uid, name, avatar });

    await this.apply({ t: 'join', uid, name, avatar });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    let action;
    try {
      action = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }
    const { uid } = ws.deserializeAttachment() ?? {};
    if (!uid) return;
    action.uid = uid;
    await this.apply(action);
  }

  async webSocketClose(ws) {
    const { uid } = ws.deserializeAttachment() ?? {};
    const remaining = this.state.getWebSockets().filter((s) => s !== ws);

    if (remaining.length === 0) {
      // Everyone left: drop the room so the next duel starts clean.
      this._duel = null;
      await this.state.storage.deleteAll();
      return;
    }
    if (uid) await this.apply({ t: 'offline', uid });
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
}
