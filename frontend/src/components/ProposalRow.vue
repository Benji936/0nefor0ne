<script setup>
import { ref, computed } from "vue";
import { cardImage } from "@/lib/cardImage";
import TradeDetailDialog from "@/components/TradeDetailDialog.vue";

const props = defineProps({
  proposal:      { type: Object, required: true },
  currentUserId: { type: String, default: null },
});

const emit = defineEmits(["accept", "decline", "cancel", "complete", "edit"]);

const statusMeta = computed(() => {
  const map = {
    pending:   { label: "Pending",   color: "var(--c-trade)",  icon: "mdi-clock-outline" },
    accepted:  { label: "Accepted",  color: "var(--c-mutual)", icon: "mdi-check-circle-outline" },
    declined:  { label: "Declined",  color: "var(--c-accent)", icon: "mdi-close-circle-outline" },
    cancelled: { label: "Cancelled", color: "var(--c-muted)",  icon: "mdi-cancel" },
    completed: { label: "Completed", color: "var(--c-mutual)", icon: "mdi-handshake-outline" },
  };
  return map[props.proposal.status] ?? map.pending;
});

const timeAgo = computed(() => {
  if (!props.proposal.created_at) return "";
  const diff = Date.now() - new Date(props.proposal.created_at).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
});

const isPending   = computed(() => props.proposal.status === "pending");
const isAccepted  = computed(() => props.proposal.status === "accepted");
const initials    = computed(() => (props.proposal.counterparty_name ?? "?")[0].toUpperCase());

const detailOpen  = ref(false);
</script>

<template>
  <div
    class="flex flex-col gap-3 rounded-xl p-4 border"
    style="border-color: var(--c-border); background-color: var(--c-surface)"
  >
    <!-- Top row: avatar + name + status + time -->
    <div class="flex items-center gap-3">
      <div
        class="size-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
        :style="{ backgroundColor: proposal.i_am_proposer ? 'var(--c-trade)' : 'var(--c-accent)' }"
      >{{ initials }}</div>

      <div class="flex flex-col grow min-w-0">
        <span class="font-semibold text-sm truncate" style="color: var(--c-text)">
          {{ proposal.counterparty_name ?? "Anonymous" }}
        </span>
        <span class="text-xs" style="color: var(--c-muted)">
          {{ proposal.i_am_proposer ? "You proposed" : "Proposed to you" }} · {{ timeAgo }}
        </span>
      </div>

      <span
        class="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border shrink-0"
        :style="{
          color: statusMeta.color,
          borderColor: statusMeta.color + '60',
          backgroundColor: statusMeta.color + '18',
        }"
      >
        <v-icon :icon="statusMeta.icon" size="12" :color="statusMeta.color" />
        {{ statusMeta.label }}
      </span>

      <v-btn
        icon="mdi-information-outline"
        variant="text"
        size="small"
        density="compact"
        style="color: var(--c-muted)"
        title="View details"
        @click.stop="detailOpen = true"
      />
    </div>

    <!-- Cards: you give ⟷ you receive -->
    <div class="flex items-start gap-6 flex-wrap">
      <!-- Give -->
      <div class="flex flex-col gap-1.5">
        <span class="text-[10px] font-bold uppercase tracking-wide" style="color: var(--c-accent)">
          You give
        </span>
        <div v-if="proposal.i_give?.length" class="flex gap-1.5 flex-wrap">
          <div
            v-for="card in proposal.i_give"
            :key="card.id"
            class="relative group cursor-default"
            style="width: 46px"
          >
            <img
              :src="cardImage(card.image_id)"
              :alt="card.name"
              loading="lazy"
              class="w-full rounded-md object-contain ring-1"
              style="height: 64px; background-color: var(--c-surface-2); ring-color: var(--c-border)"
            />
            <div
              class="absolute inset-0 rounded-md flex items-end p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              style="background: linear-gradient(to top, rgba(0,0,0,0.8), transparent)"
            >
              <span class="text-[9px] text-white leading-tight line-clamp-2">{{ card.name }}</span>
            </div>
          </div>
        </div>
        <span v-else class="text-xs italic" style="color: var(--c-muted)">Nothing</span>
      </div>

      <!-- Arrow -->
      <div class="flex items-center self-center mt-3 shrink-0">
        <v-icon icon="mdi-swap-horizontal" size="20" color="var(--c-muted)" />
      </div>

      <!-- Receive -->
      <div class="flex flex-col gap-1.5">
        <span class="text-[10px] font-bold uppercase tracking-wide" style="color: var(--c-trade)">
          You receive
        </span>
        <div v-if="proposal.i_receive?.length" class="flex gap-1.5 flex-wrap">
          <div
            v-for="card in proposal.i_receive"
            :key="card.id"
            class="relative group cursor-default"
            style="width: 46px"
          >
            <img
              :src="cardImage(card.image_id)"
              :alt="card.name"
              loading="lazy"
              class="w-full rounded-md object-contain ring-1"
              style="height: 64px; background-color: var(--c-surface-2); ring-color: var(--c-border)"
            />
            <div
              class="absolute inset-0 rounded-md flex items-end p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              style="background: linear-gradient(to top, rgba(0,0,0,0.8), transparent)"
            >
              <span class="text-[9px] text-white leading-tight line-clamp-2">{{ card.name }}</span>
            </div>
          </div>
        </div>
        <span v-else class="text-xs italic" style="color: var(--c-muted)">Nothing</span>
      </div>
    </div>

    <!-- Actions — pending: direct to dialog where photos + accept live -->
    <div v-if="isPending" class="flex items-center gap-3 pt-1">
      <span class="text-xs grow" style="color: var(--c-muted)">
        {{ proposal.i_am_proposer
          ? "Waiting for verification photos before they can accept."
          : "Upload photos to verify your cards, then accept." }}
      </span>
      <v-btn
        v-if="proposal.i_am_proposer"
        size="small" variant="outlined" prepend-icon="mdi-pencil-outline"
        style="border-color: var(--c-border); color: var(--c-muted)"
        @click="emit('edit', proposal)"
      >Edit</v-btn>
      <v-btn
        size="small" variant="flat" prepend-icon="mdi-camera-outline"
        style="background-color: var(--c-surface-2); color: var(--c-text)"
        @click="detailOpen = true"
      >Review &amp; verify</v-btn>
    </div>

    <!-- Actions — accepted -->
    <div v-else-if="isAccepted" class="flex items-center gap-3 pt-1">
      <span class="text-xs grow" style="color: var(--c-muted)">Cards are reserved. Confirm once exchanged.</span>
      <v-btn
        size="small" variant="flat" prepend-icon="mdi-handshake-outline"
        style="background-color: var(--c-mutual); color: white"
        @click="emit('complete', proposal)"
      >Confirm exchange</v-btn>
      <v-btn
        size="small" variant="outlined" prepend-icon="mdi-cancel"
        style="border-color: var(--c-accent); color: var(--c-accent)"
        @click="emit('cancel', proposal)"
      >Cancel</v-btn>
    </div>


  </div>

  <!-- Detail dialog — self-contained, re-emits actions up -->
  <TradeDetailDialog
    v-model="detailOpen"
    :proposal="proposal"
    :current-user-id="currentUserId"
    @accept="emit('accept', $event)"
    @decline="emit('decline', $event)"
    @cancel="emit('cancel', $event)"
    @complete="emit('complete', $event)"
  />
</template>
