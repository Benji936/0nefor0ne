<script setup>
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import ProposalRow from "@/components/ProposalRow.vue";

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

const emit = defineEmits(["accept", "decline", "cancel", "complete", "counter", "edit", "openProfile"]);

const activeFilter = ref("all");

const total = computed(() =>
  props.incomingPending.length + props.outgoingPending.length + props.acceptedTrades.length + props.history.length
);

const filters = computed(() => [
  { key: "all",      label: t("proposals.all"),      count: total.value,                  color: "var(--c-text)",   bg: "var(--c-surface-2)" },
  { key: "incoming", label: t("proposals.incoming"), count: props.incomingPending.length, color: "var(--c-mutual)", bg: "color-mix(in srgb, var(--c-mutual) 14%, transparent)" },
  { key: "outgoing", label: t("proposals.outgoing"), count: props.outgoingPending.length, color: "var(--c-trade)",  bg: "color-mix(in srgb, var(--c-trade) 14%, transparent)" },
  { key: "accepted", label: t("proposals.accepted"), count: props.acceptedTrades.length,  color: "var(--c-accent)", bg: "color-mix(in srgb, var(--c-accent) 14%, transparent)" },
  { key: "history",  label: t("proposals.history"),  count: props.history.length,         color: "var(--c-muted)",  bg: "color-mix(in srgb, var(--c-muted) 10%, transparent)" },
]);

// Reset to "all" if the active section becomes empty
watch(
  () => [props.incomingPending.length, props.outgoingPending.length, props.acceptedTrades.length, props.history.length],
  () => {
    const counts = { incoming: props.incomingPending.length, outgoing: props.outgoingPending.length, accepted: props.acceptedTrades.length, history: props.history.length };
    if (activeFilter.value !== "all" && counts[activeFilter.value] === 0) {
      activeFilter.value = "all";
    }
  }
);

const show = (key) => activeFilter.value === "all" || activeFilter.value === key;
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
        :class="f.count === 0 && f.key !== 'all' ? 'opacity-30 cursor-default pointer-events-none' : 'cursor-pointer'"
        :style="activeFilter === f.key
          ? { background: f.bg, color: f.color, boxShadow: `0 0 0 1.5px ${f.color}, 0 0 12px color-mix(in srgb, ${f.color} 20%, transparent)` }
          : { background: 'var(--c-surface-2)', color: 'var(--c-muted)', boxShadow: '0 0 0 1px var(--c-border)' }"
        :disabled="f.count === 0 && f.key !== 'all'"
        @click="f.count > 0 || f.key === 'all' ? activeFilter = f.key : null"
      >
        <span
          v-if="f.key !== 'all'"
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
          :proposal="p" :current-user-id="currentUserId"
          @accept="emit('accept', p)" @decline="emit('decline', $event)" @cancel="emit('cancel', p)"
          @complete="emit('complete', p)" @counter="emit('counter', p)" @openProfile="emit('openProfile', $event)"
        />
      </div>
    </section>

    <section
      v-if="show('outgoing') && outgoingPending.length > 0"
      class="flex flex-col gap-4"
      :class="{ 'border-t pt-6': show('incoming') && incomingPending.length > 0 }"
      :style="show('incoming') && incomingPending.length > 0 ? 'border-color: var(--c-border)' : ''"
    >
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

    <section
      v-if="show('accepted') && acceptedTrades.length > 0"
      class="flex flex-col gap-4 border-t pt-6"
      style="border-color: var(--c-border)"
    >
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

    <section
      v-if="show('history') && history.length > 0"
      class="flex flex-col gap-4 border-t pt-6"
      style="border-color: var(--c-border)"
    >
      <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
        <div class="size-2 rounded-full shrink-0" style="background: var(--c-muted)" />
        <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-muted)">{{ t('proposals.history') }}</h2>
      </div>
      <div class="flex flex-col gap-10">
        <ProposalRow
          v-for="p in history" :key="p.id"
          :proposal="p" :current-user-id="currentUserId"
          @cancel="emit('cancel', p)" @complete="emit('complete', p)" @openProfile="emit('openProfile', $event)"
        />
      </div>
    </section>

  </template>
</template>
