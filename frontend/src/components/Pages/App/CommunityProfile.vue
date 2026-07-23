<script setup>
// Public Community PROFILE page (SEO). Fetches by route.params.slug and
// renders a loading / not-found / profile state. The CTA row (claim / report
// / edit) are stub handlers here — Tasks 9/10/12 wire the real dialogs.
import { ref, computed, watch, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { useHead } from "@unhead/vue";
import { fetchBySlug } from "@/lib/community";
import { getCurrentSession } from "@/lib/supabaseClient";

const route = useRoute();
const { t } = useI18n();

const community      = ref(null);
const loading        = ref(true);
const notFound       = ref(false);
const currentUserId  = ref(null);

const KIND_KEYS = { store: "kindStore", discord: "kindDiscord", group: "kindGroup" };

async function load() {
  loading.value   = true;
  notFound.value  = false;
  community.value = null;
  try {
    const data = await fetchBySlug(route.params.slug);
    community.value = data;
    notFound.value  = !data;
  } catch (e) {
    console.error("CommunityProfile: fetchBySlug failed", e);
    community.value = null;
    notFound.value  = true;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const session = await getCurrentSession();
  currentUserId.value = session?.user?.id ?? null;
  load();
});

// The page is reused across slugs (e.g. a related-profile link), so local UI
// state must be reset here rather than relying on a fresh component mount.
watch(() => route.params.slug, () => {
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
  return t("community.metaProfileTitle", { name: c.name, kind: kindLabel.value, city: c.city || "" });
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
      { type: "application/ld+json", innerHTML: JSON.stringify(jsonLd.value) },
    ] : [],
  };
}));

// ── CTA row — no-op placeholders, wired in Task 9/10/12 ───────────────────
function openClaim()  {} // wired in Task 9/10/12 (ClaimCommunityDialog)
function openReport() {} // wired in Task 9/10/12 (ReportCommunityDialog)
function openEdit()   {} // wired in Task 9/10/12 (CommunityEditDialog)
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
      <div class="cp-banner">
        <img v-if="community.banner_url" :src="community.banner_url" :alt="community.name" class="cp-banner__img" />
      </div>

      <!-- Header -->
      <div class="cp-header">
        <div class="cp-avatar">
          <img v-if="community.avatar_url" :src="community.avatar_url" :alt="community.name" />
          <span v-else>{{ (community.name || '?')[0].toUpperCase() }}</span>
        </div>
        <div class="cp-header__text">
          <div class="cp-title-row">
            <h1 class="cp-name">{{ community.name }}</h1>
            <span v-if="community.verified" class="badge-verified">
              <v-icon icon="mdi-check-decagram" size="13" />
              {{ t('community.verified') }}
            </span>
          </div>
          <div class="cp-identity">
            <span>{{ kindLabel }}</span>
            <span v-if="cityCountry" class="cp-dot">·</span>
            <span v-if="cityCountry">{{ cityCountry }}</span>
            <span v-if="community.region" class="cp-dot">·</span>
            <span v-if="community.region">{{ community.region }}</span>
          </div>
        </div>
      </div>

      <!-- Bio -->
      <p v-if="community.bio" class="cp-bio">{{ community.bio }}</p>

      <!-- Action row -->
      <div class="cp-actions">
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

      <!-- CTA row -->
      <div class="cp-cta">
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
        <button v-if="isOwner" type="button" class="btn-edit-profile" @click="openEdit">
          <v-icon icon="mdi-pencil-outline" size="16" />
          {{ t('community.editTitle') }}
        </button>
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
</style>
