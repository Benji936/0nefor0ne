---
type: "query"
date: "2026-08-19T12:18:43.397796+00:00"
question: "Why do the Discord tournament gate, the Stripe claim gate, and the phone gate keep converging on the same shape without sharing any code?"
contributor: "graphify"
source_nodes: ["Trade table phone-gate trigger", "Ownership is set server-side only", "Ownership granted and revoked only by the Stripe webhook", "HMAC-signed tournament grant", "Guild Subscription entitlements as source of truth", "Tournament mode (verified stores)", "Stripe subscription claim gate (Plan 2)", "Email-code identity verification (Plan 1)"]
---

# Q: Why do the Discord tournament gate, the Stripe claim gate, and the phone gate keep converging on the same shape without sharing any code?

## Answer

Expanded from original query via graph vocab: [gate, grant, hmac, tournament, stripe, webhook, entitlements, claim, ownership, phone, trigger, verified]. BFS depth=2 reached 158 nodes across communities 5, 13, 100, 116, 123, 134, 160. Finding: four trust gates share one invariant - authority sits behind a secret the client cannot hold, placed at the write chokepoint rather than the call site, with the client reduced to rendering the refusal. Phone gate: SECURITY DEFINER trigger on Trade raising SQLSTATE P0002, chosen over RPC checks because is_phone_verified had two SECURITY DEFINER overloads. Plan 1 claim: ownership written only by claim-verify-code Edge Function. Plan 2 claim: stripe-webhook is the ONLY place ownership is granted or revoked, gated on Stripe signature + service key. Discord tournament: HMAC grant signed by the Worker with DISCORD_CLIENT_SECRET, bound to room + exp, authority delegated to community_for_guild RPC. Discord premium: bot honours the website answer rather than minting entitlements. No structural edge connects any pair - the only links are INFERRED semantically_similar_to, because each gate lives in a different runtime (plpgsql, Deno, Cloudflare Worker, Node) with no shared language to factor into. Divergence found: the phone gate deliberately fails OPEN when auth.uid() is null (service role must not be locked out), while grant verification and the Stripe signature check both fail CLOSED.

## Source Nodes

- Trade table phone-gate trigger
- Ownership is set server-side only
- Ownership granted and revoked only by the Stripe webhook
- HMAC-signed tournament grant
- Guild Subscription entitlements as source of truth
- Tournament mode (verified stores)
- Stripe subscription claim gate (Plan 2)
- Email-code identity verification (Plan 1)