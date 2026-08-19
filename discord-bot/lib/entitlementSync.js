// Pushing a guild's Discord entitlement onto the website's verified badge.
//
// Kept out of index.js and free of discord.js so the failure paths can be tested
// with a stubbed Supabase client. They are worth testing: this function writes
// evidence (`community_claim.discord_entitlement_at`) and then asks the database
// to recompute the badge from it, and the two writes are not in one transaction.
// If the second half fails and the first is left standing, the next pass reads
// the column back, decides it is already in the state it wants, and returns
// before it ever retries — so the badge stays wrong for good. A guild paying
// through Discord only has no Stripe event to come along and fix it.
//
// The caller resolves the guild and passes its owner id; nothing here talks to
// Discord.

/**
 * Whether an entitlement grants access: no end, or an end still in the future.
 * discord.js exposes endsTimestamp (ms) — null/undefined means indefinite.
 */
function entitlementIsActive(ent) {
  const ends = ent?.endsTimestamp ?? null;
  return ends === null || ends > Date.now();
}

/**
 * A Discord Guild Subscription verifies the linked community on the website.
 *
 * Two things have to be true beyond the entitlement, and the second is the one
 * that matters: the guild must be linked to a community by /verify, and the
 * Discord account that **owns the guild** must be the account that owns the
 * community. Manage Server is enough to link a server; it is not enough to
 * spend the server owner's subscription on your own listing.
 *
 * Writes only `discord_entitlement_at`, then asks the database to recompute.
 * `community.verified` is derived from Stripe and Discord together, so an
 * entitlement ending can never strip the badge from somebody paying by card.
 *
 * Returns an outcome rather than logging, so the caller decides what is worth
 * saying out loud and how often.
 *
 * @param supabase                    a service-role Supabase client
 * @param {string} guildId            the guild whose entitlement changed
 * @param {string?} guildOwnerId      the Discord id of that guild's owner
 * @param {boolean} active            whether the entitlement grants access now
 */
async function syncGuildEntitlement(supabase, { guildId, guildOwnerId, active }) {
  const { data, error } = await supabase.rpc('discord_entitlement_target', { p_guild_id: guildId });
  if (error) return { ok: false, reason: 'target-lookup-failed', error };

  const target = Array.isArray(data) ? data[0] : data ?? null;
  // Never linked, or identity not proved yet.
  if (!target?.community_id) return { ok: false, reason: 'not-linked' };
  const communityId = target.community_id;

  if (!target.owner_discord_id || target.owner_discord_id !== guildOwnerId) {
    return { ok: false, reason: 'owner-mismatch', communityId };
  }

  const { data: claim } = await supabase
    .from('community_claim')
    .select('id, discord_entitlement_at')
    .eq('community', communityId)
    .not('discord_guild_id', 'is', null)
    .maybeSingle();
  if (!claim) return { ok: false, reason: 'no-claim', communityId };

  const held = claim.discord_entitlement_at != null;
  // Already in the state we want; no write, no noise. This early return is also
  // why a half-finished sync below has to be undone rather than left: it is the
  // line that would swallow the retry.
  if (held === active) return { ok: true, reason: 'unchanged', communityId };

  const { error: writeErr } = await supabase
    .from('community_claim')
    .update({ discord_entitlement_at: active ? new Date().toISOString() : null })
    .eq('id', claim.id);
  if (writeErr) return { ok: false, reason: 'write-failed', communityId, error: writeErr };

  const { data: verified, error: recErr } = await supabase
    .rpc('recompute_community_verified', { p_community: communityId });
  if (recErr) {
    // The evidence column is written but the badge it feeds is not. Put the
    // column back so the next sync sees a difference again and comes through
    // from the top.
    const { error: revertErr } = await supabase
      .from('community_claim')
      .update({ discord_entitlement_at: claim.discord_entitlement_at })
      .eq('id', claim.id);
    return {
      ok: false,
      reason: 'recompute-failed',
      communityId,
      claimId: claim.id,
      error: recErr,
      reverted: !revertErr,
      revertError: revertErr ?? null,
    };
  }

  return { ok: true, reason: 'synced', communityId, verified, active };
}

module.exports = { entitlementIsActive, syncGuildEntitlement };
