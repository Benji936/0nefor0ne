<script setup>
const props = defineProps({
  tooltip: { type: String, required: true },
  // Pass either icon (mdi) or imgSrc (svg file), not both
  icon: { type: String, default: null },
  imgSrc: { type: String, default: null },
  active: { type: Boolean, default: false },
  iconColor: { type: String, default: "var(--c-accent)" },
  indicator: { type: Boolean, default: true },
});

const emit = defineEmits(["click"]);
</script>

<template>
  <v-tooltip location="top" :text="tooltip">
    <template #activator="{ props: tip }">
      <div
        v-bind="tip"
        class="nav-item flex flex-col items-center gap-1 cursor-pointer px-2 py-1 rounded-md transition-all"
        :style="active ? { backgroundColor: 'var(--c-surface-2)' } : {}"
        @click="emit('click')"
      >
        <v-icon v-if="icon" :icon="icon" size="24" :style="{ color: iconColor }" />
        <img v-else-if="imgSrc" :src="imgSrc" class="nav-icon size-6" alt="" />

        <div
          v-if="indicator"
          class="h-0.5 w-4 rounded-full transition-all"
          :style="active ? { backgroundColor: 'var(--c-accent)' } : { backgroundColor: 'transparent' }"
        />
      </div>
    </template>
  </v-tooltip>
</template>

<style scoped>
.nav-item:hover {
  background-color: var(--c-surface-2);
}

.nav-icon {
  transition: filter 0.3s ease;
}

html:not(.dark) .nav-icon {
  filter: brightness(0) saturate(0%);
}
</style>
