<script setup>
/**
 * The billing facts for one owned community, under its row on the account page.
 *
 * Everything shown here comes from what stripe-webhook mirrored onto the claim
 * row, with one exception noted below. The date is labelled from
 * cancel_at_period_end rather than from status, because Stripe leaves a
 * cancelled subscription 'active' until the period actually ends - see
 * lib/communityBilling.js for the full matrix.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { setSubscriptionCancellation, openBillingPortal } from "@/lib/community";
// Not mdi-discord: that glyph is missing from the bundled webfont and renders
// as an empty box. PlatformIcon draws it inline. Same reason as the note in
// CommunityVerifyPage.vue.
import PlatformIcon from "@/components/community/PlatformIcon.vue";
import { communityPricing, formatPrice } from "@/lib/communityPricing";
import {
  billingState, canCancel, canReactivate, hasPortal,
  formatBillingDate, BILLING_STATE,
} from "@/lib/communityBilling";

const props = defineProps({
  community: { type: Object, required: true },
  /** One entry from fetchMyClaimSources(), or null while it loads. */
  claim: { type: Object, default: null },
  /** The viewer's own country, the pricing fallback when the community has none. */
  countryCode: { type: String, default: null },
  /** The billing read failed. Say so; do not describe a plan we could not load. */
  unavailable: { type: Boolean, default: false },
});
const emit = defineEmits(["changed"]);

const { t, locale } = useI18n();
const busy = ref(false);

const info = computed(() => billingState(props.claim));
const date = computed(() => formatBillingDate(info.value.date, locale.value));

const planLabel = computed(() => {
  // Discord bills per guild on Discord's own terms; we hold no interval or
  // price for it, so it names itself rather than borrowing the Stripe plan copy.
  if (info.value.state === BILLING_STATE.DISCORD) return t("community.billingDiscordActive");
  if (info.value.interval === "year")  return t("community.planYear");
  if (info.value.interval === "month") return t("community.planMonth");
  return t("community.planUnknown");
});

/** When the Guild Subscription started. Only ever set on the Discord state. */
const since = computed(() => formatBillingDate(info.value.since, locale.value));

/**
 * What the plan costs, from the current price table.
 *
 * The one figure on this panel that is not mirrored from Stripe. It is right
 * today because there has only ever been one price per currency per interval,
 * but it describes what this plan WOULD cost rather than what this subscriber
 * is actually charged, so it would start lying the day a price changes or
 * anybody is grandfathered. Mirroring the subscription's own unit_amount is
 * Cycle 2 work; until then this is the honest limit of what we hold.
 */
const priceLabel = computed(() => {
  const iv = info.value.interval;
  if (!iv) return null;
  const p = communityPricing(props.community, props.countryCode);
  return formatPrice(p[iv].amount, p.currency, locale.value);
});

// The sentence under the plan. One state, one line, so there is never a renewal
// date and an end date on screen at the same time.
const statusLine = computed(() => {
  // Checked before the state machine, because every branch below describes a
  // subscription and we have not managed to read one.
  if (props.unavailable) return t("community.billingUnavailable");
  const d = date.value;
  switch (info.value.state) {
    case BILLING_STATE.ACTIVE:     return d ? t("community.billingRenews", { date: d }) : null;
    case BILLING_STATE.TRIALING:   return d ? t("community.billingTrial",  { date: d }) : null;
    case BILLING_STATE.CANCELLING: return d ? t("community.billingEnds",   { date: d }) : null;
    case BILLING_STATE.PAST_DUE:   return t("community.billingPastDue");
    case BILLING_STATE.LAPSED:     return t("community.billingLapsed");
    // "Since X" when we know when it started, and the how-to-manage sentence
    // either way - it is the only actionable thing we can offer, because the
    // subscription lives on Discord's side and has no controls here.
    case BILLING_STATE.DISCORD:
      return since.value
        ? `${t("community.billingDiscordSince", { date: since.value })} · ${t("community.billingDiscord")}`
        : t("community.billingDiscord");
    default:                       return t("community.billingNone");
  }
});

const cancelling = computed(() => info.value.state === BILLING_STATE.CANCELLING);
const isDiscord  = computed(() => !props.unavailable && info.value.state === BILLING_STATE.DISCORD);
// Discord has a plan line too now — it just carries no interval or price, so it
// cannot be gated on having one.
const showPlan   = computed(() =>
  !props.unavailable && (info.value.state === BILLING_STATE.DISCORD || !!info.value.interval));

// No actions on a failed read. Every one of them would act on, or link to, a
// subscription whose state we do not actually know.
const showActions = computed(() => !props.unavailable);

async function change(action) {
  if (busy.value) return;
  if (action === "cancel") {
    const when = date.value;
    // Confirm through the browser, like manageSubscription's error path in
    // Account.vue. Cancelling is reversible right up to the date in this
    // sentence, which is why it does not warrant a heavier dialog.
    if (!window.confirm(t("community.billingCancelConfirm", { date: when ?? "" }))) return;
  }
  busy.value = true;
  try {
    const res = await setSubscriptionCancellation(props.community.id, action);
    if (res?.error) { window.alert(t("community.billingCancelError")); return; }
    emit("changed");
  } catch {
    window.alert(t("community.billingCancelError"));
  } finally {
    busy.value = false;
  }
}

async function portal() {
  if (busy.value) return;
  busy.value = true;
  try {
    const res = await openBillingPortal(props.community.id, locale.value);
    if (res?.url) { window.location.href = res.url; return; }
    // lib/edgeFunction.js goes out of its way to recover the error body that
    // supabase-js discards, precisely so a function that said WHICH thing broke
    // gets heard. Swallowing it here undid that work: "Could not open billing"
    // is true of every failure and diagnoses none of them.
    console.error("claim-portal refused", res);
    window.alert(t("community.manageSubBillingError"));
  } catch (err) {
    console.error("claim-portal threw", err);
    window.alert(t("community.manageSubBillingError"));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="cbl">
    <div class="cbl-facts">
      <span v-if="showPlan" class="cbl-plan">
        {{ planLabel }}<template v-if="priceLabel"> · {{ priceLabel }}</template>
      </span>
      <span v-if="statusLine" class="cbl-status" :class="{ 'cbl-status--warn': cancelling }">
        {{ statusLine }}
        <template v-if="cancelling"> {{ t('community.billingEndsHint') }}</template>
      </span>
    </div>

    <div class="cbl-actions">
      <!-- Sits exactly where Cancel would be on the Stripe path. An owner
           hunting for a cancel button looks here first, and finding nothing at
           all reads as "there is no way out" rather than "the way out is
           elsewhere". Not a button: there is genuinely nothing for us to call,
           and a control that only explains itself is worse than a label. -->
      <span v-if="isDiscord" class="cbl-note">
        <PlatformIcon platform="discord" :size="14" />
        {{ t('community.billingCancelInDiscord') }}
      </span>

      <button
        v-if="showActions && canReactivate(claim)"
        type="button" class="cbl-btn cbl-primary" :disabled="busy"
        @click="change('reactivate')"
      >{{ t('community.billingReactivate') }}</button>

      <button
        v-else-if="showActions && canCancel(claim)"
        type="button" class="cbl-btn" :disabled="busy"
        @click="change('cancel')"
      >{{ t('community.billingCancel') }}</button>

      <button
        v-if="showActions && hasPortal(claim)"
        type="button" class="cbl-btn" :disabled="busy"
        @click="portal"
      >{{ t('community.billingCardsInvoices') }}</button>
    </div>
  </div>
</template>

<style scoped>
.cbl {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  padding: 0 10px 10px;
}
.cbl-facts { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 220px; }
.cbl-plan   { font-size: 0.75rem; font-weight: 700; color: var(--c-text); }
.cbl-status { font-size: 0.75rem; color: var(--c-muted); }
.cbl-status--warn { color: var(--c-warn, var(--c-trade)); }
.cbl-actions { display: flex; align-items: center; gap: 4px; margin-left: auto; }
.cbl-primary { color: var(--c-trade); }

/* Copied from .acct-linkbtn in Account.vue rather than reused. Scoped styles
   reach a child component's ROOT element and nothing inside it, so borrowing the
   parent's class here would have shipped three unstyled browser buttons - which
   compiles, passes every test, and is only ever caught by looking. */
.cbl-btn {
  flex-shrink: 0; min-height: 36px; padding: 8px 10px; border-radius: 8px;
  font-size: 0.75rem; font-weight: 700; color: var(--c-muted);
  background: none; border: 0;
  cursor: pointer; transition: background-color 0.15s ease, color 0.15s ease;
}
.cbl-btn:hover { background: var(--c-surface-2); color: var(--c-text); }
.cbl-btn:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }
.cbl-btn:disabled { opacity: 0.5; pointer-events: none; }

/* Deliberately not .cbl-btn: it must not look pressable, because it is not.
   Dashed edge and default cursor say "information" where the sibling buttons
   say "action". */
.cbl-note {
  display: inline-flex; align-items: center; gap: 5px;
  min-height: 36px; padding: 8px 10px; border-radius: 8px;
  font-size: 0.75rem; font-weight: 700; color: var(--c-muted);
  border: 1px dashed var(--c-border); cursor: default;
}
</style>
