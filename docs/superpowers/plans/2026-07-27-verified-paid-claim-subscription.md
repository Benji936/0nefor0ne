# Verified Paid Claim — Stripe Subscription (Plan 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put store ownership behind a Stripe annual subscription (first year free via a 365-day trial, card collected up front, priced in the store's local currency), with ownership granted and revoked exclusively by the Stripe webhook.

**Architecture:** Plan 1 already ships identity verification (email code) — that stays. This plan moves the *ownership grant* out of `claim-verify-code` and into a new `stripe-webhook` Edge Function. After the code is verified, the dialog shows a "start free year" step that redirects to a Stripe-hosted Checkout Session (subscription mode, 365-day trial). Stripe's webhook fires `customer.subscription.*` events; on `trialing`/`active` the webhook sets `owner`/`verified` on the community, on `canceled`/`unpaid` it reverts the community to unclaimed while keeping content. A `claim-portal` function opens the Stripe Customer Portal for billing management.

**Tech Stack:** Supabase Postgres + RLS + Deno Edge Functions, Stripe (Checkout + Customer Portal + webhooks) via `esm.sh/stripe?target=deno`, Vue 3 `<script setup>` + Vuetify + vue-i18n (en/fr/de/it), Vitest for pure JS.

## Global Constraints

- **Ownership is webhook-only.** `owner` + `verified = true` on `community` are set **only** by `stripe-webhook` (service role), never by the client or by `claim-verify-code`. The client never writes ownership.
- **Verify before subscribe.** `claim-create-checkout` must reject any claim whose `community_claim.identity_verified_at` is NULL.
- **Fixed round prices, not live FX:** USD $60, EUR €60, GBP £50 per year. USD is the fallback currency. Currency is chosen from the store's location server-side, and passed explicitly to Checkout (`currency` param) so it does not depend on the customer's IP.
- **Trial length:** exactly `365` days (`subscription_data.trial_period_days: 365`). Card **is** collected up front (default `payment_method_collection`).
- **Lapse policy:** on terminal `canceled`/`unpaid`, revert `community` to `owner = NULL`, `verified = false`, `status = 'published'`, and **keep all owner-edited content** (bio, links, avatar, banner, tags). Never delete community content on lapse.
- **Idempotent webhook:** dedupe on Stripe `event.id`; re-delivery must be a no-op returning HTTP 200.
- **Secrets never in repo or chat.** New Supabase Edge Function secrets (owner sets them in the Supabase dashboard): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`. `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` already exist from Plan 1.
- **No em dashes in user-facing copy** (locale values). Match existing `community.claim*` key style.
- **Stripe import pin:** `import Stripe from "https://esm.sh/stripe@17.7.0?target=deno"`. If esm.sh rejects the exact patch, bump within `stripe@17`. Construct with `new Stripe(KEY, { httpClient: Stripe.createFetchHttpClient() })` and **omit `apiVersion`** (uses the account default). For webhook verification use `Stripe.createSubtleCryptoProvider()` + `constructEventAsync` (Deno crypto is async-only).
- **4-locale parity:** every new i18n key must be added to all of `en.json`, `fr.json`, `de.json`, `it.json`.

## Prerequisites (owner-provided; needed to go live, not to build)

These block the smoke test in Task 12, not the code:
1. **Stripe account** in test mode. Create a Product "Store claim" with **one recurring annual Price** (`interval: year`) whose default currency is USD $60, plus `currency_options` for EUR €60 and GBP £50. Copy the Price id → `STRIPE_PRICE_ID`.
2. `STRIPE_SECRET_KEY` (test key) set as a Supabase secret.
3. After Task 12 deploys `stripe-webhook`, register the webhook endpoint in the Stripe dashboard (URL = the deployed function URL) subscribed to `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`; copy its signing secret → `STRIPE_WEBHOOK_SECRET`.

## File Structure

- **Create** `supabase/migrations/20260727_claim_subscription.sql` — Stripe columns on `community_claim`, extend `community_claim_guard()`, `stripe_webhook_event` dedupe table.
- **Create** `frontend/src/lib/communityPricing.js` + `.test.js` — pure location→currency/price mapping.
- **Create** `supabase/functions/claim-create-checkout/index.ts` — subscription Checkout Session (trial, local currency).
- **Create** `supabase/functions/stripe-webhook/index.ts` — subscription lifecycle → grant/revert ownership.
- **Create** `supabase/functions/claim-portal/index.ts` — Stripe Customer Portal session.
- **Modify** `supabase/functions/claim-verify-code/index.ts` — stop granting ownership; identity-only.
- **Modify** `frontend/src/lib/community.js` — add `startClaimCheckout`, `openBillingPortal`, `fetchMyClaim`.
- **Modify** `frontend/src/lib/community.test.js` — expected-exports list.
- **Modify** `frontend/src/components/community/ClaimCommunityDialog.vue` — add `subscribe` step; verify → subscribe (not done); resume at subscribe when already identity-verified.
- **Modify** `frontend/src/components/Pages/App/CommunityProfile.vue` — handle `?claim=success|cancel` return + finalize poll.
- **Modify** `frontend/src/components/Pages/App/Account.vue` — "Manage subscription" link → `openBillingPortal`.
- **Modify** `frontend/src/locales/{en,fr,de,it}.json` — subscription copy.

---

### Task 1: Migration — Stripe columns, guard extension, webhook dedupe table

**Files:**
- Create: `supabase/migrations/20260727_claim_subscription.sql`

**Interfaces:**
- Produces: `community_claim.stripe_customer_id text`, `.stripe_subscription_id text`, `.subscription_status text`, `.current_period_end timestamptz` (all client-frozen by the guard, service-role writable); table `stripe_webhook_event(event_id text PK, type text, received_at timestamptz)`.

- [ ] **Step 1: Write the migration file**

```sql
-- Verified paid claim (Plan 2): Stripe subscription state on community_claim,
-- an extended column guard so client roles can never self-set subscription
-- fields, and a webhook-event dedupe table for idempotent Stripe delivery.

ALTER TABLE community_claim
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status    text,
  ADD COLUMN IF NOT EXISTS current_period_end     timestamptz;

-- Extend the existing column guard (Plan 1) to also freeze the Stripe columns
-- for client roles. Only service_role (the Edge Functions) may set them. The
-- one client-writable field remains manual_review_reason.
CREATE OR REPLACE FUNCTION community_claim_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'service_role');
BEGIN
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.identity_verified_at   := NULL;
    NEW.code_hash              := NULL;
    NEW.code_expires_at        := NULL;
    NEW.code_attempts          := 0;
    NEW.manual_review_at       := NULL;
    NEW.stripe_customer_id     := NULL;
    NEW.stripe_subscription_id := NULL;
    NEW.subscription_status    := NULL;
    NEW.current_period_end     := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.community              := OLD.community;
    NEW.claimer               := OLD.claimer;
    NEW.identity_verified_at   := OLD.identity_verified_at;
    NEW.code_hash              := OLD.code_hash;
    NEW.code_expires_at        := OLD.code_expires_at;
    NEW.code_attempts          := OLD.code_attempts;
    NEW.manual_review_at       := OLD.manual_review_at;
    NEW.stripe_customer_id     := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
    NEW.subscription_status    := OLD.subscription_status;
    NEW.current_period_end     := OLD.current_period_end;
  END IF;
  RETURN NEW;
END;
$$;

-- Idempotency ledger: the webhook inserts each Stripe event id once; a repeat
-- delivery hits the PK and is skipped. Deny all client access.
CREATE TABLE IF NOT EXISTS stripe_webhook_event (
  event_id    text PRIMARY KEY,
  type        text,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE stripe_webhook_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stripe_webhook_event FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply the migration to production**

Apply via the Supabase MCP `apply_migration` tool with name `claim_subscription` and the SQL above (the trigger `trg_community_claim_guard` from Plan 1 already fires on INSERT/UPDATE, so replacing the function is sufficient — no trigger change needed).

- [ ] **Step 3: Verify the columns and table exist**

Run this via the Supabase MCP `execute_sql` tool:

```sql
select column_name from information_schema.columns
 where table_name = 'community_claim'
   and column_name in ('stripe_customer_id','stripe_subscription_id','subscription_status','current_period_end')
 order by column_name;
select to_regclass('public.stripe_webhook_event') as dedupe_table;
```

Expected: 4 column rows returned, and `dedupe_table` = `stripe_webhook_event` (not null).

- [ ] **Step 4: Verify the client guard freezes a Stripe column**

Run via `execute_sql` (service role bypasses the guard, so this proves the function body compiled and the columns exist; the client-role enforcement is covered by the same mechanism Plan 1 already tested):

```sql
select tgname from pg_trigger where tgrelid = 'community_claim'::regclass and not tgisinternal;
```

Expected: includes `trg_community_claim_guard`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260727_claim_subscription.sql
git commit -m "feat(claim): schema for Stripe subscription state + guarded columns"
```

---

### Task 2: `communityPricing.js` — location → currency/price (pure, TDD)

**Files:**
- Create: `frontend/src/lib/communityPricing.js`
- Test: `frontend/src/lib/communityPricing.test.js`

**Interfaces:**
- Produces: `communityPricing(community) -> { currency: 'usd'|'eur'|'gbp', amount: number, display: string }`. `currency` is the lowercase ISO code Stripe expects; `amount` is the whole-unit yearly figure; `display` is UI copy (e.g. `"$60"`). Consumed by `claim-create-checkout` (currency) and `ClaimCommunityDialog` (display).

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/lib/communityPricing.test.js
import { describe, it, expect } from "vitest";
import { communityPricing } from "./communityPricing";

describe("communityPricing", () => {
  it("maps GB to GBP £50", () => {
    expect(communityPricing({ country_code: "GB" })).toEqual({ currency: "gbp", amount: 50, display: "£50" });
  });
  it("maps a eurozone country (FR) to EUR €60", () => {
    expect(communityPricing({ country_code: "FR" })).toEqual({ currency: "eur", amount: 60, display: "€60" });
  });
  it("maps the US to USD $60", () => {
    expect(communityPricing({ country_code: "US" })).toEqual({ currency: "usd", amount: 60, display: "$60" });
  });
  it("is case-insensitive on the country code", () => {
    expect(communityPricing({ country_code: "gb" }).currency).toBe("gbp");
    expect(communityPricing({ country_code: "de" }).currency).toBe("eur");
  });
  it("falls back to USD for unknown, empty, or missing location", () => {
    expect(communityPricing({ country_code: "JP" }).currency).toBe("usd");
    expect(communityPricing({ country_code: "" }).currency).toBe("usd");
    expect(communityPricing({}).currency).toBe("usd");
    expect(communityPricing(null).currency).toBe("usd");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/communityPricing.test.js`
Expected: FAIL — `Failed to resolve import "./communityPricing"`.

- [ ] **Step 3: Write the implementation**

```js
// frontend/src/lib/communityPricing.js
// Maps a community's location to the claim subscription's presentment currency
// and the fixed yearly price shown in the dialog and charged at Checkout. Fixed
// round figures per currency (NOT live FX); USD is the fallback. `currency` is
// the lowercase ISO code Stripe expects; `display` is user-facing copy.

const GBP = { currency: "gbp", amount: 50, display: "£50" };
const EUR = { currency: "eur", amount: 60, display: "€60" };
const USD = { currency: "usd", amount: 60, display: "$60" };

// ISO-3166 alpha-2 codes of euro-area countries.
const EUROZONE = new Set([
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
]);

export function communityPricing(community) {
  const cc = (community?.country_code || "").trim().toUpperCase();
  if (cc === "GB") return { ...GBP };
  if (EUROZONE.has(cc)) return { ...EUR };
  return { ...USD };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/communityPricing.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/communityPricing.js frontend/src/lib/communityPricing.test.js
git commit -m "feat(claim): communityPricing location-to-currency mapping"
```

---

### Task 3: `community.js` wrappers + exports test

**Files:**
- Modify: `frontend/src/lib/community.js`
- Test: `frontend/src/lib/community.test.js:6-10`

**Interfaces:**
- Consumes: `getClient()` (existing).
- Produces: `startClaimCheckout(communityId) -> { url } | { error }`; `openBillingPortal(communityId) -> { url } | { error }`; `fetchMyClaim(communityId) -> { identity_verified_at, subscription_status } | null`. Consumed by `ClaimCommunityDialog` and `Account.vue`.

- [ ] **Step 1: Update the failing exports test**

In `frontend/src/lib/community.test.js`, replace the `expected` array (lines 6-10) with:

```js
    const expected = [
      "fetchDirectory", "fetchBySlug", "createCommunity", "updateCommunity",
      "requestClaimCode", "verifyClaimCode", "requestManualReview",
      "reportCommunity", "fetchMyCommunities",
      "startClaimCheckout", "openBillingPortal", "fetchMyClaim",
    ];
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/community.test.js`
Expected: FAIL — `expected "undefined" to be "function"` for `startClaimCheckout`.

- [ ] **Step 3: Add the three wrappers**

In `frontend/src/lib/community.js`, immediately after the `requestManualReview` function (ends at line 140), add:

```js
// Start the paid claim: the claim-create-checkout Edge Function returns a Stripe
// Checkout URL (subscription mode, 365-day trial, local currency). The caller
// redirects the browser to it. Requires identity_verified_at server-side.
export async function startClaimCheckout(communityId) {
  const { data, error } = await getClient().functions.invoke("claim-create-checkout", {
    body: { community_id: communityId },
  });
  if (error) { console.error("startClaimCheckout failed", error); throw error; }
  return data; // { url } on success, or { error }
}

// Open the Stripe Customer Portal for an owned community so the owner can update
// the card or cancel. Returns a portal URL to redirect to.
export async function openBillingPortal(communityId) {
  const { data, error } = await getClient().functions.invoke("claim-portal", {
    body: { community_id: communityId },
  });
  if (error) { console.error("openBillingPortal failed", error); throw error; }
  return data; // { url } on success, or { error }
}

// The caller's own claim row for a community (RLS returns only their own).
// Lets the dialog resume at the subscribe step after an identity code was
// already verified (e.g. returning from a canceled Checkout).
export async function fetchMyClaim(communityId) {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) return null;
  const { data, error } = await getClient()
    .from("community_claim")
    .select("identity_verified_at, subscription_status")
    .eq("community", communityId).eq("claimer", me).maybeSingle();
  if (error) { console.error("fetchMyClaim failed", error); throw error; }
  return data ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/community.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/community.js frontend/src/lib/community.test.js
git commit -m "feat(claim): startClaimCheckout, openBillingPortal, fetchMyClaim wrappers"
```

---

### Task 4: `claim-verify-code` — identity-only (drop the ownership grant)

**Files:**
- Modify: `supabase/functions/claim-verify-code/index.ts:50-60`

**Interfaces:**
- Produces (new contract): on a correct code, returns `{ status: "verified" }` with **no** `community` and **no** ownership change. `invalid`/`expired` unchanged. The `already_claimed` branch is removed (ownership is no longer decided here).

- [ ] **Step 1: Replace the grant block with an identity-only update**

In `supabase/functions/claim-verify-code/index.ts`, replace lines 50-60 (from the `// Correct code:` comment through the `return json({ status: "verified", community: updated });` line) with:

```ts
    // Correct code: clear the code and mark identity verified. Ownership is NOT
    // granted here anymore (Plan 2) — it is granted only by stripe-webhook once
    // a subscription becomes trialing/active. The client now proceeds to the
    // paid Checkout step.
    await admin.from("community_claim").update({
      identity_verified_at: new Date().toISOString(), code_hash: null, code_expires_at: null,
    }).eq("id", claim.id);

    return json({ status: "verified" });
```

Also update the file's header comment (lines 1-4) to drop the "grant free ownership" wording:

```ts
// claim-verify-code: check the 6-digit code against the stored hash and, on a
// match, mark identity verified. Ownership is NOT granted here (Plan 2) — the
// Stripe webhook grants it once a subscription becomes trialing/active. This
// function only proves the claimer controls the store's on-file email.
```

- [ ] **Step 2: Deploy the function**

Deploy via the Supabase MCP `deploy_edge_function` tool (name `claim-verify-code`, the full modified file). Note: this is safe to deploy before the frontend change ships because the old dialog treats a `verified` response as success and reads `res.community` (now undefined) only to patch the page — that patch is replaced in Task 9, and until then a verified user simply would not gain ownership (correct, since payment is now required).

- [ ] **Step 3: Sanity-check the deploy**

Run via the Supabase MCP `list_edge_functions` tool and confirm `claim-verify-code` shows an updated `updated_at`. (End-to-end verification happens in Task 12 with the full flow.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/claim-verify-code/index.ts
git commit -m "feat(claim): verify-code no longer grants ownership (webhook does)"
```

---

### Task 5: `claim-create-checkout` Edge Function

**Files:**
- Create: `supabase/functions/claim-create-checkout/index.ts`

**Interfaces:**
- Consumes: `community_claim.identity_verified_at` (must be set); `communityPricing` currency logic mirrored server-side from `community.country_code`; secret `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`.
- Produces: `{ url }` (Stripe Checkout redirect) or `{ error, ... }`. The created subscription carries `metadata.community_id` + `metadata.claimer` so `stripe-webhook` can resolve the target.

- [ ] **Step 1: Write the function**

```ts
// claim-create-checkout: create a subscription-mode Stripe Checkout Session for
// an already identity-verified claimer. First year free (365-day trial, card on
// file), billed yearly in the store's local currency. Ownership is granted later
// by stripe-webhook, not here. Success/cancel return to the community profile.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_PRICE_ID = Deno.env.get("STRIPE_PRICE_ID")!;
const SITE = "https://0nefor.one";

const stripe = new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });

// Mirror of frontend/src/lib/communityPricing.js — location to presentment
// currency. Fixed round figures; USD fallback. Kept in sync by hand (small set).
const EUROZONE = new Set([
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
]);
function currencyFor(countryCode: string | null): string {
  const cc = (countryCode || "").trim().toUpperCase();
  if (cc === "GB") return "gbp";
  if (EUROZONE.has(cc)) return "eur";
  return "usd";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "not_authenticated" }, 401);

    const { community_id } = await req.json();
    if (!community_id) return json({ error: "missing_community_id" }, 400);

    // The store must be unclaimed and the caller must have verified identity.
    const { data: community } = await admin.from("community")
      .select("id, owner, slug, country_code").eq("id", community_id).maybeSingle();
    if (!community) return json({ error: "not_found" }, 404);
    if (community.owner) return json({ error: "already_claimed" }, 409);

    const { data: claim } = await admin.from("community_claim")
      .select("id, identity_verified_at, stripe_customer_id")
      .eq("community", community_id).eq("claimer", user.id).maybeSingle();
    if (!claim?.identity_verified_at) return json({ error: "not_verified" }, 403);

    const currency = currencyFor(community.country_code);
    const returnBase = `${SITE}/en/community/${community.slug}`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      currency,
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      subscription_data: {
        trial_period_days: 365,
        metadata: { community_id: String(community_id), claimer: user.id },
      },
      // Reuse the caller's Stripe customer if we already have one; else prefill
      // their email so Checkout creates one.
      ...(claim.stripe_customer_id
        ? { customer: claim.stripe_customer_id }
        : { customer_email: user.email ?? undefined }),
      client_reference_id: String(claim.id),
      success_url: `${returnBase}?claim=success`,
      cancel_url: `${returnBase}?claim=cancel`,
    });

    if (!session.url) return json({ error: "no_session_url" }, 502);
    return json({ url: session.url });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
```

- [ ] **Step 2: Deploy the function**

Deploy via the Supabase MCP `deploy_edge_function` tool (name `claim-create-checkout`, the full file).

- [ ] **Step 3: Verify it rejects an unverified caller**

Until secrets/Price exist (Task 12), a full run isn't possible, but confirm the deploy registered. Run the Supabase MCP `list_edge_functions` tool and confirm `claim-create-checkout` is listed. Full behavior is exercised in Task 12.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/claim-create-checkout/index.ts
git commit -m "feat(claim): claim-create-checkout subscription session (trial, local currency)"
```

---

### Task 6: `stripe-webhook` Edge Function — lifecycle → grant / revert

**Files:**
- Create: `supabase/functions/stripe-webhook/index.ts`

**Interfaces:**
- Consumes: Stripe `customer.subscription.created|updated|deleted` events; `subscription.metadata.community_id` + `.claimer` (set in Task 5); secrets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; `stripe_webhook_event` dedupe table.
- Produces: on `trialing`/`active` → `community.owner`/`verified`/`status` set + claim mirror; on `canceled`/`unpaid` → community reverted to unclaimed (content kept). Always writes `subscription_status`/`current_period_end`/`stripe_customer_id`/`stripe_subscription_id` on the claim.

- [ ] **Step 1: Write the function**

```ts
// stripe-webhook: the ONLY place community ownership is granted or revoked.
// Verifies the Stripe signature (async, Deno crypto), dedupes on event id, then
// maps subscription status to community state:
//   trialing | active  -> owner = claimer, verified = true, status = published
//   canceled | unpaid  -> revert to unclaimed (owner NULL, verified false),
//                         keeping all owner-edited content
//   past_due           -> keep ownership (Stripe is dunning), just record status
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (e) {
    return new Response(`bad signature: ${String(e)}`, { status: 400 });
  }

  // Idempotency: record the event id; a duplicate delivery hits the PK and we
  // acknowledge without reprocessing.
  const { error: dupErr } = await admin.from("stripe_webhook_event")
    .insert({ event_id: event.id, type: event.type });
  if (dupErr) {
    if (dupErr.code === "23505") return new Response("duplicate", { status: 200 });
    return new Response(`ledger error: ${dupErr.message}`, { status: 500 });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const communityId = Number(sub.metadata?.community_id);
    const claimer = sub.metadata?.claimer;
    if (!communityId || !claimer) return new Response("no metadata", { status: 200 });

    const status = sub.status; // trialing | active | past_due | canceled | unpaid | incomplete...
    const periodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;

    // Mirror subscription state onto the claim row (service role bypasses guard).
    await admin.from("community_claim").update({
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
      stripe_subscription_id: sub.id,
      subscription_status: status,
      current_period_end: periodEnd,
    }).eq("community", communityId).eq("claimer", claimer);

    if (status === "trialing" || status === "active") {
      // Grant ownership. WHERE guard: only if unclaimed, or already owned by this
      // same claimer (re-subscribe). First active subscription wins a race.
      await admin.from("community")
        .update({ owner: claimer, verified: true, status: "published", updated_at: new Date().toISOString() })
        .eq("id", communityId).or(`owner.is.null,owner.eq.${claimer}`);
    } else if (status === "canceled" || status === "unpaid") {
      // Lapse: revert to unclaimed but keep content. Only if THIS claimer still
      // owns it (don't clobber a different current owner).
      await admin.from("community")
        .update({ owner: null, verified: false, status: "published", updated_at: new Date().toISOString() })
        .eq("id", communityId).eq("owner", claimer);
    }
    // past_due / incomplete: status recorded above; ownership untouched.
  }

  return new Response("ok", { status: 200 });
});
```

- [ ] **Step 2: Deploy the function WITHOUT JWT verification**

The webhook is called by Stripe, not an authenticated user, so it must skip Supabase's JWT gate. Deploy via the Supabase MCP `deploy_edge_function` tool with name `stripe-webhook`, the full file, and (if the tool exposes it) `verify_jwt: false`. If the MCP tool does not accept that flag, note in the task output that the owner must set **Verify JWT = off** for `stripe-webhook` in the Supabase dashboard (Edge Functions → stripe-webhook → Details) before Task 12.

- [ ] **Step 3: Verify the deploy is listed**

Run the Supabase MCP `list_edge_functions` tool and confirm `stripe-webhook` appears. Signature verification and lifecycle behavior are exercised with the Stripe CLI / test events in Task 12.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "feat(claim): stripe-webhook grants/reverts ownership on subscription lifecycle"
```

---

### Task 7: `claim-portal` Edge Function — Customer Portal

**Files:**
- Create: `supabase/functions/claim-portal/index.ts`

**Interfaces:**
- Consumes: the caller must be the community `owner`; `community_claim.stripe_customer_id`; secret `STRIPE_SECRET_KEY`.
- Produces: `{ url }` (Stripe Customer Portal) or `{ error }`.

- [ ] **Step 1: Write the function**

```ts
// claim-portal: open a Stripe Customer Portal session for the owner of a claimed
// community so they can update their card or cancel (cancel_at_period_end; the
// store reverts at period end via stripe-webhook). Only the current owner may open it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SITE = "https://0nefor.one";

const stripe = new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "not_authenticated" }, 401);

    const { community_id } = await req.json();
    if (!community_id) return json({ error: "missing_community_id" }, 400);

    const { data: community } = await admin.from("community")
      .select("id, owner, slug").eq("id", community_id).maybeSingle();
    if (!community) return json({ error: "not_found" }, 404);
    if (community.owner !== user.id) return json({ error: "not_owner" }, 403);

    const { data: claim } = await admin.from("community_claim")
      .select("stripe_customer_id").eq("community", community_id).eq("claimer", user.id).maybeSingle();
    if (!claim?.stripe_customer_id) return json({ error: "no_customer" }, 409);

    const portal = await stripe.billingPortal.sessions.create({
      customer: claim.stripe_customer_id,
      return_url: `${SITE}/en/community/${community.slug}`,
    });
    return json({ url: portal.url });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
```

- [ ] **Step 2: Deploy the function**

Deploy via the Supabase MCP `deploy_edge_function` tool (name `claim-portal`, full file). JWT verification stays ON (this is a user-authenticated call).

- [ ] **Step 3: Verify the deploy is listed**

Run the Supabase MCP `list_edge_functions` tool and confirm `claim-portal` appears.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/claim-portal/index.ts
git commit -m "feat(claim): claim-portal Stripe Customer Portal session"
```

---

### Task 8: i18n — subscription copy in all 4 locales

**Files:**
- Modify: `frontend/src/locales/en.json`
- Modify: `frontend/src/locales/fr.json`
- Modify: `frontend/src/locales/de.json`
- Modify: `frontend/src/locales/it.json`

**Interfaces:**
- Produces keys under `community.`: `claimSubscribeTitle`, `claimSubscribeBody`, `claimStartFreeYear`, `claimFinalizing`, `claimSubscribeCancelled`, `manageSubscription`, `manageSubBillingError`. `claimSubscribeBody` has a `{price}` param. Consumed by Task 9 (dialog), Task 10 (profile), Task 11 (account).

- [ ] **Step 1: Add the keys to `en.json`**

Find the `community` object's existing `claimTryManual` key and add these siblings (keep valid JSON — add a comma after the preceding key):

```json
      "claimSubscribeTitle": "Start your free year",
      "claimSubscribeBody": "You're verified. Set up your listing free for the first year, then {price}/year. Add a card now, you won't be charged until next year, and you can cancel anytime.",
      "claimStartFreeYear": "Start free year",
      "claimFinalizing": "Finishing setup, this can take a few seconds...",
      "claimSubscribeCancelled": "Checkout cancelled. You can start your free year whenever you're ready.",
      "manageSubscription": "Manage subscription",
      "manageSubBillingError": "Could not open billing. Please try again."
```

- [ ] **Step 2: Add the keys to `fr.json`**

```json
      "claimSubscribeTitle": "Commencez votre annee gratuite",
      "claimSubscribeBody": "Vous etes verifie. Configurez votre fiche gratuitement la premiere annee, puis {price} par an. Ajoutez une carte maintenant, aucun debit avant l'annee prochaine, et annulez a tout moment.",
      "claimStartFreeYear": "Commencer l'annee gratuite",
      "claimFinalizing": "Finalisation en cours, cela peut prendre quelques secondes...",
      "claimSubscribeCancelled": "Paiement annule. Vous pouvez commencer votre annee gratuite quand vous voulez.",
      "manageSubscription": "Gerer l'abonnement",
      "manageSubBillingError": "Impossible d'ouvrir la facturation. Veuillez reessayer."
```

- [ ] **Step 3: Add the keys to `de.json`**

```json
      "claimSubscribeTitle": "Starten Sie Ihr kostenloses Jahr",
      "claimSubscribeBody": "Sie sind verifiziert. Richten Sie Ihren Eintrag im ersten Jahr kostenlos ein, danach {price} pro Jahr. Karte jetzt hinterlegen, keine Abbuchung bis naechstes Jahr, jederzeit kuendbar.",
      "claimStartFreeYear": "Kostenloses Jahr starten",
      "claimFinalizing": "Einrichtung wird abgeschlossen, dies kann einige Sekunden dauern...",
      "claimSubscribeCancelled": "Bezahlung abgebrochen. Sie koennen Ihr kostenloses Jahr jederzeit starten.",
      "manageSubscription": "Abonnement verwalten",
      "manageSubBillingError": "Abrechnung konnte nicht geoeffnet werden. Bitte erneut versuchen."
```

- [ ] **Step 4: Add the keys to `it.json`**

```json
      "claimSubscribeTitle": "Inizia il tuo anno gratuito",
      "claimSubscribeBody": "Sei verificato. Configura la tua scheda gratis il primo anno, poi {price} all'anno. Aggiungi una carta ora, nessun addebito fino al prossimo anno, disdici quando vuoi.",
      "claimStartFreeYear": "Inizia l'anno gratuito",
      "claimFinalizing": "Completamento in corso, puo richiedere alcuni secondi...",
      "claimSubscribeCancelled": "Pagamento annullato. Puoi iniziare il tuo anno gratuito quando vuoi.",
      "manageSubscription": "Gestisci abbonamento",
      "manageSubBillingError": "Impossibile aprire la fatturazione. Riprova."
```

- [ ] **Step 5: Verify JSON validity and key parity**

Run:

```bash
cd frontend && node -e "for (const l of ['en','fr','de','it']) { const o=require('./src/locales/'+l+'.json'); const k=['claimSubscribeTitle','claimSubscribeBody','claimStartFreeYear','claimFinalizing','claimSubscribeCancelled','manageSubscription','manageSubBillingError']; const missing=k.filter(x=>!(x in o.community)); console.log(l, missing.length? 'MISSING '+missing : 'ok'); }"
```

Expected: `en ok`, `fr ok`, `de ok`, `it ok`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/locales/en.json frontend/src/locales/fr.json frontend/src/locales/de.json frontend/src/locales/it.json
git commit -m "feat(claim): i18n subscription copy (4 locales)"
```

---

### Task 9: `ClaimCommunityDialog.vue` — subscribe step

**Files:**
- Modify: `frontend/src/components/community/ClaimCommunityDialog.vue`

**Interfaces:**
- Consumes: `startClaimCheckout`, `fetchMyClaim` from `@/lib/community`; `communityPricing` from `@/lib/communityPricing`; new i18n keys from Task 8; verify-code's new `{ status: "verified" }` (no `community`).
- Produces: after a correct code the dialog shows a `subscribe` step; "Start free year" redirects to Checkout. When the caller already has `identity_verified_at`, the dialog opens directly at `subscribe`. The `claimed` emit is retired (ownership now happens post-Checkout via the webhook + profile poll).

- [ ] **Step 1: Update the script imports and state**

In `frontend/src/components/community/ClaimCommunityDialog.vue`, replace the import on line 8 and add the pricing import:

```js
import { requestClaimCode, verifyClaimCode, requestManualReview, startClaimCheckout, fetchMyClaim } from "@/lib/community";
import { communityPricing } from "@/lib/communityPricing";
```

Update the `step` comment/type on line 19 to include `subscribe`:

```js
const step = ref("intro");          // intro | code | subscribe | manual | done
```

Add a price computed after `canVerify` (after line 27):

```js
const price = computed(() => communityPricing(props.community));
```

- [ ] **Step 2: Resume at subscribe when already identity-verified**

Replace the open watcher (lines 29-34) with a version that checks the caller's existing claim, so returning from a cancelled Checkout (or reopening) skips straight to the subscribe step:

```js
watch(() => props.modelValue, async (open) => {
  if (!open) return;
  step.value = "intro"; errorMsg.value = ""; code.value = "";
  manualReason.value = ""; doneMessage.value = ""; submitting.value = false;
  const session = await getCurrentSession();
  signedIn.value = !!session?.user;
  if (signedIn.value && props.community?.id && props.community.owner == null) {
    try {
      const mine = await fetchMyClaim(props.community.id);
      if (mine?.identity_verified_at) step.value = "subscribe";
    } catch { /* non-fatal: fall back to the intro step */ }
  }
});
```

- [ ] **Step 3: Point verify() at the subscribe step and add startCheckout()**

Replace the `verify()` function body's success branch and add `startCheckout()`. Change lines 68-72 (the `if (res.status === "verified") { ... }` block) to:

```js
    if (res.status === "verified") {
      step.value = "subscribe";
    } else if (res.status === "invalid") {
```

(Leave the remaining `else if` branches for `invalid`/`expired`/`already_claimed` unchanged.) Then add this function immediately after `verify()` (after line 84):

```js
async function startCheckout() {
  if (submitting.value) return;
  submitting.value = true; errorMsg.value = "";
  try {
    const res = await startClaimCheckout(props.community.id);
    if (res?.url) { window.location.href = res.url; return; } // leaves the page
    if (res?.error === "already_claimed") { errorMsg.value = t("community.claimExpiredCode"); emit("stale"); }
    else if (res?.error === "not_verified") { step.value = "code"; errorMsg.value = t("community.claimExpiredCode"); }
    else errorMsg.value = res?.error ?? "Could not start checkout.";
  } catch (e) { errorMsg.value = e.message ?? "Could not start checkout."; }
  finally { submitting.value = false; }
}
```

- [ ] **Step 4: Add the subscribe step to the template**

In the dialog body, add a subscribe block between the code step (ends line 142) and the manual step (starts line 144):

```html
        <!-- Subscribe (first year free) -->
        <template v-else-if="step === 'subscribe'">
          <p class="claim-body">{{ t('community.claimSubscribeBody', { price: price.display }) }}</p>
        </template>

```

Update the header title (line 113) so the subscribe step reads correctly:

```html
        <span class="dlg-head__title">{{ step === 'manual' ? t('community.claimManualTitle') : (step === 'subscribe' ? t('community.claimSubscribeTitle') : t('community.claimTitle')) }}</span>
```

- [ ] **Step 5: Add the subscribe footer button**

In the footer's `v-else` block, add a subscribe button after the `code`-step verify button (after line 188):

```html
          <button v-else-if="step === 'subscribe'" class="btn-submit" :disabled="submitting" @click="startCheckout">
            <template v-if="submitting"><v-progress-circular indeterminate size="16" width="2" color="white" /></template>
            <template v-else><v-icon icon="mdi-credit-card-outline" size="16" />{{ t('community.claimStartFreeYear') }}</template>
          </button>
```

- [ ] **Step 6: Verify it compiles in the browser**

Ensure the dev server is running (preview_start with the `.claude/launch.json` config name), then reload and read the console for errors. The dialog change is exercised end-to-end in Task 12.

Run (browser tools): navigate to the dev URL, `read_console_messages` with `onlyErrors: true`.
Expected: no new compile/runtime errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/community/ClaimCommunityDialog.vue
git commit -m "feat(claim): dialog subscribe step redirects to Stripe Checkout"
```

---

### Task 10: `CommunityProfile.vue` — Checkout return handling

**Files:**
- Modify: `frontend/src/components/Pages/App/CommunityProfile.vue`

**Interfaces:**
- Consumes: `route.query.claim` = `success` | `cancel`; existing `fetchBySlug`, `load()`.
- Produces: on `success`, polls until the webhook grants ownership then shows the owned state; on `cancel`, reopens the claim dialog (which resumes at the subscribe step via Task 9). The retired `onClaimed` handler is replaced.

- [ ] **Step 1: Replace onClaimed with the finalize/poll flow**

In `frontend/src/components/Pages/App/CommunityProfile.vue`, replace the `onClaimed` function (lines 180-183) with a finalize poller and a cancel handler:

```js
// After returning from Stripe Checkout with ?claim=success, the subscription
// webhook may not have granted ownership yet (it fires within seconds). Poll the
// row a few times until owner flips, then show the owned state.
const finalizing = ref(false);
async function finalizeClaim() {
  finalizing.value = true;
  for (let i = 0; i < 8; i++) {
    const fresh = await fetchBySlug(route.params.slug);
    if (fresh) {
      Object.assign(community.value ?? (community.value = fresh), fresh);
      if (fresh.owner) { finalizing.value = false; return; }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  finalizing.value = false; // gave up waiting; a manual refresh will catch up
}
```

- [ ] **Step 2: Read the claim query param on mount**

Extend the `onMounted` hook (lines 52-59) to react to the return param. Replace it with:

```js
onMounted(async () => {
  const session = await getCurrentSession();
  currentUserId.value = session?.user?.id ?? null;
  unsub = onAuthChange((auth) => {
    currentUserId.value = auth?.user?.id ?? null;
  });
  await load();

  const claimResult = route.query.claim;
  if (claimResult === "success") {
    finalizeClaim();
  } else if (claimResult === "cancel") {
    claimOpen.value = true; // dialog resumes at the subscribe step (identity kept)
  }
});
```

- [ ] **Step 3: Show a finalizing banner and drop the retired claim handler**

In the template, remove `@claimed="onClaimed"` from the `ClaimCommunityDialog` line (line 314) so it reads:

```html
      <ClaimCommunityDialog v-model="claimOpen" :community="community" @stale="onStale" />
```

Add a finalizing banner just inside the profile block, right after the CTA row's closing `</div>` (after line 311, before the dialogs):

```html
      <div v-if="finalizing" class="cp-finalizing">
        <v-progress-circular indeterminate size="16" width="2" color="var(--c-trade)" />
        {{ t('community.claimFinalizing') }}
      </div>
```

Add its style inside the `<style scoped>` block (after the `.cp-cta` rules, near line 470):

```css
.cp-finalizing {
  display: flex; align-items: center; gap: 8px;
  margin: 0 20px; padding: 12px 16px; border-radius: 12px;
  background: color-mix(in srgb, var(--c-trade) 10%, transparent);
  color: var(--c-trade); font-size: 13px; font-weight: 700;
}
```

- [ ] **Step 4: Verify it compiles and the success poll runs**

With the dev server running, navigate to an existing profile URL with `?claim=success` appended and confirm the finalizing banner renders and no console errors appear. (A real ownership flip needs the webhook; that is Task 12.)

Run (browser tools): navigate to `<devurl>/en/community/<some-slug>?claim=success`, `read_page` to confirm the banner text, `read_console_messages` `onlyErrors: true`.
Expected: banner visible, no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Pages/App/CommunityProfile.vue
git commit -m "feat(claim): profile handles Stripe Checkout success/cancel return"
```

---

### Task 11: `Account.vue` — Manage subscription link

**Files:**
- Modify: `frontend/src/components/Pages/App/Account.vue`

**Interfaces:**
- Consumes: `openBillingPortal` from `@/lib/community`; `community.manageSubscription` / `community.manageSubBillingError` from Task 8.
- Produces: a "Manage subscription" action on each **verified** owned community row that redirects to the Stripe Customer Portal.

- [ ] **Step 1: Import the wrapper and add a handler**

In `frontend/src/components/Pages/App/Account.vue`, extend the community import (line 8):

```js
import { fetchMyCommunities, openBillingPortal } from "@/lib/community";
```

Add a handler near the other community functions (after `onCommunitySaved`, around line 201):

```js
const billingBusy = ref(false);
async function manageSubscription(row) {
  if (billingBusy.value) return;
  billingBusy.value = true;
  try {
    const res = await openBillingPortal(row.id);
    if (res?.url) { window.location.href = res.url; return; }
    alert(t("community.manageSubBillingError"));
  } catch {
    alert(t("community.manageSubBillingError"));
  } finally {
    billingBusy.value = false;
  }
}
```

(If `ref` is not already imported in this file's `<script setup>`, add it to the existing `vue` import.)

- [ ] **Step 2: Add the Manage subscription control to verified rows**

In the community row template, add a portal button between the "manage" router-link (ends line 348) and the edit button (starts line 350), shown only for verified (owned + subscribed) rows:

```html
          <button
            v-if="row.verified"
            type="button"
            class="shrink-0 text-xs font-semibold"
            style="color: var(--c-muted)"
            :disabled="billingBusy"
            @click="manageSubscription(row)"
          >{{ t('community.manageSubscription') }}</button>
```

- [ ] **Step 3: Verify it compiles**

With the dev server running, navigate to the Account page and confirm no console errors and that the "Manage subscription" text appears on any verified community row.

Run (browser tools): navigate to `<devurl>/en/account` (sign-in state permitting), `read_console_messages` `onlyErrors: true`.
Expected: no errors. (Full portal redirect needs live Stripe; Task 12.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Pages/App/Account.vue
git commit -m "feat(claim): Manage subscription link on owned communities"
```

---

### Task 12: Integration sweep, cutover, and Stripe smoke test

**Files:**
- No new files. Runs the full suite, deploys, and validates the end-to-end paid flow.

- [ ] **Step 1: Run the full unit suite**

Run: `cd frontend && npx vitest run`
Expected: all suites pass (Plan 1's 158 tests + `communityPricing` 5 + the updated `community` exports test).

- [ ] **Step 2: Confirm all Edge Functions are deployed**

Run the Supabase MCP `list_edge_functions` tool. Expected to include: `claim-request-code`, `claim-verify-code` (updated), `claim-create-checkout`, `stripe-webhook`, `claim-portal`.

- [ ] **Step 3: Owner sets Stripe up (blocking, human step)**

Confirm with the owner (do not do this yourself — it needs the Stripe dashboard and secrets):
  1. Test-mode Product + annual Price ($60 USD default, `currency_options` €60 EUR / £50 GBP) created; Price id saved.
  2. Supabase secrets set: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`.
  3. `stripe-webhook` has **Verify JWT = off** in the dashboard.
  4. Webhook endpoint registered at the deployed `stripe-webhook` URL for `customer.subscription.created|updated|deleted`; signing secret saved as `STRIPE_WEBHOOK_SECRET`.

- [ ] **Step 4: End-to-end test on the test store (community 3113)**

With the frontend deployed (or dev server), as a signed-in user:
  1. Open store 3113's profile, click Claim, request the code (goes to the test email on file), verify it. Confirm the dialog advances to the **subscribe** step showing the local price.
  2. Click "Start free year". Confirm redirect to Stripe Checkout showing a $0.00-due-today annual plan with a 1-year trial, in the expected currency.
  3. Complete Checkout with test card `4242 4242 4242 4242`.
  4. On return (`?claim=success`), confirm the finalizing banner shows, then the page flips to owned + Verified within a few seconds.
  5. In Supabase (`execute_sql`), confirm `community` row 3113 has `owner` set + `verified = true`, and `community_claim` has `subscription_status = 'trialing'`, a `stripe_subscription_id`, and `stripe_customer_id`.

- [ ] **Step 5: Test the portal and the lapse revert**

  1. On the Account page, click "Manage subscription" on store 3113 → confirm the Stripe Customer Portal opens for that customer.
  2. In the Stripe dashboard (or via Stripe CLI `stripe trigger customer.subscription.deleted` against that subscription), cancel/delete the subscription.
  3. Confirm the webhook reverts community 3113 to `owner = null`, `verified = false`, `status = 'published'`, and that the bio/links you set are **still present** (content kept). Verify via `execute_sql`.
  4. Re-deliver the same webhook event from the Stripe dashboard and confirm `stripe_webhook_event` dedupes it (community state unchanged; endpoint returns 200).

- [ ] **Step 6: Reset the test store for production**

After the smoke test, reset store 3113 to a clean production state (owner-confirmed): clear `owner`/`verified`, delete its `community_claim` row, restore its real on-file email, and cancel any lingering test subscription in Stripe. (This mirrors the Plan 1 test-store cleanup already offered.)

- [ ] **Step 7: Final commit / branch wrap-up**

```bash
git status
git log --oneline main..HEAD
```

Then open the PR for the feature branch (subscription work) per the repo's finishing-a-development-branch flow.

---

## Self-Review

**Spec coverage:**
- Identity-before-subscribe → Task 4 (verify-only) + Task 5 (`not_verified` guard). ✓
- Ownership webhook-only → Task 4 removes the grant; Task 6 is the sole grantor. ✓
- First year free / card up front → Task 5 `trial_period_days: 365`, default `payment_method_collection`. ✓
- Local currency → Task 2 (`communityPricing`) + Task 5 (`currency` param, server mirror). ✓
- Lapse revert keeping content → Task 6 `canceled`/`unpaid` branch (only touches owner/verified/status). ✓
- `past_due` keeps ownership → Task 6 (status recorded, ownership untouched). ✓
- Idempotency → Task 1 `stripe_webhook_event` + Task 6 dedupe insert. ✓
- Race guard → Task 6 `owner.is.null,owner.eq.<claimer>`. ✓
- Multi-step dialog subscribe step + manual fallback (kept from Plan 1) → Task 9. ✓
- Success/cancel return → Task 10. ✓
- Manage subscription link → Task 11 + Task 7 portal. ✓
- `community.js` wrappers (`startClaimCheckout`, `openBillingPortal`) → Task 3. ✓
- `communityPricing.js` unit-tested → Task 2. ✓
- Secrets never in repo → Global Constraints + Task 12 Step 3 (owner-run). ✓

**Placeholder scan:** every code step carries full code; no TBD/TODO. SQL, edge functions, and Vue diffs are literal. ✓

**Type consistency:** `communityPricing(community) -> { currency, amount, display }` used identically in Task 2/9; the server `currencyFor` in Task 5 returns the same currency strings; `subscription_data.metadata` keys `community_id`/`claimer` written in Task 5 are read verbatim in Task 6; `startClaimCheckout`/`openBillingPortal`/`fetchMyClaim` signatures in Task 3 match their call sites in Tasks 9/10/11. ✓
