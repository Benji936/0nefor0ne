<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  timer: { type: Object, required: true },
});
defineEmits(['start', 'pause', 'reset']);

// Local tick just to re-render the running clock; the shared truth is
// startedAt + baseElapsedMs from the server.
const now = ref(Date.now());
let interval = null;
onMounted(() => {
  interval = setInterval(() => (now.value = Date.now()), 250);
});
onUnmounted(() => clearInterval(interval));

const elapsedMs = computed(() => {
  const t = props.timer || {};
  const base = t.baseElapsedMs || 0;
  return base + (t.running && t.startedAt ? now.value - t.startedAt : 0);
});

const label = computed(() => {
  const total = Math.floor(elapsedMs.value / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
});
</script>

<template>
  <section class="timer">
    <div class="clock" :class="{ running: timer.running }">{{ label }}</div>
    <div class="tcontrols">
      <button v-if="!timer.running" class="btn" type="button" @click="$emit('start')">Start</button>
      <button v-else class="btn" type="button" @click="$emit('pause')">Pause</button>
      <button class="btn" type="button" @click="$emit('reset')">Reset</button>
    </div>
  </section>
</template>
