# Rebrand: One for One → NoBinder, 0nefor.one → nobinder.com

**Type:** feature
**Status:** draft

## Description

The current brand fails its primary job: nobody can find the product by typing its
name. "One for One" is a common English phrase, and `0nefor.one` is a domain that
has to be spelled out loud every time (the leading character is a zero). Forty-plus
candidate names were tested individually against search collisions, domain
availability, app-store listings and the trademark registers; **NoBinder** was the
only one clean on every axis.

The name says what the product does: your binder, without the binder. The
construction is well precedented — NoSQL databases still store data, NoCode tools
still build software; the "No" negates the old method, not the outcome.

**Why this is needed (business value):** Branded search is the whole point. A
unique string means the product owns page one for its own name from day one, which
"One for One" can never do. Nothing competes for "NoBinder" in any register or app
store.

**Who benefits:** Users who hear the name and try to find it; the business, via
brand searches that currently leak to unrelated results.

**Key constraints:** ~600 prerendered URLs already carry PageRank and sit in a
verified Search Console property. Nothing may 404. The four locale files must move
in lockstep. Several integration points fail *silently* if missed.

**User Scenarios:**
1. **Primary Flow:** A user hears "NoBinder", types it into Google, and the site is
   the first result. Any old `0nefor.one` URL they have bookmarked 301s to the same
   path on `nobinder.com`.
2. **Alternative Flow:** A crawler requests an old prerendered card URL → receives a
   301 to the new host, same path, and the new page carries the correct canonical.
3. **Error Handling:** A missed integration (email domain, Stripe webhook, Discord
   OAuth) must fail loudly in staging, not silently in production.

## User Request

> "yes, and add the sitemap guard first"

Following the naming research in this session, which eliminated FaceUpCard on a
live USPTO word mark (serial 87806437, classes 009 + 042, FaceUp Technology s.r.o.)
and cleared NoBinder in both USPTO and EUIPO.

## Prerequisites

- [ ] `nobinder.com` purchased (~$11.25/yr). Optionally `nobinder.app` (~$15).
- [ ] `0nefor.one` renewal extended by several years — it becomes the redirect host
      and must not lapse.
- [ ] **PR #46 merged** (sitemap degradation guard). Without it, a Supabase blip
      during the migration build silently drops the sitemap from 771 to 593 URLs and
      stops ~180 card pages being prerendered — indistinguishable from the migration
      itself having gone wrong.
- [ ] Trademark clearance by an attorney. The searches run here were exact-string
      wordmark only, and did **not** cover Switzerland's IPI — the home market.

## Scope

**In scope:**
- Every hardcoded `0nefor.one` reference (~148 real, excluding the generated sitemap)
- Every user-facing "One for One" string (311, of which 162 are in the locale files)
- Logo and icon assets that have the wordmark drawn into them
- All external service configuration listed in Phase 4
- 301 redirects and Search Console change-of-address

**Out of scope:**
- Any change to product behaviour, routing shape, or URL paths — **host only**
- Adding a game segment to URLs (`/en/yugioh/...`). Deferred until a second TCG
  actually exists; it is a mechanical follow-up, unlike a host change.
- The `.specs/`, `docs/` and `graphify-out/` historical records, which describe what
  was true when written and should not be rewritten.

## Constraints

- `frontend/src/locales/{en,de,fr,it}.json` must keep identical key sets. German
  informal (Du), French formal (Vous), Italian informal (Tu).
- 16 title keys carry the brand inside a vue-i18n `{'|'}` plural escape. The escape
  must survive; an unescaped `|` silently truncates every title.
- Supabase Edge Functions do **not** deploy on push. They need `supabase functions
  deploy` per function.
- Vercel, Railway and Cloudflare all redeploy on merge — do not list those as steps.

## Acceptance Criteria

### Functional Requirements
1. No `0nefor.one` remains in `frontend/src/`, `frontend/scripts/`, `frontend/index.html`,
   `frontend/public/robots.txt`, `supabase/functions/`, `discord-bot/`, or `discord-activity/`.
2. Every old URL 301s to the same path on the new host, including all ~600 prerendered pages.
3. Sign-in works via Discord OAuth on the new host.
4. Verification-code emails arrive (store claim + community verify), not in spam.
5. Stripe checkout completes and its webhook reaches the new host.
6. The Discord bot posts announces linking to the new host; slash-command
   descriptions show the new brand.
7. `sitemap.xml` regenerates with the new host at **771 URLs**, not 593.

### Non-Functional Requirements
8. No measurable ranking loss beyond the normal migration dip after 8 weeks.
9. `0nefor.one` continues to serve redirects indefinitely.

### Definition of Done
- [ ] `npm run build` passes, including `verify-ssg-output.mjs`
- [ ] Full vitest suite green
- [ ] Change-of-address submitted in Search Console
- [ ] All five Edge Functions redeployed and smoke-tested

## Architecture Overview

### Key Decisions

**One source of truth for the host.** `BASE = "https://0nefor.one"` is currently
redeclared in six places. Introduce `frontend/src/lib/siteUrl.js` (with a test
beside it, per repo convention) and import it. `index.html` and `robots.txt` cannot
import — they need build-time substitution or a documented manual edit.

**Host-only change.** Paths do not move. This keeps the redirect rule a single
path-preserving rule rather than a mapping table, and keeps the diff reviewable.

**Historical records stay as written.** `.specs/`, `docs/`, `graphify-out/` describe
past state.

### Expected File Changes

| Area | Files | Notes |
|---|---|---|
| Host constant | `views/App.vue:62`, `CardPage.vue:450`, `ArchetypePage.vue:90`, `CommunityProfile.vue:291`, `TraderPage.vue:53`, `scripts/generate-sitemap.mjs:39` | six `BASE` declarations → one module |
| Host literals | `SetPage.vue` (10), `index.html` (8), `public/robots.txt`, `scripts/verify-ssg-output.mjs:162`, `scripts/generate-sitemap.mjs:114` | |
| Brand strings | `locales/{en,de,fr,it}.json` (162) | lockstep; 16 are inside `{'|'}` escapes |
| Brand strings | `TermsPage.vue` (9), `PrivacyPage.vue`, `LandingPage.vue`, `StartPage.vue`, `SideNav.vue`, `BuiltWithPage.vue`, `DecksPage.vue`, `DeckDetailPage.vue`, `lib/communityVerify.js` | |
| Assets | `public/logo.svg` (wordmark is drawn into the file), `logo.png`, `favicon.ico`, `public/logos/` | design work, not code |
| Edge Functions | `claim-portal:16`, `claim-create-checkout:20`, `claim-request-code:15`, `community-verify-request-code:34` | `SITE` and `FROM` |
| Discord bot | `index.js` (13), `lib/slashCommands.js` (5), `lib/eventPost.js`, `lib/closeAnnounce.js`, `.env.example` | `APP_URL` is already env-driven |
| Package names | `discord-bot/package.json`, `discord-activity/package.json` | both embed the old brand |

## Implementation Process

### Phase 0 — Prerequisites
Buy the domain, extend the old registration, merge PR #46, start trademark clearance.

### Phase 1 — Host in code (~2h)
1. Add `frontend/src/lib/siteUrl.js` + test.
2. Replace the six `BASE` declarations with imports.
3. Replace remaining literals, including `robots.txt` and `verify-ssg-output.mjs:162`.
4. Regenerate the sitemap; confirm 771 URLs on the new host.

### Phase 2 — Brand strings (~3–4h)
5. Rewrite the 162 locale strings across all four files together. This is a read,
   not a replace — several read as prose ("One for One connects Yu-Gi-Oh! collectors…").
6. Preserve `{'|'}` escapes in the 16 title keys.
7. Update the component-level brand strings and the copyright line.

### Phase 3 — Assets
8. New logo without the old wordmark; regenerate `logo.png`, `favicon.ico`, `public/logos/`.

### Phase 4 — External services (~2–3h + DNS propagation)
9. **Email first, it has the longest lead time.** Add `nobinder.com` to Resend,
    publish SPF/DKIM/DMARC, verify, then change both `FROM` constants.
10. Redeploy all five Edge Functions.
11. Supabase Auth: Site URL + redirect allowlist.
12. Discord Developer Portal: OAuth redirect URIs, and the Activity URL mapping.
13. Stripe: webhook endpoint + Checkout return URLs.
14. Railway: `APP_URL` env var for the bot.
15. Re-register Discord slash commands so the new descriptions take effect.

### Phase 5 — Redirects and SEO (~3h, then months of monitoring)
16. Point `nobinder.com` at the Vercel project; keep `0nefor.one` as a
    path-preserving 301 source.
17. New Search Console property; new `google-site-verification` tag in `index.html`.
18. **Change of Address** in the old property — this is the step that actually tells Google.
19. Resubmit `sitemap.xml`.

### Phase 6 — Verification
20. Full build + `verify-ssg-output.mjs` + vitest.
21. Smoke-test each item in the Functional Requirements list against production.
22. Watch Search Console coverage weekly for 8 weeks.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Email domain not verified** | Store claims and community verification break with no error anywhere | Do it first; send a real test through both Edge Functions before cutover |
| **Stripe webhook not updated** | Subscriptions stop syncing. Silent, and it is revenue | Verify in the Stripe dashboard event log, not by assumption |
| **Sitemap degradation during cutover** | Looks like catastrophic ranking loss | PR #46 is a prerequisite for exactly this |
| **Discord OAuth redirect missed** | Login breaks completely | Loud, so it will be caught — but test it first anyway |
| **Locale drift** | Broken i18n, the most common failure mode in this repo | Diff `sorted(keys)` across all four files before commit |
| **Old domain lapses** | Every backlink and bookmark dies at once | Extend registration in Phase 0, set a calendar reminder |
