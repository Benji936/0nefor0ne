<script setup>
// A trader's live listings on their profile.
//
// The binder answers "what do they have". This answers "what are they after",
// which is the other half of a trade and the part the profile never showed,
// even though announces have always been public.
//
// Read-only by design: there is no per-announce route to deep-link to, so
// rather than half-wiring the detail dialog into a page that does not own any
// of its edit or propose flows, each row points at the Trade Center, where
// announces actually live.
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { fetchAnnouncesBySeller } from "@/lib/announces";
import { isLookingFor, composeWantHeadline } from "@/lib/announceKind";
import { timeAgo } from "@/lib/notifications";

const props = defineProps({
  traderId: { type: String, default: null },
});

const { t } = useI18n();
const route = useRoute();
const locale = computed(() => route.params.locale || "en");

const rows = ref([]);

let reqId = 0;
watch(() => props.traderId, async (id) => {
  const mine = ++reqId;
  if (!id) { rows.value = []; return; }
  const data = await fetchAnnouncesBySeller(id);
  if (mine !== reqId) return;
  rows.value = data;
}, { immediate: true });

function headline(a) {
  // An LF post's title is often just the raw Discord message; the archetype
  // plus qualifier is the version a human wrote on purpose.
  if (isLookingFor(a)) {
    return composeWantHeadline(a.archetype, a.want_detail) || a.title;
  }
  return a.title;
}

function price(a) {
  if (a.price === null || a.price === undefined || a.price === "") return null;
  return new Intl.NumberFormat(locale.value, {
    style: "currency",
    currency: a.currency || "EUR",
    maximumFractionDigits: 0,
  }).format(a.price);
}
</script>

<template>
  <section v-if="rows.length" class="ta">
    <h3 class="ta__title">{{ t('traderProfile.listingsTitle') }}</h3>

    <ul class="ta__list">
      <li v-for="a in rows" :key="a.id" class="ta__row">
        <span class="ta__kind" :class="isLookingFor(a) ? 'ta__kind--lf' : 'ta__kind--sell'">
          {{ isLookingFor(a) ? t('announce.lfBadge') : t('traderProfile.listingSelling') }}
        </span>

        <span class="ta__name">{{ headline(a) }}</span>

        <span v-if="isLookingFor(a) && a.wantCards.length" class="ta__meta">
          {{ t('announce.wantCount', { count: a.wantCards.length }, a.wantCards.length) }}
        </span>
        <span v-else-if="price(a)" class="ta__meta ta__meta--price">{{ price(a) }}</span>

        <span class="ta__when">{{ timeAgo(a.created_at, t, { short: true }) }}</span>
      </li>
    </ul>

    <router-link class="ta__all" :to="{ name: 'TradeCenter', params: { locale } }">
      {{ t('traderProfile.listingsOpen') }}
      <v-icon icon="mdi-arrow-right" size="14" aria-hidden="true" />
    </router-link>
  </section>
</template>

<style scoped>
.ta { margin-top: 30px; }

.ta__title {
  margin: 0 0 10px;
  font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--c-muted);
}

.ta__list { list-style: none; margin: 0; padding: 0; }

/* Bordered rows, not cards: this is a dense list inside a surface that is
   already a card, and stacking rounded tiles in here would nest them. */
.ta__row {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 2px;
  border-top: 1px solid var(--c-border);
  font-size: 13.5px;
}
.ta__row:last-child { border-bottom: 1px solid var(--c-border); }

.ta__kind {
  flex-shrink: 0; min-width: 42px; text-align: center;
  padding: 2px 7px; border-radius: 6px;
  font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em;
}
/* Pink is want, amethyst is offer, per the three-role rule. */
.ta__kind--lf   { background: color-mix(in srgb, var(--c-accent) 16%, transparent); color: var(--c-accent); }
.ta__kind--sell { background: color-mix(in srgb, var(--c-trade) 16%, transparent);  color: var(--c-trade); }

.ta__name {
  flex: 1; min-width: 0; color: var(--c-text); font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ta__meta { flex-shrink: 0; font-size: 12.5px; font-weight: 600; color: var(--c-muted); }
.ta__meta--price { color: var(--c-text); font-variant-numeric: tabular-nums; }
.ta__when {
  flex-shrink: 0; font-size: 12px; color: var(--c-muted);
  font-variant-numeric: tabular-nums; min-width: 34px; text-align: right;
}

.ta__all {
  display: inline-flex; align-items: center; gap: 5px; margin-top: 12px;
  font-size: 13px; font-weight: 700; color: var(--c-trade); text-decoration: none;
}
.ta__all:hover { text-decoration: underline; }
.ta__all:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; border-radius: 6px; }

@media (max-width: 560px) {
  .ta { margin-top: 24px; }
  /* The timestamp is the first thing worth losing when the row runs out of
     width; the title and what it costs are not. */
  .ta__when { display: none; }
}
</style>
