<script setup>
import { computed } from "vue";
import { cardImage } from "@/lib/cardImage";

const props = defineProps({
  user: { type: Object, required: true },
});

const emit = defineEmits(["openTrade"]);

const initials = computed(() => {
  const name = props.user.name?.trim();
  if (!name) return "?";
  return name.split(/\s+/).map((p) => p[0]?.toUpperCase() ?? "").slice(0, 2).join("");
});

const location = computed(() => {
  return [props.user.city, props.user.country].filter(Boolean).join(", ");
});

const kindMeta = computed(() => {
  switch (props.user.kind) {
    case "mutual":    return { label: "Mutual match",       color: "#669911", bg: "bg-lime-900/30",  border: "border-lime-600/60" };
    case "they_have": return { label: "Has cards you want", color: "#116699", bg: "bg-blue-900/30",  border: "border-blue-600/60" };
    case "they_want": return { label: "Wants your cards",   color: "#85144B", bg: "bg-pink-900/30",  border: "border-pink-600/60" };
    default:          return { label: "Match",              color: "#444",    bg: "bg-gray-800/30",  border: "border-gray-600/60" };
  }
});
</script>

<template>
  <div
    class="flex flex-col gap-5 rounded-xl border bg-gray-900 p-5 transition-all hover:brightness-110"
    :class="[kindMeta.border]"
    :style="{ borderTopWidth: '3px', borderTopColor: kindMeta.color }"
  >
    <!-- Header -->
    <div class="flex items-center gap-3">
      <div
        class="size-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
        :style="{ backgroundColor: kindMeta.color }"
      >
        {{ initials }}
      </div>
      <div class="flex flex-col grow min-w-0">
        <p class="font-semibold text-sm text-gray-100 truncate">{{ user.name ?? "Anonymous" }}</p>
        <p class="text-xs text-gray-400 truncate" v-if="location">{{ location }}</p>
      </div>
      <span
        class="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
        :class="kindMeta.bg"
        :style="{ color: kindMeta.color }"
      >
        {{ kindMeta.label }}
      </span>
    </div>

    <!-- Counts -->
    <div class="flex gap-3 text-xs">
      <div v-if="user.theyHaveCount > 0" class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-900/30 border border-blue-700/30">
        <v-icon icon="mdi-arrow-down-circle" size="14" color="#6ba3c8" />
        <span class="text-blue-300 font-medium">{{ user.theyHaveCount }} for you</span>
      </div>
      <div v-if="user.theyWantCount > 0" class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pink-900/30 border border-pink-700/30">
        <v-icon icon="mdi-arrow-up-circle" size="14" color="#c8709a" />
        <span class="text-pink-300 font-medium">{{ user.theyWantCount }} from you</span>
      </div>
    </div>

    <!-- They have -->
    <div v-if="user.theyHave.length > 0" class="flex flex-col gap-2.5">
      <p class="text-xs uppercase tracking-wider text-gray-300 font-semibold">They have</p>
      <div class="flex flex-row flex-wrap gap-2">
        <v-tooltip
          v-for="card in user.theyHave"
          :key="`have-${card.image_id}-${card.extension}`"
          :text="`${card.name} · ${card.extension ?? '?'} (${card.condition ?? '?'})`"
          location="top"
        >
          <template #activator="{ props: tip }">
            <img
              v-bind="tip"
              :src="cardImage(card.image_id)"
              :alt="card.name"
              class="h-20 w-14 rounded object-contain bg-gray-800 shrink-0 ring-1 ring-white/20 hover:ring-white/50 transition-all cursor-default"
            />
          </template>
        </v-tooltip>
      </div>
    </div>

    <!-- They want -->
    <div v-if="user.theyWant.length > 0" class="flex flex-col gap-2.5">
      <p class="text-xs uppercase tracking-wider text-gray-300 font-semibold">They want</p>
      <div class="flex flex-row flex-wrap gap-2">
        <v-tooltip
          v-for="card in user.theyWant"
          :key="`want-${card.image_id}-${card.extension}`"
          :text="`${card.name} · ${card.extension ?? '?'}`"
          location="top"
        >
          <template #activator="{ props: tip }">
            <img
              v-bind="tip"
              :src="cardImage(card.image_id)"
              :alt="card.name"
              class="h-20 w-14 rounded object-contain bg-gray-800 shrink-0 opacity-40 ring-1 ring-white/10 hover:opacity-70 transition-all cursor-default"
            />
          </template>
        </v-tooltip>
      </div>
    </div>

    <!-- CTA -->
    <div class="flex justify-end pt-1 border-t border-white/5 mt-auto">
      <v-btn
        size="small"
        variant="flat"
        :style="{ backgroundColor: kindMeta.color, color: 'white' }"
        prepend-icon="mdi-swap-horizontal"
        class="mt-3"
        @click="emit('openTrade', user)"
      >
        Propose trade
      </v-btn>
    </div>
  </div>
</template>
