import { initialState, reduce, CLIENT_ACTIONS } from '../shared/duelReducer.js';
import { signGrant, readGrant, GRANT_TTL_MS } from './grant.js';

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
    if (path === '/api/tournament') return handleTournament(request, env);
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

// ── Tournament mode, for a verified store ─────────────────────────────────────
//
// The duel itself is free and always will be. What a verified store gets is
// match tracking: best-of-three, a round record, a score.
//
// The whole gate rests on the client never being able to assert it. `guildId`
// comes from the Discord frame and a client can put anything there, so the
// Worker checks two things it can actually verify — that the caller's OAuth
// token really is a member of that guild, and that the guild belongs to a
// verified community — and then issues a short-lived signed grant. The socket
// accepts the grant, never the claim.
//
// The honest limit: this proves the caller is in the store's server, not that
// the activity is running there. Someone who has joined a verified store's
// Discord could open a duel elsewhere with tournament mode on. They are the
// store's own member, which is who the feature is for, and there is nothing
// stronger available — Discord gives the frame no signed guild context.

async function handleTournament(request, env) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let accessToken, guildId, room;
  try {
    ({ access_token: accessToken, guildId, room } = await request.json());
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  if (!accessToken || !guildId || !room) return json({ tournament: false });

  // 1. Is this token actually a member of that guild? Anyone can name a guild;
  //    only a member's token lists it.
  const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!guildsRes.ok) return json({ tournament: false });
  const guilds = await guildsRes.json();
  if (!Array.isArray(guilds) || !guilds.some((g) => g?.id === guildId)) {
    return json({ tournament: false });
  }

  // 2. Does a verified community run it? community_for_guild answers with a
  //    row or nothing, so "unverified" and "not linked" look the same here.
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ tournament: false });
  }
  const rpc = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/community_for_guild`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_guild_id: guildId }),
  });
  if (!rpc.ok) return json({ tournament: false });
  const rows = await rpc.json();
  const host = Array.isArray(rows) ? rows[0] : null;
  if (!host?.slug) return json({ tournament: false });

  const grant = await signGrant(env.DISCORD_CLIENT_SECRET, {
    room,
    guildId,
    name: host.name,
    slug: host.slug,
    exp: Date.now() + GRANT_TTL_MS,
  });
  if (!grant) return json({ tournament: false });

  return json({ tournament: true, host: { name: host.name, slug: host.slug }, grant });
}

// Route the socket to the one Durable Object that owns this duel. `idFromName`
// on the Discord instanceId guarantees both players land on the same object.
async function handleSocket(request, env, url) {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected a WebSocket upgrade.', { status: 426 });
  }
  const room = url.searchParams.get('room') || 'default';

  // The Durable Object is handed a request the Worker built, not the one the
  // client sent. Tournament state is therefore something the client can ask
  // for with a grant and never something it can simply state.
  const granted = await readGrant(env.DISCORD_CLIENT_SECRET, url.searchParams.get('grant'), room);
  const forward = new URL(url);
  forward.searchParams.delete('grant');
  forward.searchParams.delete('tournament');
  forward.searchParams.delete('hostName');
  forward.searchParams.delete('hostSlug');
  if (granted) {
    forward.searchParams.set('tournament', '1');
    if (granted.name) forward.searchParams.set('hostName', granted.name);
    if (granted.slug) forward.searchParams.set('hostSlug', granted.slug);
  }

  const id = env.DUEL_ROOM.idFromName(room);
  return env.DUEL_ROOM.get(id).fetch(new Request(forward, request));
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

    // These params exist only because the Worker verified a signed grant and
    // put them there; it strips whatever the client sent. Once a room is in
    // tournament mode it stays there for the duel, so a second player joining
    // without a grant does not switch the mode off under the first.
    if (url.searchParams.get('tournament') === '1') {
      await this.apply({
        t: 'tournament:enable',
        host: url.searchParams.get('hostSlug')
          ? { name: url.searchParams.get('hostName'), slug: url.searchParams.get('hostSlug') }
          : null,
      });
    }

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
    // Only what a player is allowed to ask for. Without this a socket message
    // of `{ t: 'tournament:enable' }` would hand out a paid feature, since
    // every action otherwise reaches the reducer verbatim.
    if (!CLIENT_ACTIONS.has(action?.t)) return;
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
