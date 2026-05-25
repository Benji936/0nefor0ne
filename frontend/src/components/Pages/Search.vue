<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import CardYugi              from "@/components/CardYugi.vue";
import SearchTrending        from "./search/SearchTrending.vue";
import SearchSetBrowser      from "./search/SearchSetBrowser.vue";
import SearchLatestReleases  from "./search/SearchLatestReleases.vue";

const { t } = useI18n();

defineProps({
  searchCards: { type: Object, default: null },
  login:       { type: Object, default: null },
});

defineEmits(["TradeCenter", "requireAuth"]);

const hasSearchResults = (searchCards) =>
  Array.isArray(searchCards?.data) && searchCards.data.length > 0;

// A handful of iconic cards used purely as visual texture in the hero
const HERO_CARDS = [46986414, 89631139, 53129443, 14558127, 38033121, 55144522];
const cardThumb = (id) => `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`;

const HOW_IT_WORKS = computed(() => [
  { n: "01", title: t("hero.steps.01.title"), body: t("hero.steps.01.body") },
  { n: "02", title: t("hero.steps.02.title"), body: t("hero.steps.02.body") },
  { n: "03", title: t("hero.steps.03.title"), body: t("hero.steps.03.body") },
  { n: "04", title: t("hero.steps.04.title"), body: t("hero.steps.04.body") },
]);
</script>

<template>
  <div class="flex flex-col gap-6 md:gap-10 py-15">

    <!-- ── Hero (logged-out, no search active) ───────────────────────────── -->
    <section
      v-if="!login && !hasSearchResults(searchCards)"
      class="flex flex-col gap-10 py-6 md:py-12"
    >
      <!-- Card image strip — visual proof the database is real -->
      <div class="flex gap-2 overflow-hidden" style="mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent)">
        <img
          v-for="id in HERO_CARDS"
          :key="id"
          :src="cardThumb(id)"
          alt=""
          aria-hidden="true"
          class="rounded-md shrink-0 opacity-80"
          style="width: 88px; height: 128px; object-fit: cover"
        />
      </div>

      <!-- Headline block -->
      <div class="flex flex-col gap-4 max-w-xl">
        <h1 class="text-3xl md:text-4xl font-black leading-tight tracking-tight" style="color: var(--c-text)">
          {{ $t('hero.headline') }}
        </h1>
        <p class="text-base md:text-lg leading-relaxed" style="color: var(--c-muted)">
          {{ $t('hero.subheadline') }}
        </p>
        <div class="flex flex-wrap gap-3 mt-1">
          <v-btn
            size="large"
            variant="flat"
            :style="{ background: 'var(--c-trade)', color: 'white', fontWeight: 700, minHeight: '48px', paddingInline: '28px' }"
            @click="$emit('requireAuth')"
          >
            {{ $t('hero.cta') }}
          </v-btn>
        </div>
      </div>

      <!-- How it works -->
      <div class="flex flex-col gap-3">
        <p class="text-xs font-bold uppercase tracking-widest" style="color: var(--c-muted)">{{ $t('hero.learnMore') }}</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div
            v-for="step in HOW_IT_WORKS"
            :key="step.n"
            class="flex flex-col gap-2 rounded-xl py-4 px-4"
            style="background: var(--c-surface); border: 1px solid var(--c-border)"
          >
            <span class="text-xs font-black tabular-nums" style="color: var(--c-trade)">{{ step.n }}</span>
            <p class="text-sm font-bold" style="color: var(--c-text)">{{ step.title }}</p>
            <p class="text-xs leading-relaxed" style="color: var(--c-muted)">{{ step.body }}</p>
          </div>
        </div>
      </div>

      <!-- Divider before trending -->
      <div class="h-px w-full" style="background: var(--c-border)" />
    </section>

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
