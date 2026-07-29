# Community Menu Item (Profile Dropdown) — Design

**Status:** Approved design, pending spec review
**Date:** 2026-07-29

## Problem

An owner of a claimed community has no quick way to jump to their community from the top-right profile menu (`UserMenuChip`). The only paths are the public directory (left sidebar) or the Account page's "My communities" strip.

## Goal

Add one item to the profile dropdown — **"My community"** — shown **only to users who own at least one community**, that takes them straight to their community (or to their list if they own several).

## Locked decisions

- **Owners only.** The item renders only when the signed-in user owns ≥1 community.
- **Destination:** owns exactly 1 → that community's profile page; owns 2+ → the Account "My communities" list.
- **Label:** "My community" (singular; the common case is one).
- **No backend/route/schema changes** — reuses the existing `communityProfile` and `account` routes and a single owner-scoped read.

## Scope

- **`frontend/src/components/nav/UserMenuChip.vue`** — the only component changed:
  - On user load (the existing `watch(() => props.login?.user?.id, …)`), run a second read: `community` where `owner = <user id>`, `select("slug")`, `limit(2)`. Store the resulting slugs (0, 1, or capped at 2).
  - Compute the menu target with the pure helper below.
  - Render a **"My community"** item (icon `mdi-storefront-outline`) in the dropdown, directly under the existing Account item, only when a target exists. Clicking it closes the menu and routes to the target via `useRouter().push(...)`.
- **`frontend/src/lib/communityMenu.js`** (new, pure, unit-tested):
  - `communityMenuTarget(slugs, locale) -> routeLocation | null`
    - `[]` → `null` (hide the item)
    - `['x']` → `{ name: 'communityProfile', params: { locale, slug: 'x' } }`
    - `['x','y', …]` → `{ name: 'account', params: { locale } }`
  - Keeps the branching logic testable without a component/DOM.
- **`frontend/src/locales/{en,fr,de,it}.json`** — one key: `userMenu.myCommunity`.

## Data flow

1. `UserMenuChip` already watches `props.login.user.id` and loads the Trader profile. Add, in the same handler, an owned-communities read (owner = id, select slug, limit 2). Guard against the stale-response race the same way (only the latest user id's result applies) — simplest: re-fetch on every id change and null out on sign-out.
2. `ownedSlugs` (array, length 0–2) feeds `communityMenuTarget(ownedSlugs, currentLocale)`.
3. The template shows the item only when the target is non-null; on click it calls `router.push(target)` and closes the menu.

The read is owner-scoped and returns only the caller's rows (existing `community` RLS already restricts writes; slug is public data, and filtering by `owner = auth.uid()` returns just the caller's communities). No new policy needed.

## Locale (all 4, no em dashes)

- en: `"myCommunity": "My community"`
- fr: `"myCommunity": "Ma communauté"`
- de: `"myCommunity": "Meine Community"`
- it: `"myCommunity": "La mia community"`

## Error handling & edge cases

- **Signed out / no user:** the watcher nulls `ownedSlugs`; target is null; item hidden. (The chip itself only renders for signed-in users.)
- **Read fails:** treat as no owned communities (item hidden) and log; never block the menu.
- **Owns 2+:** target routes to `/account`; the "My communities" strip there lists all with Manage/edit.
- **Locale:** the target carries the current locale param so the destination stays in-locale.
- **Freshly claimed community mid-session:** the item appears on the next user-id change / menu remount; not real-time. Acceptable (a page load refreshes it).

## Testing

Matches repo convention (pure logic → Vitest; component → browser):
- **Unit (Vitest):** `communityMenuTarget` — empty → null; single → communityProfile with slug+locale; multiple → account with locale; locale threaded through.
- **Manual/browser:** an owner sees "My community" and clicking it lands on their community (single) or the Account list (multiple); a non-owner (and signed-out) never sees it.

## Files

- Create: `frontend/src/lib/communityMenu.js` (+ `.test.js`).
- Modify: `frontend/src/components/nav/UserMenuChip.vue`.
- Modify: `frontend/src/locales/{en,fr,de,it}.json`.

## Risks & tradeoffs

- **Extra read per sign-in:** one small `select slug limit 2` on user load — negligible.
- **Not real-time** for a community claimed in the same session — resolves on next load; acceptable for this menu.
- **Nav/page-state sync:** the existing menu items emit `navigate` → the parent's `changePage` (which also updates `App.vue`'s active-page state). This item routes via `router.push` directly. The plan must verify the app's active-page/sidebar highlight stays correct after the push (App.vue is expected to sync `page` from the route on deep-link/refresh); if it does not, route this item through the parent instead. Reaching a community profile or `/account` should behave the same as a normal in-app navigation.
