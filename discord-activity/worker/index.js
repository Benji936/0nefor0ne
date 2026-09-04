import { hydrate, reduce, CLIENT_ACTIONS } from '../shared/duelReducer.js';
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
    if (path === '/api/context') return handleContext(request, env);
    if (path === '/api/result') return handleResult(request, env);
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

// ── What this duel is ─────────────────────────────────────────────────────────
//
// Two separate questions, answered in one call because the client asks them at
// the same moment and neither is useful alone.
//
//   1. Is a verified store hosting this? That unlocks match tracking, which is
//      what a store's subscription buys. The duel itself is free and always
//      will be.
//   2. Is one of these people at a tournament table right now? That binds the
//      room to a real match, so the format arrives already decided and the
//      result can be filed at the end.
//
// The whole thing rests on the client never being able to assert either.
// `guildId` comes from the Discord frame and a client can put anything there,
// so the Worker checks what it can actually verify and then signs a short-lived
// grant. The socket accepts the grant, never the claim.
//
// The honest limit on (1) is unchanged: this proves the caller is in the
// store's server, not that the activity is running there. Someone who has
// joined a verified store's Discord could open a duel elsewhere with tracking
// on. They are the store's own member, which is who the feature is for, and
// there is nothing stronger available — Discord gives the frame no signed guild
// context.
//
// (2) has no such gap, and for a different reason: it is not resolved from
// anything the frame says. It is resolved from who the caller is, which Discord
// will confirm, and from a pairing the organizer made.

async function handleContext(request, env) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let accessToken, guildId, room;
  try {
    ({ access_token: accessToken, guildId, room } = await request.json());
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  // A casual duel is the ordinary case and is complete without any of this, so
  // every path that cannot establish context answers the same empty shape
  // rather than an error the client has to branch on.
  const none = { tracked: false, host: null, match: null, grant: null };
  if (!accessToken || !room) return json(none);
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json(none);

  const host = guildId ? await verifiedHostFor(accessToken, guildId, env) : null;

  // Asked whatever the guild turned out to be. A player at a tournament table
  // is at it wherever they happen to be standing, and the tournament's own
  // community is the authority on the match — not the server the voice channel
  // happens to live in.
  const match = await tournamentMatchFor(accessToken, env);

  if (!host && !match) return json(none);

  // Everything below this line was verified above. The grant is how the socket
  // comes to believe it without being told.
  const grant = await signGrant(env.DISCORD_CLIENT_SECRET, {
    room,
    guildId: guildId ?? null,
    host: host ? { name: host.name, slug: host.slug } : null,
    tournament: match,
    exp: Date.now() + GRANT_TTL_MS,
  });
  if (!grant) return json(none);

  return json({
    tracked: true,
    host: host ? { name: host.name, slug: host.slug } : (match?.community ?? null),
    match,
    grant,
  });
}

/**
 * The verified community running this guild, or null.
 *
 * Two checks, and the first one is the one that matters: anyone can name a
 * guild, but only a member's token lists it.
 */
async function verifiedHostFor(accessToken, guildId, env) {
  const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!guildsRes.ok) return null;
  const guilds = await guildsRes.json();
  if (!Array.isArray(guilds) || !guilds.some((g) => g?.id === guildId)) return null;

  // community_for_guild answers with a row or nothing, so "unverified" and
  // "not linked" look the same here — which is deliberate on its side.
  const rpc = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/community_for_guild`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_guild_id: guildId }),
  });
  if (!rpc.ok) return null;
  const rows = await rpc.json();
  const host = Array.isArray(rows) ? rows[0] : null;
  return host?.slug ? host : null;
}

/**
 * The tournament match this caller is at, or null.
 *
 * Goes through an Edge Function rather than a direct RPC, and that is the
 * point: the Worker holds the anon key and serves the SPA from the same origin,
 * so anything it can call is effectively public. "Which match is Discord user X
 * playing" keyed on a snowflake is not something to expose that way — every
 * Discord user id is published. The Edge Function holds the service role and
 * verifies the token against Discord before it answers.
 */
async function tournamentMatchFor(accessToken, env) {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/functions/v1/activity-context`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: accessToken }),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.match ?? null;
  } catch {
    // A duel that cannot reach the tournament service is still a duel. It just
    // has no table number, which is the same thing a casual duel has.
    return null;
  }
}

// ── Filing the result ─────────────────────────────────────────────────────────
//
// A pass-through, and it is here rather than being called directly by the
// client for one reason: an Activity reaching a non-Discord origin needs a URL
// mapping configured on the application, and everything in this project rides
// the built-in `/.proxy/` mapping to its own Worker instead. So the Worker
// forwards.
//
// It adds no trust. The caller's Discord token is what the Edge Function
// checks, exactly as it would if the browser had sent it directly.
//
// Note what is NOT here: the Durable Object does not file the result. It could
// — a DO can make outbound requests — but then the room would need a credential
// with a lifetime measured in the length of a match, and a long-lived replayable
// token is worse than asking the person who just won to tap a button. Keeping a
// human in the loop is also the rule the whole result flow is built on.
async function handleResult(request, env) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ error: 'unavailable' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  try {
    const res = await fetch(`${env.SUPABASE_URL}/functions/v1/activity-result`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: body?.access_token,
        match_id: body?.match_id,
        score_a: body?.score_a,
        score_b: body?.score_b,
        draws: body?.draws ?? 0,
      }),
    });
    return json(await res.json(), res.status);
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
}

// Route the socket to the one Durable Object that owns this duel. `idFromName`
// on the Discord instanceId guarantees both players land on the same object.
async function handleSocket(request, env, url) {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected a WebSocket upgrade.', { status: 426 });
  }
  const room = url.searchParams.get('room') || 'default';

  // The Durable Object is handed a request the Worker built, not the one the
  // client sent. Context is therefore something the client can ask for with a
  // grant and never something it can simply state.
  //
  // `ctx` is deleted before it is set, and that order is the whole guarantee:
  // whatever the client put there is gone, and what arrives is either a payload
  // this Worker signed or nothing at all.
  const granted = await readGrant(env.DISCORD_CLIENT_SECRET, url.searchParams.get('grant'), room);
  const forward = new URL(url);
  forward.searchParams.delete('grant');
  forward.searchParams.delete('ctx');
  if (granted) {
    forward.searchParams.set(
      'ctx',
      JSON.stringify({ host: granted.host ?? null, tournament: granted.tournament ?? null }),
    );
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
      // hydrate() rather than a bare read: a room open across a deploy was
      // written by the previous build, and a live duel losing its match
      // tracking mid-event is the worst moment for it.
      this._duel = hydrate(await this.state.storage.get('duel'));
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

    // This param exists only because the Worker verified a signed grant and put
    // it there; it strips whatever the client sent. Once a room is tracked it
    // stays tracked for the duel, so a second player joining without a grant
    // does not switch it off under the first — and once it is bound to a
    // tournament match, a grant for a different match does not move it.
    const ctxParam = url.searchParams.get('ctx');
    if (ctxParam) {
      let ctx = null;
      try {
        ctx = JSON.parse(ctxParam);
      } catch {
        ctx = null; // The Worker wrote this, so a parse failure is a bug, not an attack.
      }
      if (ctx) {
        await this.apply({ t: 'context:set', host: ctx.host ?? null, tournament: ctx.tournament ?? null });
      }
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
