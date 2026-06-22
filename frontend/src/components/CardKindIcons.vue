<script setup>
import { computed } from "vue";
import { attributeIconFor, propertyIconFor } from "@/lib/cardIcons";

const props = defineProps({
  card: { type: Object, required: true },
  size: { type: Number, default: 20 },
  // Tile overlays set this so only real icons render (no text over the card art).
  iconsOnly: { type: Boolean, default: false },
});

const attribute = computed(() => attributeIconFor(props.card));
const property = computed(() => propertyIconFor(props.card));
const iconStyle = computed(() => ({ width: `${props.size}px`, height: `${props.size}px` }));

// Only render the wrapper when there's something visible — avoids a stray flex gap
// (or an empty tile badge) when icons are absent.
const hasAny = computed(() => {
  const a = attribute.value;
  const p = property.value;
  if (props.iconsOnly) return Boolean(a?.src || p?.src);
  return Boolean((a && (a.src || a.fallbackText)) || (p && (p.src || p.label)));
});
</script>

<template>
  <span v-if="hasAny" class="inline-flex items-center gap-1.5 align-middle">
    <template v-if="attribute">
      <img
        v-if="attribute.src"
        :src="attribute.src"
        :alt="attribute.label"
        :title="attribute.label"
        class="object-contain shrink-0"
        :style="iconStyle"
        loading="lazy"
      />
      <span v-else-if="!iconsOnly && attribute.fallbackText">{{ attribute.fallbackText }}</span>
    </template>

    <template v-if="property">
      <img
        v-if="property.src"
        :src="property.src"
        :alt="property.label"
        :title="property.label"
        class="object-contain shrink-0"
        :style="iconStyle"
        loading="lazy"
      />
      <span v-else-if="!iconsOnly">{{ property.label }}</span>
    </template>
  </span>
</template>
