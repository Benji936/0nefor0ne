<script setup>
import { useI18n } from "vue-i18n";
import AddCard     from "@/components/library/AddCard.vue";
import CardElement from "@/components/ui/card/CardElement.vue";

const { t } = useI18n();

defineProps({
  title:     { type: String,  required: true },
  mode:      { type: String,  required: true }, // 'trade' | 'wish'
  cards:     { type: Array,   default: () => [] },
  loading:   { type: Boolean, default: false },
  newCardId: { type: [String, Number], default: null },
  emptyText: { type: String,  default: "Nothing here yet." },
  ringClass: { type: String,  default: "ring-blue-400" },
  view:      { type: String,  default: "list" }, // 'list' (rows) | 'grid' (tiles)
  // A wishlist renders one of these per named list. Those sub-sections share
  // one add button and one heading level with the section above them, so both
  // are optional rather than assumed.
  showAdd:   { type: Boolean, default: true },
  dense:     { type: Boolean, default: false },
  // The lists a card can be moved to. Empty for the trade pile, which has none.
  lists:     { type: Array,   default: () => [] },
});

const emit = defineEmits(["added", "deleted", "move"]);
</script>

<template>
  <div class="flex flex-col" :class="dense ? 'gap-2' : 'gap-4'">
    <div class="flex flex-row items-center justify-between gap-2">
      <p
        class="text-left font-semibold tracking-wide"
        :class="dense ? 'text-sm' : 'text-xl uppercase'"
        :style="{ color: dense ? 'var(--c-muted)' : 'var(--c-text)' }"
      >{{ title }}</p>
      <div class="flex items-center gap-1">
        <slot name="actions" />
        <AddCard v-if="showAdd" :mode="mode" @added="emit('added', $event)" />
      </div>
    </div>

    <!-- Skeleton -->
    <template v-if="loading">
      <div
        v-for="i in 3"
        :key="i"
        class="flex flex-row items-center gap-4 rounded-lg px-4 py-3 w-full animate-pulse border"
        style="background-color: var(--c-surface-2); border-color: var(--c-border)"
      >
        <div class="h-14 w-10 rounded shrink-0" style="background-color: var(--c-skeleton)" />
        <div class="flex flex-col gap-2 grow">
          <div class="h-3 rounded w-3/4" style="background-color: var(--c-skeleton)" />
          <div class="h-3 rounded w-1/2" style="background-color: var(--c-border)" />
        </div>
        <div class="h-8 w-32 rounded shrink-0" style="background-color: var(--c-skeleton)" />
      </div>
    </template>

    <!-- Cards -->
    <template v-else>
      <TransitionGroup
        name="card-slide"
        tag="div"
        :class="view === 'grid' ? 'grid grid-cols-2 sm:flex sm:flex-wrap gap-3' : 'flex flex-col gap-2'"
      >
        <CardElement
          v-for="card in cards"
          :key="card.id"
          :wish="card"
          :layout="view"
          :class="newCardId === card.id ? `ring-2 ${ringClass}` : ''"
          :lists="lists"
          @deleted="emit('deleted', $event)"
          @move="emit('move', $event)"
        />
      </TransitionGroup>
      <!-- A named list that is empty says so in one line. The full empty state,
           with its go-and-search prompt, belongs to a whole empty section. -->
      <p
        v-if="cards.length === 0 && dense"
        class="text-xs py-2"
        style="color: var(--c-muted)"
      >{{ emptyText }}</p>
      <div v-else-if="cards.length === 0" class="flex flex-col items-center gap-3 py-10 text-center">
        <div
          class="size-12 rounded-2xl flex items-center justify-center"
          style="background: color-mix(in srgb, var(--c-muted) 10%, transparent)"
        >
          <v-icon :icon="mode === 'trade' ? 'mdi-cards-outline' : 'mdi-heart-outline'" size="24" color="var(--c-muted)" />
        </div>
        <p class="text-sm max-w-xs leading-relaxed" style="color: var(--c-muted)">{{ emptyText }}</p>
        <router-link
          to="/"
          class="text-xs font-semibold no-underline flex items-center gap-1 transition-opacity hover:opacity-70"
          style="color: var(--c-trade)"
        >
          <v-icon icon="mdi-magnify" size="14" />
          {{ t('library.searchCards') }}
        </router-link>
      </div>
    </template>
  </div>
</template>

<style scoped>
.card-slide-enter-active { transition: all 0.25s ease-out; }
.card-slide-enter-from   { opacity: 0; transform: translateY(-6px); }
</style>
