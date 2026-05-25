<script setup>
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { cardImage } from "@/lib/cardImage";
import { fetchTradeEvents } from "@/lib/proposals";
import TradeChatDialog   from "@/components/trade/TradeChatDialog.vue";
import TradePhotosPanel  from "@/components/trade/TradePhotosPanel.vue";

const { t } = useI18n();

const props = defineProps({
  modelValue:    { type: Boolean, default: false },
  proposal:      { type: Object,  default: null  },
  currentUserId: { type: String,  default: null  },
});

const emit = defineEmits(["update:modelValue", "accept", "decline", "cancel", "complete", "counter"]);

// ── Photos status (lifted from TradePhotosPanel via v-model) ─────────────
const bothUploaded = ref(false);

// ── Chat overlay ──────────────────────────────────────────────────────────
const chatOpen = ref(false);

// ── Decline flow ──────────────────────────────────────────────────────────
const declining     = ref(false);
const declineReason = ref("");

// ── Computed helpers ──────────────────────────────────────────────────────
const statusMeta = computed(() => {
  if (!props.proposal) return {};
  const map = {
    pending:   { label: t('proposal.pending'),   color: "var(--c-trade)",  icon: "mdi-clock-outline" },
    accepted:  { label: t('proposal.accepted'),  color: "var(--c-mutual)", icon: "mdi-check-circle-outline" },
    declined:  { label: t('proposal.declined'),  color: "var(--c-accent)", icon: "mdi-close-circle-outline" },
    cancelled: { label: t('proposal.cancelled'), color: "var(--c-muted)",  icon: "mdi-cancel" },
    completed: { label: t('proposal.completed'), color: "var(--c-mutual)", icon: "mdi-handshake-outline" },
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

// ── Activity log ─────────────────────────────────────────────────────────
const events        = ref([]);
const loadingEvents = ref(false);

watch(
  () => [props.modelValue, props.proposal?.id],
  async ([open]) => {
    if (!open || !props.proposal?.id) { events.value = []; return; }
    loadingEvents.value = true;
    try {
      events.value = await fetchTradeEvents(props.proposal.id);
    } finally {
      loadingEvents.value = false;
    }
  },
  { immediate: true },
);

function eventMeta(type) {
  const map = {
    created:   { icon: "mdi-plus-circle-outline",  color: "var(--c-trade)",  label: t('tradeDetail.tradeProposed') },
    accepted:  { icon: "mdi-check-circle-outline",  color: "var(--c-mutual)", label: t('proposal.accepted')         },
    declined:  { icon: "mdi-close-circle-outline",  color: "var(--c-accent)", label: t('proposal.declined')         },
    cancelled: { icon: "mdi-cancel",                color: "var(--c-muted)",  label: t('proposal.cancelled')        },
    completed: { icon: "mdi-handshake-outline",     color: "var(--c-mutual)", label: t('proposal.completed')        },
    updated:   { icon: "mdi-pencil-circle-outline", color: "var(--c-muted)",  label: t('tradeDetail.proposalEdited')},
  };
  return map[type] ?? { icon: "mdi-information-outline", color: "var(--c-muted)", label: type };
}

function actorLabel(actorId) {
  if (!actorId) return "—";
  return actorId === props.currentUserId ? t('tradeDetail.you') : (props.proposal?.counterparty_name ?? t('tradeDetail.counterparty'));
}

function timeAgo(ts) {
  if (!ts) return "";
  const d    = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000)         return t('notifications.justNow', {}, { missingWarn: false }) || 'just now';
  if (diff < 3_600_000)      return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000)     return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)}d`;
  return d.toLocaleDateString();
}

function statusLabel(status) {
  const map = {
    pending:   t('proposal.pending'),
    accepted:  t('proposal.accepted'),
    declined:  t('proposal.declined'),
    cancelled: t('proposal.cancelled'),
    completed: t('proposal.completed'),
  };
  return map[status] ?? status;
}

// ── Actions ───────────────────────────────────────────────────────────────
function close() {
  chatOpen.value = false;
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
    max-width="1100"
    width="95vw"
    scrollable
  >
    <v-card
      v-if="proposal"
      class="!rounded-2xl overflow-hidden"
      style="background-color: var(--c-surface); color: var(--c-text); border: 1px solid var(--c-border)"
    >
      <!-- Header -->
      <div>
        <div class="flex items-center gap-2 md:gap-4 px-4 md:px-6 py-3 md:py-4">
          <div class="relative shrink-0">
            <div class="absolute -inset-1 rounded-full blur-md opacity-35"
              :style="{ backgroundColor: proposal.i_am_proposer ? 'var(--c-trade)' : 'var(--c-accent)' }" />
            <div
              class="relative size-9 md:size-11 rounded-full flex items-center justify-center font-bold text-sm text-white ring-2 ring-white/10"
              :style="{ backgroundColor: proposal.i_am_proposer ? 'var(--c-trade)' : 'var(--c-accent)' }"
            >{{ (proposal.counterparty_name ?? "?")[0].toUpperCase() }}</div>
          </div>
          <div class="flex flex-col grow min-w-0">
            <span class="font-bold text-sm md:text-lg leading-tight truncate" style="color: var(--c-text)">
              Trade #{{ proposal.id }} · {{ proposal.counterparty_name ?? t('tradeDetail.anonymous') }}
            </span>
            <span class="text-xs md:text-sm mt-1 truncate" style="color: var(--c-muted)">
              {{ proposal.i_am_proposer ? t('proposal.youProposed') : t('proposal.proposedToYou') }} · {{ formattedDate }}
            </span>
          </div>
          <span
            class="hidden sm:flex items-center gap-2 text-xs font-bold px-3 py-1 rounded-lg border shrink-0"
            :style="{ color: statusMeta.color, borderColor: statusMeta.color + '60', backgroundColor: statusMeta.color + '18' }"
          >
            <v-icon :icon="statusMeta.icon" size="14" :color="statusMeta.color" />
            {{ statusMeta.label }}
          </span>
          <v-btn
            icon="mdi-message-outline"
            variant="text"
            density="compact"
            style="color: var(--c-muted)"
            :title="t('tradeDetail.openChat')"
            @click="chatOpen = true"
          />
          <v-btn icon="mdi-close" variant="text" density="compact" style="color: var(--c-muted)" @click="close" />
        </div>
        <div class="h-px w-full" style="background: linear-gradient(90deg, var(--c-accent), transparent 40%, transparent 60%, var(--c-trade))" />
      </div>

      <!-- Body -->
      <v-card-text class="!pa-4 md:!pa-6" style="overflow-y: auto">

        <!-- Card columns -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section v-for="side in [
            { label: t('tradeDetail.youGive'),    icon: 'mdi-arrow-up-circle',   color: 'var(--c-accent)', cards: proposal.i_give,    qtyColor: 'var(--c-accent)' },
            { label: t('tradeDetail.youReceive'), icon: 'mdi-arrow-down-circle', color: 'var(--c-trade)',  cards: proposal.i_receive, qtyColor: 'var(--c-trade)' },
          ]" :key="side.label" class="flex flex-col gap-3">
            <div class="flex items-center gap-2 pb-1" style="border-bottom: 1px solid var(--c-border)">
              <v-icon :icon="side.icon" size="18" :color="side.color" />
              <span class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">{{ side.label }}</span>
              <span v-if="side.cards?.length" class="ml-auto text-[11px] font-semibold px-2 py-1 rounded-md"
                :style="{ background: `color-mix(in srgb, ${side.color} 15%, transparent)`, color: side.color }">
                {{ t('tradeDetail.cardCount', side.cards.length) }}
              </span>
            </div>
            <p v-if="!side.cards?.length" class="text-sm italic py-4 text-center" style="color: var(--c-muted)">{{ t('tradeDetail.nothingOnThisSide') }}</p>
            <div v-for="card in side.cards" :key="card.id"
              class="flex gap-3 rounded-lg px-3 py-3"
              style="background-color: var(--c-surface-2); border: 1px solid var(--c-border)">
              <img :src="cardImage(card.image_id)" :alt="card.name" loading="lazy"
                class="rounded-md object-contain shrink-0 ring-1 ring-white/10"
                style="width: 62px; height: 88px; background-color: var(--c-surface)" />
              <div class="flex flex-col gap-2 min-w-0 grow">
                <p class="font-semibold text-sm leading-tight" style="color: var(--c-text)">{{ card.name }}</p>
                <div class="flex flex-wrap gap-2">
                  <span v-if="card.extension" class="text-[11px] px-2 py-1 rounded font-mono"
                    style="background: color-mix(in srgb, var(--c-trade) 15%, transparent); color: var(--c-trade)">{{ card.extension }}</span>
                  <span v-if="card.rarity" class="text-[11px] px-2 py-1 rounded"
                    style="background: color-mix(in srgb, var(--c-muted) 15%, transparent); color: var(--c-text)"
                    :title="card.rarity">{{ shortenRarity(card.rarity) }}</span>
                  <span v-if="card.condition" class="text-[11px] px-2 py-1 rounded"
                    style="background: color-mix(in srgb, var(--c-muted) 12%, transparent); color: var(--c-muted)">{{ card.condition }}</span>
                  <span v-if="card.language" class="text-[11px] px-2 py-1 rounded"
                    style="background: color-mix(in srgb, var(--c-muted) 12%, transparent); color: var(--c-muted)">{{ card.language }}</span>
                </div>
                <p class="text-xs font-semibold mt-auto" style="color: var(--c-text)">
                  {{ t('tradeDetail.qty') }} <span :style="{ color: side.qtyColor }">{{ card.quantity }}</span>
                </p>
                <div class="flex gap-2 mt-1">
                  <a v-for="m in marketLinks(card.name, card.extension)" :key="m.label"
                    :href="m.url" target="_blank" rel="noopener noreferrer"
                    class="text-[11px] flex items-center gap-1 no-underline transition-opacity hover:opacity-70"
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
          <v-icon icon="mdi-message-reply-outline" size="16" color="var(--c-accent)" class="shrink-0 mt-1" />
          <div class="flex flex-col gap-1 min-w-0">
            <p class="text-xs font-semibold" style="color: var(--c-accent)">{{ t('tradeDetail.declineReason') }}</p>
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

        <!-- ── Activity log ── -->
        <div class="mt-6 pt-5" style="border-top: 1px solid var(--c-border)">
          <div class="flex items-center gap-2 mb-4">
            <v-icon icon="mdi-timeline-clock-outline" size="16" color="var(--c-muted)" />
            <span class="text-xs font-bold uppercase tracking-wide" style="color: var(--c-muted)">{{ t('tradeDetail.activityLog') }}</span>
          </div>

          <!-- Loading -->
          <div v-if="loadingEvents" class="flex items-center gap-3 py-2" style="color: var(--c-muted)">
            <v-progress-circular indeterminate size="16" width="2" color="var(--c-muted)" />
            <span class="text-xs">{{ t('common.loading') }}</span>
          </div>

          <!-- Empty (old trades before this feature was added) -->
          <p v-else-if="events.length === 0" class="text-xs italic py-2" style="color: var(--c-muted)">
            {{ t('tradeDetail.noEvents') }}
          </p>

          <!-- Timeline -->
          <div v-else class="flex flex-col">
            <div
              v-for="(evt, i) in events"
              :key="evt.id"
              class="flex gap-3 items-start py-2 relative"
            >
              <!-- Connector line to next event -->
              <div
                v-if="i < events.length - 1"
                class="absolute w-px"
                style="left: 11px; top: 22px; bottom: -8px; background-color: var(--c-border)"
              />

              <!-- Status icon -->
              <v-icon
                :icon="eventMeta(evt.event_type).icon"
                size="16"
                :color="eventMeta(evt.event_type).color"
                class="shrink-0 mt-[3px]"
              />

              <!-- Content -->
              <div class="flex flex-col min-w-0 grow gap-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-semibold leading-tight" style="color: var(--c-text)">
                    {{ eventMeta(evt.event_type).label }}
                  </span>

                  <!-- Actor badge -->
                  <span
                    class="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                    :style="{
                      color: eventMeta(evt.event_type).color,
                      background: `color-mix(in srgb, ${eventMeta(evt.event_type).color} 12%, transparent)`,
                    }"
                  >{{ actorLabel(evt.actor_id) }}</span>

                  <!-- Timestamp -->
                  <span class="text-[11px] ml-auto shrink-0" style="color: var(--c-muted)">
                    {{ timeAgo(evt.created_at) }}
                  </span>
                </div>

                <!-- Transition label (e.g. pending → accepted) -->
                <p v-if="evt.from_status" class="text-[11px]" style="color: var(--c-muted)">
                  {{ statusLabel(evt.from_status) }} → {{ statusLabel(evt.to_status) }}
                </p>

                <!-- Notes (e.g. decline reason) -->
                <p
                  v-if="evt.notes"
                  class="text-xs leading-snug italic mt-0.5 px-2 py-1.5 rounded-lg"
                  style="background: color-mix(in srgb, var(--c-muted) 8%, transparent); color: var(--c-text)"
                >"{{ evt.notes }}"</p>
              </div>
            </div>
          </div>
        </div>

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
                    { confirmed: iConfirmed,    label: t('tradeDetail.you'),                              icon: iConfirmed    ? 'mdi-check-circle' : 'mdi-circle-outline' },
                    { confirmed: theyConfirmed, label: proposal.counterparty_name ?? t('tradeDetail.counterparty'), icon: theyConfirmed ? 'mdi-check-circle' : 'mdi-clock-outline'  },
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
                <template v-if="!bothUploaded">{{ t('tradeDetail.uploadBothBeforeConfirm') }}</template>
                <template v-else-if="iConfirmed">{{ t('tradeDetail.waitingForConfirmDetail', { name: proposal.counterparty_name ?? t('proposal.them') }) }}</template>
                <template v-else>{{ t('tradeDetail.bothUploadedConfirmHint') }}</template>
              </p>
              <div class="flex gap-2 flex-wrap justify-end">
                <v-btn variant="outlined" prepend-icon="mdi-cancel"
                  style="border-color: var(--c-accent); color: var(--c-accent)"
                  @click="action('cancel')">{{ t('proposal.cancelTrade') }}</v-btn>
                <v-btn
                  v-if="!iConfirmed"
                  variant="flat" prepend-icon="mdi-handshake-outline"
                  :disabled="!bothUploaded"
                  :style="bothUploaded ? 'background-color: var(--c-mutual); color: #0C0820' : 'opacity: 0.45'"
                  @click="action('complete')">{{ t('proposal.confirmYourSide') }}</v-btn>
              </div>
            </div>
          </template>

          <!-- Pending actions -->
          <template v-else-if="isPending">
            <span class="text-xs grow" style="color: var(--c-muted)">
              <template v-if="!proposal.i_am_proposer && !bothUploaded">{{ t('tradeDetail.uploadBothToAccept') }}</template>
              <template v-else-if="!proposal.i_am_proposer && bothUploaded">{{ t('tradeDetail.photosVerifiedCanAccept') }}</template>
              <template v-else-if="proposal.i_am_proposer">{{ t('tradeDetail.waitingForReview', { name: proposal.counterparty_name ?? t('proposal.them') }) }}</template>
            </span>
            <div class="flex gap-2 shrink-0 flex-wrap w-full">
              <template v-if="!proposal.i_am_proposer">
                <template v-if="declining">
                  <div class="flex flex-col gap-2 w-full gap-5">
                    <textarea
                      v-model="declineReason"
                      :placeholder="t('tradeDetail.declinePlaceholder')"
                      rows="2"
                      class="w-full rounded-xl px-3 py-3 text-sm border outline-none resize-none"
                      :style="{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
                      autofocus
                    />
                    <div class="flex gap-2 justify-end">
                      <v-btn size="small" variant="text" style="color: var(--c-muted)" @click="declining = false">{{ t('common.back') }}</v-btn>
                      <v-btn size="small" variant="flat"
                        style="background-color: var(--c-accent); color: white"
                        @click="confirmDecline">{{ t('common.confirm') }}</v-btn>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <v-btn variant="text" prepend-icon="mdi-cancel" style="color: var(--c-muted)" @click="action('cancel')">{{ t('proposal.cancel') }}</v-btn>
                  <v-btn variant="outlined" prepend-icon="mdi-close"
                    style="border-color: var(--c-accent); color: var(--c-accent)"
                    @click="declining = true">{{ t('proposal.decline') }}</v-btn>
                  <v-btn variant="outlined" prepend-icon="mdi-swap-horizontal"
                    style="border-color: var(--c-trade); color: var(--c-trade)"
                    @click="emit('counter', proposal); close()">{{ t('proposal.counter') }}</v-btn>
                  <v-btn variant="flat" prepend-icon="mdi-check"
                    :disabled="!bothUploaded"
                    :style="bothUploaded ? 'background-color: var(--c-mutual); color: #0C0820' : 'opacity: 0.45'"
                    @click="action('accept')">{{ t('proposal.accept') }}</v-btn>
                </template>
              </template>
              <v-btn v-else variant="text" prepend-icon="mdi-cancel"
                style="color: var(--c-muted)"
                @click="action('cancel')">{{ t('proposal.cancel') }}</v-btn>
            </div>
          </template>

          <!-- Read-only -->
          <template v-else>
            <div class="ml-auto">
              <v-btn variant="text" style="color: var(--c-muted)" @click="close">{{ t('common.close') }}</v-btn>
            </div>
          </template>

        </div>
      </div>
    </v-card>
  </v-dialog>

  <!-- Floating chat overlay — opens on top of the trade dialog, no backdrop -->
  <TradeChatDialog
    v-model="chatOpen"
    :proposal="proposal"
    :current-user-id="currentUserId"
  />
</template>
