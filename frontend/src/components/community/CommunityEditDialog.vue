<script setup>
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { createCommunity, updateCommunity } from "@/lib/community";
import { COUNTRIES } from "@/lib/countries";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // When set, the dialog opens in EDIT mode for this community; otherwise
  // CREATE mode.
  community:  { type: Object,  default: null },
});
const emit = defineEmits(["update:modelValue", "saved"]);
const { t } = useI18n();

const isEdit = computed(() => !!props.community);

const name       = ref("");
const kind       = ref("store");
const bio        = ref("");
const website    = ref("");
const discordUrl = ref("");
const city       = ref("");
const country    = ref("");

const submitting = ref(false);
const errorMsg    = ref("");

const canSubmit = computed(() => {
  if (submitting.value) return false;
  const n = name.value.trim();
  return n.length > 0 && n.length <= 120 && bio.value.length <= 2000;
});

// Hydrate the form whenever the dialog opens: from `props.community` in EDIT
// mode, blank in CREATE mode. Resetting on open (rather than relying on the
// component staying mounted with stale refs) keeps a re-open always showing
// the current data.
watch(() => props.modelValue, open => {
  if (!open) return;
  errorMsg.value = "";
  if (props.community) {
    name.value       = props.community.name ?? "";
    kind.value       = props.community.kind ?? "store";
    bio.value        = props.community.bio ?? "";
    website.value    = props.community.website ?? "";
    discordUrl.value = props.community.discord_url ?? "";
    city.value       = props.community.city ?? "";
    country.value    = props.community.country ?? "";
  } else {
    name.value = ""; kind.value = "store"; bio.value = "";
    website.value = ""; discordUrl.value = ""; city.value = ""; country.value = "";
  }
});

function close() { emit("update:modelValue", false); }

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true; errorMsg.value = "";
  try {
    const patch = {
      name:        name.value.trim(),
      bio:         bio.value.trim(),
      website:     website.value.trim() || null,
      discord_url: discordUrl.value.trim() || null,
      city:        city.value.trim() || null,
      country:     country.value || null,
    };
    const row = isEdit.value
      ? await updateCommunity(props.community.id, patch)
      : await createCommunity({ kind: kind.value, ...patch });
    emit("saved", row);
    close();
  } catch (err) {
    errorMsg.value = err.message ?? "Failed to save.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="560"
    content-class="!m-0 sm:!m-6 items-end sm:items-center"
    transition="dialog-bottom-transition"
    scrollable
  >
    <div class="dlg">
      <!-- Header -->
      <div class="dlg-head">
        <div class="dlg-head__icon">
          <v-icon icon="mdi-storefront-outline" size="18" />
        </div>
        <span class="dlg-head__title">{{ isEdit ? t('community.editTitle') : t('community.createTitle') }}</span>
        <button class="dlg-close" @click="close">
          <v-icon icon="mdi-close" size="19" />
        </button>
      </div>

      <!-- Scrollable body -->
      <div class="dlg-body">
        <div class="fields-col">

          <!-- Name -->
          <div class="field-block">
            <label class="field-label">{{ t('community.fieldName') }} <span style="color:var(--c-accent)">*</span></label>
            <input
              v-model="name"
              type="text"
              maxlength="120"
              class="field-input"
              autofocus
            />
            <span v-if="name.length > 100" class="field-hint" style="text-align:right">{{ name.length }} / 120</span>
          </div>

          <!-- Kind -->
          <div class="field-block">
            <label class="field-label">{{ t('community.fieldKind') }}</label>
            <select v-model="kind" class="field-input field-select" :disabled="isEdit">
              <option value="store">{{ t('community.kindStore') }}</option>
              <option value="discord">{{ t('community.kindDiscord') }}</option>
              <option value="group">{{ t('community.kindGroup') }}</option>
            </select>
          </div>

          <!-- Bio -->
          <div class="field-block">
            <label class="field-label">{{ t('community.fieldBio') }}</label>
            <textarea
              v-model="bio"
              maxlength="2000"
              class="field-input field-textarea"
              style="min-height:100px"
            />
            <span class="field-hint" style="text-align:right">{{ bio.length }} / 2000</span>
          </div>

          <!-- Website + Discord -->
          <div class="field-row">
            <div class="field-block" style="flex:1">
              <label class="field-label">{{ t('community.fieldWebsite') }}</label>
              <input v-model="website" type="text" placeholder="https://" class="field-input" />
            </div>
            <div class="field-block" style="flex:1">
              <label class="field-label">{{ t('community.fieldDiscord') }}</label>
              <input v-model="discordUrl" type="text" placeholder="https://discord.gg/…" class="field-input" />
            </div>
          </div>

          <!-- City + Country -->
          <div class="field-row">
            <div class="field-block" style="flex:1">
              <label class="field-label">{{ t('community.fieldCity') }}</label>
              <input v-model="city" type="text" class="field-input" />
            </div>
            <div class="field-block" style="flex:1">
              <label class="field-label">{{ t('community.fieldCountry') }}</label>
              <select v-model="country" class="field-input field-select">
                <option value="">{{ t('community.kindAll') }}</option>
                <option v-for="c in COUNTRIES" :key="c.code" :value="c.name">{{ c.flag }} {{ c.name }}</option>
              </select>
            </div>
          </div>

          <!-- Error -->
          <div v-if="errorMsg" class="error-bar">
            <v-icon icon="mdi-alert-circle-outline" size="15" />
            {{ errorMsg }}
          </div>

        </div>
      </div>

      <!-- Footer -->
      <div class="dlg-foot">
        <button class="btn-cancel" @click="close" :disabled="submitting">{{ t('community.cancel') }}</button>
        <button class="btn-submit" :disabled="!canSubmit" @click="submit">
          <template v-if="submitting">
            <v-progress-circular indeterminate size="16" width="2" color="white" />
          </template>
          <template v-else>
            <v-icon :icon="isEdit ? 'mdi-content-save-outline' : 'mdi-plus'" size="16" />
            {{ isEdit ? t('community.save') : t('community.create') }}
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
  scrollbar-width: thin;
  scrollbar-color: var(--c-border) transparent;
}
.dlg-body::-webkit-scrollbar { width: 4px; }
.dlg-body::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 99px; }

.fields-col {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ── Field blocks ─────────────────────────────────── */
.field-block { display: flex; flex-direction: column; gap: 6px; }
.field-row   { display: flex; gap: 12px; align-items: flex-start; }

.field-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-muted);
}
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
.field-input:disabled { opacity: 0.5; cursor: not-allowed; }

.field-textarea { resize: none; line-height: 1.5; }
.field-select   { cursor: pointer; appearance: none; padding-right: 10px; }

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
