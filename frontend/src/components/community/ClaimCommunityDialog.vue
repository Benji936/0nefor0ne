<script setup>
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { claimCommunity } from "@/lib/community";
import { getCurrentSession, signInWithDiscord } from "@/lib/supabaseClient";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  community:  { type: Object,  default: null },
});
const emit = defineEmits(["update:modelValue", "claimed"]);
const { t } = useI18n();

const signedIn   = ref(false);
const submitting = ref(false);
const errorMsg   = ref("");

// Check the session whenever the dialog opens, so a sign-in (or sign-out) that
// happened elsewhere is reflected rather than relying on stale state from the
// last time this dialog was shown.
watch(() => props.modelValue, async (open) => {
  if (!open) return;
  errorMsg.value = "";
  submitting.value = false;
  const session = await getCurrentSession();
  signedIn.value = !!session?.user;
});

function close() { emit("update:modelValue", false); }

async function confirm() {
  if (submitting.value) return;
  errorMsg.value = "";

  if (!signedIn.value) {
    submitting.value = true;
    try {
      await signInWithDiscord();
      // Redirects away to Discord; nothing further to do here.
    } catch (err) {
      errorMsg.value = err.message ?? "Failed to sign in.";
      submitting.value = false;
    }
    return;
  }

  if (!props.community?.id) return;
  submitting.value = true;
  try {
    const row = await claimCommunity(props.community.id);
    emit("claimed", row);
    close();
  } catch (err) {
    errorMsg.value = err.message ?? "Failed to claim this listing.";
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
          <v-icon icon="mdi-storefront-check-outline" size="18" />
        </div>
        <span class="dlg-head__title">{{ t('community.claimTitle') }}</span>
        <button class="dlg-close" @click="close">
          <v-icon icon="mdi-close" size="19" />
        </button>
      </div>

      <!-- Body -->
      <div class="dlg-body">
        <p class="claim-body">{{ t('community.claimBody') }}</p>

        <!-- Error -->
        <div v-if="errorMsg" class="error-bar">
          <v-icon icon="mdi-alert-circle-outline" size="15" />
          {{ errorMsg }}
        </div>
      </div>

      <!-- Footer -->
      <div class="dlg-foot">
        <button class="btn-cancel" @click="close" :disabled="submitting">{{ t('community.cancel') }}</button>
        <button class="btn-submit" :disabled="submitting" @click="confirm">
          <template v-if="submitting">
            <v-progress-circular indeterminate size="16" width="2" color="white" />
          </template>
          <template v-else>
            <v-icon :icon="signedIn ? 'mdi-storefront-check-outline' : 'mdi-discord'" size="16" />
            {{ t('community.claimConfirm') }}
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
  background: color-mix(in srgb, var(--c-trade) 18%, transparent);
  color: var(--c-trade);
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

.claim-body {
  font-size: 13.5px;
  color: var(--c-muted);
  line-height: 1.6;
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
  background: var(--c-trade); color: #fff;
  font-size: 13px; font-weight: 700;
  cursor: pointer; transition: opacity 0.15s ease, transform 0.15s ease;
  min-width: 120px; justify-content: center;
}
.btn-submit:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
.btn-submit:disabled { opacity: 0.4; pointer-events: none; }
</style>
