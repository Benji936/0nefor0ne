<template>
  <div class="flex flex-col gap-10 px-15 py-15">

    <!-- ── Search results ── -->
    <section v-if="hasSearchResults">
      <div class="flex items-center gap-3 mb-5">
        <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Results</p>
        <span class="text-sm px-2 py-0.5 rounded-md border" style="color: var(--c-muted); border-color: var(--c-border)">
          {{ searchCards.data.length }} cards
        </span>
      </div>
      <div class="flex flex-wrap gap-5">
        <div v-for="card in searchCards.data" :key="card.id" style="width: 136px; flex-shrink: 0">
          <CardYugi :componentCard="card" @showTraders="$emit('TradeCenter', $event)" @requireAuth="$emit('requireAuth')" />
        </div>
      </div>
      <div class="h-px w-full mt-10" style="background-color: var(--c-border)" />
    </section>

    <!-- ── Trending cards ── -->
    <section v-if="loadingTrending || trendingCards.length > 0" class="flex flex-col gap-4">
      <div class="flex items-center gap-3">
        <v-icon icon="mdi-fire" size="18" style="color: var(--c-accent)" />
        <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Trending</p>
        <span class="text-xs px-2 py-0.5 rounded border" style="color: var(--c-muted); border-color: var(--c-border)">last 30 days</span>
      </div>

      <!-- Skeleton -->
      <div v-if="loadingTrending" class="flex gap-3 overflow-x-auto pb-2">
        <div
          v-for="j in 8" :key="j"
          class="rounded-lg animate-pulse shrink-0"
          :style="{ width: '90px', height: '128px', backgroundColor: 'var(--c-skeleton)', animationDelay: `${j * 50}ms` }"
        />
      </div>

      <!-- Trending chips row -->
      <div v-else class="flex gap-3 overflow-x-auto pb-2">
        <button
          v-for="card in trendingCards"
          :key="`${card.image_id}-${card.extension}`"
          class="trending-chip relative shrink-0 overflow-hidden cursor-pointer border"
          style="width: 90px; border-color: var(--c-border)"
          :title="`${card.name} · ${card.extension ?? ''}`"
          @click="$emit('TradeCenter', card.name)"
        >
          <img
            :src="cardImage(card.image_id)"
            :alt="card.name"
            class="w-full object-contain"
            style="height: 128px; background: var(--c-surface-2)"
            loading="lazy"
          />
          <!-- Heat badge -->
          <span
            class="absolute top-1 right-1 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold tabular-nums"
            style="background: color-mix(in srgb, var(--c-accent) 85%, black); color: white"
          >
            <v-icon icon="mdi-fire" size="9" />{{ card.trade_count }}
          </span>
        </button>
      </div>

      <div class="h-px w-full" style="background-color: var(--c-border)" />
    </section>

    <!-- ── Browse by extension ── -->
    <section class="flex flex-col gap-4">
      <div class="flex items-center gap-3">
        <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Browse by extension</p>
      </div>

      <v-autocomplete
        v-model="selectedSet"
        :items="allSets"
        item-title="set_name"
        item-value="set_name"
        :custom-filter="filterSet"
        :loading="loadingSets"
        placeholder="Search by name or code…"
        clearable
        hide-details
        density="comfortable"
        variant="outlined"
        prepend-inner-icon="mdi-magnify"
        :style="{
          maxWidth: '480px',
          '--v-field-border-color': 'var(--c-border)',
        }"
        @update:model-value="onSetSelected"
      >
        <template #item="{ item, props: itemProps }">
          <v-list-item v-bind="itemProps" :subtitle="item.raw.set_code">
            <template #append>
              <span class="text-xs tabular-nums" style="color: var(--c-muted)">{{ item.raw.num_of_cards }} cards</span>
            </template>
          </v-list-item>
        </template>
      </v-autocomplete>

      <!-- Loading cards for the selected set -->
      <template v-if="loadingSetCards">
        <div class="flex gap-3 overflow-x-auto pb-2">
          <div
            v-for="j in 10" :key="j"
            class="rounded-lg animate-pulse"
            :style="{ width: '136px', height: '192px', flexShrink: 0, backgroundColor: 'var(--c-skeleton)', animationDelay: `${j * 60}ms` }"
          />
        </div>
      </template>

      <!-- Set cards horizontal scroll -->
      <template v-else-if="setCards.length > 0">
        <div class="flex items-center gap-3">
          <span class="text-lg font-semibold" style="color: var(--c-text)">{{ selectedSet }}</span>
          <span class="text-xs px-2 py-0.5 rounded border" style="color: var(--c-muted); border-color: var(--c-border)">
            {{ setCards.length }} cards
          </span>
        </div>
        <div class="flex gap-3 overflow-x-auto pb-3">
          <div v-for="card in setCards" :key="card.id" style="width: 136px; flex-shrink: 0">
            <CardYugi :componentCard="card" :extension="selectedSet" @showTraders="$emit('TradeCenter', $event)" />
          </div>
        </div>
      </template>
    </section>

    <div class="h-px w-full" style="background-color: var(--c-border)" />

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
      <div class="flex items-center gap-3 -mb-6">
        <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Latest releases</p>
      </div>
      <section v-for="set in latestSets" :key="set.set_name" class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <p class="text-lg font-semibold" style="color: var(--c-text)">{{ set.set_name }}</p>
          <span class="text-xs" style="color: var(--c-muted)">{{ set.tcg_date }}</span>
          <span class="text-xs px-2 py-0.5 rounded border" style="color: var(--c-muted); border-color: var(--c-border)">
            {{ set.num_of_cards }} cards
          </span>
        </div>

        <div v-if="set.loading" class="flex gap-3 overflow-x-auto pb-2">
          <div
            v-for="j in 10" :key="j"
            class="h-48 rounded-lg animate-pulse"
            :style="{ width: '136px', flexShrink: 0, backgroundColor: 'var(--c-skeleton)', animationDelay: `${j * 60}ms` }"
          />
        </div>

        <div v-else class="flex gap-3 overflow-x-auto pb-3">
          <div v-for="card in set.cards" :key="card.id" style="width: 136px; flex-shrink: 0">
            <CardYugi :componentCard="card" :extension="set.set_name" @showTraders="$emit('TradeCenter', $event)" />
          </div>
        </div>
      </section>
    </template>

  </div>
</template>

<script>
import CardYugi from '../CardYugi.vue';
import { getCardSets, getCardsBySet } from "@/api";
import { fetchTrendingCards } from "@/lib/matches";
import { cardImage } from "@/lib/cardImage";

export default {
  components: { CardYugi },
  emits: ['TradeCenter', 'requireAuth'],
  props: ['searchCards'],
  data() {
    return {
      // All sets (for the autocomplete)
      allSets: [],
      loadingSets: true,
      // Selected extension browse
      selectedSet: null,
      setCards: [],
      loadingSetCards: false,
      _setReqId: 0,
      // Latest releases
      latestSets: [],
      // Trending cards
      trendingCards: [],
      loadingTrending: true,
    };
  },
  computed: {
    hasSearchResults() {
      return Array.isArray(this.searchCards?.data) && this.searchCards.data.length > 0;
    },
  },
  methods: {
    cardImage,
    filterSet(value, query, item) {
      const q = query.toLowerCase();
      return (
        item.raw.set_name.toLowerCase().includes(q) ||
        (item.raw.set_code ?? "").toLowerCase().includes(q)
      );
    },
    async onSetSelected(setName) {
      this.setCards = [];
      if (!setName) return;
      const reqId = ++this._setReqId;
      this.loadingSetCards = true;
      try {
        const r = await getCardsBySet(setName);
        if (reqId !== this._setReqId) return;
        this.setCards = r.data?.data ?? [];
      } catch {
        if (reqId === this._setReqId) this.setCards = [];
      } finally {
        if (reqId === this._setReqId) this.loadingSetCards = false;
      }
    },
  },
  async mounted() {
    // Load trending cards in the background
    fetchTrendingCards(10).then(data => {
      this.trendingCards = data;
      this.loadingTrending = false;
    }).catch(() => { this.loadingTrending = false; });

    const res = await getCardSets();
    this.allSets = (res.data ?? []).sort((a, b) => a.set_name.localeCompare(b.set_name));

    const latest = [...this.allSets]
      .filter(s => s.tcg_date)
      .sort((a, b) => new Date(b.tcg_date) - new Date(a.tcg_date))
      .slice(0, 7);

    this.latestSets = latest.map(s => ({ ...s, cards: [], loading: true }));
    this.loadingSets = false;

    // Fetch cards for each latest set concurrently
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

<style scoped>
.trending-chip {
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
              box-shadow 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}
.trending-chip:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
}
</style>
