<script setup>
import { ref, watch, computed } from "vue";
import { cardImage } from "@/lib/cardImage";
import { fetchMyTradePile, createTradeProposal } from "@/lib/matches";
import AddCard from "@/components/AddCard.vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // Matched user object from src/lib/matches.js
  user: { type: Object, default: null },
});

const emit = defineEmits(["update:modelValue", "submitted"]);

// Internal state
const myOffers = ref([]);          // ALL my trade-pile rows (not name-filtered)
const loading = ref(false);
const submitting = ref(false);
const errorMessage = ref("");

// Selection: maps card_id -> quantity. 0 means unselected.
const giveSelection = ref({});     // from myOffers
const receiveSelection = ref({});  // from user.theyHave

async function refreshMyOffers({ autoSelectId } = {}) {
  if (!props.user) return;
  loading.value = true;
  try {
    myOffers.value = await fetchMyTradePile(props.user.theyWant);
    if (autoSelectId != null) {
      giveSelection.value[autoSelectId] = 1;
    }
  } finally {
    loading.value = false;
  }
}

// Reset state and fetch offers whenever the dialog opens with a new user.
watch(
  () => [props.modelValue, props.user?.id],
  async ([open]) => {
    if (!open || !props.user) return;
    errorMessage.value = "";
    giveSelection.value = {};
    receiveSelection.value = {};

    // Pre-select everything they have for me, qty 1 each — the user can untick.
    for (const card of props.user.theyHave ?? []) {
      receiveSelection.value[card.id] = 1;
    }

    await refreshMyOffers();

    // Pre-select cards the counterparty actually wants. We don't pre-select
    // every trade-pile card, since now the list shows the user's full pile.
    for (const card of myOffers.value) {
      if (card.theyWantThis) giveSelection.value[card.id] = 1;
    }
  },
  { immediate: true }
);

// When AddCard inserts a new card, refresh and auto-select it.
async function onCardAdded(newRow) {
  if (!newRow?.id) return;
  await refreshMyOffers({ autoSelectId: newRow.id });
}

// Computed: arrays of {card_id, quantity} ready for the RPC.
const givePayload = computed(() =>
  Object.entries(giveSelection.value)
    .filter(([, q]) => Number(q) > 0)
    .map(([card_id, q]) => ({ card_id: Number(card_id), quantity: Number(q) }))
);
const receivePayload = computed(() =>
  Object.entries(receiveSelection.value)
    .filter(([, q]) => Number(q) > 0)
    .map(([card_id, q]) => ({ card_id: Number(card_id), quantity: Number(q) }))
);

const canSubmit = computed(
  () => !submitting.value && (givePayload.value.length > 0 || receivePayload.value.length > 0)
);

const userInitials = computed(() => {
  const name = props.user?.name?.trim();
  if (!name) return "?";
  return name.split(/\s+/).map(p => p[0]?.toUpperCase()).slice(0, 2).join("");
});

function close() {
  emit("update:modelValue", false);
}

async function submit() {
  if (!canSubmit.value || !props.user) return;
  submitting.value = true;
  errorMessage.value = "";
  try {
    const tradeId = await createTradeProposal(
      props.user.id,
      givePayload.value,
      receivePayload.value
    );
    emit("submitted", tradeId);
    close();
  } catch (err) {
    errorMessage.value = err?.message ?? "Failed to send proposal.";
  } finally {
    submitting.value = false;
  }
}

function shortenRarity(rarity) {
  return rarity ? rarity.split(' ').map(w => w[0]).join('') : '';
}

function describe(card) {
  const bits = [card.extension, shortenRarity(card.rarity), card.condition, card.language].filter(Boolean);
  return bits.join(" · ");
}

function marketLinks(name, setCode) {
  const q = encodeURIComponent(name);
  return [
    { label: 'TCGPlayer', url: `https://www.tcgplayer.com/search/yugioh/product?q=${q}` },
    { label: 'Cardmarket', url: setCode ? `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(setCode)}` : `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${q}` },
    { label: 'eBay', url: `https://www.ebay.com/sch/i.html?_nkw=${q}+yugioh` },
  ];
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="1000"
    scrollable
  >
    <v-card v-if="user" theme="dark" class="trade-dialog !rounded-2xl overflow-hidden" style="background-color: var(--c-surface); color: var(--c-text)">
      <!-- Header -->
      <div class="relative">
        <div class="flex items-center gap-4 px-6 py-4">
          <!-- User avatar -->
          <div class="relative shrink-0">
            <div class="absolute -inset-1 rounded-full blur-md opacity-40" style="background-color: var(--c-accent)" />
            <div
              class="relative size-11 rounded-full flex items-center justify-center font-bold text-sm text-white ring-2 ring-white/10"
              style="background-color: var(--c-accent)"
            >
              {{ userInitials }}
            </div>
          </div>
          <div class="flex flex-col grow min-w-0">
            <span class="font-bold text-lg text-gray-50 leading-tight">Propose trade</span>
            <span class="text-sm text-gray-400 mt-0.5">with {{ user.name ?? "Anonymous" }}</span>
          </div>
          <v-btn icon="mdi-close" variant="text" color="white" density="compact" @click="close" />
        </div>
        <!-- Gradient accent line -->
        <div class="h-[2px] w-full" style="background: linear-gradient(90deg, var(--c-accent), transparent 40%, transparent 60%, var(--c-trade))" />
      </div>

      <v-card-text class="pa-5">
        <!-- Loading skeletons -->
        <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div v-for="col in 2" :key="col" class="flex flex-col gap-4">
            <div class="h-5 w-28 rounded-lg skeleton-pulse" style="background-color: var(--c-skeleton)" />
            <div
              v-for="i in 3"
              :key="i"
              class="flex gap-3 p-4 rounded-xl border skeleton-pulse"
              :style="{ animationDelay: `${i * 150}ms`, borderColor: 'var(--c-border)' }"
            >
              <div class="h-[72px] w-[50px] rounded-lg shrink-0" style="background-color: var(--c-skeleton)" />
              <div class="flex flex-col gap-2.5 grow pt-2">
                <div class="h-3.5 rounded w-3/4" style="background-color: var(--c-skeleton)" />
                <div class="h-3 rounded w-1/2" style="background-color: var(--c-border)" />
              </div>
            </div>
          </div>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- ── You give ── -->
          <section class="flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-1 h-6 rounded-full bg-pink-500/80" />
                <v-icon icon="mdi-arrow-up-circle" :color="'var(--c-accent)'" size="20" />
                <p class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">You give</p>
                <span
                  v-if="givePayload.length > 0"
                  class="text-[11px] px-2 py-0.5 rounded-md bg-pink-500/15 text-pink-300 border border-pink-500/30 font-semibold"
                >
                  {{ givePayload.length }}
                </span>
              </div>
              <AddCard mode="trade" button-label="Add to offer" @added="onCardAdded" />
            </div>

            <p v-if="myOffers.length === 0" class="text-sm py-8 text-center flex flex-col items-center gap-3" style="color: var(--c-muted)">
              <v-icon icon="mdi-card-off-outline" size="36" color="#555" />
              <span>Your trade pile is empty.<br />Add a card to offer above.</span>
            </p>

            <div
              v-for="card in myOffers"
              :key="card.id"
              class="trade-row flex items-center gap-3 rounded-lg py-2 px-3 cursor-pointer select-none"
              :class="(giveSelection[card.id] ?? 0) > 0
                ? 'border-pink-500/50 bg-pink-950/40 shadow-[inset_0_0_20px_rgba(133,20,75,0.08)]'
                : 'hover:bg-[var(--c-surface-2)]'"
              :style="(giveSelection[card.id] ?? 0) > 0 ? {} : { borderColor: 'var(--c-border)' }"
              @click="giveSelection[card.id] = (giveSelection[card.id] ?? 0) > 0 ? 0 : 1"
            >
              <v-checkbox
                :model-value="(giveSelection[card.id] ?? 0) > 0"
                @update:model-value="giveSelection[card.id] = $event ? 1 : 0"
                @click.stop
                hide-details density="compact" color="var(--c-accent)" class="shrink-0"
              />
              <img
                :src="cardImage(card.image_id)"
                :alt="card.name"
                class="h-[72px] w-[50px] rounded-lg object-contain shrink-0 ring-1 ring-white/10" style="background-color: var(--c-surface-2)"
              />
              <div class="flex flex-col grow min-w-0 gap-1">
                <p class="font-semibold text-sm truncate" style="color: var(--c-text)">{{ card.name }}</p>
                <p class="text-xs truncate" style="color: var(--c-muted)">{{ describe(card) || "—" }}</p>
                <div class="flex gap-2">
                  <a
                    v-for="m in marketLinks(card.name, card.extension)" :key="m.label"
                    :href="m.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-[11px] no-underline flex items-center gap-0.5 transition-opacity hover:opacity-70"
                    style="color: var(--c-muted)"
                    @click.stop
                  >
                    <v-icon icon="mdi-open-in-new" size="11" />
                    {{ m.label }}
                  </a>
                </div>
                <span
                  v-if="card.theyWantThis"
                  class="text-[11px] font-bold text-lime-300 bg-lime-500/15 border border-lime-500/30 px-2 py-0.5 rounded-md w-fit flex items-center gap-1"
                >
                  <v-icon icon="mdi-star-four-points" size="10" color="#bef264" />
                  They want this
                </span>
              </div>
              <v-number-input
                v-if="(giveSelection[card.id] ?? 0) > 0"
                :model-value="giveSelection[card.id]"
                @update:model-value="giveSelection[card.id] = Number($event) || 0"
                :min="1" :max="card.quantity ?? 99"
                control-variant="split" density="compact" hide-details
                class="shrink-0" style="width: 120px; flex: 0 0 120px"
                @click.stop
              />
            </div>
          </section>

          <!-- ── You receive ── -->
          <section class="flex flex-col gap-4">
            <div class="flex items-center gap-3">
              <div class="w-1 h-6 rounded-full bg-blue-500/80" />
              <v-icon icon="mdi-arrow-down-circle" :color="'var(--c-trade)'" size="20" />
              <p class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">You receive</p>
              <span
                v-if="receivePayload.length > 0"
                class="text-[11px] px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold"
              >
                {{ receivePayload.length }}
              </span>
            </div>

            <p v-if="(user.theyHave ?? []).length === 0" class="text-sm py-8 text-center flex flex-col items-center gap-3" style="color: var(--c-muted)">
              <v-icon icon="mdi-card-off-outline" size="36" color="#555" />
              <span>They don't have anything<br />on your wishlist.</span>
            </p>

            <div
              v-for="card in user.theyHave"
              :key="card.id"
              class="trade-row flex items-center gap-3 rounded-lg py-2 px-3 cursor-pointer select-none"
              :class="(receiveSelection[card.id] ?? 0) > 0
                ? 'border-blue-500/50 bg-blue-950/40 shadow-[inset_0_0_20px_rgba(17,102,153,0.08)]'
                : 'hover:bg-[var(--c-surface-2)]'"
              :style="(receiveSelection[card.id] ?? 0) > 0 ? {} : { borderColor: 'var(--c-border)' }"
              @click="receiveSelection[card.id] = (receiveSelection[card.id] ?? 0) > 0 ? 0 : 1"
            >
              <v-checkbox
                :model-value="(receiveSelection[card.id] ?? 0) > 0"
                @update:model-value="receiveSelection[card.id] = $event ? 1 : 0"
                @click.stop
                hide-details density="compact" color="var(--c-trade)" class="shrink-0"
              />
              <img
                :src="cardImage(card.image_id)"
                :alt="card.name"
                class="h-[72px] w-[50px] rounded-lg object-contain shrink-0 ring-1 ring-white/10" style="background-color: var(--c-surface-2)"
              />
              <div class="flex flex-col grow min-w-0 gap-1">
                <p class="font-semibold text-sm truncate" style="color: var(--c-text)">{{ card.name }}</p>
                <p class="text-xs truncate" style="color: var(--c-muted)">{{ describe(card) || "—" }}</p>
                <div class="flex gap-2">
                  <a
                    v-for="m in marketLinks(card.name, card.extension)" :key="m.label"
                    :href="m.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-[11px] no-underline flex items-center gap-0.5 transition-opacity hover:opacity-70"
                    style="color: var(--c-muted)"
                    @click.stop
                  >
                    <v-icon icon="mdi-open-in-new" size="11" />
                    {{ m.label }}
                  </a>
                </div>
              </div>
              <v-number-input
                v-if="(receiveSelection[card.id] ?? 0) > 0"
                :model-value="receiveSelection[card.id]"
                @update:model-value="receiveSelection[card.id] = Number($event) || 0"
                :min="1" :max="card.quantity ?? 99"
                control-variant="split" density="compact" hide-details
                class="shrink-0" style="width: 120px; flex: 0 0 120px"
                @click.stop
              />
            </div>
          </section>
        </div>

        <v-alert v-if="errorMessage" type="error" variant="tonal" class="mt-6" density="compact">
          {{ errorMessage }}
        </v-alert>
      </v-card-text>

      <!-- Footer -->
      <div class="relative">
        <div class="h-[2px] w-full" style="background: linear-gradient(90deg, var(--c-accent), transparent 40%, transparent 60%, var(--c-trade))" />
        <div class="flex items-center justify-between px-6 py-4">
          <div class="text-sm flex items-center gap-4" style="color: var(--c-muted)">
            <span v-if="givePayload.length > 0 || receivePayload.length > 0" class="flex items-center gap-4">
              <span class="flex items-center gap-1.5">
                <v-icon icon="mdi-arrow-up-bold" size="14" color="#d06b94" />
                <span class="text-pink-300 font-semibold">{{ givePayload.length }}</span>
              </span>
              <v-icon icon="mdi-swap-horizontal" size="16" color="#666" />
              <span class="flex items-center gap-1.5">
                <v-icon icon="mdi-arrow-down-bold" size="14" color="#5b9bd5" />
                <span class="text-blue-300 font-semibold">{{ receivePayload.length }}</span>
              </span>
            </span>
            <span v-else class="text-gray-500">Select cards to include in the proposal.</span>
          </div>
          <div class="flex gap-3">
            <v-btn variant="text" color="gray" @click="close" :disabled="submitting">Cancel</v-btn>
            <v-btn
              variant="flat"
              style="background-color: var(--c-accent); color: white"
              prepend-icon="mdi-send"
              class="!rounded-xl"
              :loading="submitting"
              :disabled="!canSubmit"
              @click="submit"
            >
              Send proposal
            </v-btn>
          </div>
        </div>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.trade-dialog {
  border: 1px solid var(--c-border);
}
.trade-row {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.skeleton-pulse {
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
