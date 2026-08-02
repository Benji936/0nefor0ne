import { DiscordSDK } from '@discord/embedded-app-sdk';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

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

  if (!CLIENT_ID) throw new Error('VITE_DISCORD_CLIENT_ID is not set at build time.');

  discordSdk = new DiscordSDK(CLIENT_ID);
  await discordSdk.ready();

  const { code } = await discordSdk.commands.authorize({
    client_id: CLIENT_ID,
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

export function getSdk() {
  return discordSdk;
}

export function getAuth() {
  return auth;
}
