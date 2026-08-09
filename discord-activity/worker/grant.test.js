import test from 'node:test';
import assert from 'node:assert/strict';
import { signGrant, readGrant } from './grant.js';

const SECRET = 'client-secret-abc';
const ROOM = 'instance-123';

const payload = (over = {}) => ({
  room: ROOM,
  guildId: '999',
  name: 'Red Line',
  slug: 'red-line',
  exp: Date.now() + 60_000,
  ...over,
});

test('a grant this Worker signed reads back', async () => {
  const g = await signGrant(SECRET, payload());
  const out = await readGrant(SECRET, g, ROOM);
  assert.equal(out.slug, 'red-line');
  assert.equal(out.guildId, '999');
});

test('a grant signed with another secret is refused', async () => {
  const g = await signGrant('someone-elses-secret', payload());
  assert.equal(await readGrant(SECRET, g, ROOM), null);
});

test('a tampered payload is refused, even with the old signature', async () => {
  const g = await signGrant(SECRET, payload({ slug: 'not-a-store' }));
  const [, sig] = g.split('.');
  // Re-encode a payload the attacker prefers and staple the real signature to it.
  const forgedBody = Buffer.from(JSON.stringify(payload({ slug: 'red-line' })))
    .toString('base64url');
  assert.equal(await readGrant(SECRET, `${forgedBody}.${sig}`, ROOM), null);
});

test('a grant for one room does not work in another', async () => {
  const g = await signGrant(SECRET, payload());
  assert.equal(await readGrant(SECRET, g, 'a-different-room'), null);
});

test('an expired grant is refused', async () => {
  const g = await signGrant(SECRET, payload({ exp: Date.now() - 1 }));
  assert.equal(await readGrant(SECRET, g, ROOM), null);
});

test('a grant with no expiry is refused rather than treated as forever', async () => {
  const g = await signGrant(SECRET, { room: ROOM, slug: 'red-line' });
  assert.equal(await readGrant(SECRET, g, ROOM), null);
});

test('junk in the grant slot is refused, not thrown on', async () => {
  for (const junk of [null, undefined, '', 'nonsense', 'a.b', '...', 42, {}]) {
    assert.equal(await readGrant(SECRET, junk, ROOM), null, `failed on ${JSON.stringify(junk)}`);
  }
});

test('a Worker with no client secret signs nothing and trusts nothing', async () => {
  assert.equal(await signGrant(undefined, payload()), null);
  const real = await signGrant(SECRET, payload());
  assert.equal(await readGrant(undefined, real, ROOM), null);
});

test('the signature covers the whole payload, not just the slug', async () => {
  const g = await signGrant(SECRET, payload({ guildId: '111' }));
  const out = await readGrant(SECRET, g, ROOM);
  assert.equal(out.guildId, '111');

  // Same room, same slug, different guild: still a different signature.
  const other = await signGrant(SECRET, payload({ guildId: '222' }));
  assert.notEqual(g.split('.')[1], other.split('.')[1]);
});
