# Verified Paid Store Claim — Design

**Status:** Approved design, pending spec review
**Date:** 2026-07-26
**Supersedes:** the current instant/free `claim_community` flow (already live on `main`)

## Problem

Claiming a store today is one click: `claim_community(id)` sets `owner = auth.uid()`,
`status = 'published'` on any `owner IS NULL` row, with **no proof of ownership and no
cost**. Anyone can claim any store. We need to ensure the claimer is genuinely the store,
and (per product decision) put the claim behind a paid subscription.

## Goal

Make claiming a store require **both**:
1. **Identity verification** — proof the claimer controls the store (MVP: email code to the
   store's official on-file address).
2. **An annual subscription** — **$60/year, first year free**, implemented as a Stripe
   subscription with a **12-month free trial** (card collected up front, $0 charged now,
   auto-charges $60 at the 1-year mark and yearly after).

Ownership + the Verified badge exist **only while the subscription is active** (trialing or
active). When it ends, the store reverts to an unclaimed — but content-rich — listing.

## Non-goals (this design)

- Premium tiers / featured listings (the subscription is the claim gate, not an upsell).
- Multiple plans, proration, coupons beyond the built-in free first year (single $60/yr plan).
- Discord-admin and domain-token verification (Phase 2).
- Self-serve ownership transfer / reclaim between different people (manual/admin for MVP).
- Auto-un-verify on refund of a single invoice (handled via subscription lifecycle instead).

## Core model — the claim state machine

`owner` stays `NULL` until a subscription is active, so an abandoned or failed attempt never
locks a store. When the subscription ends, the store reverts.

```
unclaimed ─▶ identity verified ─▶ subscription active (trialing) ─▶ OWNED + VERIFIED + published
 owner NULL       owner NULL              owner NULL                    owner set (webhook only)
     ▲                                                                          │
     └──────────────────  subscription ends (cancel / unpaid)  ◀───────────────┘
        revert: owner NULL, verified false, status published, CONTENT KEPT
```

**Locked decisions:**
- **Verify identity before subscribing.** Only claimers who proved ownership reach Checkout.
- **`owner` + `verified = true` are set only by the Stripe webhook** (service role), when the
  subscription becomes `trialing`/`active`. The client never sets ownership directly.
- **First year free** = a 12-month trial on the subscription; the card is on file, $0 now.
- **Lapse policy** = on `canceled`/`unpaid`, revert the community to **unclaimed** (owner
  `NULL`, `verified` false, `status` back to `published`) while **keeping the owner-edited
  content** (bio, links, etc.). The store becomes claimable again; the original owner can
  re-subscribe to reclaim.

## Components & data flow

### Data model

- **`community_claim`** (new) — the per-owner claim + subscription record:
  | column | type | notes |
  |---|---|---|
  | `id` | bigint identity PK | |
  | `community` | bigint FK → community(id) | |
  | `claimer` | uuid FK → auth.users(id) | |
  | `identity_verified_at` | timestamptz null | set when the code is confirmed |
  | `code_hash` | text null | SHA-256 of the current 6-digit code; never plaintext |
  | `code_expires_at` | timestamptz null | ~10 min TTL |
  | `code_attempts` | smallint default 0 | cap (e.g. 5) then force a resend |
  | `stripe_customer_id` | text null | |
  | `stripe_subscription_id` | text null | |
  | `subscription_status` | text null | `trialing` \| `active` \| `past_due` \| `canceled` |
  | `current_period_end` | timestamptz null | when the next charge / expiry falls |
  | `manual_review_reason` | text null | set when the claimer requests manual review |
  | `manual_review_at` | timestamptz null | admin resolves in Studio |
  | `created_at` | timestamptz default now() | |

  RLS: a claimer may read/insert **their own** rows; no public read. The verification code
  lives on this row (hash + expiry + attempts) — no separate table. The webhook and the
  code-issuing function write via service role. At most one **active** subscription-backed
  owner per community, enforced by the webhook's `owner IS NULL` guard.

- **`community_private`** (new) — the store's OTS email, stored where RLS never returns it:
  `community` FK PK, `claim_email text`. RLS = deny-all to `anon`/`authenticated`; only
  service-role Edge Functions read it. Seeded from `data/stores.json`.

- **`claim_community` RPC is retired.** Replaced by the Edge-Function flow below.

### Backend — Supabase Edge Functions

(The project already runs one Edge Function, `seed-communities`, so this surface is
established. Email is sent via **Resend**, which the project already uses.)

1. **`claim-request-code`** — input: `community_id`. Looks up the private `claim_email`,
   generates a 6-digit code, stores its hash + expiry, emails the code via **Resend** to the
   on-file address (never returned to the client). Rate-limited. No email on file →
   returns `needs_manual_review`.
2. **`claim-verify-code`** — input: `community_id`, `code`. Checks hash + expiry + attempts;
   on success sets `identity_verified_at`.
3. **`claim-create-checkout`** — requires `identity_verified_at`. Creates a **subscription-mode**
   Stripe Checkout Session for the $60/yr Price with a **365-day trial**, stores
   `stripe_customer_id`/`stripe_subscription_id`, returns the redirect URL. Success/cancel
   URLs return to `/{locale}/community/{slug}?claim=success|cancel`.
4. **`stripe-webhook`** — verifies the Stripe signature; idempotent on event id. Handles the
   subscription lifecycle:
   - `customer.subscription.created` / `.updated` → status `trialing`/`active`: set
     `owner=claimer`, `verified=true`, `status='published'` on the community, and mirror
     `subscription_status`/`current_period_end` on the claim.
   - status `past_due` → keep ownership (Stripe is dunning); just record the status.
   - `customer.subscription.deleted` (or `unpaid`) → **lapse:** revert the community to
     `owner NULL`, `verified=false`, `status='published'`, keep content; mark the claim
     `canceled`.
5. **`claim-portal`** (owner management) — creates a Stripe Customer Portal session so the
   owner can update the card or cancel (`cancel_at_period_end`; they keep the store until
   `current_period_end`, then it reverts).

**Secrets (Supabase Edge Function secrets — never in the repo or chat):** `RESEND_API_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` (the $60/yr recurring Price).

### Frontend

- **`ClaimCommunityDialog` becomes multi-step:**
  1. Intro — "verify you manage this store, then set up your listing: **free for the first
     year, $60/year after**."
  2. Email code — "we sent a code to the email on file for this store" → 6-digit input →
     verify. (Never shows the email address.)
  3. Subscribe — "Start free year" → redirect to Stripe Checkout (subscription mode, trial).
  4. Return — the profile reads `?claim=success|cancel`; success re-fetches and shows the
     owned + Verified state; cancel re-opens the dialog at the subscribe step.
- **Manual-review fallback** — when `needs_manual_review`, the dialog switches to a short
  "request manual verification" form that writes `manual_review_reason`; the admin resolves
  it in Studio.
- **"My communities" strip** gains a **Manage subscription** link → `claim-portal` (Stripe
  Customer Portal), where the owner can update billing or cancel.
- `src/lib/community.js` gains `requestClaimCode`, `verifyClaimCode`, `startClaimCheckout`,
  `openBillingPortal` (thin wrappers over the Edge Functions).

### Admin (MVP)

- **Manual review** and any manual `verified` overrides are handled in **Supabase Studio**
  (no admin UI built this pass). Admin = the project owner's user id.

## Error handling & edge cases

- **Abandoned flow:** `owner` never set → store stays claimable.
- **Trial end / renewal:** Stripe charges $60 at the 1-year mark and dunns on failure;
  `past_due` keeps ownership during retries. Only terminal `canceled`/`unpaid` reverts.
- **Cancellation:** `cancel_at_period_end` — owner keeps the store until `current_period_end`,
  then the lapse revert fires.
- **Idempotency:** the webhook dedupes on Stripe event id; re-delivery is safe.
- **Race:** two people verify + subscribe near-simultaneously — the webhook's
  `UPDATE ... WHERE owner IS NULL` makes the first active subscription win; the loser's
  subscription is canceled/refunded (manual for MVP, flagged) and they're told it was claimed.
- **Code security:** hashed, expiring, attempt-capped, rate-limited sends.
- **Payment security:** Stripe-hosted Checkout + Portal; no card data touches the app or chat.
- **No email on file:** manual-review fallback.

## Testing

Matches the repo's reality (pure logic in `src/lib/*.js` gets vitest; SQL and Edge Functions
are not unit-tested here):
- **Unit (vitest):** code generation/hashing/expiry logic, claim state-transition helpers,
  price/plan formatting.
- **Integration/manual:** Edge Functions and the Stripe webhook (Stripe CLI / test mode,
  including trial-end and cancellation events), RLS checks via SQL, the end-to-end dialog in
  the browser with Stripe test cards.

## Suggested build phasing (for the implementation plan)

Two increments, shipped together (the feature only makes sense whole):
1. **Verification + reworked claim states** — `community_claim` + `community_private` tables
   + RLS, retire `claim_community`, `claim-request-code` / `claim-verify-code` functions,
   seed private emails, multi-step dialog up to "identity verified", manual-review fallback.
2. **Stripe subscription** — `claim-create-checkout` (trial) + `stripe-webhook` (lifecycle +
   lapse revert) + `claim-portal`, the subscribe step, success/cancel return, and the Manage
   subscription link.

## Prerequisites (owner-provided, needed to go live — not to write the plan)

1. **Stripe** — account + a **$60/year recurring Price** + `STRIPE_SECRET_KEY` and
   `STRIPE_WEBHOOK_SECRET` in Supabase secrets. (Currency assumed USD — confirm.)
2. **Resend** — `RESEND_API_KEY` in Supabase secrets (provider already in use), and a
   verified sender domain.
3. Confirm admin user id.

## Risks & tradeoffs

- **Involuntary churn:** a failed renewal a year later silently reverts a store to unclaimed,
  which may surprise an owner. Mitigation: Stripe dunning emails during `past_due`, and the
  revert keeps their content so re-subscribing restores everything.
- **New payment surface:** Stripe subscriptions add account setup, webhooks, dunning, tax,
  and chargeback handling to a previously payment-free product. Owner-owned responsibility.
- **Email deliverability:** codes to third-party store inboxes may land in spam; the
  manual-review fallback covers non-deliverable cases.
- **Brand:** the free first year keeps the "free" promise intact for new claimers; the paywall
  only bites at renewal.
