<script setup>
// Displays a normalized breakdown of a card's effect (cost / effect / downside …).
// Computed at render time from the card's text via the deterministic PSCT parser —
// nothing is precomputed or fetched, so there's no shipped data and it works in SSR
// and the client identically. Renders nothing if the text yields no segments.
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { parseCardText } from "@/lib/psctParser";

const props = defineProps({
  cardId: { type: [String, Number], default: null },
  originalText: { type: String, default: "" },
});
const { t } = useI18n();

const showOriginal = ref(false);

// Accent color per segment label.
const LABEL_COLORS = {
  trigger: "#8b5cf6",
  condition: "#3b82f6",
  cost: "#ef4444",
  target: "#14b8a6",
  effect: "#22c55e",
  restriction: "#f59e0b",
  downside: "#f97316",
};

const data = computed(() => {
  if (!props.originalText) return null;
  const parsed = parseCardText(props.originalText);
  return parsed.effects.length ? parsed : null;
});

function tagText(k, v) {
  if (v === true) return t(`breakdown.tags.${k}`, k);
  if (Array.isArray(v)) return `${t(`breakdown.tags.${k}`, k)}: ${v.join(", ")}`;
  return `${t(`breakdown.tags.${k}`, k)}: ${v}`;
}
</script>

<template>
  <div
    v-if="data"
    class="rounded-lg border overflow-hidden"
    style="border-color: var(--c-border)"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2" style="background: var(--c-surface-2)">
      <span class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-text)">
        {{ t('breakdown.title') }}
      </span>
      <span class="text-[10px] px-2 py-0.5 rounded-full" style="background: rgba(148,163,184,0.18); color: var(--c-muted)">
        {{ t('breakdown.auto') }}
      </span>
    </div>

    <div class="px-4 py-3 flex flex-col gap-3" style="background: var(--c-surface)">
      <!-- Summary -->
      <p v-if="data.summary" class="text-sm italic" style="color: var(--c-muted)">{{ data.summary }}</p>

      <!-- Effect groups -->
      <div class="flex flex-col gap-4">
        <div v-for="(eff, gi) in data.effects" :key="gi" class="flex flex-col gap-2">
          <!-- Group header: box name (Pendulum/Monster) and/or effect number -->
          <div
            v-if="eff.box || data.effects.length > 1"
            class="text-[11px] font-semibold uppercase tracking-wide"
            style="color: var(--c-muted)"
          >
            <span v-if="eff.box">{{ eff.box }}</span>
            <span v-else>{{ t('breakdown.effectN', { n: gi + 1 }) }}</span>
          </div>

          <div
            v-for="(seg, i) in eff.segments"
            :key="i"
            class="flex gap-3 items-start"
          >
            <span
              class="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded shrink-0 mt-0.5"
              :style="{ background: (LABEL_COLORS[seg.label] || '#64748b') + '22', color: LABEL_COLORS[seg.label] || '#64748b', minWidth: '78px', textAlign: 'center' }"
            >{{ t(`breakdown.labels.${seg.label}`, seg.label) }}</span>
            <span class="text-sm leading-snug" style="color: var(--c-text)">{{ seg.text }}</span>
          </div>
        </div>
      </div>

      <!-- Tags -->
      <div v-if="data.tags && Object.keys(data.tags).length" class="flex flex-wrap gap-1.5">
        <span
          v-for="(v, k) in data.tags"
          :key="k"
          class="text-[11px] px-2 py-0.5 rounded-full"
          style="background: rgba(148,163,184,0.15); color: var(--c-muted)"
        >{{ tagText(k, v) }}</span>
      </div>

      <!-- Original text toggle -->
      <div v-if="originalText" class="pt-1">
        <button
          class="text-xs no-underline transition-opacity hover:opacity-70"
          style="color: var(--c-muted); background: none; border: none; cursor: pointer; padding: 0"
          @click="showOriginal = !showOriginal"
        >
          {{ showOriginal ? t('breakdown.hideOriginal') : t('breakdown.showOriginal') }}
        </button>
        <p v-if="showOriginal" class="text-sm leading-relaxed mt-2" style="color: var(--c-text); opacity: 0.8">
          {{ originalText }}
        </p>
      </div>
    </div>
  </div>
</template>
