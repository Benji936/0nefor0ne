<script setup>
// The glyph that visually distinguishes the three community kinds. Store and
// group use mdi glyphs; discord has no bundled mdi glyph, so it reuses the
// inline-SVG brand mark from PlatformIcon.
import PlatformIcon from "@/components/community/PlatformIcon.vue";

const KIND_ICON = {
  store: "mdi-storefront-outline",
  group: "mdi-account-group-outline",
};

defineProps({
  kind: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
});
</script>

<template>
  <PlatformIcon v-if="kind === 'discord'" platform="discord" :size="size" />
  <v-icon v-else :icon="KIND_ICON[kind] || 'mdi-account-group-outline'" :size="size" />
</template>
