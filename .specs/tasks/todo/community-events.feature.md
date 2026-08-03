# Community Events — owner-created events on a community profile

## Type
`feature`

## Description

Community owners (a claimed store, Discord server, or group whose `community.owner = auth.uid()`) can create, edit, and delete **events** on their community profile: locals, tournaments, meetups, release-day sales, online tournaments, etc. Public visitors to a community profile see a list of that community's **upcoming** events; past events are hidden from the public list by default.

An event is a lightweight record owned (transitively) by its parent community: title, description, start/end time, an online/in-person flag with an optional location and details URL, and an optional cover image. There is no attendance, ticketing, payment, or notification behavior in this feature.

The goal is to let owners publish "what's happening at our store/server" directly on the profile we already built, reusing the established ownership + RLS patterns (owner-write through the parent `community`, public-read of published rows), with no new Edge Function.

## Scope Clarification

Built on top of existing, working pieces that must **not** be rebuilt:
- `community` table + RLS (`community_select_public`, `community_update_own`, owner = `auth.uid()`), and the claimed-owner concept (`isOwner` in `CommunityProfile.vue`).
- `CommunityProfile.vue` profile page (identity header, two-column body, inline owner-edit mode, links rail, map).
- `CommunityEditDialog.vue` create-community modal (the pattern to mirror for the event create/edit dialog).
- i18n across `en/fr/de/it` under the `community` namespace; router route `communityProfile` at `community/:slug`.

### In scope
- New `community_event` table + RLS + indexes (one migration).
- Owner CRUD of events (create / edit / delete) via PostgREST + RLS (no Edge Function), surfaced through a **dedicated owner-only events manager on the profile — separate from the profile inline-edit mode** (decision 1).
- Public display of **upcoming** events, plus a **collapsed "Past events"** list on the community profile (decision 2).
- **Event cover image uploaded during event creation** (in the create/edit dialog), reusing the existing `uploadCommunityMedia` storage flow (decision 3).
- `communityEvents.js` data-access module + unit tests for its validation helpers.
- i18n keys in all four locales.
- Event JSON-LD (`schema.org/Event`) for upcoming events on the profile (SEO, consistent with existing profile JSON-LD).

### Out of scope (explicitly, for v1)
- RSVP / attendance / headcount.
- Ticketing, payments, Stripe.
- Recurring events / series.
- Reminders, emails, push, notifications.
- A cross-community global events directory or calendar page.
- Event moderation / reporting (community-level report already exists; not extended to events here).
- `.ics` / "Add to calendar" export (decision 4 — left out for v1).

## Acceptance Criteria

### Data model & security (RLS)
- [ ] A `community_event` row references `community(id)` with `ON DELETE CASCADE`; deleting a community removes its events.
- [ ] Events carry **no `owner` column** — ownership is derived through the parent community (`community.owner = auth.uid()`), matching the app's single-source-of-ownership pattern.
- [ ] **Public SELECT**: an anonymous or non-owner user can read an event only when `status = 'published'` **and** its parent community is `published`.
- [ ] **Owner SELECT**: the community owner can read all of their own community's events, including `hidden` ones.
- [ ] **INSERT/UPDATE/DELETE**: permitted only when the caller owns the parent community; a non-owner PostgREST call is rejected by RLS (verified against the live policy, not just the client).
- [ ] `starts_at` is required; `ends_at` is optional and, when present, must be `>= starts_at` (DB `CHECK`).
- [ ] `title` length 1–140; `description` length ≤ 2000 (DB `CHECK`), mirroring `community` constraints.
- [ ] A schema-reload (`NOTIFY pgrst, 'reload schema'`) is issued at the end of the migration.

### Owner CRUD (frontend)
- [ ] On a community the current user owns, the profile exposes a **dedicated owner-only events manager** that is **independent of the profile inline-edit mode** (decision 1): an "Add event" affordance plus per-event edit/delete, visible to the owner whether or not they are editing the rest of the profile.
- [ ] Creating an event with a title, start datetime, and optional end/location/url/**cover image** persists it and it appears in the list without a full reload.
- [ ] The create/edit dialog lets the owner **upload a cover image at creation time** via `uploadCommunityMedia`; upload shows progress and blocks save until it finishes; an event with no cover is still valid.
- [ ] Editing an event updates it in place; canceling discards changes.
- [ ] Deleting an event asks for confirmation, then removes it from the list.
- [ ] The event form validates: non-empty title ≤ 140, description ≤ 2000, `ends_at >= starts_at`, and `url` (if present) starts with `http(s)://` (reuse the `assertHttp` style already in `community.js`).
- [ ] Online events (`is_online = true`) do not require a physical `location`; in-person events may default `location` to the community's city when left blank.

### Public display
- [ ] The community profile renders an **Events** section listing upcoming events (`starts_at >= now()`), soonest first, each showing title, formatted date/time (locale-aware), online/in-person + location, and a link if `url` is set.
- [ ] When a community has no upcoming events, the section shows a quiet empty state for owners (prompting them to add one) and is hidden or minimal for the public — never an empty box.
- [ ] Past events (`starts_at < now()`) render in a **collapsed "Past events"** disclosure below the upcoming list (decision 2): collapsed by default, expandable, most-recent first; shown to public and owner alike when any exist, hidden entirely when there are none.
- [ ] Date/time formatting is locale-aware (`en/fr/de/it`) via `Intl.DateTimeFormat`, and respects the stored timezone for display where provided.

### i18n & design
- [ ] All new copy exists in `en`, `fr`, `de`, `it` under the `community` namespace (section title, add/edit/delete, field labels, empty state, validation messages, online/in-person).
- [ ] The Events UI uses existing design tokens (`--c-text`, `--c-muted`, `--c-border`, `--c-surface-2`, `--c-trade`, etc.) and matches the profile's visual language (no new component library, no card-in-card nesting, amethyst as the accent).
- [ ] Mobile: the events list and the event form produce no horizontal overflow; controls meet the 44px touch target used elsewhere on the profile.

### SEO
- [ ] For a published community with ≥1 upcoming event, the profile emits `schema.org/Event` JSON-LD (name, startDate, endDate?, eventAttendanceMode, location or virtualLocation, url?), added alongside the existing `LocalBusiness`/`Organization` JSON-LD without breaking it.

### Quality gates
- [ ] `npm run test` green, including new unit tests for `communityEvents.js` validation/formatting helpers.
- [ ] `npm run build` (`vite-ssg`) green; SSR prerender of the profile does not crash on the events section (guard against `window`/timezone-only-at-runtime assumptions).
- [ ] Zero console errors on the profile with and without events.

## Edge Cases

| Scenario | Expected behavior |
|---|---|
| Non-owner attempts to POST/PATCH/DELETE an event via crafted PostgREST call | Rejected by RLS (owner-through-parent check); no row written. |
| Parent community is `hidden`/`draft` | Public cannot see its events even if `status='published'`; owner still can. |
| `ends_at` earlier than `starts_at` | Rejected client-side (form invalid) and by DB `CHECK`. |
| Event with `starts_at` in the past | Excluded from the upcoming list; appears in the collapsed "Past events" disclosure; not deleted automatically. |
| No past events | "Past events" disclosure hidden entirely (no empty toggle). |
| Online event with no location | Allowed; renders as "Online" with the `url` as the join link. |
| Very long title/description | Clamped by `maxlength` in the form and DB `CHECK`; no overflow. |
| Community deleted while it has events | Events cascade-deleted. |
| No upcoming events (public viewer) | Section hidden or minimal; never an empty framed box. |
| No upcoming events (owner) | Quiet empty state with an "Add event" prompt. |
| SSR prerender (no browser timezone) | Date formatting falls back safely (e.g. UTC or stored tz); no crash. |

## Architecture Overview

### Solution strategy
Reuse the **owner-through-parent** authorization model rather than adding an `owner` column to events. Events are plain rows guarded by RLS policies that subquery `community` for ownership/publish state — the same trust boundary as `community_report`, so **no Edge Function or `SECURITY DEFINER` RPC is required** (unlike the claim flow, which needed service-role because it mutates a NULL-owner row). Client writes go straight through PostgREST under RLS.

Display lives in the profile we already built: an **Events** section in the left column of `CommunityProfile.vue` (upcoming list + collapsed "Past events" disclosure). Owner controls live in a **dedicated owner-only events manager that is independent of the profile inline-edit mode** (decision 1) — the owner sees "Add event" and per-event edit/delete on their own profile without entering edit mode. Create/edit uses a dedicated modal mirroring `CommunityEditDialog.vue`, extended with a **cover-image upload** (`uploadCommunityMedia`) so the cover is set at creation time (decision 3).

### Data model (migration sketch — `supabase/migrations/YYYYMMDD_community_events.sql`)
```sql
CREATE TABLE IF NOT EXISTS community_event (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community    bigint NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  title        text   NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  description  text   NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz CHECK (ends_at IS NULL OR ends_at >= starts_at),
  timezone     text,                         -- IANA name for display, optional
  is_online    boolean NOT NULL DEFAULT false,
  location     text,                         -- venue/address; may default to community.city
  url          text,                         -- registration / details / join link
  cover_url    text,
  status       text NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_event_community_start ON community_event (community, starts_at);
CREATE INDEX IF NOT EXISTS idx_community_event_start ON community_event (starts_at);

ALTER TABLE community_event ENABLE ROW LEVEL SECURITY;

-- Public reads published events of published communities; owner reads all of theirs.
CREATE POLICY "community_event_select" ON community_event FOR SELECT USING (
  EXISTS (SELECT 1 FROM community c WHERE c.id = community_event.community
          AND ((community_event.status = 'published' AND c.status = 'published')
               OR c.owner = auth.uid()))
);
-- Write only when caller owns the parent community.
CREATE POLICY "community_event_insert_owner" ON community_event FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM community c WHERE c.id = community_event.community AND c.owner = auth.uid())
);
CREATE POLICY "community_event_update_owner" ON community_event FOR UPDATE
  USING     (EXISTS (SELECT 1 FROM community c WHERE c.id = community_event.community AND c.owner = auth.uid()))
  WITH CHECK(EXISTS (SELECT 1 FROM community c WHERE c.id = community_event.community AND c.owner = auth.uid()));
CREATE POLICY "community_event_delete_owner" ON community_event FOR DELETE
  USING     (EXISTS (SELECT 1 FROM community c WHERE c.id = community_event.community AND c.owner = auth.uid()));

NOTIFY pgrst, 'reload schema';
```

### Files
**Create**
- `supabase/migrations/YYYYMMDD_community_events.sql` — table, indexes, RLS.
- `frontend/src/lib/communityEvents.js` — `fetchEvents(communityId)` (RLS returns everything the caller may see: published-for-public, all-for-owner), `createEvent`, `updateEvent`, `deleteEvent`, plus `validateEvent()`, `partitionEvents(rows)` (→ `{ upcoming, past }` on `starts_at` vs now), and `formatEventWhen(event, locale)` helpers. Cover upload reuses `uploadCommunityMedia`.
- `frontend/src/lib/communityEvents.test.js` — unit tests for validation + date formatting.
- `frontend/src/components/community/CommunityEventDialog.vue` — create/edit modal (mirrors `CommunityEditDialog.vue`), with datetime fields, online toggle, and cover-image upload.
- `frontend/src/components/community/CommunityEvents.vue` — the profile Events section: upcoming list, collapsed "Past events" disclosure, and (for owners) the independent manager controls (Add / edit / delete).

**Modify**
- `frontend/src/components/Pages/App/CommunityProfile.vue` — add Events section to the body; wire owner add/edit/delete; add Event JSON-LD to `useHead`.
- `frontend/src/locales/en.json`, `fr.json`, `de.json`, `it.json` — new `community.*` event keys.

### Key decisions & trade-offs
- **No `owner` column on events** (derive through parent): single source of truth, cascades correctly, matches the codebase; trade-off is subquery-based RLS (fine at this scale, indexed by `community`).
- **PostgREST + RLS, no Edge Function**: events are ordinary owner CRUD; the claim-style service-role path is unnecessary and would add surface area.
- **Modal for create/edit, owner manager separate from profile edit mode** (decision 1): a datetime + cover-upload form is a justified modal and matches the existing create-community modal; the manager is always available to the owner, decoupled from the profile's inline-edit toggle.
- **Cover uploaded at creation** (decision 3): reuse `uploadCommunityMedia(communityId, "event", file)` + `validateImageFile`. **Verified:** the `community-media` storage RLS only checks that the first path segment is a community the caller owns; `kind` is unconstrained, so **no storage-migration change is needed** for an `"event"` cover. `cover_url` stored on the event, cover optional. Caveat: deleting an event leaves its cover object orphaned in the bucket — the same accepted behavior as avatar/banner replacement (timestamped, `upsert:false`); bucket cleanup is out of scope.
- **Collapsed past events** (decision 2): a single query fetches the community's events; the client partitions on `starts_at` vs now into an upcoming list and a collapsed past disclosure.
- **`timezone` stored for display only**: avoids per-user tz complexity; `starts_at` is an absolute `timestamptz`.

## Implementation Process

### Phase 1 — Data layer (foundational)
1. **Migration `community_event`** — write the table/indexes/RLS per the sketch; apply via `apply_migration` to project `sxteuctysfiwripnaozi`; verify policies with a non-owner SELECT/INSERT probe.
   - Success: table exists; a non-owner cannot INSERT/UPDATE/DELETE; public sees only published events of published communities; owner sees own hidden events.
   - Risk: RLS subquery correctness. Mitigate with explicit SQL probes for public / owner / non-owner before touching the frontend.
2. **`communityEvents.js`** — CRUD + `validateEvent()` (title/desc length, `ends_at >= starts_at`, `assertHttp(url)`) + `partitionEvents()` (upcoming vs past) + `formatEventWhen(event, locale)` via `Intl.DateTimeFormat`.
   - Success: functions exported; validation/partition/formatting unit-tested (`communityEvents.test.js`); tests green.
   - Risk: SSR/`Intl` timezone. Mitigate: pass explicit `timeZone` when available, fall back to `'UTC'`; never read `window` at module scope.

### Phase 2 — Public display (depends on Phase 1)
3. **`CommunityEvents.vue` section + wire into `CommunityProfile.vue`** — fetch events on load (reset on slug change like the existing `load()`), partition into upcoming + past; render the upcoming list and a **collapsed "Past events"** disclosure with locale-aware date/time, online/in-person + location, cover thumbnail, optional link; quiet empty state.
   - Success: renders on a store with events; upcoming + collapsed past both correct; hidden/minimal when none (public); no console errors; no mobile overflow.
   - Risk: interaction with the two-column layout and stale-guard (`reqId`) pattern. Mitigate: mirror the existing fetch/reset lifecycle already in the component.
4. **Event JSON-LD** — extend `useHead` to emit `schema.org/Event[]` for upcoming events without breaking existing JSON-LD.
   - Success: valid JSON-LD present for a community with upcoming events; existing `LocalBusiness`/`Organization` unchanged.

### Phase 3 — Owner CRUD (depends on Phase 1; parallelizable with Phase 2 after step 2)
5. **`CommunityEventDialog.vue`** — create/edit modal mirroring `CommunityEditDialog.vue`; datetime inputs; online toggle; **cover-image upload via `uploadCommunityMedia`** (progress + `validateImageFile`, save blocked mid-upload); validation; calls `createEvent`/`updateEvent`.
   - Success: owner can create + edit with a cover; validation blocks bad input; dialog resets on open; cover optional.
6. **Owner manager (independent of edit mode)** — in `CommunityEvents.vue`, when `isOwner`, show an always-available "Add event" button and per-event edit/delete (confirm) — **not gated by the profile's inline-edit toggle**; optimistic list update.
   - Success: owner add/edit/delete reflected without full reload; controls visible outside edit mode; non-owner never sees controls.
   - Risk: owner vs public visibility of hidden/past. Mitigate: RLS returns the right rows per caller; the client shows manager controls only when `isOwner`.

### Phase 4 — i18n, polish, verification
7. **i18n** — add keys to all four locales; no hardcoded strings; aria-labels localized.
8. **Verification pass** — `npm run test` + `npm run build` green; manual browser check (view-mode with/without events on desktop + mobile); owner flow verified once signed in (owner-gated, like existing edit).

### Implementation summary

| Step | Output | Depends on | Suggested agent (if delegating) |
|---|---|---|---|
| 1 | migration + RLS applied | — | opus |
| 2 | `communityEvents.js` + tests | — | sonnet |
| 3 | events section (public) | 1,2 | opus |
| 4 | Event JSON-LD | 1,2 | sonnet |
| 5 | `CommunityEventDialog.vue` | 1,2 | opus |
| 6 | owner controls wired | 3,5 | opus |
| 7 | i18n (4 locales) | 3,5,6 | haiku/sonnet |
| 8 | tests+build+browser verify | all | opus |

Parallelizable: steps **3** and **5** can run in parallel once **2** lands (both depend only on the data layer); **4** parallel with **3**. **6** joins **3+5**. **7** after UI text is stable.

## Definition of Done
- Migration applied; RLS proven (public / owner / non-owner probes) and committed as a migration file.
- Owner can create/edit/delete events; public sees upcoming events; both verified in the browser (owner flow once signed in).
- i18n complete in `en/fr/de/it`; design tokens respected; no mobile overflow; 44px targets.
- Event JSON-LD emitted; existing JSON-LD intact.
- `npm run test` and `npm run build` green; zero console errors.

## Verification (lightweight, per phase)
- **Phase 1**: SQL probes asserting the three access classes; unit tests for `validateEvent`/`formatEventWhen`.
- **Phase 2/3**: browser screenshots (desktop + mobile) of the events section empty and populated; console clean.
- **Phase 4**: `npm run test`, `npm run build`, and a locale spot-check (switch `fr`/`de`/`it` and confirm labels + date formatting).

## Resolved decisions
1. **Owner manager placement** → a **dedicated owner-only events manager, independent of the profile inline-edit mode** (always available to the owner).
2. **Past events** → shown in a **collapsed "Past events"** disclosure (not hidden from the public).
3. **Cover image** → **uploaded during event creation** in the dialog, reusing `uploadCommunityMedia`; cover is optional.
4. **`.ics` / "Add to calendar"** → **out of scope** for v1.
