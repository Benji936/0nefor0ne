import { DiscordSDK } from '@discord/embedded-app-sdk';

// Discord injects `frame_id` into the query string when the page is loaded as
// an Activity. Outside Discord (plain browser dev) we fall back to a mock so
// the UI is still usable/testable.
export const isEmbedded = Boolean(new URLSearchParams(window.location.search).get('frame_id'));

let discordSdk = null;
let auth = null;

/**
 * Boots the Discord SDK, runs the OAuth handshake, and returns the local
 * duel context (instance id + this user). The server-side `/api/token`
 * endpoint keeps the client secret off the client.
 */
export async function setupDiscord() {
  if (!isEmbedded) {
    // Give each dev tab a distinct identity so two browser windows can share a
    // "room" and you can exercise the sync locally without Discord.
    const devId = 'dev-' + Math.random().toString(36).slice(2, 8);
    return {
      instanceId: new URLSearchParams(window.location.search).get('room') || 'local-dev-room',
      channelId: null,
      guildId: null,
      user: { id: devId, username: 'You (dev)', global_name: 'You (dev)', avatar: null },
    };
  }

  // The Worker owns the client id (see wrangler.jsonc), so nothing about the
  // Discord app is baked into the bundle at build time.
  const configRes = await fetch('/.proxy/api/config');
  if (!configRes.ok) throw new Error('Could not load app config (' + configRes.status + ').');
  const { clientId } = await configRes.json();
  if (!clientId) throw new Error('DISCORD_CLIENT_ID is not configured on the server.');

  discordSdk = new DiscordSDK(clientId);
  await discordSdk.ready();

  const { code } = await discordSdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds'],
  });

  const res = await fetch('/.proxy/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error('Token exchange failed (' + res.status + ').');
  const { access_token } = await res.json();

  const result = await discordSdk.commands.authenticate({ access_token });
  if (!result?.user) throw new Error('Discord authentication returned no user.');
  auth = { ...result, access_token };

  return {
    instanceId: discordSdk.instanceId,
    channelId: discordSdk.channelId,
    guildId: discordSdk.guildId,
    user: result.user,
  };
}

const NO_CONTEXT = { tracked: false, host: null, match: null, grant: null };

/**
 * Ask the Worker what this duel is: hosted by a verified store, a round of a
 * tournament, both, or neither.
 *
 * Returns a grant alongside the answer, and the grant is the part that matters:
 * it is what the socket accepts. Nothing the client is told here is what makes
 * it true — the signature is.
 *
 * An empty answer is the normal one. Most duels are casual and complete without
 * any of this, so a failure is treated exactly the same as a no.
 */
export async function requestContext({ guildId, room }) {
  if (!isEmbedded || !auth?.access_token) return NO_CONTEXT;
  try {
    const res = await fetch('/.proxy/api/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: auth.access_token, guildId, room }),
    });
    if (!res.ok) return NO_CONTEXT;
    return { ...NO_CONTEXT, ...(await res.json()) };
  } catch {
    return NO_CONTEXT;
  }
}

/**
 * File the result of a tournament match.
 *
 * Goes through the Worker rather than straight to Supabase because an Activity
 * reaching a non-Discord origin needs a URL mapping configured on the
 * application, and everything here rides the built-in `/.proxy/` mapping to its
 * own Worker instead.
 *
 * The scores are in the match row's A/B order, which the caller works out from
 * the seat map in the context. Sending them the other way round would file a
 * loss as a win, so the mapping is done once, in matchScoreForRow().
 *
 * Returns `{ ok }` or `{ ok: false, message }`, where the message is the
 * database's own refusal — "this result is final", "not a legal score for a
 * best of 3" — which is what the person filing needs to read.
 */
export async function submitResult({ matchId, scoreA, scoreB, draws = 0 }) {
  if (!auth?.access_token) return { ok: false, message: 'Not signed in to Discord.' };
  try {
    const res = await fetch('/.proxy/api/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: auth.access_token,
        match_id: matchId,
        score_a: scoreA,
        score_b: scoreB,
        draws,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.ok) return { ok: true };
    return { ok: false, message: body?.message || 'That did not go through. Try again in a moment.' };
  } catch {
    return { ok: false, message: 'Could not reach 0nefor.one. Try again in a moment.' };
  }
}

export function getSdk() {
  return discordSdk;
}

export function getAuth() {
  return auth;
}
