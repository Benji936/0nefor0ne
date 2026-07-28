<script setup>
// Public Community PROFILE page (SEO). Fetches by route.params.slug and
// renders a loading / not-found / profile state. The CTA row (claim, report,
// edit) each opens its own dialog below.
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { useHead } from "@unhead/vue";
import { fetchBySlug, updateCommunity } from "@/lib/community";
import { validateImageFile, uploadCommunityMedia } from "@/lib/communityMedia";
import { COUNTRIES } from "@/lib/countries";
import { getCurrentSession, onAuthChange } from "@/lib/supabaseClient";
import ClaimCommunityDialog from "@/components/community/ClaimCommunityDialog.vue";
import ReportCommunityDialog from "@/components/community/ReportCommunityDialog.vue";

const route = useRoute();
const { t } = useI18n();

const community      = ref(null);
const loading        = ref(true);
const notFound       = ref(false);
const currentUserId  = ref(null);

const KIND_KEYS = { store: "kindStore", discord: "kindDiscord", group: "kindGroup" };

// Stale-response guard: only the most recently issued load() may commit its
// result, so a slower earlier fetch (e.g. after a rapid slug change) can't
// clobber a newer one.
let reqId = 0;

async function load() {
  const myId = ++reqId;
  loading.value   = true;
  notFound.value  = false;
  community.value = null;
  try {
    const data = await fetchBySlug(route.params.slug);
    if (myId !== reqId) return;
    community.value = data;
    notFound.value  = !data;
  } catch (e) {
    if (myId !== reqId) return;
    console.error("CommunityProfile: fetchBySlug failed", e);
    community.value = null;
    notFound.value  = true;
  } finally {
    if (myId === reqId) loading.value = false;
  }
}

let unsub = null;

onMounted(async () => {
  const session = await getCurrentSession();
  currentUserId.value = session?.user?.id ?? null;
  unsub = onAuthChange((auth) => {
    currentUserId.value = auth?.user?.id ?? null;
  });
  await load();

  if (route.query.edit === "1" && isOwner.value) startEdit();

  const claimResult = route.query.claim;
  if (claimResult === "success") {
    finalizeClaim();
  } else if (claimResult === "cancel") {
    claimOpen.value = true; // dialog resumes at the subscribe step (identity kept)
  }
});

onBeforeUnmount(() => {
  ++finalizeId;
  unsub?.();
});

// The page is reused across slugs (e.g. a related-profile link), so local UI
// state must be reset here rather than relying on a fresh component mount.
watch(() => route.params.slug, () => {
  editing.value = false;
  ++finalizeId;            // cancel any in-flight finalize poll for the old slug
  finalizing.value = false;
  community.value = null;
  notFound.value  = false;
  load();
});

const isOwner = computed(() => !!(community.value?.owner && community.value.owner === currentUserId.value));

const kindLabel = computed(() => {
  const key = KIND_KEYS[community.value?.kind];
  return key ? t(`community.${key}`) : (community.value?.kind ?? "");
});

const cityCountry = computed(() => {
  const c = community.value;
  if (!c) return null;
  if (c.city && c.country) return `${c.city}, ${c.country}`;
  return c.city || c.country || null;
});

const mapUrl = computed(() => {
  const c = community.value;
  if (!c || c.lat == null || c.lng == null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
});

const localeParams = computed(() => ({ locale: route.params.locale || "en" }));

// ── SEO ──────────────────────────────────────────────────────────────────
const BASE = "https://0nefor.one";
const canonicalUrl = computed(() => `${BASE}${route.path}`);

const metaTitle = computed(() => {
  const c = community.value;
  if (!c) return "";
  const city = (c.city || "").trim();
  if (!city) return t("community.metaProfileTitleNoCity", { name: c.name, kind: kindLabel.value });
  return t("community.metaProfileTitle", { name: c.name, kind: kindLabel.value, city });
});
const metaDesc = computed(() => {
  const c = community.value;
  if (!c) return "";
  return t("community.metaProfileDesc", { name: c.name, kind: kindLabel.value, city: c.city || "" });
});

// LocalBusiness for physical stores (address/geo when known), Organization
// for Discord servers and groups which have no physical location.
const jsonLd = computed(() => {
  const c = community.value;
  if (!c) return null;
  const base = { "@context": "https://schema.org", name: c.name, url: canonicalUrl.value };
  if (c.kind === "store") {
    const address = (c.city || c.country) ? {
      "@type": "PostalAddress",
      ...(c.city ? { addressLocality: c.city } : {}),
      ...(c.country ? { addressCountry: c.country } : {}),
    } : undefined;
    const geo = (c.lat != null && c.lng != null) ? {
      "@type": "GeoCoordinates",
      latitude: c.lat,
      longitude: c.lng,
    } : undefined;
    return { ...base, "@type": "LocalBusiness", ...(address ? { address } : {}), ...(geo ? { geo } : {}) };
  }
  return { ...base, "@type": "Organization" };
});

// Guarded on community.value so the not-found state gets no title override
// and no JSON-LD script.
useHead(computed(() => {
  if (!community.value) return {};
  return {
    title: metaTitle.value,
    meta: [
      { name: "description", content: metaDesc.value },
      { property: "og:title", content: metaTitle.value },
      { property: "og:description", content: metaDesc.value },
      { name: "twitter:title", content: metaTitle.value },
      { name: "twitter:description", content: metaDesc.value },
    ],
    link: [
      { rel: "canonical", href: canonicalUrl.value },
    ],
    script: jsonLd.value ? [
      // Escape "<" so an owner-typed name/city can never break out of the
      // <script> block (defense-in-depth; the JSON-LD carries free user text).
      { type: "application/ld+json", innerHTML: JSON.stringify(jsonLd.value).replace(/</g, "\\u003c") },
    ] : [],
  };
}));

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

// After returning from Stripe Checkout with ?claim=success, the subscription
// webhook may not have granted ownership yet (it fires within seconds). Poll the
// row a few times until owner flips, then show the owned state. A finalizeId
// token (same pattern as reqId) cancels the poll on slug change or unmount, and a
// transient fetch error is swallowed so one network blip cannot strand the banner.
const finalizing = ref(false);
let finalizeId = 0;
async function finalizeClaim() {
  const myId = ++finalizeId;
  const slug = route.params.slug;
  finalizing.value = true;
  try {
    for (let i = 0; i < 8; i++) {
      let fresh = null;
      try { fresh = await fetchBySlug(slug); }
      catch (e) { console.error("finalizeClaim: fetch failed", e); } // transient; keep polling
      if (myId !== finalizeId) return;                 // superseded (slug change / unmount)
      if (fresh) {
        Object.assign(community.value ?? (community.value = fresh), fresh);
        if (fresh.owner) return;                        // owned; finally clears the banner
      }
      await new Promise((r) => setTimeout(r, 2000));
      if (myId !== finalizeId) return;
    }
  } finally {
    if (myId === finalizeId) finalizing.value = false;  // only the current poll clears it
  }
}

// A claim can fail because someone else claimed it first (race). Refetch and
// patch in place so the CTA resyncs (Claim disappears once owner is set)
// instead of leaving a stale "Claim" button the user retries forever.
async function onStale() {
  if (!community.value?.slug) return;
  const fresh = await fetchBySlug(community.value.slug);
  if (fresh) Object.assign(community.value, fresh);
}
</script>

<template>
  <div class="cp-page">

    <!-- Loading -->
    <div v-if="loading" class="cp-skeleton">
      <div class="cp-skeleton__banner" />
      <div class="cp-skeleton__row">
        <div class="cp-skeleton__avatar" />
        <div class="cp-skeleton__lines">
          <div class="cp-skeleton__line cp-skeleton__line--wide" />
          <div class="cp-skeleton__line" />
        </div>
      </div>
    </div>

    <!-- Not found -->
    <div v-else-if="notFound" class="state-center">
      <div class="state-icon">
        <v-icon icon="mdi-storefront-outline" size="44" style="color: var(--c-muted)" />
      </div>
      <p class="state-title">{{ t('community.empty') }}</p>
      <router-link class="btn-back" :to="{ name: 'community', params: localeParams }">
        {{ t('community.directoryTitle') }}
      </router-link>
    </div>

    <!-- Profile -->
    <div v-else-if="community" class="cp-profile">

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

      <!-- Header -->
      <div class="cp-header">
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

    </div>
  </div>
</template>

<style scoped>
.cp-page {
  max-width: 880px;
  margin: 0 auto;
  padding: 24px 20px 56px;
}

/* ── Loading skeleton ─────────────────────────────── */
.cp-skeleton__banner {
  width: 100%;
  aspect-ratio: 16 / 5;
  border-radius: 20px;
  background: var(--c-skeleton);
  animation: cp-pulse 1.6s ease-in-out infinite;
}
.cp-skeleton__row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: -32px;
  padding: 0 20px;
}
.cp-skeleton__avatar {
  width: 84px; height: 84px; border-radius: 20px;
  background: var(--c-skeleton);
  border: 3px solid var(--c-bg);
  flex-shrink: 0;
  animation: cp-pulse 1.6s ease-in-out infinite;
}
.cp-skeleton__lines { display: flex; flex-direction: column; gap: 8px; padding-top: 36px; flex: 1; }
.cp-skeleton__line {
  height: 14px; width: 40%; border-radius: 7px;
  background: var(--c-skeleton);
  animation: cp-pulse 1.6s ease-in-out infinite;
}
.cp-skeleton__line--wide { width: 60%; height: 20px; }
@keyframes cp-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
}

/* ── Not-found state ──────────────────────────────── */
.state-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 72px 20px;
  text-align: center;
}
.state-icon {
  width: 72px; height: 72px; border-radius: 50%;
  background: var(--c-surface-2);
  display: flex; align-items: center; justify-content: center;
}
.state-title { font-size: 15px; font-weight: 700; color: var(--c-text); margin: 0; }
.btn-back {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 12px;
  background: var(--c-trade); color: #fff;
  font-size: 13px; font-weight: 700;
  text-decoration: none;
  transition: opacity 0.15s ease;
}
.btn-back:hover { opacity: 0.88; }

/* ── Profile ──────────────────────────────────────── */
.cp-profile { display: flex; flex-direction: column; gap: 18px; }

.cp-banner {
  width: 100%;
  aspect-ratio: 16 / 5;
  border-radius: 20px;
  overflow: hidden;
  background: var(--c-surface-2);
}
.cp-banner__img { width: 100%; height: 100%; object-fit: cover; }

.cp-header {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  margin-top: -32px;
  padding: 0 20px;
  flex-wrap: wrap;
}
.cp-avatar {
  width: 84px; height: 84px; border-radius: 20px;
  overflow: hidden; flex-shrink: 0;
  border: 3px solid var(--c-bg);
  background: var(--c-surface-2);
  display: flex; align-items: center; justify-content: center;
  font-size: 30px; font-weight: 800; color: var(--c-text);
}
.cp-avatar img { width: 100%; height: 100%; object-fit: cover; }

.cp-header__text { min-width: 0; padding-bottom: 2px; }
.cp-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cp-name {
  font-size: 1.375rem; font-weight: 800; color: var(--c-text);
  margin: 0; letter-spacing: -0.01em;
}
.badge-verified {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 999px;
  background: color-mix(in srgb, var(--c-mutual) 14%, transparent);
  color: var(--c-mutual);
  font-size: 11px; font-weight: 700;
}
.cp-identity {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  margin-top: 4px;
  font-size: 13px; font-weight: 600; color: var(--c-muted);
}
.cp-dot { opacity: 0.6; }

.cp-bio {
  font-size: 13.5px; color: var(--c-muted);
  line-height: 1.6; margin: 0; white-space: pre-wrap;
  padding: 0 20px;
}

/* ── Actions ──────────────────────────────────────── */
.cp-actions {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 0 20px;
}
.cp-action-link {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 11px;
  background: var(--c-surface);
  border: 1.5px solid var(--c-border);
  color: var(--c-text);
  font-size: 13px; font-weight: 700;
  text-decoration: none;
  transition: border-color 0.15s ease;
}
.cp-action-link:hover { border-color: var(--c-trade); }
.cp-action-link--icon { padding: 8px; }

/* ── CTA row ──────────────────────────────────────── */
.cp-cta {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin: 0 20px;
  padding: 16px; border-radius: 14px;
  background: var(--c-surface);
  border: 1.5px solid var(--c-border);
}
.cp-unclaimed { font-size: 12.5px; color: var(--c-muted); flex: 1; min-width: 180px; }

.cp-finalizing {
  display: flex; align-items: center; gap: 8px;
  margin: 0 20px; padding: 12px 16px; border-radius: 12px;
  background: color-mix(in srgb, var(--c-trade) 10%, transparent);
  color: var(--c-trade); font-size: 13px; font-weight: 700;
}

.btn-claim {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 15px; border-radius: 11px;
  background: var(--c-trade); color: #fff;
  font-size: 13px; font-weight: 700;
  cursor: pointer; transition: opacity 0.15s ease;
}
.btn-claim:hover { opacity: 0.88; }

.btn-report {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 15px; border-radius: 11px;
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: #ef4444; font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background 0.15s ease;
  margin-left: auto;
}
.btn-report:hover { background: color-mix(in srgb, #ef4444 22%, transparent); }

.btn-edit-profile {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 15px; border-radius: 11px;
  background: color-mix(in srgb, var(--c-trade) 12%, transparent);
  color: var(--c-trade); font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background 0.15s ease;
}
.btn-edit-profile:hover { background: color-mix(in srgb, var(--c-trade) 22%, transparent); }

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
</style>
