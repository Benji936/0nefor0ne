<script setup>
// Forbidden/Limited list status indicator, shared across the result tile
// (overlay), the hover preview and the card page (chip) so they always agree.
// Renders nothing when the card is unlimited in the requested format.
//
//   variant="overlay" — compact colored circle showing the max playable count
//                       (0/1/2). Meant to sit over card art (top-left corner).
//   variant="chip"    — labeled pill (colored dot + "Forbidden"/… text). Shows
//                       the TCG/OCG prefix when `show-format` is set.
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { banlistStatusFor, ensureBanlistManifest } from "@/lib/banlist";

const props = defineProps({
  card: { type: Object, default: null },
  format: { type: String, default: "tcg" }, // "tcg" | "ocg"
  variant: { type: String, default: "overlay" }, // "overlay" | "chip"
  showFormat: { type: Boolean, default: false },
});

const { t } = useI18n();

// Ensures the Yugipedia manifest is fetched even when no badge is initially
// visible (a card unlimited in YGOPRODeck's data but restricted on the current
// list won't render until the manifest arrives, then this computed re-evaluates).
onMounted(ensureBanlistManifest);

const status = computed(() => banlistStatusFor(props.card, props.format));
const label = computed(() => (status.value ? t(`banlist.${status.value.key}`) : ""));
// Full title for the compact overlay (which only shows a number): "Forbidden (TCG)".
const title = computed(() =>
  status.value ? `${label.value} (${status.value.format})` : ""
);
</script>

<template>
  <span
    v-if="status"
    class="cbb"
    :class="[`cbb--${status.key}`, `cbb--${variant}`]"
    :title="variant === 'overlay' ? title : undefined"
  >
    <template v-if="variant === 'overlay'">
      <!-- Forbidden gets a prohibition mark (🚫) rather than a "0", which reads
           better as "banned" than a count of zero. Limited/Semi keep their number. -->
      <svg v-if="status.key === 'forbidden'" class="cbb-ban" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2.6" />
        <line x1="6.8" y1="6.8" x2="17.2" y2="17.2" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
      </svg>
      <template v-else>{{ status.copies }}</template>
    </template>
    <template v-else>
      <span class="cbb-dot" />
      <span>{{ showFormat ? `${status.format} · ${label}` : label }}</span>
    </template>
  </span>
</template>

<style scoped>
.cbb {
  --cbb-color: #ef4444;
  display: inline-flex;
  align-items: center;
  font-weight: 800;
  line-height: 1;
}
.cbb--forbidden   { --cbb-color: #ef4444; } /* red */
.cbb--limited     { --cbb-color: #f59e0b; } /* amber */
.cbb--semiLimited { --cbb-color: #eab308; } /* yellow */

/* Overlay: a small solid circle with the copy count, sized to match the kind
   icons that sit in the opposite corner of the tile. */
.cbb--overlay {
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--cbb-color);
  color: #fff;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.55);
}

/* Chip: colored dot + label, matching the app's other small status pills. */
.cbb--chip {
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 0.02em;
  color: var(--cbb-color);
  background: color-mix(in srgb, var(--cbb-color) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--cbb-color) 40%, transparent);
}
.cbb-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--cbb-color);
}
/* The white prohibition mark sits on the red disc → reads as a "no/banned" sign. */
.cbb-ban {
  display: block;
  width: 13px;
  height: 13px;
  color: #fff;
}
</style>
