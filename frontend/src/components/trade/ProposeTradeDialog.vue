<script setup>
import { ref, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import { cardImage } from "@/lib/cardImage";
import { fetchMyLibrary, fetchUserWishlist, fetchUserTradePile, fetchMyWishlistNames } from "@/lib/matches";
import { createTradeProposal, updateTradeProposal, counterTradeProposal, uploadTradePhoto } from "@/lib/proposals";
import { handleIfPhoneRequired } from "@/lib/phoneGate";
import { searchById } from "@/api";
import { getClient, getCurrentSession } from "@/lib/supabaseClient";
import AddCard from "@/components/library/AddCard.vue";
import LocationPicker from "@/components/trade/LocationPicker.vue";
import CardPrice from "@/components/trade/CardPrice.vue";
import { fetchCardPrices, sumPrices, tradeGap, formatMoney } from "@/lib/cardmarketPrice";

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

const { t, locale } = useI18n();

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
// deliveryMode: 'location' (meet at a picked store/event) | 'mail' (ship, no location)
const settlement = ref({ deliveryMode: 'location', meetup_location: null, hasCash: false, cash_amount: null, cash_payer: 'proposer' });

// Selection: maps card_id -> quantity. 0 means unselected.
const giveSelection = ref({});     // from myOffers
const receiveSelection = ref({});  // from user.theyHave

// Card id -> resolved Cardmarket price, for both columns at once.
const prices = ref(new Map());

/**
 * What each side is worth, and how far apart they are.
 *
 * Selection-driven, not pile-driven: the question is what *this* trade is
 * worth, so only the ticked cards count, at the quantity they are ticked at.
 *
 * Both come back as ranges whenever a card in them is one -- roughly 30% of
 * cards resolve to a band rather than a figure, because a set can print a card
 * at two rarities and Cardmarket labels neither product. See cardmarketPrice.js.
 */
const priced = (payload, pool) => payload.map(({ card_id, quantity }) => ({
  price: prices.value.get(card_id),
  quantity,
  card: pool.find(c => c.id === card_id),
}));

const giveTotal    = computed(() => sumPrices(priced(givePayload.value, myOffers.value)));
const receiveTotal = computed(() => sumPrices(priced(receivePayload.value, theirTradePile.value)));
const gap          = computed(() => tradeGap(giveTotal.value, receiveTotal.value));

/** Only worth drawing once there is something on at least one side. */
const showValues = computed(() => giveTotal.value.priced > 0 || receiveTotal.value.priced > 0);

const money = (v) => formatMoney(v, locale.value);

/**
 * Fill the cash offset from the gap.
 *
 * Only reachable when both sides resolved exactly -- an offset is a single
 * number, and offering one derived from a band would put a figure in a money
 * field that no reading of the trade supports. The button hides itself
 * otherwise and the column says which cards are in the way.
 */
function applyGapAsCash() {
  if (gap.value.amount === null || !gap.value.payer) return;
  settlement.value.hasCash = true;
  settlement.value.cash_payer = gap.value.payer;
  settlement.value.cash_amount = gap.value.amount;
}

/** One request covering both columns, re-run when either pile changes. */
watch([myOffers, theirTradePile], async () => {
  const ids = [...myOffers.value, ...theirTradePile.value].map(c => c.id);
  prices.value = await fetchCardPrices(ids);
});

// Must be declared BEFORE watch() — the immediate watcher fires synchronously
// during the watch() call, so anything accessed in the callback must already
// be out of the Temporal Dead Zone.
let _watchToken = 0;

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

    const token = ++_watchToken;

    errorMessage.value = "";
    giveSelection.value = {};
    receiveSelection.value = {};
    giveFilter.value = "";
    theirFilter.value = "";
    removePhoto();

    // Settlement pre-population
    const src = props.editProposal ?? props.counterProposal;
    settlement.value = src ? {
      deliveryMode:    src.trade_method === 'mail' ? 'mail' : 'location',
      meetup_location: src.meetup_location ?? null,
      hasCash:         src.cash_amount != null,
      cash_amount:     src.cash_amount ?? null,
      cash_payer:      src.cash_payer  ?? 'proposer',
    } : { deliveryMode: 'location', meetup_location: null, hasCash: false, cash_amount: null, cash_payer: 'proposer' };

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
    if (token !== _watchToken) return; // stale — dialog switched to a different counterparty
    counterpartyWishlist.value = wishlist ?? [];
    theirTradePile.value = pile ?? [];
    loadingTheirs.value = false;
    loadingWishlist.value = false;

    // Fetch my library tagged with what the counterparty wants
    await refreshMyOffers();
    if (token !== _watchToken) return;

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
  removePhoto();
  emit("update:modelValue", false);
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  errorMessage.value = "";
  const isMail = settlement.value.deliveryMode === 'mail';
  const settlementPayload = {
    trade_method:    isMail ? 'mail' : (settlement.value.meetup_location ? 'in_person' : null),
    meetup_location: isMail ? null : (settlement.value.meetup_location ?? null),
    cash_amount:     settlement.value.hasCash && settlement.value.cash_amount > 0 ? settlement.value.cash_amount : null,
    cash_payer:      settlement.value.hasCash && settlement.value.cash_amount > 0 ? settlement.value.cash_payer : null,
  };
  try {
    const me = (await getCurrentSession())?.user?.id;
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
    // The server refuses an unverified account here rather than at signup.
    // Editing an existing proposal is not gated — it changes a trade that
    // already passed the gate — so the reason reflects what was attempted.
    if (handleIfPhoneRequired(err, isCountering.value ? 'counter' : 'propose')) {
      // The prompt says what is needed; a second red error under it would be
      // the same news twice. Their picks stay put for the retry.
      errorMessage.value = t('phoneVerify.inlineRetry');
    } else {
      errorMessage.value = err?.message ?? t('proposeDialog.saveFailed');
    }
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

/**
 * Card names in my library, and the subset I have already offered.
 *
 * Indexed once per change rather than scanned per row. These were three
 * separate `myOffers.some(...)` walks — one in the filter below, two more in
 * the template's v-for — so the suggestions panel was doing O(offers × wishlist)
 * work on every keystroke in its filter box. At a 238-card pile that is around
 * fourteen thousand comparisons per render.
 */
const offeredNames = computed(() => {
  const set = new Set();
  for (const card of myOffers.value) {
    if ((giveSelection.value[card.id] ?? 0) > 0) set.add(card.name);
  }
  return set;
});
/** Names I hold and could still offer, for the "you have it" dot. */
const availableNames = computed(() => {
  const set = new Set();
  for (const card of myOffers.value) {
    if (card.status !== "locked") set.add(card.name);
  }
  return set;
});

const filteredWanted = computed(() => {
  const q = wantedFilter.value.toLowerCase().trim();
  return counterpartyWishlist.value.filter(c => {
    if (q && !c.name.toLowerCase().includes(q)) return false;
    // Hide cards the user has already committed to giving (avoid the confusion of
    // a card appearing in both "You give" and "Cards they want" simultaneously)
    return !offeredNames.value.has(c.name);
  });
});

async function selectWantedCard(item) {
  if (fetchingCardId.value) return; // prevent double-tap while fetch in flight
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
    <!--
      No `theme="dark"`. The --c-* tokens follow html.dark, but a hardcoded
      Vuetify theme does not, so in light mode the surfaces went light while the
      checkboxes and number inputs inside stayed dark-themed.
    -->
    <v-card v-if="effectiveUser" class="trade-dialog !rounded-none overflow-hidden" style="background-color: var(--c-surface); color: var(--c-text); height: 100dvh; display: flex; flex-direction: column">
      <!-- Header -->
      <div class="relative">
        <div class="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4">
          <!-- User avatar -->
          <div class="relative shrink-0">
            <div class="absolute -inset-1 rounded-full blur-md opacity-40" style="background-color: var(--c-accent)" />
            <div
              class="relative size-9 sm:size-11 rounded-full flex items-center justify-center font-bold text-sm text-white ring-2 ring-white/10"
              style="background-color: var(--c-accent)"
            >
              {{ userInitials }}
            </div>
          </div>
          <div class="flex flex-col grow min-w-0">
            <span class="font-bold text-base sm:text-lg leading-tight" style="color: var(--c-text)">
              {{ isEditing ? t('proposeDialog.editProposal') : isCountering ? t('proposeDialog.counterPropose') : t('proposeDialog.title') }}
            </span>
            <span class="text-xs sm:text-sm mt-1 truncate" style="color: var(--c-muted)">{{ t('proposeDialog.with') }} {{ effectiveUser.name ?? t('proposeDialog.anonymous') }}</span>
          </div>
          <v-btn icon="mdi-close" variant="text" density="compact" :aria-label="t('common.close')" @click="close" />
        </div>
        <!-- Gradient accent line -->
        <div class="h-[2px] w-full" style="background: linear-gradient(90deg, var(--c-accent), transparent 40%, transparent 60%, var(--c-trade))" />
      </div>

      <v-card-text class="!pa-3 sm:!pa-5" style="overflow: hidden; display: flex; flex-direction: column; min-height: 0; flex: 1;">
        <!-- Loading skeletons -->
        <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
          <div v-for="col in 2" :key="col" class="flex flex-col gap-4">
            <div class="h-5 w-28 rounded-lg skeleton-pulse" style="background-color: var(--c-skeleton)" />
            <div
              v-for="i in 3"
              :key="i"
              class="flex gap-3 !p-4 rounded-xl border skeleton-pulse"
              :style="{ animationDelay: `${i * 150}ms`, borderColor: 'var(--c-border)' }"
            >
              <div class="h-[72px] w-[50px] rounded-lg shrink-0" style="background-color: var(--c-skeleton)" />
              <div class="flex flex-col gap-3 grow pt-2">
                <div class="h-4 rounded w-3/4" style="background-color: var(--c-skeleton)" />
                <div class="h-3 rounded w-1/2" style="background-color: var(--c-border)" />
              </div>
            </div>
          </div>
        </div>

        <template v-else>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 md:h-full min-h-0">
          <!-- ── You give ── -->
          <section class="flex flex-col gap-3 min-h-0" role="group" aria-labelledby="col-you-give">
            <!-- Header -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <v-icon icon="mdi-arrow-up-circle" :color="'var(--c-accent)'" size="20" />
                <p id="col-you-give" class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">{{ t('proposeDialog.youGive') }}</p>
                <span
                  v-if="givePayload.length > 0"
                  class="chip-count" :style="{ '--chip': 'var(--c-accent)' }"
                >{{ givePayload.length }}</span>
              </div>
              <v-btn
                density="comfortable"
                variant="flat"
                prepend-icon="mdi-heart-search"
                :style="showWantedPicker
                  ? { backgroundColor: 'var(--c-surface-2)', color: 'var(--c-text)' }
                  : { backgroundColor: 'var(--c-trade)', color: 'var(--c-on-accent)' }"
                @click="openWantedPicker"
              >{{ showWantedPicker ? t('proposeDialog.hideSuggestions') : t('proposeDialog.addToOffer') }}</v-btn>
            </div>

            <!-- Inline "what they want" suggestions panel -->
            <div v-if="showWantedPicker" class="rounded-xl border overflow-hidden" style="border-color: var(--c-border); background-color: var(--c-surface-2)">
              <div class="flex items-center gap-2 px-3 py-2 border-b" style="border-color: var(--c-border)">
                <v-icon icon="mdi-heart-search" size="14" color="var(--c-trade)" />
                <span class="text-[11px] font-bold uppercase tracking-wide grow" style="color: var(--c-trade)">{{ t('proposeDialog.cardsTheyWant') }}</span>
                <span class="text-[10px]" style="color: var(--c-muted)">{{ t('proposeDialog.clickToSelect') }}</span>
              </div>
              <!-- Search -->
              <div class="px-3 pt-2 pb-1">
                <div class="relative">
                  <v-icon icon="mdi-magnify" size="14" class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" color="var(--c-muted)" />
                  <input
                    v-model="wantedFilter"
                    :placeholder="t('proposeDialog.filter')"
                    class="w-full rounded-lg pl-7 pr-2 py-2 text-xs outline-none border"
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
                {{ counterpartyWishlist.length === 0 ? t('proposeDialog.theirWishlistEmpty') : t('proposeDialog.noMatches') }}
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
                      ringColor: availableNames.has(item.name) ? 'var(--c-mutual)' : 'var(--c-border)',
                    }"
                  />
                  <!-- "You have it" dot -->
                  <span
                    v-if="availableNames.has(item.name)"
                    class="absolute -top-1 -right-1 size-4 rounded-full border-2 flex items-center justify-center"
                    style="background-color: var(--c-mutual); border-color: var(--c-surface-2)"
                    :title="t('proposeDialog.alreadyInLibrary')"
                  />
                  <v-progress-circular v-if="fetchingCardId === item.id" indeterminate size="14" width="2" class="absolute inset-0 m-auto" />
                  <!-- Name tooltip on hover -->
                  <div
                    class="absolute -bottom-1 left-0 right-0 rounded-b-lg !px-0.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
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
                :placeholder="t('proposeDialog.searchYourLibrary')"
                class="w-full rounded-lg pl-8 pr-3 py-2 text-sm outline-none border"
                :style="{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
              />
            </div>

            <!-- Card list -->
            <div class="overflow-y-auto flex flex-col gap-3 pr-1 flex-1 min-h-0 column-scroll">
              <p v-if="myOffers.length === 0" class="text-sm py-8 text-center flex flex-col items-center gap-3" style="color: var(--c-muted)">
                <v-icon icon="mdi-card-off-outline" size="36" color="var(--c-muted)" />
                <span>{{ t('proposeDialog.yourLibraryEmpty') }}</span>
              </p>
              <p v-else-if="filteredMyOffers.length === 0" class="text-sm py-8 text-center flex flex-col items-center gap-3" style="color: var(--c-muted)">
                <v-icon icon="mdi-magnify-close" size="36" color="var(--c-muted)" />
                <span>{{ t('proposeDialog.noCardsMatch') }}</span>
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
                      ? 'row-selected row-selected--give'
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
                    <div class="flex items-baseline gap-2 min-w-0">
                      <p class="font-semibold text-sm truncate flex-1" style="color: var(--c-text)">{{ card.name }}</p>
                      <!-- What this card is worth, while you are deciding whether
                           to tick it. A price you have to leave the dialog to
                           look up is a price nobody looks up. -->
                      <CardPrice v-if="prices.get(card.id)" :price="prices.get(card.id)" size="sm" class="shrink-0" />
                    </div>
                    <p class="text-xs truncate" style="color: var(--c-muted)">{{ describe(card) || "—" }}</p>
                    <div class="flex gap-2">
                      <a
                        v-for="m in marketLinks(card.name, card.extension)" :key="m.label"
                        :href="m.url" target="_blank" rel="noopener noreferrer"
                        class="text-[11px] no-underline flex items-center gap-1 transition-opacity hover:opacity-70"
                        style="color: var(--c-muted)" @click.stop
                      >
                        <v-icon icon="mdi-open-in-new" size="11" />{{ m.label }}
                      </a>
                    </div>
                    <span
                      v-if="card.theyWantThis"
                      class="signal-chip" :style="{ '--chip': 'var(--c-mutual)' }"
                    ><v-icon icon="mdi-star-four-points" size="10" color="var(--c-mutual)" />{{ t('proposeDialog.theyWantThis') }}</span>
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
          <section class="flex flex-col gap-4 min-h-0" role="group" aria-labelledby="col-you-receive">
            <div class="flex items-center gap-3">
              <v-icon icon="mdi-arrow-down-circle" :color="'var(--c-trade)'" size="20" />
              <p id="col-you-receive" class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">{{ t('proposeDialog.youReceive') }}</p>
              <span
                v-if="receivePayload.length > 0"
                class="chip-count" :style="{ '--chip': 'var(--c-trade)' }"
              >
                {{ receivePayload.length }}
              </span>
              <span v-if="theirPileHasExtras" class="text-[11px] ml-auto" style="color: var(--c-muted)">
                {{ t('proposeDialog.cardsToChooseFrom', { count: theirTradePile.length }) }}
              </span>
            </div>

            <!-- Search filter — only shown when they have more than wishlist matches -->
            <div v-if="theirPileHasExtras" class="relative">
              <v-icon icon="mdi-magnify" size="16" class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" color="var(--c-muted)" />
              <input
                v-model="theirFilter"
                :placeholder="t('proposeDialog.searchTheirPile')"
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
                  class="flex gap-3 !p-4 rounded-xl border skeleton-pulse"
                  :style="{ animationDelay: `${i * 120}ms`, borderColor: 'var(--c-border)' }"
                >
                  <div class="h-[72px] w-[50px] rounded-lg shrink-0" style="background-color: var(--c-skeleton)" />
                  <div class="flex flex-col gap-3 grow pt-2">
                    <div class="h-4 rounded w-3/4" style="background-color: var(--c-skeleton)" />
                    <div class="h-3 rounded w-1/2" style="background-color: var(--c-border)" />
                  </div>
                </div>
              </template>

              <template v-else>
                <!-- Empty state -->
                <p v-if="theirTradePile.length === 0" class="text-sm py-8 text-center flex flex-col items-center gap-3" style="color: var(--c-muted)">
                  <v-icon icon="mdi-card-off-outline" size="36" color="var(--c-muted)" />
                  <span>{{ t('proposeDialog.theirTradePileEmpty') }}</span>
                </p>
                <p v-else-if="filteredTheirPile.length === 0" class="text-sm py-8 text-center flex flex-col items-center gap-3" style="color: var(--c-muted)">
                  <v-icon icon="mdi-magnify-close" size="36" color="var(--c-muted)" />
                  <span>{{ t('proposeDialog.noCardsMatch') }}</span>
                </p>

                <!-- Wishlist match divider -->
                <p
                  v-if="filteredTheirPile.some(c => c.matchesMyWishlist) && filteredTheirPile.some(c => !c.matchesMyWishlist)"
                  class="text-[10px] font-bold uppercase tracking-widest pt-1 pb-1"
                  style="color: var(--c-muted)"
                >
                  {{ t('proposeDialog.matchesYourWishlist') }}
                </p>

                <template v-for="(card, idx) in filteredTheirPile" :key="card.id">
                  <!-- Section break between wishlist matches and extras -->
                  <p
                    v-if="idx > 0 && !card.matchesMyWishlist && filteredTheirPile[idx - 1].matchesMyWishlist"
                    class="text-[10px] font-bold uppercase tracking-widest pt-2 pb-1"
                    style="color: var(--c-muted)"
                  >
                    {{ t('proposeDialog.theirFullTradePile') }}
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
                        ? 'row-selected row-selected--receive'
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
                      <div class="flex items-baseline gap-2 min-w-0">
                        <p class="font-semibold text-sm truncate flex-1" style="color: var(--c-text)">{{ card.name }}</p>
                        <CardPrice v-if="prices.get(card.id)" :price="prices.get(card.id)" size="sm" class="shrink-0" />
                      </div>
                      <p class="text-xs truncate" style="color: var(--c-muted)">{{ describe(card) || "—" }}</p>
                      <div class="flex gap-2">
                        <a
                          v-for="m in marketLinks(card.name, card.extension)" :key="m.label"
                          :href="m.url"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-[11px] no-underline flex items-center gap-1 transition-opacity hover:opacity-70"
                          style="color: var(--c-muted)"
                          @click.stop
                        >
                          <v-icon icon="mdi-open-in-new" size="11" />
                          {{ m.label }}
                        </a>
                      </div>
                      <span
                        v-if="card.matchesMyWishlist"
                        class="text-[11px] font-bold px-2 py-1 rounded-md w-fit flex items-center gap-1"
                        style="color: var(--c-mutual); background-color: color-mix(in srgb, var(--c-mutual) 15%, transparent); border: 1px solid color-mix(in srgb, var(--c-mutual) 30%, transparent)"
                      >
                        <v-icon icon="mdi-star-four-points" size="10" :color="'var(--c-mutual)'" />
                        {{ t('proposeDialog.onYourWishlist') }}
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
        </div><!-- /grid -->
        </template><!-- /v-else loading -->

        <!-- ── What the two sides are worth ─────────────────────────────────
             Between the columns and the settlement panel, because that is the
             order the question arrives in: pick the cards, see what they come
             to, then decide the cash. Neutral, not amethyst or pink — the two
             columns already carry those, and a total is a fact about the pile
             rather than a third role (DESIGN.md, The Three-Role Rule). -->
        <div v-if="showValues" class="tv">
          <div class="tv__side">
            <span class="tv__label">{{ t('price.youGiveValue') }}</span>
            <span class="tv__amount tabular-nums">
              <template v-if="giveTotal.exact">{{ money(giveTotal.low) }}</template>
              <template v-else-if="giveTotal.priced">{{ money(giveTotal.low) }} – {{ money(giveTotal.high) }}</template>
              <template v-else>—</template>
            </span>
          </div>

          <div class="tv__side">
            <span class="tv__label">{{ t('price.youReceiveValue') }}</span>
            <span class="tv__amount tabular-nums">
              <template v-if="receiveTotal.exact">{{ money(receiveTotal.low) }}</template>
              <template v-else-if="receiveTotal.priced">{{ money(receiveTotal.low) }} – {{ money(receiveTotal.high) }}</template>
              <template v-else>—</template>
            </span>
          </div>

          <div class="tv__gap">
            <!-- An exact gap can be acted on; a straddling one cannot even name
                 who owes whom, so it says the distance and stops there. -->
            <p class="tv__verdict">
              <template v-if="gap.exact && gap.payer === 'proposer'">{{ t('price.youReceiveMore', { amount: money(Math.abs(gap.low)) }) }}</template>
              <template v-else-if="gap.exact && gap.payer === 'counterparty'">{{ t('price.youGiveMore', { amount: money(Math.abs(gap.low)) }) }}</template>
              <template v-else-if="gap.exact">{{ t('price.evenTrade') }}</template>
              <template v-else>{{ t('price.gapUnknown', { low: money(Math.min(Math.abs(gap.low), Math.abs(gap.high))), high: money(Math.max(Math.abs(gap.low), Math.abs(gap.high))) }) }}</template>
            </p>

            <button
              v-if="gap.amount !== null && gap.payer && !settlement.hasCash"
              type="button"
              class="tv__cash"
              @click="applyGapAsCash"
            >{{ t('price.addAsCash') }}</button>

            <!-- Says why the button is absent, and what would bring it back.
                 The fix is in the collection, one screen away, and this is the
                 moment somebody has a reason to go and do it. -->
            <p v-else-if="!gap.exact" class="tv__why">{{ t('price.exactAfterPicking') }}</p>
          </div>
        </div>

        <!-- ── Settlement details ── -->
        <div class="flex flex-col sm:flex-row sm:justify-between gap-4 mt-4 rounded-xl border py-4 px-4" style="border-color: var(--c-border); background-color: var(--c-surface-2)">
          <div class="flex flex-col gap-3">
            <LocationPicker
              v-model="settlement.meetup_location"
              v-model:deliveryMode="settlement.deliveryMode"
              :counterparty-name="effectiveUser?.name"
            />

            <!-- Cash offset -->
            <div class="flex gap-3 items-center flex-wrap">

              <v-checkbox :label="t('proposeDialog.addCashOffset')" v-model="settlement.hasCash" style="accent-color: var(--c-trade); height: 55px;" />

              <template v-if="settlement.hasCash">
                <select
                  v-model="settlement.cash_payer"
                  class="rounded-lg px-2 py-1 text-xs border outline-none"
                  :style="{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
                >
                  <option value="proposer">{{ t('proposeDialog.youPay') }}</option>
                  <option value="counterparty">{{ t('proposeDialog.theyPay') }}</option>
                </select>
                <div class="relative flex items-center">
                  <span class="absolute left-3 text-xs pointer-events-none" style="color: var(--c-muted)">€</span>
                  <input
                    v-model.number="settlement.cash_amount"
                    type="number" min="0" step="0.01" placeholder="0.00"
                    class="pl-6 pr-3 py-1 rounded-lg text-xs border outline-none w-24"
                    :style="{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
                  />
                </div>
                <span v-if="settlement.cash_amount > 0" class="text-xs font-semibold" style="color: var(--c-trade)">
                  {{ settlement.cash_payer === 'proposer'
                    ? t('proposeDialog.youPayAmount', { amount: Number(settlement.cash_amount).toFixed(2) })
                    : t('proposeDialog.paysAmount', { who: effectiveUser?.name ?? t('proposeDialog.anonymous'), amount: Number(settlement.cash_amount).toFixed(2) }) }}
                </span>
              </template>
            </div>
          </div>

          <!-- Verification photo -->
          <div class="flex flex-col gap-2">
            <p class="text-[11px] font-bold uppercase tracking-widest" style="color: var(--c-muted)">{{ t('proposeDialog.verificationPhoto') }}</p>
            <p class="text-xs" style="color: var(--c-muted)">{{ t('proposal.uploadPhotos') }}</p>

            <div class="flex items-center gap-3 flex-wrap">
              <!-- Preview thumbnail -->
              <div v-if="photoPreview" class="relative shrink-0">
                <img
                  :src="photoPreview"
                  :alt="t('proposeDialog.photoPreviewAlt')"
                  class="h-20 w-20 object-cover rounded-lg ring-1"
                  style="ring-color: var(--c-border)"
                />
                <button
                  class="absolute -top-2 -right-2 size-5 rounded-full flex items-center justify-center cursor-pointer"
                  style="background-color: var(--c-accent)"
                  type="button"
                  @click="removePhoto"
                  :title="t('proposeDialog.removePhoto')"
                  :aria-label="t('proposeDialog.removePhoto')"
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
                {{ photoFile ? t('proposeDialog.changePhoto') : t('proposeDialog.addPhoto') }}
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
        <div class="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4">
          <div class="text-sm flex items-center gap-3" style="color: var(--c-muted)">
            <span v-if="givePayload.length > 0 || receivePayload.length > 0" class="flex items-center gap-3">
              <span class="flex items-center gap-2">
                <v-icon icon="mdi-arrow-up-bold" size="14" color="var(--c-accent)" />
                <span class="font-semibold" style="color: var(--c-accent)">{{ givePayload.length }}</span>
              </span>
              <v-icon icon="mdi-swap-horizontal" size="16" color="var(--c-muted)" />
              <span class="flex items-center gap-2">
                <v-icon icon="mdi-arrow-down-bold" size="14" color="var(--c-trade)" />
                <span class="font-semibold" style="color: var(--c-trade)">{{ receivePayload.length }}</span>
              </span>
            </span>
            <span v-else class="text-xs sm:text-sm max-sm:hidden block" style="color: var(--c-muted)">{{ t('proposeDialog.selectCards') }}</span>
          </div>
          <div class="flex gap-2">
            <v-btn variant="text" color="gray" size="small" @click="close" :disabled="submitting">{{ t('common.cancel') }}</v-btn>
            <v-btn
              variant="flat"
              style="background-color: var(--c-accent); color: var(--c-on-accent)"
              :prepend-icon="isEditing ? 'mdi-content-save-outline' : 'mdi-send'"
              class="!rounded-xl"
              size="small"
              :loading="submitting"
              :disabled="!canSubmit"
              @click="submit"
            >
              {{ isEditing ? t('proposeDialog.save') : isCountering ? t('proposal.counter') : t('proposeDialog.send') }}
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
/*
  DESIGN.md gives the Trade Row a bordered default state. It never had one:
  the width was missing, so `borderColor` on the unselected rows and
  `border-pink-500/50` on the selected ones were both painting a 0px border.
  One declaration here gives every state something to colour.
*/
.trade-row {
  border: 1px solid transparent;
  transition: background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/*
  Selection, in the palette's own terms. Give is accent (what you are parting
  with), receive is trade-amethyst (what is coming to you). Both were raw
  Tailwind before, and the receive side was a blue that appears in no role.
*/
/* ── Trade value bar ──────────────────────────────────────────────────────
   Three cells on one rule: what you give, what you receive, and the distance
   between them. Flat, with a hairline top edge rather than a panel — the
   dialog already has a bordered settlement box under it and a second frame
   would box a box (DESIGN.md, The Flat-By-Default Rule). */
.tv {
  display: flex; align-items: flex-start; flex-wrap: wrap; gap: 10px 28px;
  margin-top: 16px; padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--c-border) 55%, transparent);
}
.tv__side { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.tv__label {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.16em; color: var(--c-muted); white-space: nowrap;
}
.tv__amount { font-size: 16px; font-weight: 700; color: var(--c-text); white-space: nowrap; }

/* The verdict sits at the far end, where the eye lands after reading both
   sides left to right. */
.tv__gap {
  margin-left: auto; display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
  padding-top: 12px;
}
.tv__verdict { margin: 0; font-size: 13px; font-weight: 700; color: var(--c-text); }
.tv__why { margin: 0; font-size: 11.5px; font-weight: 600; color: var(--c-muted); max-width: 260px; }

/* Teal, because filling this is the first move toward agreed cash terms, which
   is the agreement chain (DESIGN.md, The Agreement Rule). It is the only
   coloured thing in this bar, and it is a button, not a number. */
.tv__cash {
  min-height: 34px; padding: 0 13px; border-radius: 10px;
  background: color-mix(in srgb, var(--c-mutual) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-mutual) 45%, transparent);
  color: var(--c-mutual); font-size: 12.5px; font-weight: 700; cursor: pointer;
  white-space: nowrap; transition: background 0.15s ease;
}
.tv__cash:hover { background: color-mix(in srgb, var(--c-mutual) 18%, transparent); }
.tv__cash:focus-visible { outline: 2px solid var(--c-mutual); outline-offset: 2px; }

@media (pointer: coarse) { .tv__cash { min-height: 44px; } }
@media (max-width: 640px) {
  .tv__gap { margin-left: 0; width: 100%; padding-top: 4px; }
}
@media (prefers-reduced-motion: reduce) { .tv__cash { transition: none; } }

.row-selected {
  border-color: color-mix(in srgb, var(--row-color) 50%, transparent);
  background-color: color-mix(in srgb, var(--row-color) 12%, transparent);
  box-shadow: inset 0 0 20px color-mix(in srgb, var(--row-color) 10%, transparent);
}
.row-selected--give    { --row-color: var(--c-accent); }
.row-selected--receive { --row-color: var(--c-trade); }

/* Count chips and the "they want this" signal, tinted from one --chip var so
   the three roles stay the only source of colour.

   The fallback is not decoration: color-mix() with an undefined var is invalid
   at computed-value time, which drops the whole declaration, and Tailwind's
   preflight border-width:0 then wins. Without it a missing --chip renders the
   chip as bare black text with no border or background. */
.chip-count,
.signal-chip {
  --chip: var(--c-muted);
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 6px;
  color: var(--chip);
  background-color: color-mix(in srgb, var(--chip) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--chip) 30%, transparent);
}
.signal-chip {
  width: fit-content;
  display: flex;
  align-items: center;
  gap: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .trade-row { transition: none; }
}
/* Visible keyboard focus across the dialog's custom interactive elements (DESIGN.md: focus states). */
.trade-row:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: -2px;
}
.trade-dialog input:focus-visible,
.trade-dialog select:focus-visible,
.trade-dialog button:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 2px;
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
