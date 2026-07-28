# Inline Community Profile Editing — Design

**Status:** Approved design, pending spec review
**Date:** 2026-07-28

## Problem

Editing a claimed community profile happens in a modal (`CommunityEditDialog`) that floats over the page. You can't see how a change looks until you save and close. It "feels wrong" — the edit form and the thing being edited are separated. Also, the avatar and banner images are shown prominently on the profile but **cannot be set anywhere in the UI today** (the create/edit dialog never exposed them).

## Goal

Replace the modal EDIT flow with **in-place editing on the profile itself**, so changes preview live as you type, and extend it to cover **avatar and banner image uploads**. Creating a new community keeps its dialog (there is no profile to edit in place yet).

## Locked decisions

- **Edit-mode toggle, not always-on.** The owner clicks the existing "Edit" button to flip the profile into edit mode; a sticky **Save / Cancel** bar appears. This gives a clear editing state and an atomic save (vs. auto-save-per-field or click-to-edit-per-field, both rejected).
- **One atomic save.** Save commits all changed fields (text + `avatar_url` + `banner_url`) via the existing `updateCommunity` in a single write. Cancel discards local edits and restores the loaded values.
- **Images upload on file-select** (so the preview is the real uploaded image immediately); the returned public URL is held in local edit state and persisted only on Save.
- **Owner-scoped Storage RLS.** A signed-in user may write only into the storage folder of a community they own.
- **Create stays a dialog.** `CommunityEditDialog` becomes create-only; its EDIT branch is removed.

## Scope

**Editable in place (edit mode):**
| Field | Control |
|---|---|
| `banner_url` | "Change banner" overlay on the banner → file upload |
| `avatar_url` | camera badge on the avatar → file upload |
| `name` | inline text input styled as the `<h1>` (required, 1–120) |
| `city` | inline text input |
| `country` | inline `<select>` from `COUNTRIES` |
| `bio` | inline auto-growing textarea (≤ 2000) |
| `website` | inline URL input (must be `http(s)`) |
| `discord_url` | inline URL input (must be `http(s)`) |

**Not editable:** `kind` (fixed after creation, unchanged from today), `slug`, `verified`, `owner`, `status`, `region`, `tags`, `remote_duel` (out of scope for this pass — no UI for them today).

## Components & data flow

### Storage

- **Bucket `community-media`** (new), `public = true` (public read for rendering images).
- **Path convention:** `{communityId}/avatar-{timestamp}.{ext}` and `{communityId}/banner-{timestamp}.{ext}`. The first path segment is the community id — the RLS anchor. Timestamped filenames avoid CDN cache staleness on re-upload.
- **RLS on `storage.objects`:**
  - Public **SELECT** for `bucket_id = 'community-media'`.
  - **INSERT / UPDATE / DELETE** for `authenticated` only where `bucket_id = 'community-media'` **and** `(storage.foldername(name))[1] IN (SELECT id::text FROM community WHERE owner = auth.uid())`. So a user can only write into folders of communities they own.
- Orphaned files (upload then Cancel, or replaced images) are left in place for v1 — cheap; a cleanup pass is a future nicety, not built now.

### Frontend

- **`CommunityProfile.vue`** gains edit-mode state:
  - `editing` (bool), an `edit` reactive object holding the working copy of the editable fields (seeded from `community` when entering edit mode).
  - The template renders each editable region as its display element when `!editing`, or its input when `editing`.
  - Banner/avatar get a hidden `<input type="file">` + an overlay trigger; on change, call the upload helper, set `edit.avatar_url` / `edit.banner_url` to the returned URL (live preview), show a per-image uploading spinner.
  - A sticky **Save/Cancel** bar (bottom, mobile-friendly) shown only in edit mode. Save is disabled while any upload is in flight or validation fails.
  - `saveEdits()` builds the patch and calls `updateCommunity(id, patch)`, then patches `community` in place and exits edit mode. `cancelEdits()` drops `edit` and exits.
  - The `@edit`/dialog wiring for EDIT is removed; the "Edit" button now toggles `editing`.
- **`src/lib/communityMedia.js`** (new, small):
  - `validateImageFile(file) -> { ok, error }` — pure: `image/*` mime + ≤ 5 MB. Unit-tested.
  - `mediaPath(communityId, kind, file) -> string` — pure: builds `{id}/{kind}-{ts}.{ext}` from the file's extension. Unit-tested.
  - `uploadCommunityMedia(communityId, kind, file) -> url` — uploads to the `community-media` bucket via the Supabase client and returns the public URL. (Thin wrapper; not unit-tested, matches repo convention for client-backed helpers.)
- **`CommunityProfile.vue`** also reads `?edit=1` on mount: if present and the viewer is the owner, it enters edit mode automatically (so the Account strip can deep-link into editing).
- **`CommunityEditDialog.vue`** — remove the EDIT branch (the `community` prop / `isEdit` path); it becomes create-only. The profile no longer opens it. The Account "My communities" strip's **edit pencil becomes a `router-link` to the community profile with `?edit=1`** (deep-linking into inline edit) instead of opening the dialog.
- **`updateCommunity`** — unchanged; the edit-mode patch simply includes `avatar_url` / `banner_url` alongside the text fields.

### i18n

New keys under `community.` (all 4 locales, no em dashes): `editProfile` (button already exists as `editTitle`; reuse), `changeBanner`, `changeAvatar`, `saveChanges`, `discardChanges`, `imageTooLarge`, `imageWrongType`, `uploadFailed`. Existing field labels (`fieldName`, `fieldBio`, etc.) are reused as inline placeholders/aria-labels.

## Error handling & edge cases

- **Validation** mirrors today: name required (1–120), bio ≤ 2000, `website`/`discord_url` must start with `http(s)` (surfaced inline; `updateCommunity`'s `assertHttp` remains the server-side guard). Save is blocked until valid.
- **Upload failure** (network, RLS reject, oversized) shows an inline error next to the image and does not change the field.
- **Not the owner:** edit mode is only reachable via the owner-only Edit button; `updateCommunity` + Storage RLS both enforce ownership server-side regardless.
- **Concurrent/slug:** `name` edits do not change the slug (slug is create-time only today) — no slug recomputation in edit mode.
- **Leaving edit mode with unsaved changes:** Cancel discards; navigating away (slug change / unmount) drops the transient `edit` state (nothing persisted).

## Testing

Matches repo reality (pure logic → vitest; SQL/Storage RLS and Vue components → manual/browser):
- **Unit (vitest):** `validateImageFile` (type + size boundaries), `mediaPath` (extension handling, id/kind composition).
- **Integration/manual:** the inline editor in the browser (enter edit mode, change each field, live preview, save, reload persists; cancel reverts), avatar/banner upload happy path + oversized/wrong-type rejection, and Storage RLS via SQL (owner can write own folder, cannot write another community's folder; public read works).

## Suggested build phasing (for the plan)

1. Storage bucket + RLS migration; `communityMedia.js` (validate + path pure helpers, TDD; upload wrapper).
2. `CommunityProfile.vue` inline edit mode for the **text fields** (name/city/country/bio/website/discord) + Save/Cancel bar + validation.
3. Avatar/banner upload wired into edit mode (overlay triggers, upload-on-select, live preview, per-image errors).
4. Make `CommunityEditDialog` create-only; repoint the Account strip's edit affordance.
5. i18n (4 locales) + integration sweep (browser E2E on an owned store, RLS SQL checks).

## Risks & tradeoffs

- **Storage RLS via a subquery join** to `community` is slightly more complex than a static bucket policy, but it's the correct ownership boundary.
- **Orphaned images** accumulate on cancel/replace; acceptable at this scale, revisit with a cleanup job if storage grows.
- **Bigger surface than the claim tasks:** it reworks the profile page's template into dual display/edit rendering — the main implementation risk is keeping the non-edit (public) render byte-identical to today.
