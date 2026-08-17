<script setup>
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import ProposalRow from "@/components/trade/ProposalRow.vue";
import { PROPOSAL_FILTERS, splitHistory, resolveFilter } from "@/lib/proposalFilters";

const { t } = useI18n();

const props = defineProps({
  login:           { type: Object,  default: null },
  loading:         { type: Boolean, default: false },
  incomingPending: { type: Array,   default: () => [] },
  outgoingPending: { type: Array,   default: () => [] },
  acceptedTrades:  { type: Array,   default: () => [] },
  history:         { type: Array,   default: () => [] },
  currentUserId:   { type: String,  default: null },
});

// accept / decline / counter moved to the trade page, which performs them
// itself; ProposalRow no longer emits them for this tab to forward.
const emit = defineEmits(["cancel", "complete", "edit", "openProfile"]);

// One group at a time. The old "All" chip was the default, so it was the only
// filter most people ever used and the other four were labels on top of a list
// you still scrolled. See lib/proposalFilters.js for what replaced it.
const activeFilter = ref(null);

const done      = computed(() => splitHistory(props.history).done);
const cancelled = computed(() => splitHistory(props.history).cancelled);

const total = computed(() =>
  props.incomingPending.length + props.outgoingPending.length + props.acceptedTrades.length + props.history.length
);

const counts = computed(() => ({
  incoming:  props.incomingPending.length,
  outgoing:  props.outgoingPending.length,
  accepted:  props.acceptedTrades.length,
  done:      done.value.length,
  cancelled: cancelled.value.length,
}));

const meta = {
  incoming:  { color: "var(--c-mutual)", mix: 14 },
  outgoing:  { color: "var(--c-trade)",  mix: 14 },
  accepted:  { color: "var(--c-accent)", mix: 14 },
  done:      { color: "var(--c-mutual)", mix: 10 },
  cancelled: { color: "var(--c-muted)",  mix: 10 },
};

const filters = computed(() => PROPOSAL_FILTERS.map(key => ({
  key,
  label: t(`proposals.${key}`),
  count: counts.value[key],
  color: meta[key].color,
  bg: `color-mix(in srgb, ${meta[key].color} ${meta[key].mix}%, transparent)`,
})));

// Picks the opening group, and hands over when the one on screen empties —
// with no "All" to fall back on, an emptied filter would otherwise be a blank
// page under a chip reading 0.
watch(counts, (c) => { activeFilter.value = resolveFilter(c, activeFilter.value); },
  { immediate: true, deep: true });

const show = (key) => activeFilter.value === key;

// Filtered rather than v-show'd. These two share one v-for, and `v-if` on a
// v-for element cannot see the loop variable in Vue 3, so v-show was the only
// per-item switch available — and it mounts every hidden row. A trader with a
// long history would have paid for a second list they were not looking at.
const historyGroups = computed(() => [
  { key: "done",      rows: done.value,      color: "var(--c-mutual)", desc: t("proposals.doneDesc") },
  { key: "cancelled", rows: cancelled.value, color: "var(--c-muted)",  desc: t("proposals.cancelledDesc") },
].filter(g => show(g.key) && g.rows.length > 0));
</script>

<template>
  <!-- Not logged in -->
  <div v-if="!login" class="flex flex-col items-center gap-3 py-16 text-center">
    <v-icon icon="mdi-lock-outline" size="36" color="var(--c-muted)" />
    <p class="text-sm" style="color: var(--c-muted)">{{ t('proposals.loginRequired') }}</p>
  </div>

  <!-- Skeleton -->
  <template v-else-if="loading">
    <div class="flex flex-col gap-3">
      <div
        v-for="i in 3" :key="i"
        class="rounded-xl border overflow-hidden"
        :style="{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)', opacity: 1 - (i - 1) * 0.2 }"
      >
        <div class="flex items-center gap-3 px-4 py-3">
          <div class="size-8 rounded-full shrink-0 animate-pulse" style="background: var(--c-skeleton)" />
          <div class="flex flex-col gap-2 grow">
            <div class="h-4 rounded animate-pulse" style="background: var(--c-skeleton); width: 42%" />
            <div class="h-3 rounded animate-pulse" style="background: var(--c-skeleton); width: 28%" />
          </div>
          <div class="h-6 w-20 rounded-lg shrink-0 animate-pulse" style="background: var(--c-skeleton)" />
        </div>
        <div class="h-20 animate-pulse" style="background: var(--c-skeleton); border-top: 1px solid var(--c-border)" />
      </div>
    </div>
  </template>

  <!-- Empty state -->
  <div
    v-else-if="total === 0"
    class="flex flex-col items-center gap-3 py-16 text-center"
  >
    <div
      class="size-14 rounded-2xl flex items-center justify-center mb-1"
      style="background: color-mix(in srgb, var(--c-muted) 12%, transparent)"
    >
      <v-icon icon="mdi-swap-horizontal" size="28" color="var(--c-muted)" />
    </div>
    <p class="text-base font-semibold" style="color: var(--c-text)">{{ t('proposals.noProposalsTitle') }}</p>
    <p class="text-sm max-w-xs leading-relaxed" style="color: var(--c-muted)">{{ t('proposals.noProposalsDesc') }}</p>
  </div>

  <!-- Proposals -->
  <template v-else>

    <!-- Filter chips -->
    <div class="flex flex-wrap gap-5 pt-1 pb-1">
      <button
        v-for="f in filters"
        :key="f.key"
        class="group flex items-center gap-3 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 whitespace-nowrap"
        :class="f.count === 0 ? 'opacity-30 cursor-default pointer-events-none' : 'cursor-pointer'"
        :style="activeFilter === f.key
          ? { background: f.bg, color: f.color, boxShadow: `0 0 0 1.5px ${f.color}, 0 0 12px color-mix(in srgb, ${f.color} 20%, transparent)` }
          : { background: 'var(--c-surface-2)', color: 'var(--c-muted)', boxShadow: '0 0 0 1px var(--c-border)' }"
        :disabled="f.count === 0"
        :aria-pressed="String(activeFilter === f.key)"
        @click="activeFilter = f.key"
      >
        <span
          class="size-1.5 rounded-full shrink-0 transition-opacity duration-200"
          :style="{ background: f.color, opacity: activeFilter === f.key ? 1 : 0.5 }"
        />
        {{ f.label }}
        <span
          class="tabular-nums text-[10px] font-bold px-2 py-1 rounded-full transition-all duration-200"
          :style="activeFilter === f.key
            ? { background: `color-mix(in srgb, ${f.color} 22%, transparent)`, color: f.color }
            : { background: 'var(--c-border)', color: 'var(--c-muted)' }"
        >{{ f.count }}</span>
      </button>
    </div>

    <!-- Sections -->
    <section v-if="show('incoming') && incomingPending.length > 0" class="flex flex-col gap-4">
      <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
        <div class="size-2 rounded-full shrink-0" style="background: var(--c-mutual)" />
        <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-text)">{{ t('proposals.incoming') }}</h2>
        <span class="text-[11px] font-bold px-2 py-1 rounded-md tabular-nums" style="background: color-mix(in srgb, var(--c-mutual) 15%, transparent); color: var(--c-mutual)">{{ incomingPending.length }}</span>
      </div>
      <p class="text-xs -mt-2" style="color: var(--c-muted)">{{ t('proposals.incomingDesc') }}</p>
      <div class="flex flex-col gap-10">
        <ProposalRow
          v-for="p in incomingPending" :key="p.id"
          :proposal="p" :current-user-id="currentUserId" @cancel="emit('cancel', p)"
          @complete="emit('complete', p)" @openProfile="emit('openProfile', $event)"
        />
      </div>
    </section>

    <section v-if="show('outgoing') && outgoingPending.length > 0" class="flex flex-col gap-4">
      <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
        <div class="size-2 rounded-full shrink-0" style="background: var(--c-trade)" />
        <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-text)">{{ t('proposals.outgoing') }}</h2>
        <span class="text-[11px] font-bold px-2 py-1 rounded-md tabular-nums" style="background: color-mix(in srgb, var(--c-trade) 15%, transparent); color: var(--c-trade)">{{ outgoingPending.length }}</span>
      </div>
      <p class="text-xs -mt-2" style="color: var(--c-muted)">{{ t('proposals.outgoingDesc') }}</p>
      <div class="flex flex-col gap-10">
        <ProposalRow
          v-for="p in outgoingPending" :key="p.id"
          :proposal="p" :current-user-id="currentUserId"
          @edit="emit('edit', p)" @cancel="emit('cancel', p)"
          @complete="emit('complete', p)" @openProfile="emit('openProfile', $event)"
        />
      </div>
    </section>

    <section v-if="show('accepted') && acceptedTrades.length > 0" class="flex flex-col gap-4">
      <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
        <div class="size-2 rounded-full shrink-0" style="background: var(--c-accent)" />
        <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-text)">{{ t('proposals.accepted') }}</h2>
        <span class="text-[11px] font-bold px-2 py-1 rounded-md tabular-nums" style="background: color-mix(in srgb, var(--c-accent) 15%, transparent); color: var(--c-accent)">{{ acceptedTrades.length }}</span>
      </div>
      <p class="text-xs -mt-2" style="color: var(--c-muted)">{{ t('proposals.acceptedDesc') }}</p>
      <div class="flex flex-col gap-10">
        <ProposalRow
          v-for="p in acceptedTrades" :key="p.id"
          :proposal="p" :current-user-id="currentUserId"
          @cancel="emit('cancel', p)" @complete="emit('complete', p)" @openProfile="emit('openProfile', $event)"
        />
      </div>
    </section>

    <!--
      What used to be one "History" section. Splitting it is not just labelling:
      a trader looking for a finished trade and a trader checking what fell
      through are asking different questions, and the old list answered neither
      without scrolling past the other.
    -->
    <section v-for="group in historyGroups" :key="group.key" class="flex flex-col gap-4">
      <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
        <div class="size-2 rounded-full shrink-0" :style="{ background: group.color }" />
        <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-text)">{{ t(`proposals.${group.key}`) }}</h2>
        <span class="text-[11px] font-bold px-2 py-1 rounded-md tabular-nums"
          :style="{ background: `color-mix(in srgb, ${group.color} 15%, transparent)`, color: group.color }">{{ group.rows.length }}</span>
      </div>
      <p class="text-xs -mt-2" style="color: var(--c-muted)">{{ group.desc }}</p>
      <div class="flex flex-col gap-10">
        <ProposalRow
          v-for="p in group.rows" :key="p.id"
          :proposal="p" :current-user-id="currentUserId"
          @cancel="emit('cancel', p)" @complete="emit('complete', p)" @openProfile="emit('openProfile', $event)"
        />
      </div>
    </section>

  </template>
</template>
