---
type: "query"
date: "2026-08-19T12:38:19.053754+00:00"
question: "How does the Discord bot entitlement branch work, and does it break the server-side-authority pattern?"
contributor: "graphify"
source_nodes: ["syncEntitlements()", "syncGuildEntitlement()", "entitlementIsActive()", "Guild Subscription entitlements as source of truth", "Ownership granted and revoked only by the Stripe webhook"]
---

# Q: How does the Discord bot entitlement branch work, and does it break the server-side-authority pattern?

## Answer

Expanded from graph vocab: [entitlement, entitlements, premium, guild, sync, verified, community, subscription, discord, link]. Finding: it does NOT break the pattern. The bot is bidirectional but each direction still obeys the invariant. Direction 1 (entitlement to site): syncGuildEntitlement writes ONLY the evidence column community_claim.discord_entitlement_at, never community.verified, then calls recompute_community_verified - the real chokepoint. Direction 2 (site to premium): syncSiteVerifiedGuilds reads community.verified into an in-memory Set granting nothing persistent. The merge point recompute_community_verified encodes: money is OR (subscription_status IN trialing/active OR discord_entitlement_at IS NOT NULL) while identity is AND (identity_verified_at IS NOT NULL, commented 'Paying does not skip proving'), plus cc.claimer = c.owner so stale claims from prior owners do not count. Both RPCs REVOKE EXECUTE from anon and authenticated, GRANT only to service_role. Privilege-escalation guard: syncGuildEntitlement refuses when target.owner_discord_id !== guild.ownerId, because Manage Server is enough to link a guild but not to spend the server owner subscription on your own listing. BUG FOUND: if the community_claim write succeeds but recompute_community_verified errors, the function returns early; on every later sync held === active is true so it returns before ever retrying the recompute. Only two runtime callers of recompute exist (discord-bot/index.js:170 and stripe-webhook/index.ts:136), so a Discord-only-paid community whose recompute failed once keeps discord_entitlement_at set with community.verified permanently stale until a Stripe event or manual re-run.

## Source Nodes

- syncEntitlements()
- syncGuildEntitlement()
- entitlementIsActive()
- Guild Subscription entitlements as source of truth
- Ownership granted and revoked only by the Stripe webhook