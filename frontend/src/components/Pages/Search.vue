<script setup>
import CardYugi from '../CardYugi.vue';
const emit = defineEmits(['TradeCenter']);
</script>

<template>
  <div class="flex flex-col gap-10 py-6">

    <!-- ── Search results ── -->
    <section v-if="hasSearchResults">
      <div class="flex items-center gap-3 mb-5">
        <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Results</p>
        <span class="text-sm px-2 py-0.5 rounded-md border" style="color: var(--c-muted); border-color: var(--c-border)">
          {{ searchCards.data.length }} cards
        </span>
      </div>
      <div class="flex flex-wrap gap-4">
        <div v-for="card in searchCards.data" :key="card.id" style="width: 136px; flex-shrink: 0">
          <CardYugi :componentCard="card" @showTraders="emit('TradeCenter', $event)" />
        </div>
      </div>
      <div class="h-px w-full mt-10" style="background-color: var(--c-border)" />
    </section>

    <!-- ── Latest releases skeleton ── -->
    <template v-if="loadingSets">
      <section v-for="i in 5" :key="i" class="flex flex-col gap-3">
        <div class="h-5 w-48 rounded-lg animate-pulse" style="background-color: var(--c-skeleton)" />
        <div class="flex gap-3 overflow-x-auto pb-2">
          <div
            v-for="j in 8" :key="j"
            class="h-48 rounded-lg animate-pulse"
            :style="{ width: '136px', flexShrink: 0, backgroundColor: 'var(--c-skeleton)', animationDelay: `${j * 60}ms` }"
          />
        </div>
      </section>
    </template>

    <!-- ── Latest releases ── -->
    <template v-else>
      <section v-for="set in latestSets" :key="set.set_name" class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <p class="text-lg font-semibold" style="color: var(--c-text)">{{ set.set_name }}</p>
          <span class="text-xs" style="color: var(--c-muted)">{{ set.tcg_date }}</span>
          <span class="text-xs px-2 py-0.5 rounded border" style="color: var(--c-muted); border-color: var(--c-border)">
            {{ set.num_of_cards }} cards
          </span>
        </div>

        <!-- Per-set skeleton while loading cards -->
        <div v-if="set.loading" class="flex gap-3 overflow-x-auto pb-2">
          <div
            v-for="j in 10" :key="j"
            class="h-48 rounded-lg animate-pulse"
            :style="{ width: '136px', flexShrink: 0, backgroundColor: 'var(--c-skeleton)', animationDelay: `${j * 60}ms` }"
          />
        </div>

        <div v-else class="flex gap-3 overflow-x-auto pb-3">
          <div v-for="card in set.cards" :key="card.id" style="width: 136px; flex-shrink: 0">
            <CardYugi :componentCard="card" :extension="set.set_name" @showTraders="emit('TradeCenter', $event)" />
          </div>
        </div>
      </section>
    </template>

  </div>
</template>

<script>
import { getCardSets, getCardsBySet } from "@/api";

export default {
  props: ['searchCards'],
  data() {
    return {
      latestSets: [],
      loadingSets: true,
    };
  },
  computed: {
    hasSearchResults() {
      return Array.isArray(this.searchCards?.data) && this.searchCards.data.length > 0;
    },
  },
  async mounted() {
    const res = await getCardSets();
    const allSets = res.data ?? [];

    const latest = allSets
      .filter(s => s.tcg_date)
      .sort((a, b) => new Date(b.tcg_date) - new Date(a.tcg_date))
      .slice(0, 7);

    this.latestSets = latest.map(s => ({ ...s, cards: [], loading: true }));
    this.loadingSets = false;

    // Fetch cards for each set concurrently
    await Promise.all(
      this.latestSets.map(async (set, i) => {
        try {
          const r = await getCardsBySet(set.set_name);
          this.latestSets[i] = { ...this.latestSets[i], cards: r.data?.data ?? [], loading: false };
        } catch {
          this.latestSets[i] = { ...this.latestSets[i], loading: false };
        }
      })
    );
  },
};
</script>
