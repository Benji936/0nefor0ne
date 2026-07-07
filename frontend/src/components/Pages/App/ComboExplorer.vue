<script setup>
// Combo Explorer — given a card with an "action" effect (search / special summon
// / send-to-GY / to-deck), show every card in the pool that effect can reach.
//
// Effect filters are read from the precomputed EDOPro index (static JSON); the
// matching card lists are resolved live against YGOPRODeck so they never go
// stale. SSG-safe: all data loads client-side in onMounted behind `isMounted`.
import { ref, computed, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { searchById } from "@/api";
import { cardImage } from "@/lib/cardImage";
import { getCardEffects } from "@/lib/effectIndex";
import { resolveFetch } from "@/lib/comboResolver";

const route = useRoute();
const { t } = useI18n();
const isMounted = ref(false);

const cardId = computed(() => route.params.id);
const locale = computed(() => route.params.locale || "en");

const sourceCard = ref(null);
const effects = ref([]); // [{ actions, location, filter, confidence, cards, broad, loading }]
const loading = ref(true);
const notFound = ref(false);

function actionTitle(fetch) {
  const actions = (fetch.actions || []).map((a) => t(`combo.actions.${a}`));
  const verb = actions.length ? actions.join(" / ") : t("combo.actions.target");
  const loc = fetch.location ? t(`combo.locations.${fetch.location}`) : "";
  return `${verb} ${loc}`.trim();
}

/** Human-readable summary of a filter object. */
function filterSummary(f) {
  const parts = [];
  if (f.levels?.length) parts.push(t("combo.summary.level", { v: f.levels.join("/") }));
  if (f.levelMax != null) parts.push(t("combo.summary.levelMax", { v: f.levelMax }));
  if (f.levelMin != null) parts.push(t("combo.summary.levelMin", { v: f.levelMin }));
  if (f.attributes?.length) parts.push(f.attributes.join("/"));
  if (f.races?.length) parts.push(f.races.join("/"));
  if (f.types?.length) parts.push(f.types.join(" "));
  if (f.atk != null) parts.push(t("combo.summary.atk", { v: f.atk }));
  if (f.atkMax != null) parts.push(t("combo.summary.atkMax", { v: f.atkMax }));
  if (f.atkMin != null) parts.push(t("combo.summary.atkMin", { v: f.atkMin }));
  if (f.def != null) parts.push(t("combo.summary.def", { v: f.def }));
  if (f.defMax != null) parts.push(t("combo.summary.defMax", { v: f.defMax }));
  if (f.defMin != null) parts.push(t("combo.summary.defMin", { v: f.defMin }));
  if (f.archetypes?.length) parts.push('"' + f.archetypes.join("/") + '"');
  return parts.length ? parts.join(" · ") : t("combo.summary.any");
}

async function load() {
  loading.value = true;
  notFound.value = false;
  effects.value = [];
  sourceCard.value = null;

  const [cardRes, entry] = await Promise.all([
    searchById(cardId.value, locale.value),
    getCardEffects(cardId.value),
  ]);
  const data = cardRes?.data?.data ?? (Array.isArray(cardRes?.data) ? cardRes.data : []);
  sourceCard.value = data[0] ?? null;

  if (!entry || !entry.fetches?.length) {
    notFound.value = true;
    loading.value = false;
    return;
  }

  // Seed the rows immediately (with a loading state), then resolve each in turn.
  // Add UI state per-row for client-side search + filtering.
  effects.value = entry.fetches.map((f) => ({
    ...f,
    cards: [],
    broad: false,
    loading: true,
    // UI state
    query: '',
    selectedAttribute: null,
    selectedRace: null,
    selectedType: null,
  }));
  loading.value = false;

  for (const row of effects.value) {
    try {
      const { cards, broad } = await resolveFetch(row.filter, { location: row.location, actions: row.actions });
      row.cards = cards;
      row.broad = broad;
      // derive available filter options from returned cards
      row._attributes = Array.from(new Set(cards.map((c) => c.attribute).filter(Boolean))).sort();
      row._races = Array.from(new Set(cards.map((c) => c.race).filter(Boolean))).sort();
      row._types = Array.from(new Set(cards.map((c) => c.type).filter(Boolean))).sort();
    } catch {
      row.cards = [];
      row._attributes = [];
      row._races = [];
      row._types = [];
    } finally {
      row.loading = false;
    }
  }
}

onMounted(() => {
  isMounted.value = true;
  load();
});
watch(cardId, () => isMounted.value && load());

/** Client-side filtering for a single row. */
function matchesRowQuery(card, row) {
  if (!card) return false;
  const q = (row.query || '').trim().toLowerCase();
  if (q) {
    const inName = (card.name || '').toLowerCase().includes(q);
    const inText = (card.desc || '').toLowerCase().includes(q);
    if (!inName && !inText) return false;
  }
  if (row.selectedAttribute && card.attribute !== row.selectedAttribute) return false;
  if (row.selectedRace && card.race !== row.selectedRace) return false;
  if (row.selectedType && card.type !== row.selectedType) return false;
  return true;
}

function filteredCards(row) {
  if (!row || !Array.isArray(row.cards)) return [];
  return row.cards.filter((c) => matchesRowQuery(c, row));
}
</script>

<template>
  <div class="mx-auto px-4 py-6" style="max-width: 1100px">
    <!-- Header -->
    <div v-if="isMounted && sourceCard" class="flex items-center gap-4 mb-6">
      <img
        :src="cardImage(sourceCard.id)"
        :alt="sourceCard.name"
        class="rounded shrink-0"
        style="height: 96px; aspect-ratio: 59/86; object-fit: cover"
      />
      <div>
        <p class="text-xs uppercase tracking-wide" style="color: var(--c-muted)">{{ t('combo.title') }}</p>
        <h1 class="text-2xl font-bold" style="color: var(--c-text)">{{ sourceCard.name }}</h1>
        <router-link
          :to="`/${locale}/card/${sourceCard.id}`"
          class="text-sm no-underline"
          style="color: var(--c-muted)"
        >← {{ t('combo.backToCard') }}</router-link>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="!isMounted || loading" class="py-16 text-center" style="color: var(--c-muted)">
      <v-progress-circular indeterminate size="28" />
      <p class="mt-3 text-sm">{{ t('combo.analyzing') }}</p>
    </div>

    <!-- No combo data -->
    <div
      v-else-if="notFound"
      class="rounded-lg border px-5 py-8 text-center"
      style="border-color: var(--c-border); color: var(--c-muted)"
    >
      <p class="text-base" style="color: var(--c-text)">{{ t('combo.noEffect') }}</p>
      <p class="mt-2 text-sm">{{ t('combo.noEffectHint') }}</p>
    </div>

    <!-- Effect rows -->
    <div v-else class="flex flex-col gap-8">
      <section v-for="(row, i) in effects" :key="i">
        <div class="flex flex-wrap items-baseline gap-3 mb-3">
          <h2 class="text-lg font-semibold" style="color: var(--c-text)">{{ actionTitle(row) }}</h2>
          <span class="text-sm" style="color: var(--c-muted)">{{ filterSummary(row.filter) }}</span>
          <span
            v-if="row.confidence === 'medium'"
            class="text-[11px] px-2 py-0.5 rounded-full"
            style="background: rgba(245,158,11,0.15); color: #f59e0b"
            :title="t('combo.approximateHint')"
          >{{ t('combo.approximate') }}</span>
          <span
            v-if="!row.loading && !row.broad"
            class="text-sm"
            style="color: var(--c-muted)"
          >{{ t('combo.count', row.cards.length, { count: row.cards.length }) }}</span>
        </div>

        <div v-if="row.loading" class="py-6 text-sm" style="color: var(--c-muted)">
          <v-progress-circular indeterminate size="18" /> {{ t('combo.resolving') }}
        </div>

        <p v-else-if="row.broad" class="text-sm" style="color: var(--c-muted)">
          {{ t('combo.broad') }}
        </p>

        <p v-else-if="!row.cards.length" class="text-sm" style="color: var(--c-muted)">
          {{ t('combo.noMatches') }}
        </p>

        <div v-else>
          <!-- Search + lightweight filter controls -->
          <div class="flex flex-wrap gap-2 items-center mb-3">
            <input v-model="row.query" placeholder="Search name or text" class="px-2 py-1 rounded border" />
            <select v-model="row.selectedAttribute" class="px-2 py-1 rounded border">
              <option :value="null">All attributes</option>
              <option v-for="a in row._attributes" :key="a" :value="a">{{ a }}</option>
            </select>
            <select v-model="row.selectedRace" class="px-2 py-1 rounded border">
              <option :value="null">All races / properties</option>
              <option v-for="r in row._races" :key="r" :value="r">{{ r }}</option>
            </select>
            <select v-model="row.selectedType" class="px-2 py-1 rounded border">
              <option :value="null">All types</option>
              <option v-for="t in row._types" :key="t" :value="t">{{ t }}</option>
            </select>
            <button @click="row.query=''; row.selectedAttribute=null; row.selectedRace=null; row.selectedType=null" class="px-2 py-1 rounded border">Clear</button>
          </div>

          <div
            class="grid gap-3"
            style="grid-template-columns: repeat(auto-fill, minmax(92px, 1fr))"
          >
            <router-link
              v-for="c in filteredCards(row)"
              :key="c.id"
              :to="`/${locale}/card/${c.id}`"
              class="no-underline group"
              :title="c.name"
            >
              <img
                :src="cardImage(c.id)"
                :alt="c.name"
                loading="lazy"
                class="w-full rounded transition-transform group-hover:scale-105"
                style="aspect-ratio: 59/86; object-fit: cover"
              />
            </router-link>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
