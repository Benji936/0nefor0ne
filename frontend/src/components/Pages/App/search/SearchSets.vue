<script setup>
/**
 * Sets, in one section.
 *
 * This replaces two that were doing the same job: a set search that showed one
 * set's cards, and a "latest releases" block that rendered seven sets as seven
 * stacked horizontal rails. Seven rails is a wall, not browsing — and it cost
 * seven full-set fetches on every home page load. The newest sets are still all
 * visible, as chips, so nothing is lost except the wall.
 */
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import CardYugi from "@/components/ui/card/CardYugi.vue";
import { getCardSets, getCardsBySet } from "@/api";

const { t } = useI18n();
const route = useRoute();

/** How many recent sets get a shortcut chip. Enough to see what has landed
 *  lately without the row becoming a second navigation. */
const RECENT = 6;

const allSets = ref([]);
const loading = ref(true);
const selected = ref(null);
const cards = ref([]);
const loadingCards = ref(false);
let reqId = 0;

const locale = computed(() => route.params.locale || "en");

/** Newest first, by the date the set hit the TCG. */
const recentSets = computed(() =>
  allSets.value
    .filter((s) => s.tcg_date)
    .sort((a, b) => new Date(b.tcg_date) - new Date(a.tcg_date))
    .slice(0, RECENT)
);

function filterSet(value, query, item) {
  const q = query.toLowerCase();
  return (
    item.raw.set_name.toLowerCase().includes(q) ||
    (item.raw.set_code ?? "").toLowerCase().includes(q)
  );
}

async function open(setName) {
  cards.value = [];
  selected.value = setName ?? null;
  if (!setName) return;
  const id = ++reqId;
  loadingCards.value = true;
  try {
    const r = await getCardsBySet(setName, locale.value);
    if (id !== reqId) return;
    cards.value = r.data?.data ?? [];
  } catch {
    if (id === reqId) cards.value = [];
  } finally {
    if (id === reqId) loadingCards.value = false;
  }
}

onMounted(async () => {
  const res = await getCardSets();
  allSets.value = (res.data ?? []).sort((a, b) => a.set_name.localeCompare(b.set_name));
  loading.value = false;
  // Land on the newest set rather than on an empty rail: the answer to "what is
  // new" is the thing somebody came to this section for.
  const newest = recentSets.value[0];
  if (newest) open(newest.set_name);
});
</script>

<template>
  <section class="hm-sets" aria-labelledby="hm-sets-h">
    <p id="hm-sets-h" class="hm-eyebrow">
      <v-icon icon="mdi-package-variant-closed" size="14" />{{ t('search.latestReleases') }}
    </p>

    <v-autocomplete
      :model-value="selected"
      :items="allSets"
      item-title="set_name"
      item-value="set_name"
      :custom-filter="filterSet"
      :loading="loading"
      :placeholder="t('search.searchByNameOrCode')"
      :aria-label="t('search.browseByExtension')"
      clearable
      hide-details
      density="comfortable"
      variant="outlined"
      prepend-inner-icon="mdi-magnify"
      class="hm-field"
      @update:model-value="open"
    >
      <template #item="{ item, props: itemProps }">
        <v-list-item v-bind="itemProps" :subtitle="item.raw.set_code">
          <template #append>
            <span class="text-xs tabular-nums" style="color: var(--c-muted)">
              {{ t('search.cardsCount', { count: item.raw.num_of_cards }) }}
            </span>
          </template>
        </v-list-item>
      </template>
    </v-autocomplete>

    <!-- The newest sets as shortcuts, in the collector's register: the code is
         how a set is named out loud, the date is why it is on this row. -->
    <div v-if="recentSets.length" class="hm-chips">
      <button
        v-for="s in recentSets"
        :key="s.set_name"
        type="button"
        class="hm-chip"
        :class="{ 'is-on': selected === s.set_name }"
        :aria-pressed="selected === s.set_name ? 'true' : 'false'"
        @click="open(s.set_name)"
      >
        <span class="hm-chip__code">{{ s.set_code || s.set_name }}</span>
        <span class="hm-chip__date">{{ s.tcg_date }}</span>
      </button>
    </div>

    <div v-if="loadingCards" class="hm-rail">
      <div
        v-for="j in 10" :key="j"
        class="hm-rail__sk animate-pulse motion-reduce:animate-none"
        :style="{ animationDelay: `${j * 60}ms` }"
      />
    </div>

    <template v-else-if="selected && cards.length">
      <div class="hm-sets__head">
        <router-link :to="`/${locale}/set/${encodeURIComponent(selected)}`" class="hm-sets__name">
          {{ selected }}
        </router-link>
        <span class="hm-sets__n tabular-nums">{{ t('search.cardsCount', { count: cards.length }) }}</span>
      </div>
      <div class="hm-rail">
        <CardYugi
          v-for="card in cards"
          :key="card.id"
          :componentCard="card"
          class="hm-rail__card"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.hm-sets { display: flex; flex-direction: column; gap: 16px; }

.hm-field { width: 100%; max-width: 460px; --v-field-border-color: var(--hm-line); }

.hm-chips { display: flex; flex-wrap: wrap; gap: 7px; }
.hm-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid var(--hm-line-soft);
  background: transparent;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.hm-chip:hover { border-color: var(--hm-line); background: var(--hm-panel); }
.hm-chip:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
.hm-chip.is-on { background: var(--c-trade); border-color: transparent; }

.hm-chip__code {
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--c-text);
}
.hm-chip__date { font-size: 0.68rem; color: var(--c-muted); }
.hm-chip.is-on .hm-chip__code,
.hm-chip.is-on .hm-chip__date { color: var(--c-on-accent); }

.hm-sets__head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.hm-sets__name {
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--c-text);
  text-decoration: none;
}
.hm-sets__name:hover { text-decoration: underline; text-underline-offset: 3px; }
.hm-sets__name:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 3px; border-radius: 4px; }
.hm-sets__n { font-size: 0.75rem; color: var(--c-muted); }

.hm-rail {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 10px;
  overscroll-behavior-x: contain;
}
.hm-rail__card { flex: 0 0 auto; }
.hm-rail__sk {
  flex: 0 0 auto;
  width: 136px;
  height: 192px;
  border-radius: 8px;
  background: var(--c-skeleton);
}

/* Narrow screens keep the codes and drop the dates: the code is what names a
   set, the date is context. With both, six shortcuts wrapped to three rows and
   pushed the cards off the screen. */
@media (max-width: 480px) {
  .hm-chip__date { display: none; }
  .hm-chip { padding: 7px 11px; }
}
</style>
