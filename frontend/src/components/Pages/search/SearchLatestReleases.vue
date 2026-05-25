<script setup>
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import CardYugi from "@/components/CardYugi.vue";
import { getCardSets, getCardsBySet } from "@/api";

const { t } = useI18n();

const emit = defineEmits(["showTraders", "requireAuth"]);

const latestSets = ref([]);
const loading    = ref(true);

onMounted(async () => {
  const res = await getCardSets();
  const sorted = (res.data ?? [])
    .filter(s => s.tcg_date)
    .sort((a, b) => new Date(b.tcg_date) - new Date(a.tcg_date))
    .slice(0, 7);

  latestSets.value = sorted.map(s => ({ ...s, cards: [], loading: true }));
  loading.value = false;

  await Promise.all(
    latestSets.value.map(async (set, i) => {
      try {
        const r = await getCardsBySet(set.set_name);
        latestSets.value[i] = { ...latestSets.value[i], cards: r.data?.data ?? [], loading: false };
      } catch {
        latestSets.value[i] = { ...latestSets.value[i], loading: false };
      }
    })
  );
});
</script>

<template>
  <!-- Skeleton while loading sets list -->
  <template v-if="loading">
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

  <template v-else>
    <div class="flex items-center gap-3 -mb-6">
      <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">{{ t('search.latestReleases') }}</p>
    </div>

    <section v-for="set in latestSets" :key="set.set_name" class="flex flex-col gap-3">
      <div class="flex items-center gap-3">
        <p class="text-lg font-semibold" style="color: var(--c-text)">{{ set.set_name }}</p>
        <span class="text-xs" style="color: var(--c-muted)">{{ set.tcg_date }}</span>
        <span class="text-xs px-2 py-1 rounded border" style="color: var(--c-muted); border-color: var(--c-border)">
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
          <CardYugi :componentCard="card" :extension="set.set_name" @showTraders="emit('showTraders', $event)" @requireAuth="emit('requireAuth')" />
        </div>
      </div>
    </section>
  </template>
</template>
