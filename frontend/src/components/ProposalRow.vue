<script setup>
import { ref, computed } from "vue";
import { cardImage } from "@/lib/cardImage";
import TradeDetailDialog from "@/components/TradeDetailDialog.vue";

const props = defineProps({
  proposal:      { type: Object, required: true },
  currentUserId: { type: String, default: null },
});

const emit = defineEmits(["accept", "decline", "cancel", "complete", "edit", "counter"]);

const statusMeta = computed(() => {
  const map = {
    pending:   { label: "Pending",   color: "var(--c-trade)",  icon: "mdi-clock-outline" },
    accepted:  { label: "Accepted",  color: "var(--c-mutual)", icon: "mdi-check-circle-outline" },
    declined:  { label: "Declined",  color: "var(--c-accent)", icon: "mdi-close-circle-outline" },
    cancelled: { label: "Cancelled", color: "var(--c-accent)",  icon: "mdi-cancel" },
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

const isPending     = computed(() => props.proposal.status === "pending");
const isAccepted    = computed(() => props.proposal.status === "accepted");
const iConfirmed    = computed(() => props.proposal.i_confirmed    ?? false);
const theyConfirmed = computed(() => props.proposal.they_confirmed ?? false);
const initials      = computed(() => (props.proposal.counterparty_name ?? "?")[0].toUpperCase());

const detailOpen = ref(false);
</script>

<template>
  <!--
    Deal strip. Both sides of the proposal live in one horizontal view —
    "You give" and "You receive" flanking a ⇄ divider. The full border
    is tinted with the status color so urgency reads before reading.
  -->
  <div
    class="deal-strip flex flex-col rounded-xl overflow-hidden border"
    :style="{
      '--status-color': statusMeta.color,
      borderColor: `color-mix(in srgb, ${statusMeta.color} 30%, transparent)`,
      backgroundColor: 'var(--c-surface)',
    }"
  >
    <!-- Header: avatar · name · context · time · status pill · detail -->
    <div class="flex items-center gap-3 px-4 py-3">
      <div
        class="size-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
        :style="{
          backgroundColor: proposal.i_am_proposer
            ? 'color-mix(in srgb, var(--c-trade) 18%, transparent)'
            : 'color-mix(in srgb, var(--c-accent) 18%, transparent)',
          color: proposal.i_am_proposer ? 'var(--c-trade)' : 'var(--c-accent)',
        }"
      >{{ initials }}</div>

      <div class="flex flex-col grow min-w-0">
        <span class="font-semibold text-sm truncate" style="color: var(--c-text)">
          {{ proposal.counterparty_name ?? "Anonymous" }}
        </span>
        <span class="text-[11px]" style="color: var(--c-muted)">
          {{ proposal.i_am_proposer ? "You proposed" : "Proposed to you" }} · {{ timeAgo }}
        </span>
      </div>

      <span
        class="flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-lg border shrink-0"
        :style="{
          color: statusMeta.color,
          borderColor: `color-mix(in srgb, ${statusMeta.color} 40%, transparent)`,
          backgroundColor: `color-mix(in srgb, ${statusMeta.color} 10%, transparent)`,
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

    <!-- Deal body: you give | ⇄ | you receive -->
    <div class="flex flex-col md:flex-row" style="border-top: 1px solid var(--c-border)">

      <!-- You give (accent/pink tint) -->
      <div
        class="flex flex-col p-4 md:flex-1 min-w-0"
        style="background: color-mix(in srgb, var(--c-accent) 4%, transparent)"
      >
        <div v-if="proposal.i_give?.length" class="card-fan">
          <v-tooltip
            v-for="(card, i) in proposal.i_give.slice(0, 5)"
            :key="card.id"
            :text="card.name"
            location="top"
          >
            <template #activator="{ props: tip }">
              <div
                v-bind="tip"
                class="card-fan-item"
                :style="{ '--r': `${[-3, -1.5, 0.5, -2, 1.5][i] ?? 0}deg`, zIndex: i + 1 }"
              >
                <img
                  :src="cardImage(card.image_id)"
                  :alt="card.name"
                  loading="lazy"
                  class="card-fan-img rounded-md object-contain"
                />
              </div>
            </template>
          </v-tooltip>
          <div v-if="proposal.i_give.length > 5" class="card-fan-extra">
            +{{ proposal.i_give.length - 5 }}
          </div>
        </div>
        <span v-else class="text-xs italic" style="color: var(--c-muted)">None</span>
      </div>

      <!-- Divider: horizontal on mobile, vertical on desktop -->
      <div
        class="flex items-center justify-center py-1.5 md:py-0 md:w-8 shrink-0"
        
        style="background: var(--c-surface)"
      >
        <v-icon icon="mdi-swap-horizontal" size="16" color="var(--c-muted)" />
      </div>

      <!-- You receive (amethyst tint) -->
      <div
        class="flex flex-col p-4 md:flex-1 min-w-0"
        style="background: color-mix(in srgb, var(--c-trade) 4%, transparent)"
      >
        <div v-if="proposal.i_receive?.length" class="card-fan">
          <v-tooltip
            v-for="(card, i) in proposal.i_receive.slice(0, 5)"
            :key="card.id"
            :text="card.name"
            location="top"
          >
            <template #activator="{ props: tip }">
              <div
                v-bind="tip"
                class="card-fan-item"
                :style="{ '--r': `${[-3, -1.5, 0.5, -2, 1.5][i] ?? 0}deg`, zIndex: i + 1 }"
              >
                <img
                  :src="cardImage(card.image_id)"
                  :alt="card.name"
                  loading="lazy"
                  class="card-fan-img rounded-md object-contain"
                />
              </div>
            </template>
          </v-tooltip>
          <div v-if="proposal.i_receive.length > 5" class="card-fan-extra">
            +{{ proposal.i_receive.length - 5 }}
          </div>
        </div>
        <span v-else class="text-xs italic" style="color: var(--c-muted)">None</span>
      </div>
    </div>

    <!-- Settlement chips -->
    <div
      v-if="proposal.trade_method || proposal.cash_amount || proposal.notes"
      class="flex flex-wrap gap-2 px-4 py-2"
      style="border-top: 1px solid var(--c-border)"
    >
      <span
        v-if="proposal.trade_method"
        class="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border"
        style="color: var(--c-muted); border-color: var(--c-border); background-color: var(--c-surface-2)"
      >
        <v-icon
          :icon="proposal.trade_method === 'in_person'
            ? 'mdi-handshake-outline'
            : proposal.trade_method === 'mail'
            ? 'mdi-package-variant-closed'
            : 'mdi-dots-horizontal'"
          size="12"
        />
        {{ proposal.trade_method === 'in_person' ? 'Meet in person' : proposal.trade_method === 'mail' ? 'By mail' : 'Other' }}
      </span>
      <span
        v-if="proposal.cash_amount"
        class="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border font-semibold"
        style="color: var(--c-mutual); border-color: var(--c-mutual); background-color: color-mix(in srgb, var(--c-mutual) 12%, transparent)"
      >
        <v-icon icon="mdi-currency-eur" size="12" />
        {{ proposal.cash_payer === 'proposer'
            ? (proposal.i_am_proposer ? 'You pay' : `${proposal.counterparty_name} pays`)
            : (proposal.i_am_proposer ? `${proposal.counterparty_name} pays` : 'You pay') }}
        €{{ Number(proposal.cash_amount).toFixed(2) }}
      </span>
      <span
        v-if="proposal.notes"
        class="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border truncate max-w-xs"
        style="color: var(--c-muted); border-color: var(--c-border); background-color: var(--c-surface-2)"
        :title="proposal.notes"
      >
        <v-icon icon="mdi-note-text-outline" size="12" />
        {{ proposal.notes }}
      </span>
    </div>

    <!-- Action footer — only for actionable states -->
    <div
      v-if="isPending || isAccepted"
      class="flex items-center gap-2 px-4 py-3 flex-wrap"
      style="border-top: 1px solid var(--c-border)"
    >
      <template v-if="isPending">
        <span class="text-xs grow" style="color: var(--c-muted)">
          {{ proposal.i_am_proposer
            ? `Waiting for ${proposal.counterparty_name ?? 'them'} to upload photos and accept.`
            : "Upload photos of your cards so the other person can verify and accept." }}
        </span>
        <v-btn
          v-if="proposal.i_am_proposer"
          size="small" variant="outlined" prepend-icon="mdi-pencil-outline"
          style="border-color: var(--c-border); color: var(--c-muted)"
          @click="emit('edit', proposal)"
        >Edit offer</v-btn>
        <v-btn
          size="small" variant="flat" :prepend-icon="proposal.i_am_proposer ? 'mdi-camera-outline' : 'mdi-check-circle-outline'"
          style="background-color: var(--c-surface-2); color: var(--c-text)"
          @click="detailOpen = true"
        >{{ proposal.i_am_proposer ? 'Upload photos' : 'Review &amp; accept' }}</v-btn>
      </template>

      <template v-else-if="isAccepted">
        <div class="flex flex-col gap-2 w-full">
          <!-- Dual confirmation status -->
          <div class="flex gap-2">
            <div
              class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs flex-1 border"
              :style="iConfirmed
                ? { background: 'color-mix(in srgb, var(--c-mutual) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--c-mutual) 35%, transparent)' }
                : { background: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }"
            >
              <v-icon
                :icon="iConfirmed ? 'mdi-check-circle' : 'mdi-circle-outline'"
                size="13"
                :color="iConfirmed ? 'var(--c-mutual)' : 'var(--c-muted)'"
              />
              <span class="font-medium" :style="{ color: iConfirmed ? 'var(--c-mutual)' : 'var(--c-muted)' }">You</span>
            </div>
            <div
              class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs flex-1 border"
              :style="theyConfirmed
                ? { background: 'color-mix(in srgb, var(--c-mutual) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--c-mutual) 35%, transparent)' }
                : { background: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }"
            >
              <v-icon
                :icon="theyConfirmed ? 'mdi-check-circle' : 'mdi-clock-outline'"
                size="13"
                :color="theyConfirmed ? 'var(--c-mutual)' : 'var(--c-muted)'"
              />
              <span class="font-medium truncate" :style="{ color: theyConfirmed ? 'var(--c-mutual)' : 'var(--c-muted)' }">
                {{ proposal.counterparty_name ?? 'Them' }}
              </span>
            </div>
          </div>
          <!-- Actions -->
          <div class="flex items-center gap-2 flex-wrap">
            <v-btn
              v-if="!iConfirmed"
              size="small" variant="flat" prepend-icon="mdi-handshake-outline"
              style="background-color: var(--c-mutual); color: #0C0820"
              @click="emit('complete', proposal)"
            >Confirm your side</v-btn>
            <span v-else class="text-xs grow" style="color: var(--c-muted)">
              Waiting for {{ proposal.counterparty_name ?? 'them' }} to confirm.
            </span>
            <v-btn
              size="small" variant="outlined" prepend-icon="mdi-cancel"
              style="border-color: var(--c-accent); color: var(--c-accent)"
              @click="emit('cancel', proposal)"
            >Cancel trade</v-btn>
          </div>
        </div>
      </template>
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
    @counter="emit('counter', $event)"
  />
</template>

<style scoped>
.card-fan {
  display: flex;
  align-items: flex-end;
  padding: 20px;
  min-height: 110px;
}

.card-fan-item {
  flex-shrink: 0;
  transform: rotate(var(--r, 0deg));
  transform-origin: bottom center;
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
              box-shadow 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  cursor: default;
}

.card-fan-item + .card-fan-item {
  margin-left: -18px;
}

.card-fan-item:hover {
  transform: translateY(-14px) rotate(0deg) scale(1.08) !important;
  z-index: 20 !important;
}

.card-fan-img {
  display: block;
  width: 62px;
  height: 88px;
  background-color: var(--c-surface-2);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.35);
  outline: 1.5px solid rgba(255, 255, 255, 0.1);
  outline-offset: -1px;
}

.card-fan-item:hover .card-fan-img {
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.65);
  outline-color: rgba(255, 255, 255, 0.3);
}

.card-fan-extra {
  flex-shrink: 0;
  margin-left: -6px;
  align-self: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  background: var(--c-surface-2);
  color: var(--c-muted);
  border: 1.5px solid var(--c-border);
  z-index: 11;
}
</style>
