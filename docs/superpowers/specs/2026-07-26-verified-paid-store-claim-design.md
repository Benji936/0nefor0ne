# Verified Paid Store Claim — Design

**Status:** Approved design, pending spec review
**Date:** 2026-07-26
**Supersedes:** the current instant/free `claim_community` flow (already live on `main`)

## Problem

Claiming a store today is one click: `claim_community(id)` sets `owner = auth.uid()`,
`status = 'published'` on any `owner IS NULL` row, with **no proof of ownership and no
cost**. Anyone can claim any store. We need to ensure the claimer is genuinely the
store, and (per product decision) charge a one-time fee to claim.

## Goal

Make claiming a store require **both**:
1. **Identity verification** — proof the claimer controls the store (MVP: email code to
   the store's official on-file address).
2. **A one-time payment** — a single Stripe charge to finalize the claim.

Ownership + the Verified badge are granted only after both succeed.

## Non-goals (this design)

- Subscriptions / recurring billing (decided: one-time only).
- Premium tiers / featured listings (payment is the claim gate, not an upsell).
- Discord-admin and domain-token verification (Phase 2).
- Self-serve ownership transfer / reclaim (manual/admin for MVP).
- Auto-un-verify on refund (Phase 2; refunds handled in the Stripe dashboard for now).

## Core model — the claim state machine

`owner` stays `NULL` until the very end, so an abandoned or failed attempt never locks a
store for anyone else.

```
unclaimed ──▶ identity verified ──▶ payment complete ──▶ OWNED + VERIFIED + published
 owner NULL        owner NULL           owner NULL          owner set (by webhook only)
```

**Locked decisions:**
- **Verify identity before paying.** Only claimers who proved ownership reach Checkout, so
  there are no "paid but couldn't verify" refunds.
- **`owner` is set only by the Stripe webhook** (service role), on `checkout.session.completed`.
  The client never sets ownership directly.
- **`verified = true` is set at the same moment** (the webhook is service-role, which the
  existing `community_enforce_admin_fields` trigger permits).

## Components & data flow

### Data model

- **`community_claim`** (new) — the state record for a claim attempt:
  | column | type | notes |
  |---|---|---|
  | `id` | bigint identity PK | |
  | `community` | bigint FK → community(id) | |
  | `claimer` | uuid FK → auth.users(id) | |
  | `identity_verified_at` | timestamptz null | set when the code is confirmed |
  | `payment_status` | text | `pending` \| `paid` \| `failed` (default `pending`) |
  | `stripe_session_id` | text null | |
  | `stripe_payment_intent` | text null | |
  | `code_hash` | text null | SHA-256 of the current 6-digit code; never plaintext |
  | `code_expires_at` | timestamptz null | ~10 min TTL |
  | `code_attempts` | smallint default 0 | cap (e.g. 5) then force a resend |
  | `manual_review_reason` | text null | set when the claimer requests manual review |
  | `manual_review_at` | timestamptz null | admin resolves in Studio |
  | `created_at` | timestamptz default now() | |

  RLS: a claimer may read/insert **their own** rows; no public read. One non-failed claim
  per (community, claimer). The webhook and the code-issuing function write via service role.
  The verification code lives on this row (hash + expiry + attempts) — no separate table.

- **Private claim contact** — the store's OTS email, stored where RLS never returns it.
  Chosen approach: a separate table **`community_private`** (`community` FK PK,
  `claim_email text`), RLS = deny-all to `anon`/`authenticated`; only service-role Edge
  Functions read it. Seeded from `data/stores.json`. (Keeping it out of `community` avoids
  any risk of a `select *` leaking it.)

- **`claim_community` RPC is retired.** Replaced by the Edge-Function flow below.

### Backend — Supabase Edge Functions

(The project already runs one Edge Function, `seed-communities`, so this surface is
established.)

1. **`claim-request-code`** — input: `community_id`. Looks up the private `claim_email`,
   generates a 6-digit code, stores its hash + expiry, emails the code to the on-file
   address (never returned to the client). Rate-limited per user/community. If the store
   has no email on file → returns a `needs_manual_review` signal instead.
2. **`claim-verify-code`** — input: `community_id`, `code`. Checks hash + expiry + attempts;
   on success sets `identity_verified_at` on the claim row.
3. **`claim-create-checkout`** — requires `identity_verified_at`. Creates a Stripe Checkout
   Session (one configured Price), stores `stripe_session_id`, returns the redirect URL.
   Success/cancel URLs return to `/{locale}/community/{slug}?claim=success|cancel`.
4. **`stripe-webhook`** — verifies the Stripe signature; on `checkout.session.completed`
   (idempotent on event id): sets the claim `payment_status='paid'`, and on the community
   sets `owner=claimer`, `verified=true`, `status='published'`, `updated_at=now()`.

**Secrets (Supabase Edge Function secrets — never in the repo or chat):** email-provider
API key, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`.

### Frontend

- **`ClaimCommunityDialog` becomes multi-step:**
  1. Intro — explains "verify you manage this store, then a one-time fee of {price}."
  2. Email code — "we sent a code to the email on file for this store" → 6-digit input →
     verify. (Never shows the email address.)
  3. Pay — "Pay {price} to finish" → redirect to Stripe Checkout.
  4. Return — the profile reads `?claim=success|cancel`; on success it re-fetches and shows
     the owned + Verified state; on cancel it re-opens the dialog at the pay step.
- **Manual-review fallback** — when `needs_manual_review`, the dialog switches to a short
  "request manual verification" form (reason/contact) that writes `manual_review_reason` on
  the claim row; the admin reviews and resolves it in Supabase Studio.
- `src/lib/community.js` gains `requestClaimCode`, `verifyClaimCode`, `startClaimCheckout`
  (thin wrappers over the Edge Functions).

### Admin (MVP)

- **Manual review** and the `verified` badge for edge cases are handled in **Supabase
  Studio** (no admin UI built this pass). Admin = the project owner's user id.

## Error handling & edge cases

- **Abandoned flow:** `owner` never set → store stays claimable. Stale `pending` claims can
  be ignored or swept later.
- **Idempotency:** the webhook dedupes on Stripe event id; re-delivery is safe.
- **Race:** two people verify + pay near-simultaneously — the webhook's `UPDATE ... WHERE
  owner IS NULL` makes the first paid write win; the loser is auto-refunded (manual for MVP,
  flagged) and told it was just claimed.
- **Code security:** hashed, expiring, attempt-capped, rate-limited sends.
- **Payment security:** Stripe-hosted Checkout; no card data touches the app or the chat.
- **No email on file:** manual-review fallback.

## Testing

Matches the repo's reality (pure logic in `src/lib/*.js` gets vitest; SQL and Edge
Functions are not unit-tested here):
- **Unit (vitest):** code generation/hashing/expiry logic, claim state-transition helpers,
  price formatting.
- **Integration/manual:** Edge Functions and the Stripe webhook (Stripe CLI / test mode),
  RLS checks via SQL, the end-to-end dialog flow in the browser with Stripe test cards.

## Suggested build phasing (for the implementation plan)

Two increments, shipped together (the feature only makes sense whole):
1. **Verification + reworked claim states** — `community_claim` + `community_private`
   tables + RLS, retire `claim_community`, `claim-request-code` / `claim-verify-code`
   functions, seed private emails, multi-step dialog up to "identity verified", manual-review
   fallback.
2. **Stripe payment gate** — `claim-create-checkout` + `stripe-webhook`, the pay step and
   success/cancel return, ownership/verified set on paid webhook.

## Prerequisites (owner-provided, needed to go live — not to write the plan)

1. Stripe account + a one-time **Price** (amount + currency) + `STRIPE_SECRET_KEY` and
   `STRIPE_WEBHOOK_SECRET` set in Supabase secrets.
2. An email provider (Resend/Postmark/SendGrid or Supabase SMTP) + API key in Supabase secrets.
3. Confirm admin user id.
4. Confirm the price/currency (else it stays a config parameter).

## Risks & tradeoffs

- **"Free, no fees" brand tension:** charging to claim a *free* listing may deter legitimate
  small-store owners. Mitigation: keep the price modest; revisit if claim volume is low.
- **New payment surface:** Stripe adds account setup, webhooks, refunds, chargebacks, and tax
  obligations to a previously payment-free product. Owner-owned responsibility.
- **Email deliverability:** codes to third-party store inboxes may land in spam; the
  manual-review fallback covers non-deliverable cases.
