<!-- VerifyPhoneDialog.vue — the one-number-one-account check, asked at the
     moment it starts to matter.

     Not at signup. Browsing, building a collection and being onboarded cannot
     hurt anybody, so putting an SMS in front of them would only cost real
     signups. This opens the first time somebody proposes or accepts a trade,
     which is the point where two people commit to handing over cards.

     The dialog is the polite half of the gate. The half that decides is the
     trigger in 20260818_phone_gate_trading.sql — the RPCs are reachable with
     the public anon key, so nothing here is a security boundary. -->
<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { COUNTRIES } from "@/lib/countries";
import { getClient } from "@/lib/supabaseClient";
import {
  OTP_LENGTH, phoneProblem, toE164, otpProblem,
  sendPhoneCode, confirmPhoneCode, authErrorKey,
} from "@/lib/phoneVerify";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** What the person was trying to do, so the dialog can say why it appeared. */
  reason: { type: String, default: "propose" },
});
const emit = defineEmits(["update:modelValue", "verified"]);

const { t } = useI18n();

const step        = ref("number");   // 'number' | 'code'
const countryCode = ref("");
const national    = ref("");
const code        = ref("");
const busy        = ref(false);
const errorKey    = ref("");
const resendIn    = ref(0);
let   resendTimer = null;

const countryItems = COUNTRIES.map(c => ({
  title: `${c.flag} ${c.name} +${c.dialCode}`,
  value: c.code,
}));

const dialCode = computed(() => COUNTRIES.find(c => c.code === countryCode.value)?.dialCode ?? "");
const e164      = computed(() => toE164(dialCode.value, national.value));

/** The problem to show, or null. Held back until they have typed something,
 *  so the field does not open already complaining. */
const numberError = computed(() => {
  if (!national.value.trim()) return null;
  const problem = phoneProblem(dialCode.value, national.value);
  return problem ? t(`phoneVerify.numberError.${problem}`) : null;
});

const canSend    = computed(() => !busy.value && !!e164.value);
const canConfirm = computed(() => !busy.value && !otpProblem(code.value));

function close() { emit("update:modelValue", false); }

function reset() {
  step.value = "number";
  national.value = "";
  code.value = "";
  errorKey.value = "";
  busy.value = false;
  stopResendTimer();
}

function stopResendTimer() {
  if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
  resendIn.value = 0;
}

/** Every SMS costs real money, and a resend button with no cooldown is a way
 *  to spend it a hundred times on one impatient person. */
function startResendTimer(seconds = 60) {
  stopResendTimer();
  resendIn.value = seconds;
  resendTimer = setInterval(() => {
    resendIn.value -= 1;
    if (resendIn.value <= 0) stopResendTimer();
  }, 1000);
}

/** Preselect the country they already told us at signup, so most people only
 *  have to type the number itself. */
async function prefillCountry() {
  if (countryCode.value) return;
  try {
    const { data: auth } = await getClient().auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return;
    const { data } = await getClient()
      .from("Trader").select("country_code").eq("id", uid).maybeSingle();
    if (data?.country_code) countryCode.value = data.country_code;
  } catch {
    // A missing prefill costs one extra tap. Not worth surfacing.
  }
}

async function send() {
  if (!canSend.value) return;
  busy.value = true;
  errorKey.value = "";
  const { error } = await sendPhoneCode(e164.value);
  busy.value = false;
  if (error) { errorKey.value = authErrorKey(error); return; }
  step.value = "code";
  startResendTimer();
}

async function resend() {
  if (busy.value || resendIn.value > 0) return;
  busy.value = true;
  errorKey.value = "";
  const { error } = await sendPhoneCode(e164.value);
  busy.value = false;
  if (error) { errorKey.value = authErrorKey(error); return; }
  startResendTimer();
}

async function confirm() {
  if (!canConfirm.value) return;
  busy.value = true;
  errorKey.value = "";
  const { error } = await confirmPhoneCode(e164.value, code.value);
  busy.value = false;
  if (error) { errorKey.value = authErrorKey(error); return; }
  emit("verified");
  close();
}

function backToNumber() {
  step.value = "number";
  code.value = "";
  errorKey.value = "";
  stopResendTimer();
}

watch(() => props.modelValue, (open) => {
  if (open) { reset(); prefillCountry(); }
  else stopResendTimer();
// immediate so a dialog that is mounted already-open still resets and prefills.
// Nothing opens it that way today, but the failure mode is a dialog carrying
// the previous attempt's number and error, which is a confusing way to find out.
}, { immediate: true });
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="440"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="vp">
      <header class="vp__head">
        <div class="vp__icon"><v-icon icon="mdi-cellphone-check" size="22" /></div>
        <div class="vp__headtext">
          <p class="vp__title">{{ t('phoneVerify.title') }}</p>
          <p class="vp__sub">{{ t(`phoneVerify.reason.${reason}`) }}</p>
        </div>
        <button type="button" class="vp__x" :aria-label="t('common.cancel')" @click="close">
          <v-icon icon="mdi-close" size="20" />
        </button>
      </header>

      <div class="vp__body">
        <!-- ── Step 1: the number ── -->
        <template v-if="step === 'number'">
          <p class="vp__why">{{ t('phoneVerify.why') }}</p>

          <v-select
            v-model="countryCode"
            :items="countryItems"
            :label="t('account.country')"
            variant="outlined"
            density="comfortable"
            hide-details
            class="vp__field"
          />

          <v-text-field
            v-model="national"
            :label="t('phoneVerify.numberLabel')"
            :prefix="dialCode ? `+${dialCode}` : ''"
            :error-messages="numberError ? [numberError] : []"
            variant="outlined"
            density="comfortable"
            type="tel"
            inputmode="tel"
            autocomplete="tel-national"
            class="vp__field"
            @keyup.enter="send"
          />

          <p class="vp__note">{{ t('phoneVerify.privacyNote') }}</p>
        </template>

        <!-- ── Step 2: the code ── -->
        <template v-else>
          <p class="vp__why">{{ t('phoneVerify.codeSent', { number: e164 }) }}</p>

          <v-text-field
            v-model="code"
            :label="t('phoneVerify.codeLabel')"
            variant="outlined"
            density="comfortable"
            type="text"
            inputmode="numeric"
            :maxlength="OTP_LENGTH + 2"
            autofocus
            autocomplete="one-time-code"
            class="vp__field vp__field--code"
            @keyup.enter="confirm"
          />

          <div class="vp__row">
            <button type="button" class="vp__link" @click="backToNumber">
              {{ t('phoneVerify.changeNumber') }}
            </button>
            <button
              type="button"
              class="vp__link"
              :disabled="resendIn > 0 || busy"
              @click="resend"
            >
              {{ resendIn > 0 ? t('phoneVerify.resendIn', { s: resendIn }) : t('phoneVerify.resend') }}
            </button>
          </div>
        </template>

        <p v-if="errorKey" class="vp__err" role="alert">
          <v-icon icon="mdi-alert-circle-outline" size="16" />
          {{ t(`phoneVerify.error.${errorKey}`) }}
        </p>
      </div>

      <footer class="vp__foot">
        <button type="button" class="vp__btn vp__btn--ghost" @click="close">
          {{ t('phoneVerify.notNow') }}
        </button>
        <button
          v-if="step === 'number'"
          type="button"
          class="vp__btn vp__btn--go"
          :disabled="!canSend"
          @click="send"
        >
          <v-progress-circular v-if="busy" indeterminate size="16" width="2" class="mr-2" />
          {{ t('phoneVerify.sendCode') }}
        </button>
        <button
          v-else
          type="button"
          class="vp__btn vp__btn--go"
          :disabled="!canConfirm"
          @click="confirm"
        >
          <v-progress-circular v-if="busy" indeterminate size="16" width="2" class="mr-2" />
          {{ t('phoneVerify.confirm') }}
        </button>
      </footer>
    </div>
  </v-dialog>
</template>

<style scoped>
/* Plain CSS: Vuetify's reset zeroes several Tailwind spacing utilities in this
   app, and a dialog is a bad place to find that out. */
.vp {
  background: var(--c-surface);
  color: var(--c-text);
  border-radius: 18px;
  overflow: hidden;
}

.vp__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 18px 12px;
}

.vp__icon {
  width: 40px; height: 40px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--c-trade) 16%, transparent);
  color: var(--c-trade);
}

.vp__headtext { flex: 1; min-width: 0; }
.vp__title { margin: 0; font-size: 17px; font-weight: 800; }
.vp__sub   { margin: 2px 0 0; font-size: 13px; color: var(--c-muted); }

.vp__x {
  background: none; border: 0; padding: 6px; margin: -6px -6px 0 0;
  border-radius: 8px; cursor: pointer; color: var(--c-muted);
  transition: color 200ms ease, background 200ms ease;
}
.vp__x:hover { color: var(--c-text); background: var(--c-surface-2); }

.vp__body { padding: 4px 18px 8px; }

.vp__why {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--c-muted);
}

.vp__field { margin-bottom: 12px; }
.vp__field--code :deep(input) { letter-spacing: 0.35em; font-weight: 700; }

.vp__note {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--c-muted);
}

.vp__row { display: flex; justify-content: space-between; gap: 12px; }

.vp__link {
  background: none; border: 0; padding: 6px 0;
  font-size: 13px; font-weight: 600;
  color: var(--c-trade); cursor: pointer;
}
.vp__link:disabled { color: var(--c-muted); cursor: default; }
.vp__link:not(:disabled):hover { text-decoration: underline; }

.vp__err {
  display: flex; align-items: flex-start; gap: 6px;
  margin: 12px 0 0;
  font-size: 13px; line-height: 1.5;
  color: var(--c-accent);
}

.vp__foot {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 18px 18px;
}

.vp__btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-height: 44px; padding: 0 18px;
  border-radius: 12px; border: 1px solid transparent;
  font-size: 14px; font-weight: 700; cursor: pointer;
  transition: background 200ms ease, filter 200ms ease;
}

.vp__btn--ghost {
  background: none; border-color: var(--c-border); color: var(--c-muted);
  margin-right: auto;
}
.vp__btn--ghost:hover { background: var(--c-surface-2); color: var(--c-text); }

.vp__btn--go { background: var(--c-trade); color: var(--c-on-accent); }
.vp__btn--go:not(:disabled):hover { filter: brightness(1.08); }
.vp__btn--go:disabled { opacity: 0.5; cursor: default; }

.vp__x:focus-visible, .vp__link:focus-visible, .vp__btn:focus-visible {
  outline: 2px solid var(--c-trade);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .vp__x, .vp__btn { transition: none; }
}
</style>
