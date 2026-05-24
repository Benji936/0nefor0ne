<script setup>
import { ref, onMounted } from "vue";
import { fetchTrendingCards } from "@/lib/matches";
import { searchById } from "@/api";
import CardYugi from "@/components/CardYugi.vue";

const emit = defineEmits(["showTraders", "requireAuth"]);

const trendingCards = ref([]);
const loading       = ref(true);

onMounted(async () => {
  try {
    const trending = await fetchTrendingCards(10);

    // Show cards immediately with basic data so the skeleton clears right away
    trendingCards.value = trending.map(c => ({ ...c, id: c.image_id, card_sets: [] }));
    loading.value = false;

    if (!trending.length) return;

    // Enrich each card with full API data (desc, atk, def, level, race, card_sets)
    const enriched = await Promise.all(
      trending.map(async card => {
        try {
          const res = await searchById(card.image_id);
          const api = res.data?.data?.[0] ?? null;
          if (!api) return { ...card, id: card.image_id, card_sets: [] };
          // Keep our image_id as `id` and preserve Supabase-specific fields
          return { ...api, id: card.image_id, trade_count: card.trade_count, extension: card.extension };
        } catch {
          return { ...card, id: card.image_id, card_sets: [] };
        }
      })
    );
    trendingCards.value = enriched;
  } catch (err) {
    console.error('fetchTrendingCards failed', err);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section v-if="loading || trendingCards.length > 0" class="flex flex-col gap-4">
    <div class="flex items-center gap-3">
      <v-icon icon="mdi-fire" size="18" style="color: var(--c-accent)" />
      <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Trending</p>
      <span class="text-xs px-2 py-1 rounded border" style="color: var(--c-muted); border-color: var(--c-border)">last 30 days</span>
    </div>

    <!-- Skeleton -->
    <div v-if="loading" class="flex gap-3 overflow-x-auto pb-2">
      <div
        v-for="j in 8" :key="j"
        class="rounded-lg animate-pulse shrink-0"
        :style="{ width: '85px', height: '192px', backgroundColor: 'var(--c-skeleton)', animationDelay: `${j * 50}ms` }"
      />
    </div>

    <!-- Cards -->
    <div v-else class="flex gap-3 overflow-x-auto pb-2">
      <div
        v-for="card in trendingCards"
        :key="`${card.image_id}-${card.extension}`"
        class="relative shrink-0"
      >
        <CardYugi
          :componentCard="card"
          :extension="card.extension ?? ''"
          @showTraders="emit('showTraders', $event)"
          @requireAuth="emit('requireAuth')"
        />
        <!-- Fire badge -->
        <span
          class="absolute top-1 right-1 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold tabular-nums pointer-events-none"
          style="background: color-mix(in srgb, var(--c-accent) 85%, black); color: white; z-index: 1"
        >
          <v-icon icon="mdi-fire" size="9" />{{ card.trade_count }}
        </span>
      </div>
    </div>

    <div class="h-px w-full" style="background-color: var(--c-border)" />
  </section>
</template>
