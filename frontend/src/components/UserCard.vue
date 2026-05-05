<script setup>
import { computed } from "vue";
import { cardImage } from "@/lib/cardImage";

const props = defineProps({
  user: { type: Object, required: true },
});

const emit = defineEmits(["openTrade", "openProfile"]);

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
        label: "Mutual",
        color: "var(--c-mutual)",
        glow: "rgba(132,204,22,0.22)",
        bg: "color-mix(in srgb, var(--c-mutual) 4%, transparent)",
        borderColor: "color-mix(in srgb, var(--c-mutual) 28%, transparent)",
        btnText: "#0C0820",
      };
    case "they_have":
      return {
        label: "Has your wants",
        color: "var(--c-trade)",
        glow: "rgba(144,102,255,0.22)",
        bg: "color-mix(in srgb, var(--c-trade) 4%, transparent)",
        borderColor: "color-mix(in srgb, var(--c-trade) 28%, transparent)",
        btnText: "white",
      };
    case "they_want":
      return {
        label: "Wants yours",
        color: "var(--c-accent)",
        glow: "rgba(240,72,122,0.22)",
        bg: "color-mix(in srgb, var(--c-accent) 4%, transparent)",
        borderColor: "color-mix(in srgb, var(--c-accent) 28%, transparent)",
        btnText: "white",
      };
    default:
      return {
        label: "Match",
        color: "var(--c-muted)",
        glow: "rgba(167,139,250,0.18)",
        bg: "color-mix(in srgb, var(--c-muted) 4%, transparent)",
        borderColor: "color-mix(in srgb, var(--c-muted) 20%, transparent)",
        btnText: "white",
      };
  }
});
</script>

<template>
  <!--
    Trade-opportunity tile. The two-sided body mirrors the propose dialog:
    left = they have (amethyst), right = they want (pink).
    The entire card fires openTrade; the Propose button stops propagation.
  -->
  <div
    class="user-card group relative flex flex-col rounded-2xl border overflow-hidden cursor-pointer"
    :style="{
      '--kind-glow': kindMeta.glow,
      backgroundColor: kindMeta.bg,
      borderColor: kindMeta.borderColor,
    }"
    @click="emit('openTrade', user)"
  >
    <!-- Top gradient accent bar (edge-to-edge) -->
    <div
      class="h-[3px] w-full shrink-0"
      :style="{ background: `linear-gradient(90deg, transparent 5%, ${kindMeta.color} 50%, transparent 95%)` }"
    />

    <!-- Header: avatar · name · location · kind badge -->
    <div class="flex items-center gap-3 px-4 pt-3 pb-2">
      <!-- Avatar — clicking opens profile -->
      <div
        class="relative shrink-0 cursor-pointer"
        title="View profile"
        @click.stop="emit('openProfile', user.id)"
      >
        <div
          class="absolute -inset-1 rounded-full blur-md opacity-0 transition-opacity duration-300 group-hover:opacity-40"
          :style="{ backgroundColor: kindMeta.color }"
        />
        <div
          class="relative size-9 rounded-full flex items-center justify-center font-bold text-xs ring-1 ring-white/10 overflow-hidden"
          :style="{ backgroundColor: kindMeta.color, color: kindMeta.btnText }"
        >
          <img
            v-if="user.avatarUrl"
            :src="user.avatarUrl"
            :alt="user.name ?? 'Avatar'"
            class="w-full h-full object-cover"
          />
          <span v-else>{{ initials }}</span>
        </div>
      </div>

      <!-- Name + location — clicking opens profile -->
      <div
        class="flex flex-col grow min-w-0 cursor-pointer"
        @click.stop="emit('openProfile', user.id)"
      >
        <p class="font-bold text-sm truncate leading-tight hover:underline underline-offset-2" style="color: var(--c-text)">
          {{ user.name ?? "Anonymous" }}
        </p>
        <p v-if="location" class="text-[11px] truncate flex items-center gap-1 mt-0.5" style="color: var(--c-muted)">
          <v-icon icon="mdi-map-marker-outline" size="10" style="opacity: 0.55" />
          {{ location }}
        </p>
      </div>

      <span
        class="text-[10px] font-bold px-2 py-0.5 rounded-lg border shrink-0 uppercase tracking-wide"
        :style="{
          color: kindMeta.color,
          backgroundColor: `color-mix(in srgb, ${kindMeta.color} 12%, transparent)`,
          borderColor: kindMeta.borderColor,
        }"
      >{{ kindMeta.label }}</span>
    </div>

    <!-- Two-sided card body -->
    <div
      class="flex mx-4 mb-3 rounded-lg overflow-hidden"
      style="border-color: var(--c-border); min-height: 96px"
    >
      <!-- They have (amethyst) -->
      <div
        class="flex flex-col gap-2 flex-1 px-3 py-3 min-w-0"
        style="background: color-mix(in srgb, var(--c-trade) 6%, transparent)"
      >
        <div class="flex items-center gap-1">
          <v-icon icon="mdi-arrow-down-bold" size="10" color="var(--c-trade)" />
          <span class="text-[10px] font-bold uppercase tracking-wider" style="color: var(--c-trade)">They have</span>
          <span v-if="user.theyHaveCount > 0" class="text-[10px] font-bold ml-auto tabular-nums" style="color: var(--c-trade)">{{ user.theyHaveCount }}</span>
        </div>
        <div v-if="user.theyHave.length > 0" class="flex flex-wrap gap-1">
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
                class="card-thumb rounded object-contain shrink-0"
                style="height: 60px; width: 43px; background-color: var(--c-surface-2)"
                loading="lazy"
              />
            </template>
          </v-tooltip>
        </div>
        <p v-else class="text-[11px] italic my-auto" style="color: var(--c-muted)">None</p>
      </div>

      <!-- Hairline divider -->
      <div class="w-px shrink-0 self-stretch" style="background: var(--c-border)" />

      <!-- They want (pink) -->
      <div
        class="flex flex-col gap-2 flex-1 px-3 py-3 min-w-0"
        style="background: color-mix(in srgb, var(--c-accent) 6%, transparent)"
      >
        <div class="flex items-center gap-1">
          <v-icon icon="mdi-arrow-up-bold" size="10" color="var(--c-accent)" />
          <span class="text-[10px] font-bold uppercase tracking-wider" style="color: var(--c-accent)">They want</span>
          <span v-if="user.theyWantCount > 0" class="text-[10px] font-bold ml-auto tabular-nums" style="color: var(--c-accent)">{{ user.theyWantCount }}</span>
        </div>
        <div v-if="user.theyWant.length > 0" class="flex flex-wrap gap-1">
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
                class="card-thumb rounded object-contain shrink-0"
                style="height: 60px; width: 43px; background-color: var(--c-surface-2); opacity: 0.85"
                loading="lazy"
              />
            </template>
          </v-tooltip>
        </div>
        <p v-else class="text-[11px] italic my-auto" style="color: var(--c-muted)">None</p>
      </div>
    </div>

    <!-- Footer: count pills · Propose CTA -->
    <div class="flex items-center gap-2 px-4 pb-4">
      <div class="flex gap-1.5 grow flex-wrap">
        <span
          v-if="user.theyHaveCount > 0"
          class="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums"
          style="background: color-mix(in srgb, var(--c-trade) 12%, transparent); color: var(--c-trade)"
        >
          <v-icon icon="mdi-arrow-down-bold" size="11" />{{ user.theyHaveCount }}
        </span>
        <span
          v-if="user.theyWantCount > 0"
          class="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums"
          style="background: color-mix(in srgb, var(--c-accent) 12%, transparent); color: var(--c-accent)"
        >
          <v-icon icon="mdi-arrow-up-bold" size="11" />{{ user.theyWantCount }}
        </span>
      </div>
      <v-btn
        size="small"
        variant="flat"
        prepend-icon="mdi-swap-horizontal"
        class="!rounded-lg shrink-0"
        :style="{ backgroundColor: kindMeta.color, color: kindMeta.btnText }"
        @click.stop="emit('openTrade', user)"
      >Propose</v-btn>
    </div>
  </div>
</template>

<style scoped>
.user-card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28);
  transition: box-shadow 0.28s cubic-bezier(0.22, 1, 0.36, 1),
              transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
              border-color 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
.user-card:hover {
  box-shadow: 0 14px 44px var(--kind-glow), 0 2px 10px rgba(0, 0, 0, 0.32);
  transform: translateY(-3px);
}
.card-thumb {
  will-change: transform;
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
              box-shadow 0.18s cubic-bezier(0.22, 1, 0.36, 1),
              opacity 0.18s ease-out;
  outline: 1px solid rgba(255, 255, 255, 0.08);
  outline-offset: 0px;
}
.card-thumb:hover {
  transform: translateY(-2px) scale(1.08);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  opacity: 1 !important;
  outline-color: rgba(255, 255, 255, 0.22);
}
</style>
