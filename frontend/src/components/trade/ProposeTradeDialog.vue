<script setup>
import { ref, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import { cardImage } from "@/lib/cardImage";
import { fetchMyLibrary, fetchUserWishlist, fetchUserTradePile, fetchMyWishlistNames } from "@/lib/matches";
import { createTradeRequest, submitTradeReturnSelection, reviseMyTradeRequest, updateTradeProposal, counterTradeProposal, uploadTradePhoto } from "@/lib/proposals";
import { handleIfPhoneRequired } from "@/lib/phoneGate";
import { searchById } from "@/api";
import { getClient, getCurrentSession } from "@/lib/supabaseClient";
import AddCard from "@/components/library/AddCard.vue";
import LocationPicker from "@/components/trade/LocationPicker.vue";
import CardPrice from "@/components/trade/CardPrice.vue";
import CardBinder from "@/components/trade/CardBinder.vue";
import BinderControls from "@/components/trade/BinderControls.vue";
import PickedPile from "@/components/trade/PickedPile.vue";
import CardLinksSheet from "@/components/trade/CardLinksSheet.vue";
import { fetchCardPrices, sumPrices, tradeGap, formatMoney } from "@/lib/cardmarketPrice";
import { applyFilters, NO_FILTERS } from "@/lib/binderFilters";

const props = defineProps({
  modelValue:      { type: Boolean, default: false },
  // Matched user object — required for new proposals, null when editing/countering
  user:            { type: Object, default: null },
  // Existing proposal to edit — when set the dialog opens in edit mode
  editProposal:    { type: Object, default: null },
  // Received proposal to counter — opens counter mode (same columns, new proposal)
  counterProposal: { type: Object, default: null },
  // Staged workflow: the recipient now chooses cards from the requester's binder.
  returnProposal:  { type: Object, default: null },
  revisionProposal:{ type: Object, default: null },
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
  if (props.returnProposal) {
    return { id: props.returnProposal.counterparty_id, name: props.returnProposal.counterparty_name };
  }
  if (props.revisionProposal) {
    return { id: props.revisionProposal.counterparty_id, name: props.revisionProposal.counterparty_name };
  }
  return props.user;
});

const isEditing   = computed(() => !!props.editProposal);
const isCountering = computed(() => !!props.counterProposal);
const isReturning  = computed(() => !!props.returnProposal);
const isRevising   = computed(() => !!props.revisionProposal);

// Internal state
const myOffers = ref([]);              // My full library (trade pile + wishlist)
const theirTradePile = ref([]);        // Full trade pile of the counterparty
const counterpartyWishlist = ref([]); // Counterparty's wishlist (for inline suggestions)
const loadingTheirs = ref(false);
const loadingWishlist = ref(false);
// Which binder is open on the table. Only edit and counter have two of them;
// the other three modes only ever show the counterparty's.
const openSide = ref("receive");       // 'give' | 'receive'
const filters  = ref({ ...NO_FILTERS });
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
  () => [props.modelValue, props.user?.id, props.editProposal?.id, props.counterProposal?.id, props.returnProposal?.id, props.revisionProposal?.id],
  async ([open]) => {
    const eu = effectiveUser.value;
    if (!open || !eu?.id) return;

    const token = ++_watchToken;

    errorMessage.value = "";
    giveSelection.value = {};
    receiveSelection.value = {};
    openSide.value = "receive";
    filters.value = { ...NO_FILTERS };
    linksOpen.value = false;
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
        const myWishNames = (isEditing.value || isCountering.value || isReturning.value || isRevising.value)
          ? await fetchMyWishlistNames()
          : (props.user?.theyHave ?? []).map(c => c.name);
        return fetchUserTradePile(eu.id, myWishNames);
      })(),
    ]);
    if (token !== _watchToken) return; // stale — dialog switched to a different counterparty
    counterpartyWishlist.value = wishlist ?? [];
    theirTradePile.value = pile ?? [];
    if (isRevising.value) {
      const byId = new Map(theirTradePile.value.map(card => [card.id, card]));
      for (const card of props.revisionProposal.i_receive ?? []) {
        if (!byId.has(card.id)) byId.set(card.id, { ...card, status: 'available' });
      }
      theirTradePile.value = [...byId.values()];
    }
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

    } else if (isRevising.value) {
      const receiveMap = new Map((props.revisionProposal.i_receive ?? []).map(c => [c.id, c.quantity ?? 1]));
      for (const card of theirTradePile.value) if (receiveMap.has(card.id)) receiveSelection.value[card.id] = receiveMap.get(card.id);
    } else {
      // A binder request is deliberate: wishlist matches are highlighted but
      // never selected on the trader's behalf.
    }
  },
  { immediate: true }
);

// Both piles with their resolved price attached, because the binder shows the
// price on the pocket lip. Spread rather than mutated: the fetched rows are
// also the source for the pile below, and a card that quietly grew a field
// would make the two disagree about what a card is.
const myOffersPriced = computed(() =>
  myOffers.value.map(c => ({ ...c, price: prices.value.get(c.id) }))
);
const theirPilePriced = computed(() =>
  theirTradePile.value.map(c => ({ ...c, price: prices.value.get(c.id) }))
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

/** Everything currently on the table, both sides at once.
 *
 *  Selection-driven like the value bar above it: the pile is what this trade
 *  asks for, not what either binder holds. Give is pink and receive amethyst,
 *  the same roles the pockets used to pick them. */
const pileEntries = computed(() => {
  const out = [];
  for (const { card_id, quantity } of givePayload.value) {
    const card = myOffersPriced.value.find(c => c.id === card_id);
    if (card) out.push({ card, qty: quantity, side: "give", tone: "accent" });
  }
  for (const { card_id, quantity } of receivePayload.value) {
    const card = theirPilePriced.value.find(c => c.id === card_id);
    if (card) out.push({ card, qty: quantity, side: "receive", tone: "trade" });
  }
  return out;
});

/** How many cards the open binder is showing under the current filters.
 *  The rail carries the count now, so it has to name the same binder the
 *  pages do -- otherwise switching sides leaves a number describing the
 *  binder you just left. */
const openCards = computed(() =>
  (isEditing.value || isCountering.value) && openSide.value === "give"
    ? myOffersPriced.value
    : theirPilePriced.value
);
const visibleCount = computed(() => applyFilters(openCards.value, filters.value).length);

function setPileQty({ side, id, qty }) {
  const target = side === "give" ? giveSelection : receiveSelection;
  target.value = { ...target.value, [id]: qty };
}

/* The value bar carries the total in edit and counter, where there are two
   sides to compare. The other three modes have no bar, so the pile carries
   it -- and nothing shows a total twice. */
const pileTotal = computed(() => {
  if (isEditing.value || isCountering.value) return "";
  const total = receiveTotal.value;
  if (!total.priced) return "";
  return total.exact ? money(total.low) : `${money(total.low)} – ${money(total.high)}`;
});

// Market links, for the one card you are weighing up rather than for all of
// them. Raised by right-click, long-press, or the context key.
const linksCard = ref(null);
const linksOpen = ref(false);
function openLinks(card) { linksCard.value = card; linksOpen.value = true; }

const canSubmit = computed(() => !submitting.value && (
  (!isEditing.value && !isCountering.value)
    ? receivePayload.value.length > 0
    : (givePayload.value.length > 0 || receivePayload.value.length > 0)
));

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
    if (isRevising.value) {
      tradeId = props.revisionProposal.id;
      await reviseMyTradeRequest(tradeId, props.revisionProposal.revision, receivePayload.value);
      emit("updated", tradeId);
    } else if (isReturning.value) {
      tradeId = props.returnProposal.id;
      await submitTradeReturnSelection(tradeId, receivePayload.value);
      emit("updated", tradeId);
    } else if (isEditing.value) {
      tradeId = props.editProposal.id;
      await updateTradeProposal(tradeId, givePayload.value, receivePayload.value, settlementPayload);
      emit("updated", tradeId);
    } else if (isCountering.value) {
      tradeId = await counterTradeProposal(props.counterProposal.id, givePayload.value, receivePayload.value, settlementPayload);
      emit("countered", tradeId);
    } else {
      tradeId = await createTradeRequest(props.user.id, receivePayload.value);
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
watch(() => props.user?.id ?? props.editProposal?.id ?? props.counterProposal?.id ?? props.returnProposal?.id ?? props.revisionProposal?.id, () => {
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
    <v-card v-if="effectiveUser" class="trade-dialog !rounded-none overflow-hidden">
      <!-- One slim bar: whose binder this is, and the way out. The card frame,
           the avatar glow and the gradient rule that used to sit here were
           chrome around the binder; the dialog is the binder now, so its own
           surface is the board and nothing else frames it. -->
      <div class="bd-head">
        <v-icon icon="mdi-book-open-page-variant" size="19" color="var(--c-trade)" aria-hidden="true" />
        <div class="bd-head__t">
          <span class="bd-head__title">
            {{ isEditing ? t('proposeDialog.editProposal')
              : isCountering ? t('proposeDialog.counterPropose')
              : isRevising ? t('tradeDetail.changeCardsIWant')
              : t('proposeDialog.requestCards', { name: effectiveUser.name ?? t('proposeDialog.anonymous') }) }}
          </span>
          <span class="bd-head__sub">
            {{ isEditing || isCountering ? `${t('proposeDialog.with')} ${effectiveUser.name ?? t('proposeDialog.anonymous')}`
              : isReturning || isRevising ? t('proposeDialog.returnHelp', { name: effectiveUser.name ?? t('proposeDialog.anonymous') })
              : t('proposeDialog.requestHelp', { name: effectiveUser.name ?? t('proposeDialog.anonymous') }) }}
          </span>
        </div>
        <v-btn icon="mdi-close" variant="text" density="compact" :aria-label="t('common.close')" @click="close" />
      </div>

      <v-card-text class="bd-body">
        <!-- Loading: one page of empty pockets, so the binder does not change
             shape when the cards land. -->
        <div v-if="loading" class="bd-skel">
          <div v-for="i in 9" :key="i" class="bd-skel__pocket skeleton-pulse" :style="{ animationDelay: `${i * 60}ms` }" />
        </div>

        <template v-else>
      <!-- Binder left, everything else right. The binder takes the space it
           needs to show a whole spread; the rail holds what you use while
           reading it -- the search, the pile you are building, the terms and
           the way out. Below 860px there is no room for both and the rail moves under the binder. -->
      <div class="bd-split">
        <section class="bd-left" :aria-label="t('proposeDialog.whichBinder')">
          <div class="binder-hold">
            <CardBinder
              v-if="(isEditing || isCountering) && openSide === 'give'"
              v-model="giveSelection"
              :cards="myOffersPriced"
              v-model:filters="filters"
              :controls="false"
              tone="accent"
              :empty-label="t('proposeDialog.yourLibraryEmpty')"
              :locked-label="t('proposeDialog.locked')"
              links-on-context frameless
              @links="openLinks"
            />
            <CardBinder
              v-else
              v-model="receiveSelection"
              :cards="theirPilePriced"
              v-model:filters="filters"
              :controls="false"
              tone="trade"
              :empty-label="t('proposeDialog.theirTradePileEmpty')"
              :locked-label="t('proposeDialog.locked')"
              links-on-context frameless
              @links="openLinks"
            />
          </div>

        </section>

        <aside class="bd-rail">
          <div class="bd-rail__scroll">
            <div v-if="isEditing || isCountering" class="sw" role="tablist" :aria-label="t('proposeDialog.whichBinder')">
              <button
                type="button" role="tab" class="sw__tab"
                :class="{ 'sw__tab--on': openSide === 'receive' }"
                :aria-selected="openSide === 'receive'"
                style="--sw-tone: var(--c-trade)"
                @click="openSide = 'receive'"
              >
                <v-icon icon="mdi-arrow-down-circle" size="15" aria-hidden="true" />
                {{ t('proposeDialog.youReceive') }}
                <span v-if="receivePayload.length" class="sw__n">{{ receivePayload.length }}</span>
              </button>
              <button
                type="button" role="tab" class="sw__tab"
                :class="{ 'sw__tab--on': openSide === 'give' }"
                :aria-selected="openSide === 'give'"
                style="--sw-tone: var(--c-accent)"
                @click="openSide = 'give'"
              >
                <v-icon icon="mdi-arrow-up-circle" size="15" aria-hidden="true" />
                {{ t('proposeDialog.youGive') }}
                <span v-if="givePayload.length" class="sw__n">{{ givePayload.length }}</span>
              </button>

              <v-btn
                v-if="openSide === 'give'"
                density="comfortable" variant="flat" class="ml-auto"
                prepend-icon="mdi-heart-search"
                :style="showWantedPicker
                  ? { backgroundColor: 'var(--c-surface-2)', color: 'var(--c-text)' }
                  : { backgroundColor: 'var(--c-trade)', color: 'var(--c-on-accent)' }"
                @click="openWantedPicker"
              >{{ showWantedPicker ? t('proposeDialog.hideSuggestions') : t('proposeDialog.addToOffer') }}</v-btn>
            </div>

            <!-- Inline "what they want" suggestions panel -->
            <div v-if="showWantedPicker && openSide === 'give'" class="rounded-xl border overflow-hidden" style="border-color: var(--c-border); background-color: var(--c-surface-2)">
              <div class="flex items-center gap-2 px-3 py-2 border-b" style="border-color: var(--c-border)">
                <v-icon icon="mdi-heart-search" size="14" color="var(--c-trade)" />
                <span class="text-[11px] font-bold uppercase tracking-wide grow" style="color: var(--c-trade)">{{ t('proposeDialog.cardsTheyWant') }}</span>
                <span class="text-[10px]" style="color: var(--c-muted)">{{ t('proposeDialog.clickToSelect') }}</span>
              </div>
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
              <div v-if="loadingWishlist" class="flex gap-2 px-3 py-2 overflow-x-auto">
                <div v-for="i in 5" :key="i" class="shrink-0 h-16 w-12 rounded-lg skeleton-pulse" style="background-color: var(--c-skeleton)" />
              </div>
              <p v-else-if="!filteredWanted.length" class="text-xs text-center py-4" style="color: var(--c-muted)">
                {{ counterpartyWishlist.length === 0 ? t('proposeDialog.theirWishlistEmpty') : t('proposeDialog.noMatches') }}
              </p>
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
                    class="w-full rounded-lg object-contain ring-1 transition-[box-shadow] group-hover:ring-2"
                    :style="{
                      height: '72px',
                      backgroundColor: 'var(--c-surface)',
                      ringColor: availableNames.has(item.name) ? 'var(--c-mutual)' : 'var(--c-border)',
                    }"
                  />
                  <span
                    v-if="availableNames.has(item.name)"
                    class="absolute -top-1 -right-1 size-4 rounded-full border-2 flex items-center justify-center"
                    style="background-color: var(--c-mutual); border-color: var(--c-surface-2)"
                    :title="t('proposeDialog.alreadyInLibrary')"
                  />
                  <v-progress-circular v-if="fetchingCardId === item.id" indeterminate size="14" width="2" class="absolute inset-0 m-auto" />
                  <div
                    class="absolute -bottom-1 left-0 right-0 rounded-b-lg !px-0.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    style="background: linear-gradient(to top, rgba(0,0,0,0.85), transparent)"
                  >
                    <p class="text-[8px] text-white leading-tight line-clamp-2">{{ item.name }}</p>
                  </div>
                </div>
              </div>
            </div>


            <BinderControls
              v-model="filters"
              :cards="openCards"
              layout="column"
              class="bd-rail__controls"
            />
            <p class="bd-rail__count" role="status" aria-live="polite">
              {{ t('traderProfile.binderCount', { count: visibleCount }, visibleCount) }}
            </p>

            <PickedPile
              layout="panel"
              :entries="pileEntries"
              :empty-label="t('proposeDialog.nothingPickedYet')"
              :total="pileTotal"
              :total-label="t('price.cardmarketTrend')"
              @set="setPileQty"
              @remove="setPileQty({ ...$event, qty: 0 })"
            />

            <!-- ── What the two sides are worth ──────────────────────────
                 Under the pile and above the settlement panel, because that
                 is the order the question arrives in: pick the cards, see
                 what they come to, then decide the cash. Neutral, not
                 amethyst or pink — the pile already carries those, and a
                 total is a fact about it rather than a third role
                 (DESIGN.md, The Three-Role Rule). -->
          <div v-if="showValues && (isEditing || isCountering)" class="tv">
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
          <div v-if="isEditing || isCountering" class="flex flex-col sm:flex-row sm:justify-between gap-4 mt-4 rounded-xl border py-4 px-4" style="border-color: var(--c-border); background-color: var(--c-surface-2)">
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
                  <v-select
                    v-model="settlement.cash_payer"
                    :items="[
                      { title: t('proposeDialog.youPay'), value: 'proposer' },
                      { title: t('proposeDialog.theyPay'), value: 'counterparty' },
                    ]"
                    :label="t('tradeDetail.cashPayer')"
                    item-title="title"
                    item-value="value"
                    hide-details
                    density="compact"
                    class="cash-payer-select"
                  />
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
          </div>

        <!-- Footer. The note sits above the buttons rather than beside them:
             in a 360px rail there is no room for both on one line, and the
             thing it says -- that nothing is picked yet -- is the reason the
             send button is disabled, so it belongs next to the button and not
             squeezed out of sight. -->
        <div class="bd-foot">
          <p class="bd-foot__note">
            <template v-if="givePayload.length > 0 || receivePayload.length > 0">
              <span v-if="isEditing || isCountering" class="bd-foot__n" style="--n: var(--c-accent)">
                <v-icon icon="mdi-arrow-up-bold" size="13" aria-hidden="true" />{{ givePayload.length }}
              </span>
              <v-icon v-if="isEditing || isCountering" icon="mdi-swap-horizontal" size="15" color="var(--c-muted)" aria-hidden="true" />
              <span class="bd-foot__n" style="--n: var(--c-trade)">
                <v-icon icon="mdi-arrow-down-bold" size="13" aria-hidden="true" />{{ receivePayload.length }}
              </span>
            </template>
            <template v-else>{{ t('proposeDialog.selectCards') }}</template>
          </p>

          <div class="bd-foot__actions">
            <v-btn variant="text" size="small" style="color: var(--c-muted)" :disabled="submitting" @click="close">{{ t('common.cancel') }}</v-btn>
            <v-btn
              variant="flat"
              style="background-color: var(--c-trade); color: var(--c-on-accent)"
              :prepend-icon="isEditing ? 'mdi-content-save-outline' : 'mdi-send'"
              class="!rounded-xl"
              size="small"
              :loading="submitting"
              :disabled="!canSubmit"
              @click="submit"
            >
              {{ isEditing || isRevising ? t('proposeDialog.save') : isCountering ? t('proposal.counter') : isReturning ? t('proposeDialog.sendSelection') : t('proposeDialog.sendRequest') }}
            </v-btn>
          </div>
        </div>
        </aside>
      </div>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>

  <CardLinksSheet v-model="linksOpen" :card="linksCard" />

  <!-- Headless AddCard opened when a suggestion isn't in the library yet -->
  <AddCard ref="addCardRef" mode="trade" :headless="true" @added="onCardAdded" />
</template>

<style scoped>
/* The dialog is the binder. Its own surface is the board, so there is no card
   frame, no gradient rule and no inner border -- the binder component runs
   frameless inside it and nothing frames a frame. */
.trade-dialog {
  border: none;
  height: 100dvh;
  display: flex; flex-direction: column;
  background-color: var(--c-board);
  color: var(--c-text);
}

.bd-head {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--c-border) 50%, transparent);
}
.bd-head__t { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.bd-head__title {
  font-size: 14.5px; font-weight: 700; line-height: 1.25; color: var(--c-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bd-head__sub {
  font-size: 11.5px; color: var(--c-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.bd-body {
  padding: 0 !important;
  display: flex; flex-direction: column; min-height: 0; flex: 1;
  overflow: hidden;
}

/* Binder left, rail right. The binder gets whatever is left after the rail,
   because its job is to show a whole spread and the rail's is to hold controls
   at a legible width -- so the rail is clamped and the binder takes the rest.
   Below 1000px there is no room for two columns and the rail moves underneath. */
.bd-split {
  display: flex; align-items: stretch;
  min-height: 0; flex: 1;
}
.bd-left {
  flex: 1; min-width: 0; min-height: 0;
  display: flex; flex-direction: column;
  padding: 10px 6px 10px 12px;
}
.binder-hold { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.binder-hold > * { flex: 1; min-height: 0; }

.bd-rail {
  flex: 0 0 auto;
  width: clamp(300px, 25vw, 380px);
  min-height: 0;
  display: flex; flex-direction: column;
  background: var(--c-surface);
  border-left: 1px solid color-mix(in srgb, var(--c-border) 60%, transparent);
}
.bd-rail__scroll {
  flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain;
  display: flex; flex-direction: column; gap: 12px;
  padding: 12px;
}
.bd-rail__controls { margin: 0; }
.bd-foot {
  display: flex; flex-direction: column; align-items: stretch; gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid color-mix(in srgb, var(--c-border) 60%, transparent);
}
.bd-foot__note {
  margin: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font-size: 12.5px; color: var(--c-muted); min-height: 20px;
}
.bd-foot__n {
  display: inline-flex; align-items: center; gap: 4px;
  color: var(--n); font-weight: 700; font-variant-numeric: tabular-nums;
}
.bd-foot__actions { display: flex; gap: 8px; justify-content: flex-end; }

.bd-rail__count {
  margin: -6px 0 0; font-size: 12px; font-weight: 600; color: var(--c-muted);
  font-variant-numeric: tabular-nums;
}

/* One page of empty pockets while the cards land, so the binder does not
   change shape underneath the reader. */
.bd-skel {
  flex: 1; min-height: 0; margin: 16px auto; padding: 12px;
  display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr);
  gap: 9px; aspect-ratio: 177 / 258;
}
.bd-skel__pocket {
  border-radius: 7px; background: var(--c-well);
  box-shadow: inset 0 1px 3px color-mix(in srgb, var(--c-text) 12%, transparent);
}

@media (max-width: 859px) {
  .bd-split { flex-direction: column; }
  .bd-left { padding: 8px; flex: 1 1 58%; }
  .bd-rail {
    width: auto; flex: 0 1 auto; max-height: 46%;
    border-left: none;
    border-top: 1px solid color-mix(in srgb, var(--c-border) 60%, transparent);
  }
}

/* Which binder is open. A tablist rather than two panels: at the back table
   you only ever have one binder open in front of you. The pile underneath
   keeps showing both sides, so switching never hides half the trade. */
.sw { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sw__tab {
  display: inline-flex; align-items: center; gap: 7px;
  min-height: 38px; padding: 0 14px; border-radius: 11px;
  border: 1.5px solid var(--c-border); background: transparent;
  color: var(--c-muted); font-size: 13px; font-weight: 700; cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.sw__tab:hover { color: var(--c-text); }
.sw__tab--on {
  color: var(--sw-tone);
  border-color: color-mix(in srgb, var(--sw-tone) 55%, transparent);
  background: color-mix(in srgb, var(--sw-tone) 12%, transparent);
}
.sw__tab:focus-visible { outline: 2px solid var(--sw-tone); outline-offset: 2px; }
.sw__n {
  min-width: 20px; padding: 1px 6px; border-radius: 6px;
  background: color-mix(in srgb, var(--sw-tone) 20%, transparent);
  color: var(--sw-tone); font-size: 11px; font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.binder-who {
  display: flex; align-items: center; gap: 8px; margin: 0;
  font-size: 13.5px; font-weight: 700; color: var(--c-text);
}
.binder-who__n {
  margin-left: auto; font-size: 11.5px; font-weight: 600; color: var(--c-muted);
  font-variant-numeric: tabular-nums;
}

@media (pointer: coarse) { .sw__tab { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .sw__tab { transition: none; } }
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

/* Visible keyboard focus across the dialog's custom interactive elements (DESIGN.md: focus states). */
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
