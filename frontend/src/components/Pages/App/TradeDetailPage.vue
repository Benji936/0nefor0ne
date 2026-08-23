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
  cancelTradeProposal, completeTradeProposal,
} from "@/lib/proposals";
import { handleIfPhoneRequired } from "@/lib/phoneGate";
import TradePhotosPanel from "@/components/trade/TradePhotosPanel.vue";
import TradeChatPanel   from "@/components/trade/TradeChatPanel.vue";
import ProposeTradeDialog from "@/components/trade/ProposeTradeDialog.vue";
import TraderLink       from "@/components/trade/TraderLink.vue";
import CardPrice        from "@/components/trade/CardPrice.vue";
import { fetchCardPrices, sumPrices, formatMoney } from "@/lib/cardmarketPrice";

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
      <header class="panel overflow-hidden">
        <!-- Wraps rather than truncates: at 375px the status pill left so
             little room that the title read "Trade #26 · T…", which hides the
             one thing the heading is for. -->
        <div class="flex flex-wrap items-center gap-3 md:gap-4 px-4 md:px-6 py-4">
          <div class="relative shrink-0">
            <div class="absolute -inset-1 rounded-full blur-md opacity-35"
              :style="{ backgroundColor: proposal.i_am_proposer ? 'var(--c-trade)' : 'var(--c-accent)' }" />
            <div
              class="relative size-11 md:size-13 rounded-full flex items-center justify-center font-bold text-white ring-2 ring-white/10 overflow-hidden"
              :style="{ backgroundColor: proposal.i_am_proposer ? 'var(--c-trade)' : 'var(--c-accent)' }"
            >
              <img v-if="proposal.counterparty_avatar_url" :src="proposal.counterparty_avatar_url"
                alt="" class="w-full h-full object-cover" />
              <span v-else>{{ counterpartyName[0].toUpperCase() }}</span>
            </div>
          </div>

          <div class="flex flex-col min-w-0 flex-1" style="flex-basis: 12rem">
            <h1 class="font-bold text-lg md:text-2xl leading-tight" style="color: var(--c-text)">
              {{ t('tradeDetail.tradeNumber', { id: proposal.id }) }} ·
              <TraderLink :trader-id="proposal.counterparty_id" underline>{{ counterpartyName }}</TraderLink>
            </h1>
            <p class="text-xs md:text-sm mt-1" style="color: var(--c-muted)">
              {{ proposal.i_am_proposer ? t('proposal.youProposed') : t('proposal.proposedToYou') }} · {{ formattedDate }}
            </p>
          </div>

          <span
            class="flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg border shrink-0"
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
        <div class="h-px w-full" style="background: linear-gradient(90deg, var(--c-accent), transparent 40%, transparent 60%, var(--c-trade))" />
      </header>

      <!-- ── Two columns ────────────────────────────────────────────────── -->
      <div class="flex flex-col lg:flex-row gap-5 items-start">

        <!-- Main: what is being traded -->
        <div class="flex flex-col gap-5 min-w-0 w-full lg:flex-1">

          <!-- Card sides -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
            <section v-for="side in [
              { key: 'give',    label: t('tradeDetail.youGive'),    icon: 'mdi-arrow-up-circle',   color: 'var(--c-accent)', cards: proposal.i_give },
              { key: 'receive', label: t('tradeDetail.youReceive'), icon: 'mdi-arrow-down-circle', color: 'var(--c-trade)',  cards: proposal.i_receive },
            ]" :key="side.key" class="panel flex flex-col gap-3 !p-4" role="group"
              :aria-labelledby="`side-${side.key}`"
            >
              <div class="flex items-center gap-2 pb-2" style="border-bottom: 1px solid var(--c-border)">
                <v-icon :icon="side.icon" size="18" :color="side.color" />
                <h2 :id="`side-${side.key}`" class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">
                  {{ side.label }}
                </h2>
                <span v-if="side.cards?.length" class="ml-auto text-[11px] font-semibold px-2 py-1 rounded-md"
                  :style="{ background: `color-mix(in srgb, ${side.color} 15%, transparent)`, color: side.color }">
                  {{ t('tradeDetail.cardCount', side.cards.length) }}
                </span>
              </div>

              <p v-if="!side.cards?.length" class="text-sm italic py-6 text-center" style="color: var(--c-muted)">
                {{ t('tradeDetail.nothingOnThisSide') }}
              </p>

              <div v-for="card in side.cards" :key="card.id"
                class="flex gap-3 rounded-lg px-3 py-3"
                style="background-color: var(--c-surface-2); border: 1px solid var(--c-border)">
                <img :src="cardImage(card.image_id)" :alt="card.name" loading="lazy"
                  class="rounded-md object-contain shrink-0 ring-1 ring-white/10"
                  style="width: 62px; height: 88px; background-color: var(--c-surface)" />
                <div class="flex flex-col gap-2 min-w-0 grow">
                  <div class="flex items-baseline gap-2 min-w-0">
                    <p class="font-semibold text-sm leading-tight flex-1 min-w-0" style="color: var(--c-text)">{{ card.name }}</p>
                    <CardPrice v-if="prices.get(card.id)" :price="prices.get(card.id)" size="sm" class="shrink-0" />
                  </div>
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
                    {{ t('tradeDetail.qty') }} <span :style="{ color: side.color }">{{ card.quantity }}</span>
                  </p>
                  <div class="flex gap-3 mt-1 flex-wrap">
                    <a v-for="m in marketLinks(card.name, card.extension)" :key="m.label"
                      :href="m.url" target="_blank" rel="noopener noreferrer"
                      class="text-[11px] flex items-center gap-1 no-underline transition-opacity hover:opacity-70"
                      style="color: var(--c-muted)">
                      <v-icon icon="mdi-open-in-new" size="11" />{{ m.label }}
                    </a>
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
          </div>

          <!-- Verification photos -->
          <div v-if="showPhotoPanel" class="panel">
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

        <!-- Rail: what to do about it -->
        <aside class="flex flex-col gap-4 w-full lg:w-[360px] shrink-0">

          <!-- Action panel -->
          <section v-if="isPending || isAccepted" class="panel !p-4 flex flex-col gap-3">
            <h2 class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">
              {{ t('tradeDetail.whatNext') }}
            </h2>

            <!-- Pending -->
            <template v-if="isPending">
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
          <section v-if="hasSettlement" class="panel !p-4 flex flex-col gap-3">
            <h2 class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">
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
            class="panel !p-4 flex flex-col gap-2"
            style="border-color: color-mix(in srgb, var(--c-accent) 30%, transparent)"
          >
            <h2 class="text-xs font-bold uppercase tracking-wide" style="color: var(--c-accent)">
              {{ t('tradeDetail.declineReason') }}
            </h2>
            <p class="text-sm" style="color: var(--c-text); line-height: 1.55">{{ proposal.decline_reason }}</p>
          </section>

          <!-- Chat: a panel now, not a modal on top of a modal -->
          <section class="panel !px-0 !pt-0 !pb-2">
            <TradeChatPanel
              :open="true"
              :proposal="proposal"
              :current-user-id="currentUserId"
            />
          </section>

          <!-- Activity log -->
          <section class="panel !p-4 flex flex-col gap-3">
            <h2 class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">
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

      <ProposeTradeDialog
        v-model="editOpen"
        :edit-proposal="editMode === 'edit' ? proposal : null"
        :counter-proposal="editMode === 'counter' ? proposal : null"
        @updated="onEdited('edit')"
        @countered="onEdited('counter')"
      />
    </template>

    <v-snackbar v-model="snackbar.open" :timeout="4000" :color="snackbar.color ?? 'var(--c-mutual)'">
      {{ snackbar.message }}
    </v-snackbar>
  </div>
</template>

<style scoped>
/* ── Side subtotal ────────────────────────────────────────────────────────
   A rule across the foot of the panel, not another bordered box: the panel is
   already framed and the cards inside it each are, so a third frame would be
   the fourth edge in 40px (DESIGN.md, The Flat-By-Default Rule). Neutral --
   the panel heading already carries the side's colour, and repeating it on the
   figure would say the money is amethyst or pink, which is not a thing money
   is here (The Three-Role Rule). */
.td-total {
  display: flex; align-items: baseline; gap: 10px;
  margin-top: 2px; padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--c-border) 60%, transparent);
}
.td-total__label {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.16em; color: var(--c-muted);
}
.td-total__amount {
  margin-left: auto; font-size: 15px; font-weight: 700; color: var(--c-text);
  white-space: nowrap;
}

/*
  Wider than the app's reading pages on purpose. The two columns only earn
  their keep if the main one still fits two card lists side by side once the
  360px rail is taken out of it.
*/
.trade-page {
  max-width: 1400px;
}

.panel {
  background-color: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 16px;
}

.state-card {
  background-color: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 16px;
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
  border-radius: 16px;
  background: linear-gradient(90deg, var(--c-surface) 25%, var(--c-surface-2) 50%, var(--c-surface) 75%);
  background-size: 200% 100%;
  animation: skeleton-pan 1.4s ease-in-out infinite;
}

@keyframes skeleton-pan {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; }
}
</style>
