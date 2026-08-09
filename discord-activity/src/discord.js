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

/**
 * Ask the Worker whether this duel gets tournament mode.
 *
 * Returns a grant, not a boolean the caller acts on: the grant is what the
 * socket accepts. A plain `false` here is the normal answer — the duel is free
 * and complete without it — so a failure is treated the same as a no.
 */
export async function requestTournament({ guildId, room }) {
  if (!isEmbedded || !guildId || !auth?.access_token) return { tournament: false };
  try {
    const res = await fetch('/.proxy/api/tournament', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: auth.access_token, guildId, room }),
    });
    if (!res.ok) return { tournament: false };
    return await res.json();
  } catch {
    return { tournament: false };
  }
}

export function getSdk() {
  return discordSdk;
}

export function getAuth() {
  return auth;
}
