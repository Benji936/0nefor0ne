<script setup>
// Verified claim (Plan 1): a small state machine. The claimer signs in, we email
// a 6-digit code to the store's on-file address, they enter it, and the
// claim-verify-code Edge Function grants ownership. Stores with no email on file
// branch to a manual-review request.
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { requestClaimCode, verifyClaimCode, requestManualReview, startClaimCheckout, fetchMyClaim } from "@/lib/community";
import { communityPricing, INTERVALS } from "@/lib/communityPricing";
import { isValidCode } from "@/lib/claimState";
import { getCurrentSession, signInWithDiscord } from "@/lib/supabaseClient";
import PlatformIcon from "@/components/community/PlatformIcon.vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  community:  { type: Object,  default: null },
});
const emit = defineEmits(["update:modelValue", "claimed", "stale"]);
const { t } = useI18n();

const step = ref("intro");          // intro | code | subscribe | manual | done
const signedIn = ref(false);
const submitting = ref(false);
const errorMsg = ref("");
const code = ref("");
const manualReason = ref("");
const doneMessage = ref("");

const canVerify = computed(() => isValidCode(code.value) && !submitting.value);
const price = computed(() => communityPricing(props.community));

// Same offer as the self-verification route, same words. A claimed store and a
// created one are buying the identical thing, and two descriptions of one price
// is how a price stops being believed.
const interval = ref("year");
const plans = computed(() => INTERVALS.map((i) => ({
  interval: i,
  name: t(`communityVerify.plans.${i}.name`),
  free: t(`communityVerify.plans.${i}.free`),
  then: t(`communityVerify.plans.${i}.then`, { price: price.value[i].display }),
})));

watch(() => props.modelValue, async (open) => {
  if (!open) return;
  step.value = "intro"; errorMsg.value = ""; code.value = "";
  manualReason.value = ""; doneMessage.value = ""; submitting.value = false;
  const session = await getCurrentSession();
  signedIn.value = !!session?.user;
  if (signedIn.value && props.community?.id && props.community.owner == null) {
    try {
      const mine = await fetchMyClaim(props.community.id);
      if (mine?.identity_verified_at) step.value = "subscribe";
    } catch { /* non-fatal: fall back to the intro step */ }
  }
});

function close() { emit("update:modelValue", false); }

// Escape hatch from the code step: if the store's on-file email is wrong or
// unreachable, the code never arrives, so let the claimer fall back to a manual
// review request instead of being stuck.
function goManual() { errorMsg.value = ""; step.value = "manual"; }

async function sendCode() {
  if (submitting.value) return;
  errorMsg.value = "";
  if (!signedIn.value) {
    submitting.value = true;
    try { await signInWithDiscord(); }        // redirects away to Discord
    catch (e) { errorMsg.value = e.message ?? "Failed to sign in."; submitting.value = false; }
    return;
  }
  submitting.value = true;
  try {
    const res = await requestClaimCode(props.community.id);
    if (res.status === "sent") { step.value = "code"; code.value = ""; }
    else if (res.status === "needs_manual_review") step.value = "manual";
    else if (res.status === "rate_limited") { step.value = "code"; errorMsg.value = t("community.claimRateLimited"); }
    else if (res.error === "already_claimed") { errorMsg.value = t("community.claimExpiredCode"); emit("stale"); }
    else errorMsg.value = res.error ?? t("community.claimExpiredCode");
  } catch (e) { errorMsg.value = e.message ?? "Failed to send code."; }
  finally { submitting.value = false; }
}

async function verify() {
  if (!canVerify.value) return;
  submitting.value = true; errorMsg.value = "";
  try {
    const res = await verifyClaimCode(props.community.id, code.value);
    if (res.status === "verified") {
      step.value = "subscribe";
    } else if (res.status === "invalid") {
      errorMsg.value = t("community.claimInvalidCode", { count: res.attempts_left });
    } else if (res.status === "expired") {
      errorMsg.value = t("community.claimExpiredCode");
    } else if (res.status === "already_claimed") {
      errorMsg.value = t("community.claimExpiredCode"); emit("stale");
    } else {
      errorMsg.value = res.error ?? "Verification failed.";
    }
  } catch (e) { errorMsg.value = e.message ?? "Verification failed."; }
  finally { submitting.value = false; }
}

async function startCheckout() {
  if (submitting.value) return;
  submitting.value = true; errorMsg.value = "";
  try {
    const res = await startClaimCheckout(props.community.id, interval.value);
    if (res?.url) { window.location.href = res.url; return; } // leaves the page
    if (res?.error === "interval_unavailable") { errorMsg.value = t("communityVerify.intervalUnavailable"); }
    else if (res?.error === "already_claimed") { errorMsg.value = t("community.claimExpiredCode"); emit("stale"); }
    else if (res?.error === "not_verified") { step.value = "code"; errorMsg.value = t("community.claimExpiredCode"); }
    else errorMsg.value = res?.error ?? "Could not start checkout.";
  } catch (e) { errorMsg.value = e.message ?? "Could not start checkout."; }
  finally { submitting.value = false; }
}

async function sendManual() {
  if (!manualReason.value.trim() || submitting.value) return;
  submitting.value = true; errorMsg.value = "";
  try {
    await requestManualReview(props.community.id, manualReason.value.trim());
    doneMessage.value = t("community.claimManualSent");
    step.value = "done";
  } catch (e) { errorMsg.value = e.message ?? "Failed to send request."; }
  finally { submitting.value = false; }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="480"
    content-class="!m-0 sm:!m-6 items-end sm:items-center"
    transition="dialog-bottom-transition"
    scrollable
  >
    <div class="dlg">
      <!-- Header -->
      <div class="dlg-head">
        <div class="dlg-head__icon">
          <v-icon icon="mdi-storefront-check-outline" size="18" />
        </div>
        <span class="dlg-head__title">{{ step === 'manual' ? t('community.claimManualTitle') : (step === 'subscribe' ? t('community.claimSubscribeTitle') : t('community.claimTitle')) }}</span>
        <button class="dlg-close" @click="close">
          <v-icon icon="mdi-close" size="19" />
        </button>
      </div>

      <!-- Body -->
      <div class="dlg-body">
        <!-- Intro -->
        <template v-if="step === 'intro'">
          <p class="claim-body">{{ t('community.claimIntro') }}</p>
          <!-- The price, before the code is sent rather than after it is
               entered. Someone deciding whether to bother deserves to know the
               first year costs nothing while they are still deciding. -->
          <p class="claim-cost">
            <v-icon icon="mdi-gift-outline" size="15" />
            <span>{{ t('communityVerify.costUpfront', { year: price.year.display, month: price.month.display }) }}</span>
          </p>
        </template>

        <!-- Code entry -->
        <template v-else-if="step === 'code'">
          <p class="claim-body">{{ t('community.claimCodeSent') }}</p>
          <div class="field-block">
            <label class="field-label">{{ t('community.claimCodeLabel') }}</label>
            <input
              v-model="code"
              inputmode="numeric"
              maxlength="6"
              autocomplete="one-time-code"
              class="field-input code-input"
              @keyup.enter="verify"
            />
          </div>
          <div class="claim-links">
            <button class="link-btn" :disabled="submitting" @click="sendCode">{{ t('community.claimResend') }}</button>
            <button class="link-btn link-btn--muted" :disabled="submitting" @click="goManual">{{ t('community.claimTryManual') }}</button>
          </div>
        </template>

        <!-- Subscribe: pick a plan, both of which start free -->
        <template v-else-if="step === 'subscribe'">
          <p class="claim-body">{{ t('community.claimSubscribeBody') }}</p>
          <fieldset class="claim-plans">
            <label
              v-for="p in plans"
              :key="p.interval"
              class="claim-plan"
              :class="{ 'claim-plan--on': interval === p.interval }"
            >
              <input v-model="interval" class="claim-planRadio" type="radio" name="claim-plan" :value="p.interval" />
              <span class="claim-planBody">
                <span class="claim-planName">{{ p.name }}</span>
                <span class="claim-planFree">{{ p.free }}</span>
              </span>
              <span class="claim-planThen">{{ p.then }}</span>
            </label>
          </fieldset>
          <p class="claim-note">{{ t('communityVerify.plansWhy') }}</p>
        </template>

        <!-- Manual review -->
        <template v-else-if="step === 'manual'">
          <p class="claim-body">{{ t('community.claimNoEmail') }}</p>
          <textarea
            v-model="manualReason"
            maxlength="500"
            :placeholder="t('community.claimManualBody')"
            class="field-input field-textarea"
            style="min-height: 96px"
          />
        </template>

        <!-- Done -->
        <div v-else-if="step === 'done'" class="sent-body">
          <v-icon icon="mdi-check-circle-outline" size="28" style="color: var(--c-mutual)" />
          <p class="sent-text">{{ doneMessage }}</p>
        </div>

        <!-- Error -->
        <div v-if="errorMsg" class="error-bar">
          <v-icon icon="mdi-alert-circle-outline" size="15" />
          {{ errorMsg }}
        </div>
      </div>

      <!-- Footer -->
      <div class="dlg-foot">
        <template v-if="step === 'done'">
          <button class="btn-submit" @click="close">{{ t('community.cancel') }}</button>
        </template>
        <template v-else>
          <button class="btn-cancel" @click="close" :disabled="submitting">{{ t('community.cancel') }}</button>

          <button v-if="step === 'intro'" class="btn-submit" :disabled="submitting" @click="sendCode">
            <template v-if="submitting"><v-progress-circular indeterminate size="16" width="2" color="white" /></template>
            <template v-else>
              <!-- mdi has no discord glyph in the bundled font; it rendered as an
                   empty 16px gap. PlatformIcon draws it inline instead. -->
              <v-icon v-if="signedIn" icon="mdi-email-fast-outline" size="16" />
              <PlatformIcon v-else platform="discord" :size="16" />
              {{ signedIn ? t('community.claimSendCode') : t('auth.signIn') }}
            </template>
          </button>

          <button v-else-if="step === 'code'" class="btn-submit" :disabled="!canVerify" @click="verify">
            <template v-if="submitting"><v-progress-circular indeterminate size="16" width="2" color="white" /></template>
            <template v-else><v-icon icon="mdi-check" size="16" />{{ t('community.claimVerify') }}</template>
          </button>

          <button v-else-if="step === 'subscribe'" class="btn-submit" :disabled="submitting" @click="startCheckout">
            <template v-if="submitting"><v-progress-circular indeterminate size="16" width="2" color="white" /></template>
            <template v-else><v-icon icon="mdi-credit-card-outline" size="16" />{{ t(`communityVerify.plans.${interval}.action`) }}</template>
          </button>

          <button v-else-if="step === 'manual'" class="btn-submit" :disabled="submitting || !manualReason.trim()" @click="sendManual">
            <template v-if="submitting"><v-progress-circular indeterminate size="16" width="2" color="white" /></template>
            <template v-else><v-icon icon="mdi-send-outline" size="15" />{{ t('community.claimManualSend') }}</template>
          </button>
        </template>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
/* ── Dialog shell ─────────────────────────────────── */
.dlg { display: flex; flex-direction: column; background: var(--c-bg); border-radius: 20px 20px 0 0; overflow: hidden; max-height: 92vh; }
@media (min-width: 640px) { .dlg { border-radius: 20px; } }

.dlg-head { display: flex; align-items: center; gap: 10px; padding: 18px 24px; background: var(--c-surface); border-bottom: 1px solid var(--c-border); flex-shrink: 0; }
.dlg-head__icon { width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--c-trade) 18%, transparent); color: var(--c-trade); flex-shrink: 0; }
.dlg-head__title { font-size: 15px; font-weight: 800; color: var(--c-text); flex: 1; }
.dlg-close { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--c-muted); cursor: pointer; transition: background 0.15s ease; }
.dlg-close:hover { background: var(--c-surface-2); }

.dlg-body { padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; scrollbar-width: thin; scrollbar-color: var(--c-border) transparent; }
.dlg-body::-webkit-scrollbar { width: 4px; }
.dlg-body::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 99px; }

.claim-body { font-size: 13.5px; color: var(--c-muted); line-height: 1.6; margin: 0; }
.claim-note { font-size: 12.5px; color: var(--c-muted); line-height: 1.55; margin: 0; }

/* The price, on the step where the decision is still open. Full text colour
   rather than muted: it is the answer to the question being asked. */
.claim-cost {
  display: flex; align-items: flex-start; gap: 8px; margin: 0;
  font-size: 13px; line-height: 1.5; color: var(--c-text);
}
.claim-cost .v-icon { color: var(--c-trade); flex-shrink: 0; margin-top: 1px; }

/* ── The two plans ─────────────────────────────────────────────────────────
   Rows on rules, matching the verify route. A dialog is the last place to put
   two pricing cards side by side. */
.claim-plans { border: none; padding: 0; margin: 0; }
.claim-plan {
  display: flex; align-items: center; gap: 11px;
  padding: 13px 10px 13px 2px;
  border-top: 1px solid var(--c-border);
  cursor: pointer;
  transition: background-color .15s ease;
}
.claim-plan:last-of-type { border-bottom: 1px solid var(--c-border); }
.claim-plan--on { background: var(--c-surface-2); }
.claim-plan:hover:not(.claim-plan--on) { background: var(--c-surface-2); }
.claim-plan:focus-within { outline: 2px solid var(--c-trade); outline-offset: -2px; }
.claim-planRadio { accent-color: var(--c-trade); width: 16px; height: 16px; flex-shrink: 0; margin: 0 0 0 8px; cursor: pointer; }
.claim-planBody { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.claim-planName { font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--c-muted); }
.claim-planFree { font-size: 14.5px; font-weight: 700; line-height: 1.25; color: var(--c-text); }
.claim-planThen { font-size: 12.5px; color: var(--c-muted); text-align: right; flex-shrink: 0; }

.field-block { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--c-muted); }
.field-input { width: 100%; background: var(--c-surface); border: 1.5px solid var(--c-border); border-radius: 12px; padding: 10px 13px; font-size: 13.5px; color: var(--c-text); outline: none; transition: border-color 0.15s ease; font-family: inherit; }
.field-input:focus { border-color: var(--c-trade); }
.field-input::placeholder { color: var(--c-muted); opacity: 0.5; }
.field-textarea { resize: vertical; line-height: 1.5; }
.code-input { letter-spacing: 0.4em; font-weight: 800; font-size: 18px; text-align: center; }

.claim-links { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.link-btn { align-self: flex-start; background: none; border: none; padding: 0; font-size: 12px; font-weight: 700; color: var(--c-trade); cursor: pointer; text-align: left; }
.link-btn:disabled { opacity: 0.4; pointer-events: none; }
.link-btn--muted { color: var(--c-muted); font-weight: 600; }

.sent-body { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 12px 0; text-align: center; }
.sent-text { font-size: 14px; font-weight: 600; color: var(--c-text); margin: 0; }

.error-bar { display: flex; align-items: center; gap: 6px; padding: 9px 12px; border-radius: 10px; background: color-mix(in srgb, #ef4444 12%, transparent); color: #ef4444; font-size: 12px; font-weight: 600; }

.dlg-foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 16px 24px; background: var(--c-surface); border-top: 1px solid var(--c-border); flex-shrink: 0; }
.btn-cancel { padding: 9px 16px; border-radius: 11px; font-size: 13px; font-weight: 600; color: var(--c-muted); cursor: pointer; transition: background 0.15s ease; }
.btn-cancel:hover { background: var(--c-surface-2); }
.btn-cancel:disabled { opacity: 0.4; pointer-events: none; }
.btn-submit { display: flex; align-items: center; gap: 7px; padding: 9px 20px; border-radius: 11px; background: var(--c-trade); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer; transition: opacity 0.15s ease, transform 0.15s ease; min-width: 120px; justify-content: center; }
.btn-submit:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
.btn-submit:disabled { opacity: 0.4; pointer-events: none; }
</style>
