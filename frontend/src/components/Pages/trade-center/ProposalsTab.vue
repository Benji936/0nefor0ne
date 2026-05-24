<script setup>
import ProposalRow from "@/components/ProposalRow.vue";

defineProps({
  login:           { type: Object,  default: null },
  loading:         { type: Boolean, default: false },
  incomingPending: { type: Array,   default: () => [] },
  outgoingPending: { type: Array,   default: () => [] },
  acceptedTrades:  { type: Array,   default: () => [] },
  history:         { type: Array,   default: () => [] },
  currentUserId:   { type: String,  default: null },
});

const emit = defineEmits(["accept", "decline", "cancel", "complete", "counter", "edit", "openProfile"]);
</script>

<template>
  <!-- Not logged in -->
  <div v-if="!login" class="flex flex-col items-center gap-3 py-16 text-center">
    <v-icon icon="mdi-lock-outline" size="36" color="var(--c-muted)" />
    <p class="text-sm" style="color: var(--c-muted)">Log in to see your proposals.</p>
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
    v-else-if="incomingPending.length + outgoingPending.length + acceptedTrades.length + history.length === 0"
    class="flex flex-col items-center gap-3 py-16 text-center"
  >
    <div
      class="size-14 rounded-2xl flex items-center justify-center mb-1"
      style="background: color-mix(in srgb, var(--c-muted) 12%, transparent)"
    >
      <v-icon icon="mdi-swap-horizontal" size="28" color="var(--c-muted)" />
    </div>
    <p class="text-base font-semibold" style="color: var(--c-text)">No proposals yet</p>
    <p class="text-sm max-w-xs leading-relaxed" style="color: var(--c-muted)">
      Send one from the Matches tab when you find a trader you want to deal with.
    </p>
  </div>

  <!-- Proposal sections -->
  <template v-else>

    <section v-if="incomingPending.length > 0" class="flex flex-col gap-4">
      <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
        <div class="size-2 rounded-full shrink-0" style="background: var(--c-mutual)" />
        <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-text)">Incoming</h2>
        <span class="text-[11px] font-bold px-1 py-1 w-6 h-6 text-center rounded-md tabular-nums" style="background: color-mix(in srgb, var(--c-mutual) 15%, transparent); color: var(--c-mutual)">{{ incomingPending.length }}</span>
      </div>
      <p class="text-xs -mt-2" style="color: var(--c-muted)">These traders want to deal with you. Accept or decline.</p>
      <div class="flex flex-col gap-3">
        <ProposalRow
          v-for="p in incomingPending" :key="p.id"
          :proposal="p" :current-user-id="currentUserId"
          @accept="emit('accept', p)" @decline="emit('decline', $event)" @cancel="emit('cancel', p)"
          @complete="emit('complete', p)" @counter="emit('counter', p)" @openProfile="emit('openProfile', $event)"
        />
      </div>
    </section>

    <section
      v-if="outgoingPending.length > 0"
      class="flex flex-col gap-4"
      :class="{ 'border-t pt-6': incomingPending.length > 0 }"
      :style="incomingPending.length > 0 ? 'border-color: var(--c-border)' : ''"
    >
      <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
        <div class="size-2 rounded-full shrink-0" style="background: var(--c-trade)" />
        <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-text)">Sent</h2>
        <span class="text-[11px] font-bold px-2 py-1 rounded-md tabular-nums" style="background: color-mix(in srgb, var(--c-trade) 15%, transparent); color: var(--c-trade)">{{ outgoingPending.length }}</span>
      </div>
      <p class="text-xs -mt-2" style="color: var(--c-muted)">Waiting for the other side to respond.</p>
      <div class="flex flex-col gap-3">
        <ProposalRow
          v-for="p in outgoingPending" :key="p.id"
          :proposal="p" :current-user-id="currentUserId"
          @edit="emit('edit', p)" @cancel="emit('cancel', p)"
          @complete="emit('complete', p)" @openProfile="emit('openProfile', $event)"
        />
      </div>
    </section>

    <section v-if="acceptedTrades.length > 0" class="flex flex-col gap-4 border-t pt-6" style="border-color: var(--c-border)">
      <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
        <div class="size-2 rounded-full shrink-0" style="background: var(--c-mutual)" />
        <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-text)">Awaiting exchange</h2>
        <span class="text-[11px] font-bold px-2 py-1 rounded-md tabular-nums" style="background: color-mix(in srgb, var(--c-mutual) 15%, transparent); color: var(--c-mutual)">{{ acceptedTrades.length }}</span>
      </div>
      <p class="text-xs -mt-2" style="color: var(--c-muted)">Both sides agreed. Confirm once cards have changed hands, or cancel to release them.</p>
      <div class="flex flex-col gap-3">
        <ProposalRow
          v-for="p in acceptedTrades" :key="p.id"
          :proposal="p" :current-user-id="currentUserId"
          @cancel="emit('cancel', p)" @complete="emit('complete', p)" @openProfile="emit('openProfile', $event)"
        />
      </div>
    </section>

    <section v-if="history.length > 0" class="flex flex-col gap-4 border-t pt-6" style="border-color: var(--c-border)">
      <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
        <div class="size-2 rounded-full shrink-0" style="background: var(--c-muted)" />
        <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-muted)">History</h2>
      </div>
      <div class="flex flex-col gap-3">
        <ProposalRow
          v-for="p in history" :key="p.id"
          :proposal="p" :current-user-id="currentUserId"
          @cancel="emit('cancel', p)" @complete="emit('complete', p)" @openProfile="emit('openProfile', $event)"
        />
      </div>
    </section>

  </template>
</template>
