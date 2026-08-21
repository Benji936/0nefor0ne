<script setup>
import { useI18n } from "vue-i18n";
import CardElement from "@/components/ui/card/CardElement.vue";

const { t } = useI18n();

defineProps({
  title:     { type: String,  default: "" },
  mode:      { type: String,  required: true }, // 'trade' | 'wish'
  cards:     { type: Array,   default: () => [] },
  loading:   { type: Boolean, default: false },
  newCardId: { type: [String, Number], default: null },
  emptyText: { type: String,  default: "" },
  view:      { type: String,  default: "list" }, // 'list' (rows) | 'grid' (tiles)
  // The divider tab above already names the pile and carries its count, so the
  // section only draws a heading when it is one of several on screen at once.
  showHead:  { type: Boolean, default: false },
  dense:     { type: Boolean, default: false },
  // The lists a card can be moved to. Empty for the trade pile, which has none.
  lists:     { type: Array,   default: () => [] },
});

const emit = defineEmits(["deleted", "move"]);
</script>

<template>
  <div class="flex flex-col" :class="dense ? 'gap-2' : 'gap-4'">
    <!-- Section labels in the collector's own register: monospace, uppercase,
         widely tracked (DESIGN.md, The Mono Identifier Rule). The count rides
         with the name because a list you are scrolling past is worth counting. -->
    <p v-if="showHead" class="ls-head">
      <span class="truncate">{{ title }}</span>
      <span class="ls-count tabular-nums">{{ cards.length }}</span>
    </p>

    <!-- Skeleton -->
    <template v-if="loading">
      <div
        v-for="i in 3"
        :key="i"
        class="flex flex-row items-center gap-4 rounded-lg px-4 py-3 w-full animate-pulse motion-reduce:animate-none border"
        style="background-color: var(--c-surface); border-color: var(--c-border)"
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
          :class="newCardId === card.id ? 'ls-new' : ''"
          :lists="lists"
          @deleted="emit('deleted', $event)"
          @move="emit('move', $event)"
        />
      </TransitionGroup>
      <!-- A named list that is empty says so in one line. The full empty state,
           with its go-and-search prompt, belongs to a whole empty pile. -->
      <p
        v-if="cards.length === 0 && dense"
        class="text-xs py-2"
        style="color: var(--c-muted)"
      >{{ emptyText }}</p>
      <div v-else-if="cards.length === 0" class="flex flex-col items-center gap-3 py-12 text-center">
        <div
          class="size-12 rounded-2xl flex items-center justify-center"
          style="background: color-mix(in srgb, var(--pile, var(--c-muted)) 12%, transparent)"
        >
          <v-icon :icon="mode === 'trade' ? 'mdi-cards-outline' : 'mdi-heart-outline'" size="24" color="var(--pile)" />
        </div>
        <p class="text-sm max-w-xs leading-relaxed" style="color: var(--c-muted)">{{ emptyText }}</p>
        <router-link
          to="/"
          class="text-xs font-semibold no-underline flex items-center gap-1 transition-opacity hover:opacity-70"
          style="color: var(--pile)"
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
@media (prefers-reduced-motion: reduce) {
  .card-slide-enter-active { transition: none; }
  .card-slide-enter-from   { opacity: 1; transform: none; }
}

.ls-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  min-width: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.ls-count {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  color: var(--c-muted);
  background: color-mix(in srgb, var(--c-muted) 12%, transparent);
}

/* A card that just landed, marked in the colour of the pile it landed in —
   the ring used to be a Tailwind blue that exists nowhere in the palette. */
.ls-new {
  outline: 2px solid var(--pile, var(--c-accent));
  outline-offset: 2px;
  border-radius: 10px;
}
</style>
