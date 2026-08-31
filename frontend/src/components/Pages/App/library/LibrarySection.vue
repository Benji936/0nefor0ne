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
  // Card id -> resolved Cardmarket price, loaded once by the page. Empty until
  // it arrives, which is why CardElement hides the line rather than showing a
  // placeholder: a price that appears is better than a skeleton that resolves
  // to nothing for the 2% of cards Cardmarket does not price at all.
  prices:    { type: Map,     default: () => new Map() },
});

const emit = defineEmits(["deleted", "move", "printing-picked", "edit"]);
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
      <!-- Tiles lay out on a real grid rather than a wrapping flex row. The
           flex version sized each tile to a fixed 160px and let the remainder
           fall off the right edge, so every pile ended in a ragged gap the
           width of a card. -->
      <TransitionGroup
        name="card-slide"
        tag="div"
        :class="view === 'grid' ? 'ls-tiles' : 'flex flex-col gap-2'"
      >
        <CardElement
          v-for="card in cards"
          :key="card.id"
          :wish="card"
          :price="prices.get(card.id) ?? null"
          @printing-picked="$emit('printing-picked', $event)"
          :layout="view"
          :class="newCardId === card.id ? 'ls-new' : ''"
          :lists="lists"
          @deleted="emit('deleted', $event)"
          @move="emit('move', $event)"
          @edit="emit('edit', $event)"
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
/* auto-fill, not auto-fit: a pile holding two cards should show two card-sized
   tiles, not two tiles stretched across the whole binder. */
.ls-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 12px;
}
@media (max-width: 420px) {
  .ls-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

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
