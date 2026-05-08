<script setup>
import { ref, computed, watch } from 'vue';
import { getClient } from '@/lib/supabaseClient';
import { cardImage } from '@/lib/cardImage';
import { countryByCode } from '@/lib/countries';
import { fetchUserTradePile, fetchUserWishlist } from '@/lib/matches';
import { timeAgo } from '@/lib/notifications';

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
  local:     { label: 'Local only',     icon: 'mdi-map-marker',   color: 'var(--c-trade)' },
  national:  { label: 'National only',  icon: 'mdi-flag-outline',  color: 'var(--c-trade)' },
  worldwide: { label: 'Worldwide',      icon: 'mdi-earth',         color: 'var(--c-muted)' },
}[profile.value?.trade_scope ?? 'worldwide']));

// ── Load ─────────────────────────────────────────────────────────────────
async function load(id) {
  if (!id) return;
  loading.value = true;
  profile.value = null;
  tradePile.value = [];
  wishlist.value  = [];
  reviews.value   = [];
  activeTab.value = 'pile';

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

  if (profileRes.error) console.error('get_trader_public_profile failed', profileRes.error);
  profile.value   = profileRes.data?.[0] ?? null;
  tradePile.value = pile;
  wishlist.value  = wish;
  reviews.value   = reviewsRes.data ?? [];
  loading.value   = false;
}

watch(() => [props.modelValue, props.traderId], ([open, id]) => {
  if (open && id) load(id);
}, { immediate: true });

function close() { open.value = false; }

function propose() {
  emit('propose', props.traderId);
  close();
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="520"
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
        <div class="flex flex-col gap-5 px-6 py-5">
          <!-- Identity skeleton -->
          <div class="flex items-center gap-4">
            <div class="size-14 rounded-2xl animate-pulse shrink-0" style="background: var(--c-skeleton)" />
            <div class="flex flex-col gap-2 grow">
              <div class="h-4 rounded w-2/5 animate-pulse" style="background: var(--c-skeleton)" />
              <div class="h-3 rounded w-1/3 animate-pulse" style="background: var(--c-skeleton)" />
            </div>
          </div>
          <!-- Stats skeleton -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div v-for="i in 4" :key="i" class="h-16 rounded-xl animate-pulse" style="background: var(--c-skeleton)" />
          </div>
          <!-- Cards skeleton -->
          <div class="flex gap-2 flex-wrap">
            <div v-for="i in 8" :key="i" class="animate-pulse rounded" style="width:43px;height:60px;background:var(--c-skeleton)" />
          </div>
        </div>
      </template>

      <!-- ── Content ── -->
      <template v-else-if="profile">
        <v-card-text class="pa-0 overflow-y-auto" style="max-height: 80vh">
          <div class="flex flex-col gap-5 px-6 py-5">

            <!-- Identity -->
            <div class="flex items-center gap-4">
              <div
                class="size-14 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0 select-none overflow-hidden"
                style="background: color-mix(in srgb, var(--c-trade) 18%, transparent); color: var(--c-trade); border: 1px solid color-mix(in srgb, var(--c-trade) 30%, transparent)"
              >
                <img
                  v-if="profile.avatar_url"
                  :src="profile.avatar_url"
                  alt="Avatar"
                  class="w-full h-full object-cover"
                />
                <span v-else>{{ initials }}</span>
              </div>

              <div class="flex flex-col min-w-0 grow">
                <span class="font-bold text-lg leading-tight truncate" style="color: var(--c-text)">
                  {{ profile.name ?? 'Anonymous' }}
                </span>
                <span class="text-sm mt-0.5 flex items-center gap-2 flex-wrap" style="color: var(--c-muted)">
                  <template v-if="country">
                    <span>{{ country.flag }}</span>
                    <span>{{ [profile.city, country.name].filter(Boolean).join(', ') }}</span>
                  </template>
                  <span v-else-if="profile.city">{{ profile.city }}</span>
                  <span v-else style="opacity: 0.6">No location set</span>
                </span>
              </div>

              <!-- Trade scope badge -->
              <span
                class="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border shrink-0"
                :style="{ color: scopeMeta.color, borderColor: `color-mix(in srgb, ${scopeMeta.color} 35%, transparent)`, backgroundColor: `color-mix(in srgb, ${scopeMeta.color} 8%, transparent)` }"
              >
                <v-icon :icon="scopeMeta.icon" size="11" />
                {{ scopeMeta.label }}
              </span>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div
                v-for="stat in [
                  { label: 'For trade',  icon: 'mdi-cards-outline',    color: 'var(--c-trade)',  value: profile.trade_pile_count, sub: null },
                  { label: 'Wishlist',   icon: 'mdi-heart-outline',     color: 'var(--c-accent)', value: profile.wishlist_count, sub: null },
                  { label: 'Completed',  icon: 'mdi-handshake-outline', color: 'var(--c-mutual)', value: profile.completed_trades, sub: null },
                  { label: 'Rating',     icon: 'mdi-star',              color: 'var(--c-mutual)', value: profile.avg_rating ? `${profile.avg_rating}★` : '—', sub: profile.rating_count > 0 ? `${profile.rating_count} review${profile.rating_count > 1 ? 's' : ''}` : null },
                ]"
                :key="stat.label"
                class="flex flex-col gap-1 rounded-xl border px-3 py-3"
                style="background: var(--c-surface-2); border-color: var(--c-border)"
              >
                <div class="flex items-center gap-1">
                  <v-icon :icon="stat.icon" size="12" :color="stat.color" />
                  <span class="text-[10px] font-semibold uppercase tracking-wide" :style="{ color: stat.color }">{{ stat.label }}</span>
                </div>
                <span class="text-xl font-bold tabular-nums leading-tight" style="color: var(--c-text)">{{ stat.value }}</span>
                <span v-if="stat.sub" class="text-[10px]" style="color: var(--c-muted)">{{ stat.sub }}</span>
              </div>
            </div>

            <!-- Tab row -->
            <div class="flex gap-0" style="border-bottom: 1px solid var(--c-border)">
              <button
                v-for="tab in [
                  { key: 'pile',    label: 'Trade pile', count: tradePile.length },
                  { key: 'wish',    label: 'Wishlist',   count: wishlist.length  },
                  { key: 'reviews', label: 'Reviews',    count: Number(profile.rating_count ?? 0) },
                ]"
                :key="tab.key"
                class="flex items-center gap-2 px-4 py-3 text-sm font-semibold cursor-pointer transition-colors"
                :style="{
                  color: activeTab === tab.key ? 'var(--c-text)' : 'var(--c-muted)',
                  borderBottom: activeTab === tab.key ? '2px solid var(--c-accent)' : '2px solid transparent',
                  marginBottom: '-1px',
                }"
                @click="activeTab = tab.key"
              >
                {{ tab.label }}
                <span
                  class="text-[10px] font-bold px-2 py-1 rounded-md tabular-nums"
                  :style="activeTab === tab.key
                    ? 'background: color-mix(in srgb, var(--c-accent) 15%, transparent); color: var(--c-accent)'
                    : 'background: color-mix(in srgb, var(--c-muted) 12%, transparent); color: var(--c-muted)'"
                >{{ tab.count }}</span>
              </button>
            </div>

            <!-- Card grid — trade pile -->
            <div v-if="activeTab === 'pile'">
              <div v-if="tradePile.length > 0" class="flex flex-wrap gap-2">
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
                      style="height:68px; width:49px; background:var(--c-surface-2)"
                      loading="lazy"
                    />
                  </template>
                </v-tooltip>
              </div>
              <p v-else class="text-sm py-4 text-center" style="color: var(--c-muted)">No cards listed for trade.</p>
            </div>

            <!-- Card grid — wishlist -->
            <div v-else-if="activeTab === 'wish'">
              <div v-if="wishlist.length > 0" class="flex flex-wrap gap-2">
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
                      style="height:68px; width:49px; background:var(--c-surface-2); opacity:0.85"
                      loading="lazy"
                    />
                  </template>
                </v-tooltip>
              </div>
              <p v-else class="text-sm py-4 text-center" style="color: var(--c-muted)">Wishlist is empty.</p>
            </div>

            <!-- Reviews tab -->
            <div v-else-if="activeTab === 'reviews'">
              <div v-if="reviews.length > 0" class="flex flex-col divide-y" style="border-color: var(--c-border)">
                <div
                  v-for="r in reviews" :key="r.rater_id + r.created_at"
                  class="flex flex-col gap-1 py-3"
                >
                  <div class="flex items-center gap-2">
                    <div class="flex gap-0.5">
                      <v-icon
                        v-for="s in 5" :key="s"
                        :icon="s <= r.score ? 'mdi-star' : 'mdi-star-outline'"
                        size="13"
                        style="color: var(--c-mutual)"
                      />
                    </div>
                    <span class="text-[11px] ml-auto" style="color: var(--c-muted)">{{ timeAgo(r.created_at) }}</span>
                  </div>
                  <p v-if="r.comment" class="text-xs leading-relaxed" style="color: var(--c-text)">{{ r.comment }}</p>
                </div>
              </div>
              <p v-else class="text-sm py-4 text-center" style="color: var(--c-muted)">No reviews yet.</p>
            </div>

          </div>
        </v-card-text>

        <!-- Footer -->
        <div
          v-if="!isSelf"
          class="flex justify-end gap-2 px-5 py-4 shrink-0"
          style="border-top: 1px solid var(--c-border)"
        >
          <v-btn variant="text" size="small" style="color: var(--c-muted)" @click="close">Close</v-btn>
          <v-btn
            variant="flat"
            size="small"
            prepend-icon="mdi-swap-horizontal"
            style="background: var(--c-trade); color: white"
            @click="propose"
          >Propose trade</v-btn>
        </div>
        <div v-else class="flex justify-end px-5 py-4 shrink-0" style="border-top: 1px solid var(--c-border)">
          <v-btn variant="text" size="small" style="color: var(--c-muted)" @click="close">Close</v-btn>
        </div>
      </template>

      <!-- ── Not found ── -->
      <template v-else>
        <div class="flex flex-col items-center gap-3 py-16 px-6">
          <v-icon icon="mdi-account-off-outline" size="36" color="var(--c-muted)" />
          <p class="text-sm" style="color: var(--c-muted)">Trader not found.</p>
          <v-btn variant="text" size="small" style="color: var(--c-muted)" @click="close">Close</v-btn>
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
