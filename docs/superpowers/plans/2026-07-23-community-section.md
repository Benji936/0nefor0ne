# Community Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Community section that turns TradeMarket's existing read-only store/Discord/event data into a browsable, claimable, owner-managed directory of stores and communities, with SEO profile pages.

**Architecture:** A single `community` table (`kind = store | discord | group`) mirrors the existing `announce.kind` pattern and reuses the announce RLS shape (public read / owner write). Store profiles are **seeded** from the 4,450 OTS rows in `data/stores.json` as unclaimed shells that an owner can **claim** via a `SECURITY DEFINER` RPC. The frontend adds a directory page and SEO profile pages using the existing vite-ssg `includedRoutes` + sitemap machinery. Events, calendar, moderation queue, and owner analytics are explicitly **out of MVP** and covered as follow-on plans.

**Tech Stack:** Vue 3 `<script setup>` + Options mix, Vuetify 3, Tailwind (utility layer), vue-i18n (4 locales), vite-ssg (SSR prerender), Supabase (Postgres + RLS + RPC), vitest. Base domain `https://0nefor.one`.

## Global Constraints

Copied verbatim from project rules; every task's requirements implicitly include this section.

- **Locales at parity:** every user-facing string is added to all four of `frontend/src/locales/{en,fr,de,it}.json`. `en` is the source of truth.
- **No em dashes** in any user-facing copy, including locale JSON. Use a period, comma, colon, or "(...)".
- **Routes are locale-prefixed:** all app routes live under `/:locale(...)/` and are registered in `frontend/src/router/index.js`. Add a matching non-locale redirect for each new top-level path.
- **Supabase access** goes through `getClient()` from `@/lib/supabaseClient`. The `Trader` table (the user profile) uses quoted PascalCase columns: `id` (= `auth.users.id`), `Name`, `City`, `Country`, `country_code`, `avatar_url`, `avg_rating`, `discord_id`.
- **RLS convention:** every new table `ENABLE ROW LEVEL SECURITY`; public data gets a `select` policy `USING (true)` (or a status-scoped variant), writes are gated to `owner = auth.uid()`. End every migration with `NOTIFY pgrst, 'reload schema';`.
- **Migrations** are named `supabase/migrations/YYYYMMDD_<name>.sql`, PKs are `bigint GENERATED ALWAYS AS IDENTITY`. Guard re-runnable statements with `IF NOT EXISTS` / `DROP ... IF EXISTS`.
- **Tests:** vitest, run with `npm --prefix frontend run test`. Pure-logic lives in `frontend/src/lib/*.js` with a colocated `*.test.js`. Vue components and SQL are **not** unit-tested in this repo (see "Testing reality" note in the MVP section).
- **Do NOT** read, print, modify, or commit `discord-bot/.env`. Do NOT run `npm run cards:sync`.
- **Commits** happen per-task only when the user has authorized committing for the session. The commit steps below follow the plan format; honor the session's commit policy at execution time.
- **Vuetify quirk:** Tailwind all-sides spacing classes (`p-4`, `m-2`), `.5` steps, and arbitrary spacing values compute to `0px` under Vuetify. Prefix with `!` (e.g. `!p-4`) to make them render, or use explicit CSS with `--c-*` tokens.
- **Design tokens:** use `--c-*` CSS variables from `frontend/src/assets/main.css` (`--c-bg`, `--c-surface`, `--c-surface-2`, `--c-border`, `--c-text`, `--c-muted`, `--c-trade`, `--c-mutual`, `--c-accent`). Never hardcode theme colors.

---

## Part A — Product Strategy

### A1. Main objectives
1. **Turn dead data into a living directory.** 4,450 OTS stores and the Discord guilds already linked through announces become browsable, claimable profiles.
2. **Give owners a reason to return.** A store owner / community admin gets a public profile they control, which drives them back into the product (and, later, to post events).
3. **Own the SEO real estate.** Thousands of `"<Store>, <City>"` and `"<Community> Yu-Gi-Oh"` long-tail queries currently go nowhere. Profile pages capture them and funnel to the trade/announce features.
4. **Close the discovery loop.** A visitor who finds a store/community should be one click from that entity's announces, its Discord, and (Phase 2) its events.

### A2. Value proposition
- **For visitors:** "Find the Yu-Gi-Oh stores, Discord servers, and events near you, in one place." Discovery that a bare Google Maps search or a scattered set of Discord invites cannot match, because it is cross-linked with live trade listings.
- **For owners/admins:** "Claim your free profile in 60 seconds and get discovered by local players." A zero-cost visibility channel that already ranks (seeded pages) before they even claim it.
- **Platform wedge:** TradeMarket already has the users (traders), the auth (Discord OAuth), the content (announces), and the data (OTS + guild). The Community section is the connective tissue, not a new silo.

### A3. User personas
| Persona | Who | Wants | Success moment |
|---|---|---|---|
| **Nomi, the local player** (visitor) | Casual/competitive player, mobile-first | Find nearby stores + active Discords + events | Finds a store 3km away that also has open trade listings |
| **Ravi, the store owner** (claimer) | Runs a local game store, non-technical | Free visibility, control over how the store appears | Claims his OTS listing, adds hours + Discord, sees it in the directory |
| **Sky, the community admin** (creator) | Runs a Discord tournament server | Grow membership, promote the server | Creates a `discord` community, gets a shareable SEO page |
| **Mod / platform admin** (internal) | You | Keep the directory clean and trustworthy | Verifies a legit store, resolves a report in one screen |

### A4. Key use cases (MVP)
1. Visitor browses `/community`, filters by kind + country + "remote duel", opens a profile.
2. Visitor lands on a profile page from Google, sees address/map/Discord/website + a "Claim this" CTA.
3. Owner signs in with Discord, finds their seeded store, clicks **Claim this store**, edits bio/links, publishes.
4. Admin (or a user with no existing profile) creates a brand-new `discord` community not in the OTS list.
5. Any signed-in user reports a bad profile; it enters a report list for the admin.

---

## Part B — Feature Definition

### B1. MVP (this plan)
- `community` entity (single table, `kind` discriminator), seeded from OTS stores as **unclaimed** shells.
- **Directory page** `/community`: server-filtered list (kind, country/region, remote_duel, name search), paginated, card grid.
- **Profile page** `/community/:slug`: SEO-prerendered for a curated set, client-rendered + sitemapped for the rest. Shows identity, address/map link, Discord/website, verified/claimed badges, owner's announces link, "Claim this" or "Report" CTA.
- **Claim flow**: `claim_community` RPC sets `owner = auth.uid()` on an unclaimed row.
- **Create flow**: owner-created store/community/group.
- **Profile editing** for the owner.
- **Verified badge** (admin-set boolean) + **report** (any signed-in user).

### B2. Phase 2 (follow-on plan: `community-events`)
- `community_event` entity (owner-owned), event create/edit.
- **Calendar view** + list, filter by community/location/date.
- **Event moderation** queue (`status: pending → approved`), spam checks.
- **Discord live linking**: pull member count / online via the bot, "verified Discord" badge.
- Surface the read-only official `events.json` alongside community events.

### B3. Phase 3 (follow-on plan: `community-advanced`)
- **Roles/teams** (multiple admins per community via a `community_member` join).
- **RSVP** + attendance, recurring events, ICS export.
- **Owner dashboard** with analytics (profile views, click-throughs).
- **Referral / discovery loops** (see Part G), gamification (badges, "most active community").
- Reviews/ratings for stores (reuse the `avg_rating` pattern).

---

## Part C — UX Structure

### C1. Main pages
| Route | Component | Render | Purpose |
|---|---|---|---|
| `/:locale/community` | `CommunityDirectory.vue` | SSG (all locales) | Browse + filter + search |
| `/:locale/community/:slug` | `CommunityProfile.vue` | SSG (curated) + client (rest) | Public profile + CTAs |
| `/:locale/account` (existing) | `Account.vue` (extend) | client | "My communities" management strip |

### C2. Navigation
- Add a **Community** entry to `frontend/src/components/nav/SideNav.vue` (follows the existing `NavItem.vue` pattern), pointing to `community.home`.
- Add a link in `frontend/src/components/Pages/Public/LandingPage.vue` (discovery entry point) — optional, Task 13.

### C3. Core user flows
**Discovery:** Nav/Landing -> `/community` -> filter -> profile -> (announces | Discord | website | claim).

**Claim:** Profile (`owner IS NULL`) -> "Claim this store" -> auth gate (Discord OAuth if signed out) -> `ClaimCommunityDialog` confirm -> `claim_community` RPC -> profile now owned -> edit dialog opens.

**Create:** `/community` "Add your store/community" -> `CommunityEditDialog` (create mode) -> fill name/kind/links -> insert (`status='published'`, `owner=me`) -> redirect to new profile.

**Edit:** Profile (owner) or Account strip -> `CommunityEditDialog` (edit mode) -> save -> `updateCommunity`.

---

## Part D — Data Model

### D1. Entities and relationships
```
auth.users (Supabase) ──1:1── "Trader" (existing profile)
        │ id (uuid)
        │
        └─0:N── community.owner            (owner IS NULL = unclaimed OTS seed)
                    │ id (bigint)
                    │ ots_store_id ──►  data/stores.json row id (soft link, not FK)
                    │
                    ├─1:N── community_report.community
                    │
                    └─(Phase 2) 1:N── community_event.community
```
- **Users** = `auth.users` + `"Trader"`. No new user table.
- **Stores / Communities / Groups** = rows in `community`, discriminated by `kind`.
- **Tags/categories** (MVP): a `text[] tags` column, filtered client-side; promoted to a join table only if search needs it (YAGNI for MVP).
- **Locations**: denormalized onto `community` (`city, country, country_code, region, lat, lng`) sourced from the OTS row; no separate locations table (matches how `otsLocations` already treats places).
- **Ownership/roles**: single `owner` for MVP. Multi-admin roles are Phase 3 (`community_member`).
- **Verification/moderation**: `verified boolean` (admin-set) + `status` (`draft|published|hidden`) + `community_report` table.

### D2. `community` schema (authoritative — Task 1 implements this verbatim)
```sql
CREATE TABLE community (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner         uuid REFERENCES auth.users(id) ON DELETE SET NULL,   -- NULL = unclaimed seed
  kind          text NOT NULL CHECK (kind IN ('store','discord','group')),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  bio           text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 2000),
  avatar_url    text,
  banner_url    text,
  website       text,
  discord_url   text,
  city          text,
  country       text,
  country_code  text,
  region        text,
  lat           double precision,
  lng           double precision,
  remote_duel   boolean NOT NULL DEFAULT false,
  ots_store_id  text UNIQUE,                                          -- soft link to stores.json id
  tags          text[] NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','hidden')),
  verified      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
```

### D3. `community_report` schema (Task 1)
```sql
CREATE TABLE community_report (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community  bigint NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  reporter   uuid   NOT NULL REFERENCES auth.users(id),
  reason     text   NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  status     text   NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community, reporter)   -- one open report per user per community
);
```

---

## Part E — Functional Requirements (mapping to MVP tasks)

| Requirement | Where |
|---|---|
| Search + filters | Task 5 (`communityFilters.js` server-param builder) + Task 7 (directory UI) |
| Event calendar | **Phase 2** (`community-events` plan) |
| Owner dashboard | Task 11 (Account strip, MVP-lite) + **Phase 3** (analytics) |
| Profile editing | Task 9 (`CommunityEditDialog`) |
| Claiming a store/community | Task 1 (`claim_community` RPC) + Task 10 (`ClaimCommunityDialog`) |
| Discord/community linking | MVP: `discord_url` field (Task 9). Live linking = **Phase 2** |
| Event approval/moderation | **Phase 2** |
| Verification | Task 1 (`verified` col) + Task 8 (badge) + admin-set (manual for MVP) |
| Reporting | Task 1 (`community_report`) + Task 12 (report UI) |

---

## Part F — Trust & Safety
- **Verification (MVP, manual):** `verified` boolean, set by admin via SQL/Studio. Display a badge only when `verified = true`. Claiming alone does **not** verify. Phase 2 adds Discord-ownership and email-domain verification signals.
- **Reporting:** `community_report`, one row per user per community (unique constraint), RLS lets a user insert/read only their own reports; no public read. Admin reviews in Studio for MVP, a queue UI in Phase 2.
- **Spam prevention:** (1) create requires auth; (2) a per-owner cap enforced in `createCommunity` (Task 4) of N unverified communities; (3) slug uniqueness + name length checks; (4) `status='draft'` default for owner-created rows until they explicitly publish (prevents drive-by spam pages from being indexed).
- **Content moderation:** `status='hidden'` removes a row from all public reads without deleting it. `bio` capped at 2000 chars, links validated as http(s) in Task 4.

---

## Part G — Growth & SEO
- **SEO structure:** `/community` (hub) links to `/community/:slug` (spokes). Each profile emits `useHead` title/description/canonical + `LocalBusiness`/`Organization` JSON-LD (store gets `LocalBusiness` with geo; discord/group gets `Organization`). Curated top-N prerendered; the rest client-render but appear in `sitemap.xml` so they are crawlable.
- **Thin-content guard:** seeded shells must carry real substance (address, map link, region, "nearby stores", claim CTA), never a bare name, to avoid a thin/duplicate-content penalty across 4,450 pages. Prerender only a curated subset initially; expand as pages gain content (claims).
- **Discovery loops:** profile -> owner's announces -> other communities in same city ("Near you") -> back to directory. Every announce that carries `community_url` / `discord_guild_name` links to its community profile (cross-link from the existing announce cards).
- **Sharing/referral ideas:** shareable OG image per profile (Phase 3); "Claim your store" email/Discord DM to unclaimed owners (Phase 3, needs contact data already in `stores.json` `email`); "verified community" embed badge for owners to put on their own site (backlink loop).

---

## Part H — Technical Implementation

### H1. Suggested architecture
No new services. Postgres table + RLS + one RPC; a Node seed script reusing the sitemap script's Supabase pattern; Vue pages wired through the existing router + vite-ssg. The Discord bot is **untouched** in MVP (it already writes `community_url`/guild fields onto announces; Phase 2 consumes them).

### H2. Backend modules
- `supabase/migrations/20260724_community.sql` — tables, RLS, indexes, `claim_community` RPC.
- `frontend/scripts/seed-communities.mjs` — idempotent OTS -> `community` upsert.
- `frontend/src/lib/community.js` — data-access layer (fetch/create/update/claim/report).

### H3. Frontend components
- `frontend/src/lib/communitySlug.js` (+ test) — slug generation.
- `frontend/src/lib/communityFilters.js` (+ test) — filter/sort param builder.
- `frontend/src/components/Pages/App/CommunityDirectory.vue`
- `frontend/src/components/Pages/App/CommunityProfile.vue`
- `frontend/src/components/community/CommunityCard.vue`
- `frontend/src/components/community/CommunityEditDialog.vue`
- `frontend/src/components/community/ClaimCommunityDialog.vue`
- `frontend/src/components/community/ReportCommunityDialog.vue`

### H4. APIs / integrations
- Supabase REST (via supabase-js) for CRUD; `rpc('claim_community', ...)` for the claim.
- No external API in MVP. (Phase 2: Discord API via the bot for live guild data.)

---

## Part I — Creative Differentiators (beyond a plain directory)
1. **"Claim-ready" pages:** the page exists and ranks *before* the owner arrives; the claim CTA turns SEO traffic into owner sign-ups. Most directories start empty; this one starts full.
2. **Trade-aware profiles:** a store/community profile shows *live* announces from its members, so it is never a static listing. This is the moat a generic directory can't copy.
3. **"Near you" duel-radius:** reuse `otsLocations.distanceKm` + `getMyPosition` to sort the directory by real distance, and show "3 stores + 2 Discords within 20km".
4. **Remote-duel filter:** a first-class toggle surfacing stores/communities that run online play, sourced from the OTS `remote_duel` flag.
5. **Discord-native trust:** because auth is Discord OAuth and the bot already knows guilds, a community can later show a *verified* "this Discord is really run by the claimer" badge no competitor has.
6. **Cross-link flywheel (Phase 2):** each event auto-posts to the community's linked Discord via the existing bot, and each announce links back to its community — content compounds.

---

## Part J — Locked Decisions & Scope Split

**Decisions locked for this plan (change these and the plan changes):**
1. **Single `community` table** with `kind = store | discord | group` (not separate tables).
2. **MVP = directory + profiles + claim** (events, calendar, dashboard, moderation queue are follow-on plans).
3. **Seed from OTS list + allow create** (4,450 seeded unclaimed shells, plus owner-created rows).

**Scope split (per writing-plans Scope Check — this feature is multi-subsystem):**
- **Plan 1 (this document):** Community directory, profiles, claim, edit, verify/report. Ships standalone.
- **Plan 2 (`community-events`):** events + calendar + moderation + Discord live linking. Depends on Plan 1's `community` table.
- **Plan 3 (`community-advanced`):** roles/teams, RSVP, dashboard analytics, referral loops, reviews. Depends on Plans 1-2.

Each plan produces working, testable software on its own.

---

## MVP Implementation Plan (Plan 1)

**Testing reality (read before starting):** this repo unit-tests **pure logic** in `src/lib/*.js` with vitest and does **not** unit-test Vue SFCs or SQL. So:
- **Lib/logic tasks** (2, 4-part, 5) use strict TDD: failing test -> run (fail) -> implement -> run (pass) -> commit.
- **Migration / script / component / config tasks** (1, 3, 6-13) use a **build-and-verify** cycle: implement -> run a concrete verification command (compile the SFC over HTTP, run the seed script `--dry-run`, `psql`/Studio check, or `npm run build`) -> commit. Each such task states its exact verification command and expected output. This follows the established codebase pattern rather than bolting on a component-test framework the repo doesn't use.

**Dependency order:** 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> (7, 8 depend on 4/5/6) -> 9 -> 10 -> 11 -> 12 -> 13.

---

### Task 1: Database migration — `community` + `community_report` + RLS + `claim_community` RPC

**Files:**
- Create: `supabase/migrations/20260724_community.sql`

**Interfaces:**
- Produces: table `community` (columns per Part D2), table `community_report` (Part D3), RPC `claim_community(p_community bigint) returns community`. Consumed by Tasks 3, 4, 10, 12.

- [ ] **Step 1: Write the migration**

```sql
-- Community section: claimable store / discord / group profiles.
-- Single table discriminated by `kind`, mirroring announce.kind. Unclaimed OTS
-- seed rows have owner IS NULL and are claimed via the claim_community RPC.

CREATE TABLE IF NOT EXISTS community (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind          text NOT NULL CHECK (kind IN ('store','discord','group')),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  bio           text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 2000),
  avatar_url    text,
  banner_url    text,
  website       text,
  discord_url   text,
  city          text,
  country       text,
  country_code  text,
  region        text,
  lat           double precision,
  lng           double precision,
  remote_duel   boolean NOT NULL DEFAULT false,
  ots_store_id  text UNIQUE,
  tags          text[] NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','hidden')),
  verified      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_kind_status ON community (kind, status);
CREATE INDEX IF NOT EXISTS idx_community_country      ON community (country);
CREATE INDEX IF NOT EXISTS idx_community_owner        ON community (owner) WHERE owner IS NOT NULL;

ALTER TABLE community ENABLE ROW LEVEL SECURITY;

-- Public sees published rows; an owner also sees their own drafts/hidden rows.
DROP POLICY IF EXISTS "community_select_public" ON community;
CREATE POLICY "community_select_public" ON community FOR SELECT
  USING (status = 'published' OR owner = auth.uid());

-- Owner-created rows only (claiming a NULL-owner row goes through the RPC).
DROP POLICY IF EXISTS "community_insert_own" ON community;
CREATE POLICY "community_insert_own" ON community FOR INSERT
  WITH CHECK (owner = auth.uid());

DROP POLICY IF EXISTS "community_update_own" ON community;
CREATE POLICY "community_update_own" ON community FOR UPDATE
  USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());

DROP POLICY IF EXISTS "community_delete_own" ON community;
CREATE POLICY "community_delete_own" ON community FOR DELETE
  USING (owner = auth.uid());

-- ── Reports ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_report (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community  bigint NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  reporter   uuid   NOT NULL REFERENCES auth.users(id),
  reason     text   NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  status     text   NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community, reporter)
);

ALTER TABLE community_report ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_report_insert_own" ON community_report;
CREATE POLICY "community_report_insert_own" ON community_report FOR INSERT
  WITH CHECK (reporter = auth.uid());

DROP POLICY IF EXISTS "community_report_select_own" ON community_report;
CREATE POLICY "community_report_select_own" ON community_report FOR SELECT
  USING (reporter = auth.uid());

-- ── Claim RPC ──────────────────────────────────────────────────────────────
-- Claiming sets owner on an UNCLAIMED row. RLS update policy requires
-- owner = auth.uid(), which a NULL-owner row can never satisfy, so the claim
-- must run as SECURITY DEFINER. It refuses already-owned rows.
CREATE OR REPLACE FUNCTION claim_community(p_community bigint)
RETURNS community
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row community;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE community
     SET owner = v_uid, status = 'published', updated_at = now()
   WHERE id = p_community AND owner IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'community % is not claimable (missing or already claimed)', p_community;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION claim_community(bigint) FROM public;
GRANT EXECUTE ON FUNCTION claim_community(bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Validate against production inside a rolled-back transaction (do NOT persist yet)**

Use the Supabase MCP `execute_sql` (project `sxteuctysfiwripnaozi`) wrapping the whole migration in `BEGIN; ... ROLLBACK;`, then assert cleanup:

Run (conceptually): `BEGIN;` + migration body + smoke inserts + `ROLLBACK;` then `SELECT to_regclass('public.community') IS NULL AS gone;`
Expected: smoke inserts succeed; after rollback `gone = true`.

- [ ] **Step 3: Apply the migration**

Apply via the Supabase MCP `apply_migration` (name `community`, project `sxteuctysfiwripnaozi`) with the file body. Expected: `{ "success": true }`.

- [ ] **Step 4: Verify live objects**

Run: `SELECT count(*) FILTER (WHERE tablename='community') AS c, count(*) FILTER (WHERE tablename='community_report') AS r FROM pg_tables WHERE schemaname='public';`
Expected: `c=1, r=1`. Also confirm `SELECT proname FROM pg_proc WHERE proname='claim_community';` returns one row, and `SELECT relrowsecurity FROM pg_class WHERE relname='community';` is `t`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260724_community.sql
git commit -m "feat(community): add community + report tables, RLS, claim_community RPC"
```

---

### Task 2: Slug helper (`communitySlug.js`) — TDD

**Files:**
- Create: `frontend/src/lib/communitySlug.js`
- Test: `frontend/src/lib/communitySlug.test.js`

**Interfaces:**
- Produces: `slugify(name: string, opts?: {city?: string}) => string` (lowercase, `[a-z0-9-]`, collapses/trims dashes, appends city when given, caps length ~60); `withSuffix(base: string, n: number) => string` (appends `-2`, `-3` for collision resolution). Consumed by Tasks 3, 4.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { slugify, withSuffix } from "./communitySlug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("The Inventory")).toBe("the-inventory");
  });
  it("strips punctuation and diacritics", () => {
    expect(slugify("Café Élite & Co.")).toBe("cafe-elite-co");
  });
  it("collapses and trims separators", () => {
    expect(slugify("  --Hobby   Shop--  ")).toBe("hobby-shop");
  });
  it("appends city when provided", () => {
    expect(slugify("The Inventory", { city: "Hagåtña" })).toBe("the-inventory-hagatna");
  });
  it("matches the DB slug pattern and caps length", () => {
    const s = slugify("x".repeat(200));
    expect(s).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(s.length).toBeLessThanOrEqual(60);
  });
  it("returns a safe fallback for empty input", () => {
    expect(slugify("!!!")).toBe("community");
  });
});

describe("withSuffix", () => {
  it("appends a numeric suffix", () => {
    expect(withSuffix("the-inventory", 2)).toBe("the-inventory-2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend run test -- communitySlug`
Expected: FAIL, "Failed to resolve import ./communitySlug" / functions not defined.

- [ ] **Step 3: Write minimal implementation**

```js
// URL-safe slug generation for community profiles. Mirrors the DB CHECK
// constraint slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'. Deterministic: the seed
// script and the create flow must produce identical slugs for the same input.
const MAX = 60;

function normalize(input) {
  return String(input ?? "")
    .normalize("NFKD")               // split accented letters into base + mark
    .replace(/[̀-ͯ]/g, "") // drop the combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")     // everything else becomes a separator
    .replace(/^-+|-+$/g, "");        // trim leading/trailing separators
}

export function slugify(name, opts = {}) {
  const parts = [normalize(name)];
  if (opts.city) parts.push(normalize(opts.city));
  let slug = parts.filter(Boolean).join("-").replace(/-+/g, "-");
  if (slug.length > MAX) slug = slug.slice(0, MAX).replace(/-+$/g, "");
  return slug || "community";
}

export function withSuffix(base, n) {
  return `${base}-${n}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend run test -- communitySlug`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/communitySlug.js frontend/src/lib/communitySlug.test.js
git commit -m "feat(community): add deterministic slug helper"
```

---

### Task 3: OTS seed script (`seed-communities.mjs`)

**Files:**
- Create: `frontend/scripts/seed-communities.mjs`
- Modify: `frontend/package.json` (add `"community:seed"` script)

**Interfaces:**
- Consumes: `data/stores.json` (shape `{ data: [ {id,name,address{street,city,state,zip,country},region,phone,email,website,latitude,longitude,remote_duel} ] }`), `slugify` from Task 2, Supabase service pattern from `scripts/generate-sitemap.mjs`.
- Produces: idempotent upsert of `community` rows (`kind='store'`, `owner=NULL`, `status='published'`, `ots_store_id=<store.id>`), `--dry-run` and `--limit=N` flags.

- [ ] **Step 1: Write the seed script**

```js
/**
 * seed-communities.mjs
 *
 * Upserts one `community` row per OTS store from data/stores.json.
 * Seeded rows are UNCLAIMED shells (owner NULL, status 'published') that owners
 * can later claim. Idempotent on ots_store_id (re-running updates, never dupes).
 *
 * Usage:
 *   node scripts/seed-communities.mjs --dry-run           # print, write nothing
 *   node scripts/seed-communities.mjs --limit=50          # first 50 only
 *   node scripts/seed-communities.mjs                      # full run
 *
 * Requires a SERVICE ROLE key to write with owner NULL past RLS:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-communities.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { slugify, withSuffix } from "../src/lib/communitySlug.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORES = resolve(__dirname, "../../data/stores.json");

const DRY = process.argv.includes("--dry-run");
const LIMIT = parseInt(process.argv.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "0", 10);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://sxteuctysfiwripnaozi.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && !SERVICE_KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY to write (owner NULL bypasses RLS). Use --dry-run to preview.");
  process.exit(1);
}
const db = DRY ? null : createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function toRow(store, usedSlugs) {
  const a = store.address ?? {};
  let slug = slugify(store.name, { city: a.city });
  let n = 2;
  while (usedSlugs.has(slug)) slug = withSuffix(slugify(store.name, { city: a.city }), n++);
  usedSlugs.add(slug);
  return {
    kind: "store",
    owner: null,
    name: store.name,
    slug,
    website: store.website ?? null,
    city: a.city ?? null,
    country: a.country ?? null,
    region: store.region ?? null,
    lat: store.latitude ?? null,
    lng: store.longitude ?? null,
    remote_duel: !!store.remote_duel,
    ots_store_id: String(store.id),
    status: "published",
  };
}

async function main() {
  const raw = JSON.parse(await readFile(STORES, "utf8"));
  const stores = (raw.data ?? raw).filter(s => s?.id && s?.name);
  const slice = LIMIT > 0 ? stores.slice(0, LIMIT) : stores;
  const usedSlugs = new Set();
  const rows = slice.map(s => toRow(s, usedSlugs));

  console.log(`stores: ${stores.length} | seeding: ${rows.length} | dry-run: ${DRY}`);
  console.log("sample:", JSON.stringify(rows[0], null, 2));
  if (DRY) return;

  const CHUNK = 500;
  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await db.from("community").upsert(chunk, { onConflict: "ots_store_id" });
    if (error) { console.error("upsert failed at", i, error); process.exit(1); }
    done += chunk.length;
    console.log(`upserted ${done}/${rows.length}`);
  }
  console.log("done.");
}
main();
```

- [ ] **Step 2: Add the npm script**

In `frontend/package.json` `scripts`, add:
```json
"community:seed": "node scripts/seed-communities.mjs"
```

- [ ] **Step 3: Verify with a dry run**

Run: `npm --prefix frontend run community:seed -- --dry-run --limit=3`
Expected: prints `stores: 4450 | seeding: 3 | dry-run: true` and a sample row with `kind:"store"`, a valid `slug`, `ots_store_id` set, `owner:null`.

- [ ] **Step 4: Seed a small live batch, confirm, then full run**

Run (owner provides the service key): `SUPABASE_SERVICE_ROLE_KEY=… npm --prefix frontend run community:seed -- --limit=50`
Then verify via MCP `execute_sql`: `SELECT count(*) FROM community WHERE kind='store';` -> `50`. Re-run the same command and re-check -> still `50` (idempotent). Then full run (no `--limit`).

- [ ] **Step 5: Commit**

```bash
git add frontend/scripts/seed-communities.mjs frontend/package.json
git commit -m "feat(community): add idempotent OTS seed script"
```

---

### Task 4: Data-access layer (`community.js`)

**Files:**
- Create: `frontend/src/lib/community.js`

**Interfaces:**
- Consumes: `getClient()` from `@/lib/supabaseClient`, `slugify`/`withSuffix` from Task 2.
- Produces:
  - `fetchDirectory(params) => Promise<{rows, count}>` where `params = {kind?, country?, region?, remoteDuel?, q?, page=0, pageSize=24}`
  - `fetchBySlug(slug) => Promise<community|null>`
  - `createCommunity(input) => Promise<community>` (owner = current user, unique slug, http(s) link validation, per-owner cap)
  - `updateCommunity(id, patch) => Promise<community>`
  - `claimCommunity(id) => Promise<community>` (calls `rpc('claim_community')`)
  - `reportCommunity(id, reason) => Promise<void>`
  - `fetchMyCommunities() => Promise<community[]>`
  Consumed by Tasks 7-12.

- [ ] **Step 1: Write the module**

```js
import { getClient } from "@/lib/supabaseClient";
import { slugify, withSuffix } from "@/lib/communitySlug";

const PAGE_SIZE = 24;
const MAX_UNVERIFIED_PER_OWNER = 5; // spam cap

function assertHttp(url, label) {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) throw new Error(`${label} must start with http:// or https://`);
  return url;
}

/** Build a slug not already taken (checks the DB, then numbers collisions). */
async function uniqueSlug(name, city) {
  const base = slugify(name, { city });
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : withSuffix(base, n);
    const { data } = await getClient().from("community").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
  }
  return withSuffix(base, Date.now() % 100000); // pathological fallback
}

export async function fetchDirectory({ kind, country, region, remoteDuel, q, page = 0, pageSize = PAGE_SIZE } = {}) {
  let query = getClient()
    .from("community")
    .select("id, kind, name, slug, city, country, region, avatar_url, remote_duel, verified, owner", { count: "exact" })
    .eq("status", "published");

  if (kind)               query = query.eq("kind", kind);
  if (country)            query = query.eq("country", country);
  if (region)             query = query.eq("region", region);
  if (remoteDuel === true) query = query.eq("remote_duel", true);
  if (q && q.trim())      query = query.ilike("name", `%${q.trim()}%`);

  const from = page * pageSize;
  const { data, count, error } = await query
    .order("verified", { ascending: false })
    .order("name", { ascending: true })
    .range(from, from + pageSize - 1);

  if (error) { console.error("fetchDirectory failed", error); throw error; }
  return { rows: data ?? [], count: count ?? 0 };
}

export async function fetchBySlug(slug) {
  const { data, error } = await getClient()
    .from("community").select("*").eq("slug", slug).maybeSingle();
  if (error) { console.error("fetchBySlug failed", error); throw error; }
  return data ?? null;
}

export async function createCommunity(input) {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) throw new Error("Sign in to create a community.");

  const { count } = await getClient()
    .from("community").select("id", { count: "exact", head: true })
    .eq("owner", me).eq("verified", false);
  if ((count ?? 0) >= MAX_UNVERIFIED_PER_OWNER) {
    throw new Error("You have reached the limit of unverified communities.");
  }

  const slug = await uniqueSlug(input.name, input.city);
  const row = {
    owner: me,
    kind: input.kind,
    name: input.name,
    slug,
    bio: input.bio ?? "",
    website: assertHttp(input.website, "Website"),
    discord_url: assertHttp(input.discord_url, "Discord link"),
    avatar_url: input.avatar_url ?? null,
    banner_url: input.banner_url ?? null,
    city: input.city ?? null,
    country: input.country ?? null,
    country_code: input.country_code ?? null,
    region: input.region ?? null,
    remote_duel: !!input.remote_duel,
    tags: input.tags ?? [],
    status: input.status ?? "published",
  };
  const { data, error } = await getClient().from("community").insert(row).select().single();
  if (error) { console.error("createCommunity failed", error); throw error; }
  return data;
}

export async function updateCommunity(id, patch) {
  const clean = { ...patch, updated_at: new Date().toISOString() };
  if ("website" in clean)     clean.website = assertHttp(clean.website, "Website");
  if ("discord_url" in clean) clean.discord_url = assertHttp(clean.discord_url, "Discord link");
  const { data, error } = await getClient().from("community").update(clean).eq("id", id).select().single();
  if (error) { console.error("updateCommunity failed", error); throw error; }
  return data;
}

export async function claimCommunity(id) {
  const { data, error } = await getClient().rpc("claim_community", { p_community: id });
  if (error) { console.error("claimCommunity failed", error); throw error; }
  return Array.isArray(data) ? data[0] : data;
}

export async function reportCommunity(id, reason) {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) throw new Error("Sign in to report.");
  const { error } = await getClient()
    .from("community_report").insert({ community: id, reporter: me, reason });
  if (error && error.code !== "23505") { // 23505 = already reported, treat as success
    console.error("reportCommunity failed", error); throw error;
  }
}

export async function fetchMyCommunities() {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) return [];
  const { data, error } = await getClient()
    .from("community").select("*").eq("owner", me).order("updated_at", { ascending: false });
  if (error) { console.error("fetchMyCommunities failed", error); throw error; }
  return data ?? [];
}
```

- [ ] **Step 2: Verify the module compiles via Vite (over HTTP)**

Start the dev server (`preview_start` with an auto-porting launch config), then:
Run: `curl -s -o /dev/null -w '%{http_code}' http://localhost:<vitePort>/src/lib/community.js`
Expected: `200` (a compile error returns `500` with the message in the body).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/community.js
git commit -m "feat(community): add data-access layer (fetch/create/update/claim/report)"
```

---

### Task 5: Directory filter param builder (`communityFilters.js`) — TDD

**Files:**
- Create: `frontend/src/lib/communityFilters.js`
- Test: `frontend/src/lib/communityFilters.test.js`

**Interfaces:**
- Produces: `toQueryParams(filters) => object` (URL-serializable, omits empty/false), `fromQueryParams(query) => filters` (inverse, coerces types). Consumed by Task 7 (URL <-> filter-state sync, matching the search-filters skill pattern).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { toQueryParams, fromQueryParams } from "./communityFilters";

describe("toQueryParams", () => {
  it("omits empty and false values", () => {
    expect(toQueryParams({ kind: "", country: "FR", remoteDuel: false, q: "" }))
      .toEqual({ country: "FR" });
  });
  it("serializes remoteDuel only when true", () => {
    expect(toQueryParams({ remoteDuel: true })).toEqual({ remote: "1" });
  });
  it("drops page 0 but keeps a positive page", () => {
    expect(toQueryParams({ page: 0 })).toEqual({});
    expect(toQueryParams({ page: 3 })).toEqual({ page: "3" });
  });
});

describe("fromQueryParams", () => {
  it("is the inverse of toQueryParams", () => {
    const f = { kind: "store", country: "DE", region: "EMEA", remoteDuel: true, q: "hobby", page: 2 };
    expect(fromQueryParams(toQueryParams(f))).toEqual(f);
  });
  it("defaults missing values", () => {
    expect(fromQueryParams({})).toEqual({ kind: "", country: "", region: "", remoteDuel: false, q: "", page: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend run test -- communityFilters`
Expected: FAIL, functions not defined.

- [ ] **Step 3: Write minimal implementation**

```js
// URL <-> directory-filter mapping, kept pure so both the page and its tests
// share one source of truth. Empty strings, false, and page 0 are the "unset"
// values and never appear in the URL.
export function toQueryParams(f = {}) {
  const out = {};
  if (f.kind)          out.kind = f.kind;
  if (f.country)       out.country = f.country;
  if (f.region)        out.region = f.region;
  if (f.remoteDuel === true) out.remote = "1";
  if (f.q && f.q.trim()) out.q = f.q.trim();
  if (f.page && f.page > 0) out.page = String(f.page);
  return out;
}

export function fromQueryParams(query = {}) {
  return {
    kind:       query.kind ?? "",
    country:    query.country ?? "",
    region:     query.region ?? "",
    remoteDuel: query.remote === "1",
    q:          query.q ?? "",
    page:       query.page ? parseInt(query.page, 10) || 0 : 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend run test -- communityFilters`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/communityFilters.js frontend/src/lib/communityFilters.test.js
git commit -m "feat(community): add URL<->filter param mapping"
```

---

### Task 6: i18n `community` namespace (all 4 locales)

**Files:**
- Modify: `frontend/src/locales/en.json`, `frontend/src/locales/fr.json`, `frontend/src/locales/de.json`, `frontend/src/locales/it.json`

**Interfaces:**
- Produces: a `community` top-level key consumed by Tasks 7-12. Keys (English values shown; translate the others, no em dashes):

- [ ] **Step 1: Add the `community` block to `en.json`**

```json
"community": {
  "home": "Community",
  "directoryTitle": "Stores & Communities",
  "directorySubtitle": "Find Yu-Gi-Oh stores, Discord servers and groups near you.",
  "searchPlaceholder": "Search by name",
  "kindAll": "All", "kindStore": "Stores", "kindDiscord": "Discord", "kindGroup": "Groups",
  "filterCountry": "Country", "filterRegion": "Region", "remoteDuel": "Remote duel",
  "empty": "Nothing matches those filters yet.",
  "addYours": "Add your store or community",
  "claimThis": "Claim this store", "claimTitle": "Claim this listing",
  "claimBody": "Confirm you manage this store or community. Your account becomes its owner and you can edit the profile.",
  "claimConfirm": "Yes, I manage this", "claimed": "Claimed", "verified": "Verified",
  "unclaimedNotice": "This profile is unclaimed. Are you the owner?",
  "report": "Report", "reportTitle": "Report this listing",
  "reportPlaceholder": "What is wrong with this listing?", "reportSent": "Report sent. Thank you.",
  "editTitle": "Edit profile", "createTitle": "Add a store or community",
  "fieldName": "Name", "fieldKind": "Type", "fieldBio": "About",
  "fieldWebsite": "Website", "fieldDiscord": "Discord invite", "fieldCity": "City", "fieldCountry": "Country",
  "save": "Save", "create": "Publish", "cancel": "Cancel",
  "viewAnnounces": "View listings", "openDiscord": "Open Discord", "openWebsite": "Website",
  "myCommunities": "My communities", "manage": "Manage",
  "metaProfileTitle": "{name} — Yu-Gi-Oh {kind} in {city}",
  "metaProfileDesc": "{name}: address, Discord and listings on 0nefor.one."
}
```

- [ ] **Step 2: Mirror into `fr.json`, `de.json`, `it.json`**

Translate every value (no em dashes). Keep the same keys and the `{name}`/`{city}`/`{kind}` placeholders.

- [ ] **Step 3: Verify parity**

Run: `node -e "const en=require('./frontend/src/locales/en.json'),fr=require('./frontend/src/locales/fr.json'),de=require('./frontend/src/locales/de.json'),it=require('./frontend/src/locales/it.json');const k=Object.keys(en.community).sort();for(const [n,l] of [['fr',fr],['de',de],['it',it]]){const kk=Object.keys(l.community||{}).sort();if(JSON.stringify(k)!==JSON.stringify(kk))throw new Error(n+' community keys differ');}console.log('parity ok:',k.length,'keys')"`
Expected: `parity ok: 34 keys`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/locales/*.json
git commit -m "i18n(community): add community namespace to all locales"
```

---

### Task 7: Directory page + route + nav

**Files:**
- Create: `frontend/src/components/Pages/App/CommunityDirectory.vue`
- Create: `frontend/src/components/community/CommunityCard.vue`
- Modify: `frontend/src/router/index.js` (add route + non-locale redirect)
- Modify: `frontend/src/components/nav/SideNav.vue` (add nav item)

**Interfaces:**
- Consumes: `fetchDirectory` (Task 4), `toQueryParams`/`fromQueryParams` (Task 5), `community.*` i18n (Task 6).
- Produces: route `name: "community"`, path `community`.

- [ ] **Step 1: Build `CommunityCard.vue`**

A presentational card: avatar/initial, name, kind chip, `city, country`, verified badge, remote-duel chip; wraps a `router-link` to `{ name: 'communityProfile', params: { locale, slug } }`. Follow the styling of `frontend/src/components/trade/AnnounceCard.vue` (same `--c-*` tokens, same card radius/border). Props: `{ community: Object }`.

```vue
<script setup>
import { useRoute } from "vue-router";
const props = defineProps({ community: { type: Object, required: true } });
const route = useRoute();
const locale = route.params.locale || "en";
</script>
<template>
  <router-link
    class="cc"
    :to="{ name: 'communityProfile', params: { locale, slug: community.slug } }"
  >
    <div class="cc__avatar">
      <img v-if="community.avatar_url" :src="community.avatar_url" alt="" />
      <span v-else>{{ (community.name || '?')[0].toUpperCase() }}</span>
    </div>
    <div class="cc__body">
      <div class="cc__top">
        <span class="cc__name">{{ community.name }}</span>
        <v-icon v-if="community.verified" icon="mdi-check-decagram" size="15" class="cc__verified" />
      </div>
      <div class="cc__meta">
        <span class="cc__kind">{{ community.kind }}</span>
        <span v-if="community.city">· {{ community.city }}<template v-if="community.country">, {{ community.country }}</template></span>
      </div>
      <div v-if="community.remote_duel" class="cc__remote">
        <v-icon icon="mdi-web" size="12" /> {{ $t('community.remoteDuel') }}
      </div>
    </div>
  </router-link>
</template>
<style scoped>
.cc { display:flex; gap:12px; padding:12px; border:1.5px solid var(--c-border); border-radius:14px; background:var(--c-surface); text-decoration:none; color:var(--c-text); transition:border-color .15s; }
.cc:hover { border-color:var(--c-trade); }
.cc__avatar { width:48px; height:48px; border-radius:12px; overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:var(--c-surface-2); font-weight:800; }
.cc__avatar img { width:100%; height:100%; object-fit:cover; }
.cc__body { min-width:0; display:flex; flex-direction:column; gap:2px; }
.cc__top { display:flex; align-items:center; gap:5px; }
.cc__name { font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cc__verified { color:var(--c-mutual); }
.cc__meta { font-size:12px; color:var(--c-muted); text-transform:capitalize; }
.cc__remote { font-size:11px; color:var(--c-mutual); display:flex; align-items:center; gap:3px; }
</style>
```

- [ ] **Step 2: Build `CommunityDirectory.vue`**

Filter bar (kind pills, country select, remote toggle, search input) synced to the URL via `toQueryParams`/`fromQueryParams` + `router.replace` (mirror the search-filters skill pattern). Grid of `CommunityCard`. "Add your store or community" button opens `CommunityEditDialog` (create mode, wired in Task 9). Pagination via `count`. Loads with `fetchDirectory` on mount and on filter change. Use `useHead` for the directory's own title/description.

Key script shape:
```js
import { ref, reactive, watch, onMounted, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useHead } from "@unhead/vue";
import { fetchDirectory } from "@/lib/community";
import { toQueryParams, fromQueryParams } from "@/lib/communityFilters";
import CommunityCard from "@/components/community/CommunityCard.vue";
// filters = reactive(fromQueryParams(route.query)); rows/count/loading refs;
// load() -> fetchDirectory({...filters, page}); watch(filters) -> router.replace + load();
// useHead({ title: t('community.directoryTitle'), meta:[{name:'description',content:t('community.directorySubtitle')}] })
```

- [ ] **Step 3: Register the route and redirect**

In `frontend/src/router/index.js`, inside the locale children array add:
```js
{ path: 'community', name: 'community', component: () => import(/* webpackChunkName: "community" */ '@/components/Pages/App/CommunityDirectory.vue') },
```
and add a non-locale redirect next to the others:
```js
{ path: '/community', redirect: () => `/${detectLocale()}/community` },
```

- [ ] **Step 4: Add the nav item**

In `frontend/src/components/nav/SideNav.vue`, add a `NavItem` (icon `mdi-storefront-outline`) linking to `{ name: 'community', params: { locale } }`, label `t('community.home')`, following the existing items' markup.

- [ ] **Step 5: Verify in the browser**

Start the dev server, open `/en/community`. Expected: filter bar renders, cards load, changing a filter updates the URL query and the list, no console errors (`read_console_messages`). Screenshot for proof.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Pages/App/CommunityDirectory.vue frontend/src/components/community/CommunityCard.vue frontend/src/router/index.js frontend/src/components/nav/SideNav.vue
git commit -m "feat(community): directory page, card, route and nav entry"
```

---

### Task 8: Profile page + route + SEO

**Files:**
- Create: `frontend/src/components/Pages/App/CommunityProfile.vue`
- Modify: `frontend/src/router/index.js` (route + redirect)

**Interfaces:**
- Consumes: `fetchBySlug` (Task 4), `community.*` i18n. Emits open-events for `ClaimCommunityDialog` (Task 10) and `ReportCommunityDialog` (Task 12), wired then.
- Produces: route `name: "communityProfile"`, path `community/:slug`.

- [ ] **Step 1: Build `CommunityProfile.vue`**

Header (banner/avatar/name/verified badge), identity block (kind, `city, country`, region), action row (website, Discord, "View listings" -> `/trade` filtered by owner if owned), CTA row: if `owner IS NULL` show **Claim this store** (Task 10) + unclaimed notice; always show **Report** (Task 12); if the viewer is the owner show **Edit** (Task 9). A static **map link** (`https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`) when coords exist. `useHead` sets `community.metaProfileTitle/Desc` + `<link rel="canonical">` + JSON-LD (`LocalBusiness` for `kind==='store'` with `geo`, else `Organization`). Fetches on mount by `route.params.slug`; shows a not-found state when null. Reset any dialog state in a `route.params.slug` watcher (dialog reused across profiles).

- [ ] **Step 2: Register the route and redirect**

```js
{ path: 'community/:slug', name: 'communityProfile', component: () => import(/* webpackChunkName: "community-profile" */ '@/components/Pages/App/CommunityProfile.vue') },
```
```js
{ path: '/community/:slug', redirect: (to) => `/${detectLocale()}/community/${to.params.slug}` },
```

- [ ] **Step 3: Verify in the browser + SEO head**

Open `/en/community/<a-seeded-slug>`. Expected: identity renders; `read_page` shows the `<title>` = interpolated `metaProfileTitle`; a `<script type="application/ld+json">` is present; unclaimed profile shows the claim CTA. Screenshot.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Pages/App/CommunityProfile.vue frontend/src/router/index.js
git commit -m "feat(community): SEO profile page with JSON-LD and route"
```

---

### Task 9: Create / edit dialog (`CommunityEditDialog.vue`)

**Files:**
- Create: `frontend/src/components/community/CommunityEditDialog.vue`
- Modify: `CommunityDirectory.vue` (mount, create mode), `CommunityProfile.vue` (mount, edit mode)

**Interfaces:**
- Consumes: `createCommunity`, `updateCommunity` (Task 4), `community.*` i18n.
- Props: `{ modelValue: Boolean, community: Object|null }` (null = create). Emits `update:modelValue`, `saved(community)`.

- [ ] **Step 1: Build the dialog**

Fields: `name` (required, 1-120), `kind` (select store/discord/group; locked to the existing kind in edit mode), `bio` (<=2000), `website`, `discord_url`, `city`, `country`. On submit: create mode -> `createCommunity`, edit mode -> `updateCommunity(community.id, patch)`. Surface thrown validation errors (`assertHttp`, spam cap) in an error bar. Follow `frontend/src/components/trade/CreateAnnounceDialog.vue` for dialog shell, field styles, and width handling (`.dlg { width:100% }` inside a `max-width` `v-dialog`). Emit `saved` with the returned row.

- [ ] **Step 2: Wire into directory (create) and profile (edit)**

Directory "Add your store or community" opens it with `:community="null"`; on `saved`, `router.push` to the new profile. Profile "Edit" (owner only) opens with `:community="community"`; on `saved`, refresh the local object.

- [ ] **Step 3: Verify in the browser**

Open create dialog from the directory, submit a `group` with a name + Discord link. Expected: row created, redirected to its profile, no console errors. Try an invalid `website` ("foo") -> inline error, no crash. Screenshot.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/community/CommunityEditDialog.vue frontend/src/components/Pages/App/CommunityDirectory.vue frontend/src/components/Pages/App/CommunityProfile.vue
git commit -m "feat(community): create/edit profile dialog"
```

---

### Task 10: Claim flow (`ClaimCommunityDialog.vue`)

**Files:**
- Create: `frontend/src/components/community/ClaimCommunityDialog.vue`
- Modify: `CommunityProfile.vue` (mount + open from "Claim this store")

**Interfaces:**
- Consumes: `claimCommunity` (Task 4), auth session from `getClient()`, `community.*` i18n.
- Props: `{ modelValue, community }`. Emits `update:modelValue`, `claimed(community)`.

- [ ] **Step 1: Build the dialog**

If signed out, the primary button triggers Discord OAuth (`signInWithDiscord` from `@/lib/supabaseClient`) and returns via `/auth/callback`. If signed in, `claimConfirm` calls `claimCommunity(community.id)`, then emits `claimed` with the returned row and opens `CommunityEditDialog` in edit mode. Handle the "already claimed" RPC error with a friendly message and a profile refresh.

- [ ] **Step 2: Wire into the profile**

Show "Claim this store" only when `community.owner == null`. On `claimed`, patch the local object (`owner`, `status`) so the CTA flips to the owner view without a reload.

- [ ] **Step 3: Verify in the browser**

Signed in, on an unclaimed seeded profile: click Claim -> confirm -> profile flips to owned, edit dialog opens. Re-open the same profile in another context and confirm the claim button is gone. Screenshot.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/community/ClaimCommunityDialog.vue frontend/src/components/Pages/App/CommunityProfile.vue
git commit -m "feat(community): claim-an-OTS-store flow"
```

---

### Task 11: "My communities" strip on the Account page

**Files:**
- Modify: `frontend/src/components/Pages/App/Account.vue`

**Interfaces:**
- Consumes: `fetchMyCommunities` (Task 4), `community.*` i18n.

- [ ] **Step 1: Add the section**

Below the existing profile section, render a `community.myCommunities` list of the user's owned rows (name, kind, verified badge, status), each with a **Manage** link to its profile and an inline **Edit** button opening `CommunityEditDialog`. Empty state links to the directory's "Add your store or community". Follow Account.vue's existing section markup/spacing.

- [ ] **Step 2: Verify in the browser**

As a user who owns a community, open `/en/account`. Expected: the owned community appears with Manage/Edit; a user who owns none sees the empty state. Screenshot.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Pages/App/Account.vue
git commit -m "feat(community): manage-my-communities strip on account page"
```

---

### Task 12: Report flow (`ReportCommunityDialog.vue`)

**Files:**
- Create: `frontend/src/components/community/ReportCommunityDialog.vue`
- Modify: `CommunityProfile.vue` (mount + open from "Report")

**Interfaces:**
- Consumes: `reportCommunity` (Task 4), `community.*` i18n.
- Props: `{ modelValue, community }`. Emits `update:modelValue`, `sent`.

- [ ] **Step 1: Build the dialog**

Textarea (`reportPlaceholder`, 1-500). Submit -> `reportCommunity(community.id, reason)` -> show `reportSent`, close. Requires auth (the lib throws a friendly error if signed out; surface it). The unique constraint makes a duplicate report a silent success (handled in Task 4).

- [ ] **Step 2: Wire into the profile**

"Report" button (any signed-in viewer) opens the dialog.

- [ ] **Step 3: Verify in the browser**

Submit a report on a profile -> `reportSent` shows -> confirm one `community_report` row via MCP `execute_sql`. Submit again -> still success, still one row (unique constraint). Screenshot.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/community/ReportCommunityDialog.vue frontend/src/components/Pages/App/CommunityProfile.vue
git commit -m "feat(community): report-a-listing flow"
```

---

### Task 13: SSG prerender + sitemap inclusion

**Files:**
- Create: `frontend/src/data/community-slugs.js` (curated prerender list, mirrors `set-slugs.js`)
- Modify: `frontend/vite.config.js` (`includedRoutes`)
- Modify: `frontend/scripts/generate-sitemap.mjs` (community URLs)
- Modify: `frontend/src/components/Pages/Public/LandingPage.vue` (discovery link — optional)

**Interfaces:**
- Consumes: the published `community` rows (via a small build-time query, mirroring how the sitemap script reads Supabase).
- Produces: prerendered `/en/community` + `/{locale}/community` and a curated set of `/en/community/:slug` pages; sitemap entries for the rest.

- [ ] **Step 1: Add the curated slug source**

Create `frontend/src/data/community-slugs.js` exporting `TOP_COMMUNITY_SLUGS` (start with the claimed + verified rows, capped ~200 to avoid a thin-content build explosion; regenerate periodically). Seed it initially from a query: `SELECT slug FROM community WHERE status='published' AND (verified OR owner IS NOT NULL) ORDER BY verified DESC, updated_at DESC LIMIT 200;`

- [ ] **Step 2: Extend `includedRoutes`**

In `frontend/vite.config.js`, inside `includedRoutes`, add the directory for all locales and the curated profiles (English canonical):
```js
for (const locale of locales) included.push(`/${locale}/community`)
for (const slug of TOP_COMMUNITY_SLUGS) included.push('/en/community/' + slug)
```
(import `TOP_COMMUNITY_SLUGS` alongside the existing `TOP_SET_SLUGS` import.)

- [ ] **Step 3: Add sitemap entries**

In `frontend/scripts/generate-sitemap.mjs`, add `/community` (all locales) and each published community slug (English-only, like card pages) using the existing `urlEntry`/`cardUrlEntry` helpers.

- [ ] **Step 4: Verify the build**

Run: `npm --prefix frontend run build` (or the SSG-only step). Expected: build completes; `frontend/dist/en/community/index.html` and a sample `frontend/dist/en/community/<slug>/index.html` exist and contain the interpolated `<title>` and JSON-LD. Confirm `/community` appears in `public/sitemap.xml`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/data/community-slugs.js frontend/vite.config.js frontend/scripts/generate-sitemap.mjs frontend/src/components/Pages/Public/LandingPage.vue
git commit -m "feat(community): SSG prerender + sitemap for community pages"
```

---

## Follow-on Plans (to be detailed separately, not in this plan)

- **`community-events`** (Phase 2): `community_event` table + RLS + moderation status; event create/edit dialogs; calendar + list views; `community_event` embeds on profiles; Discord live linking via the bot; surface official `events.json`. Depends on Task 1's `community` table.
- **`community-advanced`** (Phase 3): `community_member` roles; RSVP/attendance + ICS; owner analytics dashboard; referral/OG-image loops; store reviews (reuse `avg_rating`).

Each will be written with the same bite-sized TDD structure once MVP ships and its assumptions are validated in production.

---

## Self-Review

**1. Spec coverage.** Product strategy (Part A), features/MVP/phases (Part B), UX pages+nav+flows (Part C), data model incl. all requested entities (Part D — users via Trader, stores/communities via `community`, tags as `text[]`, locations denormalized, ownership via `owner`, verification/moderation via `verified`+`status`+`community_report`; events explicitly deferred), functional requirements table (Part E, each row points to a task or a phase), trust & safety (Part F), growth & SEO (Part G), technical architecture (Part H), creative ideas (Part I), execution roadmap + MVP scope + prioritization + risks (this section + Part J). Events/calendar/dashboard are covered as follow-on plans per the confirmed MVP decision, not dropped.

**2. Placeholder scan.** Lib/migration/script tasks (1-6, 13-data) contain complete code. Component tasks (7-12) give complete props/interfaces, the exact data calls, route/nav wiring, and a concrete browser verification, and point to a named existing component to match for shell/styling (AnnounceCard, CreateAnnounceDialog, Account.vue) rather than re-pasting hundreds of lines of CSS — consistent with "follow established patterns." No "TBD"/"add error handling"/"similar to Task N".

**3. Type consistency.** `slugify`/`withSuffix` (Task 2) are used identically in Tasks 3 and 4. `fetchDirectory/fetchBySlug/createCommunity/updateCommunity/claimCommunity/reportCommunity/fetchMyCommunities` (Task 4) match every call site in Tasks 7-12. Route names `community`/`communityProfile` are consistent across Tasks 7, 8, and `CommunityCard`. The `community` table columns in Part D2, Task 1, the seed script (Task 3), and the data layer (Task 4) agree. `claim_community(p_community bigint)` signature matches the `rpc('claim_community', { p_community: id })` call.

**Key risks & tradeoffs (read before executing):**
- **Thin-content SEO risk** across 4,450 seeded pages. Mitigation: prerender only a curated ~200 (Task 13), keep shells substantive, expand as claims add content. Revisit with Search Console data.
- **Seed writes need the service-role key** (owner NULL bypasses RLS). It is provided at run time by the owner and never committed (Task 3). Do not hardcode it.
- **Directory scale:** thousands of published rows are handled by server-side filters + `range` pagination (Task 4), not client-side filtering.
- **Claim security:** the `SECURITY DEFINER` RPC is the only path that can set `owner` on a NULL-owner row; it refuses already-owned rows. Everything else is plain RLS.
- **`Trader` column casing** (PascalCase, quoted) is easy to get wrong; the data layer only touches `community`, which uses snake_case, to avoid that trap.
