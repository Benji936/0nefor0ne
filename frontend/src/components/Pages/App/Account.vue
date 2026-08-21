<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { getClient, updateTraderProfile, linkDiscordAccount, syncDiscordIdToTrader } from "@/lib/supabaseClient";
import { COUNTRIES } from "@/lib/countries";
import { countryByCode } from "@/lib/countries";
import { fetchMyCommunities, fetchMyClaimSources, fetchMyCountryCode } from "@/lib/community";
import { fetchFollowing, unfollow } from "@/lib/communityFollow";
import CommunityKindIcon from "@/components/community/CommunityKindIcon.vue";
import CommunityBillingLine from "@/components/community/CommunityBillingLine.vue";
import VerifyPhoneDialog from "@/components/dialogs/VerifyPhoneDialog.vue";
import { isMyPhoneVerified } from "@/lib/phoneVerify";
import { loadAccountStats, createStatsGeneration } from "@/lib/accountStats";

const { t } = useI18n();

const props = defineProps({ login: { type: Object, default: null } });

// ── Profile state ─────────────────────────────────────────────────────────
const loading   = ref(false);
const saving    = ref(false);
const saved     = ref(false);
const errorMsg  = ref("");

const name        = ref("");
const countryCode = ref("");
const city        = ref("");
const tradeScope  = ref("worldwide");
const discordId       = ref(null);  // null = not linked, string = linked
const discordUsername = ref(null);  // Discord display name from session
const discordLinking  = ref(false);
const discordSyncing  = ref(false);
const discordSynced   = ref(false); // shows ✓ briefly after re-sync
const discordError    = ref("");

// ── Phone verification ────────────────────────────────────────────────────
// Shown here whether or not the trade gate is switched on. Two reasons: people
// should be able to see that they are verified without being refused something
// first, and verifying *before* the gate is switched on is the only way to
// prove SMS delivery works without blocking everybody's trading to find out.
const phoneVerified   = ref(false);
const phoneChecking   = ref(true);
const phoneDialogOpen = ref(false);

async function refreshPhoneStatus() {
  phoneChecking.value = true;
  phoneVerified.value = await isMyPhoneVerified();
  phoneChecking.value = false;
}

// The three scopes nest: trading worldwide includes your own city. The hero
// dial draws them as rings and lights every one your reach covers, so the
// picture is "how far out do you go", not "which radio button is on".
const REACH_RINGS = ["local", "national", "worldwide"];
const reachDepth = computed(() => REACH_RINGS.indexOf(tradeScope.value) + 1);

const SCOPES = computed(() => [
  { value: "local",     label: t('account.scopes.local'),     icon: "mdi-map-marker"  },
  { value: "national",  label: t('account.scopes.national'),  icon: "mdi-flag-outline" },
  { value: "worldwide", label: t('account.scopes.worldwide'), icon: "mdi-earth"        },
]);

const countryItems = COUNTRIES.map(c => ({ title: `${c.flag} ${c.name}`, value: c.code }));

const initials = computed(() => {
  const n = name.value.trim();
  if (!n) return "?";
  return n.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
});

const countryDisplay = computed(() => {
  const c = countryByCode(countryCode.value);
  return c ? `${c.flag} ${c.name}` : "";
});

// Display-only: the currently selected trade-range option, for the header badge.
const activeScope = computed(() =>
  SCOPES.value.find(s => s.value === tradeScope.value) || SCOPES.value[SCOPES.value.length - 1]
);

async function loadProfile() {
  if (!props.login?.user?.id) return;
  loading.value = true;
  try {
    const { data } = await getClient()
      .from("Trader")
      .select("Name, country_code, City, trade_scope, discord_id")
      .eq("id", props.login.user.id)
      .single();
    if (data) {
      name.value        = data.Name        ?? "";
      countryCode.value = data.country_code ?? "";
      city.value        = data.City        ?? "";
      tradeScope.value  = data.trade_scope  ?? "worldwide";
      discordId.value   = data.discord_id   ?? null;
    }
    // Also read Discord username from current session identities (instant, no extra query)
    const discordIdentity = props.login?.user?.identities?.find(i => i.provider === 'discord');
    if (discordIdentity) {
      discordUsername.value = discordIdentity.identity_data?.full_name
        || discordIdentity.identity_data?.name
        || discordIdentity.identity_data?.preferred_username
        || null;
    }
  } finally {
    loading.value = false;
  }
}

async function saveProfile() {
  if (!props.login?.user?.id || saving.value) return;
  saving.value = true;
  saved.value  = false;
  errorMsg.value = "";
  try {
    const country = COUNTRIES.find(c => c.code === countryCode.value)?.name ?? "";
    const { error } = await updateTraderProfile(props.login.user.id, {
      name: name.value.trim(), countryCode: countryCode.value, country, city: city.value.trim(), tradeScope: tradeScope.value,
    });
    if (error) { errorMsg.value = error.message ?? "Save failed."; return; }
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 3000);
  } finally {
    saving.value = false;
  }
}

async function connectDiscord() {
  discordLinking.value = true;
  discordError.value = "";
  try {
    const { error } = await linkDiscordAccount();
    if (error) discordError.value = error.message ?? "Could not start Discord linking.";
    // On success the browser redirects to Discord — no further action needed here.
  } catch (err) {
    discordError.value = err?.message ?? "Unexpected error.";
    discordLinking.value = false;
  }
}

async function resyncDiscord() {
  discordSyncing.value = true;
  discordError.value = "";
  discordSynced.value = false;
  try {
    const identity = await syncDiscordIdToTrader();
    if (identity) {
      discordId.value = identity.id;
      discordUsername.value = identity.identity_data?.full_name
        || identity.identity_data?.name
        || identity.identity_data?.preferred_username
        || null;
      discordSynced.value = true;
      setTimeout(() => { discordSynced.value = false; }, 3000);
    } else {
      discordError.value = "No Discord identity found in your session. Try connecting again.";
    }
  } catch (err) {
    discordError.value = err?.message ?? "Re-sync failed.";
  } finally {
    discordSyncing.value = false;
  }
}

// ── My communities ───────────────────────────────────────────────────────
const communities        = ref([]);
// communityId -> which subscription is paying for each, and where it stands.
// Read through billingState(), never field by field: Stripe leaves a cancelled
// subscription 'active' until its period ends, so status alone mislabels dates.
const claimSources       = ref({});
const loadingCommunities = ref(false);
// The pricing fallback for a community that never filled in its own country.
const myCountryCode      = ref(null);
// True when the billing read itself failed. Distinct from "no subscription".
const billingUnavailable = ref(false);

const KIND_LABELS = computed(() => ({
  store:   t('community.kindStore'),
  discord: t('community.kindDiscord'),
  group:   t('community.kindGroup'),
}));

async function loadCommunities() {
  if (!props.login?.user?.id) return;
  loadingCommunities.value = true;
  try {
    const [rows, sources, cc] = await Promise.all([
      fetchMyCommunities(),
      fetchMyClaimSources(),
      fetchMyCountryCode(),
    ]);
    communities.value  = rows;
    // null means the billing read failed, which is not the same as "no claims".
    // Kept apart so the panel can say it does not know instead of asserting
    // that somebody has no subscription.
    billingUnavailable.value = sources === null;
    claimSources.value = sources ?? {};
    myCountryCode.value = cc;
  } finally {
    loadingCommunities.value = false;
  }
}

// ── Activity stats ───────────────────────────────────────────────────────
// One ref per source, each holding { status, data } with status in
// loading | guest | ready | error. Separate refs rather than one object is the
// whole point: a source that fails or hangs settles only its own row.
// `loading` is the initial value here and is never emitted by the module — a
// group is loading exactly while its promise is unsettled.
const deckStats       = ref({ status: "loading", data: null });
const collectionStats = ref({ status: "loading", data: null });
const proposalStats   = ref({ status: "loading", data: null });

// The watch below runs with { immediate: true } and so fires twice on a normal
// signed-in load. Every write is gated on still being the newest load, so a
// slow read from a superseded one — or from a user who has since signed out —
// cannot repaint over the current numbers.
const statsGen = createStatsGeneration();

function loadStats() {
  const token = statsGen.next();
  // Reset synchronously, so the previous account's numbers are gone before the
  // new ones are asked for rather than after they arrive.
  deckStats.value = collectionStats.value = proposalStats.value = { status: "loading", data: null };

  const stats = loadAccountStats(props.login?.user?.id ?? null);
  stats.decks.then((g)      => { if (statsGen.isCurrent(token)) deckStats.value = g; });
  stats.collection.then((g) => { if (statsGen.isCurrent(token)) collectionStats.value = g; });
  stats.proposals.then((g)  => { if (statsGen.isCurrent(token)) proposalStats.value = g; });
}

// ── Communities I follow ─────────────────────────────────────────────────
const following        = ref([]);
const loadingFollowing = ref(false);

async function loadFollowing() {
  if (!props.login?.user?.id) return;
  loadingFollowing.value = true;
  try {
    following.value = await fetchFollowing(props.login.user.id);
  } finally {
    loadingFollowing.value = false;
  }
}

// Unfollowing from this list drops the row straight away rather than refetching.
async function onUnfollow(row) {
  const prev = following.value;
  following.value = following.value.filter((r) => r.id !== row.id);
  try { await unfollow(row.id, props.login.user.id); }
  catch { following.value = prev; }
}

watch(() => props.login?.user?.id, (id) => {
  if (id) { loadProfile(); loadCommunities(); loadFollowing(); refreshPhoneStatus(); }
  // A null id means "no session yet", which is indistinguishable from "signed
  // out" until one arrives. Settle the row either way: the rest of this page
  // renders blank fields rather than spinners when there is nobody signed in,
  // and a status that checks forever is worse than one that says nothing.
  else { phoneChecking.value = false; phoneVerified.value = false; }
  // Runs on both branches: with no id it asks for nothing and settles every
  // group to the guest state, which is what keeps a signed-out visitor from
  // watching three skeletons that will never resolve.
  loadStats();
}, { immediate: true });

const route = useRoute();
const locale = computed(() => route.params.locale || "en");

function statusStyle(status) {
  const color = status === "published" ? "var(--c-mutual)" : status === "hidden" ? "var(--c-accent)" : "var(--c-muted)";
  return { color, background: `color-mix(in srgb, ${color} 12%, transparent)` };
}

</script>

<template>
  <div class="acct">

    <!-- Identity header: the page's H1 and the trading "reach" it drives -->
    <header class="acct-hero">
      <div class="acct-hero__glow" aria-hidden="true" />

      <div class="acct-hero__id">
        <!-- The dial: avatar inside the reach it trades in. Rings light from
             the inside out as the range widens, live off the control below. -->
        <div class="acct-dial" aria-hidden="true">
          <span
            v-for="(ring, i) in REACH_RINGS"
            :key="ring"
            class="acct-dial__ring"
            :class="[`acct-dial__ring--${ring}`, { 'is-lit': i < reachDepth, 'is-edge': i === reachDepth - 1 }]"
          />
          <div class="acct-avatar">
            <div v-if="loading" class="acct-avatar__sk animate-pulse motion-reduce:animate-none" />
            <span v-else>{{ initials }}</span>
          </div>
        </div>

        <div class="acct-hero__text">
          <h1 class="acct-name">{{ name || login?.user?.email || t('nav.account') }}</h1>
          <p class="acct-loc">
            <v-icon icon="mdi-map-marker-outline" size="15" class="shrink-0" />
            <span>{{ [countryDisplay, city].filter(Boolean).join(", ") || t('account.locationNotSet') }}</span>
          </p>
          <!-- Names the dial. Without it the rings are a picture of nothing. -->
          <span class="acct-reach__chip">
            <v-icon :icon="activeScope.icon" size="14" />
            <span class="acct-reach__what">{{ t('account.tradingRange') }} · </span>{{ activeScope.label }}
          </span>
        </div>
      </div>
    </header>

    <!-- Activity: what you have here, and the way into each of it. Sits
         directly under the hero because on most visits this is the errand —
         the form below is edited once and then left alone. Each card branches
         on its own group's state, so a source that fails or lags affects only
         its own tile. -->
    <section class="acct-stats-wrap" aria-labelledby="acct-stats-h">
      <h2 id="acct-stats-h" class="acct-sub">{{ t('account.stats.title') }}</h2>

      <p v-if="deckStats.status === 'guest'" class="acct-stats-guest">{{ t('account.stats.guest') }}</p>

      <div v-else class="acct-stats">

        <!-- Decks -->
        <component
          :is="deckStats.status === 'ready' ? 'router-link' : 'div'"
          class="acct-stat"
          :to="deckStats.status === 'ready' ? { name: 'decks', params: { locale } } : undefined"
          :aria-label="deckStats.status === 'ready' ? t('account.stats.viewDecks') : undefined"
        >
          <div class="acct-stat__head">
            <span class="acct-stat__title">{{ t('account.stats.decks') }}</span>
            <v-icon icon="mdi-cards-outline" size="17" class="acct-stat__icon" />
          </div>
          <div v-if="deckStats.status === 'loading'" class="acct-stat__sk" />
          <p v-else-if="deckStats.status === 'error'" class="acct-stat__failed">{{ t('account.stats.failed') }}</p>
          <template v-else>
            <p class="acct-stat__num">{{ deckStats.data.count }}</p>
            <p class="acct-stat__sub">
              <span v-if="deckStats.data.count === 0" class="acct-stat__cta">{{ t('account.stats.decksEmpty') }}</span>
              <span v-else>{{ t('account.stats.decksUnit', deckStats.data.count) }}</span>
            </p>
          </template>
        </component>

        <!-- Trade pile -->
        <component
          :is="collectionStats.status === 'ready' ? 'router-link' : 'div'"
          class="acct-stat acct-stat--give"
          :to="collectionStats.status === 'ready' ? { name: 'library', params: { locale, pile: 'trade' } } : undefined"
          :aria-label="collectionStats.status === 'ready' ? t('account.stats.viewTradePile') : undefined"
        >
          <div class="acct-stat__head">
            <span class="acct-stat__title">{{ t('account.stats.tradePile') }}</span>
            <v-icon icon="mdi-swap-horizontal" size="17" class="acct-stat__icon" />
          </div>
          <div v-if="collectionStats.status === 'loading'" class="acct-stat__sk" />
          <p v-else-if="collectionStats.status === 'error'" class="acct-stat__failed">{{ t('account.stats.failed') }}</p>
          <template v-else>
            <p class="acct-stat__num">{{ collectionStats.data.tradeCount }}</p>
            <p class="acct-stat__sub">
              <span v-if="collectionStats.data.tradeCount === 0" class="acct-stat__cta">{{ t('account.stats.tradePileEmpty') }}</span>
              <span v-else>{{ t('account.stats.tradePileUnit', collectionStats.data.tradeCount) }}</span>
            </p>
          </template>
        </component>

        <!-- Wishlist -->
        <component
          :is="collectionStats.status === 'ready' ? 'router-link' : 'div'"
          class="acct-stat acct-stat--want"
          :to="collectionStats.status === 'ready' ? { name: 'library', params: { locale, pile: 'wishlist' } } : undefined"
          :aria-label="collectionStats.status === 'ready' ? t('account.stats.viewWishlist') : undefined"
        >
          <div class="acct-stat__head">
            <span class="acct-stat__title">{{ t('account.stats.wishlist') }}</span>
            <v-icon icon="mdi-heart-outline" size="17" class="acct-stat__icon" />
          </div>
          <div v-if="collectionStats.status === 'loading'" class="acct-stat__sk" />
          <p v-else-if="collectionStats.status === 'error'" class="acct-stat__failed">{{ t('account.stats.failed') }}</p>
          <template v-else>
            <p class="acct-stat__num">{{ collectionStats.data.wishCount }}</p>
            <p class="acct-stat__sub">
              <span v-if="collectionStats.data.wishCount === 0" class="acct-stat__cta">{{ t('account.stats.wishlistEmpty') }}</span>
              <span v-else>{{ t('account.stats.wishlistUnit', collectionStats.data.wishCount) }}</span>
            </p>
          </template>
        </component>

        <!-- Trades: two numbers, because "waiting on you" and "still open" are
             different questions and the second never replaces the first. -->
        <component
          :is="proposalStats.status === 'ready' ? 'router-link' : 'div'"
          class="acct-stat acct-stat--want"
          :to="proposalStats.status === 'ready' ? { name: 'TradeCenter', params: { locale, tab: 'proposals' } } : undefined"
          :aria-label="proposalStats.status === 'ready' ? t('account.stats.viewTrades') : undefined"
        >
          <div class="acct-stat__head">
            <span class="acct-stat__title">{{ t('account.stats.trades') }}</span>
            <v-icon icon="mdi-handshake-outline" size="17" class="acct-stat__icon" />
          </div>
          <div v-if="proposalStats.status === 'loading'" class="acct-stat__sk" />
          <p v-else-if="proposalStats.status === 'error'" class="acct-stat__failed">{{ t('account.stats.failed') }}</p>
          <template v-else>
            <div class="acct-stat__pair">
              <div>
                <p class="acct-stat__num" :class="{ 'acct-stat__num--live': proposalStats.data.awaiting > 0 }">
                  {{ proposalStats.data.awaiting }}
                </p>
                <p class="acct-stat__pairlabel">{{ t('account.stats.awaiting') }}</p>
              </div>
              <div>
                <p class="acct-stat__num">{{ proposalStats.data.open }}</p>
                <p class="acct-stat__pairlabel">{{ t('account.stats.open') }}</p>
              </div>
            </div>
            <p v-if="proposalStats.data.total === 0" class="acct-stat__sub">
              <span class="acct-stat__cta">{{ t('account.stats.tradesEmpty') }}</span>
            </p>
          </template>
        </component>
      </div>
    </section>

    <!-- Body: details form (primary) + communities (secondary) -->
    <div class="acct-body">

      <!-- Details: the one true surface panel, because it is the editable form -->
      <section class="acct-details" aria-labelledby="acct-details-h">
        <h2 id="acct-details-h" class="acct-h2">{{ t('account.profile') }}</h2>

        <div class="flex flex-col gap-4">
          <v-text-field
            v-model="name"
            :label="t('account.displayName')"
            variant="outlined"
            density="comfortable"
            hide-details
            prepend-inner-icon="mdi-account-outline"
            :disabled="loading || saving"
          />

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <v-autocomplete
              v-model="countryCode"
              :items="countryItems"
              :label="t('account.country')"
              variant="outlined"
              density="comfortable"
              hide-details
              clearable
              prepend-inner-icon="mdi-earth"
              :disabled="loading || saving"
            />
            <v-text-field
              v-model="city"
              :label="t('account.city')"
              variant="outlined"
              density="comfortable"
              hide-details
              prepend-inner-icon="mdi-map-marker-outline"
              :disabled="loading || saving"
            />
          </div>

          <div class="flex flex-col gap-2">
            <p class="acct-sub">{{ t('account.tradingRange') }}</p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2" role="group" :aria-label="t('account.tradingRange')">
              <button
                v-for="s in SCOPES"
                :key="s.value"
                type="button"
                :aria-pressed="tradeScope === s.value"
                class="scope-pill flex items-center justify-center gap-2 py-2 rounded-full border text-xs font-semibold transition-colors cursor-pointer"
                :style="tradeScope === s.value
                  ? { background: 'color-mix(in srgb, var(--c-trade) 14%, transparent)', borderColor: 'var(--c-trade)', color: 'var(--c-trade)' }
                  : { background: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
                :disabled="loading || saving"
                @click="tradeScope = s.value"
              >
                <v-icon :icon="tradeScope === s.value ? 'mdi-check' : s.icon" size="14" />
                {{ s.label }}
              </button>
            </div>
          </div>

          <v-alert v-if="errorMsg" type="error" variant="tonal" density="compact">{{ errorMsg }}</v-alert>

          <!-- Accent, like every other primary action in the app, but no longer
               a full-width slab: on a quieter panel it was the loudest thing on
               the page. Block on phones, where it is also the thumb target. -->
          <div class="acct-save">
            <v-btn
              variant="flat"
              size="large"
              style="background: var(--c-accent); color: var(--c-on-accent)"
              :prepend-icon="saved ? 'mdi-check' : 'mdi-content-save-outline'"
              :loading="saving"
              :disabled="loading"
              @click="saveProfile"
            >{{ saved ? t('account.saved') : t('account.save') }}</v-btn>
          </div>
        </div>
      </section>

      <!-- Secondary: rule-divided lists, no card boxes -->
      <div class="acct-secondary">

        <!-- My communities -->
        <section aria-labelledby="acct-comm-h">
          <div class="acct-section-head">
            <h2 id="acct-comm-h" class="acct-h2">
              <v-icon icon="mdi-storefront-outline" size="15" />{{ t('community.myCommunities') }}
            </h2>
          </div>

          <div v-if="loadingCommunities" class="acct-rows">
            <div v-for="i in 2" :key="i" class="acct-row acct-row--sk">
              <div class="h-4 rounded w-32 animate-pulse motion-reduce:animate-none" style="background: var(--c-skeleton)" />
              <div class="h-5 rounded w-16 ml-auto animate-pulse motion-reduce:animate-none" style="background: var(--c-skeleton)" />
            </div>
          </div>

          <p v-else-if="communities.length === 0" class="acct-empty">
            <router-link :to="{ name: 'community', params: { locale } }" style="color: var(--c-accent); font-weight: 600">
              {{ t('community.addYours') }}
            </router-link>
          </p>

          <div v-else class="acct-rows">
            <div v-for="row in communities" :key="row.id" class="acct-item">
              <div class="acct-row">
                <div class="flex flex-col min-w-0" style="gap: 2px">
                  <div class="flex items-center min-w-0" style="gap: 6px">
                    <span class="font-semibold truncate" style="color: var(--c-text)">{{ row.name }}</span>
                    <v-icon v-if="row.verified" icon="mdi-check-decagram" size="14" style="color: var(--c-mutual)" :title="t('community.verified')" />
                  </div>
                  <span class="text-xs truncate" style="color: var(--c-muted)">{{ KIND_LABELS[row.kind] ?? row.kind }}</span>
                </div>

                <span
                  class="ml-auto shrink-0 text-xs font-semibold px-2 py-1 rounded-md"
                  :style="{ textTransform: 'capitalize', ...statusStyle(row.status) }"
                >{{ row.status }}</span>

                <router-link :to="{ name: 'communityProfile', params: { locale, slug: row.slug } }" class="acct-linkbtn" style="color: var(--c-trade)">
                  {{ t('community.manage') }}
                </router-link>

                <router-link
                  :to="{ name: 'communityProfile', params: { locale, slug: row.slug }, query: { edit: '1' } }"
                  class="acct-iconbtn"
                  :aria-label="t('community.editTitle')"
                  :title="t('community.editTitle')"
                >
                  <v-icon icon="mdi-pencil-outline" size="15" />
                </router-link>
              </div>

              <!-- Replaces the lone "Manage subscription" link that used to sit
                   in the row above. That button was the entire billing surface:
                   it said nothing and led off-site. The Discord branch it also
                   carried now lives in billingState(), which is the only thing
                   that knows a Guild Subscription has no Stripe side. -->
              <CommunityBillingLine
                :community="row"
                :claim="claimSources[row.id] ?? null"
                :country-code="myCountryCode"
                :unavailable="billingUnavailable"
                @changed="loadCommunities"
              />
            </div>
          </div>
        </section>

        <!-- Communities I follow -->
        <section aria-labelledby="acct-follow-h">
          <div class="acct-section-head">
            <h2 id="acct-follow-h" class="acct-h2">
              <v-icon icon="mdi-account-heart-outline" size="15" />{{ t('community.followingTitle') }}
            </h2>
          </div>

          <div v-if="loadingFollowing" class="acct-rows">
            <div v-for="i in 2" :key="i" class="acct-row acct-row--sk">
              <div class="h-4 rounded w-32 animate-pulse motion-reduce:animate-none" style="background: var(--c-skeleton)" />
              <div class="h-5 rounded w-16 ml-auto animate-pulse motion-reduce:animate-none" style="background: var(--c-skeleton)" />
            </div>
          </div>

          <p v-else-if="following.length === 0" class="acct-empty">
            <router-link :to="{ name: 'community', params: { locale } }" style="color: var(--c-accent); font-weight: 600">
              {{ t('community.followingEmpty') }}
            </router-link>
          </p>

          <div v-else class="acct-rows">
            <div v-for="row in following" :key="row.id" class="acct-row">
              <div class="flex flex-col min-w-0" style="gap: 2px">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="font-semibold truncate" style="color: var(--c-text)">{{ row.name }}</span>
                  <v-icon v-if="row.verified" icon="mdi-check-decagram" size="14" style="color: var(--c-mutual)" :title="t('community.verified')" />
                </div>
                <span class="text-xs truncate flex items-center gap-1" style="color: var(--c-muted)">
                  <CommunityKindIcon :kind="row.kind" :size="12" />
                  {{ KIND_LABELS[row.kind] ?? row.kind }}
                  <template v-if="row.city">· {{ row.city }}</template>
                </span>
              </div>

              <router-link
                :to="{ name: 'communityProfile', params: { locale, slug: row.slug } }"
                class="acct-linkbtn ml-auto"
                style="color: var(--c-trade)"
              >
                {{ t('community.view') }}
              </router-link>

              <button type="button" class="acct-linkbtn" @click="onUnfollow(row)">
                {{ t('community.unfollow') }}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- Footer strip: connections + account, low emphasis -->
    <footer class="acct-footer">

      <!-- Discord -->
      <div class="acct-foot-cell">
        <div class="flex items-center gap-2.5 min-w-0">
          <svg width="20" height="20" viewBox="0 0 127.14 96.36" style="fill: var(--discord); flex-shrink: 0" aria-hidden="true">
            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
          </svg>
          <div class="flex flex-col min-w-0">
            <span class="text-sm font-semibold" style="color: var(--c-text)">{{ discordId ? 'Discord connected' : 'Discord' }}</span>
            <span v-if="discordId && discordUsername" class="text-xs font-medium truncate" style="color: var(--discord)">@{{ discordUsername }}</span>
            <span v-else-if="!discordId" class="text-xs" style="color: var(--c-muted)">Post announces from the server</span>
            <v-alert v-if="discordError" type="error" variant="tonal" density="compact" class="mt-1 text-xs">{{ discordError }}</v-alert>
          </div>
        </div>

        <div class="shrink-0">
          <button v-if="discordId" id="discord-resync-btn" :disabled="discordSyncing" class="acct-ghostbtn" @click="resyncDiscord">
            <v-icon :icon="discordSynced ? 'mdi-check-circle' : 'mdi-refresh'" size="14" :class="discordSyncing ? 'animate-spin motion-reduce:animate-none' : ''" />
            {{ discordSynced ? 'Synced' : discordSyncing ? 'Syncing' : 'Re-sync' }}
          </button>
          <button v-else id="discord-link-btn" :disabled="discordLinking || loading" class="acct-discordbtn" @click="connectDiscord">
            <svg width="14" height="14" viewBox="0 0 127.14 96.36" fill="white" aria-hidden="true">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
            </svg>
            {{ discordLinking ? 'Redirecting' : 'Connect' }}
          </button>
        </div>
      </div>

      <!-- Phone verification. Sits beside Discord because both answer the same
           question: what this account is connected to. Signing out lives in the
           rail's user menu, which is on every page rather than only this one. -->
      <div class="acct-foot-cell">
        <div class="flex items-center gap-2.5 min-w-0">
          <v-icon
            :icon="phoneVerified ? 'mdi-check-decagram' : 'mdi-cellphone-check'"
            size="20"
            :style="{ color: phoneVerified ? 'var(--c-mutual)' : 'var(--c-muted)', flexShrink: 0 }"
          />
          <div class="flex flex-col min-w-0">
            <span class="text-sm font-semibold" style="color: var(--c-text)">{{ t('phoneVerify.account.label') }}</span>
            <span v-if="phoneChecking" class="text-xs" style="color: var(--c-muted)">{{ t('phoneVerify.account.checking') }}</span>
            <span v-else-if="phoneVerified" class="text-xs font-medium" style="color: var(--c-mutual)">{{ t('phoneVerify.account.verified') }}</span>
            <span v-else class="text-xs" style="color: var(--c-muted)">{{ t('phoneVerify.account.notVerified') }}</span>
          </div>
        </div>

        <div class="shrink-0">
          <button
            v-if="!phoneChecking && !phoneVerified && login?.user?.id"
            type="button"
            class="acct-ghostbtn"
            style="--ghost-accent: var(--c-trade)"
            @click="phoneDialogOpen = true"
          >{{ t('phoneVerify.account.cta') }}</button>
        </div>
      </div>
    </footer>

  </div>

  <VerifyPhoneDialog v-model="phoneDialogOpen" reason="account" @verified="refreshPhoneStatus" />
</template>

<style scoped>
.acct {
  --discord: #5865F2;

  /* Borrowed from the landing page (LandingPage.vue's --lp-* set), which is
     where a signed-out reader meets this product. The register carries across
     the sign-up boundary: panels sit one tonal step *under* the page rather
     than above it, hairlines are a fraction of the border token, and depth is
     a 1px top highlight instead of a drop shadow — lit from above, per the
     Flat-By-Default Rule.
     It stops at the controls. Inputs and the save button stay app-native, so
     saving here looks like saving anywhere else in the app. */
  --ac-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --ac-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --ac-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);
  --ac-lit: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent);
  --ac-r: 24px;
  --ac-r-card: 18px;

  max-width: 42rem;                 /* comfortable single column on mobile / tablet */
  margin: 0 auto;
  padding: 20px 0 56px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}
@media (min-width: 768px)  { .acct { padding-top: 32px; } }
@media (min-width: 1024px) { .acct { max-width: 72rem; } } /* use the width on desktop */

/* ── Identity header ─────────────────────────────── */
.acct-hero {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 20px 28px;
  padding: clamp(8px, 2vw, 22px) 0 26px;
  isolation: isolate;
}
.acct-hero::after {
  content: "";
  position: absolute; left: 0; right: 0; bottom: 0; height: 1px;
  background: linear-gradient(90deg, var(--ac-line), transparent 78%);
}
/* Ambient light, one hue at low strength — the landing's hero glow at the
   scale a tool page can carry without turning into a poster. */
.acct-hero__glow {
  position: absolute;
  inset: -120px -80px auto -80px;
  height: 340px;
  z-index: -1;
  pointer-events: none;
  background: radial-gradient(46% 60% at 14% 40%, color-mix(in srgb, var(--c-trade) 20%, transparent), transparent 72%);
  filter: blur(16px);
}
.acct-hero__id { display: flex; align-items: center; gap: 22px; min-width: 0; }

/* ── The dial: reach, drawn ──────────────────────────────────────────────
   Local sits inside national sits inside worldwide, so the rings light from
   the inside out and the lit radius *is* the setting. Driven by reachDepth,
   which reads the same value the control below writes. */
.acct-dial {
  position: relative;
  width: 118px; height: 118px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
}
@media (max-width: 520px) {
  .acct-dial { width: 96px; height: 96px; }
  .acct-avatar { width: 52px; height: 52px; font-size: 19px; }
}
.acct-dial__ring {
  position: absolute;
  border-radius: 999px;
  border: 1px solid var(--c-border);
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}
.acct-dial__ring--local     { width: 68%; height: 68%; }
.acct-dial__ring--national  { width: 84%; height: 84%; }
.acct-dial__ring--worldwide { width: 100%; height: 100%; }
.acct-dial__ring.is-lit {
  border-color: color-mix(in srgb, var(--c-trade) 62%, transparent);
}
/* Only the outer edge of the reach glows, so where it stops is legible rather
   than three rings shouting equally. */
.acct-dial__ring.is-edge {
  border-color: var(--c-trade);
  box-shadow: 0 0 18px -5px var(--c-trade);
}

.acct-avatar {
  position: relative;
  width: 62px; height: 62px; border-radius: 999px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 23px; font-weight: 700; letter-spacing: -0.02em; user-select: none;
  background: color-mix(in srgb, var(--c-trade) 18%, var(--c-surface));
  color: var(--c-trade);
  border: 1px solid color-mix(in srgb, var(--c-trade) 34%, transparent);
}
.acct-avatar__sk { width: 100%; height: 100%; border-radius: 999px; background: var(--c-skeleton); }

.acct-hero__text { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.acct-name {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: clamp(1.75rem, 4vw, 2.6rem);
  line-height: 1.04; font-weight: 700; letter-spacing: -0.035em;
  color: var(--c-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
}
.acct-loc {
  display: flex; align-items: center; gap: 6px; margin: 0;
  font-size: 0.875rem; font-weight: 600; color: var(--c-muted); min-width: 0;
}
.acct-loc span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.acct-reach__chip {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 5px 12px; border-radius: 999px;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.66rem; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase;
  white-space: nowrap;
  background: color-mix(in srgb, var(--c-trade) 12%, transparent);
  color: var(--c-trade);
  border: 1px solid color-mix(in srgb, var(--c-trade) 28%, transparent);
}
@media (max-width: 520px) { .acct-reach__what { display: none; } }

/* ── Body ────────────────────────────────────────── */
/* Activity strip: four tiles, the one place on this page that uses card boxes
   above the fold. They are boxed on purpose — the rest of the page is
   rule-divided, so boxing is what makes these read as figures rather than list
   rows. */
.acct-stats-wrap { display: flex; flex-direction: column; gap: 14px; }
.acct-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
@media (max-width: 900px) { .acct-stats { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .acct-stats { gap: 10px; } .acct-stat { padding: 14px 15px; min-height: 108px; } }

.acct-stat {
  /* Per-tile role colour. Decks is the one tile that is neither an offer nor a
     want, so it stays uncoloured rather than borrowing a role that means
     something else (DESIGN.md, The Three-Role Rule). */
  --tile: var(--c-muted);
  display: flex; flex-direction: column; gap: 6px;
  min-height: 122px; padding: 18px 20px;
  background: var(--ac-panel);
  border: 1px solid var(--ac-line-soft);
  border-radius: var(--ac-r-card);
  box-shadow: var(--ac-lit);
  text-decoration: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.acct-stat--give { --tile: var(--c-trade); }
.acct-stat--want { --tile: var(--c-accent); }

/* Only the ready tiles are links, so only they get the affordance. */
a.acct-stat:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--tile) 50%, transparent);
  box-shadow: var(--ac-lit), 0 14px 34px color-mix(in srgb, var(--tile) 20%, transparent);
}
a.acct-stat:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { a.acct-stat:hover { transform: none; } }

.acct-stat__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.acct-stat__title { font-size: 0.875rem; font-weight: 600; color: var(--c-text); }
.acct-stat__icon { color: var(--tile); flex-shrink: 0; }
.acct-stat__num {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 2.15rem; font-weight: 700; line-height: 1.05; letter-spacing: -0.04em;
  color: var(--c-text);
}
/* Something is actually waiting on the user — the one number worth colouring. */
.acct-stat__num--live { color: var(--c-accent); }
.acct-stat__sub { margin: 0; font-size: 0.75rem; color: var(--c-muted); }
.acct-stat__cta { color: var(--c-accent); font-weight: 600; }
.acct-stat__failed { margin: 0; padding-top: 6px; font-size: 0.8125rem; color: var(--c-muted); }
.acct-stat__pair { display: flex; gap: 26px; }
@media (max-width: 560px) { .acct-stat__pair { gap: 14px; } }
.acct-stat__pairlabel { margin: 0; font-size: 0.6875rem; color: var(--c-muted); }
.acct-stat__sk {
  height: 30px; width: 60%; margin-top: 4px; border-radius: 8px;
  background: var(--c-skeleton);
  animation: acct-pulse 1.6s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) { .acct-stat__sk { animation: none; } }
@keyframes acct-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
.acct-stats-guest {
  margin: 0; padding: 20px;
  font-size: 0.875rem; color: var(--c-muted);
  background: var(--ac-panel);
  border: 1px solid var(--ac-line-soft);
  border-radius: var(--ac-r-card);
  box-shadow: var(--ac-lit);
}

.acct-body { display: grid; grid-template-columns: 1fr; gap: 32px; }
@media (min-width: 1024px) {
  .acct-body { grid-template-columns: 7fr 5fr; gap: 40px; align-items: start; }
}

/* Section labels in the collector's own register: monospace, uppercase, widely
   tracked — the landing's eyebrow, and the way set codes are already read in
   this app (DESIGN.md, The Mono Identifier Rule). */
.acct-h2,
.acct-sub {
  display: flex; align-items: center; gap: 8px; margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--c-muted);
}

/* Details: the single surface panel */

.acct-details {
  display: flex; flex-direction: column; gap: 18px;
  padding: clamp(20px, 3vw, 28px);
  background: var(--ac-panel);
  border: 1px solid var(--ac-line);
  border-radius: var(--ac-r);
  box-shadow: var(--ac-lit);
}
@media (min-width: 1024px) { .acct-details { position: sticky; top: 24px; } }

.acct-secondary { display: flex; flex-direction: column; gap: 30px; min-width: 0; }
.acct-section-head {
  padding-bottom: 10px; margin-bottom: 2px;
  border-bottom: 1px solid var(--ac-line-soft);
}

/* Rule-divided rows (no card boxes) */
.acct-rows { display: flex; flex-direction: column; }
.acct-row {
  display: flex; align-items: center; gap: 12px;
  min-height: 52px; padding: 8px 10px;
  border-radius: 10px;
  transition: background-color 0.15s ease;
}
.acct-row + .acct-row { border-top: 1px solid var(--ac-line-soft); border-radius: 0; }
/* An owned community is a row plus its billing line, so the separator moved out
   to the pair. Without this the border would land between a community and its
   own billing, rather than between one community and the next. */
.acct-item + .acct-item { border-top: 1px solid var(--ac-line-soft); }
.acct-row:hover:not(.acct-row--sk) { background: color-mix(in srgb, var(--c-surface-2) 55%, transparent); }
.acct-empty { padding: 22px 10px; font-size: 0.875rem; color: var(--c-muted); }

/* Row affordances (comfortable touch targets) */
.acct-linkbtn {
  flex-shrink: 0; min-height: 36px; padding: 8px 10px; border-radius: 8px;
  font-size: 0.75rem; font-weight: 700; color: var(--c-muted);
  cursor: pointer; transition: background-color 0.15s ease, color 0.15s ease;
}
.acct-linkbtn:hover { background: var(--c-surface-2); color: var(--c-text); }
.acct-linkbtn:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }
.acct-linkbtn:disabled { opacity: 0.5; pointer-events: none; }

.acct-iconbtn {
  flex-shrink: 0; width: 36px; height: 36px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--c-border); color: var(--c-muted);
  cursor: pointer; transition: border-color 0.15s ease, color 0.15s ease;
}
.acct-iconbtn:hover { border-color: var(--c-trade); color: var(--c-trade); }
.acct-iconbtn:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }

.acct-save { display: flex; justify-content: stretch; }
.acct-save :deep(.v-btn) { flex: 1; }
@media (min-width: 480px) {
  .acct-save { justify-content: flex-end; }
  .acct-save :deep(.v-btn) { flex: 0 0 auto; }
}

/* Trade-scope segmented control */
.scope-pill { min-height: 44px; }
.scope-pill:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
.scope-pill:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Footer strip ────────────────────────────────── */
.acct-footer {
  display: grid; grid-template-columns: 1fr; gap: 1px;
  background: var(--ac-line-soft);
  border: 1px solid var(--ac-line-soft);
  border-radius: var(--ac-r-card);
  box-shadow: var(--ac-lit);
  overflow: hidden;
}
@media (min-width: 640px) { .acct-footer { grid-template-columns: 1fr 1fr; } }
.acct-foot-cell {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  min-width: 0; padding: 18px 20px;
  background: var(--ac-panel);
}

.acct-ghostbtn {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 40px; padding: 8px 14px; border-radius: 10px;
  border: 1px solid var(--c-border); background: transparent; color: var(--c-muted);
  font-size: 0.75rem; font-weight: 700; cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.acct-ghostbtn:hover:not(:disabled) { border-color: var(--ghost-accent, var(--discord)); color: var(--ghost-accent, var(--discord)); }
.acct-ghostbtn:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }
.acct-ghostbtn:disabled { opacity: 0.6; cursor: not-allowed; }

.acct-discordbtn {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 40px; padding: 9px 16px; border-radius: 10px;
  background: var(--discord); color: #fff; border: none;
  font-size: 0.8125rem; font-weight: 700; cursor: pointer;
  transition: opacity 0.15s ease;
}
.acct-discordbtn:hover:not(:disabled) { opacity: 0.9; }
.acct-discordbtn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.acct-discordbtn:disabled { opacity: 0.6; cursor: not-allowed; }

@media (max-width: 520px) { .acct-name { font-size: 1.5rem; } }
</style>
