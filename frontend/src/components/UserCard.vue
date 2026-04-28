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
    case "mutual":
      return {
        label: "Mutual match",
        color: "var(--c-mutual)",
        glow: "rgba(102,153,17,0.3)",
        bg: "bg-lime-900/25",
        border: "border-lime-500/30",
      };
    case "they_have":
      return {
        label: "Has cards you want",
        color: "var(--c-trade)",
        glow: "rgba(17,102,153,0.3)",
        bg: "bg-blue-900/25",
        border: "border-blue-500/30",
      };
    case "they_want":
      return {
        label: "Wants your cards",
        color: "var(--c-accent)",
        glow: "rgba(133,20,75,0.3)",
        bg: "bg-pink-900/25",
        border: "border-pink-500/30",
      };
    default:
      return {
        label: "Match",
        color: "#555",
        glow: "rgba(85,85,85,0.3)",
        bg: "bg-gray-800/25",
        border: "border-gray-500/30",
      };
  }
});
</script>

<template>
  <div
    class="user-card group relative flex flex-col gap-3 rounded-2xl border overflow-hidden"
    style="background-color: var(--c-surface)"
    :class="[kindMeta.border]"
    :style="{ '--kind-glow': kindMeta.glow }"
  >
    <!-- Top gradient accent bar -->
    <div
      class="h-[3px] w-full shrink-0"
      :style="{ background: `linear-gradient(90deg, transparent 5%, ${kindMeta.color} 50%, transparent 95%)` }"
    />

    <div class="flex flex-col gap-4 p-4">
      <!-- Header: Avatar + Name + Badge -->
      <div class="flex items-center gap-3">
        <!-- Avatar with hover glow -->
        <div class="relative shrink-0">
          <div
            class="absolute -inset-1 rounded-full blur-md opacity-0 transition-opacity duration-300 group-hover:opacity-50"
            :style="{ backgroundColor: kindMeta.color }"
          />
          <div
            class="relative size-11 rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-white/10 group-hover:ring-white/20 transition-all duration-300"
            :style="{ backgroundColor: kindMeta.color }"
          >
            {{ initials }}
          </div>
        </div>

        <div class="flex flex-col grow min-w-0">
          <p class="font-semibold text-[15px] text-gray-50 truncate leading-tight">
            {{ user.name ?? "Anonymous" }}
          </p>
          <p class="text-xs text-gray-400 truncate mt-0.5 flex items-center gap-1" v-if="location">
            <v-icon icon="mdi-map-marker-outline" size="11" class="opacity-50" />
            {{ location }}
          </p>
        </div>

        <!-- Kind badge -->
        <span
          class="text-[11px] font-semibold px-2 py-1 rounded-lg shrink-0 border"
          :class="[kindMeta.bg, kindMeta.border]"
          :style="{ color: kindMeta.color }"
        >
          {{ kindMeta.label }}
        </span>
      </div>

      <!-- Count pills -->
      <div class="flex gap-2.5 text-xs">
        <div
          v-if="user.theyHaveCount > 0"
          class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20"
        >
          <v-icon icon="mdi-arrow-down-bold" size="13" color="#5b9bd5" />
          <span class="text-blue-300 font-semibold">{{ user.theyHaveCount }} for you</span>
        </div>
        <div
          v-if="user.theyWantCount > 0"
          class="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-pink-500/10 border border-pink-500/20"
        >
          <v-icon icon="mdi-arrow-up-bold" size="13" color="#d06b94" />
          <span class="text-pink-300 font-semibold">{{ user.theyWantCount }} from you</span>
        </div>
      </div>

      <!-- They have -->
      <div v-if="user.theyHave.length > 0" class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <div class="h-px grow bg-gradient-to-r from-blue-500/30 to-transparent" />
          <p class="text-[11px] uppercase tracking-widest text-blue-400/70 font-bold shrink-0">They have</p>
          <div class="h-px grow bg-gradient-to-l from-blue-500/30 to-transparent" />
        </div>
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
                class="card-thumb h-[84px] w-[58px] object-contain shrink-0 ring-1 ring-white/10 hover:ring-blue-400/50 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/20 cursor-pointer"
                style="background-color: var(--c-surface-2)"
              />
            </template>
          </v-tooltip>
        </div>
      </div>

      <!-- They want -->
      <div v-if="user.theyWant.length > 0" class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <div class="h-px grow bg-gradient-to-r from-pink-500/25 to-transparent" />
          <p class="text-[11px] uppercase tracking-widest text-pink-400/60 font-bold shrink-0">They want</p>
          <div class="h-px grow bg-gradient-to-l from-pink-500/25 to-transparent" />
        </div>
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
                class="card-thumb h-[84px] w-[58px] object-contain shrink-0 ring-1 ring-white/5 hover:opacity-75 hover:ring-pink-400/40 hover:scale-105 cursor-pointer"
                style="background-color: var(--c-surface-2)"
              />
            </template>
          </v-tooltip>
        </div>
      </div>
    </div>

    <!-- CTA Footer -->
    <div class="mt-auto pb-4 pt-1">
      <v-btn
        block
        variant="flat"
        :style="{ backgroundColor: kindMeta.color, color: 'white' }"
        prepend-icon="mdi-swap-horizontal"
        class="!rounded-xl"
        @click="emit('openTrade', user)"
      >
        Propose trade
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.user-card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  padding: 20px;
}
.user-card:hover {
  box-shadow: 0 12px 40px var(--kind-glow), 0 2px 8px rgba(0, 0, 0, 0.3);
  transform: translateY(-3px);
}
.card-thumb {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
</style>
