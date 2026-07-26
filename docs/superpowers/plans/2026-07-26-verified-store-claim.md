# Verified Store Claim (Plan 1 — email-code verification) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the instant, proof-free store claim with an email-code identity check: a claimer must enter a 6-digit code sent to the store's official on-file email before they become the (still free, this plan) verified owner.

**Architecture:** A new `community_claim` state row and a private `community_private.claim_email` table (RLS-hidden, seeded from `data/stores.json`). Two Supabase Edge Functions issue and verify the code (`claim-request-code`, `claim-verify-code`); the verify function, running as service role, is the only path that sets `owner`/`verified`. The old `claim_community` RPC is disabled. The frontend `ClaimCommunityDialog` becomes a two-step (verify → done) flow with a manual-review fallback.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions on Deno), Resend (transactional email), Vue 3 `<script setup>` + Vuetify 3, vue-i18n (4 locales), vitest. Base domain `https://0nefor.one`, project ref `sxteuctysfiwripnaozi`.

## Global Constraints

Copied from the spec and the existing community codebase; every task implicitly includes these.

- **Payments are NOT in this plan.** After verification the claimer becomes owner **for free**. The Stripe subscription gate is Plan 2 (`verified-paid-claim-subscription`). Do not add Stripe here.
- **Ownership is set server-side only.** `owner`/`verified`/`status` are written exclusively by the `claim-verify-code` Edge Function (service role). No client-role path may set them. The existing `community_enforce_admin_fields` trigger keeps `verified` admin/service-only.
- **The store email is secret.** It lives in `community_private`, RLS denies all client roles, and it is **never returned to the browser** (not even masked beyond "the email on file").
- **Locales at parity:** every user-facing string is added to all four of `frontend/src/locales/{en,fr,de,it}.json`. `en` is the source of truth. **No em dashes** in copy (use a period, comma, colon, or "(...)").
- **Supabase access** from the browser goes through `getClient()` from `@/lib/supabaseClient`; Edge Functions are invoked with `getClient().functions.invoke(name, { body })`.
- **RLS convention:** every new table `ENABLE ROW LEVEL SECURITY`; end every migration with `NOTIFY pgrst, 'reload schema';`. PKs are `bigint GENERATED ALWAYS AS IDENTITY`. Guard re-runnable statements with `IF NOT EXISTS` / `DROP ... IF EXISTS`.
- **Migrations** are named `supabase/migrations/YYYYMMDD_<name>.sql` and applied to production via the Supabase MCP `apply_migration` (project `sxteuctysfiwripnaozi`).
- **Edge Functions** are committed under `supabase/functions/<name>/index.ts` and deployed via the Supabase MCP `deploy_edge_function`. Secrets (`RESEND_API_KEY`) are set in the Supabase dashboard, never committed.
- **Tests:** vitest, run with `npm --prefix frontend run test`. Pure logic lives in `frontend/src/lib/*.js` with a colocated `*.test.js`. SQL, Edge Functions, and Vue SFCs are **not** unit-tested here — they use a build-and-verify cycle (rolled-back SQL smoke test, function invoke, HTTP compile check, browser check).
- **Vuetify quirk:** Tailwind all-sides spacing (`p-4`), `.5` steps (`py-1.5`), and arbitrary values compute to `0px` under Vuetify; prefix with `!` (e.g. `!py-1.5`) to render. Use `--c-*` tokens from `frontend/src/assets/main.css` for color; never hardcode theme colors.
- **Do NOT** read, print, modify, or commit `discord-bot/.env` or `discord-bot/v2-premium/`.

---

## File Structure

- **Create** `supabase/migrations/20260726_community_claim.sql` — `community_claim` + `community_private` tables, RLS, indexes; revoke the old `claim_community` RPC.
- **Create** `supabase/functions/claim-request-code/index.ts` — issue + email a code.
- **Create** `supabase/functions/claim-verify-code/index.ts` — verify a code, grant ownership.
- **Create** `supabase/functions/_shared/cors.ts` — shared CORS headers.
- **Create** `frontend/scripts/seed-community-private.mjs` — seed `community_private.claim_email` from `data/stores.json`; **Modify** `frontend/package.json` (add `community:seed-private`).
- **Create** `frontend/src/lib/claimState.js` (+ `.test.js`) — pure UI-state + code-format helpers.
- **Modify** `frontend/src/lib/community.js` — replace `claimCommunity` with `requestClaimCode` / `verifyClaimCode` / `requestManualReview`.
- **Modify** `frontend/src/components/community/ClaimCommunityDialog.vue` — two-step verify flow + manual-review fallback.
- **Modify** `frontend/src/components/Pages/App/CommunityProfile.vue` — the dialog already emits `claimed`; adjust the prop passed (drop `current-user-id`, no longer needed) and keep `onClaimed`.
- **Modify** `frontend/src/locales/{en,fr,de,it}.json` — new `community.claim*` strings.

**Dependency order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9.

---

### Task 1: Migration — `community_claim` + `community_private` + RLS, disable `claim_community`

**Files:**
- Create: `supabase/migrations/20260726_community_claim.sql`

**Interfaces:**
- Produces: table `community_claim` (id, community, claimer, identity_verified_at, code_hash, code_expires_at, code_attempts, manual_review_reason, manual_review_at, created_at); table `community_private` (community PK, claim_email); revoked `claim_community`. Consumed by Tasks 3, 4, 5.

- [ ] **Step 1: Write the migration**

```sql
-- Verified store claim (Plan 1): claim state + private store email, and the
-- retirement of the instant free claim_community RPC.

CREATE TABLE IF NOT EXISTS community_claim (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community             bigint NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  claimer               uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_verified_at  timestamptz,
  code_hash             text,
  code_expires_at       timestamptz,
  code_attempts         smallint NOT NULL DEFAULT 0,
  manual_review_reason  text CHECK (manual_review_reason IS NULL OR char_length(manual_review_reason) <= 500),
  manual_review_at      timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community, claimer)
);

CREATE INDEX IF NOT EXISTS idx_community_claim_claimer ON community_claim (claimer);

ALTER TABLE community_claim ENABLE ROW LEVEL SECURITY;

-- A claimer sees and inserts only their own claim rows. The code_hash column is
-- returned to them too, but it is a one-way hash so that is safe; the plaintext
-- code only ever exists in the email. Updates/writes to ownership happen through
-- the service-role Edge Functions, not client policies.
DROP POLICY IF EXISTS "community_claim_select_own" ON community_claim;
CREATE POLICY "community_claim_select_own" ON community_claim FOR SELECT
  USING (claimer = auth.uid());

DROP POLICY IF EXISTS "community_claim_insert_own" ON community_claim;
CREATE POLICY "community_claim_insert_own" ON community_claim FOR INSERT
  WITH CHECK (claimer = auth.uid());

-- ── Private store email (RLS denies every client role) ──────────────────────
CREATE TABLE IF NOT EXISTS community_private (
  community    bigint PRIMARY KEY REFERENCES community(id) ON DELETE CASCADE,
  claim_email  text
);

ALTER TABLE community_private ENABLE ROW LEVEL SECURITY;
-- No policies = no anon/authenticated access at all. Only service_role (which
-- bypasses RLS) can read it, which is exactly the Edge Functions.
REVOKE ALL ON community_private FROM anon, authenticated;

-- ── Retire the instant free claim ───────────────────────────────────────────
-- Keep the function object (dropping it can 404 a stale client mid-deploy) but
-- remove the grant so it can no longer be executed. The new flow replaces it.
REVOKE EXECUTE ON FUNCTION claim_community(bigint) FROM authenticated;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Validate in a rolled-back transaction (persist nothing)**

Use the Supabase MCP `execute_sql` (project `sxteuctysfiwripnaozi`), wrapping the table DDL + a smoke insert in `BEGIN; ... ROLLBACK;`:

```sql
BEGIN;
CREATE TABLE community_claim ( id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community bigint NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  claimer uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_verified_at timestamptz, code_hash text, code_expires_at timestamptz,
  code_attempts smallint NOT NULL DEFAULT 0, manual_review_reason text,
  manual_review_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community, claimer) );
CREATE TABLE community_private ( community bigint PRIMARY KEY REFERENCES community(id) ON DELETE CASCADE, claim_email text );
INSERT INTO community_private (community, claim_email) VALUES (1, 'x@example.com') RETURNING community;
ROLLBACK;
SELECT to_regclass('public.community_claim') IS NULL AS claim_gone,
       to_regclass('public.community_private') IS NULL AS priv_gone;
```
Expected: the insert returns `community=1`; after rollback `claim_gone=true, priv_gone=true` (both tables are new, so they vanish).

- [ ] **Step 3: Apply the migration**

Apply via the Supabase MCP `apply_migration` (name `community_claim`, project `sxteuctysfiwripnaozi`) with the full Step-1 body. Expected: `{ "success": true }`.

- [ ] **Step 4: Verify live objects**

Run via `execute_sql`:
```sql
SELECT to_regclass('public.community_claim') AS c, to_regclass('public.community_private') AS p,
  has_function_privilege('authenticated', 'claim_community(bigint)', 'EXECUTE') AS auth_can_claim;
```
Expected: `c=community_claim`, `p=community_private`, `auth_can_claim=false`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260726_community_claim.sql
git commit -m "feat(claim): add community_claim + community_private, disable instant claim RPC"
```

---

### Task 2: Claim UI-state + code-format helpers (`claimState.js`) — TDD

**Files:**
- Create: `frontend/src/lib/claimState.js`
- Test: `frontend/src/lib/claimState.test.js`

**Interfaces:**
- Produces: `deriveClaimState(community, currentUserId) => 'owned_by_me' | 'owned_by_other' | 'claimable'`; `isValidCode(input) => boolean` (exactly 6 ASCII digits). Consumed by Task 8.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { deriveClaimState, isValidCode } from "./claimState";

describe("deriveClaimState", () => {
  it("is claimable when owner is null", () => {
    expect(deriveClaimState({ owner: null }, "u1")).toBe("claimable");
  });
  it("is owned_by_me when the viewer owns it", () => {
    expect(deriveClaimState({ owner: "u1" }, "u1")).toBe("owned_by_me");
  });
  it("is owned_by_other when someone else owns it", () => {
    expect(deriveClaimState({ owner: "u2" }, "u1")).toBe("owned_by_other");
  });
  it("treats a null community as claimable-safe (no crash)", () => {
    expect(deriveClaimState(null, "u1")).toBe("claimable");
  });
});

describe("isValidCode", () => {
  it("accepts exactly six digits", () => {
    expect(isValidCode("012345")).toBe(true);
  });
  it("rejects wrong length or non-digits", () => {
    expect(isValidCode("12345")).toBe(false);
    expect(isValidCode("1234567")).toBe(false);
    expect(isValidCode("12a456")).toBe(false);
    expect(isValidCode("")).toBe(false);
    expect(isValidCode(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm --prefix frontend run test -- claimState`
Expected: FAIL, "Failed to resolve import ./claimState".

- [ ] **Step 3: Write the implementation**

```js
// Pure helpers for the claim UI. Kept out of the dialog so both the dialog and
// its tests share one source of truth.
export function deriveClaimState(community, currentUserId) {
  const owner = community?.owner ?? null;
  if (!owner) return "claimable";
  return owner === currentUserId ? "owned_by_me" : "owned_by_other";
}

export function isValidCode(input) {
  return typeof input === "string" && /^[0-9]{6}$/.test(input);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm --prefix frontend run test -- claimState`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/claimState.js frontend/src/lib/claimState.test.js
git commit -m "feat(claim): add claim-state + code-format helpers"
```

---

### Task 3: Seed private store emails (`seed-community-private.mjs`)

**Files:**
- Create: `frontend/scripts/seed-community-private.mjs`
- Modify: `frontend/package.json` (add `"community:seed-private"`)

**Interfaces:**
- Consumes: `data/stores.json` (each store has `id`, `email`), the live `community` table (`ots_store_id` links back to `store.id`). Requires `SUPABASE_SERVICE_ROLE_KEY` to write `community_private`.
- Produces: idempotent upsert of `{ community: <id>, claim_email: <store.email> }` for every published store row that has an email.

- [ ] **Step 1: Write the script**

```js
/**
 * seed-community-private.mjs
 *
 * Fills community_private.claim_email from the OTS source (data/stores.json),
 * joining stores.json `id` -> community.ots_store_id. Idempotent (upsert on the
 * community PK). Needs a service-role key because community_private denies all
 * client roles.
 *
 * Usage:
 *   node scripts/seed-community-private.mjs --dry-run
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-community-private.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORES = resolve(__dirname, "../../data/stores.json");

const DRY = process.argv.includes("--dry-run");
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://sxteuctysfiwripnaozi.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && !SERVICE_KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY to write. Use --dry-run to preview.");
  process.exit(1);
}
const db = DRY ? null : createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function main() {
  const raw = JSON.parse(await readFile(STORES, "utf8"));
  const stores = (raw.data ?? raw).filter(s => s?.id && s?.email);
  const byOts = new Map(stores.map(s => [String(s.id), s.email]));
  console.log(`stores with email: ${byOts.size} | dry-run: ${DRY}`);
  if (DRY) { console.log("sample:", [...byOts.entries()][0]); return; }

  // Page through community rows to map ots_store_id -> community.id.
  const CHUNK = 1000;
  let from = 0, rows = [];
  for (;;) {
    const { data, error } = await db.from("community")
      .select("id, ots_store_id").not("ots_store_id", "is", null)
      .range(from, from + CHUNK - 1);
    if (error) { console.error("read failed", error); process.exit(1); }
    if (!data.length) break;
    for (const c of data) {
      const email = byOts.get(String(c.ots_store_id));
      if (email) rows.push({ community: c.id, claim_email: email });
    }
    from += CHUNK;
    if (data.length < CHUNK) break;
  }

  console.log(`upserting ${rows.length} private-email rows`);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("community_private").upsert(rows.slice(i, i + 500), { onConflict: "community" });
    if (error) { console.error("upsert failed at", i, error); process.exit(1); }
  }
  console.log("done.");
}
main();
```

- [ ] **Step 2: Add the npm script**

In `frontend/package.json` `scripts`, after `"data:ots"`, add:
```json
"community:seed-private": "node scripts/seed-community-private.mjs",
```
(Stage only this line — the file has unrelated pre-existing edits is NOT expected here, but confirm with `git diff` before adding.)

- [ ] **Step 3: Dry-run verify**

Run: `npm --prefix frontend run community:seed-private -- --dry-run`
Expected: prints `stores with email: <N> | dry-run: true` and a `[id, email]` sample. Writes nothing.

- [ ] **Step 4: Live seed (owner provides the key), then confirm**

Run (owner): `SUPABASE_SERVICE_ROLE_KEY=… npm --prefix frontend run community:seed-private`
Then via MCP `execute_sql`: `SELECT count(*) FROM community_private WHERE claim_email IS NOT NULL;`
Expected: a few thousand (matches the count of stores with an email). Re-run → same count (idempotent).

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/seed-community-private.mjs frontend/package.json
git commit -m "feat(claim): seed private store emails from OTS data"
```

---

### Task 4: `claim-request-code` Edge Function

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/claim-request-code/index.ts`

**Interfaces:**
- Consumes: the caller's JWT (from the `Authorization` header), `community_private.claim_email`, `community_claim`, `RESEND_API_KEY`.
- Produces: on success `{ status: "sent" }` (and a `community_claim` row with a fresh `code_hash`/`code_expires_at`); when the store has no email `{ status: "needs_manual_review" }`; on rate-limit `{ status: "rate_limited" }`. Consumed by Task 6.

- [ ] **Step 1: Write the shared CORS helper**

```ts
// supabase/functions/_shared/cors.ts
export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
```

- [ ] **Step 2: Write the function**

```ts
// supabase/functions/claim-request-code/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = "One for One <noreply@0nefor.one>";
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    // Admin client (service role) does the privileged reads/writes; a second
    // client scoped to the caller's JWT resolves who they are.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const asUser = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false }, global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "not_authenticated" }, 401);

    const { community_id } = await req.json();
    if (!community_id) return json({ error: "missing_community_id" }, 400);

    // Only unclaimed stores are claimable.
    const { data: community } = await admin.from("community")
      .select("id, owner").eq("id", community_id).maybeSingle();
    if (!community) return json({ error: "not_found" }, 404);
    if (community.owner) return json({ error: "already_claimed" }, 409);

    const { data: priv } = await admin.from("community_private")
      .select("claim_email").eq("community", community_id).maybeSingle();
    if (!priv?.claim_email) return json({ status: "needs_manual_review" });

    // Upsert the claim row; rate-limit resends.
    const { data: existing } = await admin.from("community_claim")
      .select("id, code_expires_at").eq("community", community_id).eq("claimer", user.id).maybeSingle();
    if (existing?.code_expires_at &&
        Date.now() < new Date(existing.code_expires_at).getTime() - (CODE_TTL_MS - RESEND_COOLDOWN_MS)) {
      return json({ status: "rate_limited" });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await sha256(code);
    const code_expires_at = new Date(Date.now() + CODE_TTL_MS).toISOString();
    const row = { community: community_id, claimer: user.id, code_hash, code_expires_at, code_attempts: 0 };
    const { error: upErr } = await admin.from("community_claim").upsert(row, { onConflict: "community,claimer" });
    if (upErr) return json({ error: "db_error", detail: upErr.message }, 500);

    // Send via Resend. The address is never returned to the client.
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: priv.claim_email,
        subject: "Your One for One store verification code",
        text: `Your verification code is ${code}. It expires in 10 minutes.\n\nIf you did not request this, ignore this email.`,
      }),
    });
    if (!emailRes.ok) return json({ error: "email_failed", detail: await emailRes.text() }, 502);

    return json({ status: "sent" });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
```

- [ ] **Step 3: Deploy + set the secret**

Set `RESEND_API_KEY` in the Supabase dashboard (Edge Functions → Secrets) — owner action, never in the repo. Deploy via the Supabase MCP `deploy_edge_function` (project `sxteuctysfiwripnaozi`, slug `claim-request-code`, the file body, `verify_jwt: true`). Expected: `ACTIVE`.

- [ ] **Step 4: Verify (manual)**

With a signed-in session token, invoke against an unclaimed store that has a private email → `{ status: "sent" }` and a real email arrives; against a store with no `community_private` row → `{ status: "needs_manual_review" }`; a second immediate call → `{ status: "rate_limited" }`. Confirm the `community_claim` row exists with a non-null `code_hash` via `execute_sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/cors.ts supabase/functions/claim-request-code/index.ts
git commit -m "feat(claim): claim-request-code edge function (Resend email code)"
```

---

### Task 5: `claim-verify-code` Edge Function (grants ownership)

**Files:**
- Create: `supabase/functions/claim-verify-code/index.ts`

**Interfaces:**
- Consumes: caller JWT, the `community_claim` row (`code_hash`, `code_expires_at`, `code_attempts`).
- Produces: on success `{ status: "verified", community: <row> }` after setting `identity_verified_at`, and (this plan) `owner=caller`, `verified=true`, `status='published'` on the community; on mismatch `{ status: "invalid", attempts_left: N }`; on expiry `{ status: "expired" }`. Consumed by Task 6.

- [ ] **Step 1: Write the function**

```ts
// supabase/functions/claim-verify-code/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cors } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_ATTEMPTS = 5;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const asUser = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false }, global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "not_authenticated" }, 401);

    const { community_id, code } = await req.json();
    if (!community_id || !/^[0-9]{6}$/.test(code ?? "")) return json({ error: "bad_input" }, 400);

    const { data: claim } = await admin.from("community_claim")
      .select("id, code_hash, code_expires_at, code_attempts")
      .eq("community", community_id).eq("claimer", user.id).maybeSingle();
    if (!claim?.code_hash) return json({ status: "expired" });
    if (Date.now() > new Date(claim.code_expires_at).getTime()) return json({ status: "expired" });
    if (claim.code_attempts >= MAX_ATTEMPTS) return json({ status: "expired" });

    if (await sha256(code) !== claim.code_hash) {
      const attempts = claim.code_attempts + 1;
      await admin.from("community_claim").update({ code_attempts: attempts }).eq("id", claim.id);
      return json({ status: "invalid", attempts_left: Math.max(0, MAX_ATTEMPTS - attempts) });
    }

    // Correct code: mark identity verified and (Plan 1) grant free ownership.
    // The WHERE owner IS NULL guard makes the first claimer win a race.
    await admin.from("community_claim").update({
      identity_verified_at: new Date().toISOString(), code_hash: null, code_expires_at: null,
    }).eq("id", claim.id);

    const { data: updated } = await admin.from("community")
      .update({ owner: user.id, verified: true, status: "published", updated_at: new Date().toISOString() })
      .eq("id", community_id).is("owner", null).select().maybeSingle();
    if (!updated) return json({ status: "already_claimed" }, 409);

    return json({ status: "verified", community: updated });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
```

- [ ] **Step 2: Deploy**

Deploy via the Supabase MCP `deploy_edge_function` (slug `claim-verify-code`, `verify_jwt: true`). Expected: `ACTIVE`.

- [ ] **Step 3: Verify (manual)**

Continuing from Task 4's issued code: a wrong code → `{ status: "invalid", attempts_left: 4 }`; the right code → `{ status: "verified", community: {...owner: <me>, verified: true} }`; a replay of the same code → `{ status: "expired" }` (hash cleared). Confirm via `execute_sql` that the community row now has `owner`, `verified=true`, `status='published'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/claim-verify-code/index.ts
git commit -m "feat(claim): claim-verify-code edge function grants verified ownership"
```

---

### Task 6: Data-access wrappers (`community.js`)

**Files:**
- Modify: `frontend/src/lib/community.js`

**Interfaces:**
- Consumes: `getClient().functions.invoke` for the two Edge Functions; `getClient()` for the manual-review insert.
- Produces:
  - `requestClaimCode(communityId) => Promise<{ status }>`
  - `verifyClaimCode(communityId, code) => Promise<{ status, community?, attempts_left? }>`
  - `requestManualReview(communityId, reason) => Promise<void>` (updates the caller's `community_claim` row with `manual_review_reason`; inserts the row first if absent).
  - Removes `claimCommunity`. Consumed by Task 8.

- [ ] **Step 1: Replace `claimCommunity`**

In `frontend/src/lib/community.js`, delete the `claimCommunity` function and add:

```js
export async function requestClaimCode(communityId) {
  const { data, error } = await getClient().functions.invoke("claim-request-code", {
    body: { community_id: communityId },
  });
  if (error) { console.error("requestClaimCode failed", error); throw error; }
  return data;
}

export async function verifyClaimCode(communityId, code) {
  const { data, error } = await getClient().functions.invoke("claim-verify-code", {
    body: { community_id: communityId, code },
  });
  if (error) { console.error("verifyClaimCode failed", error); throw error; }
  return data;
}

export async function requestManualReview(communityId, reason) {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) throw new Error("Sign in to request a review.");
  const { error } = await getClient().from("community_claim").upsert(
    { community: communityId, claimer: me, manual_review_reason: reason, manual_review_at: null },
    { onConflict: "community,claimer" },
  );
  if (error) { console.error("requestManualReview failed", error); throw error; }
}
```

- [ ] **Step 2: Verify it compiles over Vite**

Start the dev server (`preview_start` with the `frontend-dev` launch config), then:
Run: `curl -s -o /dev/null -w '%{http_code}' http://localhost:5199/src/lib/community.js`
Expected: `200`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/community.js
git commit -m "feat(claim): swap claimCommunity for request/verify/manual-review wrappers"
```

---

### Task 7: i18n claim strings (all 4 locales)

**Files:**
- Modify: `frontend/src/locales/{en,fr,de,it}.json`

**Interfaces:**
- Produces: new keys under the existing `community` namespace, consumed by Task 8.

- [ ] **Step 1: Add to `en.json`'s `community` block**

```json
"claimIntro": "To claim this store, verify you manage it. We will email a 6-digit code to the store's email on file.",
"claimSendCode": "Send code",
"claimCodeSent": "We sent a code to the store's email on file. Enter it below.",
"claimCodeLabel": "6-digit code",
"claimVerify": "Verify",
"claimResend": "Resend code",
"claimInvalidCode": "That code is not right. {count} attempts left.",
"claimExpiredCode": "That code expired. Send a new one.",
"claimRateLimited": "A code was just sent. Check your inbox, or wait a minute to resend.",
"claimVerified": "Verified. You now manage this store.",
"claimNoEmail": "This store has no email on file. Request a manual review instead.",
"claimManualTitle": "Request manual review",
"claimManualBody": "Tell us how we can confirm you manage this store (a website, socials, or an email we can reach you at).",
"claimManualSend": "Send request",
"claimManualSent": "Request sent. We will follow up."
```

- [ ] **Step 2: Mirror into `fr.json`, `de.json`, `it.json`**

Translate every value (no em dashes; keep the `{count}` placeholder). Suggested FR/DE/IT provided inline in the plan file's appendix comment — or translate faithfully following the existing tone of each locale's `community` block.

- [ ] **Step 3: Verify parity**

Run:
```bash
node -e "const en=require('./frontend/src/locales/en.json'),fr=require('./frontend/src/locales/fr.json'),de=require('./frontend/src/locales/de.json'),it=require('./frontend/src/locales/it.json');const k=Object.keys(en.community).sort();for(const [n,l] of [['fr',fr],['de',de],['it',it]]){if(JSON.stringify(k)!==JSON.stringify(Object.keys(l.community).sort()))throw new Error(n+' differs')}console.log('parity ok',k.length)"
```
Expected: `parity ok <N>` (no throw). Also confirm no `—` in the new values.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/locales/en.json frontend/src/locales/fr.json frontend/src/locales/de.json frontend/src/locales/it.json
git commit -m "i18n(claim): add verification-flow strings to all locales"
```

---

### Task 8: Multi-step `ClaimCommunityDialog.vue`

**Files:**
- Modify: `frontend/src/components/community/ClaimCommunityDialog.vue`
- Modify: `frontend/src/components/Pages/App/CommunityProfile.vue` (drop the now-unused `:current-user-id` prop on the claim dialog; keep `@claimed="onClaimed"`)

**Interfaces:**
- Consumes: `requestClaimCode`, `verifyClaimCode`, `requestManualReview` (Task 6); `isValidCode` (Task 2); `community.claim*` i18n (Task 7); `getCurrentSession`, `signInWithDiscord` from `@/lib/supabaseClient`.
- Props: `{ modelValue: Boolean, community: Object }`. Emits `update:modelValue`, `claimed(community)`.

- [ ] **Step 1: Rebuild the dialog with a `step` state machine**

Replace the script + body so the dialog walks `intro → code → done`, with a `manual` branch. Keep the existing `.dlg*` styles. Script shape (full):

```vue
<script setup>
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { requestClaimCode, verifyClaimCode, requestManualReview } from "@/lib/community";
import { isValidCode } from "@/lib/claimState";
import { getCurrentSession, signInWithDiscord } from "@/lib/supabaseClient";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  community:  { type: Object,  default: null },
});
const emit = defineEmits(["update:modelValue", "claimed"]);
const { t } = useI18n();

const step = ref("intro");          // intro | code | manual | done
const signedIn = ref(false);
const submitting = ref(false);
const errorMsg = ref("");
const code = ref("");
const attemptsLeft = ref(null);
const manualReason = ref("");

const canVerify = computed(() => isValidCode(code.value) && !submitting.value);

watch(() => props.modelValue, async (open) => {
  if (!open) return;
  step.value = "intro"; errorMsg.value = ""; code.value = ""; attemptsLeft.value = null;
  manualReason.value = ""; submitting.value = false;
  signedIn.value = !!(await getCurrentSession())?.user;
});

function close() { emit("update:modelValue", false); }

async function sendCode() {
  if (!signedIn.value) { await signInWithDiscord(); return; }
  submitting.value = true; errorMsg.value = "";
  try {
    const res = await requestClaimCode(props.community.id);
    if (res.status === "sent") step.value = "code";
    else if (res.status === "needs_manual_review") step.value = "manual";
    else if (res.status === "rate_limited") { step.value = "code"; errorMsg.value = t("community.claimRateLimited"); }
    else errorMsg.value = res.error ?? t("community.claimExpiredCode");
  } catch (e) { errorMsg.value = e.message ?? "Failed to send code."; }
  finally { submitting.value = false; }
}

async function verify() {
  if (!canVerify.value) return;
  submitting.value = true; errorMsg.value = "";
  try {
    const res = await verifyClaimCode(props.community.id, code.value);
    if (res.status === "verified") { step.value = "done"; emit("claimed", res.community); }
    else if (res.status === "invalid") { attemptsLeft.value = res.attempts_left; errorMsg.value = t("community.claimInvalidCode", { count: res.attempts_left }); }
    else if (res.status === "expired") errorMsg.value = t("community.claimExpiredCode");
    else if (res.status === "already_claimed") errorMsg.value = t("community.claimExpiredCode");
    else errorMsg.value = res.error ?? "Verification failed.";
  } catch (e) { errorMsg.value = e.message ?? "Verification failed."; }
  finally { submitting.value = false; }
}

async function sendManual() {
  if (!manualReason.value.trim() || submitting.value) return;
  submitting.value = true; errorMsg.value = "";
  try { await requestManualReview(props.community.id, manualReason.value.trim()); step.value = "done"; }
  catch (e) { errorMsg.value = e.message ?? "Failed to send request."; }
  finally { submitting.value = false; }
}
</script>
```

Template: reuse the existing `.dlg` / `.dlg-head` / `.dlg-body` / `.dlg-foot` / `.error-bar` markup. Body branches on `step`:
- `intro` → `t('community.claimIntro')`, footer button `sendCode` labelled `signedIn ? t('community.claimSendCode') : t('auth.signIn')`.
- `code` → `t('community.claimCodeSent')`, a `field-input` bound to `code` (inputmode numeric, maxlength 6), a `claimResend` text button calling `sendCode`, footer `verify` button (disabled unless `canVerify`).
- `manual` → `t('community.claimNoEmail')` + a textarea bound to `manualReason` (maxlength 500), footer `sendManual`.
- `done` → a check icon + `t(step==='manual' ? 'community.claimManualSent' : 'community.claimVerified')`, footer a single close button.
Surface `errorMsg` in the `.error-bar` in every step.

- [ ] **Step 2: Drop the unused prop in the profile**

In `CommunityProfile.vue`, change the mount to `<ClaimCommunityDialog v-model="claimOpen" :community="community" @claimed="onClaimed" />` (remove `:current-user-id`). `onClaimed(row)` already patches `community.value` and (per the existing code) may open the edit dialog — keep that.

- [ ] **Step 3: Verify in the browser**

Start the dev server; open an unclaimed profile; click **Claim**. Signed out → the button reads "Sign in" and triggers Discord (do not complete OAuth in the check — just confirm the label + no console errors). For the signed-in path, verify the `intro → code` transition using a test store whose `community_private` email you control, enter the emailed code, and confirm the profile flips to owned + Verified with **no console errors** (`read_console_messages`). Screenshot each step.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/community/ClaimCommunityDialog.vue frontend/src/components/Pages/App/CommunityProfile.vue
git commit -m "feat(claim): two-step verify dialog with manual-review fallback"
```

---

### Task 9: Integration sweep + remove dead references

**Files:**
- Modify: any remaining caller of the removed `claimCommunity` (search), `frontend/src/lib/community.js` (confirm no stale export)

- [ ] **Step 1: Confirm nothing still imports the removed function**

Run: `grep -rn "claimCommunity\b" frontend/src` — expect **no matches** (only `requestClaimCode`/`verifyClaimCode` remain). Fix any straggler.

- [ ] **Step 2: Full test + build**

Run: `npm --prefix frontend run test` → all pass (includes `claimState`).
Run: `npm --prefix frontend run build` → completes (SSG prerender of `/community` + curated profiles still succeeds; the claim dialog is client-only).

- [ ] **Step 3: Commit (if any fixes)**

```bash
git add -A
git commit -m "chore(claim): remove dead claim references, verify build"
```

---

## Self-Review

**1. Spec coverage.** Identity verification via email code (Tasks 4,5); private email storage in `community_private` (Task 1) seeded from OTS (Task 3); retire instant `claim_community` (Task 1); server-only ownership grant (Task 5); manual-review fallback (Tasks 5-request path returns `needs_manual_review`, 6, 8); multi-step dialog (Task 8); locales (Task 7); pure-logic tests (Task 2). Payment is explicitly deferred to Plan 2 per the spec's phasing. Discord/domain verification is Phase 2 per spec non-goals.

**2. Placeholder scan.** SQL, edge functions, the seed script, `claimState.js` + tests, and `community.js` changes carry complete code. Task 7 gives the full `en` block and instructs faithful translation (the repo's established locale pattern). Task 8 gives the full script and a precise, itemized template spec against the existing, already-styled `.dlg` markup rather than re-pasting ~200 lines of unchanged CSS — consistent with how the original community plan handled dialogs.

**3. Type consistency.** `requestClaimCode`/`verifyClaimCode`/`requestManualReview` (Task 6) match every call site in Task 8. The Edge Function response shapes (`{status:"sent"|"needs_manual_review"|"rate_limited"}`, `{status:"verified"|"invalid"|"expired"|"already_claimed", attempts_left, community}`) are produced in Tasks 4-5 and consumed identically in Tasks 6/8. `deriveClaimState`/`isValidCode` (Task 2) are used in Task 8. Column names in `community_claim`/`community_private` (Task 1) match the seed script (Task 3) and both functions (Tasks 4-5).

## Follow-on

- **Plan 2 — `verified-paid-claim-subscription`:** Stripe trial subscription, `claim-create-checkout` (local-currency Price), `stripe-webhook` (lifecycle + lapse revert), `claim-portal`, `communityPricing.js`, and the change that moves the ownership grant OUT of `claim-verify-code` and INTO the paid webhook (verify then only marks `identity_verified_at`). Depends on this plan.
