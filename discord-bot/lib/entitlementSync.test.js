const test = require('node:test');
const assert = require('node:assert/strict');
const { entitlementIsActive, syncGuildEntitlement } = require('./entitlementSync');

// ── entitlementIsActive ───────────────────────────────────────────────────────

test('an entitlement with no end is active; a past end is not', () => {
  assert.equal(entitlementIsActive({ endsTimestamp: null }), true);
  assert.equal(entitlementIsActive({}), true);
  assert.equal(entitlementIsActive({ endsTimestamp: Date.now() + 60_000 }), true);
  assert.equal(entitlementIsActive({ endsTimestamp: Date.now() - 60_000 }), false);
  assert.equal(entitlementIsActive(null), true);
});

// ── a Supabase stub that records writes and can be told to fail ───────────────

const TARGET = { community_id: 17, owner_discord_id: 'owner-1' };

/**
 * @param over.claim        the community_claim row the select returns
 * @param over.failRpc      an rpc name to fail ('recompute_community_verified')
 * @param over.failUpdates  indices of update() calls that should fail, e.g. [1]
 */
function stubSupabase(over = {}) {
  const { claim = { id: 9, discord_entitlement_at: null }, failRpc = null, failUpdates = [] } = over;
  const calls = { rpc: [], updates: [] };

  return {
    calls,
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      if (name === failRpc) return { data: null, error: { message: `${name} exploded` } };
      if (name === 'discord_entitlement_target') {
        // `in` rather than `??`, so a test can pass an explicit null target.
        const target = 'target' in over ? over.target : TARGET;
        return { data: target ? [target] : [], error: null };
      }
      if (name === 'recompute_community_verified') return { data: true, error: null };
      return { data: null, error: null };
    },
    from() {
      const builder = {
        select: () => builder,
        eq: () => builder,
        not: () => builder,
        maybeSingle: async () => ({ data: claim, error: null }),
        update(patch) {
          const index = calls.updates.length;
          calls.updates.push(patch);
          const failed = failUpdates.includes(index);
          const result = { error: failed ? { message: 'update exploded' } : null };
          return { eq: async () => result };
        },
      };
      return builder;
    },
  };
}

const run = (supabase, active = true) =>
  syncGuildEntitlement(supabase, { guildId: 'g1', guildOwnerId: 'owner-1', active });

// ── the guard that stops a subscription being spent on somebody else's shop ────

test('refuses when the guild owner is not the community owner', async () => {
  const supabase = stubSupabase({ target: { community_id: 17, owner_discord_id: 'someone-else' } });
  const out = await run(supabase);

  assert.equal(out.ok, false);
  assert.equal(out.reason, 'owner-mismatch');
  assert.equal(supabase.calls.updates.length, 0, 'must not write on a mismatch');
});

test('does nothing when the guild was never linked to a community', async () => {
  const supabase = stubSupabase({ target: null });
  const out = await run(supabase);

  assert.equal(out.reason, 'not-linked');
  assert.equal(supabase.calls.updates.length, 0);
});

// ── the happy path ────────────────────────────────────────────────────────────

test('writes the evidence column and then recomputes the badge', async () => {
  const supabase = stubSupabase();
  const out = await run(supabase, true);

  assert.equal(out.ok, true);
  assert.equal(out.reason, 'synced');
  assert.equal(out.verified, true);
  assert.equal(supabase.calls.updates.length, 1);
  assert.ok(supabase.calls.updates[0].discord_entitlement_at, 'granting sets a timestamp');
  assert.deepEqual(
    supabase.calls.rpc.map((c) => c.name),
    ['discord_entitlement_target', 'recompute_community_verified'],
  );
});

test('an ending entitlement clears the column rather than stamping it', async () => {
  const supabase = stubSupabase({ claim: { id: 9, discord_entitlement_at: '2026-08-01T00:00:00Z' } });
  const out = await run(supabase, false);

  assert.equal(out.reason, 'synced');
  assert.equal(supabase.calls.updates[0].discord_entitlement_at, null);
});

test('writes nothing when the stored state already matches', async () => {
  const supabase = stubSupabase({ claim: { id: 9, discord_entitlement_at: '2026-08-01T00:00:00Z' } });
  const out = await run(supabase, true);

  assert.equal(out.reason, 'unchanged');
  assert.equal(supabase.calls.updates.length, 0);
  assert.ok(!supabase.calls.rpc.some((c) => c.name === 'recompute_community_verified'));
});

// ── the regression this module exists for ─────────────────────────────────────

test('a failed recompute puts the evidence column back, so the next pass retries', async () => {
  const supabase = stubSupabase({ failRpc: 'recompute_community_verified' });
  const out = await run(supabase, true);

  assert.equal(out.ok, false);
  assert.equal(out.reason, 'recompute-failed');
  assert.equal(out.reverted, true);

  // Written, then restored to exactly what it was — not merely set to null.
  assert.equal(supabase.calls.updates.length, 2);
  assert.ok(supabase.calls.updates[0].discord_entitlement_at);
  assert.equal(supabase.calls.updates[1].discord_entitlement_at, null);
});

test('the revert restores a previous timestamp, not just null', async () => {
  const held = '2026-08-01T00:00:00Z';
  const supabase = stubSupabase({
    claim: { id: 9, discord_entitlement_at: held },
    failRpc: 'recompute_community_verified',
  });
  const out = await run(supabase, false);

  assert.equal(out.reason, 'recompute-failed');
  assert.equal(supabase.calls.updates[0].discord_entitlement_at, null, 'first write clears it');
  assert.equal(supabase.calls.updates[1].discord_entitlement_at, held, 'revert puts the old stamp back');
});

test('without the revert the retry would be swallowed: reverted state differs again', async () => {
  // The point of reverting is that `held === active` stops being true, which is
  // the branch that returns early. Re-running against the reverted row must get
  // as far as a write instead of stopping at 'unchanged'.
  const supabase = stubSupabase({ failRpc: 'recompute_community_verified' });
  await run(supabase, true);
  const reverted = supabase.calls.updates.at(-1).discord_entitlement_at;

  const second = stubSupabase({ claim: { id: 9, discord_entitlement_at: reverted } });
  const out = await run(second, true);
  assert.equal(out.reason, 'synced', 'the retry must reach the recompute, not return unchanged');
});

test('reports when the revert itself fails, so the row can be fixed by hand', async () => {
  const supabase = stubSupabase({ failRpc: 'recompute_community_verified', failUpdates: [1] });
  const out = await run(supabase, true);

  assert.equal(out.reason, 'recompute-failed');
  assert.equal(out.reverted, false);
  assert.ok(out.revertError, 'the caller needs this to log the manual fix');
  assert.equal(out.communityId, 17);
  assert.equal(out.claimId, 9);
});

test('a failed evidence write never reaches the recompute', async () => {
  const supabase = stubSupabase({ failUpdates: [0] });
  const out = await run(supabase, true);

  assert.equal(out.reason, 'write-failed');
  assert.ok(!supabase.calls.rpc.some((c) => c.name === 'recompute_community_verified'));
});
