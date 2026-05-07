<script setup>
import { ref, watch, computed } from "vue";
import { cardImage } from "@/lib/cardImage";
import { fetchMyLibrary, createTradeProposal, updateTradeProposal, counterTradeProposal, fetchUserWishlist, fetchUserTradePile, fetchMyWishlistNames, uploadTradePhoto } from "@/lib/matches";
import { searchById } from "@/api";
import { getClient } from "@/lib/supabaseClient";
import AddCard from "@/components/AddCard.vue";

const props = defineProps({
  modelValue:      { type: Boolean, default: false },
  // Matched user object — required for new proposals, null when editing/countering
  user:            { type: Object, default: null },
  // Existing proposal to edit — when set the dialog opens in edit mode
  editProposal:    { type: Object, default: null },
  // Received proposal to counter — opens counter mode (same columns, new proposal)
  counterProposal: { type: Object, default: null },
});

const emit = defineEmits(["update:modelValue", "submitted", "updated", "countered"]);

// Derived: the counterparty regardless of mode
const effectiveUser = computed(() => {
  if (props.editProposal) {
    return { id: props.editProposal.counterparty_id,   name: props.editProposal.counterparty_name };
  }
  if (props.counterProposal) {
    return { id: props.counterProposal.counterparty_id, name: props.counterProposal.counterparty_name };
  }
  return props.user;
});

const isEditing   = computed(() => !!props.editProposal);
const isCountering = computed(() => !!props.counterProposal);

// Internal state
const myOffers = ref([]);              // My full library (trade pile + wishlist)
const theirTradePile = ref([]);        // Full trade pile of the counterparty
const counterpartyWishlist = ref([]); // Counterparty's wishlist (for inline suggestions)
const loadingTheirs = ref(false);
const loadingWishlist = ref(false);
const giveFilter = ref("");            // Search filter for the give column
const theirFilter = ref("");           // Search filter for the receive column
const loading = ref(false);
const submitting = ref(false);
const errorMessage = ref("");

// Settlement details
const settlement = ref({ trade_method: null, hasCash: false, cash_amount: null, cash_payer: 'proposer' });

const METHODS = [
  { value: 'in_person', label: 'Meet in person', icon: 'mdi-handshake-outline' },
  { value: 'mail',      label: 'By mail',         icon: 'mdi-package-variant-closed' },
  { value: 'other',     label: 'Other',            icon: 'mdi-dots-horizontal' },
];

// Selection: maps card_id -> quantity. 0 means unselected.
const giveSelection = ref({});     // from myOffers
const receiveSelection = ref({});  // from user.theyHave

async function refreshMyOffers({ autoSelectId } = {}) {
  loading.value = true;
  try {
    const wishlistNames = counterpartyWishlist.value.map(c => c.name);
    myOffers.value = await fetchMyLibrary(wishlistNames);
    if (autoSelectId != null) {
      giveSelection.value[autoSelectId] = 1;
    }
  } finally {
    loading.value = false;
  }
}

// Reset state and fetch offers whenever the dialog opens or the target changes.
watch(
  () => [props.modelValue, props.user?.id, props.editProposal?.id, props.counterProposal?.id],
  async ([open]) => {
    const eu = effectiveUser.value;
    if (!open || !eu?.id) return;

    errorMessage.value = "";
    giveSelection.value = {};
    receiveSelection.value = {};
    giveFilter.value = "";
    theirFilter.value = "";
    removePhoto();

    // Settlement pre-population
    const src = props.editProposal ?? props.counterProposal;
    settlement.value = src ? {
      trade_method: src.trade_method ?? null,
      hasCash:      src.cash_amount != null,
      cash_amount:  src.cash_amount ?? null,
      cash_payer:   src.cash_payer  ?? 'proposer',
    } : { trade_method: null, hasCash: false, cash_amount: null, cash_payer: 'proposer' };

    // Fetch counterparty wishlist + their trade pile in parallel.
    // For the "On your wishlist" tag on counterparty cards we need the
    // *current user's* actual wishlist names — not the proposal's i_receive,
    // which was the previous (wrong) source in edit/counter mode.
    loadingTheirs.value = true;
    loadingWishlist.value = true;
    const [wishlist, pile] = await Promise.all([
      fetchUserWishlist(eu.id),
      // In edit/counter mode: fetch real wishlist names from DB.
      // In new-proposal mode: the matched-user object already carries theyHave
      // (pre-computed intersection) so we reuse that to avoid an extra round-trip.
      (async () => {
        const myWishNames = (isEditing.value || isCountering.value)
          ? await fetchMyWishlistNames()
          : (props.user?.theyHave ?? []).map(c => c.name);
        return fetchUserTradePile(eu.id, myWishNames);
      })(),
    ]);
    counterpartyWishlist.value = wishlist ?? [];
    theirTradePile.value = pile ?? [];
    loadingTheirs.value = false;
    loadingWishlist.value = false;

    // Fetch my library tagged with what the counterparty wants
    await refreshMyOffers();

    if (isEditing.value) {
      // Cards on this proposal's give side are reserved — override locally
      const ownedByThisTrade = new Set((props.editProposal.i_give ?? []).map(c => c.id));
      myOffers.value = myOffers.value.map(card =>
        ownedByThisTrade.has(card.id) ? { ...card, status: 'available' } : card
      );
      // Pre-populate selections
      const giveMap    = new Map((props.editProposal.i_give    ?? []).map(c => [c.id, c.quantity ?? 1]));
      const receiveMap = new Map((props.editProposal.i_receive ?? []).map(c => [c.id, c.quantity ?? 1]));
      for (const card of myOffers.value)      { if (giveMap.has(card.id))    giveSelection.value[card.id]    = giveMap.get(card.id);    }
      for (const card of theirTradePile.value) { if (receiveMap.has(card.id)) receiveSelection.value[card.id] = receiveMap.get(card.id); }

    } else if (isCountering.value) {
      // The original proposer's give cards are reserved in the DB.
      // After cancellation they'll be free — override locally so the user
      // can keep, add, or remove them in their counter-offer.
      const inOriginalReceive = new Set((props.counterProposal.i_receive ?? []).map(c => c.id));
      theirTradePile.value = theirTradePile.value.map(card =>
        inOriginalReceive.has(card.id) ? { ...card, status: 'available' } : card
      );
      // Pre-populate with the same cards as the received proposal
      const giveMap    = new Map((props.counterProposal.i_give    ?? []).map(c => [c.id, c.quantity ?? 1]));
      const receiveMap = new Map((props.counterProposal.i_receive ?? []).map(c => [c.id, c.quantity ?? 1]));
      for (const card of myOffers.value)      { if (giveMap.has(card.id))    giveSelection.value[card.id]    = giveMap.get(card.id);    }
      for (const card of theirTradePile.value) { if (receiveMap.has(card.id)) receiveSelection.value[card.id] = receiveMap.get(card.id); }

    } else {
      // New proposal — auto-select obvious matches
      for (const card of theirTradePile.value) {
        if (card.matchesMyWishlist && card.status !== 'locked') receiveSelection.value[card.id] = 1;
      }
      for (const card of myOffers.value) {
        if (card.theyWantThis && !card.isWishlist) giveSelection.value[card.id] = 1;
      }
    }
  },
  { immediate: true }
);

// Filtered give column
const filteredMyOffers = computed(() => {
  const q = giveFilter.value.toLowerCase().trim();
  if (!q) return myOffers.value;
  return myOffers.value.filter(c => c.name?.toLowerCase().includes(q));
});

// Filtered view of their trade pile
const filteredTheirPile = computed(() => {
  const q = theirFilter.value.toLowerCase().trim();
  if (!q) return theirTradePile.value;
  return theirTradePile.value.filter(c => c.name?.toLowerCase().includes(q));
});

// Whether their pile has cards beyond the wishlist matches
const theirPileHasExtras = computed(() =>
  theirTradePile.value.some(c => !c.matchesMyWishlist)
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
  const name = effectiveUser.value?.name?.trim();
  if (!name) return "?";
  return name.split(/\s+/).map(p => p[0]?.toUpperCase()).slice(0, 2).join("");
});

function close() {
  emit("update:modelValue", false);
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  errorMessage.value = "";
  const settlementPayload = {
    trade_method: settlement.value.trade_method || null,
    cash_amount:  settlement.value.hasCash && settlement.value.cash_amount > 0 ? settlement.value.cash_amount : null,
    cash_payer:   settlement.value.hasCash && settlement.value.cash_amount > 0 ? settlement.value.cash_payer : null,
  };
  try {
    const me = (await getClient().auth.getUser()).data?.user?.id;
    let tradeId;
    if (isEditing.value) {
      tradeId = props.editProposal.id;
      await updateTradeProposal(tradeId, givePayload.value, receivePayload.value, settlementPayload);
      emit("updated", tradeId);
    } else if (isCountering.value) {
      tradeId = await counterTradeProposal(props.counterProposal.id, givePayload.value, receivePayload.value, settlementPayload);
      emit("countered", tradeId);
    } else {
      tradeId = await createTradeProposal(props.user.id, givePayload.value, receivePayload.value, settlementPayload);
      emit("submitted", tradeId);
    }
    // Upload verification photo if one was selected
    if (photoFile.value && tradeId && me) {
      await uploadTradePhoto(tradeId, me, photoFile.value);
    }
    close();
  } catch (err) {
    errorMessage.value = err?.message ?? "Failed to save proposal.";
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

// Photo upload
const photoFile    = ref(null);
const photoPreview = ref(null);
const photoInput   = ref(null);

function onPhotoSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  photoFile.value = file;
  photoPreview.value = URL.createObjectURL(file);
}
function removePhoto() {
  photoFile.value = null;
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value);
  photoPreview.value = null;
  if (photoInput.value) photoInput.value.value = "";
}

// Inline "add to offer" suggestions panel (counterparty's wishlist)
const showWantedPicker = ref(false);
const wantedFilter = ref('');
const fetchingCardId = ref(null);
const addCardRef = ref(null);

function openWantedPicker() {
  showWantedPicker.value = !showWantedPicker.value;
  if (!showWantedPicker.value) wantedFilter.value = '';
}

// Reset per-user caches when the counterparty changes
watch(() => props.user?.id ?? props.editProposal?.id ?? props.counterProposal?.id, () => {
  counterpartyWishlist.value = [];
  theirTradePile.value = [];
});

const filteredWanted = computed(() => {
  const q = wantedFilter.value.toLowerCase().trim();
  return counterpartyWishlist.value.filter(c => {
    if (q && !c.name.toLowerCase().includes(q)) return false;
    // Hide cards the user has already committed to giving (avoid the confusion of
    // a card appearing in both "You give" and "Cards they want" simultaneously)
    const alreadyOffered = myOffers.value.some(
      mo => mo.name === c.name && (giveSelection.value[mo.id] ?? 0) > 0
    );
    return !alreadyOffered;
  });
});

async function selectWantedCard(item) {
  // If the user already has this card in their library, select it and close
  const existing = myOffers.value.find(c => c.name === item.name && c.status !== 'locked');
  if (existing) {
    giveSelection.value[existing.id] = Math.max(giveSelection.value[existing.id] ?? 0, 1) || 1;
    showWantedPicker.value = false;
    wantedFilter.value = '';
    return;
  }
  // Otherwise open AddCard to add it to the library
  fetchingCardId.value = item.id;
  try {
    const res = await searchById(item.image_id);
    const card = res.data?.data?.[0] ?? res.data?.[0] ?? null;
    if (card) {
      showWantedPicker.value = false;
      wantedFilter.value = '';
      addCardRef.value.openWith(card, item.extension);
    }
  } finally {
    fetchingCardId.value = null;
  }
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
    max-width="100vw"
    width="100vw"
    height="100dvh"
    scrollable
  >
    <v-card v-if="effectiveUser" theme="dark" class="trade-dialog !rounded-none overflow-hidden" style="background-color: var(--c-surface); color: var(--c-text); height: 100dvh; display: flex; flex-direction: column">
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
            <span class="font-bold text-lg leading-tight" style="color: var(--c-text)">
              {{ isEditing ? 'Edit proposal' : isCountering ? 'Counter-propose' : 'Propose trade' }}
            </span>
            <span class="text-sm mt-0.5" style="color: var(--c-muted)">with {{ effectiveUser.name ?? "Anonymous" }}</span>
          </div>
          <v-btn icon="mdi-close" variant="text" color="white" density="compact" @click="close" />
        </div>
        <!-- Gradient accent line -->
        <div class="h-[2px] w-full" style="background: linear-gradient(90deg, var(--c-accent), transparent 40%, transparent 60%, var(--c-trade))" />
      </div>

      <v-card-text class="pa-5" style="overflow: hidden; display: flex; flex-direction: column; min-height: 0; flex: 1;">
        <!-- Loading skeletons -->
        <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
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

        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6 h-full min-h-0">
          <!-- ── You give ── -->
          <section class="flex flex-col gap-3 min-h-0">
            <!-- Header -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <v-icon icon="mdi-arrow-up-circle" :color="'var(--c-accent)'" size="20" />
                <p class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">You give</p>
                <span
                  v-if="givePayload.length > 0"
                  class="text-[11px] px-2 py-0.5 rounded-md bg-pink-500/15 text-pink-300 border border-pink-500/30 font-semibold"
                >{{ givePayload.length }}</span>
              </div>
              <v-btn
                density="comfortable"
                variant="flat"
                prepend-icon="mdi-heart-search"
                :style="showWantedPicker
                  ? { backgroundColor: 'var(--c-surface-2)', color: 'var(--c-text)' }
                  : { backgroundColor: 'var(--c-trade)', color: 'white' }"
                @click="openWantedPicker"
              >{{ showWantedPicker ? 'Hide suggestions' : 'Add to offer' }}</v-btn>
            </div>

            <!-- Inline "what they want" suggestions panel -->
            <div v-if="showWantedPicker" class="rounded-xl border overflow-hidden" style="border-color: var(--c-border); background-color: var(--c-surface-2)">
              <div class="flex items-center gap-2 px-3 py-2 border-b" style="border-color: var(--c-border)">
                <v-icon icon="mdi-heart-search" size="14" color="var(--c-trade)" />
                <span class="text-[11px] font-bold uppercase tracking-wide grow" style="color: var(--c-trade)">Cards they want</span>
                <span class="text-[10px]" style="color: var(--c-muted)">Click to select · not in library opens AddCard</span>
              </div>
              <!-- Search -->
              <div class="px-3 pt-2 pb-1">
                <div class="relative">
                  <v-icon icon="mdi-magnify" size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" color="var(--c-muted)" />
                  <input
                    v-model="wantedFilter"
                    placeholder="Filter…"
                    class="w-full rounded-lg pl-7 pr-2 py-1.5 text-xs outline-none border"
                    :style="{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
                    autofocus
                  />
                </div>
              </div>
              <!-- Skeleton -->
              <div v-if="loadingWishlist" class="flex gap-2 px-3 py-2 overflow-x-auto">
                <div v-for="i in 5" :key="i" class="shrink-0 h-16 w-12 rounded-lg skeleton-pulse" style="background-color: var(--c-skeleton)" />
              </div>
              <!-- Empty -->
              <p v-else-if="!filteredWanted.length" class="text-xs text-center py-4" style="color: var(--c-muted)">
                {{ counterpartyWishlist.length === 0 ? 'Their wishlist is empty.' : 'No matches.' }}
              </p>
              <!-- Cards strip -->
              <div v-else class="flex gap-2 px-3 py-2 overflow-x-auto suggestions-scroll">
                <div
                  v-for="item in filteredWanted"
                  :key="item.id"
                  class="shrink-0 relative cursor-pointer group"
                  style="width: 52px"
                  @click="selectWantedCard(item)"
                >
                  <img
                    :src="cardImage(item.image_id)"
                    :alt="item.name"
                    loading="lazy"
                    class="w-full rounded-lg object-contain ring-1 transition-all group-hover:ring-2"
                    :style="{
                      height: '72px',
                      backgroundColor: 'var(--c-surface)',
                      ringColor: myOffers.some(c => c.name === item.name) ? 'var(--c-mutual)' : 'var(--c-border)',
                    }"
                  />
                  <!-- "You have it" dot -->
                  <span
                    v-if="myOffers.some(c => c.name === item.name && c.status !== 'locked')"
                    class="absolute -top-1 -right-1 size-3.5 rounded-full border-2 flex items-center justify-center"
                    style="background-color: var(--c-mutual); border-color: var(--c-surface-2)"
                    title="Already in your library"
                  />
                  <v-progress-circular v-if="fetchingCardId === item.id" indeterminate size="14" width="2" class="absolute inset-0 m-auto" />
                  <!-- Name tooltip on hover -->
                  <div
                    class="absolute -bottom-0.5 left-0 right-0 rounded-b-lg px-0.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    style="background: linear-gradient(to top, rgba(0,0,0,0.85), transparent)"
                  >
                    <p class="text-[8px] text-white leading-tight line-clamp-2">{{ item.name }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Give column search -->
            <div class="relative">
              <v-icon icon="mdi-magnify" size="16" class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" color="var(--c-muted)" />
              <input
                v-model="giveFilter"
                placeholder="Search your library…"
                class="w-full rounded-lg pl-8 pr-3 py-2 text-sm outline-none border"
                :style="{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
              />
            </div>

            <!-- Card list -->
            <div class="overflow-y-auto flex flex-col gap-3 pr-1 flex-1 min-h-0 column-scroll">
              <p v-if="myOffers.length === 0" class="text-sm py-8 text-center flex flex-col items-center gap-3" style="color: var(--c-muted)">
                <v-icon icon="mdi-card-off-outline" size="36" color="var(--c-muted)" />
                <span>Your library is empty.<br />Add a card to offer above.</span>
              </p>
              <p v-else-if="filteredMyOffers.length === 0" class="text-sm py-8 text-center flex flex-col items-center gap-3" style="color: var(--c-muted)">
                <v-icon icon="mdi-magnify-close" size="36" color="var(--c-muted)" />
                <span>No cards match your search.</span>
              </p>

              <template v-for="card in filteredMyOffers" :key="card.id">
                <div
                  role="checkbox"
                  :aria-checked="(giveSelection[card.id] ?? 0) > 0"
                  :aria-disabled="card.status === 'locked'"
                  :aria-label="card.name"
                  :tabindex="card.status === 'locked' ? -1 : 0"
                  class="trade-row flex items-center gap-3 rounded-lg py-2 px-3 select-none"
                  :class="[
                    card.status === 'locked' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                    card.status !== 'locked' && (giveSelection[card.id] ?? 0) > 0
                      ? 'border-pink-500/50 bg-pink-950/40 shadow-[inset_0_0_20px_rgba(133,20,75,0.08)]'
                      : card.status !== 'locked' ? 'hover:bg-[var(--c-surface-2)]' : '',
                  ]"
                  :style="card.status !== 'locked' && (giveSelection[card.id] ?? 0) > 0 ? {} : { borderColor: 'var(--c-border)' }"
                  @click="card.status !== 'locked' && (giveSelection[card.id] = (giveSelection[card.id] ?? 0) > 0 ? 0 : 1)"
                  @keydown.space.prevent="card.status !== 'locked' && (giveSelection[card.id] = (giveSelection[card.id] ?? 0) > 0 ? 0 : 1)"
                  @keydown.enter="card.status !== 'locked' && (giveSelection[card.id] = (giveSelection[card.id] ?? 0) > 0 ? 0 : 1)"
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
                    loading="lazy"
                    class="h-[88px] w-[62px] rounded-lg object-contain shrink-0 ring-1 ring-white/10"
                    style="background-color: var(--c-surface-2)"
                  />
                  <div class="flex flex-col grow min-w-0 gap-1">
                    <p class="font-semibold text-sm truncate" style="color: var(--c-text)">{{ card.name }}</p>
                    <p class="text-xs truncate" style="color: var(--c-muted)">{{ describe(card) || "—" }}</p>
                    <div class="flex gap-2">
                      <a
                        v-for="m in marketLinks(card.name, card.extension)" :key="m.label"
                        :href="m.url" target="_blank" rel="noopener noreferrer"
                        class="text-[11px] no-underline flex items-center gap-0.5 transition-opacity hover:opacity-70"
                        style="color: var(--c-muted)" @click.stop
                      >
                        <v-icon icon="mdi-open-in-new" size="11" />{{ m.label }}
                      </a>
                    </div>
                    <span
                      v-if="card.theyWantThis"
                      class="text-[11px] font-bold text-lime-300 bg-lime-500/15 border border-lime-500/30 px-2 py-0.5 rounded-md w-fit flex items-center gap-1"
                    ><v-icon icon="mdi-star-four-points" size="10" color="var(--c-mutual)" />They want this</span>
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
              </template>
            </div><!-- /column-scroll give -->
          </section>

          <!-- ── You receive ── -->
          <section class="flex flex-col gap-4 min-h-0">
            <div class="flex items-center gap-3">
              <v-icon icon="mdi-arrow-down-circle" :color="'var(--c-trade)'" size="20" />
              <p class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">You receive</p>
              <span
                v-if="receivePayload.length > 0"
                class="text-[11px] px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 font-semibold"
              >
                {{ receivePayload.length }}
              </span>
              <span v-if="theirPileHasExtras" class="text-[11px] ml-auto" style="color: var(--c-muted)">
                {{ theirTradePile.length }} card{{ theirTradePile.length !== 1 ? 's' : '' }} available
              </span>
            </div>

            <!-- Search filter — only shown when they have more than wishlist matches -->
            <div v-if="theirPileHasExtras" class="relative">
              <v-icon icon="mdi-magnify" size="16" class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" color="var(--c-muted)" />
              <input
                v-model="theirFilter"
                placeholder="Search their trade pile…"
                class="w-full rounded-lg pl-8 pr-3 py-2 text-sm outline-none border"
                :style="{
                  backgroundColor: 'var(--c-surface-2)',
                  borderColor: 'var(--c-border)',
                  color: 'var(--c-text)',
                }"
              />
            </div>

            <div class="overflow-y-auto flex flex-col gap-3 pr-1 flex-1 min-h-0 column-scroll">

              <!-- Loading skeleton -->
              <template v-if="loadingTheirs">
                <div
                  v-for="i in 4" :key="i"
                  class="flex gap-3 p-4 rounded-xl border skeleton-pulse"
                  :style="{ animationDelay: `${i * 120}ms`, borderColor: 'var(--c-border)' }"
                >
                  <div class="h-[72px] w-[50px] rounded-lg shrink-0" style="background-color: var(--c-skeleton)" />
                  <div class="flex flex-col gap-2.5 grow pt-2">
                    <div class="h-3.5 rounded w-3/4" style="background-color: var(--c-skeleton)" />
                    <div class="h-3 rounded w-1/2" style="background-color: var(--c-border)" />
                  </div>
                </div>
              </template>

              <template v-else>
                <!-- Empty state -->
                <p v-if="theirTradePile.length === 0" class="text-sm py-8 text-center flex flex-col items-center gap-3" style="color: var(--c-muted)">
                  <v-icon icon="mdi-card-off-outline" size="36" color="var(--c-muted)" />
                  <span>Their trade pile is empty.</span>
                </p>
                <p v-else-if="filteredTheirPile.length === 0" class="text-sm py-8 text-center flex flex-col items-center gap-3" style="color: var(--c-muted)">
                  <v-icon icon="mdi-magnify-close" size="36" color="var(--c-muted)" />
                  <span>No cards match your search.</span>
                </p>

                <!-- Wishlist match divider -->
                <p
                  v-if="filteredTheirPile.some(c => c.matchesMyWishlist) && filteredTheirPile.some(c => !c.matchesMyWishlist)"
                  class="text-[10px] font-bold uppercase tracking-widest pt-1 pb-0.5"
                  style="color: var(--c-muted)"
                >
                  Matches your wishlist
                </p>

                <template v-for="(card, idx) in filteredTheirPile" :key="card.id">
                  <!-- Section break between wishlist matches and extras -->
                  <p
                    v-if="idx > 0 && !card.matchesMyWishlist && filteredTheirPile[idx - 1].matchesMyWishlist"
                    class="text-[10px] font-bold uppercase tracking-widest pt-2 pb-0.5"
                    style="color: var(--c-muted)"
                  >
                    Their full trade pile
                  </p>

                  <div
                    role="checkbox"
                    :aria-checked="(receiveSelection[card.id] ?? 0) > 0"
                    :aria-disabled="card.status === 'locked'"
                    :aria-label="card.name"
                    :tabindex="card.status === 'locked' ? -1 : 0"
                    class="trade-row flex items-center gap-3 rounded-lg py-2 px-3 select-none"
                    :class="[
                      card.status === 'locked'
                        ? 'opacity-50 cursor-not-allowed'
                        : 'cursor-pointer',
                      card.status !== 'locked' && (receiveSelection[card.id] ?? 0) > 0
                        ? 'border-blue-500/50 bg-blue-950/40 shadow-[inset_0_0_20px_rgba(17,102,153,0.08)]'
                        : card.status !== 'locked' ? 'hover:bg-[var(--c-surface-2)]' : '',
                    ]"
                    :style="card.status !== 'locked' && (receiveSelection[card.id] ?? 0) > 0 ? {} : { borderColor: 'var(--c-border)' }"
                    @click="card.status !== 'locked' && (receiveSelection[card.id] = (receiveSelection[card.id] ?? 0) > 0 ? 0 : 1)"
                    @keydown.space.prevent="card.status !== 'locked' && (receiveSelection[card.id] = (receiveSelection[card.id] ?? 0) > 0 ? 0 : 1)"
                    @keydown.enter="card.status !== 'locked' && (receiveSelection[card.id] = (receiveSelection[card.id] ?? 0) > 0 ? 0 : 1)"
                  >
                    <v-checkbox
                      :model-value="(receiveSelection[card.id] ?? 0) > 0"
                      @update:model-value="card.status !== 'locked' && (receiveSelection[card.id] = $event ? 1 : 0)"
                      @click.stop
                      hide-details density="compact" color="var(--c-trade)" class="shrink-0"
                    />
                    <img
                      :src="cardImage(card.image_id)"
                      :alt="card.name"
                      loading="lazy"
                      class="h-[88px] w-[62px] rounded-lg object-contain shrink-0 ring-1 ring-white/10"
                      style="background-color: var(--c-surface-2)"
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
                        v-if="card.matchesMyWishlist"
                        class="text-[11px] font-bold px-2 py-0.5 rounded-md w-fit flex items-center gap-1"
                        style="color: var(--c-mutual); background-color: color-mix(in srgb, var(--c-mutual) 15%, transparent); border: 1px solid color-mix(in srgb, var(--c-mutual) 30%, transparent)"
                      >
                        <v-icon icon="mdi-star-four-points" size="10" :color="'var(--c-mutual)'" />
                        On your wishlist
                      </span>
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
                </template>
              </template>

            </div><!-- /column-scroll receive -->
          </section>
        </div>

        <!-- ── Settlement details ── -->
        <div class="flex flex-row justify-between mt-4 rounded-xl border py-4 px-4 "  style="border-color: var(--c-border); background-color: var(--c-surface-2)">
          <div class="flex flex-col gap-3">
            <p class="text-[11px] font-bold uppercase tracking-widest" style="color: var(--c-muted)">Settlement details</p>

            <!-- Trade method -->
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs shrink-0" style="color: var(--c-muted)">How:</span>
              <button
                v-for="m in METHODS" :key="m.value"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer"
                :style="settlement.trade_method === m.value
                  ? { backgroundColor: 'var(--c-trade)', borderColor: 'var(--c-trade)', color: 'white' }
                  : { backgroundColor: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
                @click="settlement.trade_method = settlement.trade_method === m.value ? null : m.value"
              >
                <v-icon :icon="m.icon" size="14" />
                {{ m.label }}
              </button>
            </div>

            <!-- Cash offset -->
            <div class="flex gap-3 items-center flex-wrap">

              <v-checkbox label="Add cash offset" v-model="settlement.hasCash" style="accent-color: var(--c-trade); height: 55px;" />

              <template v-if="settlement.hasCash">
                <select
                  v-model="settlement.cash_payer"
                  class="rounded-lg px-2 py-1 text-xs border outline-none"
                  :style="{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
                >
                  <option value="proposer">You pay</option>
                  <option value="counterparty">They pay</option>
                </select>
                <div class="relative flex items-center">
                  <span class="absolute left-2.5 text-xs pointer-events-none" style="color: var(--c-muted)">€</span>
                  <input
                    v-model.number="settlement.cash_amount"
                    type="number" min="0" step="0.01" placeholder="0.00"
                    class="pl-6 pr-3 py-1 rounded-lg text-xs border outline-none w-24"
                    :style="{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
                  />
                </div>
                <span v-if="settlement.cash_amount > 0" class="text-xs font-semibold" style="color: var(--c-mutual)">
                  {{ settlement.cash_payer === 'proposer' ? 'You' : effectiveUser?.name ?? 'They' }}
                  pay €{{ Number(settlement.cash_amount).toFixed(2) }}
                </span>
              </template>
            </div>
          </div>

          <!-- Verification photo -->
          <div class="flex flex-col gap-2">
            <p class="text-[11px] font-bold uppercase tracking-widest" style="color: var(--c-muted)">Verification photo</p>
            <p class="text-xs" style="color: var(--c-muted)">Attach a photo of your cards so the other party can verify the condition before accepting.</p>

            <div class="flex items-center gap-3 flex-wrap">
              <!-- Preview thumbnail -->
              <div v-if="photoPreview" class="relative shrink-0">
                <img
                  :src="photoPreview"
                  alt="Preview"
                  class="h-20 w-20 object-cover rounded-lg ring-1"
                  style="ring-color: var(--c-border)"
                />
                <button
                  class="absolute -top-1.5 -right-1.5 size-5 rounded-full flex items-center justify-center cursor-pointer"
                  style="background-color: var(--c-accent)"
                  @click="removePhoto"
                  title="Remove photo"
                >
                  <v-icon icon="mdi-close" size="12" color="white" />
                </button>
              </div>

              <!-- Upload button -->
              <button
                class="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer transition-colors"
                :style="{
                  borderColor: photoFile ? 'var(--c-mutual)' : 'var(--c-border)',
                  color: photoFile ? 'var(--c-mutual)' : 'var(--c-muted)',
                  backgroundColor: photoFile ? 'color-mix(in srgb, var(--c-mutual) 8%, transparent)' : 'transparent',
                }"
                @click="photoInput.click()"
              >
                <v-icon icon="mdi-camera-plus-outline" size="15" />
                {{ photoFile ? 'Change photo' : 'Add photo' }}
              </button>
              <input
                ref="photoInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="onPhotoSelected"
              />
            </div>
          </div>
        </div>

        <v-alert v-if="errorMessage" type="error" variant="tonal" class="mt-4" density="compact">
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
                <v-icon icon="mdi-arrow-up-bold" size="14" color="var(--c-accent)" />
                <span class="text-pink-300 font-semibold">{{ givePayload.length }}</span>
              </span>
              <v-icon icon="mdi-swap-horizontal" size="16" color="var(--c-muted)" />
              <span class="flex items-center gap-1.5">
                <v-icon icon="mdi-arrow-down-bold" size="14" color="var(--c-trade)" />
                <span class="text-blue-300 font-semibold">{{ receivePayload.length }}</span>
              </span>
            </span>
            <span v-else style="color: var(--c-muted)">Select cards to include in the proposal.</span>
          </div>
          <div class="flex gap-3">
            <v-btn variant="text" color="gray" @click="close" :disabled="submitting">Cancel</v-btn>
            <v-btn
              variant="flat"
              style="background-color: var(--c-accent); color: white"
              :prepend-icon="isEditing ? 'mdi-content-save-outline' : 'mdi-send'"
              class="!rounded-xl"
              :loading="submitting"
              :disabled="!canSubmit"
              @click="submit"
            >
              {{ isEditing ? 'Save changes' : isCountering ? 'Send counter-offer' : 'Send proposal' }}
            </v-btn>
          </div>
        </div>
      </div>
    </v-card>
  </v-dialog>

  <!-- Headless AddCard opened when a suggestion isn't in the library yet -->
  <AddCard ref="addCardRef" mode="trade" :headless="true" @added="onCardAdded" />
</template>

<style scoped>
.trade-dialog {
  border: none;
}
.column-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--c-border) transparent;
}
.column-scroll::-webkit-scrollbar {
  width: 4px;
}
.column-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.column-scroll::-webkit-scrollbar-thumb {
  background-color: var(--c-border);
  border-radius: 99px;
}
.trade-row {
  transition: background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.suggestions-scroll {
  scrollbar-width: thin;
  scrollbar-color: var(--c-border) transparent;
}
.suggestions-scroll::-webkit-scrollbar { height: 3px; }
.suggestions-scroll::-webkit-scrollbar-track { background: transparent; }
.suggestions-scroll::-webkit-scrollbar-thumb { background-color: var(--c-border); border-radius: 99px; }
.skeleton-pulse {
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
