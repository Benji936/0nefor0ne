<script setup>
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { reportCommunity } from "@/lib/community";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  community:  { type: Object,  default: null },
});
const emit = defineEmits(["update:modelValue", "sent"]);
const { t } = useI18n();

const MAX_LEN = 500;
// How long the "report sent" confirmation stays up before the dialog closes
// itself, so the user gets a moment to read it rather than an instant close.
const CONFIRM_MS = 1400;

const reason     = ref("");
const submitting = ref(false);
const errorMsg   = ref("");
const sent       = ref(false);

let closeTimer = null;
function clearCloseTimer() {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
}

const canSubmit = computed(() => {
  if (submitting.value) return false;
  const len = reason.value.trim().length;
  return len > 0 && len <= MAX_LEN;
});

// Reset the form whenever the dialog opens, so a previous report's text or
// state doesn't linger the next time it's shown (possibly for a different
// community entirely).
watch(() => props.modelValue, (open) => {
  clearCloseTimer();
  if (!open) return;
  reason.value     = "";
  errorMsg.value   = "";
  submitting.value = false;
  sent.value       = false;
});

onBeforeUnmount(clearCloseTimer);

function close() { emit("update:modelValue", false); }

async function submit() {
  if (!canSubmit.value || !props.community?.id) return;
  submitting.value = true;
  errorMsg.value = "";
  try {
    await reportCommunity(props.community.id, reason.value.trim());
    sent.value = true;
    // Let the confirmation show briefly before closing, rather than
    // vanishing the dialog the instant the request resolves.
    closeTimer = setTimeout(() => {
      emit("sent");
      close();
    }, CONFIRM_MS);
  } catch (err) {
    errorMsg.value = err.message ?? "Failed to send report.";
  } finally {
    submitting.value = false;
  }
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
          <v-icon icon="mdi-flag-outline" size="18" />
        </div>
        <span class="dlg-head__title">{{ t('community.reportTitle') }}</span>
        <button class="dlg-close" @click="close">
          <v-icon icon="mdi-close" size="19" />
        </button>
      </div>

      <!-- Body -->
      <div class="dlg-body">
        <!-- Success state -->
        <div v-if="sent" class="sent-body">
          <v-icon icon="mdi-check-circle-outline" size="28" style="color: var(--c-mutual)" />
          <p class="sent-text">{{ t('community.reportSent') }}</p>
        </div>

        <!-- Form -->
        <template v-else>
          <div class="field-block">
            <textarea
              v-model="reason"
              :maxlength="MAX_LEN"
              :placeholder="t('community.reportPlaceholder')"
              class="field-input field-textarea"
              style="min-height: 110px"
              autofocus
            />
            <span class="field-hint" style="text-align:right">{{ reason.length }} / {{ MAX_LEN }}</span>
          </div>

          <!-- Error -->
          <div v-if="errorMsg" class="error-bar">
            <v-icon icon="mdi-alert-circle-outline" size="15" />
            {{ errorMsg }}
          </div>
        </template>
      </div>

      <!-- Footer -->
      <div v-if="!sent" class="dlg-foot">
        <button class="btn-cancel" @click="close" :disabled="submitting">{{ t('community.cancel') }}</button>
        <button class="btn-submit" :disabled="!canSubmit" @click="submit">
          <template v-if="submitting">
            <v-progress-circular indeterminate size="16" width="2" color="white" />
          </template>
          <template v-else>
            <v-icon icon="mdi-flag-outline" size="16" />
            {{ t('community.report') }}
          </template>
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
/* ── Dialog shell ─────────────────────────────────── */
.dlg {
  display: flex;
  flex-direction: column;
  background: var(--c-bg);
  border-radius: 20px 20px 0 0;
  overflow: hidden;
  max-height: 92vh;
}
@media (min-width: 640px) {
  .dlg { border-radius: 20px; }
}

/* ── Header ───────────────────────────────────────── */
.dlg-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 24px;
  background: var(--c-surface);
  border-bottom: 1px solid var(--c-border);
  flex-shrink: 0;
}
.dlg-head__icon {
  width: 32px; height: 32px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--c-error, #ef4444) 18%, transparent);
  color: var(--c-error, #ef4444);
  flex-shrink: 0;
}
.dlg-head__title {
  font-size: 15px; font-weight: 800; color: var(--c-text); flex: 1;
}
.dlg-close {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--c-muted); cursor: pointer;
  transition: background 0.15s ease;
}
.dlg-close:hover { background: var(--c-surface-2); }

/* ── Body ─────────────────────────────────────────── */
.dlg-body {
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scrollbar-width: thin;
  scrollbar-color: var(--c-border) transparent;
}
.dlg-body::-webkit-scrollbar { width: 4px; }
.dlg-body::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 99px; }

/* ── Field ────────────────────────────────────────── */
.field-block { display: flex; flex-direction: column; gap: 6px; }
.field-hint {
  font-size: 10px;
  color: var(--c-muted);
  opacity: 0.7;
}
.field-input {
  width: 100%;
  background: var(--c-surface);
  border: 1.5px solid var(--c-border);
  border-radius: 12px;
  padding: 10px 13px;
  font-size: 13.5px;
  color: var(--c-text);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.field-input:focus {
  border-color: var(--c-trade);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-trade) 15%, transparent);
}
.field-input::placeholder { color: var(--c-muted); opacity: 0.5; font-size: 13px; }
.field-textarea { resize: none; line-height: 1.5; }

/* ── Success state ────────────────────────────────── */
.sent-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 18px 0;
  text-align: center;
}
.sent-text {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--c-text);
  margin: 0;
}

/* ── Error bar ────────────────────────────────────── */
.error-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 12px; border-radius: 10px;
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: #ef4444;
  font-size: 12px; font-weight: 600;
}

/* ── Footer ───────────────────────────────────────── */
.dlg-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
  padding: 16px 24px;
  background: var(--c-surface);
  border-top: 1px solid var(--c-border);
  flex-shrink: 0;
}
.btn-cancel {
  padding: 9px 16px; border-radius: 11px;
  font-size: 13px; font-weight: 600; color: var(--c-muted);
  cursor: pointer; transition: background 0.15s ease;
}
.btn-cancel:hover { background: var(--c-surface-2); }
.btn-cancel:disabled { opacity: 0.4; pointer-events: none; }

.btn-submit {
  display: flex; align-items: center; gap: 7px;
  padding: 9px 20px; border-radius: 11px;
  background: var(--c-error, #ef4444); color: #fff;
  font-size: 13px; font-weight: 700;
  cursor: pointer; transition: opacity 0.15s ease, transform 0.15s ease;
  min-width: 120px; justify-content: center;
}
.btn-submit:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
.btn-submit:disabled { opacity: 0.4; pointer-events: none; }
</style>
