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
    max-width="1100"
    scrollable
  >
    <v-card v-if="user" class="bg-white text-gray-900">
      <v-card-title class="flex flex-row items-center gap-3 pa-5">
        <v-icon icon="mdi-swap-horizontal-bold" color="#85144B" size="28" />
        <div class="flex flex-col">
          <span class="text-lg font-bold text-gray-900">Propose trade</span>
          <span class="text-sm text-gray-700">with {{ user.name ?? "Anonymous" }}</span>
        </div>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-6">
        <p v-if="loading" class="text-center text-gray-700 py-6">Loading…</p>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <!-- ============== You give ============== -->
          <section class="flex flex-col gap-3">
            <div class="flex flex-row items-center justify-between">
              <p class="text-sm uppercase tracking-wide text-gray-700 font-semibold">You give</p>
              <!-- Inline 'Add card not in your library' button. -->
              <AddCard
                mode="trade"
                button-label="Add a card to offer"
                @added="onCardAdded"
              />
            </div>

            <p v-if="myOffers.length === 0" class="text-sm text-gray-600 py-2">
              Your trade pile is empty. Use "Add a card to offer" to list one and add it to this proposal.
            </p>

            <!--
              Layout per row (with breathing room):
                ┌────────────────────────────────────────────┐
                │ Card name (full width, truncates)          │
                │ ☑  [img]  meta · meta · meta   [- qty +]   │
                └────────────────────────────────────────────┘
            -->
            <div
              v-for="card in myOffers"
              :key="card.id"
              class="flex flex-col gap-3 border rounded-md p-4"
              :class="(giveSelection[card.id] ?? 0) > 0 ? 'border-pink-300 bg-pink-50' : 'border-gray-200'"
            >
              <div class="flex flex-row items-center gap-2">
                <p class="font-medium text-sm text-gray-900 truncate grow min-w-0" :title="card.name">
                  {{ card.name }}
                </p>
                <v-chip
                  v-if="card.theyWantThis"
                  size="x-small"
                  variant="flat"
                  class="shrink-0"
                  :style="{ backgroundColor: '#669911', color: 'white' }"
                >
                  They want this
                </v-chip>
              </div>

              <div class="flex flex-row gap-3 items-center min-w-0">
                <v-checkbox
                  :model-value="(giveSelection[card.id] ?? 0) > 0"
                  @update:model-value="giveSelection[card.id] = $event ? 1 : 0"
                  hide-details
                  density="compact"
                  color="#85144B"
                  class="shrink-0"
                />
                <img
                  :src="cardImage(card.image_id)"
                  :alt="card.name"
                  class="h-20 w-14 rounded-sm object-contain bg-gray-50 shrink-0"
                />
                <p class="text-xs text-gray-700 grow min-w-0 truncate" :title="describe(card)">
                  {{ describe(card) || "—" }}
                </p>
                <v-number-input
                  :model-value="giveSelection[card.id] ?? 0"
                  @update:model-value="giveSelection[card.id] = Number($event) || 0"
                  :min="0"
                  :max="card.quantity ?? 99"
                  control-variant="split"
                  density="compact"
                  hide-details
                  class="shrink-0"
                  style="width: 140px; flex: 0 0 140px"
                />
              </div>
            </div>
          </section>

          <!-- ============== You receive ============== -->
          <section class="flex flex-col gap-3">
            <p class="text-sm uppercase tracking-wide text-gray-700 font-semibold">You receive</p>
            <p v-if="(user.theyHave ?? []).length === 0" class="text-sm text-gray-600 py-2">
              They don't have anything on your wishlist.
            </p>
            <div
              v-for="card in user.theyHave"
              :key="card.id"
              class="flex flex-col gap-3 border rounded-md p-4"
              :class="(receiveSelection[card.id] ?? 0) > 0 ? 'border-blue-300 bg-blue-50' : 'border-gray-200'"
            >
              <p class="font-medium text-sm text-gray-900 truncate" :title="card.name">
                {{ card.name }}
              </p>
              <div class="flex flex-row gap-3 items-center min-w-0">
                <v-checkbox
                  :model-value="(receiveSelection[card.id] ?? 0) > 0"
                  @update:model-value="receiveSelection[card.id] = $event ? 1 : 0"
                  hide-details
                  density="compact"
                  color="#116699"
                  class="shrink-0"
                />
                <img
                  :src="cardImage(card.image_id)"
                  :alt="card.name"
                  class="h-20 w-14 rounded-sm object-contain bg-gray-50 shrink-0"
                />
                <p class="text-xs text-gray-700 grow min-w-0 truncate" :title="describe(card)">
                  {{ describe(card) || "—" }}
                </p>
                <v-number-input
                  :model-value="receiveSelection[card.id] ?? 0"
                  @update:model-value="receiveSelection[card.id] = Number($event) || 0"
                  :min="0"
                  :max="card.quantity ?? 99"
                  control-variant="split"
                  density="compact"
                  hide-details
                  class="shrink-0"
                  style="width: 140px; flex: 0 0 140px"
                />
              </div>
            </div>
          </section>
        </div>

        <v-alert v-if="errorMessage" type="error" variant="tonal" class="mt-4" density="compact">
          {{ errorMessage }}
        </v-alert>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-5">
        <v-spacer />
        <v-btn variant="text" @click="close" :disabled="submitting">Cancel</v-btn>
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
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
