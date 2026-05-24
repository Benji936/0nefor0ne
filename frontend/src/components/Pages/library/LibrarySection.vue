<script setup>
import AddCard     from "@/components/AddCard.vue";
import CardElement from "@/components/CardElement.vue";

defineProps({
  title:     { type: String,  required: true },
  mode:      { type: String,  required: true }, // 'trade' | 'wish'
  cards:     { type: Array,   default: () => [] },
  loading:   { type: Boolean, default: false },
  newCardId: { type: [String, Number], default: null },
  emptyText: { type: String,  default: "Nothing here yet." },
  ringClass: { type: String,  default: "ring-blue-400" },
});

const emit = defineEmits(["added", "deleted"]);
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-row items-center justify-between">
      <p class="text-left text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">{{ title }}</p>
      <AddCard :mode="mode" @added="emit('added', $event)" />
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
      <TransitionGroup name="card-slide" tag="div" class="grid grid-cols-2 sm:flex sm:flex-wrap gap-3">
        <CardElement
          v-for="card in cards"
          :key="card.id"
          :wish="card"
          :class="newCardId === card.id ? `ring-2 ${ringClass}` : ''"
          @deleted="emit('deleted', $event)"
        />
      </TransitionGroup>
      <div v-if="cards.length === 0" class="flex flex-col items-center gap-3 py-10 text-center">
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
          Search for cards to add
        </router-link>
      </div>
    </template>
  </div>
</template>

<style scoped>
.card-slide-enter-active { transition: all 0.25s ease-out; }
.card-slide-enter-from   { opacity: 0; transform: translateY(-6px); }
</style>
