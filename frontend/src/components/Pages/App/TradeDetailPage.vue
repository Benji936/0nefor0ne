<!--
  Trade detail, as a page.

  This was a 1100px-wide modal opened from the proposals list. Everything it
  showed had to queue up in one narrow column — the two card sides, the photos,
  the settlement facts, the activity log — with the actions pinned to a footer
  under a scroll. On a real page the same content splits in two: the trade
  itself (what is being swapped, and the photographic evidence of it) reads down
  the main column, while the things you consult *about* the trade — what to do
  next, how it settles, the conversation, the history — sit in a rail beside it.

  Being a page also buys three things a dialog cannot have: the trade has a URL
  you can send to somebody, the back button works, and the chat is a panel next
  to the trade instead of a modal stacked on top of a modal.
-->
<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { cardImage } from "@/lib/cardImage";
import { confirmHintKey, pendingWaitKey } from "@/lib/tradePending";
import { describeEvent } from "@/lib/tradeEvents";
import { tradeErrorKey, isStaleTradeError } from "@/lib/tradeErrors";
import {
  fetchMyProposals, fetchTradeEvents, acceptTradeProposal, declineTradeProposal,
  cancelTradeProposal, completeTradeProposal, confirmTradeAgreement, reviseTradeTerms,
} from "@/lib/proposals";
import { tradeNextAction, tradePhase, settlementTerms } from "@/lib/tradeWorkflow";
import { handleIfPhoneRequired } from "@/lib/phoneGate";
import TradePhotosPanel from "@/components/trade/TradePhotosPanel.vue";
import LocationPicker from "@/components/trade/LocationPicker.vue";
import TradeChatSleeve  from "@/components/trade/TradeChatSleeve.vue";
import ProposeTradeDialog from "@/components/trade/ProposeTradeDialog.vue";
import TraderLink       from "@/components/trade/TraderLink.vue";
import CardPrice        from "@/components/trade/CardPrice.vue";
import { fetchCardPrices, sumPrices, tradeGap, formatMoney } from "@/lib/cardmarketPrice";

const { t, locale } = useI18n();

// Card id -> resolved Cardmarket price, for both sides of the proposal.
//
// This is the screen where somebody decides whether to accept, so it is the one
// place the numbers most need to be present -- and the one place they must
// agree with what the proposer saw when they built the offer. Both call
// card_prices, so they do by construction. See cardmarketPrice.js.
const prices = ref(new Map());

const sideTotal = (cards) => sumPrices(
  (cards ?? []).map(c => ({ price: prices.value.get(c.id), quantity: c.quantity })),
);
const money = (v) => formatMoney(v, locale.value);

const route  = useRoute();
const router = useRouter();

const props = defineProps({
  login: { type: Object, default: null },
});
const emit = defineEmits(["requireAuth"]);

const tradeId = computed(() => Number(route.params.id));
const currentUserId = computed(() => props.login?.user?.id ?? null);

// ── Loading ───────────────────────────────────────────────────────────────
// fetch_my_proposals is the only reader that returns the derived shape this
// view needs (i_am_proposer, i_give/i_receive, i_confirmed, counterparty_*),
// and it is already RLS-scoped to trades you are part of. Filtering its result
// by id costs one extra round trip of rows but keeps a single definition of
// what a proposal looks like; a bespoke single-row RPC would be a second one to
// keep in step. If a trader ever holds enough history for that to hurt, add
// `p_trade_id` to the existing function rather than writing a new one.
const proposal   = ref(null);
const loading    = ref(true);
const loadFailed = ref(false);
const comparison = computed(() => tradeGap(
  sideTotal(proposal.value?.i_give),
  sideTotal(proposal.value?.i_receive),
));

async function load({ quiet = false } = {}) {
  if (!currentUserId.value) { loading.value = false; return; }
  if (!quiet) loading.value = true;
  loadFailed.value = false;
  try {
    const all = await fetchMyProposals();
    proposal.value = all.find(p => Number(p.id) === tradeId.value) ?? null;
  } catch (err) {
    console.error("trade detail load failed", err);
    loadFailed.value = true;
    proposal.value = null;
  } finally {
    loading.value = false;
  }
}

// The id is a route param, so this view can be navigated *between* without
// unmounting — a bare onMounted would leave trade #26 on screen at /trade/31.
watch(() => [tradeId.value, currentUserId.value], () => load(), { immediate: false });
onMounted(load);

// ── Activity log ──────────────────────────────────────────────────────────
const events        = ref([]);
const loadingEvents = ref(false);

watch(() => proposal.value?.id, async (id) => {
  if (!id) { events.value = []; return; }
  loadingEvents.value = true;
  try { events.value = await fetchTradeEvents(id); }
  finally { loadingEvents.value = false; }
}, { immediate: true });

/**
 * Prices for both sides, whenever the proposal is (re)loaded.
 *
 * Declared down here rather than beside `prices` above, because watch() runs
 * its source getter synchronously to capture the initial value -- reading
 * `proposal` from above its own `const` is a temporal dead zone error, and it
 * takes the whole page down to a blank screen rather than just this line.
 */
watch(() => proposal.value?.id, async () => {
  const cards = [...(proposal.value?.i_give ?? []), ...(proposal.value?.i_receive ?? [])];
  prices.value = cards.length ? await fetchCardPrices(cards.map(c => c.id)) : new Map();
}, { immediate: true });

// ── Photo state, lifted from the panel (it holds the realtime subscription) ──
const bothUploaded   = ref(false);
const mineUploaded   = ref(false);
const theirsUploaded = ref(false);

// ── Derived ───────────────────────────────────────────────────────────────
const statusMeta = computed(() => {
  const map = {
    pending:   { label: t('proposal.pending'),   color: "var(--c-trade)",  icon: "mdi-clock-outline" },
    accepted:  { label: t('proposal.accepted'),  color: "var(--c-mutual)", icon: "mdi-check-circle-outline" },
    declined:  { label: t('proposal.declined'),  color: "var(--c-accent)", icon: "mdi-close-circle-outline" },
    cancelled: { label: t('proposal.cancelled'), color: "var(--c-muted)",  icon: "mdi-cancel" },
    completed: { label: t('proposal.completed'), color: "var(--c-mutual)", icon: "mdi-handshake-outline" },
  };
  return map[proposal.value?.status] ?? map.pending;
});

const isPending      = computed(() => proposal.value?.status === "pending");
const isAccepted     = computed(() => proposal.value?.status === "accepted");
const workflowPhase  = computed(() => tradePhase(proposal.value));
const nextAction     = computed(() => tradeNextAction(proposal.value));
const showPhotoPanel = computed(() => isPending.value || isAccepted.value);
const iConfirmed     = computed(() => proposal.value?.i_confirmed    ?? false);
const theyConfirmed  = computed(() => proposal.value?.they_confirmed ?? false);
const counterpartyName = computed(() =>
  proposal.value?.counterparty_name ?? t('common.anonymous'));

const formattedDate = computed(() => {
  if (!proposal.value?.created_at) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
    .format(new Date(proposal.value.created_at));
});

const waitKey = computed(() => pendingWaitKey({
  i_am_proposer: proposal.value?.i_am_proposer,
  i_uploaded:    mineUploaded.value,
  they_uploaded: theirsUploaded.value,
}));
const confirmKey = computed(() => confirmHintKey({
  i_confirmed:   iConfirmed.value,
  i_uploaded:    mineUploaded.value,
  they_uploaded: theirsUploaded.value,
}));

/* ── Where the trade has got to ────────────────────────────────────────────
   The four stages of the staged workflow, as a line with named stops. The
   status pill says one word about a trade; this says which of four steps you
   are standing on, which is the thing the buttons in the rail change with and
   which the page otherwise only implies.

   Legacy trades have no `workflow_phase`, and tradePhase() maps them to
   "negotiation". They are shown on the agreement stop with selection behind
   them, which is true rather than convenient: a legacy proposer chose both
   sides in one go, so the cards were picked -- just not in two passes. */
const PHASES = [
  { key: "selection", labelKey: "tradeDetail.phaseSelection" },
  { key: "agreement", labelKey: "tradeDetail.phaseAgreement" },
  { key: "exchange",  labelKey: "tradeDetail.phaseExchange"  },
  { key: "completed", labelKey: "tradeDetail.phaseDone"      },
];

const phaseStops = computed(() => {
  const here = workflowPhase.value === "negotiation" ? "agreement" : workflowPhase.value;
  const at = PHASES.findIndex(p => p.key === here);
  return PHASES.map((p, i) => ({
    key: p.key,
    label: t(p.labelKey),
    done: at > i,
    here: at === i,
  }));
});

// Cancelled and declined trades stop somewhere rather than finishing, so they
// get the status pill instead: a four-stop line with the last two greyed reads
// as "still to come" for a trade that is over.
const isTerminal = computed(() =>
  ["declined", "cancelled"].includes(proposal.value?.status));
const showSpine = computed(() => Boolean(proposal.value) && !isTerminal.value);

/* ── Which way the deal leans ──────────────────────────────────────────────
   tradeGap works in the viewer's direction here -- receive minus give -- so a
   positive low means every plausible reading has you receiving more.

   The third answer is the useful one. When the two bands overlap, neither side
   is ahead by any reading of the prices, and saying so is worth more than the
   em-dash the old centre column showed whenever a single card had more than
   one printing. */
const balance = computed(() => {
  const g = comparison.value;
  const give = sideTotal(proposal.value?.i_give);
  const get  = sideTotal(proposal.value?.i_receive);
  if (!give.priced || !get.priced) return null;

  if (g.low > 0)  return { lean: "you",  low: g.low,   high: g.high };
  if (g.high < 0) return { lean: "them", low: -g.high, high: -g.low };
  return { lean: "even" };
});

const balanceLabel = computed(() => ({
  you:  t('tradeDetail.gapYouAhead'),
  them: t('tradeDetail.gapTheyAhead', { name: counterpartyName.value }),
  even: t('tradeDetail.gapEven'),
}[balance.value?.lean] ?? ""));

const balanceAmount = computed(() => {
  const b = balance.value;
  if (!b || b.lean === "even") return "";
  return comparison.value.exact
    ? money(b.low)
    : `${money(b.low)} – ${money(b.high)}`;
});

// Teal is the colour of agreement, so the seam only reaches it once there is
// one to mark (DESIGN.md, The Agreement Rule). Everything before that is a
// line between two piles, and is drawn like one.
const sealed = computed(() =>
  ["accepted", "completed"].includes(proposal.value?.status));

const hasSettlement = computed(() => Boolean(
  proposal.value?.trade_method || proposal.value?.cash_amount ||
  proposal.value?.notes || proposal.value?.meetup_location));

const tradeMethodLabel = computed(() => ({
  in_person: t('proposal.tradeMethodInPerson'),
  mail:      t('proposal.tradeMethodMail'),
}[proposal.value?.trade_method] ?? t('proposal.tradeMethodOther')));

const tradeMethodIcon = computed(() => ({
  in_person: 'mdi-handshake-outline',
  mail:      'mdi-package-variant-closed',
}[proposal.value?.trade_method] ?? 'mdi-dots-horizontal'));

const cashLabel = computed(() => {
  const p = proposal.value;
  if (!p?.cash_amount) return "";
  const iPay = p.cash_payer === 'proposer' ? p.i_am_proposer : !p.i_am_proposer;
  return iPay ? t('proposal.youPay') : t('proposal.theyPay', { name: counterpartyName.value });
});

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

// Shaped by describeEvent rather than read field-by-field in the template:
// the RPC's column names are the thing that was got wrong, and they are now
// asserted in lib/tradeEvents.test.js against the function's declared output.
const shownEvents = computed(() => events.value.map(evt => {
  const d = describeEvent(evt, currentUserId.value);
  return {
    ...d,
    key: evt.id,
    label: d.labelKey ? t(d.labelKey) : d.fallbackLabel,
    actor: !d.hasActor ? "—" : d.actorIsMe ? t('tradeDetail.you') : counterpartyName.value,
  };
}));

function statusLabel(status) {
  return {
    pending:   t('proposal.pending'),
    accepted:  t('proposal.accepted'),
    declined:  t('proposal.declined'),
    cancelled: t('proposal.cancelled'),
    completed: t('proposal.completed'),
  }[status] ?? status;
}

function eventTime(ts) {
  if (!ts) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" })
    .format(new Date(ts));
}

// ── Actions ───────────────────────────────────────────────────────────────
// These mirror TradeCenter's handlers rather than emitting up to it: the page
// is reachable directly by URL, so there is no list component underneath it to
// do the work or to reload afterwards.
const busy     = ref(false);
const snackbar = ref({ open: false, message: "", color: null });

const declining     = ref(false);
const declineReason = ref("");
const cancelConfirm = ref({ open: false, working: false });

const editOpen    = ref(false);
const editMode    = ref(null); // 'edit' | 'counter'
const termsOpen   = ref(false);
const terms = ref({ trade_method: 'in_person', cash_amount: null, cash_payer: 'proposer' });

function openTerms() {
  terms.value = {
    // LocationPicker owns this choice in its own vocabulary, and it owns the
    // place that goes with it — which is why the plain trade_method select that
    // used to sit here is gone. It could say "in person" and never say where,
    // and nothing else in the staged workflow asks.
    deliveryMode: proposal.value.trade_method === 'mail' ? 'mail' : 'location',
    meetup_location: proposal.value.meetup_location ?? null,
    cash_amount: proposal.value.cash_amount ?? null,
    cash_payer: proposal.value.cash_payer ?? 'proposer',
  };
  termsOpen.value = true;
}

async function saveTerms() {
  // Shared with the propose dialog, so the two surfaces cannot disagree about
  // what "in person, nowhere named" means.
  const payload = settlementTerms({
    deliveryMode: terms.value.deliveryMode,
    meetupLocation: terms.value.meetup_location,
    cashAmount: terms.value.cash_amount,
    cashPayer: terms.value.cash_payer,
  });
  const result = await run(() => reviseTradeTerms(proposal.value.id, proposal.value.revision, payload),
    { fallbackKey: 'proposal.failedToSave', success: () => t('tradeDetail.termsSuggested') });
  if (result !== undefined) termsOpen.value = false;
}

function say(message, color = "var(--c-mutual)") {
  snackbar.value = { open: true, message, color };
}

function reportTradeError(err, fallbackKey) {
  // Accepting is gated the same way proposing is: both parties are exposed the
  // moment a trade goes live. Declining and cancelling are not — those are how
  // somebody gets out of a trade, and a person who cannot leave one is worse
  // off than one who could never enter it.
  if (handleIfPhoneRequired(err, 'accept')) return;
  say(t(tradeErrorKey(err, fallbackKey)), "var(--c-accent)");
  if (isStaleTradeError(err)) load({ quiet: true });
}

async function run(fn, { fallbackKey, success, successColor } = {}) {
  busy.value = true;
  try {
    const result = await fn();
    if (success) say(success(result), successColor);
    await load({ quiet: true });
    return result;
  } catch (err) {
    reportTradeError(err, fallbackKey);
  } finally {
    busy.value = false;
  }
}

const onAccept = () => run(() => acceptTradeProposal(proposal.value.id), {
  fallbackKey: 'tradeCenter.failedToAccept',
  success: () => t('tradeCenter.tradeAccepted'),
});

const onConfirmAgreement = () => run(
  () => confirmTradeAgreement(proposal.value.id, proposal.value.revision),
  {
    fallbackKey: 'tradeCenter.failedToAccept',
    success: result => result?.status === 'accepted'
      ? t('tradeDetail.agreementComplete')
      : t('tradeDetail.agreementConfirmed'),
  },
);

async function onDecline() {
  const reason = declineReason.value.trim() || null;
  await run(() => declineTradeProposal(proposal.value.id, reason), {
    fallbackKey: 'tradeCenter.failedToDecline',
    success: () => t('tradeCenter.tradeDeclined'),
    successColor: "var(--c-muted)",
  });
  declining.value = false;
  declineReason.value = "";
}

const onComplete = () => run(() => completeTradeProposal(proposal.value.id), {
  fallbackKey: 'tradeCenter.failedToConfirm',
  success: r => r?.status === 'completed'
    ? t('tradeCenter.exchangeComplete')
    : t('tradeCenter.yourSideConfirmed'),
});

// Withdrawing a pending offer goes straight through — nobody has agreed to it.
// Cancelling an *accepted* trade tears up an agreement two people made, so it
// asks first, naming the person on the other side.
function onCancel() {
  if (proposal.value?.status === 'accepted') {
    cancelConfirm.value = { open: true, working: false };
    return;
  }
  doCancel();
}

async function doCancel() {
  cancelConfirm.value.working = true;
  await run(() => cancelTradeProposal(proposal.value.id), {
    fallbackKey: 'tradeCenter.failedToCancel',
    success: () => t('tradeCenter.tradeCancelled'),
    successColor: "var(--c-muted)",
  });
  cancelConfirm.value = { open: false, working: false };
}

function openEdit(mode) {
  editMode.value = mode;
  editOpen.value = true;
}

function onEdited(kind) {
  say(kind === 'counter'
    ? t('tradeCenter.counterSent', { id: proposal.value?.id })
    : t('tradeCenter.proposalUpdated'));
  load({ quiet: true });
}

const backTo = computed(() => `/${locale.value}/trade/proposals`);
function goBack() {
  // Prefer real history so the list keeps its scroll position and filters;
  // fall back to the URL when this page was opened cold from a link.
  if (window.history.length > 1) router.back();
  else router.push(backTo.value);
}
</script>

<template>
  <div class="trade-page mx-auto w-full flex flex-col gap-5 pb-16">

    <!-- Back -->
    <button
      type="button"
      class="back-link flex items-center gap-2 text-sm self-start cursor-pointer transition-colors duration-200"
      @click="goBack"
    >
      <v-icon icon="mdi-arrow-left" size="16" />
      {{ t('tradeDetail.backToTrades') }}
    </button>

    <!-- Signed out -->
    <div v-if="!currentUserId" class="state-card flex flex-col items-center gap-4 text-center">
      <v-icon icon="mdi-lock-outline" size="34" color="var(--c-muted)" />
      <p class="text-base font-semibold" style="color: var(--c-text)">{{ t('tradeDetail.signInToView') }}</p>
      <v-btn variant="flat" style="background: var(--c-accent); color: var(--c-on-accent)"
        @click="emit('requireAuth')">{{ t('nav.loginSignup') }}</v-btn>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="flex flex-col lg:flex-row gap-6">
      <div class="flex-1 flex flex-col gap-4 min-w-0">
        <div class="skeleton h-24 w-full" />
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="skeleton h-64 w-full" />
          <div class="skeleton h-64 w-full" />
        </div>
      </div>
      <div class="lg:w-[360px] shrink-0 flex flex-col gap-4">
        <div class="skeleton h-40 w-full" />
        <div class="skeleton h-32 w-full" />
      </div>
    </div>

    <!-- Missing, or not yours. Deliberately one message for both: telling a
         stranger the difference between "no such trade" and "a trade you may
         not see" tells them a trade exists. -->
    <div v-else-if="!proposal" class="state-card flex flex-col items-center gap-3 text-center">
      <v-icon :icon="loadFailed ? 'mdi-alert-circle-outline' : 'mdi-file-question-outline'"
        size="34" :color="loadFailed ? 'var(--c-accent)' : 'var(--c-muted)'" />
      <p class="text-base font-semibold" style="color: var(--c-text)">
        {{ loadFailed ? t('tradeDetail.loadFailed') : t('tradeDetail.notFound') }}
      </p>
      <p class="text-sm max-w-md" style="color: var(--c-muted); line-height: 1.6">
        {{ loadFailed ? t('tradeDetail.loadFailedBody') : t('tradeDetail.notFoundBody') }}
      </p>
      <v-btn variant="outlined" class="!mt-2"
        style="border-color: var(--c-border); color: var(--c-text)"
        @click="loadFailed ? load() : goBack()"
      >{{ loadFailed ? t('common.retry') : t('tradeDetail.backToTrades') }}</v-btn>
    </div>

    <template v-else>
      <!-- ── Header ─────────────────────────────────────────────────────── -->
      <header class="panel td-head">
        <div class="td-head__top">
          <div class="td-head__face" :data-side="proposal.i_am_proposer ? 'give' : 'get'">
            <img v-if="proposal.counterparty_avatar_url" :src="proposal.counterparty_avatar_url" alt="" />
            <span v-else>{{ counterpartyName[0].toUpperCase() }}</span>
          </div>

          <div class="td-head__who">
            <h1 class="td-head__title">
              <span class="td-head__id">{{ t('tradeDetail.tradeNumber', { id: proposal.id }) }}</span>
              <TraderLink :trader-id="proposal.counterparty_id" underline>{{ counterpartyName }}</TraderLink>
            </h1>
            <p class="td-head__meta">
              {{ proposal.i_am_proposer ? t('proposal.youProposed') : t('proposal.proposedToYou') }} · {{ formattedDate }}
            </p>
          </div>

          <!-- One state marker, not two. A live trade shows the spine below,
               which says the same thing as the pill and three words more; a
               trade that stopped shows the pill, because a four-stop line with
               two stops that will never happen reads as unfinished business. -->
          <span
            v-if="!showSpine"
            class="td-pill"
            :style="{
              color: statusMeta.color,
              borderColor: `color-mix(in srgb, ${statusMeta.color} 45%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${statusMeta.color} 12%, transparent)`,
            }"
          >
            <v-icon :icon="statusMeta.icon" size="14" :color="statusMeta.color" />
            {{ statusMeta.label }}
          </span>
        </div>

        <!-- The stages, as a line with named stops. -->
        <ol v-if="showSpine" class="td-spine" :aria-label="t('tradeDetail.tradeProgress')">
          <li
            v-for="stop in phaseStops"
            :key="stop.key"
            class="td-spine__stop"
            :class="{ 'is-done': stop.done, 'is-here': stop.here }"
            :aria-current="stop.here ? 'step' : undefined"
          >
            <span class="td-spine__rail" aria-hidden="true" />
            <span class="td-spine__label">{{ stop.label }}</span>
          </li>
        </ol>
      </header>

      <!-- ── Two columns ────────────────────────────────────────────────── -->
      <div class="td-cols flex flex-col lg:flex-row gap-5 items-start">

        <!-- Main: what is being traded -->
        <div class="td-main flex flex-col gap-5 min-w-0 w-full lg:flex-1">

          <!-- Card sides -->
          <div class="trade-sides grid grid-cols-1 md:grid-cols-2 gap-5">
            <section v-for="side in [
              { key: 'give',    label: t('tradeDetail.youGive'),    icon: 'mdi-arrow-up-circle',   color: 'var(--c-accent)', cards: proposal.i_give },
              { key: 'receive', label: t('tradeDetail.youReceive'), icon: 'mdi-arrow-down-circle', color: 'var(--c-trade)',  cards: proposal.i_receive },
            ]" :key="side.key" class="panel trade-side" :class="`trade-side--${side.key}`" role="group"
              :aria-labelledby="`side-${side.key}`" :style="{ '--td-side': side.color }"
            >
              <div class="td-sidehead">
                <v-icon :icon="side.icon" size="17" :color="side.color" />
                <h2 :id="`side-${side.key}`" class="td-sidehead__label">{{ side.label }}</h2>
                <span v-if="side.cards?.length" class="td-sidehead__n tabular-nums">
                  {{ t('tradeDetail.cardCount', side.cards.length) }}
                </span>
              </div>

              <p v-if="!side.cards?.length" class="text-sm italic py-6 text-center" style="color: var(--c-muted)">
                {{ t('tradeDetail.nothingOnThisSide') }}
              </p>

              <div v-if="side.cards?.length" class="trade-card-list"
                :tabindex="side.cards.length > 4 ? 0 : undefined"
                :aria-label="side.cards.length > 4 ? `${side.label}: ${t('tradeDetail.cardCount', side.cards.length)}` : undefined">
                <div v-for="card in side.cards" :key="card.id" class="td-row">
                  <img :src="cardImage(card.image_id)" :alt="card.name" loading="lazy" class="td-row__art" />
                  <div class="td-row__body">
                    <div class="td-row__top">
                      <p class="td-row__name">{{ card.name }}</p>
                      <CardPrice v-if="prices.get(card.id)" :price="prices.get(card.id)" size="sm" class="shrink-0" />
                    </div>

                    <div class="td-tags">
                      <span v-if="card.extension" class="td-tag td-tag--code">{{ card.extension }}</span>
                      <span v-if="card.rarity" class="td-tag" :title="card.rarity">{{ shortenRarity(card.rarity) }}</span>
                      <span v-if="card.condition" class="td-tag td-tag--dim">{{ card.condition }}</span>
                      <span v-if="card.language" class="td-tag td-tag--dim">{{ card.language }}</span>
                      <!-- Quantity is a fact about this card, so it sits with
                           the card's other facts rather than on a line of its
                           own. Tinted by the side, because how many you hand
                           over and how many you get back are different news. -->
                      <span v-if="card.quantity > 1" class="td-tag td-tag--qty">×{{ card.quantity }}</span>
                    </div>

                    <!-- One icon for the group, not one per link: three cards a
                         side turned twenty-one open-in-new glyphs into the most
                         repeated shape on the page. -->
                    <p class="td-links">
                      <v-icon icon="mdi-open-in-new" size="11" aria-hidden="true" />
                      <a v-for="m in marketLinks(card.name, card.extension)" :key="m.label"
                        :href="m.url" target="_blank" rel="noopener noreferrer">{{ m.label }}</a>
                    </p>
                  </div>
                </div>
              </div>

              <!-- What this side comes to. Inside the panel it belongs to, so
                   the two figures sit under the two piles rather than being
                   collected somewhere else and needing to be matched back up. -->
              <div v-if="side.cards?.length && sideTotal(side.cards).priced" class="td-total">
                <span class="td-total__label">{{ t('price.sourceShort') }}</span>
                <span class="td-total__amount tabular-nums">
                  <template v-if="sideTotal(side.cards).exact">{{ money(sideTotal(side.cards).low) }}</template>
                  <template v-else>{{ money(sideTotal(side.cards).low) }} – {{ money(sideTotal(side.cards).high) }}</template>
                </span>
              </div>
            </section>

            <!-- ── The seam ──────────────────────────────────────────────
                 The two piles lean into one line. It is drawn as a line while
                 the deal is open and turns teal the moment both sides have
                 agreed, so the colour is earned rather than decorative.

                 It carries the lean, not the totals: each pile already prints
                 its own figure at its own foot, and repeating both here was
                 asking the reader to match four numbers up. -->
            <section
              v-if="proposal.i_give?.length && proposal.i_receive?.length"
              class="td-seam"
              :class="{ 'is-sealed': sealed }"
              :aria-label="t('tradeDetail.valueDifference')"
            >
              <span class="td-seam__line" aria-hidden="true" />
              <div class="td-seam__disc">
                <v-icon :icon="sealed ? 'mdi-handshake-outline' : 'mdi-swap-horizontal'" size="20" />
              </div>
              <p v-if="balance" class="td-seam__read" :data-lean="balance.lean">
                <span class="td-seam__lean">{{ balanceLabel }}</span>
                <strong v-if="balanceAmount" class="td-seam__amount tabular-nums">{{ balanceAmount }}</strong>
              </p>
            </section>
          </div>

          <!-- Verification photos -->
          <div v-if="showPhotoPanel" class="panel td-photos">
            <TradePhotosPanel
              :open="true"
              :proposal="proposal"
              :current-user-id="currentUserId"
              v-model:both-uploaded="bothUploaded"
              v-model:mine-uploaded="mineUploaded"
              v-model:theirs-uploaded="theirsUploaded"
            />
          </div>

        </div>

        <!-- Rail: what to do about it. Sticky, because the main column is now
             the longer of the two -- cards, photos and a conversation -- and
             the panel that says what to do next used to scroll away while you
             read the thing you were deciding about. -->
        <aside class="td-rail flex flex-col gap-4 w-full lg:w-[360px] shrink-0">

          <!-- Action panel -->
          <section v-if="isPending || isAccepted" class="panel td-act flex flex-col gap-3">
            <h2 class="td-h">
              {{ t('tradeDetail.whatNext') }}
            </h2>

            <!-- Pending -->
            <template v-if="isPending">
              <template v-if="workflowPhase === 'selection'">
                <p class="text-xs" style="color: var(--c-muted); line-height: 1.6">
                  {{ nextAction === 'chooseReturnCards'
                    ? t('tradeDetail.chooseReturnCardsHelp', { name: counterpartyName })
                    : t('tradeDetail.waitingForReturnSelection', { name: counterpartyName }) }}
                </p>
                <v-btn v-if="nextAction === 'chooseReturnCards'" block variant="flat" prepend-icon="mdi-cards-outline"
                  style="background: var(--c-trade); color: var(--c-on-accent)"
                  @click="openEdit('return')">{{ t('tradeDetail.chooseReturnCards') }}</v-btn>
                <v-btn block variant="outlined" prepend-icon="mdi-cancel" :disabled="busy"
                  style="border-color: var(--c-accent); color: var(--c-accent)"
                  @click="onCancel">{{ t('proposal.cancelTrade') }}</v-btn>
              </template>

              <template v-else-if="workflowPhase === 'agreement'">
                <p class="text-xs" style="color: var(--c-muted); line-height: 1.6">
                  {{ nextAction === 'confirmAgreement'
                    ? t('tradeDetail.confirmRevisionHelp', { revision: proposal.revision })
                    : t('tradeDetail.waitingAgreement', { name: counterpartyName }) }}
                </p>
                <v-btn v-if="nextAction === 'confirmAgreement'" block variant="flat" prepend-icon="mdi-handshake-outline" :loading="busy"
                  style="background: var(--c-mutual); color: var(--c-on-accent)"
                  @click="onConfirmAgreement">{{ t('tradeDetail.confirmAgreement') }}</v-btn>
                <v-btn block variant="outlined" prepend-icon="mdi-cards-outline" :disabled="busy"
                  style="border-color: var(--c-trade); color: var(--c-trade)"
                  @click="openEdit('revise')">{{ t('tradeDetail.changeCardsIWant') }}</v-btn>
                <v-btn block variant="outlined" prepend-icon="mdi-scale-balance" :disabled="busy"
                  style="border-color: var(--c-border); color: var(--c-text)"
                  @click="openTerms">{{ t('tradeDetail.suggestTerms') }}</v-btn>
                <v-btn block variant="outlined" prepend-icon="mdi-cancel" :disabled="busy"
                  style="border-color: var(--c-accent); color: var(--c-accent)"
                  @click="onCancel">{{ t('proposal.cancelTrade') }}</v-btn>
              </template>

              <template v-else>
              <p
                v-if="!proposal.i_am_proposer && !bothUploaded"
                class="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
                style="color: var(--c-text); background: color-mix(in srgb, var(--c-accent) 8%, transparent); border: 1px solid color-mix(in srgb, var(--c-accent) 25%, transparent)"
              >
                <v-icon icon="mdi-alert-outline" size="14" color="var(--c-accent)" class="shrink-0 !mt-0.5" />
                <span>{{ t('tradeDetail.acceptWithoutPhotos') }}</span>
              </p>
              <p v-else class="text-xs" style="color: var(--c-muted); line-height: 1.6">
                <template v-if="!proposal.i_am_proposer">{{ t('tradeDetail.photosVerifiedCanAccept') }}</template>
                <template v-else>{{ t(`proposal.${waitKey}`, { name: counterpartyName }) }}</template>
              </p>

              <!-- Decline reason, inline -->
              <div v-if="declining" class="flex flex-col gap-2">
                <label for="decline-reason" class="text-xs font-semibold" style="color: var(--c-muted)">
                  {{ t('tradeDetail.declineReason') }}
                </label>
                <textarea
                  id="decline-reason"
                  v-model="declineReason"
                  :placeholder="t('tradeDetail.declinePlaceholder')"
                  rows="3"
                  class="w-full text-sm rounded-lg px-3 py-2 border outline-none resize-none"
                  style="background: var(--c-surface-2); border-color: var(--c-border); color: var(--c-text)"
                />
                <div class="flex gap-2 justify-end">
                  <v-btn variant="text" size="small" style="color: var(--c-muted)"
                    :disabled="busy" @click="declining = false">{{ t('common.cancel') }}</v-btn>
                  <v-btn variant="flat" size="small" :loading="busy"
                    style="background: var(--c-accent); color: var(--c-on-accent)"
                    @click="onDecline">{{ t('common.confirm') }}</v-btn>
                </div>
              </div>

              <div v-else class="flex flex-col gap-2">
                <template v-if="!proposal.i_am_proposer">
                  <v-btn block variant="flat" prepend-icon="mdi-check-circle-outline" :loading="busy"
                    style="background: var(--c-mutual); color: var(--c-on-accent)"
                    @click="onAccept">{{ t('proposal.accept') }}</v-btn>
                  <v-btn block variant="outlined" prepend-icon="mdi-swap-horizontal" :disabled="busy"
                    style="border-color: var(--c-trade); color: var(--c-trade)"
                    @click="openEdit('counter')">{{ t('proposal.counter') }}</v-btn>
                  <v-btn block variant="outlined" prepend-icon="mdi-close-circle-outline" :disabled="busy"
                    style="border-color: var(--c-accent); color: var(--c-accent)"
                    @click="declining = true">{{ t('proposal.decline') }}</v-btn>
                </template>
                <template v-else>
                  <v-btn block variant="outlined" prepend-icon="mdi-pencil-outline" :disabled="busy"
                    style="border-color: var(--c-border); color: var(--c-text)"
                    @click="openEdit('edit')">{{ t('proposal.editOffer') }}</v-btn>
                  <v-btn block variant="outlined" prepend-icon="mdi-cancel" :disabled="busy"
                    style="border-color: var(--c-accent); color: var(--c-accent)"
                    @click="onCancel">{{ t('proposal.cancelTrade') }}</v-btn>
                </template>
              </div>
              </template>
            </template>

            <!-- Accepted -->
            <template v-else>
              <div class="flex gap-2">
                <div
                  v-for="s in [
                    { done: iConfirmed,    label: t('tradeDetail.you'),  icon: iConfirmed    ? 'mdi-check-circle' : 'mdi-circle-outline' },
                    { done: theyConfirmed, label: counterpartyName,      icon: theyConfirmed ? 'mdi-check-circle' : 'mdi-clock-outline'  },
                  ]"
                  :key="s.label"
                  class="flex items-center gap-2 rounded-lg px-3 py-2 text-xs flex-1 min-w-0 border"
                  :style="s.done
                    ? { background: 'color-mix(in srgb, var(--c-mutual) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--c-mutual) 35%, transparent)' }
                    : { background: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }"
                >
                  <v-icon :icon="s.icon" size="14" :color="s.done ? 'var(--c-mutual)' : 'var(--c-muted)'" />
                  <span class="font-medium truncate" :style="{ color: s.done ? 'var(--c-mutual)' : 'var(--c-muted)' }">{{ s.label }}</span>
                </div>
              </div>

              <p class="text-xs" style="color: var(--c-muted); line-height: 1.6">
                {{ t(`tradeDetail.${confirmKey}`, { name: counterpartyName }) }}
              </p>

              <div class="flex flex-col gap-2">
                <v-btn v-if="!iConfirmed" block variant="flat" prepend-icon="mdi-handshake-outline" :loading="busy"
                  style="background: var(--c-mutual); color: var(--c-on-accent)"
                  @click="onComplete">{{ t('proposal.confirmYourSide') }}</v-btn>
                <v-btn block variant="outlined" prepend-icon="mdi-cancel" :disabled="busy"
                  style="border-color: var(--c-accent); color: var(--c-accent)"
                  @click="onCancel">{{ t('proposal.cancelTrade') }}</v-btn>
              </div>
            </template>
          </section>

          <!-- Settlement -->
          <section v-if="hasSettlement" class="panel td-sub td-sub--settle flex flex-col gap-3">
            <h2 class="td-h">
              {{ t('tradeDetail.settlement') }}
            </h2>

            <div v-if="proposal.meetup_location" class="flex items-start gap-2">
              <v-icon icon="mdi-map-marker" size="16" color="var(--c-mutual)" class="shrink-0 !mt-0.5" />
              <div class="flex flex-col min-w-0">
                <span class="text-sm font-semibold" style="color: var(--c-text)">
                  {{ t('proposal.meetupAt') }} {{ proposal.meetup_location.name }}
                </span>
                <span v-if="proposal.meetup_location.address" class="text-xs" style="color: var(--c-muted)">
                  {{ proposal.meetup_location.address }}
                </span>
                <span v-if="proposal.meetup_location.event_date" class="text-xs" style="color: var(--c-muted)">
                  {{ proposal.meetup_location.event_date }}
                </span>
                <a v-if="proposal.meetup_location.url"
                  :href="proposal.meetup_location.url" target="_blank" rel="noopener noreferrer"
                  class="text-xs no-underline flex items-center gap-1 mt-1" style="color: var(--c-trade)">
                  <v-icon icon="mdi-open-in-new" size="11" />{{ proposal.meetup_location.name }}
                </a>
              </div>
            </div>

            <div v-if="proposal.trade_method && !proposal.meetup_location" class="flex items-center gap-2">
              <v-icon :icon="tradeMethodIcon" size="16" color="var(--c-muted)" class="shrink-0" />
              <span class="text-sm" style="color: var(--c-text)">{{ tradeMethodLabel }}</span>
            </div>

            <div v-if="proposal.cash_amount" class="flex items-center gap-2">
              <v-icon icon="mdi-currency-eur" size="16" color="var(--c-mutual)" class="shrink-0" />
              <span class="text-sm font-semibold" style="color: var(--c-mutual)">
                {{ cashLabel }} €{{ Number(proposal.cash_amount).toFixed(2) }}
              </span>
            </div>

            <div v-if="proposal.notes" class="flex items-start gap-2">
              <v-icon icon="mdi-note-text-outline" size="16" color="var(--c-muted)" class="shrink-0 !mt-0.5" />
              <p class="text-sm" style="color: var(--c-text); line-height: 1.55">{{ proposal.notes }}</p>
            </div>
          </section>

          <!-- Decline reason, for a trade that was declined -->
          <section
            v-if="proposal.status === 'declined' && proposal.decline_reason"
            class="panel td-sub td-sub--decline flex flex-col gap-2"
            style="border-color: color-mix(in srgb, var(--c-accent) 30%, transparent)"
          >
            <h2 class="td-h td-h--warn">
              {{ t('tradeDetail.declineReason') }}
            </h2>
            <p class="text-sm" style="color: var(--c-text); line-height: 1.55">{{ proposal.decline_reason }}</p>
          </section>

          <!-- Activity log -->
          <section class="panel td-sub td-sub--log flex flex-col gap-3">
            <h2 class="td-h">
              {{ t('tradeDetail.activityLog') }}
            </h2>
            <p v-if="loadingEvents" class="text-xs" style="color: var(--c-muted)">{{ t('common.loading') }}</p>
            <p v-else-if="!events.length" class="text-xs" style="color: var(--c-muted)">{{ t('tradeDetail.noEvents') }}</p>
            <ol v-else class="flex flex-col gap-3 !pl-0" style="list-style: none">
              <li v-for="evt in shownEvents" :key="evt.key" class="flex gap-3">
                <v-icon :icon="evt.icon" size="16" :color="evt.color" class="shrink-0 !mt-0.5" />
                <div class="flex flex-col gap-1 min-w-0 grow">
                  <div class="flex items-baseline gap-2 flex-wrap">
                    <span class="text-sm font-semibold" style="color: var(--c-text)">{{ evt.label }}</span>
                    <span class="text-[11px] px-1.5 py-0.5 rounded"
                      style="background: var(--c-surface-2); color: var(--c-muted)">{{ evt.actor }}</span>
                    <span class="text-[11px] ml-auto shrink-0" style="color: var(--c-muted)">{{ eventTime(evt.createdAt) }}</span>
                  </div>
                  <!-- What the trade moved between. Dropped when this log was
                       ported over from the dialog; it is the only line that
                       says what actually changed. -->
                  <p v-if="evt.hasTransition" class="text-[11px]" style="color: var(--c-muted)">
                    {{ statusLabel(evt.fromStatus) }} → {{ statusLabel(evt.toStatus) }}
                  </p>
                  <p v-if="evt.notes" class="text-xs leading-snug italic px-2 !py-1.5 rounded-lg"
                    style="background: color-mix(in srgb, var(--c-muted) 8%, transparent); color: var(--c-text)">
                    "{{ evt.notes }}"
                  </p>
                </div>
              </li>
            </ol>
          </section>
        </aside>
      </div>

      <!-- Cancelling an accepted trade cannot be undone, so it is the one
           action here that asks, and it names the person on the other side. -->
      <v-dialog v-model="cancelConfirm.open" max-width="440">
        <v-card class="!rounded-2xl" style="background-color: var(--c-surface); color: var(--c-text); border: 1px solid var(--c-border)">
          <div class="flex flex-col gap-3 px-6 pt-6">
            <div class="flex items-center gap-3">
              <v-icon icon="mdi-alert-circle-outline" size="22" color="var(--c-accent)" />
              <p class="text-base font-bold">{{ t('tradeCenter.cancelConfirmTitle') }}</p>
            </div>
            <p class="text-sm" style="color: var(--c-muted); line-height: 1.55">
              {{ t('tradeCenter.cancelConfirmBody', { name: counterpartyName }) }}
            </p>
          </div>
          <div class="flex justify-end gap-2 px-6 py-5">
            <v-btn variant="text" style="color: var(--c-muted)" :disabled="cancelConfirm.working"
              @click="cancelConfirm.open = false">{{ t('tradeCenter.cancelConfirmKeep') }}</v-btn>
            <v-btn variant="flat" style="background-color: var(--c-accent); color: var(--c-on-accent)"
              :loading="cancelConfirm.working"
              @click="doCancel">{{ t('tradeCenter.cancelConfirmDo') }}</v-btn>
          </div>
        </v-card>
      </v-dialog>

      <!-- The conversation, docked to the corner. Suspended while this page
           raises a dialog of its own, so a panel can never end up stranded
           behind a modal. -->
      <TradeChatSleeve
        :proposal="proposal"
        :current-user-id="currentUserId"
        :suspended="editOpen || termsOpen || cancelConfirm.open"
      />

      <ProposeTradeDialog
        v-model="editOpen"
        :edit-proposal="editMode === 'edit' ? proposal : null"
        :counter-proposal="editMode === 'counter' ? proposal : null"
        :return-proposal="editMode === 'return' ? proposal : null"
        :revision-proposal="editMode === 'revise' ? proposal : null"
        @updated="onEdited('edit')"
        @countered="onEdited('counter')"
      />

      <v-dialog v-model="termsOpen" max-width="480">
        <v-card class="!rounded-2xl !p-5 flex flex-col gap-4" style="background: var(--c-surface); color: var(--c-text); border: 1px solid var(--c-border)">
          <h2 class="text-lg font-bold">{{ t('tradeDetail.suggestTerms') }}</h2>
          <!-- How you settle it, and where. Changing either clears both
               confirmations and bumps the revision, which is right: where you
               meet is part of what the two of you agreed to. -->
          <LocationPicker
            v-model="terms.meetup_location"
            v-model:deliveryMode="terms.deliveryMode"
            :counterparty-name="counterpartyName"
          />
          <label class="flex flex-col gap-2 text-sm">
            <span>{{ t('proposeDialog.addCashOffset') }}</span>
            <input v-model.number="terms.cash_amount" type="number" min="0" step="0.01" class="rounded-lg border px-3 py-2" style="background: var(--c-surface-2); border-color: var(--c-border); color: var(--c-text)" />
          </label>
          <div v-if="Number(terms.cash_amount) > 0" class="flex flex-col gap-2 text-sm">
            <v-select v-model="terms.cash_payer" :items="[
              { title: proposal.i_am_proposer ? t('proposeDialog.youPay') : t('proposeDialog.theyPay'), value: 'proposer' },
              { title: proposal.i_am_proposer ? t('proposeDialog.theyPay') : t('proposeDialog.youPay'), value: 'counterparty' },
            ]" :label="t('tradeDetail.cashPayer')" item-title="title" item-value="value" hide-details density="comfortable" />
          </div>
          <div class="flex justify-end gap-2">
            <v-btn variant="text" :disabled="busy" @click="termsOpen=false">{{ t('common.cancel') }}</v-btn>
            <v-btn variant="flat" :loading="busy" style="background: var(--c-trade); color: var(--c-on-accent)" @click="saveTerms">{{ t('tradeDetail.suggestTerms') }}</v-btn>
          </div>
        </v-card>
      </v-dialog>
    </template>

    <v-snackbar v-model="snackbar.open" :timeout="4000" :color="snackbar.color ?? 'var(--c-mutual)'">
      {{ snackbar.message }}
    </v-snackbar>
  </div>
</template>

<style scoped>
/* ──────────────────────────────────────────────────────────────────────────
   The page borrows the landing page's surface vocabulary -- a panel ground one
   tonal step under the surface, borders at partial alpha, a 1px lit top edge
   instead of an outer shadow, and the 24/18/12 radius family -- so arriving
   here from the marketing site does not feel like arriving at a different
   product. What it does not borrow is the landing's body face or its pill
   buttons: running text and controls stay the app's, because this page is one
   route inside an app and the seam would show on every navigation into it.

   Space Grotesk is the one type borrow, and only on the trade's own number and
   the seam's figure. DESIGN.md §3 says the system uses the device sans
   throughout; this is a deliberate, page-scoped exception, and the reason is
   that a trade is the one screen in the app somebody sends to another person.
   ────────────────────────────────────────────────────────────────────────── */
.trade-page {
  /* Wider than the app's reading pages on purpose: the two columns only earn
     their keep if the main one still fits two card lists side by side once the
     360px rail is taken out of it. */
  max-width: 1400px;

  --td-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --td-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --td-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);
  --td-lit: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent);
  --td-r: 22px;
  --td-r-card: 14px;
  --td-r-sm: 9px;
  --td-display: "Space Grotesk", system-ui, -apple-system, sans-serif;
  --td-mono: ui-monospace, "Cascadia Code", SFMono-Regular, Menlo, monospace;
}

.panel {
  background-color: var(--td-panel);
  border: 1px solid var(--td-line);
  border-radius: var(--td-r);
  box-shadow: var(--td-lit);
  padding: 18px;
}

/* The collector's register: monospace, uppercase, widely tracked. Every label
   on the page that names a section rather than saying something is set in it,
   which is the same voice the binder and the set codes already use
   (DESIGN.md, The Mono Identifier Rule / The Uppercase Section Rule). */
.td-h {
  margin: 0;
  font-family: var(--td-mono);
  font-size: 0.69rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--c-muted);
}
.td-h--warn { color: var(--c-accent); }

/* ── Header ──────────────────────────────────────────────────────────────── */
.td-head { padding: 18px 20px; overflow: hidden; }

.td-head__top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
}

/* Flat. The avatar used to sit on a blurred disc of its own colour, which is a
   drop shadow wearing a hat (DESIGN.md, The Flat-By-Default Rule) and which
   the seam's one earned glow now has to be louder than. */
.td-head__face {
  position: relative;
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  overflow: hidden;
  font-weight: 800;
  font-size: 1.05rem;
  color: var(--c-on-accent);
  background: var(--c-trade);
}
.td-head__face[data-side="get"] { background: var(--c-accent); }
.td-head__face img { width: 100%; height: 100%; object-fit: cover; }

.td-head__who { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1 1 12rem; }

.td-head__title {
  margin: 0;
  font-family: var(--td-display);
  font-weight: 700;
  font-size: clamp(1.25rem, 2.2vw, 1.7rem);
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: var(--c-text);
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0 10px;
}
/* The trade's number is an identifier, so it is set like one, and it is the
   half of the heading that stays the same length in every language. */
.td-head__id {
  font-family: var(--td-mono);
  font-size: 0.72em;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--c-muted);
}
.td-head__meta { margin: 0; font-size: 0.8rem; color: var(--c-muted); }

.td-pill {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 13px;
  border: 1px solid;
  border-radius: 999px;
  font-family: var(--td-mono);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

/* ── The spine: four named stops on one line ──────────────────────────────
   A real sequence, so it is drawn as one. Each stop owns the length of rail to
   its left, which is what lets the line fill as the trade advances without a
   second element to keep in step. Reached stops are amethyst because moving a
   trade along is offering, not agreeing -- teal belongs to the seam. */
.td-spine {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 0;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}
.td-spine__stop { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.td-spine__rail {
  height: 2px;
  border-radius: 2px;
  background: var(--td-line-soft);
  transition: background-color 0.25s ease;
}
.td-spine__stop.is-done .td-spine__rail,
.td-spine__stop.is-here .td-spine__rail { background: var(--c-trade); }

.td-spine__label {
  font-family: var(--td-mono);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--c-muted);
  /* Not 0.6, which measures 3.18:1 on the header ground -- a stop you have not
     reached yet is still a label somebody has to read, not disabled chrome.
     0.82 puts it at 4.96:1 dark and 4.96:1 light, both over AA.
     The reached/unreached difference is carried by the rail's colour and by
     the current stop being amethyst, so the opacity is a third cue rather
     than the only one. */
  opacity: 0.82;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.td-spine__stop.is-done .td-spine__label { opacity: 0.92; }
.td-spine__stop.is-here .td-spine__label { color: var(--c-trade); opacity: 1; }

/* ── The two piles ───────────────────────────────────────────────────────── */
.trade-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.td-sidehead {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 11px;
  border-bottom: 1px solid var(--td-line-soft);
}
.td-sidehead__label {
  margin: 0;
  font-family: var(--td-mono);
  font-size: 0.69rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--td-side);
}
.td-sidehead__n {
  margin-left: auto;
  font-family: var(--td-mono);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--c-muted);
}

.trade-card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(620px, 65vh);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}
.trade-card-list:focus-visible {
  outline: 2px solid var(--c-trade);
  outline-offset: 2px;
  border-radius: var(--td-r-card);
}

/* ── A card in a pile ────────────────────────────────────────────────────── */
.td-row {
  display: flex;
  gap: 12px;
  padding: 11px;
  border-radius: var(--td-r-card);
  background: color-mix(in srgb, var(--c-surface-2) 62%, transparent);
  border: 1px solid var(--td-line-soft);
}
.td-row__art {
  flex: none;
  width: 58px;
  aspect-ratio: 59 / 86;
  height: auto;
  object-fit: contain;
  border-radius: 6px;
  background: var(--c-surface);
}
.td-row__body { display: flex; flex-direction: column; gap: 7px; min-width: 0; flex: 1; }
.td-row__top { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.td-row__name {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 0.84rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--c-text);
}

.td-tags { display: flex; flex-wrap: wrap; gap: 5px; }
.td-tag {
  padding: 3px 7px;
  border-radius: var(--td-r-sm);
  font-size: 0.66rem;
  font-weight: 600;
  line-height: 1.35;
  background: color-mix(in srgb, var(--c-muted) 13%, transparent);
  color: var(--c-text);
}
.td-tag--code {
  font-family: var(--td-mono);
  font-weight: 700;
  letter-spacing: 0.02em;
  background: color-mix(in srgb, var(--c-trade) 15%, transparent);
  color: var(--c-trade);
}
.td-tag--dim { color: var(--c-muted); background: color-mix(in srgb, var(--c-muted) 10%, transparent); }
.td-tag--qty {
  font-family: var(--td-mono);
  font-weight: 700;
  background: color-mix(in srgb, var(--td-side) 16%, transparent);
  color: var(--td-side);
}

.td-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin: 1px 0 0;
  font-size: 0.68rem;
  color: var(--c-muted);
}
.td-links .v-icon { opacity: 0.65; }
.td-links a { color: inherit; text-decoration: none; transition: color 0.15s ease; }
.td-links a:hover { color: var(--c-text); text-decoration: underline; }
.td-links a:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; border-radius: 3px; }

/* ── What a pile comes to ─────────────────────────────────────────────────
   A rule across the foot of the panel, not another bordered box: the panel is
   already framed and the cards inside it each are, so a third frame would be
   the fourth edge in 40px (DESIGN.md, The Flat-By-Default Rule). Neutral --
   the panel heading already carries the side's colour, and repeating it on the
   figure would say the money is amethyst or pink, which is not a thing money
   is here (The Three-Role Rule). */
.td-total {
  display: flex; align-items: baseline; gap: 10px;
  margin-top: auto; padding-top: 12px;
  border-top: 1px solid var(--td-line-soft);
}
.td-total__label {
  font-family: var(--td-mono);
  font-size: 0.62rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.16em; color: var(--c-muted);
}
.td-total__amount {
  margin-left: auto;
  font-family: var(--td-display);
  font-size: 1rem; font-weight: 700; letter-spacing: -0.02em;
  color: var(--c-text); white-space: nowrap;
}

/* ── The seam ─────────────────────────────────────────────────────────────
   The page's signature, and its one loud moment. Two piles leaning into a
   single line, with a disc on it that says which way the deal leans -- and
   which turns teal only once both sides have agreed. Teal is the colour of
   agreement and of nothing else (DESIGN.md, The Agreement Rule), so it is
   absent from a trade that has not got one yet, and its arrival is the visual
   event that marks the moment the whole product exists to produce.

   It runs down the gutter on a wide screen and across the join on a narrow
   one. The old centre column simply vanished under 1100px, which took the one
   reading of who is ahead off the screen exactly where the two piles are
   furthest apart and hardest to compare by eye. */
.td-seam {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-width: 0;
  padding: 18px 6px;
  /* Below the three-column layout the piles stack or sit two-up and the seam
     is the rule under both of them, so it takes the whole row rather than
     centring itself inside the left-hand column. */
  grid-column: 1 / -1;
}

.td-seam__line {
  position: absolute;
  background: var(--td-line);
  transition: background-color 0.35s ease;
  /* Narrow: a rule across the join. */
  left: 8px; right: 8px; top: 50%; height: 1px;
  transform: translateY(-50%);
}
.td-seam.is-sealed .td-seam__line {
  background: color-mix(in srgb, var(--c-mutual) 60%, transparent);
}

.td-seam__disc {
  position: relative;
  z-index: 1;
  flex: none;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 999px;
  background: var(--td-panel);
  border: 1px solid var(--td-line);
  color: var(--c-muted);
  transition: background-color 0.35s ease, border-color 0.35s ease, color 0.35s ease, box-shadow 0.35s ease;
}
/* The one glow on the page, on the one thing worth glowing. */
.td-seam.is-sealed .td-seam__disc {
  background: var(--c-mutual);
  border-color: var(--c-mutual);
  color: var(--c-on-accent);
  box-shadow: 0 0 0 8px color-mix(in srgb, var(--c-mutual) 14%, transparent);
}

/* The lean. Never an em-dash: when the two price bands overlap, neither side
   is ahead on any reading of the numbers, and saying that is worth more than
   admitting the subtraction did not resolve. */
.td-seam__read {
  position: relative;
  z-index: 1;
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--td-panel);
}
.td-seam__lean {
  font-family: var(--td-mono);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--c-muted);
  line-height: 1.3;
}
.td-seam__amount {
  font-family: var(--td-display);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--c-text);
  /* Allowed to break at the en dash rather than run out of the gutter: a
     150px column and a four-figure band do not both fit on one line. */
  text-wrap: balance;
}

@media (min-width: 1100px) {
  .trade-sides { grid-template-columns: minmax(0, 1fr) 152px minmax(0, 1fr); align-items: stretch; }
  .trade-side--give { order: 1; }
  .trade-side--receive { order: 3; }
  .td-seam { order: 2; grid-column: auto; flex-direction: column; padding: 24px 4px; gap: 0; }

  /* Wide: the rule stands up and runs the height of both piles. */
  .td-seam .td-seam__line {
    left: 50%; right: auto; top: 10px; bottom: 10px; height: auto; width: 1px;
    transform: translateX(-50%);
    background: linear-gradient(180deg, transparent, var(--td-line) 12%, var(--td-line) 88%, transparent);
  }
  .td-seam.is-sealed .td-seam__line {
    background: linear-gradient(
      180deg,
      transparent,
      color-mix(in srgb, var(--c-mutual) 60%, transparent) 12%,
      color-mix(in srgb, var(--c-mutual) 60%, transparent) 88%,
      transparent
    );
  }
  .td-seam__read {
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin-top: 12px;
    padding: 8px 6px;
    text-align: center;
  }
}

/* ── The rail ─────────────────────────────────────────────────────────────
   The action panel is why somebody opened this page, so it stops looking like
   the activity log: it sits on the surface proper rather than the recessed
   panel ground, and its border carries the amethyst of an offer. Ground and
   position, not a second button vocabulary -- the controls stay the app's. */
.td-act {
  background: var(--c-surface);
  border-color: color-mix(in srgb, var(--c-trade) 38%, transparent);
  box-shadow: var(--td-lit);
  padding: 16px;
}
.td-sub { padding: 16px; }
.td-photos { padding: 16px; }

/* ── The stacked order ────────────────────────────────────────────────────
   Below the two-column layout the rail's panels have to interleave with the
   main column's, not queue up behind them: the chat moving into the main
   column would otherwise push "what happens next" below the whole
   conversation, which is the one panel that must stay near the top of a
   phone screen. Both columns dissolve so every panel is a child of the same
   stack, and the stack is ordered the way somebody reads a trade -- what is
   being swapped, what to do about it, how it settles, the evidence, the
   conversation, then the history. */
@media (max-width: 1023px) {
  .td-main, .td-rail { display: contents; }
  .trade-sides       { order: 1; }
  .td-act            { order: 2; }
  .td-sub--settle    { order: 3; }
  .td-sub--decline   { order: 4; }
  .td-photos         { order: 5; }
  .td-sub--log       { order: 6; }
}

@media (min-width: 1024px) {
  .td-rail {
    position: sticky;
    top: 12px;
    align-self: flex-start;
    /* Usually shorter than the window now that the chat has left it, so no
       scrollbar appears. The cap is for the trade that has a long settlement
       note and a long history: an inner scroll is worse than none, and much
       better than the bottom of the rail being unreachable. */
    max-height: calc(100dvh - 24px);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}

/* ── States ──────────────────────────────────────────────────────────────── */
.state-card {
  background-color: var(--td-panel);
  border: 1px solid var(--td-line);
  border-radius: var(--td-r);
  padding: 48px 24px;
}

.back-link {
  background: none;
  border: 0;
  padding: 4px 0;
  color: var(--c-muted);
  font: inherit;
}
.back-link:hover { color: var(--c-text); }
.back-link:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 3px;
  border-radius: 4px;
}

.skeleton {
  border-radius: var(--td-r);
  background: linear-gradient(90deg, var(--c-surface) 25%, var(--c-surface-2) 50%, var(--c-surface) 75%);
  background-size: 200% 100%;
  animation: skeleton-pan 1.4s ease-in-out infinite;
}

@keyframes skeleton-pan {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

@media (max-width: 640px) {
  .trade-page { --td-r: 18px; }
  .td-head { padding: 16px; }

  /* Four labels across 375px ellipsise into each other -- "CHOOSING CA…"
     abutting "AGREEING" reads as one run-on string rather than as two stops.
     The rail keeps all four segments, because that is what carries how far
     along the trade is; only the stop you are standing on is named. */
  .td-spine { position: relative; padding-bottom: 22px; }
  .td-spine__stop { gap: 0; }
  .td-spine__label { display: none; }
  .td-spine__stop.is-here .td-spine__label {
    display: block;
    position: absolute;
    left: 0;
    bottom: 0;
    max-width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; }
  .td-seam__line,
  .td-seam__disc,
  .td-spine__rail { transition: none; }
}
</style>
