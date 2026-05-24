<script setup>
import CardYugi              from "@/components/CardYugi.vue";
import SearchTrending        from "./search/SearchTrending.vue";
import SearchSetBrowser      from "./search/SearchSetBrowser.vue";
import SearchLatestReleases  from "./search/SearchLatestReleases.vue";

defineProps({
  searchCards: { type: Object, default: null },
});

defineEmits(["TradeCenter", "requireAuth"]);

const hasSearchResults = (searchCards) =>
  Array.isArray(searchCards?.data) && searchCards.data.length > 0;
</script>

<template>
  <div class="flex flex-col gap-6 md:gap-10 py-15">

    <!-- Search results -->
    <section v-if="hasSearchResults(searchCards)">
      <div class="flex items-center gap-3 mb-5">
        <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Results</p>
        <span class="text-sm px-2 py-1 rounded-md border" style="color: var(--c-muted); border-color: var(--c-border)">
          {{ searchCards.data.length }} cards
        </span>
      </div>
      <div class="flex flex-wrap gap-5">
        <div v-for="card in searchCards.data" :key="card.id" class="relative" style="width: 136px; flex-shrink: 0">
          <!-- SEO anchor: gives crawlers a followable link to the card permalink.
               pointer-events-none keeps it invisible to mouse/touch so the
               CardYugi overlay activator receives clicks normally. -->
          <a
            :href="`/card/${card.id}`"
            :aria-label="card.name"
            class="absolute inset-0 z-0 pointer-events-none"
            tabindex="-1"
          />
          <CardYugi :componentCard="card" @showTraders="$emit('TradeCenter', $event)" @requireAuth="$emit('requireAuth')" />
        </div>
      </div>
      <div class="h-px w-full mt-10" style="background-color: var(--c-border)" />
    </section>

    <!-- Trending -->
    <SearchTrending @showTraders="$emit('TradeCenter', $event)" @requireAuth="$emit('requireAuth')" />

    <!-- Browse by extension -->
    <SearchSetBrowser @showTraders="$emit('TradeCenter', $event)" @requireAuth="$emit('requireAuth')" />

    <div class="h-px w-full" style="background-color: var(--c-border)" />

    <!-- Latest releases -->
    <SearchLatestReleases @showTraders="$emit('TradeCenter', $event)" @requireAuth="$emit('requireAuth')" />

  </div>
</template>
