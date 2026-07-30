<script setup>
// Renders a community link platform's glyph. Most are mdi icons; a few brands
// have no mdi glyph (or it is missing from the bundled font), so they are drawn
// as inline SVGs that inherit the current color.
import { computed } from "vue";
import { platformMeta } from "@/lib/communityLinks";

const props = defineProps({
  platform: { type: String, required: true },
  size: { type: [Number, String], default: 16 },
});

// Custom brand paths (24x24, single filled path) for platforms not covered by
// the mdi webfont.
const SVG_PATHS = {
  tiktok:
    "M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.02v12.17a2.45 2.45 0 0 1-2.44 2.35 2.45 2.45 0 0 1-2.45-2.45 2.45 2.45 0 0 1 3.03-2.38V9.62a5.7 5.7 0 0 0-.58-.03 5.5 5.5 0 0 0-5.5 5.5 5.5 5.5 0 0 0 5.5 5.5 5.5 5.5 0 0 0 5.5-5.5V8.9a7.28 7.28 0 0 0 4.25 1.36V7.23a4.26 4.26 0 0 1-3.23-1.41z",
  discord:
    "M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05a19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .09-.03c.46-.63.87-1.29 1.23-1.99.02-.04 0-.09-.05-.11-.65-.25-1.27-.55-1.87-.89-.05-.03-.05-.1-.01-.13.13-.09.25-.19.37-.29a.08.08 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.08.08 0 0 1 .09.01c.12.1.24.2.37.29.05.04.04.11-.01.13-.6.35-1.22.64-1.87.89-.05.02-.07.07-.05.11.37.7.78 1.36 1.23 1.99a.08.08 0 0 0 .09.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.05c.44-4.53-.73-8.46-3.1-11.95a.06.06 0 0 0-.03-.02zM9.75 14.65c-1.18 0-2.16-1.08-2.16-2.42s.95-2.42 2.16-2.42c1.21 0 2.18 1.09 2.16 2.42 0 1.33-.95 2.42-2.16 2.42zm4.52 0c-1.18 0-2.16-1.08-2.16-2.42s.95-2.42 2.16-2.42c1.21 0 2.18 1.09 2.16 2.42 0 1.33-.94 2.42-2.16 2.42z",
};

const meta = computed(() => platformMeta(props.platform));
const svgPath = computed(() => SVG_PATHS[meta.value.icon] ?? null);
</script>

<template>
  <svg
    v-if="svgPath"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    class="cpi-svg"
  >
    <path :d="svgPath" />
  </svg>
  <v-icon v-else :icon="meta.icon" :size="size" />
</template>

<style scoped>
.cpi-svg { display: inline-block; vertical-align: middle; }
</style>
