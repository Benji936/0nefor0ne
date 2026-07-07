<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getClient } from '@/lib/supabaseClient';
import { cardImage } from '@/lib/cardImage';
import { countryByCode } from '@/lib/countries';
import { fetchUserTradePile, fetchUserWishlist } from '@/lib/matches';
import { timeAgo } from '@/lib/notifications';

const { t } = useI18n();

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  traderId:   { type: String,  default: null  },
  // Optional: pass the current user's id so we can hide "Propose" on own profile
  currentUserId: { type: String, default: null },
});
const emit = defineEmits(['update:modelValue', 'propose']);

// ── State ────────────────────────────────────────────────────────────────
const loading     = ref(false);
const profile     = ref(null);   // from get_trader_public_profile
const tradePile   = ref([]);
const wishlist    = ref([]);
const reviews     = ref([]);
const activeTab   = ref('pile'); // 'pile' | 'wish' | 'reviews'
let _loadToken = 0;

// ── Derived ──────────────────────────────────────────────────────────────
const open = computed({
  get: () => props.modelValue,
  set: v  => emit('update:modelValue', v),
});

const isSelf = computed(() =>
  props.currentUserId && props.traderId && props.currentUserId === props.traderId,
);

const country = computed(() => countryByCode(profile.value?.country_code));

const initials = computed(() => {
  const n = profile.value?.name?.trim();
  if (!n) return '?';
  return n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
});

const scopeMeta = computed(() => ({
  local:     { label: t('account.localOnly'),    icon: 'mdi-map-marker',   color: 'var(--c-trade)' },
  national:  { label: t('account.nationalOnly'), icon: 'mdi-flag-outline',  color: 'var(--c-trade)' },
  worldwide: { label: t('account.scopes.worldwide'), icon: 'mdi-earth',    color: 'var(--c-muted)' },
}[profile.value?.trade_scope ?? 'worldwide']));

// ── Load ─────────────────────────────────────────────────────────────────
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
  } finally {
    if (token === _loadToken) loading.value = false;
  }
}

watch(() => [props.modelValue, props.traderId], ([open, id]) => {
  if (open && id) load(id);
}, { immediate: true });

const statItems = computed(() => [
  { label: t('traderProfile.forTrade'), icon: 'mdi-cards-outline',    color: 'var(--c-trade)',  value: profile.value?.trade_pile_count, sub: null },
  { label: t('library.wishlist'),       icon: 'mdi-heart-outline',     color: 'var(--c-accent)', value: profile.value?.wishlist_count,   sub: null },
  { label: t('proposal.completed'),     icon: 'mdi-handshake-outline', color: 'var(--c-mutual)', value: profile.value?.completed_trades, sub: null },
  {
    label: 'Rating', icon: 'mdi-star', color: 'var(--c-mutual)',
    value: profile.value?.avg_rating ? `${profile.value.avg_rating}★` : '—',
    sub: profile.value?.rating_count > 0 ? `${profile.value.rating_count} review${profile.value.rating_count > 1 ? 's' : ''}` : null,
  },
]);

const tabItems = computed(() => [
  { key: 'pile',    label: t('library.tradePile'), count: tradePile.value.length },
  { key: 'wish',    label: t('library.wishlist'),  count: wishlist.value.length  },
  { key: 'reviews', label: t('traderProfile.reviews'), count: Number(profile.value?.rating_count ?? 0) },
]);

function close() { open.value = false; }

function propose() {
  emit('propose', { id: props.traderId, name: profile.value?.name ?? null });
  close();
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="720"
    scrollable
    :scrim="true"
  >
    <v-card
      class="rounded-2xl overflow-hidden"
      style="background: var(--c-surface); color: var(--c-text)"
    >

      <!-- ── Header band ── -->
      <div
        class="h-2 w-full shrink-0"
        style="background: linear-gradient(90deg, var(--c-trade), var(--c-accent))"
      />

      <!-- ── Close button ── -->
      <v-btn
        icon="mdi-close"
        variant="text"
        size="small"
        density="compact"
        class="absolute top-3 right-3"
        style="color: var(--c-muted); z-index: 1"
        @click="close"
      />

      <!-- ── Skeleton ── -->
      <template v-if="loading">
        <div class="flex flex-col gap-6 px-8 py-6">
          <!-- Identity skeleton -->
          <div class="flex items-center gap-5">
            <div class="size-20 rounded-2xl animate-pulse shrink-0" style="background: var(--c-skeleton)" />
            <div class="flex flex-col gap-3 grow">
              <div class="h-5 rounded w-2/5 animate-pulse" style="background: var(--c-skeleton)" />
              <div class="h-4 rounded w-1/3 animate-pulse" style="background: var(--c-skeleton)" />
            </div>
          </div>
          <!-- Stats skeleton -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div v-for="i in 4" :key="i" class="h-20 rounded-xl animate-pulse" style="background: var(--c-skeleton)" />
          </div>
          <!-- Cards skeleton -->
          <div class="flex gap-3 flex-wrap">
            <div v-for="i in 8" :key="i" class="animate-pulse rounded" style="width:68px;height:96px;background:var(--c-skeleton)" />
          </div>
        </div>
      </template>

      <!-- ── Content ── -->
      <template v-else-if="profile">
        <v-card-text class="pa-0 overflow-y-auto" style="max-height: 82vh">
          <div class="flex flex-col gap-6 px-8 py-6">

            <!-- Identity -->
            <div class="flex items-center gap-5">
              <div
                class="size-20 rounded-2xl flex items-center justify-center text-3xl font-bold shrink-0 select-none overflow-hidden"
                style="background: color-mix(in srgb, var(--c-trade) 18%, transparent); color: var(--c-trade); border: 1px solid color-mix(in srgb, var(--c-trade) 30%, transparent)"
              >
                <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="Avatar" class="w-full h-full object-cover" />
                <span v-else>{{ initials }}</span>
              </div>

              <div class="flex flex-col min-w-0 grow">
                <span class="font-bold text-2xl leading-tight truncate" style="color: var(--c-text)">
                  {{ profile.name ?? t('userCard.anonymous') }}
                </span>
                <span class="text-base mt-1 flex items-center gap-2 flex-wrap" style="color: var(--c-muted)">
                  <template v-if="country">
                    <span>{{ country.flag }}</span>
                    <span>{{ [profile.city, country.name].filter(Boolean).join(', ') }}</span>
                  </template>
                  <span v-else-if="profile.city">{{ profile.city }}</span>
                  <span v-else style="opacity: 0.6">{{ t('traderProfile.noLocationSet') }}</span>
                </span>
              </div>

              <!-- Trade scope badge -->
              <span
                class="flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-lg border shrink-0"
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
            <div class="flex gap-0" style="border-bottom: 1px solid var(--c-border)">
              <button
                v-for="tab in tabItems"
                :key="tab.key"
                class="flex items-center gap-2 px-5 py-4 text-base font-semibold cursor-pointer transition-colors"
                :style="{
                  color: activeTab === tab.key ? 'var(--c-text)' : 'var(--c-muted)',
                  borderBottom: activeTab === tab.key ? '2px solid var(--c-accent)' : '2px solid transparent',
                  marginBottom: '-1px',
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

            <!-- Card grid — trade pile -->
            <div v-if="activeTab === 'pile'">
              <div v-if="tradePile.length > 0" class="flex flex-wrap gap-3">
                <v-tooltip
                  v-for="card in tradePile"
                  :key="card.id"
                  :text="`${card.name}${card.extension ? ' · ' + card.extension : ''}${card.condition ? ' (' + card.condition + ')' : ''}`"
                  location="top"
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

            <!-- Card grid — wishlist -->
            <div v-else-if="activeTab === 'wish'">
              <div v-if="wishlist.length > 0" class="flex flex-wrap gap-3">
                <v-tooltip
                  v-for="card in wishlist"
                  :key="card.id"
                  :text="`${card.name}${card.extension ? ' · ' + card.extension : ''}`"
                  location="top"
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

            <!-- Reviews tab -->
            <div v-else-if="activeTab === 'reviews'">
              <div v-if="reviews.length > 0" class="flex flex-col divide-y" style="border-color: var(--c-border)">
                <div
                  v-for="r in reviews" :key="r.rater_id + r.created_at"
                  class="flex flex-col gap-2 py-4"
                >
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
        </v-card-text>

        <!-- Footer -->
        <div class="flex justify-end gap-3 px-8 py-5 shrink-0" style="border-top: 1px solid var(--c-border)">
          <v-btn variant="text" style="color: var(--c-muted)" @click="close">{{ t('traderProfile.close') }}</v-btn>
          <v-btn
            v-if="!isSelf"
            variant="flat"
            prepend-icon="mdi-swap-horizontal"
            style="background: var(--c-trade); color: white"
            @click="propose"
          >{{ t('traderProfile.proposeTrade') }}</v-btn>
        </div>
      </template>

      <!-- ── Not found ── -->
      <template v-else>
        <div class="flex flex-col items-center gap-3 py-16 px-6">
          <v-icon icon="mdi-account-off-outline" size="36" color="var(--c-muted)" />
          <p class="text-sm" style="color: var(--c-muted)">{{ t('traderProfile.traderNotFound') }}</p>
          <v-btn variant="text" size="small" style="color: var(--c-muted)" @click="close">{{ t('traderProfile.close') }}</v-btn>
        </div>
      </template>

    </v-card>
  </v-dialog>
</template>

<style scoped>
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
