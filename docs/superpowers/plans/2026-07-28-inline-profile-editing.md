# Inline Community Profile Editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the modal EDIT dialog with in-place editing on the community profile (live preview), including avatar/banner image uploads.

**Architecture:** `CommunityProfile.vue` gains an `editing` mode: the owner clicks Edit, the profile's display elements swap to inline inputs bound to a working-copy `edit` object, and a sticky Save/Cancel bar commits everything via the existing `updateCommunity` in one write. Images upload on file-select to a new `community-media` Supabase Storage bucket (owner-scoped RLS) and preview immediately; the public URL is persisted on Save. `CommunityEditDialog` becomes create-only.

**Tech Stack:** Vue 3 `<script setup>` + Vuetify + vue-i18n (en/fr/de/it), Supabase Postgres + Storage + RLS, Vitest for pure JS, vite-ssg.

## Global Constraints

- **Atomic save:** Save commits all edited fields (text + `avatar_url` + `banner_url`) in a single `updateCommunity(id, patch)` call. Cancel discards the working copy; nothing persists.
- **Edit mode is owner-only** and entered via the existing Edit button, or via `?edit=1` on the profile URL when the viewer is the owner.
- **Upload-on-select:** images upload the moment a file is chosen; the returned public URL is held in the working copy and previews live; it is written to the DB only on Save.
- **Owner-scoped Storage RLS:** bucket `community-media`, public read; a signed-in user may INSERT/UPDATE/DELETE only under the path `{communityId}/…` for a community where `owner = auth.uid()`.
- **Path convention:** `{communityId}/avatar-{timestamp}.{ext}` and `{communityId}/banner-{timestamp}.{ext}`.
- **Image validation:** `image/*` mime only, ≤ 5 MB (5 \* 1024 \* 1024 bytes).
- **Field rules (unchanged from today):** `name` required, 1–120 chars; `bio` ≤ 2000; `website`/`discord_url` must be `http(s)` (server-guarded by `updateCommunity`'s `assertHttp`). `kind` is NOT editable after creation.
- **Create stays a dialog:** `CommunityEditDialog` is create-only after this work; the profile never opens it.
- **4-locale parity, no em dashes** in any new copy (accented characters are fine).
- **Public (non-edit) render must stay visually identical to today** — edit mode is additive.

## File Structure

- **Create** `supabase/migrations/20260728_community_media_storage.sql` — `community-media` bucket + storage.objects RLS.
- **Create** `frontend/src/lib/communityMedia.js` (+ `.test.js`) — `validateImageFile`, `mediaPath` (pure, tested), `uploadCommunityMedia` (Storage wrapper).
- **Modify** `frontend/src/components/Pages/App/CommunityProfile.vue` — inline edit mode (text in Task 3, images in Task 4); stop using `CommunityEditDialog`.
- **Modify** `frontend/src/components/community/CommunityEditDialog.vue` — remove the EDIT branch (create-only).
- **Modify** `frontend/src/components/Pages/App/Account.vue` — the "My communities" edit pencil becomes a `router-link` to the profile with `?edit=1`.
- **Modify** `frontend/src/locales/{en,fr,de,it}.json` — new edit/upload copy keys.

---

### Task 1: Storage bucket + owner-scoped RLS migration

**Files:**
- Create: `supabase/migrations/20260728_community_media_storage.sql`

**Interfaces:**
- Produces: a public-read bucket `community-media`; storage.objects policies allowing owner-only writes under `{communityId}/…`. Consumed by `uploadCommunityMedia` (Task 2) and the browser upload flow (Task 4).

- [ ] **Step 1: Write the migration**

```sql
-- community-media: avatars + banners for claimed community profiles.
-- Public read (images render on public profiles); writes are owner-scoped by the
-- first path segment being the community id and the caller owning that community.
insert into storage.buckets (id, name, public)
values ('community-media', 'community-media', true)
on conflict (id) do nothing;

drop policy if exists "community_media_public_read" on storage.objects;
create policy "community_media_public_read" on storage.objects
  for select using (bucket_id = 'community-media');

drop policy if exists "community_media_owner_insert" on storage.objects;
create policy "community_media_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] in (select id::text from community where owner = auth.uid())
  );

drop policy if exists "community_media_owner_update" on storage.objects;
create policy "community_media_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] in (select id::text from community where owner = auth.uid())
  );

drop policy if exists "community_media_owner_delete" on storage.objects;
create policy "community_media_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] in (select id::text from community where owner = auth.uid())
  );
```

- [ ] **Step 2: Apply the migration to production**

Apply via the Supabase MCP `apply_migration` tool, name `community_media_storage`, with the SQL above.

- [ ] **Step 3: Verify the bucket and policies exist**

Run via the Supabase MCP `execute_sql` tool:

```sql
select json_build_object(
  'bucket', (select json_build_object('id', id, 'public', public) from storage.buckets where id = 'community-media'),
  'policies', (select array_agg(policyname order by policyname)
                 from pg_policies where schemaname='storage' and tablename='objects'
                   and policyname like 'community_media_%')
) as checks;
```

Expected: `bucket` = `{id: community-media, public: true}`; `policies` includes all four `community_media_*` names.

- [ ] **Step 4: Verify owner-scoping logic in SQL (no client needed)**

Run via `execute_sql` — proves the path→owner mapping the policy relies on:

```sql
select (storage.foldername('3113/avatar-123.png'))[1] as folder_seg,   -- expect '3113'
       exists(select 1 from community where id::text = (storage.foldername('3113/avatar-123.png'))[1]) as community_exists;
```

Expected: `folder_seg` = `3113`, `community_exists` = `true`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260728_community_media_storage.sql
git commit -m "feat(community): community-media storage bucket + owner-scoped RLS"
```

---

### Task 2: `communityMedia.js` — validation, path, upload

**Files:**
- Create: `frontend/src/lib/communityMedia.js`
- Test: `frontend/src/lib/communityMedia.test.js`

**Interfaces:**
- Produces:
  - `validateImageFile(file) -> { ok: true } | { ok: false, error: 'no_file'|'wrong_type'|'too_large' }`
  - `mediaPath(communityId, kind, file) -> string` where `kind` is `'avatar'|'banner'`; returns `"{id}/{kind}-{timestamp}.{ext}"`.
  - `uploadCommunityMedia(communityId, kind, file) -> Promise<string>` (public URL). Consumed by Task 4.

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/lib/communityMedia.test.js
import { describe, it, expect } from "vitest";
import { validateImageFile, mediaPath } from "./communityMedia";

function fakeFile({ name = "pic.png", type = "image/png", size = 1000 } = {}) {
  return { name, type, size };
}

describe("validateImageFile", () => {
  it("accepts an image under 5 MB", () => {
    expect(validateImageFile(fakeFile({ type: "image/jpeg", size: 4 * 1024 * 1024 }))).toEqual({ ok: true });
  });
  it("rejects a missing file", () => {
    expect(validateImageFile(null)).toEqual({ ok: false, error: "no_file" });
  });
  it("rejects a non-image", () => {
    expect(validateImageFile(fakeFile({ type: "application/pdf" }))).toEqual({ ok: false, error: "wrong_type" });
  });
  it("rejects an image over 5 MB", () => {
    expect(validateImageFile(fakeFile({ size: 5 * 1024 * 1024 + 1 }))).toEqual({ ok: false, error: "too_large" });
  });
});

describe("mediaPath", () => {
  it("builds {id}/{kind}-{ts}.{ext} with a lowercased extension", () => {
    expect(mediaPath(42, "avatar", fakeFile({ name: "Photo.PNG" }))).toMatch(/^42\/avatar-\d+\.png$/);
  });
  it("uses the banner kind", () => {
    expect(mediaPath(7, "banner", fakeFile({ name: "b.jpeg" }))).toMatch(/^7\/banner-\d+\.jpeg$/);
  });
  it("falls back to 'img' when there is no extension", () => {
    expect(mediaPath(1, "avatar", fakeFile({ name: "noext" }))).toMatch(/^1\/avatar-\d+\.img$/);
  });
  it("sanitizes a weird extension to alphanumerics", () => {
    expect(mediaPath(1, "avatar", fakeFile({ name: "x.p!n g" }))).toMatch(/^1\/avatar-\d+\.png$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/communityMedia.test.js`
Expected: FAIL — `Failed to resolve import "./communityMedia"`.

- [ ] **Step 3: Write the implementation**

```js
// frontend/src/lib/communityMedia.js
// Avatar/banner uploads for community profiles. Pure helpers (validation, path)
// are unit-tested; uploadCommunityMedia is a thin Storage wrapper.
import { getClient } from "@/lib/supabaseClient";

const BUCKET = "community-media";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateImageFile(file) {
  if (!file) return { ok: false, error: "no_file" };
  if (!(file.type || "").startsWith("image/")) return { ok: false, error: "wrong_type" };
  if (file.size > MAX_BYTES) return { ok: false, error: "too_large" };
  return { ok: true };
}

// "{communityId}/{kind}-{timestamp}.{ext}" — the leading community id is the RLS
// anchor; the timestamp busts the CDN cache when an image is replaced.
export function mediaPath(communityId, kind, file) {
  const dot = (file.name || "").lastIndexOf(".");
  const raw = dot >= 0 ? file.name.slice(dot + 1) : "";
  const ext = raw.toLowerCase().replace(/[^a-z0-9]/g, "") || "img";
  return `${communityId}/${kind}-${Date.now()}.${ext}`;
}

// Upload to the community-media bucket and return the public URL. Throws on failure.
export async function uploadCommunityMedia(communityId, kind, file) {
  const client = getClient();
  const path = mediaPath(communityId, kind, file);
  const { error } = await client.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600", upsert: false, contentType: file.type,
  });
  if (error) { console.error("uploadCommunityMedia failed", error); throw error; }
  return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/communityMedia.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/communityMedia.js frontend/src/lib/communityMedia.test.js
git commit -m "feat(community): communityMedia validate/path/upload helpers"
```

---

### Task 3: Inline edit mode for text fields

**Files:**
- Modify: `frontend/src/components/Pages/App/CommunityProfile.vue`

**Interfaces:**
- Consumes: `updateCommunity` from `@/lib/community`; `COUNTRIES` from `@/lib/countries`; new i18n keys (Task 6 — until then Vue renders the raw key, which is fine for interim testing).
- Produces: an `editing` mode that swaps display elements for inline inputs bound to a working-copy `edit` object, plus `displayName`/`displayAvatar`/`displayBanner` computeds (Task 4 reuses them for image preview), and a sticky Save/Cancel bar. The profile no longer references `CommunityEditDialog`.

- [ ] **Step 1: Rework the `<script setup>`**

In `frontend/src/components/Pages/App/CommunityProfile.vue`:

Change the imports block (lines 5-13) to drop the edit dialog and add `updateCommunity` + `COUNTRIES`:

```js
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { useHead } from "@unhead/vue";
import { fetchBySlug, updateCommunity } from "@/lib/community";
import { COUNTRIES } from "@/lib/countries";
import { getCurrentSession, onAuthChange } from "@/lib/supabaseClient";
import ClaimCommunityDialog from "@/components/community/ClaimCommunityDialog.vue";
import ReportCommunityDialog from "@/components/community/ReportCommunityDialog.vue";
```

Replace the whole "CTA row" script section — the block from `// ── CTA row ──` through the `onEdited` function (lines 168-185) — with the report state plus the new edit-mode state and functions:

```js
// ── CTA row ────────────────────────────────────────────────────────────────
const claimOpen = ref(false);
function openClaim()  { claimOpen.value = true; }

const reportOpen = ref(false);
function openReport() { reportOpen.value = true; }
// The dialog already shows its own "report sent" confirmation before
// closing itself; nothing else needs to happen on this page.
function onReported() {}

// ── Inline edit mode ─────────────────────────────────────────────────────────
// The owner edits the profile in place: `edit` is a working copy seeded from the
// loaded community; the template renders inputs bound to it while `editing`. Save
// commits everything via updateCommunity in one write; cancel drops the copy.
const editing = ref(false);
const savingEdit = ref(false);
const editErr = ref("");
const uploadingAvatar = ref(false);   // used by the image upload task
const uploadingBanner = ref(false);
const edit = ref({
  name: "", bio: "", website: "", discord_url: "",
  city: "", country: "", avatar_url: null, banner_url: null,
});

function startEdit() {
  const c = community.value;
  if (!c) return;
  edit.value = {
    name: c.name ?? "", bio: c.bio ?? "", website: c.website ?? "",
    discord_url: c.discord_url ?? "", city: c.city ?? "", country: c.country ?? "",
    avatar_url: c.avatar_url ?? null, banner_url: c.banner_url ?? null,
  };
  editErr.value = "";
  editing.value = true;
}
function cancelEdit() { editing.value = false; editErr.value = ""; }

const editValid = computed(() => {
  const n = edit.value.name.trim();
  return n.length > 0 && n.length <= 120 && edit.value.bio.length <= 2000;
});

// Preview sources: while editing, render the working copy so changes show live.
const displayName   = computed(() => editing.value ? edit.value.name       : (community.value?.name ?? ""));
const displayAvatar = computed(() => editing.value ? edit.value.avatar_url  : community.value?.avatar_url);
const displayBanner = computed(() => editing.value ? edit.value.banner_url  : community.value?.banner_url);

async function saveEdit() {
  if (!editValid.value || savingEdit.value || uploadingAvatar.value || uploadingBanner.value) return;
  savingEdit.value = true; editErr.value = "";
  try {
    const patch = {
      name:        edit.value.name.trim(),
      bio:         edit.value.bio.trim(),
      website:     edit.value.website.trim() || null,
      discord_url: edit.value.discord_url.trim() || null,
      city:        edit.value.city.trim() || null,
      country:     edit.value.country || null,
      avatar_url:  edit.value.avatar_url || null,
      banner_url:  edit.value.banner_url || null,
    };
    const row = await updateCommunity(community.value.id, patch);
    Object.assign(community.value, row);
    editing.value = false;
  } catch (e) {
    editErr.value = e.message ?? "Failed to save.";
  } finally {
    savingEdit.value = false;
  }
}
```

In `onMounted` (lines 52-66), after `await load();` and before the `claimResult` block, add auto-enter-edit for the owner deep-link. Replace the tail of `onMounted` starting at `await load();` with:

```js
  await load();

  if (route.query.edit === "1" && isOwner.value) startEdit();

  const claimResult = route.query.claim;
  if (claimResult === "success") {
    finalizeClaim();
  } else if (claimResult === "cancel") {
    claimOpen.value = true; // dialog resumes at the subscribe step (identity kept)
  }
```

In the slug `watch` (lines 75-81), add `editing.value = false;` as the first line inside the callback so switching profiles leaves edit mode:

```js
watch(() => route.params.slug, () => {
  editing.value = false;
  ++finalizeId;            // cancel any in-flight finalize poll for the old slug
  finalizing.value = false;
  community.value = null;
  notFound.value  = false;
  load();
});
```

- [ ] **Step 2: Rework the profile template**

Replace the profile block — from `<!-- Banner -->` through the three dialog tags (lines 255-351) — with this editing-aware version. (The banner/avatar upload overlays are added in Task 4; here they render display-only via the `display*` computeds.)

```html
      <!-- Banner -->
      <div class="cp-banner">
        <img v-if="displayBanner" :src="displayBanner" :alt="displayName" class="cp-banner__img" />
      </div>

      <!-- Header -->
      <div class="cp-header">
        <div class="cp-avatar">
          <img v-if="displayAvatar" :src="displayAvatar" :alt="displayName" />
          <span v-else>{{ (displayName || '?')[0].toUpperCase() }}</span>
        </div>
        <div class="cp-header__text">
          <div class="cp-title-row">
            <h1 v-if="!editing" class="cp-name">{{ community.name }}</h1>
            <input
              v-else
              v-model="edit.name"
              class="cp-name-input"
              maxlength="120"
              :placeholder="t('community.fieldName')"
              aria-label="Name"
            />
            <span v-if="!editing && community.verified" class="badge-verified">
              <v-icon icon="mdi-check-decagram" size="13" />
              {{ t('community.verified') }}
            </span>
          </div>
          <div class="cp-identity">
            <span>{{ kindLabel }}</span>
            <template v-if="!editing">
              <span v-if="cityCountry" class="cp-dot">·</span>
              <span v-if="cityCountry">{{ cityCountry }}</span>
              <span v-if="community.region" class="cp-dot">·</span>
              <span v-if="community.region">{{ community.region }}</span>
            </template>
            <template v-else>
              <span class="cp-dot">·</span>
              <input v-model="edit.city" class="cp-inline-input" :placeholder="t('community.fieldCity')" aria-label="City" />
              <select v-model="edit.country" class="cp-inline-input cp-inline-select" aria-label="Country">
                <option value="">{{ t('community.kindAll') }}</option>
                <option v-for="c in COUNTRIES" :key="c.code" :value="c.name">{{ c.flag }} {{ c.name }}</option>
              </select>
            </template>
          </div>
        </div>
      </div>

      <!-- Bio -->
      <p v-if="!editing && community.bio" class="cp-bio">{{ community.bio }}</p>
      <textarea
        v-else-if="editing"
        v-model="edit.bio"
        class="cp-bio-input"
        maxlength="2000"
        :placeholder="t('community.fieldBio')"
        aria-label="Bio"
      />

      <!-- Action row -->
      <div v-if="!editing" class="cp-actions">
        <a
          v-if="community.website"
          :href="community.website"
          target="_blank"
          rel="noopener noreferrer"
          class="cp-action-link"
        >
          <v-icon icon="mdi-web" size="16" />
          {{ t('community.openWebsite') }}
        </a>
        <a
          v-if="community.discord_url"
          :href="community.discord_url"
          target="_blank"
          rel="noopener noreferrer"
          class="cp-action-link"
        >
          <v-icon icon="mdi-discord" size="16" />
          {{ t('community.openDiscord') }}
        </a>
        <router-link :to="{ name: 'TradeCenter', params: localeParams }" class="cp-action-link">
          <v-icon icon="mdi-cards-outline" size="16" />
          {{ t('community.viewAnnounces') }}
        </router-link>
        <a
          v-if="mapUrl"
          :href="mapUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="cp-action-link cp-action-link--icon"
          aria-label="Google Maps"
        >
          <v-icon icon="mdi-map-marker-outline" size="16" />
        </a>
      </div>
      <div v-else class="cp-actions cp-actions--edit">
        <div class="cp-link-edit">
          <v-icon icon="mdi-web" size="16" />
          <input v-model="edit.website" class="cp-inline-input" placeholder="https://" aria-label="Website" />
        </div>
        <div class="cp-link-edit">
          <v-icon icon="mdi-discord" size="16" />
          <input v-model="edit.discord_url" class="cp-inline-input" placeholder="https://discord.gg/…" aria-label="Discord link" />
        </div>
      </div>

      <!-- CTA row (hidden while editing) -->
      <div v-if="!editing" class="cp-cta">
        <template v-if="community.owner == null">
          <button type="button" class="btn-claim" @click="openClaim">
            <v-icon icon="mdi-storefront-check-outline" size="16" />
            {{ t('community.claimThis') }}
          </button>
          <span class="cp-unclaimed">{{ t('community.unclaimedNotice') }}</span>
        </template>
        <button type="button" class="btn-report" @click="openReport">
          <v-icon icon="mdi-flag-outline" size="16" />
          {{ t('community.report') }}
        </button>
        <button v-if="isOwner" type="button" class="btn-edit-profile" @click="startEdit">
          <v-icon icon="mdi-pencil-outline" size="16" />
          {{ t('community.editTitle') }}
        </button>
      </div>

      <div v-if="finalizing" class="cp-finalizing">
        <v-progress-circular indeterminate size="16" width="2" color="var(--c-trade)" />
        {{ t('community.claimFinalizing') }}
      </div>

      <ClaimCommunityDialog v-model="claimOpen" :community="community" @stale="onStale" />
      <ReportCommunityDialog v-model="reportOpen" :community="community" @sent="onReported" />

      <!-- Sticky edit bar -->
      <div v-if="editing" class="cp-editbar">
        <span v-if="editErr" class="cp-editbar__err">{{ editErr }}</span>
        <div class="cp-editbar__actions">
          <button class="btn-cancel-edit" @click="cancelEdit" :disabled="savingEdit">
            {{ t('community.discardChanges') }}
          </button>
          <button
            class="btn-save-edit"
            :disabled="!editValid || savingEdit || uploadingAvatar || uploadingBanner"
            @click="saveEdit"
          >
            <v-progress-circular v-if="savingEdit" indeterminate size="16" width="2" color="white" />
            <template v-else><v-icon icon="mdi-content-save-outline" size="16" />{{ t('community.saveChanges') }}</template>
          </button>
        </div>
      </div>
```

- [ ] **Step 3: Add the edit-mode styles**

Add these rules at the end of the `<style scoped>` block (before the closing `</style>`):

```css
/* ── Inline edit mode ─────────────────────────────── */
.cp-profile--editing { padding-bottom: 88px; } /* room for the sticky bar */

.cp-name-input {
  width: 100%;
  background: var(--c-surface); border: 1.5px solid var(--c-border); border-radius: 12px;
  padding: 6px 12px; font-size: 1.375rem; font-weight: 800; color: var(--c-text);
  letter-spacing: -0.01em; outline: none; transition: border-color 0.15s ease;
}
.cp-name-input:focus { border-color: var(--c-trade); }

.cp-inline-input {
  background: var(--c-surface); border: 1.5px solid var(--c-border); border-radius: 10px;
  padding: 6px 10px; font-size: 13px; font-weight: 600; color: var(--c-text);
  outline: none; transition: border-color 0.15s ease; min-width: 0;
}
.cp-inline-input:focus { border-color: var(--c-trade); }
.cp-inline-select { cursor: pointer; appearance: none; }

.cp-bio-input {
  width: calc(100% - 40px); margin: 0 20px; box-sizing: border-box;
  background: var(--c-surface); border: 1.5px solid var(--c-border); border-radius: 12px;
  padding: 10px 13px; font-size: 13.5px; color: var(--c-text); line-height: 1.6;
  min-height: 96px; resize: vertical; outline: none; font-family: inherit;
  transition: border-color 0.15s ease;
}
.cp-bio-input:focus { border-color: var(--c-trade); }

.cp-actions--edit { flex-direction: column; align-items: stretch; gap: 8px; }
.cp-link-edit { display: flex; align-items: center; gap: 8px; color: var(--c-muted); }
.cp-link-edit .cp-inline-input { flex: 1; }

.cp-editbar {
  position: sticky; bottom: 0; z-index: 5;
  display: flex; align-items: center; justify-content: flex-end; gap: 12px; flex-wrap: wrap;
  margin: 8px -20px -56px; padding: 14px 20px;
  background: var(--c-surface); border-top: 1px solid var(--c-border);
}
.cp-editbar__err { color: #ef4444; font-size: 12.5px; font-weight: 600; margin-right: auto; }
.cp-editbar__actions { display: flex; align-items: center; gap: 10px; }
.btn-cancel-edit {
  padding: 9px 16px; border-radius: 11px; font-size: 13px; font-weight: 600;
  color: var(--c-muted); cursor: pointer; transition: background 0.15s ease;
}
.btn-cancel-edit:hover { background: var(--c-surface-2); }
.btn-cancel-edit:disabled { opacity: 0.4; pointer-events: none; }
.btn-save-edit {
  display: flex; align-items: center; gap: 7px; min-width: 130px; justify-content: center;
  padding: 9px 20px; border-radius: 11px; background: var(--c-trade); color: #fff;
  font-size: 13px; font-weight: 700; cursor: pointer; transition: opacity 0.15s ease;
}
.btn-save-edit:hover:not(:disabled) { opacity: 0.88; }
.btn-save-edit:disabled { opacity: 0.4; pointer-events: none; }
```

- [ ] **Step 4: Verify compile + edit round-trip in the browser (controller step)**

Start the dev server (`preview_start` with `frontend-dev`), sign-in state permitting, open an owned store's profile, click Edit: name/city/country/bio/website/discord become inline inputs, the sticky Save/Cancel bar shows, editing name updates the avatar-placeholder letter live, Save persists (reload confirms), Cancel reverts. Confirm `read_console_messages` shows no errors. (Full owner interaction may require a signed-in session; at minimum confirm the page compiles and renders with zero console errors.)

- [ ] **Step 5: Run the unit suite (no regressions) and commit**

```bash
cd frontend && npx vitest run
```
Expected: all suites pass. Then:

```bash
git add frontend/src/components/Pages/App/CommunityProfile.vue
git commit -m "feat(community): inline edit mode for profile text fields"
```

---

### Task 4: Avatar + banner upload in edit mode

**Files:**
- Modify: `frontend/src/components/Pages/App/CommunityProfile.vue`

**Interfaces:**
- Consumes: `validateImageFile`, `uploadCommunityMedia` from `@/lib/communityMedia`; the `edit`, `uploadingAvatar`, `uploadingBanner`, `displayAvatar`, `displayBanner` state from Task 3.
- Produces: click-to-upload overlays on the banner and avatar while editing; uploads on file-select, previews live, blocks Save while an upload is in flight, and surfaces per-image errors.

- [ ] **Step 1: Extend the `<script setup>`**

Add to the imports (alongside the other `@/lib` imports):

```js
import { validateImageFile, uploadCommunityMedia } from "@/lib/communityMedia";
```

Add refs for the hidden file inputs and an upload handler, immediately after the `saveEdit` function:

```js
const avatarInput = ref(null);
const bannerInput = ref(null);

async function onPickImage(kind, ev) {
  const file = ev.target.files?.[0];
  ev.target.value = ""; // allow re-picking the same file
  if (!file) return;
  const check = validateImageFile(file);
  if (!check.ok) {
    editErr.value = check.error === "too_large" ? t("community.imageTooLarge")
      : check.error === "wrong_type" ? t("community.imageWrongType")
      : t("community.uploadFailed");
    return;
  }
  const busy = kind === "avatar" ? uploadingAvatar : uploadingBanner;
  busy.value = true; editErr.value = "";
  try {
    const url = await uploadCommunityMedia(community.value.id, kind, file);
    if (kind === "avatar") edit.value.avatar_url = url;
    else edit.value.banner_url = url;
  } catch (e) {
    editErr.value = t("community.uploadFailed");
  } finally {
    busy.value = false;
  }
}
```

- [ ] **Step 2: Add the upload overlays to the template**

Replace the `<!-- Banner -->` block with a version that adds an owner-editing overlay:

```html
      <!-- Banner -->
      <div class="cp-banner" :class="{ 'cp-banner--editing': editing }">
        <img v-if="displayBanner" :src="displayBanner" :alt="displayName" class="cp-banner__img" />
        <template v-if="editing">
          <input ref="bannerInput" type="file" accept="image/*" class="cp-file-hidden" @change="onPickImage('banner', $event)" />
          <button type="button" class="cp-img-btn cp-img-btn--banner" :disabled="uploadingBanner" @click="bannerInput?.click()">
            <v-progress-circular v-if="uploadingBanner" indeterminate size="16" width="2" color="white" />
            <template v-else><v-icon icon="mdi-image-edit-outline" size="16" />{{ t('community.changeBanner') }}</template>
          </button>
        </template>
      </div>
```

Replace the `<div class="cp-avatar">…</div>` block with the avatar-upload version:

```html
        <div class="cp-avatar" :class="{ 'cp-avatar--editing': editing }">
          <img v-if="displayAvatar" :src="displayAvatar" :alt="displayName" />
          <span v-else>{{ (displayName || '?')[0].toUpperCase() }}</span>
          <template v-if="editing">
            <input ref="avatarInput" type="file" accept="image/*" class="cp-file-hidden" @change="onPickImage('avatar', $event)" />
            <button type="button" class="cp-img-btn cp-img-btn--avatar" :disabled="uploadingAvatar" @click="avatarInput?.click()" :aria-label="t('community.changeAvatar')">
              <v-progress-circular v-if="uploadingAvatar" indeterminate size="14" width="2" color="white" />
              <v-icon v-else icon="mdi-camera-outline" size="15" />
            </button>
          </template>
        </div>
```

- [ ] **Step 3: Add the upload-affordance styles**

Append to `<style scoped>`:

```css
.cp-file-hidden { display: none; }
.cp-banner--editing, .cp-avatar--editing { position: relative; }
.cp-img-btn {
  position: absolute; display: flex; align-items: center; justify-content: center; gap: 6px;
  background: color-mix(in srgb, #000 55%, transparent); color: #fff;
  font-size: 12px; font-weight: 700; cursor: pointer; border: none;
  transition: opacity 0.15s ease;
}
.cp-img-btn:hover:not(:disabled) { opacity: 0.85; }
.cp-img-btn:disabled { opacity: 0.6; pointer-events: none; }
.cp-img-btn--banner { inset: auto 12px 12px auto; padding: 8px 14px; border-radius: 11px; }
.cp-img-btn--avatar { inset: auto -4px -4px auto; width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--c-bg); }
```

- [ ] **Step 4: Verify upload in the browser (controller step)**

With the dev server running and signed in as the owner in edit mode: click "Change banner" and the avatar camera, pick an image → it previews immediately, Save is disabled while the spinner shows, then Save persists the new URLs (reload confirms). Try a >5 MB file and a non-image → the matching error copy shows and the field is unchanged. Confirm `read_network_requests` shows the Storage upload returning 200 and `read_console_messages` shows no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Pages/App/CommunityProfile.vue
git commit -m "feat(community): avatar + banner upload in inline edit mode"
```

---

### Task 5: `CommunityEditDialog` create-only + Account deep-link

**Files:**
- Modify: `frontend/src/components/community/CommunityEditDialog.vue`
- Modify: `frontend/src/components/Pages/App/Account.vue`

**Interfaces:**
- Consumes: the `?edit=1` entry added in Task 3.
- Produces: `CommunityEditDialog` no longer has an EDIT path (create-only); the Account "My communities" edit control deep-links to the profile in edit mode.

- [ ] **Step 1: Make the dialog create-only**

In `frontend/src/components/community/CommunityEditDialog.vue`:

Remove the `community` prop and `isEdit` computed. Change the props/emits (lines 7-16) to:

```js
const props = defineProps({
  modelValue: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue", "saved"]);
const { t } = useI18n();
```

Simplify the open watcher (lines 39-54) to always reset blank (create only):

```js
watch(() => props.modelValue, open => {
  if (!open) return;
  errorMsg.value = "";
  name.value = ""; kind.value = "store"; bio.value = "";
  website.value = ""; discordUrl.value = ""; city.value = ""; country.value = "";
});
```

Simplify `submit` (lines 58-80) to only create:

```js
async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true; errorMsg.value = "";
  try {
    const patch = {
      name:        name.value.trim(),
      bio:         bio.value.trim(),
      website:     website.value.trim() || null,
      discord_url: discordUrl.value.trim() || null,
      city:        city.value.trim() || null,
      country:     country.value || null,
    };
    const row = await createCommunity({ kind: kind.value, ...patch });
    emit("saved", row);
    close();
  } catch (err) {
    errorMsg.value = err.message ?? "Failed to save.";
  } finally {
    submitting.value = false;
  }
}
```

Remove the now-unused `updateCommunity` import (line 4 → `import { createCommunity } from "@/lib/community";`). In the template, the header title and submit button use `isEdit`; replace those with the create strings: the title becomes `{{ t('community.createTitle') }}`, the kind `<select>` drops `:disabled="isEdit"`, and the submit button becomes:

```html
        <button class="btn-submit" :disabled="!canSubmit" @click="submit">
          <template v-if="submitting">
            <v-progress-circular indeterminate size="16" width="2" color="white" />
          </template>
          <template v-else>
            <v-icon icon="mdi-plus" size="16" />
            {{ t('community.create') }}
          </template>
        </button>
```

- [ ] **Step 2: Repoint the Account strip's edit control**

In `frontend/src/components/Pages/App/Account.vue`, the "My communities" row has an edit `<button>` that calls `openEditCommunity(row)` (opening the dialog in edit mode). Replace that button with a `router-link` to the profile in edit mode:

```html
          <router-link
            :to="{ name: 'communityProfile', params: { locale, slug: row.slug }, query: { edit: '1' } }"
            class="shrink-0 flex items-center justify-center size-7 rounded-md cursor-pointer transition-colors"
            style="border: 1px solid var(--c-border); color: var(--c-muted)"
            :aria-label="t('community.editTitle')"
            :title="t('community.editTitle')"
          >
            <v-icon icon="mdi-pencil-outline" size="14" />
          </router-link>
```

Then remove the now-unused `openEditCommunity` function, the `editing`/`editOpen` refs it used, the `onCommunitySaved` handler if it is only used by the edit path, and the `<CommunityEditDialog v-model="editOpen" :community="editing" @saved="onCommunitySaved" />` tag — **but only if** the Account page does not otherwise use `CommunityEditDialog` for creation. Read the file first: if the "Add yours" empty-state or a create button opens the same dialog, keep the dialog + its create wiring and only remove the edit-specific `:community="editing"` usage and `openEditCommunity`. Preserve all create functionality.

- [ ] **Step 3: Verify compile + both paths (controller step)**

Dev server: the directory "Add your store" create dialog still creates a community (create path intact); the Account "My communities" pencil now navigates to `…/community/<slug>?edit=1` and the profile opens directly in edit mode for the owner. No console errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/community/CommunityEditDialog.vue frontend/src/components/Pages/App/Account.vue
git commit -m "feat(community): edit dialog create-only; account edit deep-links to inline edit"
```

---

### Task 6: i18n + integration sweep

**Files:**
- Modify: `frontend/src/locales/{en,fr,de,it}.json`

**Interfaces:**
- Produces keys under `community.`: `changeBanner`, `changeAvatar`, `saveChanges`, `discardChanges`, `imageTooLarge`, `imageWrongType`, `uploadFailed`. Consumed by Tasks 3-4.

- [ ] **Step 1: Add keys to `en.json`**

Inside the `community` object (as siblings of the existing keys), add:

```json
      "changeBanner": "Change banner",
      "changeAvatar": "Change photo",
      "saveChanges": "Save changes",
      "discardChanges": "Discard",
      "imageTooLarge": "Image is too large (max 5 MB).",
      "imageWrongType": "Please choose an image file.",
      "uploadFailed": "Upload failed. Please try again."
```

- [ ] **Step 2: Add keys to `fr.json`**

```json
      "changeBanner": "Changer la bannière",
      "changeAvatar": "Changer la photo",
      "saveChanges": "Enregistrer",
      "discardChanges": "Annuler",
      "imageTooLarge": "Image trop volumineuse (max 5 Mo).",
      "imageWrongType": "Veuillez choisir un fichier image.",
      "uploadFailed": "Échec du téléversement. Veuillez réessayer."
```

- [ ] **Step 3: Add keys to `de.json`**

```json
      "changeBanner": "Banner ändern",
      "changeAvatar": "Foto ändern",
      "saveChanges": "Speichern",
      "discardChanges": "Verwerfen",
      "imageTooLarge": "Bild ist zu groß (max. 5 MB).",
      "imageWrongType": "Bitte eine Bilddatei wählen.",
      "uploadFailed": "Upload fehlgeschlagen. Bitte erneut versuchen."
```

- [ ] **Step 4: Add keys to `it.json`**

```json
      "changeBanner": "Cambia banner",
      "changeAvatar": "Cambia foto",
      "saveChanges": "Salva",
      "discardChanges": "Annulla",
      "imageTooLarge": "Immagine troppo grande (max 5 MB).",
      "imageWrongType": "Scegli un file immagine.",
      "uploadFailed": "Caricamento non riuscito. Riprova."
```

- [ ] **Step 5: Verify parity + no em dashes**

```bash
cd frontend && node -e "const k=['changeBanner','changeAvatar','saveChanges','discardChanges','imageTooLarge','imageWrongType','uploadFailed']; for (const l of ['en','fr','de','it']){const o=require('./src/locales/'+l+'.json'); const miss=k.filter(x=>!(x in o.community)); const em=k.filter(x=>(o.community[x]||'').includes('—')); console.log(l, miss.length?'MISSING '+miss:'ok', em.length?'EMDASH '+em:'');}"
```
Expected: `en ok`, `fr ok`, `de ok`, `it ok`, no EMDASH.

- [ ] **Step 6: Full sweep + build + commit**

```bash
cd frontend && npx vitest run && npm run build
```
Expected: all unit tests pass; vite-ssg build green. Then:

```bash
git add frontend/src/locales/en.json frontend/src/locales/fr.json frontend/src/locales/de.json frontend/src/locales/it.json
git commit -m "feat(community): i18n for inline edit + image upload (4 locales)"
```

- [ ] **Step 7: End-to-end browser verification (controller step)**

On an owned store, signed in: enter edit mode (Edit button and via `?edit=1` from Account), change every field + upload avatar and banner, Save, reload → all persisted. Cancel discards. Confirm via SQL that a non-owner cannot write another community's folder (attempt an upload path under a community you don't own → RLS denies) and public read works. Confirm the public (non-edit) profile renders identically to before for a signed-out visitor.

---

## Self-Review

**Spec coverage:**
- Edit-mode toggle + atomic Save/Cancel → Task 3 (`editing`, `saveEdit`, sticky bar). ✓
- All text fields editable in place → Task 3 (name/city/country/bio/website/discord). ✓
- Avatar/banner upload, upload-on-select, live preview → Task 4 + Task 2 helpers. ✓
- Owner-scoped Storage RLS + bucket + path convention → Task 1. ✓
- `?edit=1` deep-link + Account pencil repoint → Task 3 (entry) + Task 5 (repoint). ✓
- Create stays a dialog; EDIT branch removed → Task 5. ✓
- Validation rules (name/bio/links) → Task 3 (`editValid` + `updateCommunity` assertHttp). ✓
- Image validation (type/size) → Task 2 (`validateImageFile`) + Task 4 wiring. ✓
- i18n 4-locale, no em dashes → Task 6. ✓
- Public render unchanged → Task 3 keeps `!editing` branches byte-identical to today; Task 6 Step 7 verifies. ✓

**Placeholder scan:** every code step carries literal code; the one conditional instruction (Task 5 Step 2 "only if the Account page also uses the dialog for creation") is a real, named branch with both outcomes specified, not a TODO. ✓

**Type consistency:** `edit` object keys (`name/bio/website/discord_url/city/country/avatar_url/banner_url`) are used identically in Task 3 (`startEdit`/`saveEdit`/template) and Task 4 (`onPickImage` sets `edit.avatar_url`/`edit.banner_url`); `uploadingAvatar`/`uploadingBanner` declared in Task 3 and used in Task 4; `validateImageFile`/`uploadCommunityMedia`/`mediaPath` signatures match between Task 2 and Task 4; `displayName`/`displayAvatar`/`displayBanner` defined in Task 3 and reused by Task 4's overlays. ✓
