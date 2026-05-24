<script setup>
import { ref, onMounted } from "vue";
import { getClient } from "@/lib/supabaseClient";

const props = defineProps({
  login: { type: Object, default: null },
});

const history = ref([]);
const loading = ref(true);

const META = {
  completed: { label: 'Completed', icon: 'mdi-handshake',            color: 'var(--c-mutual)' },
  cancelled: { label: 'Cancelled', icon: 'mdi-cancel',               color: 'var(--c-muted)'  },
  declined:  { label: 'Declined',  icon: 'mdi-close-circle-outline', color: 'var(--c-accent)' },
};

function meta(status) {
  return META[status] ?? { label: status, icon: 'mdi-help-circle-outline', color: 'var(--c-muted)' };
}

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

onMounted(async () => {
  if (!props.login?.user?.id) { loading.value = false; return; }
  const { data } = await getClient().rpc('fetch_my_trade_history', { p_limit: 15 });
  history.value = data ?? [];
  loading.value = false;
});
</script>

<template>
  <div>
    <h2 class="text-xs font-bold uppercase tracking-widest mb-3" style="color: var(--c-muted)">Trade history</h2>

    <!-- Skeleton -->
    <div v-if="loading" class="flex flex-col gap-2">
      <div
        v-for="i in 4" :key="i"
        class="flex items-center gap-3 rounded-xl px-4 py-3 border animate-pulse"
        :style="{ background: 'var(--c-surface)', borderColor: 'var(--c-border)', opacity: 1 - (i-1)*0.15 }"
      >
        <div class="size-7 rounded-full shrink-0" style="background: var(--c-skeleton)" />
        <div class="flex flex-col gap-2 grow">
          <div class="h-3 rounded w-1/3" style="background: var(--c-skeleton)" />
          <div class="h-3 rounded w-1/5" style="background: var(--c-skeleton)" />
        </div>
        <div class="h-5 w-16 rounded-lg" style="background: var(--c-skeleton)" />
      </div>
    </div>

    <!-- Empty -->
    <div
      v-else-if="history.length === 0"
      class="flex flex-col items-center gap-2 py-10 rounded-2xl border"
      style="background: var(--c-surface); border-color: var(--c-border)"
    >
      <v-icon icon="mdi-history" size="30" color="var(--c-muted)" />
      <p class="text-sm" style="color: var(--c-muted)">No trades yet.</p>
    </div>

    <!-- List -->
    <div v-else class="flex flex-col rounded-2xl border overflow-hidden" style="background: var(--c-surface); border-color: var(--c-border)">
      <div
        v-for="(trade, idx) in history"
        :key="trade.trade_id"
        class="flex items-center gap-3 px-4 py-3"
        :style="idx < history.length - 1 ? 'border-bottom: 1px solid var(--c-border)' : ''"
      >
        <div
          class="size-7 rounded-full flex items-center justify-center shrink-0"
          :style="{ background: `color-mix(in srgb, ${meta(trade.status).color} 14%, transparent)`, color: meta(trade.status).color }"
        >
          <v-icon :icon="meta(trade.status).icon" size="14" />
        </div>

        <div class="flex flex-col grow min-w-0">
          <span class="text-sm font-semibold truncate" style="color: var(--c-text)">
            {{ trade.counterparty_name ?? 'Unknown trader' }}
          </span>
          <span class="text-[11px]" style="color: var(--c-muted)">
            {{ meta(trade.status).label }} · {{ formatDate(trade.created_at) }}
          </span>
        </div>

        <span
          class="text-[11px] font-semibold px-2 py-1 rounded-md border shrink-0 tabular-nums"
          :style="{
            color: meta(trade.status).color,
            borderColor: `color-mix(in srgb, ${meta(trade.status).color} 30%, transparent)`,
            background:  `color-mix(in srgb, ${meta(trade.status).color} 8%, transparent)`,
          }"
        >{{ trade.card_count }} {{ trade.card_count === 1 ? 'card' : 'cards' }}</span>
      </div>
    </div>
  </div>
</template>
