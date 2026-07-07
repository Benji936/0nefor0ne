<script setup>
// Floating wrapper that positions the shared CardInfoPanel beside whatever card
// thumbnail the cursor rests on. Mounted once (in App.vue); fed by the
// cardHoverPreview store, which a global listener drives.
import { ref, watch, nextTick, onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import CardInfoPanel from "@/components/ui/card/CardInfoPanel.vue";
import { hoverState, installCardHoverPreview } from "@/lib/cardHoverPreview";

const route = useRoute();

const PANEL_W = 340;
const GAP = 14;

const panel = ref(null);
const pos = ref({ left: 0, top: 0 });
const card = computed(() => hoverState.card);

/** Anchor beside the card: right by default, flipping left / clamping at edges.
 *  Re-measured after each content change since the panel height varies with text. */
function reposition() {
  const rect = hoverState.rect;
  if (!rect) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = rect.right + GAP;
  if (left + PANEL_W > vw - 8) left = rect.left - GAP - PANEL_W; // flip left
  left = Math.max(8, Math.min(left, vw - PANEL_W - 8));
  const h = panel.value?.offsetHeight || 360;
  let top = rect.top + rect.height / 2 - h / 2;
  top = Math.max(8, Math.min(top, vh - h - 8));
  pos.value = { left: Math.round(left), top: Math.round(top) };
}

watch(
  () => [hoverState.visible, hoverState.rect, hoverState.card],
  async () => {
    if (!hoverState.visible) return;
    await nextTick();
    reposition();
  },
  { deep: true }
);

onMounted(() => {
  installCardHoverPreview(() => route.params.locale || "en");
});
</script>

<template>
  <teleport to="body">
    <div
      v-if="hoverState.visible && hoverState.id"
      ref="panel"
      class="chp"
      :style="{ left: pos.left + 'px', top: pos.top + 'px', width: PANEL_W + 'px' }"
      aria-hidden="true"
    >
      <CardInfoPanel :card="card" :image-id="hoverState.id" clamp-desc cropped />
    </div>
  </teleport>
</template>

<style scoped>
.chp {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  animation: chp-in 0.13s ease both;
}
@keyframes chp-in {
  from { opacity: 0; transform: scale(0.97); }
  to { opacity: 1; transform: scale(1); }
}
</style>
