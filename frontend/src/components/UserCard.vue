<script setup>
import { computed } from "vue";
import { cardImage } from "@/lib/cardImage";

const props = defineProps({
  // A MatchedUser from src/lib/matches.js
  user: { type: Object, required: true },
});

const emit = defineEmits(["openTrade"]);

// Initials for the avatar circle when there's no avatar image.
const initials = computed(() => {
  const name = props.user.name?.trim();
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
});

const location = computed(() => {
  const parts = [props.user.city, props.user.country].filter(Boolean);
  return parts.join(", ");
});

// Rendered tag color depends on the match kind.
const kindMeta = computed(() => {
  switch (props.user.kind) {
    case "mutual":
      return { label: "Mutual match", color: "#669911" };
    case "they_have":
      return { label: "Has cards you want", color: "#116699" };
    case "they_want":
      return { label: "Wants cards you have", color: "#85144B" };
    default:
      return { label: "Match", color: "#444" };
  }
});
</script>

<template>
  <v-card
    class="pa-4 d-flex flex-col gap-3 bg-gray-200 text-gray-900"
    :style="{ borderTop: `3px solid ${kindMeta.color}` }"
    elevation="2"
  >
    <!-- Header: avatar + name + location + match kind -->
    <div class="flex flex-row gap-3 items-center">
      <div
        class="rounded-full size-12 flex items-center justify-center text-white font-bold text-lg shrink-0"
        :style="{ backgroundColor: kindMeta.color }"
      >
        {{ initials }}
      </div>
      <div class="flex flex-col grow min-w-0">
        <p class="font-bold text-base text-gray-900 truncate">{{ user.name ?? "Anonymous" }}</p>
        <p class="text-xs text-gray-600 truncate" v-if="location">{{ location }}</p>
      </div>
      <v-chip
        size="small"
        variant="flat"
        :style="{ backgroundColor: kindMeta.color, color: 'white' }"
      >
        {{ kindMeta.label }}
      </v-chip>
    </div>

    <!-- Counts row -->
    <div class="flex flex-row gap-4 text-sm">
      <div v-if="user.theyHaveCount > 0">
        <span class="text-gray-700">Has for you:</span>
        <span class="font-bold ml-1 text-gray-900">{{ user.theyHaveCount }}</span>
      </div>
      <div v-if="user.theyWantCount > 0">
        <span class="text-gray-700">Wants from you:</span>
        <span class="font-bold ml-1 text-gray-900">{{ user.theyWantCount }}</span>
      </div>
    </div>

    <!-- Card thumbnails. Yu-Gi-Oh cards are ~2:3 portrait, so we use the
         same aspect (w-14 h-20) and object-contain to avoid cropping. -->
    <div v-if="user.theyHave.length > 0" class="flex flex-col gap-1">
      <p class="text-xs uppercase text-gray-700 tracking-wide font-semibold">They have</p>
      <div class="flex flex-row flex-wrap gap-1">
        <v-tooltip
          v-for="card in user.theyHave"
          :key="`have-${card.image_id}-${card.extension}`"
          :text="`${card.name} — ${card.extension ?? '?'} (${card.condition ?? '?'})`"
          location="top"
        >
          <template v-slot:activator="{ props: tipProps }">
            <img
              v-bind="tipProps"
              :src="cardImage(card.image_id)"
              :alt="card.name"
              class="h-20 w-14 rounded-sm object-contain bg-gray-50 shrink-0"
            />
          </template>
        </v-tooltip>
      </div>
    </div>

    <div v-if="user.theyWant.length > 0" class="flex flex-col gap-1">
      <p class="text-xs uppercase text-gray-700 tracking-wide font-semibold">They want</p>
      <div class="flex flex-row flex-wrap gap-1">
        <v-tooltip
          v-for="card in user.theyWant"
          :key="`want-${card.image_id}-${card.extension}`"
          :text="`${card.name} — ${card.extension ?? '?'} (${card.condition ?? '?'})`"
          location="top"
        >
          <template v-slot:activator="{ props: tipProps }">
            <img
              v-bind="tipProps"
              :src="cardImage(card.image_id)"
              :alt="card.name"
              class="h-20 w-14 rounded-sm object-contain bg-gray-50 opacity-70 shrink-0"
            />
          </template>
        </v-tooltip>
      </div>
    </div>

    <!-- CTA -->
    <div class="flex flex-row justify-end pt-1">
      <v-btn
        size="small"
        variant="flat"
        :style="{ backgroundColor: kindMeta.color, color: 'white' }"
        prepend-icon="mdi-swap-horizontal"
        @click="emit('openTrade', user)"
      >
        Propose trade
      </v-btn>
    </div>
  </v-card>
</template>
