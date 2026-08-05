<script setup>
// The trader profile itself: identity, stats, and the pile/wishlist/reviews
// tabs. Deliberately chrome-free — no dialog frame, no page frame, no footer
// actions — so TraderProfileDialog and TraderPage can both render it and never
// drift apart.
//
// Owns its own loading, because both hosts want the same fetch on the same
// trigger. `active` lets the dialog defer the fetch until it is actually
// opened; the page passes nothing and loads immediately.
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getClient } from '@/lib/supabaseClient';
import { cardImage } from '@/lib/cardImage';
import { countryByCode } from '@/lib/countries';
import { fetchUserTradePile, fetchUserWishlist } from '@/lib/matches';
import { timeAgo } from '@/lib/notifications';

const props = defineProps({
  traderId: { type: String,  default: null },
  // False keeps the fetch from firing (a closed dialog). Always true on a page.
  active:   { type: Boolean, default: true },
});
const emit = defineEmits(['loaded']);

const { t } = useI18n();

const loading   = ref(false);
const profile   = ref(null);   // from get_trader_public_profile
const tradePile = ref([]);
const wishlist  = ref([]);
const reviews   = ref([]);
const activeTab = ref('pile'); // 'pile' | 'wish' | 'reviews'
let _loadToken = 0;

// Hosts need the name for their own chrome (page title, propose payload).
defineExpose({ profile, loading });

const country = computed(() => countryByCode(profile.value?.country_code));

const initials = computed(() => {
  const n = profile.value?.name?.trim();
  if (!n) return '?';
  return n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
});

const scopeMeta = computed(() => ({
  local:     { label: t('account.localOnly'),       icon: 'mdi-map-marker',   color: 'var(--c-trade)' },
  national:  { label: t('account.nationalOnly'),    icon: 'mdi-flag-outline', color: 'var(--c-trade)' },
  worldwide: { label: t('account.scopes.worldwide'), icon: 'mdi-earth',       color: 'var(--c-muted)' },
}[profile.value?.trade_scope ?? 'worldwide']));

async function load(id) {
  if (!id) return;
  const token = ++_loadToken;
  loading.value = true;
  profile.value = null;
  tradePile.value = [];
  wishlist.value  = [];
  reviews.value   = [];
  activeTab.value = 'pile';

  try {
    const [profileRes, pile, wish, reviewsRes] = await Promise.all([
      getClient().rpc('get_trader_public_profile', { p_trader_id: id }),
      fetchUserTradePile(id),
      fetchUserWishlist(id),
      getClient()
        .from('trader_rating')
        .select('score, comment, created_at, rater_id')
        .eq('ratee_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (token !== _loadToken) return; // stale — a newer load() was started
    if (profileRes.error) console.error('get_trader_public_profile failed', profileRes.error);
    profile.value   = profileRes.data?.[0] ?? null;
    tradePile.value = pile;
    wishlist.value  = wish;
    reviews.value   = reviewsRes.data ?? [];
    emit('loaded', profile.value);
  } finally {
    if (token === _loadToken) loading.value = false;
  }
}

watch(() => [props.active, props.traderId], ([on, id]) => {
  if (on && id) load(id);
}, { immediate: true });

const statItems = computed(() => [
  { label: t('traderProfile.forTrade'), icon: 'mdi-cards-outline',    color: 'var(--c-trade)',  value: profile.value?.trade_pile_count, sub: null },
  { label: t('library.wishlist'),       icon: 'mdi-heart-outline',    color: 'var(--c-accent)', value: profile.value?.wishlist_count,   sub: null },
  { label: t('proposal.completed'),     icon: 'mdi-handshake-outline', color: 'var(--c-mutual)', value: profile.value?.completed_trades, sub: null },
  {
    label: t('traderProfile.rating'), icon: 'mdi-star', color: 'var(--c-mutual)',
    value: profile.value?.avg_rating ? `${profile.value.avg_rating}★` : '—',
    // Three-arg form: vue-i18n needs the count positionally to pick the plural.
    sub: profile.value?.rating_count > 0
      ? t('traderProfile.reviewCount', { count: Number(profile.value.rating_count) }, Number(profile.value.rating_count))
      : null,
  },
]);

const tabItems = computed(() => [
  { key: 'pile',    label: t('library.tradePile'),     count: tradePile.value.length },
  { key: 'wish',    label: t('library.wishlist'),      count: wishlist.value.length  },
  { key: 'reviews', label: t('traderProfile.reviews'), count: Number(profile.value?.rating_count ?? 0) },
]);
</script>

<template>
  <!-- Skeleton -->
  <div v-if="loading" class="flex flex-col gap-6">
    <div class="flex items-center gap-5">
      <div class="tpb-skel-avatar animate-pulse shrink-0" style="background: var(--c-skeleton)" />
      <div class="flex flex-col gap-3 grow">
        <div class="h-5 rounded w-2/5 animate-pulse" style="background: var(--c-skeleton)" />
        <div class="h-4 rounded w-1/3 animate-pulse" style="background: var(--c-skeleton)" />
      </div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div v-for="i in 4" :key="i" class="h-20 rounded-xl animate-pulse" style="background: var(--c-skeleton)" />
    </div>
    <div class="flex gap-3 flex-wrap">
      <div v-for="i in 8" :key="i" class="animate-pulse rounded" style="width:68px;height:96px;background:var(--c-skeleton)" />
    </div>
  </div>

  <!-- Content -->
  <div v-else-if="profile" class="flex flex-col gap-6">

    <!-- Identity -->
    <div class="tpb-id">
      <div class="tpb-id__avatar">
        <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="" />
        <span v-else>{{ initials }}</span>
      </div>

      <div class="tpb-id__text">
        <span class="tpb-id__name">{{ profile.name ?? t('userCard.anonymous') }}</span>
        <span class="tpb-id__where">
          <template v-if="country">
            <span>{{ country.flag }}</span>
            <span>{{ [profile.city, country.name].filter(Boolean).join(', ') }}</span>
          </template>
          <span v-else-if="profile.city">{{ profile.city }}</span>
          <span v-else style="opacity: 0.6">{{ t('traderProfile.noLocationSet') }}</span>
        </span>
      </div>

      <span
        class="tpb-id__scope"
        :style="{ color: scopeMeta.color, borderColor: `color-mix(in srgb, ${scopeMeta.color} 35%, transparent)`, backgroundColor: `color-mix(in srgb, ${scopeMeta.color} 8%, transparent)` }"
      >
        <v-icon :icon="scopeMeta.icon" size="14" />
        {{ scopeMeta.label }}
      </span>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div
        v-for="stat in statItems"
        :key="stat.label"
        class="flex flex-col gap-2 rounded-xl border"
        style="background: var(--c-surface-2); border-color: var(--c-border); padding: 14px"
      >
        <div class="flex items-center gap-2">
          <v-icon :icon="stat.icon" size="15" :color="stat.color" />
          <span class="text-xs font-semibold uppercase tracking-wide" :style="{ color: stat.color }">{{ stat.label }}</span>
        </div>
        <span class="text-2xl font-bold tabular-nums leading-tight" style="color: var(--c-text)">{{ stat.value }}</span>
        <span v-if="stat.sub" class="text-xs" style="color: var(--c-muted)">{{ stat.sub }}</span>
      </div>
    </div>

    <!-- Tab row -->
    <div class="tpb-tabs">
      <button
        v-for="tab in tabItems"
        :key="tab.key"
        class="tpb-tab flex items-center gap-2 text-base font-semibold cursor-pointer transition-colors"
        :style="{
          color: activeTab === tab.key ? 'var(--c-text)' : 'var(--c-muted)',
          borderBottom: activeTab === tab.key ? '2px solid var(--c-accent)' : '2px solid transparent',
        }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span
          class="text-xs font-bold px-2 py-1 rounded-md tabular-nums"
          :style="activeTab === tab.key
            ? 'background: color-mix(in srgb, var(--c-accent) 15%, transparent); color: var(--c-accent)'
            : 'background: color-mix(in srgb, var(--c-muted) 12%, transparent); color: var(--c-muted)'"
        >{{ tab.count }}</span>
      </button>
    </div>

    <!-- Trade pile -->
    <div v-if="activeTab === 'pile'">
      <div v-if="tradePile.length > 0" class="flex flex-wrap gap-3">
        <v-tooltip
          v-for="card in tradePile"
          :key="card.id"
          :text="`${card.name}${card.extension ? ' · ' + card.extension : ''}${card.condition ? ' (' + card.condition + ')' : ''}`"
          location="top"
          open-on-click
        >
          <template #activator="{ props: tip }">
            <img
              v-bind="tip"
              :src="cardImage(card.image_id)"
              :alt="card.name"
              class="profile-card rounded object-contain shrink-0"
              style="height:96px; width:68px; background:var(--c-surface-2)"
              loading="lazy"
            />
          </template>
        </v-tooltip>
      </div>
      <p v-else class="text-sm py-6 text-center" style="color: var(--c-muted)">{{ t('traderProfile.noCardsForTrade') }}</p>
    </div>

    <!-- Wishlist -->
    <div v-else-if="activeTab === 'wish'">
      <div v-if="wishlist.length > 0" class="flex flex-wrap gap-3">
        <v-tooltip
          v-for="card in wishlist"
          :key="card.id"
          :text="`${card.name}${card.extension ? ' · ' + card.extension : ''}`"
          location="top"
          open-on-click
        >
          <template #activator="{ props: tip }">
            <img
              v-bind="tip"
              :src="cardImage(card.image_id)"
              :alt="card.name"
              class="profile-card rounded object-contain shrink-0"
              style="height:96px; width:68px; background:var(--c-surface-2); opacity:0.85"
              loading="lazy"
            />
          </template>
        </v-tooltip>
      </div>
      <p v-else class="text-sm py-6 text-center" style="color: var(--c-muted)">{{ t('traderProfile.wishlistEmpty') }}</p>
    </div>

    <!-- Reviews -->
    <div v-else-if="activeTab === 'reviews'">
      <div v-if="reviews.length > 0" class="flex flex-col divide-y" style="border-color: var(--c-border)">
        <div v-for="r in reviews" :key="r.rater_id + r.created_at" class="flex flex-col gap-2 py-4">
          <div class="flex items-center gap-2">
            <div class="flex gap-1">
              <v-icon
                v-for="s in 5" :key="s"
                :icon="s <= r.score ? 'mdi-star' : 'mdi-star-outline'"
                size="16"
                style="color: var(--c-mutual)"
              />
            </div>
            <span class="text-xs ml-auto" style="color: var(--c-muted)">{{ timeAgo(r.created_at) }}</span>
          </div>
          <p v-if="r.comment" class="text-sm leading-relaxed" style="color: var(--c-text)">{{ r.comment }}</p>
        </div>
      </div>
      <p v-else class="text-sm py-6 text-center" style="color: var(--c-muted)">{{ t('traderProfile.noReviewsYet') }}</p>
    </div>

  </div>

  <!-- Not found -->
  <div v-else class="flex flex-col items-center gap-3 py-16 px-6">
    <v-icon icon="mdi-account-off-outline" size="36" color="var(--c-muted)" />
    <p class="text-sm" style="color: var(--c-muted)">{{ t('traderProfile.traderNotFound') }}</p>
  </div>
</template>

<style scoped>
/* ── Identity ──────────────────────────────────────────────────────────────
   Was a single non-wrapping flex row sized for a 720px dialog. On a page at
   375px the avatar and the scope badge left the name about 50px, which
   truncated "TinyHex" to "Ti…". Now a wrapping row: the badge is the piece
   that drops to its own line, because it is the least important of the three
   and the only one that can leave without breaking the avatar/name pairing. */
.tpb-id {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.tpb-id__avatar {
  width: 80px; height: 80px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 16px; overflow: hidden;
  font-size: 1.875rem; font-weight: 700; user-select: none;
  background: color-mix(in srgb, var(--c-trade) 18%, transparent);
  color: var(--c-trade);
  border: 1px solid color-mix(in srgb, var(--c-trade) 30%, transparent);
}
.tpb-id__avatar img { width: 100%; height: 100%; object-fit: cover; }

/* Grows to fill, but may shrink below its content width — without min-width:0
   a long name would push the badge off the row instead of wrapping. */
.tpb-id__text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 200px; }

/* Wraps rather than truncates: a name is the one thing on this page that must
   be readable in full. Capped at two lines so a pathological handle cannot
   push the stats off-screen, and `anywhere` so an unbroken string still
   breaks instead of overflowing. */
.tpb-id__name {
  font-size: 1.5rem; font-weight: 700; line-height: 1.25;
  color: var(--c-text);
  overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.tpb-id__where {
  margin-top: 4px; font-size: 1rem; color: var(--c-muted);
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}

.tpb-id__scope {
  display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;
  padding: 8px 12px; border-radius: 8px; border: 1px solid;
  font-size: 0.75rem; font-weight: 600;
  margin-left: auto;
}

/* Content-driven, not a device guess: below this the three-across row can no
   longer give the name a readable column (80px avatar + ~105px badge + gaps
   eats ~225px of it). */
@media (max-width: 560px) {
  .tpb-id { gap: 14px; }
  .tpb-id__avatar { width: 60px; height: 60px; border-radius: 14px; font-size: 1.5rem; }
  .tpb-id__name { font-size: 1.375rem; }
  .tpb-id__where { font-size: 0.9375rem; }
  /* Basis forces the badge onto its own line; max-content keeps it hugging its
     label. Stretching it full width would make a passive status read as a
     button, and nothing here is clickable. */
  .tpb-id__scope { flex: 0 1 100%; max-width: max-content; margin-left: 0; }
}

/* ── Tabs ──────────────────────────────────────────────────────────────────
   Overflowed silently at 375px (382px of tabs in a 276px box, overflow
   visible), so "Reviews" was clipped and unreachable. Scrolls now, and the
   buttons refuse to compress into unreadability. */
.tpb-tabs {
  display: flex;
  gap: 0;
  /* The rule was a border-bottom plus a -1px margin on each tab to overhang it.
     Inside a scroll container that 1px overhang makes scrollHeight exceed
     clientHeight, which grows a stray vertical scrollbar. An inset shadow draws
     the same line without occupying layout, so nothing overhangs. */
  box-shadow: inset 0 -1px 0 var(--c-border);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--c-border) transparent;
  -webkit-overflow-scrolling: touch;
}
.tpb-tabs::-webkit-scrollbar { height: 3px; }
.tpb-tabs::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 99px; }

.tpb-tab { flex-shrink: 0; padding: 16px 20px; white-space: nowrap; }

/* Tighter tabs on narrow screens so all three usually fit without scrolling;
   the scroll above is the safety net for long translations, not the norm. */
@media (max-width: 560px) {
  .tpb-tab { padding: 14px 13px; font-size: 0.9375rem; }
}

/* Touch devices get the 44px target PRODUCT.md asks for; pointer devices keep
   the tighter rhythm. */
@media (pointer: coarse) {
  .tpb-tab { min-height: 48px; }
}

/* Tracks .tpb-id__avatar at both sizes so nothing jumps when the profile lands. */
.tpb-skel-avatar { width: 80px; height: 80px; border-radius: 16px; }
@media (max-width: 560px) { .tpb-skel-avatar { width: 60px; height: 60px; border-radius: 14px; } }

.profile-card {
  outline: 1px solid rgba(255,255,255,0.07);
  transition: transform 0.15s cubic-bezier(0.22,1,0.36,1), box-shadow 0.15s ease;
}
.profile-card:hover {
  transform: translateY(-2px) scale(1.06);
  box-shadow: 0 6px 20px rgba(0,0,0,0.4);
  outline-color: rgba(255,255,255,0.2);
}
</style>
