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

function describe(card) {
  const bits = [card.extension, card.rarity, card.condition, card.language].filter(Boolean);
  return bits.join(" · ");
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="1000"
    scrollable
  >
    <v-card v-if="user" class="bg-gray-900 text-gray-100">
      <!-- Header -->
      <div class="flex items-center gap-4 px-6 py-4 border-b border-white/10">
        <div class="size-10 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0" style="background-color: #85144B">
          {{ (user.name ?? "?").split(/\s+/).map(p => p[0]?.toUpperCase()).slice(0,2).join("") }}
        </div>
        <div class="flex flex-col grow min-w-0">
          <span class="font-bold text-gray-100">Propose trade</span>
          <span class="text-xs text-gray-400">with {{ user.name ?? "Anonymous" }}</span>
        </div>
        <v-btn icon="mdi-close" variant="text" color="white" density="compact" @click="close" />
      </div>

      <v-card-text class="pa-6">
        <!-- Loading skeletons -->
        <div v-if="loading" class="grid grid-cols-2 gap-6">
          <div v-for="col in 2" :key="col" class="flex flex-col gap-3">
            <div class="h-4 w-24 bg-gray-700 rounded animate-pulse"></div>
            <div v-for="i in 3" :key="i" class="flex gap-3 p-3 rounded-xl border border-gray-700 animate-pulse">
              <div class="h-16 w-11 bg-gray-700 rounded shrink-0"></div>
              <div class="flex flex-col gap-2 grow pt-1">
                <div class="h-3 bg-gray-700 rounded w-3/4"></div>
                <div class="h-3 bg-gray-700 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <!-- ── You give ── -->
          <section class="flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <v-icon icon="mdi-arrow-up-circle" color="#85144B" size="20" />
                <p class="text-sm font-semibold text-gray-100 uppercase tracking-wide">You give</p>
                <span v-if="givePayload.length > 0" class="text-xs px-2 py-0.5 rounded-full bg-pink-900/50 text-pink-200 border border-pink-600/50 font-medium">{{ givePayload.length }}</span>
              </div>
              <AddCard mode="trade" button-label="Add to offer" @added="onCardAdded" />
            </div>

            <p v-if="myOffers.length === 0" class="text-sm text-gray-400 py-6 text-center">
              Your trade pile is empty. Add a card to offer above.
            </p>

            <div
              v-for="card in myOffers"
              :key="card.id"
              class="flex items-center gap-4 rounded-xl border p-4 cursor-pointer select-none transition-all"
              :class="(giveSelection[card.id] ?? 0) > 0
                ? 'border-pink-500/60 bg-pink-950/50'
                : 'border-gray-600 hover:border-gray-400'"
              @click="giveSelection[card.id] = (giveSelection[card.id] ?? 0) > 0 ? 0 : 1"
            >
              <v-checkbox
                :model-value="(giveSelection[card.id] ?? 0) > 0"
                @update:model-value="giveSelection[card.id] = $event ? 1 : 0"
                @click.stop
                hide-details density="compact" color="#85144B" class="shrink-0"
              />
              <img :src="cardImage(card.image_id)" :alt="card.name" class="h-16 w-11 rounded object-contain bg-gray-800 shrink-0" />
              <div class="flex flex-col grow min-w-0 gap-1">
                <p class="font-semibold text-sm text-white truncate">{{ card.name }}</p>
                <p class="text-xs text-gray-300 truncate">{{ describe(card) || "—" }}</p>
                <span v-if="card.theyWantThis" class="text-xs font-semibold text-lime-300 bg-lime-900/40 border border-lime-600/40 px-2 py-0.5 rounded w-fit">
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
            <div class="flex items-center gap-2">
              <v-icon icon="mdi-arrow-down-circle" color="#116699" size="20" />
              <p class="text-sm font-semibold text-gray-100 uppercase tracking-wide">You receive</p>
              <span v-if="receivePayload.length > 0" class="text-xs px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-200 border border-blue-600/50 font-medium">{{ receivePayload.length }}</span>
            </div>

            <p v-if="(user.theyHave ?? []).length === 0" class="text-sm text-gray-400 py-6 text-center">
              They don't have anything on your wishlist.
            </p>

            <div
              v-for="card in user.theyHave"
              :key="card.id"
              class="flex items-center gap-4 rounded-xl border p-4 cursor-pointer select-none transition-all"
              :class="(receiveSelection[card.id] ?? 0) > 0
                ? 'border-blue-500/60 bg-blue-950/50'
                : 'border-gray-600 hover:border-gray-400'"
              @click="receiveSelection[card.id] = (receiveSelection[card.id] ?? 0) > 0 ? 0 : 1"
            >
              <v-checkbox
                :model-value="(receiveSelection[card.id] ?? 0) > 0"
                @update:model-value="receiveSelection[card.id] = $event ? 1 : 0"
                @click.stop
                hide-details density="compact" color="#116699" class="shrink-0"
              />
              <img :src="cardImage(card.image_id)" :alt="card.name" class="h-16 w-11 rounded object-contain bg-gray-800 shrink-0" />
              <div class="flex flex-col grow min-w-0 gap-1">
                <p class="font-semibold text-sm text-white truncate">{{ card.name }}</p>
                <p class="text-xs text-gray-300 truncate">{{ describe(card) || "—" }}</p>
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

        <v-alert v-if="errorMessage" type="error" variant="tonal" class="mt-4" density="compact">
          {{ errorMessage }}
        </v-alert>
      </v-card-text>

      <div class="flex items-center justify-between px-6 py-4 border-t border-white/10">
        <p class="text-sm text-gray-300">
          <span v-if="givePayload.length > 0 || receivePayload.length > 0">
            Giving {{ givePayload.length }} card{{ givePayload.length !== 1 ? 's' : '' }},
            receiving {{ receivePayload.length }} card{{ receivePayload.length !== 1 ? 's' : '' }}
          </span>
          <span v-else>Select cards to include in the proposal.</span>
        </p>
        <div class="flex gap-3">
          <v-btn variant="text" color="gray" @click="close" :disabled="submitting">Cancel</v-btn>
          <v-btn
            variant="flat"
            style="background-color: #85144B; color: white"
            prepend-icon="mdi-send"
            :loading="submitting"
            :disabled="!canSubmit"
            @click="submit"
          >
            Send proposal
          </v-btn>
        </div>
      </div>
    </v-card>
  </v-dialog>
</template>
