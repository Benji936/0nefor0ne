<script setup>
// Public Community PROFILE page (SEO). Fetches by route.params.slug and
// renders a loading / not-found / profile state. The CTA row (claim, report,
// edit) each opens its own dialog below.
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useHead } from "@unhead/vue";
import { fetchBySlug, updateCommunity, fetchMyCommunities } from "@/lib/community";
import { kindsOf, KINDS, TYPE_KEYS } from "@/lib/communityKinds";
import { validateImageFile, uploadCommunityMedia } from "@/lib/communityMedia";
import { COUNTRIES } from "@/lib/countries";
import { getCurrentSession, onAuthChange, signInWithDiscord } from "@/lib/supabaseClient";
import { LINK_PLATFORMS, MAX_LINKS, linkHref, isValidLink } from "@/lib/communityLinks";
import ClaimCommunityDialog from "@/components/community/ClaimCommunityDialog.vue";
import ReportCommunityDialog from "@/components/community/ReportCommunityDialog.vue";
import PlatformIcon from "@/components/community/PlatformIcon.vue";
import CommunityKindIcon from "@/components/community/CommunityKindIcon.vue";
import FollowButton from "@/components/community/FollowButton.vue";
import CommunityEvents from "@/components/community/CommunityEvents.vue";
import CommunityGiveUp from "@/components/community/CommunityGiveUp.vue";

const route = useRoute();
const router = useRouter();
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

// The community this viewer already owns, if any. An account can own one, so
// on an unclaimed profile this decides between offering the claim and
// explaining why it is not on offer. Cleared on sign-out.
const myOther = ref(null);

async function loadMine() {
  if (!currentUserId.value) { myOther.value = null; return; }
  try {
    const mine = await fetchMyCommunities();
    myOther.value = mine.find((c) => c.slug !== route.params.slug) ?? null;
  } catch (e) {
    console.error("CommunityProfile: fetchMyCommunities failed", e);
  }
}
watch(currentUserId, loadMine, { immediate: true });

// Deleted, and there is no page left to stand on. Released, and the page is
// still here as an unclaimed directory entry, so reloading shows it as the
// public now sees it.
function onGaveUp(mode) {
  if (mode === "delete") router.push({ name: "community", params: localeParams.value });
  else load();
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

// Everything this community is, in the owner's chosen order. The SEO title
// above keeps the primary kind alone: "Store in Geneva" is a title, "Store,
// Discord server and play group in Geneva" is a sentence.
const profileKinds = computed(() => kindsOf(community.value));

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

// Keyless static map thumbnail (Wikimedia's OSM renderer) for the location
// preview: a plain retina PNG centered on the store, no API key and no tracking
// script; only the public coordinates travel in the URL. The image is centered
// on the point, so a pin overlaid at the panel's center marks the exact spot.
// Null when the row has no coordinates (Discord servers / groups) so the panel
// is skipped for them.
const mapImgUrl = computed(() => {
  const c = community.value;
  if (!c || c.lat == null || c.lng == null) return null;
  return `https://maps.wikimedia.org/img/osm-intl,15,${c.lat},${c.lng},640x280@2x.png`;
});

// Display label for a rendered link: a custom "other" label if set, otherwise
// the localized platform name.
function linkLabel(link) {
  if (link.platform === "other" && link.label) return link.label;
  return t(`community.platform_${link.platform}`);
}

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

// Upcoming events (published from the CommunityEvents child) drive Event JSON-LD.
const upcomingEvents = ref([]);
function onEventsLoaded(list) { upcomingEvents.value = Array.isArray(list) ? list : []; }

const eventsJsonLd = computed(() => {
  const c = community.value;
  if (!c) return [];
  return upcomingEvents.value.slice(0, 25).map((e) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    startDate: e.starts_at,
    ...(e.ends_at ? { endDate: e.ends_at } : {}),
    eventAttendanceMode: e.is_online
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    location: e.is_online
      ? { "@type": "VirtualLocation", ...(e.url ? { url: e.url } : {}) }
      : {
          "@type": "Place",
          name: e.location || c.name,
          ...((c.city || c.country) ? { address: [c.city, c.country].filter(Boolean).join(", ") } : {}),
        },
    ...(e.url ? { url: e.url } : {}),
    ...(e.cover_url ? { image: e.cover_url } : {}),
    organizer: { "@type": "Organization", name: c.name, url: canonicalUrl.value },
  }));
});

// Serialize a JSON-LD object to a script entry, escaping "<" so owner-typed free
// text can never break out of the <script> block (defense-in-depth).
function ldScript(obj) {
  return { type: "application/ld+json", innerHTML: JSON.stringify(obj).replace(/</g, "\\u003c") };
}

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
    script: [
      ...(jsonLd.value ? [ldScript(jsonLd.value)] : []),
      ...eventsJsonLd.value.map(ldScript),
    ],
  };
}));

// ── CTA row ────────────────────────────────────────────────────────────────
const claimOpen = ref(false);
function openClaim()  { claimOpen.value = true; }

// Following needs an account; Discord OAuth redirects away and returns here.
async function onFollowAuthRequired() {
  try { await signInWithDiscord(); }
  catch (e) { console.error("sign-in failed", e); }
}

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
  name: "", bio: "", links: [], kinds: [],
  city: "", country: "", avatar_url: null, banner_url: null,
  remote_duel: false,
});

// A place picks up a Discord server or starts a play group long after its page
// exists, so the set of kinds has to be editable, not just chosen once at
// creation. Same rule as the create form: you cannot be nothing.
function toggleEditKind(k) {
  const list = edit.value.kinds;
  if (!list.includes(k)) edit.value.kinds = [...list, k];
  else if (list.length > 1) edit.value.kinds = list.filter((x) => x !== k);
}

// Local key so v-for rows stay stable across reorder / add / remove (the stored
// links carry no id). Never persisted; sanitizeLinks reads only platform/url/label.
let linkKey = 0;

function startEdit() {
  const c = community.value;
  if (!c) return;
  edit.value = {
    name: c.name ?? "", bio: c.bio ?? "",
    links: (c.links ?? []).map((l) => ({
      platform: l.platform, url: l.url ?? "", label: l.label ?? "", _k: ++linkKey,
    })),
    kinds: kindsOf(c),
    city: c.city ?? "", country: c.country ?? "",
    avatar_url: c.avatar_url ?? null, banner_url: c.banner_url ?? null,
    remote_duel: !!c.remote_duel,
  };
  editErr.value = "";
  editing.value = true;
}
function cancelEdit() { editing.value = false; editErr.value = ""; }

// ── Link editor ──────────────────────────────────────────────────────────────
// Platforms already used (each may appear once, except "other" which repeats for
// arbitrary labeled links). Drives which options a row's picker disables.
const usedPlatforms = computed(() => {
  const set = new Set();
  for (const l of edit.value.links) if (l.platform !== "other") set.add(l.platform);
  return set;
});

function firstFreePlatform() {
  const p = LINK_PLATFORMS.find((p) => !usedPlatforms.value.has(p.id));
  return p ? p.id : "other";
}

function addLink() {
  if (edit.value.links.length >= MAX_LINKS) return;
  edit.value.links.push({ platform: firstFreePlatform(), url: "", label: "", _k: ++linkKey });
}
function removeLink(i) { edit.value.links.splice(i, 1); }

// An option is offered only if it is this row's current value or still unused;
// "other" is always available.
function platformDisabled(row, id) {
  return id !== "other" && id !== row.platform && usedPlatforms.value.has(id);
}

const placeholders = {
  website: "https://your-site.com", instagram: "https://instagram.com/you",
  facebook: "https://facebook.com/you", x: "https://x.com/you",
  tiktok: "https://tiktok.com/@you", youtube: "https://youtube.com/@you",
  discord: "https://discord.gg/invite", whatsapp: "https://wa.me/1555…",
  email: "you@store.com", other: "https://…",
};
function placeholderFor(platform) { return placeholders[platform] ?? "https://…"; }

// Native drag-to-reorder, started from each row's handle (so the url inputs stay
// selectable). dragIndex tracks the row being moved; dropIndex highlights the
// insertion target.
const dragIndex = ref(-1);
const dropIndex = ref(-1);
function onDragStart(i, ev) {
  dragIndex.value = i;
  ev.dataTransfer.effectAllowed = "move";
  // Firefox requires data to be set for a drag to begin.
  ev.dataTransfer.setData("text/plain", String(i));
}
function onDragOver(i) { dropIndex.value = i; }
function onDrop(i) {
  const from = dragIndex.value;
  if (from < 0 || from === i) { onDragEnd(); return; }
  const rows = edit.value.links;
  const [moved] = rows.splice(from, 1);
  rows.splice(i, 0, moved);
  onDragEnd();
}
function onDragEnd() { dragIndex.value = -1; dropIndex.value = -1; }

const editValid = computed(() => {
  const n = edit.value.name.trim();
  if (n.length === 0 || n.length > 120 || edit.value.bio.length > 2000) return false;
  // An empty row is fine (it is dropped on save); a row with a url typed in must
  // be valid (well-formed email / non-blank).
  return edit.value.links.every((l) => !String(l.url ?? "").trim() || isValidLink(l));
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
      // sanitizeLinks (in updateCommunity) drops the local _k and empty rows.
      links:       edit.value.links,
      kinds:       edit.value.kinds,
      city:        edit.value.city.trim() || null,
      country:     edit.value.country || null,
      avatar_url:  edit.value.avatar_url || null,
      banner_url:  edit.value.banner_url || null,
      remote_duel: edit.value.remote_duel,
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
  <main class="cp-page" :class="{ 'cp-page--editing': editing }">

    <!-- Loading -->
    <div v-if="loading" class="cp-skel" aria-hidden="true">
      <div class="cp-skel__band">
        <div class="cp-skel__avatar" />
        <div class="cp-skel__lines">
          <div class="cp-skel__line cp-skel__line--wide" />
          <div class="cp-skel__line" />
        </div>
      </div>
      <div class="cp-skel__row">
        <div class="cp-skel__pill" />
        <div class="cp-skel__pill" />
      </div>
    </div>

    <!-- Not found -->
    <div v-else-if="notFound" class="cp-missing">
      <div class="cp-missing__icon">
        <v-icon icon="mdi-storefront-outline" size="40" style="color: var(--c-muted)" />
      </div>
      <p class="cp-missing__title">{{ t('community.empty') }}</p>
      <router-link class="cp-missing__back" :to="{ name: 'community', params: localeParams }">
        <v-icon icon="mdi-arrow-left" size="16" />
        {{ t('community.directoryTitle') }}
      </router-link>
    </div>

    <!-- Profile -->
    <article v-else-if="community" class="cp">

      <!-- Top actions: follow, edit (owner) + report -->
      <div v-if="!editing" class="cp-actions">
        <!-- The owner sees their follower tally instead of a follow button;
             following your own community is not a thing. -->
        <span v-if="isOwner" class="cp-followers">
          <v-icon icon="mdi-account-heart-outline" size="15" />
          {{ t('community.followerCount', community.follower_count ?? 0) }}
        </span>
        <FollowButton
          v-else
          :community-id="community.id"
          :user-id="currentUserId"
          :count="community.follower_count ?? 0"
          @update:count="community.follower_count = $event"
          @auth-required="onFollowAuthRequired"
        />
        <button v-if="isOwner" type="button" class="cp-edit" @click="startEdit">
          <v-icon icon="mdi-pencil-outline" size="16" />
          {{ t('community.editTitle') }}
        </button>
        <button type="button" class="cp-report" @click="openReport">
          <v-icon icon="mdi-flag-outline" size="15" />
          {{ t('community.report') }}
        </button>
      </div>

      <!-- Identity field — amethyst by default, banner enriches it when present -->
      <header
        class="cp-id"
        :class="{ 'cp-id--has-banner': displayBanner, 'cp-id--editing': editing }"
      >
        <div class="cp-id__backdrop" aria-hidden="true">
          <img v-if="displayBanner" :src="displayBanner" alt="" class="cp-id__banner" />
          <span v-else class="cp-id__mark">{{ (displayName || '?')[0].toUpperCase() }}</span>
        </div>

        <template v-if="editing">
          <input ref="bannerInput" type="file" accept="image/*" class="cp-hide" @change="onPickImage('banner', $event)" />
          <button type="button" class="cp-imgbtn cp-imgbtn--banner" :disabled="uploadingBanner" @click="bannerInput?.click()">
            <v-progress-circular v-if="uploadingBanner" indeterminate size="16" width="2" color="white" />
            <template v-else><v-icon icon="mdi-image-edit-outline" size="16" />{{ t('community.changeBanner') }}</template>
          </button>
        </template>

        <div class="cp-id__fg">
          <!-- The whole icon opens the picker while editing; the badge is the
               visible affordance and the keyboard target. -->
          <div
            class="cp-avatar"
            :class="{ 'cp-avatar--editing': editing }"
            @click="editing && !uploadingAvatar && avatarInput?.click()"
          >
            <img v-if="displayAvatar" :src="displayAvatar" :alt="displayName" />
            <span v-else>{{ (displayName || '?')[0].toUpperCase() }}</span>
            <template v-if="editing">
              <!-- .stop matters: this input sits inside the clickable avatar,
                   and input.click() bubbles, so without it opening the picker
                   would re-enter the avatar handler and open it again. -->
              <input
                ref="avatarInput"
                type="file"
                accept="image/*"
                class="cp-hide"
                @click.stop
                @change="onPickImage('avatar', $event)"
              />
              <button
                type="button"
                class="cp-imgbtn cp-imgbtn--avatar"
                :disabled="uploadingAvatar"
                @click.stop="avatarInput?.click()"
                :aria-label="t('community.changeAvatar')"
              >
                <v-progress-circular v-if="uploadingAvatar" indeterminate size="14" width="2" color="white" />
                <v-icon v-else icon="mdi-camera-outline" size="15" />
              </button>
            </template>
          </div>

          <div class="cp-id__text">
            <div class="cp-namerow">
              <h1 v-if="!editing" class="cp-name">{{ community.name }}</h1>
              <input
                v-else
                v-model="edit.name"
                class="cp-name-input"
                maxlength="120"
                :placeholder="t('community.fieldName')"
                :aria-label="t('community.fieldName')"
              />
              <span v-if="!editing && community.verified" class="cp-verified">
                <v-icon icon="mdi-check-decagram" size="13" />
                {{ t('community.verified') }}
              </span>
            </div>

            <div class="cp-meta">
              <!-- Every kind, spelled out. The profile has the room the card
                   does not, and this is the page that has to be exact about
                   what the place actually is. -->
              <template v-if="!editing">
                <template v-for="(k, i) in profileKinds" :key="k">
                  <span v-if="i > 0" class="cp-meta__sep" aria-hidden="true">·</span>
                  <span class="cp-meta__type">
                    <CommunityKindIcon :kind="k" :size="13" />
                    {{ t(TYPE_KEYS[k] ?? TYPE_KEYS.group) }}
                  </span>
                </template>
              </template>
              <span v-else class="cp-kindset" role="group" :aria-label="t('community.fieldKind')">
                <label
                  v-for="k in KINDS"
                  :key="k"
                  class="cp-kindchip"
                  :class="{ 'cp-kindchip--on': edit.kinds.includes(k) }"
                >
                  <input
                    type="checkbox"
                    class="cp-kindchip__box"
                    :checked="edit.kinds.includes(k)"
                    @change="toggleEditKind(k)"
                  />
                  <CommunityKindIcon :kind="k" :size="13" />
                  {{ t(TYPE_KEYS[k]) }}
                </label>
              </span>
              <template v-if="!editing">
                <span v-if="community.remote_duel" class="cp-meta__sep" aria-hidden="true">·</span>
                <span v-if="community.remote_duel" class="cp-meta__remote">
                  <v-icon icon="mdi-web" size="13" />{{ t('community.remoteDuel') }}
                </span>
                <span v-if="cityCountry" class="cp-meta__sep" aria-hidden="true">·</span>
                <span v-if="cityCountry" class="cp-meta__loc">
                  <v-icon icon="mdi-map-marker" size="13" />{{ cityCountry }}
                </span>
              </template>
              <template v-else>
                <span class="cp-meta__sep" aria-hidden="true">·</span>
                <input v-model="edit.city" class="cp-inline-input" :placeholder="t('community.fieldCity')" :aria-label="t('community.fieldCity')" />
                <select v-model="edit.country" class="cp-inline-input cp-inline-select" :aria-label="t('community.fieldCountry')">
                  <option value="">{{ t('community.fieldCountry') }}</option>
                  <option v-for="c in COUNTRIES" :key="c.code" :value="c.name">{{ c.flag }} {{ c.name }}</option>
                </select>
              </template>
            </div>
          </div>
        </div>
      </header>

      <!-- Body: wide two-column on desktop — bio + governance at left,
           location map and reach links stacked in the right rail. -->
      <div class="cp-body">

        <!-- Left column: bio, then governance -->
        <div class="cp-main">
          <p v-if="!editing && community.bio" class="cp-bio">{{ community.bio }}</p>
          <textarea
            v-else-if="editing"
            v-model="edit.bio"
            class="cp-bio-input"
            maxlength="2000"
            :placeholder="t('community.fieldBio')"
            :aria-label="t('community.fieldBio')"
          />

          <!-- Remote-duel toggle (edit only) -->
          <button
            v-if="editing"
            type="button"
            class="cp-remote-toggle"
            :class="{ 'cp-remote-toggle--on': edit.remote_duel }"
            :aria-pressed="edit.remote_duel"
            @click="edit.remote_duel = !edit.remote_duel"
          >
            <v-icon :icon="edit.remote_duel ? 'mdi-check-circle' : 'mdi-web'" size="16" />
            <span class="cp-remote-toggle__label">
              <span class="cp-remote-toggle__title">{{ t('community.remoteDuelLabel') }}</span>
              <span class="cp-remote-toggle__hint">{{ t('community.remoteDuelHint') }}</span>
            </span>
          </button>

          <!-- Events, directly below the description -->
          <CommunityEvents
            v-if="!editing"
            :community="community"
            :is-owner="isOwner"
            @loaded="onEventsLoaded"
          />

          <!-- Claim CTA (unclaimed only; edit + report live in the top bar) -->
          <div v-if="!editing && community.owner == null" class="cp-gov">
            <!-- Offering a claim to someone who already runs a community would
                 walk them through an email code and a checkout only to be
                 refused at the grant. Say it here instead. -->
            <template v-if="myOther">
              <router-link
                class="cp-claim"
                :to="{ name: 'communityProfile', params: { ...localeParams, slug: myOther.slug } }"
              >
                <v-icon icon="mdi-storefront-outline" size="16" />
                {{ myOther.name }}
              </router-link>
              <span class="cp-gov__notice">{{ t('community.claimBlocked') }}</span>
            </template>
            <template v-else>
              <button type="button" class="cp-claim" @click="openClaim">
                <v-icon icon="mdi-storefront-check-outline" size="16" />
                {{ t('community.claimThis') }}
              </button>
              <span class="cp-gov__notice">{{ t('community.unclaimedNotice') }}</span>
            </template>
          </div>

          <!-- Verify CTA: the owner's counterpart to the claim row above. Without
               it there is nothing anywhere that tells someone who created a
               community that verifying it is even possible. -->
          <div v-if="!editing && isOwner && !community.verified" class="cp-gov">
            <router-link
              class="cp-claim"
              :to="{ name: 'communityVerify', params: { ...localeParams, slug: community.slug } }"
            >
              <v-icon icon="mdi-check-decagram-outline" size="16" />
              {{ t('communityVerify.verifyPromptAction') }}
            </router-link>
            <span class="cp-gov__notice">{{ t('communityVerify.verifyPrompt') }}</span>
          </div>

          <!-- Last thing in the column, under everything the owner might
               actually want to do. -->
          <CommunityGiveUp
            v-if="!editing && isOwner"
            :community="community"
            :viewer-id="currentUserId"
            @gone="onGaveUp"
          />

          <div v-if="finalizing" class="cp-finalizing" role="status">
            <v-progress-circular indeterminate size="16" width="2" color="var(--c-trade)" />
            {{ t('community.claimFinalizing') }}
          </div>
        </div>

        <!-- Right rail: location + reach -->
        <aside class="cp-aside">

          <!-- Location preview: click-through map (pan/zoom disabled) -->
          <a
            v-if="!editing && mapUrl"
            :href="mapUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="cp-map"
            :aria-label="t('community.openMap')"
          >
            <span class="cp-map__placeholder" aria-hidden="true">
              <v-icon icon="mdi-map-marker-radius-outline" size="30" />
            </span>
            <img
              :src="mapImgUrl"
              class="cp-map__img"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
            />
            <span class="cp-map__pin" aria-hidden="true">
              <v-icon icon="mdi-map-marker" size="32" />
            </span>
            <span class="cp-map__bar">
              <v-icon icon="mdi-map-marker" size="15" />
              <span class="cp-map__label">{{ cityCountry || t('community.openMap') }}</span>
              <v-icon icon="mdi-open-in-new" size="14" class="cp-map__ext" />
            </span>
          </a>

          <!-- Reach actions: one link per platform, plus the internal listings link -->
          <nav v-if="!editing" class="cp-reach" :aria-label="community.name">
            <a
              v-for="(lnk, i) in (community.links || [])"
              :key="i"
              :href="linkHref(lnk)"
              target="_blank"
              rel="noopener noreferrer"
              class="cp-reach__link"
            >
              <PlatformIcon :platform="lnk.platform" :size="16" />
              <span class="cp-reach__label">{{ linkLabel(lnk) }}</span>
            </a>
            <router-link :to="{ name: 'TradeCenter', params: localeParams }" class="cp-reach__link cp-reach__link--listings">
              <v-icon icon="mdi-cards-outline" size="16" />
              <span class="cp-reach__label">{{ t('community.viewAnnounces') }}</span>
            </router-link>
          </nav>

          <!-- Link editor: add any number, pick a platform, drag to reorder -->
          <div v-else class="cp-linkedit">
            <p class="cp-linkedit__title">{{ t('community.linksTitle') }}</p>
            <ul class="cp-linklist">
              <li
                v-for="(lnk, i) in edit.links"
                :key="lnk._k"
                class="cp-linkrow"
                :class="{ 'cp-linkrow--drop': dropIndex === i && dragIndex !== i, 'cp-linkrow--dragging': dragIndex === i }"
                @dragover.prevent="onDragOver(i)"
                @drop="onDrop(i)"
              >
                <button
                  type="button"
                  class="cp-linkrow__handle"
                  draggable="true"
                  :aria-label="t('community.reorderLink')"
                  @dragstart="onDragStart(i, $event)"
                  @dragend="onDragEnd"
                >
                  <v-icon icon="mdi-drag-vertical" size="18" />
                </button>
                <span class="cp-linkrow__icon"><PlatformIcon :platform="lnk.platform" :size="16" /></span>
                <select v-model="lnk.platform" class="cp-inline-input cp-inline-select cp-linkrow__plat" :aria-label="t('community.platform')">
                  <option
                    v-for="p in LINK_PLATFORMS"
                    :key="p.id"
                    :value="p.id"
                    :disabled="platformDisabled(lnk, p.id)"
                  >{{ t(`community.platform_${p.id}`) }}</option>
                </select>
                <input
                  v-if="lnk.platform === 'other'"
                  v-model="lnk.label"
                  class="cp-inline-input cp-linkrow__label"
                  maxlength="40"
                  :placeholder="t('community.linkLabel')"
                  :aria-label="t('community.linkLabel')"
                />
                <input
                  v-model="lnk.url"
                  class="cp-inline-input cp-linkrow__url"
                  :class="{ 'cp-linkrow__url--invalid': lnk.url && !isValidLink(lnk) }"
                  :type="lnk.platform === 'email' ? 'email' : 'url'"
                  :placeholder="placeholderFor(lnk.platform)"
                  :aria-label="t('community.linkUrl')"
                />
                <button type="button" class="cp-linkrow__del" :aria-label="t('community.removeLink')" @click="removeLink(i)">
                  <v-icon icon="mdi-close" size="16" />
                </button>
              </li>
            </ul>
            <button
              type="button"
              class="cp-addlink"
              :disabled="edit.links.length >= MAX_LINKS"
              @click="addLink"
            >
              <v-icon icon="mdi-plus" size="16" />
              {{ t('community.addLink') }}
            </button>
          </div>
        </aside>
      </div>

      <ClaimCommunityDialog v-model="claimOpen" :community="community" @stale="onStale" />
      <ReportCommunityDialog v-model="reportOpen" :community="community" @sent="onReported" />

      <!-- Sticky edit bar -->
      <div v-if="editing" class="cp-editbar">
        <span v-if="editErr" class="cp-editbar__err" role="alert">{{ editErr }}</span>
        <div class="cp-editbar__actions">
          <button class="btn-cancel-edit" @click="cancelEdit" :disabled="savingEdit || uploadingAvatar || uploadingBanner">
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

    </article>
  </main>
</template>

<style scoped>
/* Scoped danger role: the design system has no danger token, so centralize the
   one red used for report + save errors here instead of scattering raw hex. */
.cp-page {
  --cp-danger: #F2555A;
  --cp-id-h: 188px;
  --cp-rail: 320px;
  max-width: 1120px;
  margin: 0 auto;
  padding: 24px 20px 56px;
}
@media (min-width: 640px) { .cp-page { padding: 32px 24px 64px; } }

/* ── Loading skeleton ─────────────────────────────── */
.cp-skel__band {
  display: flex; align-items: center; gap: 16px;
  min-height: var(--cp-id-h);
  padding: 20px 22px;
  border-radius: 20px;
  background: var(--c-skeleton);
}
.cp-skel__avatar {
  width: 88px; height: 88px; border-radius: 22px; flex-shrink: 0;
  background: color-mix(in srgb, var(--c-bg) 45%, var(--c-skeleton));
}
.cp-skel__lines { display: flex; flex-direction: column; gap: 10px; flex: 1; }
.cp-skel__line {
  height: 16px; width: 45%; border-radius: 8px;
  background: color-mix(in srgb, var(--c-bg) 45%, var(--c-skeleton));
}
.cp-skel__line--wide { width: 68%; height: 24px; }
.cp-skel__row { display: flex; gap: 10px; margin-top: 20px; padding: 0 2px; }
.cp-skel__pill { height: 44px; width: 128px; border-radius: 12px; background: var(--c-skeleton); }
.cp-skel { animation: cp-pulse 1.6s ease-in-out infinite; }
@keyframes cp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
@media (prefers-reduced-motion: reduce) { .cp-skel { animation: none; } }

/* ── Not-found state ──────────────────────────────── */
.cp-missing {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; padding: 76px 20px; text-align: center;
}
.cp-missing__icon {
  width: 76px; height: 76px; border-radius: 50%;
  background: var(--c-surface-2);
  display: flex; align-items: center; justify-content: center;
}
.cp-missing__title { font-size: 15px; font-weight: 700; color: var(--c-text); margin: 0; }
.cp-missing__back {
  display: inline-flex; align-items: center; gap: 7px;
  min-height: 44px; padding: 0 18px; border-radius: 12px;
  background: var(--c-trade); color: #fff;
  font-size: 13px; font-weight: 700; text-decoration: none;
  transition: opacity 0.15s ease;
}
.cp-missing__back:hover { opacity: 0.9; }

/* ── Profile shell ────────────────────────────────── */
.cp { display: flex; flex-direction: column; gap: 22px; }

/* ── Top actions (edit / report) ──────────────────── */
.cp-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-bottom: -8px; }
.cp-actions .cp-report { margin-left: 0; }
/* Owner-side readout: their follower tally sits where the follow button would be. */
.cp-followers {
  display: inline-flex; align-items: center; gap: 6px; margin-right: auto;
  font-size: 13px; font-weight: 600; color: var(--c-muted);
}
.cp-followers .v-icon { color: var(--c-trade); }

/* ── Identity field ───────────────────────────────── */
.cp-id {
  position: relative;
  min-height: var(--cp-id-h);
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--c-trade) 34%, var(--c-border));
  display: flex;
  align-items: flex-end;
  /* Committed amethyst: the field itself carries the brand color, so a bare
     store reads as a place, not an empty banner. */
  background:
    radial-gradient(120% 140% at 12% 0%, color-mix(in srgb, var(--c-trade) 34%, var(--c-surface)) 0%, transparent 60%),
    linear-gradient(150deg, color-mix(in srgb, var(--c-trade) 20%, var(--c-surface)) 0%, var(--c-surface) 72%);
}
.cp-id__backdrop { position: absolute; inset: 0; z-index: 0; }
.cp-id__banner { width: 100%; height: 100%; object-fit: cover; }
/* Ghosted monogram fills the no-banner field with intent instead of dead space. */
.cp-id__mark {
  position: absolute; top: 50%; right: 4%; transform: translateY(-50%);
  font-size: clamp(150px, 34vw, 300px); font-weight: 900; line-height: 1;
  color: color-mix(in srgb, var(--c-trade) 24%, transparent);
  user-select: none; pointer-events: none;
}
/* Scrim so foreground text stays legible over any banner image or the wash. */
.cp-id::after {
  content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background: linear-gradient(to top, var(--c-bg) 2%, color-mix(in srgb, var(--c-bg) 55%, transparent) 34%, transparent 78%);
}
.cp-id--has-banner { background: var(--c-surface-2); }

.cp-id__fg {
  position: relative; z-index: 2;
  display: flex; flex-direction: column; align-items: flex-start; gap: 14px;
  width: 100%; padding: 20px 22px;
}
/* Avatar sits beside the text once there's room; stacks above it on phones. */
@media (min-width: 480px) {
  .cp-id__fg { flex-direction: row; align-items: flex-end; gap: 16px; }
}

.cp-avatar {
  /* Anchors the camera badge. Without this the badge escaped to the nearest
     positioned ancestor and landed in the bottom-right corner of the whole
     identity block, nowhere near the icon it changes. */
  position: relative;
  width: 88px; height: 88px; border-radius: 22px;
  flex-shrink: 0;
  border: 3px solid var(--c-bg);
  background: var(--c-surface-2);
  display: flex; align-items: center; justify-content: center;
  font-size: 32px; font-weight: 800; color: var(--c-text);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}
/* The image is rounded by itself rather than by overflow: hidden on the
   container, so the badge can sit on the corner instead of being clipped by
   it. 19px is the 22px outer radius less the 3px border. */
.cp-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 19px; }

/* In edit mode the icon is the thing you click, so it should look like it. */
.cp-avatar--editing { cursor: pointer; }
.cp-avatar--editing:hover { border-color: color-mix(in srgb, var(--c-trade) 55%, var(--c-bg)); }

.cp-id__text { min-width: 0; flex: 1; padding-bottom: 4px; }
.cp-namerow { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.cp-name {
  font-size: clamp(1.4rem, 4vw, 1.65rem); font-weight: 800; color: var(--c-text);
  margin: 0; letter-spacing: -0.015em; line-height: 1.15;
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.35);
}
.cp-verified {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 10px; border-radius: 999px;
  background: color-mix(in srgb, var(--c-trade) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-trade) 40%, transparent);
  color: var(--c-text);
  font-size: 11px; font-weight: 700;
}
.cp-verified .v-icon { color: var(--c-trade); }
.cp-meta {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 7px;
  font-size: 13px; font-weight: 600; color: var(--c-text);
}
.cp-meta__type {
  display: inline-flex; align-items: center; gap: 5px;
  text-transform: uppercase; letter-spacing: 0.06em; font-size: 11.5px;
  color: var(--c-text);
  background: color-mix(in srgb, var(--c-bg) 40%, transparent);
  padding: 3px 9px; border-radius: 7px;
}
.cp-meta__type .v-icon, .cp-meta__type .cpi-svg { color: var(--c-trade); }
.cp-meta__sep { color: color-mix(in srgb, var(--c-text) 55%, transparent); }
@media (max-width: 479px) { .cp-meta__sep { display: none; } }
.cp-meta__loc, .cp-meta__remote { display: inline-flex; align-items: center; gap: 4px; }

/* Editing the kinds: the same pills the identity line already shows, made
   tickable, so the row does not change shape between reading and editing. */
.cp-kindset { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.cp-kindchip {
  display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
  text-transform: uppercase; letter-spacing: 0.06em; font-size: 11.5px;
  color: color-mix(in srgb, var(--c-text) 62%, transparent);
  background: color-mix(in srgb, var(--c-bg) 40%, transparent);
  border: 1.5px solid transparent;
  padding: 3px 9px; border-radius: 7px;
}
.cp-kindchip .v-icon, .cp-kindchip .cpi-svg { color: currentColor; }
.cp-kindchip--on {
  color: var(--c-text);
  border-color: color-mix(in srgb, var(--c-trade) 55%, transparent);
}
.cp-kindchip--on .v-icon, .cp-kindchip--on .cpi-svg { color: var(--c-trade); }
.cp-kindchip__box { position: absolute; opacity: 0; width: 1px; height: 1px; }
.cp-kindchip:focus-within { outline: 2px solid var(--c-trade); outline-offset: 2px; }
.cp-meta__loc .v-icon, .cp-meta__remote .v-icon { color: var(--c-trade); }

/* ── Remote-duel toggle (edit) ────────────────────── */
.cp-remote-toggle {
  display: flex; align-items: center; gap: 12px; width: 100%;
  text-align: left; cursor: pointer;
  padding: 12px 14px; border-radius: 14px;
  border: 1.5px solid var(--c-border); background: var(--c-surface);
  color: var(--c-text);
  transition: border-color 0.15s ease, background 0.15s ease;
}
.cp-remote-toggle:hover { border-color: color-mix(in srgb, var(--c-trade) 45%, var(--c-border)); }
.cp-remote-toggle > .v-icon { color: var(--c-muted); flex-shrink: 0; }
.cp-remote-toggle--on {
  border-color: color-mix(in srgb, var(--c-trade) 55%, transparent);
  background: color-mix(in srgb, var(--c-trade) 10%, var(--c-surface));
}
.cp-remote-toggle--on > .v-icon { color: var(--c-trade); }
.cp-remote-toggle__label { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cp-remote-toggle__title { font-size: 13.5px; font-weight: 700; }
.cp-remote-toggle__hint { font-size: 11.5px; font-weight: 500; color: var(--c-muted); }

/* ── Body ─────────────────────────────────────────── */
/* Mobile: single stacked column (bio + governance, then the location rail).
   Desktop: the bio and governance hold the fluid left column, the map and
   reach links a fixed right rail, both top-aligned. */
.cp-body { display: flex; flex-direction: column; gap: 20px; padding: 0 4px; }
@media (min-width: 900px) {
  .cp-page:not(.cp-page--editing) .cp-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--cp-rail);
    column-gap: 40px;
    align-items: start;
  }
}

/* Left column: bio sits above the governance row. */
.cp-main { min-width: 0; display: flex; flex-direction: column; gap: 24px; }

/* Right rail: location map above the stacked reach links. */
.cp-aside { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

.cp-bio {
  font-size: 14px; color: var(--c-muted); line-height: 1.7;
  margin: 0; white-space: pre-wrap; max-width: 64ch;
}

/* ── Reach actions ────────────────────────────────── */
/* Stacked full-width buttons inside the rail. */
.cp-reach {
  display: flex; flex-direction: column; align-items: stretch; gap: 10px;
}
.cp-reach__link {
  display: inline-flex; align-items: center; gap: 7px;
  min-height: 44px; padding: 0 16px; border-radius: 12px;
  background: var(--c-surface);
  border: 1.5px solid var(--c-border);
  color: var(--c-text);
  font-size: 13px; font-weight: 700; text-decoration: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.cp-reach__link .v-icon,
.cp-reach__link .cpi-svg { color: var(--c-trade); flex-shrink: 0; }
.cp-reach__link:hover {
  border-color: var(--c-trade);
  background: color-mix(in srgb, var(--c-trade) 8%, var(--c-surface));
}
.cp-reach__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The internal listings link reads as secondary to the outbound social links. */
.cp-reach__link--listings { color: var(--c-muted); }

/* ── Location map preview ─────────────────────────── */
.cp-map {
  position: relative; display: block;
  border-radius: 16px; overflow: hidden;
  border: 1px solid var(--c-border);
  background: var(--c-surface-2);
  text-decoration: none;
  transition: border-color 0.15s ease;
}
.cp-map:hover { border-color: var(--c-trade); }
/* Loading state: shows through until the (transparent-until-painted) iframe
   fills with tiles, so the panel never reads as an empty/broken box. */
.cp-map__placeholder {
  position: absolute; inset: 0; z-index: 0;
  display: flex; align-items: center; justify-content: center;
  color: color-mix(in srgb, var(--c-trade) 45%, transparent);
}
.cp-map__img {
  position: relative; z-index: 1;
  display: block; width: 100%; height: 200px;
  object-fit: cover; object-position: center; /* keeps the store centered */
  /* Tame OSM's bright tiles so the panel sits in the dim UI. */
  filter: saturate(0.85) brightness(0.9) contrast(1.02);
}
@media (min-width: 640px) { .cp-map__img { height: 224px; } }
/* Pin marks the exact spot: its tip rests on the image center (the store). */
.cp-map__pin {
  position: absolute; left: 50%; top: 50%; z-index: 2;
  transform: translate(-50%, -100%); pointer-events: none;
  color: var(--c-trade);
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55));
}
.cp-map__bar {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 3;
  display: flex; align-items: center; gap: 7px;
  padding: 12px 14px 11px;
  background: linear-gradient(
    to top,
    var(--c-bg) 0%,
    color-mix(in srgb, var(--c-bg) 82%, transparent) 45%,
    transparent 100%);
  color: var(--c-text); font-size: 13px; font-weight: 700;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.65);
}
.cp-map__bar > .v-icon:first-child { color: var(--c-trade); }
.cp-map__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-map__ext { color: var(--c-muted); }
.cp-map:hover .cp-map__ext { color: var(--c-trade); }

/* ── Governance row ───────────────────────────────── */
.cp-gov {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding-top: 18px;
  border-top: 1px solid var(--c-border);
}
/* No bio: the governance row leads the column, so drop the separating hairline. */
.cp-main > .cp-gov:first-child { border-top: none; padding-top: 0; }
.cp-gov__notice { font-size: 12.5px; color: var(--c-muted); flex: 1; min-width: 160px; }
.cp-claim {
  display: inline-flex; align-items: center; gap: 7px;
  min-height: 44px; padding: 0 18px; border-radius: 12px;
  background: var(--c-trade); color: #fff;
  font-size: 13px; font-weight: 700; cursor: pointer;
  transition: opacity 0.15s ease;
}
.cp-claim:hover { opacity: 0.9; }
/* The verify CTA uses this same treatment but is a link, not a button. */
a.cp-claim { text-decoration: none; }
.cp-edit {
  display: inline-flex; align-items: center; gap: 7px;
  min-height: 44px; padding: 0 16px; border-radius: 12px;
  background: color-mix(in srgb, var(--c-trade) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-trade) 30%, transparent);
  color: var(--c-trade);
  font-size: 13px; font-weight: 700; cursor: pointer;
  transition: background 0.15s ease;
}
.cp-edit:hover { background: color-mix(in srgb, var(--c-trade) 24%, transparent); }
.cp-report {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 44px; padding: 0 14px; border-radius: 12px;
  margin-left: auto;
  background: transparent; color: var(--c-muted);
  font-size: 12.5px; font-weight: 700; cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.cp-report:hover { background: color-mix(in srgb, var(--cp-danger) 14%, transparent); color: var(--cp-danger); }

.cp-finalizing {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px; border-radius: 12px;
  background: color-mix(in srgb, var(--c-trade) 10%, transparent);
  color: var(--c-trade); font-size: 13px; font-weight: 700;
}

/* ── Shared focus ring ────────────────────────────── */
.cp-reach__link:focus-visible,
.cp-map:focus-visible,
.cp-claim:focus-visible,
.cp-edit:focus-visible,
.cp-report:focus-visible,
.cp-missing__back:focus-visible,
.cp-imgbtn:focus-visible,
.cp-addlink:focus-visible,
.cp-linkrow__handle:focus-visible,
.cp-linkrow__del:focus-visible,
.btn-save-edit:focus-visible,
.btn-cancel-edit:focus-visible,
.cp-name-input:focus-visible,
.cp-inline-input:focus-visible,
.cp-bio-input:focus-visible {
  outline: 2px solid var(--c-trade);
  outline-offset: 2px;
}

/* ── Inline edit mode ─────────────────────────────── */
.cp-page--editing { padding-bottom: 92px; } /* room for the sticky bar */

.cp-name-input {
  width: 100%; max-width: 420px;
  background: color-mix(in srgb, var(--c-bg) 55%, var(--c-surface));
  border: 1.5px solid var(--c-border); border-radius: 12px;
  padding: 7px 12px; font-size: 1.4rem; font-weight: 800; color: var(--c-text);
  letter-spacing: -0.015em; outline: none; transition: border-color 0.15s ease;
}
.cp-name-input:focus { border-color: var(--c-trade); }

.cp-inline-input {
  background: color-mix(in srgb, var(--c-bg) 55%, var(--c-surface));
  border: 1.5px solid var(--c-border); border-radius: 10px;
  padding: 7px 10px; font-size: 13px; font-weight: 600; color: var(--c-text);
  outline: none; transition: border-color 0.15s ease; min-width: 0;
}
.cp-inline-input:focus { border-color: var(--c-trade); }
/* appearance:none strips the native arrow, and nothing was drawn in its place,
   so a select read as a flat box with a word in it. The country picker sat next
   to the city field saying "Country" and nobody could tell it opened. */
.cp-inline-select {
  cursor: pointer; appearance: none;
  padding-right: 28px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.cp-bio-input {
  width: 100%; box-sizing: border-box;
  background: var(--c-surface); border: 1.5px solid var(--c-border); border-radius: 14px;
  padding: 12px 14px; font-size: 14px; color: var(--c-text); line-height: 1.65;
  min-height: 104px; resize: vertical; outline: none; font-family: inherit;
  transition: border-color 0.15s ease;
}
.cp-bio-input:focus { border-color: var(--c-trade); }

/* Link editor (owner) */
.cp-linkedit { display: flex; flex-direction: column; gap: 12px; }
.cp-linkedit__title {
  margin: 0; font-size: 11.5px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em; color: var(--c-muted);
}
.cp-linklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.cp-linkrow {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 4px; border-radius: 10px;
  transition: background 0.12s ease, opacity 0.12s ease;
}
.cp-linkrow--dragging { opacity: 0.4; }
.cp-linkrow--drop { background: color-mix(in srgb, var(--c-trade) 14%, transparent); }
.cp-linkrow__handle {
  flex-shrink: 0; display: flex; align-items: center; padding: 4px 0;
  color: var(--c-muted); cursor: grab; background: transparent; border: none;
}
.cp-linkrow__handle:active { cursor: grabbing; }
.cp-linkrow__icon {
  flex-shrink: 0; width: 20px; display: flex; align-items: center; justify-content: center;
  color: var(--c-trade);
}
.cp-linkrow__plat { flex: 0 0 auto; width: 120px; min-height: 40px; }
.cp-linkrow__label { flex: 1 1 110px; min-height: 40px; }
.cp-linkrow__url { flex: 2 1 150px; min-height: 40px; }
.cp-linkrow__url--invalid, .cp-linkrow__url--invalid:focus { border-color: var(--cp-danger); }
.cp-linkrow__del {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 8px;
  color: var(--c-muted); background: transparent; border: none; cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.cp-linkrow__del:hover { color: var(--cp-danger); background: color-mix(in srgb, var(--cp-danger) 14%, transparent); }
.cp-addlink {
  display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
  min-height: 40px; padding: 0 14px; border-radius: 10px;
  background: color-mix(in srgb, var(--c-trade) 12%, transparent);
  border: 1px dashed color-mix(in srgb, var(--c-trade) 40%, transparent);
  color: var(--c-trade); font-size: 13px; font-weight: 700; cursor: pointer;
  transition: background 0.12s ease;
}
.cp-addlink:hover:not(:disabled) { background: color-mix(in srgb, var(--c-trade) 22%, transparent); }
.cp-addlink:disabled { opacity: 0.4; pointer-events: none; }

.cp-editbar {
  position: sticky; bottom: 0; z-index: 5;
  display: flex; align-items: center; justify-content: flex-end; gap: 12px; flex-wrap: wrap;
  margin: 4px -20px -56px; padding: 14px 20px;
  background: color-mix(in srgb, var(--c-surface) 94%, transparent);
  backdrop-filter: blur(8px);
  border-top: 1px solid var(--c-border);
}
@media (min-width: 640px) { .cp-editbar { margin: 4px -24px -64px; padding: 14px 24px; } }
.cp-editbar__err { color: var(--cp-danger); font-size: 12.5px; font-weight: 600; margin-right: auto; }
.cp-editbar__actions { display: flex; align-items: center; gap: 10px; }
.btn-cancel-edit {
  min-height: 44px; padding: 0 16px; border-radius: 12px; font-size: 13px; font-weight: 600;
  color: var(--c-muted); cursor: pointer; transition: background 0.15s ease;
}
.btn-cancel-edit:hover { background: var(--c-surface-2); }
.btn-cancel-edit:disabled { opacity: 0.4; pointer-events: none; }
.btn-save-edit {
  display: flex; align-items: center; gap: 7px; min-width: 140px; min-height: 44px; justify-content: center;
  padding: 0 20px; border-radius: 12px; background: var(--c-trade); color: #fff;
  font-size: 13px; font-weight: 700; cursor: pointer; transition: opacity 0.15s ease;
}
.btn-save-edit:hover:not(:disabled) { opacity: 0.9; }
.btn-save-edit:disabled { opacity: 0.4; pointer-events: none; }

/* ── Image upload controls ────────────────────────── */
.cp-hide { display: none; }
.cp-imgbtn {
  position: absolute; z-index: 3;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  background: color-mix(in srgb, var(--c-bg) 62%, transparent); color: #fff;
  font-size: 12px; font-weight: 700; cursor: pointer; border: none;
  transition: opacity 0.15s ease;
}
.cp-imgbtn:hover:not(:disabled) { opacity: 0.85; }
.cp-imgbtn:disabled { opacity: 0.6; pointer-events: none; }
.cp-imgbtn--banner { inset: 12px 12px auto auto; min-height: 40px; padding: 0 14px; border-radius: 12px; }
.cp-imgbtn--avatar {
  inset: auto -4px -4px auto; width: 32px; height: 32px; border-radius: 50%;
  border: 2px solid var(--c-bg);
}
</style>
