<script setup>
import { ref, computed } from "vue";
import { cardImage } from "@/lib/cardImage";
import TradeChatPanel    from "@/components/trade/TradeChatPanel.vue";
import TradePhotosPanel  from "@/components/trade/TradePhotosPanel.vue";

const props = defineProps({
  modelValue:    { type: Boolean, default: false },
  proposal:      { type: Object,  default: null  },
  currentUserId: { type: String,  default: null  },
});

const emit = defineEmits(["update:modelValue", "accept", "decline", "cancel", "complete", "counter"]);

// ── Photos status (lifted from TradePhotosPanel via v-model) ─────────────
const bothUploaded = ref(false);

// ── Decline flow ──────────────────────────────────────────────────────────
const declining     = ref(false);
const declineReason = ref("");

// ── Computed helpers ──────────────────────────────────────────────────────
const statusMeta = computed(() => {
  if (!props.proposal) return {};
  const map = {
    pending:   { label: "Pending",   color: "var(--c-trade)",  icon: "mdi-clock-outline" },
    accepted:  { label: "Accepted",  color: "var(--c-mutual)", icon: "mdi-check-circle-outline" },
    declined:  { label: "Declined",  color: "var(--c-accent)", icon: "mdi-close-circle-outline" },
    cancelled: { label: "Cancelled", color: "var(--c-muted)",  icon: "mdi-cancel" },
    completed: { label: "Completed", color: "var(--c-mutual)", icon: "mdi-handshake-outline" },
  };
  return map[props.proposal.status] ?? map.pending;
});

const formattedDate = computed(() => {
  if (!props.proposal?.created_at) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
    .format(new Date(props.proposal.created_at));
});

const isPending      = computed(() => props.proposal?.status === "pending");
const isAccepted     = computed(() => props.proposal?.status === "accepted");
const showPhotoPanel = computed(() => isPending.value || isAccepted.value);
const iConfirmed     = computed(() => props.proposal?.i_confirmed    ?? false);
const theyConfirmed  = computed(() => props.proposal?.they_confirmed ?? false);

// ── Card display helpers ──────────────────────────────────────────────────
function shortenRarity(r) {
  return r ? r.split(" ").map(w => w[0]).join("") : "";
}

function marketLinks(name, extension) {
  const q = encodeURIComponent(name ?? "");
  const s = encodeURIComponent(extension ?? "");
  return [
    { label: "TCGPlayer",  url: `https://www.tcgplayer.com/search/yugioh/product?q=${q}` },
    { label: "Cardmarket", url: extension
        ? `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${s}`
        : `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${q}` },
    { label: "eBay",       url: `https://www.ebay.com/sch/i.html?_nkw=${q}+yugioh` },
  ];
}

// ── Actions ───────────────────────────────────────────────────────────────
function close() {
  emit("update:modelValue", false);
  declining.value = false;
  declineReason.value = "";
}

function action(event) { emit(event, props.proposal); close(); }

function confirmDecline() {
  emit("decline", { proposal: props.proposal, reason: declineReason.value.trim() || null });
  close();
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="900"
    width="92vw"
    scrollable
  >
    <v-card
      v-if="proposal"
      class="!rounded-2xl overflow-hidden"
      style="background-color: var(--c-surface); color: var(--c-text); border: 1px solid var(--c-border)"
    >
      <!-- Header -->
      <div>
        <div class="flex items-center gap-4 px-6 py-4">
          <div class="relative shrink-0">
            <div class="absolute -inset-1 rounded-full blur-md opacity-35"
              :style="{ backgroundColor: proposal.i_am_proposer ? 'var(--c-trade)' : 'var(--c-accent)' }" />
            <div
              class="relative size-11 rounded-full flex items-center justify-center font-bold text-sm text-white ring-2 ring-white/10"
              :style="{ backgroundColor: proposal.i_am_proposer ? 'var(--c-trade)' : 'var(--c-accent)' }"
            >{{ (proposal.counterparty_name ?? "?")[0].toUpperCase() }}</div>
          </div>
          <div class="flex flex-col grow min-w-0">
            <span class="font-bold text-lg leading-tight" style="color: var(--c-text)">
              Trade #{{ proposal.id }} · {{ proposal.counterparty_name ?? "Anonymous" }}
            </span>
            <span class="text-sm mt-0.5" style="color: var(--c-muted)">
              {{ proposal.i_am_proposer ? "You proposed" : "Proposed to you" }} · {{ formattedDate }}
            </span>
          </div>
          <span
            class="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg border shrink-0"
            :style="{ color: statusMeta.color, borderColor: statusMeta.color + '60', backgroundColor: statusMeta.color + '18' }"
          >
            <v-icon :icon="statusMeta.icon" size="14" :color="statusMeta.color" />
            {{ statusMeta.label }}
          </span>
          <v-btn icon="mdi-close" variant="text" density="compact" style="color: var(--c-muted)" @click="close" />
        </div>
        <div class="h-px w-full" style="background: linear-gradient(90deg, var(--c-accent), transparent 40%, transparent 60%, var(--c-trade))" />
      </div>

      <!-- Body -->
      <v-card-text class="pa-6" style="overflow-y: auto">

        <!-- Card columns -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section v-for="side in [
            { label: 'You give',    icon: 'mdi-arrow-up-circle',   color: 'var(--c-accent)', cards: proposal.i_give,    qtyColor: 'var(--c-accent)' },
            { label: 'You receive', icon: 'mdi-arrow-down-circle', color: 'var(--c-trade)',  cards: proposal.i_receive, qtyColor: 'var(--c-trade)' },
          ]" :key="side.label" class="flex flex-col gap-3">
            <div class="flex items-center gap-2 pb-1" style="border-bottom: 1px solid var(--c-border)">
              <v-icon :icon="side.icon" size="18" :color="side.color" />
              <span class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">{{ side.label }}</span>
              <span v-if="side.cards?.length" class="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-md"
                :style="{ background: `color-mix(in srgb, ${side.color} 15%, transparent)`, color: side.color }">
                {{ side.cards.length }} card{{ side.cards.length !== 1 ? "s" : "" }}
              </span>
            </div>
            <p v-if="!side.cards?.length" class="text-sm italic py-4 text-center" style="color: var(--c-muted)">Nothing on this side</p>
            <div v-for="card in side.cards" :key="card.id"
              class="flex gap-3 rounded-lg p-3"
              style="background-color: var(--c-surface-2); border: 1px solid var(--c-border)">
              <img :src="cardImage(card.image_id)" :alt="card.name" loading="lazy"
                class="rounded-md object-contain shrink-0 ring-1 ring-white/10"
                style="width: 62px; height: 88px; background-color: var(--c-surface)" />
              <div class="flex flex-col gap-1.5 min-w-0 grow">
                <p class="font-semibold text-sm leading-tight" style="color: var(--c-text)">{{ card.name }}</p>
                <div class="flex flex-wrap gap-1.5">
                  <span v-if="card.extension" class="text-[11px] px-1.5 py-0.5 rounded font-mono"
                    style="background: color-mix(in srgb, var(--c-trade) 15%, transparent); color: var(--c-trade)">{{ card.extension }}</span>
                  <span v-if="card.rarity" class="text-[11px] px-1.5 py-0.5 rounded"
                    style="background: color-mix(in srgb, var(--c-muted) 15%, transparent); color: var(--c-text)"
                    :title="card.rarity">{{ shortenRarity(card.rarity) }}</span>
                  <span v-if="card.condition" class="text-[11px] px-1.5 py-0.5 rounded"
                    style="background: color-mix(in srgb, var(--c-muted) 12%, transparent); color: var(--c-muted)">{{ card.condition }}</span>
                  <span v-if="card.language" class="text-[11px] px-1.5 py-0.5 rounded"
                    style="background: color-mix(in srgb, var(--c-muted) 12%, transparent); color: var(--c-muted)">{{ card.language }}</span>
                </div>
                <p class="text-xs font-semibold mt-auto" style="color: var(--c-text)">
                  Qty: <span :style="{ color: side.qtyColor }">{{ card.quantity }}</span>
                </p>
                <div class="flex gap-2 mt-0.5">
                  <a v-for="m in marketLinks(card.name, card.extension)" :key="m.label"
                    :href="m.url" target="_blank" rel="noopener noreferrer"
                    class="text-[11px] flex items-center gap-0.5 no-underline transition-opacity hover:opacity-70"
                    style="color: var(--c-muted)">
                    <v-icon icon="mdi-open-in-new" size="11" />{{ m.label }}
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- Decline reason -->
        <div
          v-if="proposal.status === 'declined' && proposal.decline_reason"
          class="mt-6 flex items-start gap-3 rounded-xl px-4 py-3"
          style="background: color-mix(in srgb, var(--c-accent) 8%, transparent); border: 1px solid color-mix(in srgb, var(--c-accent) 20%, transparent)"
        >
          <v-icon icon="mdi-message-reply-outline" size="16" color="var(--c-accent)" class="shrink-0 mt-0.5" />
          <div class="flex flex-col gap-0.5 min-w-0">
            <p class="text-xs font-semibold" style="color: var(--c-accent)">Reason for declining</p>
            <p class="text-sm leading-snug" style="color: var(--c-text)">{{ proposal.decline_reason }}</p>
          </div>
        </div>

        <!-- Verification photos -->
        <TradePhotosPanel
          v-if="showPhotoPanel"
          :open="modelValue"
          :proposal="proposal"
          :current-user-id="currentUserId"
          v-model:both-uploaded="bothUploaded"
        />

        <!-- Trade chat -->
        <TradeChatPanel
          :open="modelValue"
          :proposal="proposal"
          :current-user-id="currentUserId"
        />

      </v-card-text>

      <!-- Footer -->
      <div>
        <div class="h-px w-full" style="background: linear-gradient(90deg, var(--c-accent), transparent 40%, transparent 60%, var(--c-trade))" />
        <div class="flex items-center justify-between px-6 py-4 gap-3 flex-wrap">

          <!-- Accepted actions -->
          <template v-if="isAccepted">
            <div class="flex flex-col gap-3 w-full">
              <div class="flex gap-3">
                <div
                  v-for="side in [
                    { confirmed: iConfirmed,    label: 'You',                                     icon: iConfirmed    ? 'mdi-check-circle' : 'mdi-circle-outline' },
                    { confirmed: theyConfirmed, label: proposal.counterparty_name ?? 'Them',       icon: theyConfirmed ? 'mdi-check-circle' : 'mdi-clock-outline'  },
                  ]"
                  :key="side.label"
                  class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm flex-1 border"
                  :style="side.confirmed
                    ? { background: 'color-mix(in srgb, var(--c-mutual) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--c-mutual) 30%, transparent)' }
                    : { background: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }"
                >
                  <v-icon :icon="side.icon" size="16" :color="side.confirmed ? 'var(--c-mutual)' : 'var(--c-muted)'" />
                  <span class="font-medium truncate" :style="{ color: side.confirmed ? 'var(--c-mutual)' : 'var(--c-muted)' }">{{ side.label }}</span>
                </div>
              </div>
              <p class="text-xs" style="color: var(--c-muted)">
                <template v-if="!bothUploaded">Upload photos on both sides before confirming.</template>
                <template v-else-if="iConfirmed">Waiting for {{ proposal.counterparty_name ?? 'them' }} to confirm.</template>
                <template v-else>Both sides have uploaded — confirm when you've received your cards.</template>
              </p>
              <div class="flex gap-2 flex-wrap justify-end">
                <v-btn variant="outlined" prepend-icon="mdi-cancel"
                  style="border-color: var(--c-accent); color: var(--c-accent)"
                  @click="action('cancel')">Cancel trade</v-btn>
                <v-btn
                  v-if="!iConfirmed"
                  variant="flat" prepend-icon="mdi-handshake-outline"
                  :disabled="!bothUploaded"
                  :style="bothUploaded ? 'background-color: var(--c-mutual); color: #0C0820' : 'opacity: 0.45'"
                  @click="action('complete')">Confirm your side</v-btn>
              </div>
            </div>
          </template>

          <!-- Pending actions -->
          <template v-else-if="isPending">
            <span class="text-xs grow" style="color: var(--c-muted)">
              <template v-if="!proposal.i_am_proposer && !bothUploaded">Upload photos on both sides to enable accepting.</template>
              <template v-else-if="!proposal.i_am_proposer && bothUploaded">Photos verified — you can now accept.</template>
              <template v-else-if="proposal.i_am_proposer">Waiting for {{ proposal.counterparty_name ?? "them" }} to review and accept.</template>
            </span>
            <div class="flex gap-2 shrink-0 flex-wrap w-full">
              <template v-if="!proposal.i_am_proposer">
                <template v-if="declining">
                  <div class="flex flex-col gap-2 w-full gap-5">
                    <textarea
                      v-model="declineReason"
                      placeholder="Optional — let them know why you're declining…"
                      rows="2"
                      class="w-full rounded-xl px-3 py-3 text-sm border outline-none resize-none"
                      :style="{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
                      autofocus
                    />
                    <div class="flex gap-2 justify-end">
                      <v-btn size="small" variant="text" style="color: var(--c-muted)" @click="declining = false">Back</v-btn>
                      <v-btn size="small" variant="flat"
                        style="background-color: var(--c-accent); color: white"
                        @click="confirmDecline">Confirm decline</v-btn>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <v-btn variant="text" prepend-icon="mdi-cancel" style="color: var(--c-muted)" @click="action('cancel')">Cancel</v-btn>
                  <v-btn variant="outlined" prepend-icon="mdi-close"
                    style="border-color: var(--c-accent); color: var(--c-accent)"
                    @click="declining = true">Decline</v-btn>
                  <v-btn variant="outlined" prepend-icon="mdi-swap-horizontal"
                    style="border-color: var(--c-trade); color: var(--c-trade)"
                    @click="emit('counter', proposal); close()">Counter</v-btn>
                  <v-btn variant="flat" prepend-icon="mdi-check"
                    :disabled="!bothUploaded"
                    :style="bothUploaded ? 'background-color: var(--c-mutual); color: #0C0820' : 'opacity: 0.45'"
                    @click="action('accept')">Accept</v-btn>
                </template>
              </template>
              <v-btn v-else variant="text" prepend-icon="mdi-cancel"
                style="color: var(--c-muted)"
                @click="action('cancel')">Cancel proposal</v-btn>
            </div>
          </template>

          <!-- Read-only -->
          <template v-else>
            <div class="ml-auto">
              <v-btn variant="text" style="color: var(--c-muted)" @click="close">Close</v-btn>
            </div>
          </template>

        </div>
      </div>
    </v-card>
  </v-dialog>
</template>
