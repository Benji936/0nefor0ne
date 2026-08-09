// Short-lived signed grants: the only way tournament mode is ever turned on.
//
// The client knows its guild id, and a client can say anything. So the Worker
// checks what it can actually verify, then signs a small payload; the socket
// trusts the signature rather than the claim. Split out from index.js because
// this is the part worth testing on its own.

const GRANT_TTL_MS = 2 * 60 * 1000;

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function b64urlToBytes(s) {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/**
 * The signing key, derived from the OAuth client secret rather than added as a
 * second secret to configure. The label keeps it from ever colliding with the
 * secret's real use.
 */
async function grantKey(secret) {
  if (!secret) return null;
  const material = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`remote-duel-grant:${secret}`),
  );
  return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

/** Signs a payload. Null when the Worker has no client secret configured. */
export async function signGrant(secret, payload) {
  const key = await grantKey(secret);
  if (!key) return null;
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `${body}.${b64url(sig)}`;
}

/** The payload, or null if it is forged, expired, or meant for another room. */
export async function readGrant(secret, grant, room) {
  if (!grant || typeof grant !== 'string') return null;
  const [body, sig] = grant.split('.');
  if (!body || !sig) return null;

  const key = await grantKey(secret);
  if (!key) return null;

  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), new TextEncoder().encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
  } catch {
    return null;
  }
  // Bound to one room and a couple of minutes, so a grant cannot be lifted out
  // of a verified store's duel and replayed into somebody else's.
  if (payload?.room !== room) return null;
  if (!payload?.exp || payload.exp < Date.now()) return null;
  return payload;
}

export { GRANT_TTL_MS };
