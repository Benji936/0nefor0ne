<script setup>
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import CardYugi from "@/components/ui/card/CardYugi.vue";
import { getCardSets, getCardsBySet } from "@/api";

const { t }  = useI18n();
const route  = useRoute();

const emit = defineEmits(["showTraders", "requireAuth"]);

const allSets         = ref([]);
const loading         = ref(true);
const selectedSet     = ref(null);
const setCards        = ref([]);
const loadingSetCards = ref(false);
let   _reqId          = 0;

function filterSet(value, query, item) {
  const q = query.toLowerCase();
  return (
    item.raw.set_name.toLowerCase().includes(q) ||
    (item.raw.set_code ?? "").toLowerCase().includes(q)
  );
}

async function onSetSelected(setName) {
  setCards.value = [];
  if (!setName) return;
  const id = ++_reqId;
  loadingSetCards.value = true;
  try {
    const r = await getCardsBySet(setName, route.params.locale || "en");
    if (id !== _reqId) return;
    setCards.value = r.data?.data ?? [];
  } catch {
    if (id === _reqId) setCards.value = [];
  } finally {
    if (id === _reqId) loadingSetCards.value = false;
  }
}

onMounted(async () => {
  const res = await getCardSets();
  allSets.value = (res.data ?? []).sort((a, b) => a.set_name.localeCompare(b.set_name));
  loading.value = false;
});

defineExpose({ allSets, loading });
</script>

<template>
  <section class="flex flex-col gap-4">
    <div class="flex items-center gap-3">
      <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">{{ t('search.browseByExtension') }}</p>
    </div>

    <v-autocomplete
      v-model="selectedSet"
      :items="allSets"
      item-title="set_name"
      item-value="set_name"
      :custom-filter="filterSet"
      :loading="loading"
      :placeholder="t('search.searchByNameOrCode')"
      clearable
      hide-details
      density="comfortable"
      variant="outlined"
      prepend-inner-icon="mdi-magnify"
      :style="{
        width: '100%',
        maxWidth: '480px',
        '--v-field-border-color': 'var(--c-border)',
      }"
      @update:model-value="onSetSelected"
    >
      <template #item="{ item, props: itemProps }">
        <v-list-item v-bind="itemProps" :subtitle="item.raw.set_code">
          <template #append>
            <span class="text-xs tabular-nums" style="color: var(--c-muted)">{{ t('search.cardsCount', { count: item.raw.num_of_cards }) }}</span>
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

    <template v-else-if="setCards.length > 0">
      <div class="flex items-center gap-3">
        <span class="text-lg font-semibold" style="color: var(--c-text)">{{ selectedSet }}</span>
        <span class="text-xs px-2 py-1 rounded border" style="color: var(--c-muted); border-color: var(--c-border)">
          {{ setCards.length }} cards
        </span>
      </div>
      <div class="flex gap-3 overflow-x-auto pb-3">
        <div v-for="card in setCards" :key="card.id" class="relative" style="width: 136px; flex-shrink: 0">
          <a
            :href="`/${route.params.locale || 'en'}/card/${card.id}`"
            :aria-label="card.name"
            class="absolute inset-0 z-0 pointer-events-none"
            tabindex="-1"
          />
          <CardYugi :componentCard="card" :extension="selectedSet" @showTraders="emit('showTraders', $event)" @requireAuth="emit('requireAuth')" />
        </div>
      </div>
    </template>
  </section>
</template>
