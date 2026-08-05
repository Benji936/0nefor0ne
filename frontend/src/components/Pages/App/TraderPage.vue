<script setup>
// A trader's own page. Same body as TraderProfileDialog, but at a permanent
// URL — which is the point: a router-link works from any component, so every
// place that names a person can now link to them without that component's
// ancestor having to mount a dialog.
//
// noindex on purpose. The profile is public to signed-in traders, but these
// are real people with a city and a card collection attached; being reachable
// in-app is not the same as being crawled and indexed by name. The community
// pages are the surface built to be found from search.
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useHead } from "@unhead/vue";
import TraderProfileBody from "@/components/trade/TraderProfileBody.vue";
import ProposeTradeDialog from "@/components/trade/ProposeTradeDialog.vue";
import { getCurrentSession, onAuthChange, signInWithDiscord } from "@/lib/supabaseClient";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const traderId = computed(() => String(route.params.id || ""));
const locale = computed(() => route.params.locale || "en");

const profile = ref(null);
const currentUserId = ref(null);

let stopAuth = null;
onMounted(async () => {
  currentUserId.value = (await getCurrentSession())?.user?.id ?? null;
  stopAuth = onAuthChange((s) => { currentUserId.value = s?.user?.id ?? null; });
});
onUnmounted(() => stopAuth?.());

const isSelf = computed(() => !!currentUserId.value && currentUserId.value === traderId.value);

const displayName = computed(() => profile.value?.name || t("userCard.anonymous"));

// Shareable but not indexed, which is the whole point of the link: Discord and
// the like read og:*, search engines obey robots. The two are independent, so
// a rich unfurl costs nothing in search exposure.
const BASE = "https://0nefor.one";
const shareTitle = computed(() =>
  profile.value ? t("traderProfile.metaTitle", { name: displayName.value }) : "");
const shareDesc = computed(() => {
  if (!profile.value) return "";
  const where = [profile.value.city, profile.value.country_code].filter(Boolean).join(", ");
  return t("traderProfile.shareDesc", {
    name: displayName.value,
    count: Number(profile.value.trade_pile_count ?? 0),
    where: where || t("traderProfile.noLocationSet"),
  });
});

useHead(computed(() => {
  const meta = [{ name: "robots", content: "noindex, nofollow" }];
  if (profile.value) {
    meta.push(
      { property: "og:title", content: shareTitle.value },
      { property: "og:description", content: shareDesc.value },
      { property: "og:url", content: `${BASE}${route.path}` },
      { name: "twitter:title", content: shareTitle.value },
      { name: "twitter:description", content: shareDesc.value },
    );
    // Only override the site-wide logo when there is a real face to show.
    if (profile.value.avatar_url) {
      meta.push({ property: "og:image", content: profile.value.avatar_url });
    }
  }
  return { title: profile.value ? shareTitle.value : undefined, meta };
}));

// Signing in leaves the page and returns here, so the visitor lands back on
// the profile they were sent, now with matching switched on.
async function onAuthRequired() {
  try { await signInWithDiscord(); }
  catch (e) { console.error("sign-in failed", e); }
}

// ── Propose ───────────────────────────────────────────────────────────────
const proposeOpen = ref(false);
const proposeUser = computed(() => ({ id: traderId.value, name: profile.value?.name ?? null }));

function goBack() {
  // Prefer real history so "back" returns to whatever linked here; fall back to
  // the trade centre when the page was opened cold from a pasted URL.
  if (window.history.length > 1) router.back();
  else router.push({ name: "TradeCenter", params: { locale: locale.value } });
}
</script>

<template>
  <div class="tp">
    <button type="button" class="tp__back" @click="goBack">
      <v-icon icon="mdi-arrow-left" size="18" />
      {{ t('traderProfile.back') }}
    </button>

    <!-- heading-level 1: on a page the trader's name is the document's
         heading. The dialog leaves it at the default 2. -->
    <TraderProfileBody :trader-id="traderId" :heading-level="1" :viewer-id="currentUserId" @loaded="profile = $event" @propose="proposeOpen = true" @auth-required="onAuthRequired">
      <template #not-found-action>
        <router-link class="tp__recover" :to="{ name: 'TradeCenter', params: { locale } }">
          <v-icon icon="mdi-arrow-left" size="16" />
          {{ t('traderProfile.toTradeCenter') }}
        </router-link>
      </template>
    </TraderProfileBody>

    <!-- Proposing needs an account, so a signed-out visitor gets no button
         rather than one that dead-ends in the proposal dialog. -->
    <div v-if="profile && currentUserId && !isSelf" class="tp__actions">
      <button type="button" class="tp__propose" @click="proposeOpen = true">
        <v-icon icon="mdi-swap-horizontal" size="18" />
        {{ t('traderProfile.proposeTrade') }}
      </button>
    </div>

    <ProposeTradeDialog v-model="proposeOpen" :user="proposeUser" />
  </div>
</template>

<style scoped>
/* The page is the container. There is no card: a single full-width panel
   wrapping the entire contents of a page it exactly matches is a border drawn
   around nothing, and the gradient strip on top of it carried no meaning at
   all. Width and rhythm do the containing instead. */
.tp {
  display: flex; flex-direction: column; gap: 14px;
  padding: 24px 24px 64px; max-width: 900px; margin: 0 auto; width: 100%;
}

.tp__back {
  display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
  min-height: 40px; padding: 0 10px; border-radius: 10px;
  background: transparent; border: none; cursor: pointer;
  font-size: 13px; font-weight: 700; color: var(--c-muted);
  transition: color .15s ease, background .15s ease;
}
.tp__back:hover { color: var(--c-text); background: var(--c-surface-2); }
.tp__back:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.tp__actions {
  display: flex; justify-content: flex-end;
  margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--c-border);
}
.tp__propose {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 20px; border-radius: 12px;
  background: var(--c-trade); color: #fff; border: none; cursor: pointer;
  font-size: 14px; font-weight: 700;
  transition: opacity .15s ease, transform .15s ease;
}
.tp__propose:hover { opacity: .88; transform: translateY(-1px); }
.tp__propose:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

@media (max-width: 600px) {
  .tp { padding: 16px 16px 48px; }
  /* Full-width primary action: easier to hit one-handed than a right-aligned
     button, which on a phone sits furthest from the thumb. */
  .tp__actions { justify-content: stretch; }
  .tp__propose { width: 100%; justify-content: center; }
}

/* Touch targets. The back button is 40px on a pointer device, which is fine
   for a mouse and under the mark for a thumb. */
@media (pointer: coarse) {
  .tp__back { min-height: 48px; padding: 0 14px; }
  .tp__propose { min-height: 48px; }
  .tp__recover { min-height: 48px; }
}

/* A bad or stale URL used to end at a sentence with nowhere to go. */
.tp__recover {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 40px; padding: 0 16px; border-radius: 11px;
  background: color-mix(in srgb, var(--c-trade) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-trade) 30%, transparent);
  color: var(--c-trade); font-size: 13px; font-weight: 700; text-decoration: none;
  transition: background 0.15s ease;
}
.tp__recover:hover { background: color-mix(in srgb, var(--c-trade) 24%, transparent); }
.tp__recover:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

/* Targeted, matching CommunityProfile and SideNav rather than a blanket
   `*` override. */
@media (prefers-reduced-motion: reduce) {
  .tp__back { transition: none; }
  .tp__propose { transition: none; }
  .tp__propose:hover { transform: none; }
  .tp__recover { transition: none; }
}
</style>
