<script setup>
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { createCommunity, ALREADY_OWN_ONE } from "@/lib/community";
import { KINDS, TYPE_KEYS } from "@/lib/communityKinds";
import CommunityKindIcon from "@/components/community/CommunityKindIcon.vue";
import { COUNTRIES } from "@/lib/countries";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue", "saved"]);
const { t } = useI18n();

const name       = ref("");
const kinds      = ref(["store"]);
const bio        = ref("");
const website    = ref("");
const discordUrl = ref("");
const city       = ref("");
const country    = ref("");
const remoteDuel = ref(false);

const submitting = ref(false);
const errorMsg    = ref("");

const canSubmit = computed(() => {
  if (submitting.value) return false;
  const n = name.value.trim();
  return n.length > 0 && n.length <= 120 && bio.value.length <= 2000;
});

// Hydrate the form blank whenever the dialog opens (create only). Resetting
// on open (rather than relying on the component staying mounted with stale
// refs) keeps a re-open always showing a clean form.
watch(() => props.modelValue, open => {
  if (!open) return;
  errorMsg.value = "";
  name.value = ""; kinds.value = ["store"]; bio.value = "";
  website.value = ""; discordUrl.value = ""; city.value = ""; country.value = "";
  remoteDuel.value = false;
});

// Order is meaning: the first kind picked is the primary one, the glyph the
// directory shows when it has room for only one. Unticking the last remaining
// kind would leave the community as nothing, so it stays ticked.
function toggleKind(k) {
  if (!kinds.value.includes(k)) kinds.value = [...kinds.value, k];
  else if (kinds.value.length > 1) kinds.value = kinds.value.filter((x) => x !== k);
}

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
      remote_duel: remoteDuel.value,
    };
    const row = await createCommunity({ kinds: kinds.value, ...patch });
    emit("saved", row);
    close();
  } catch (err) {
    // 23505 on the way through is the one-per-owner index, reached when the
    // pre-check passed and something else took the slot in between. Same
    // sentence either way; the reader does not care which layer said no.
    errorMsg.value = (err.message === ALREADY_OWN_ONE || err.code === "23505")
      ? t("community.alreadyOwnOne")
      : (err.message ?? "Failed to save.");
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
        <span class="dlg-head__title">{{ t('community.createTitle') }}</span>
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

          <!-- Kind: a place is often several of these at once, so this is a
               set rather than a choice. First one picked leads. -->
          <fieldset class="field-block kind-set">
            <legend class="field-label">{{ t('community.fieldKind') }}</legend>
            <div class="kind-set__row">
              <label v-for="k in KINDS" :key="k" class="kind-chip" :class="{ 'kind-chip--on': kinds.includes(k) }">
                <input
                  type="checkbox"
                  class="kind-chip__box"
                  :checked="kinds.includes(k)"
                  @change="toggleKind(k)"
                />
                <CommunityKindIcon :kind="k" :size="14" />
                <!-- Singular: this describes one community, not a filter over
                     many. "Store", not "Stores". -->
                {{ t(TYPE_KEYS[k]) }}
              </label>
            </div>
            <span class="field-hint">{{ t('community.fieldKindHint') }}</span>
          </fieldset>

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

          <!-- Remote duels -->
          <div class="field-block">
            <label class="field-label">{{ t('community.remoteDuelLabel') }}</label>
            <button
              type="button"
              class="remote-toggle"
              :class="{ 'remote-toggle--on': remoteDuel }"
              :aria-pressed="remoteDuel"
              @click="remoteDuel = !remoteDuel"
            >
              <v-icon :icon="remoteDuel ? 'mdi-check-circle' : 'mdi-web'" size="16" />
              <span class="remote-toggle__label">
                <span class="remote-toggle__title">{{ remoteDuel ? t('community.remoteDuelOn') : t('community.remoteDuelOff') }}</span>
                <span class="remote-toggle__hint">{{ t('community.remoteDuelHint') }}</span>
              </span>
            </button>
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
            <v-icon icon="mdi-plus" size="16" />
            {{ t('community.create') }}
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

/* ── Remote-duel toggle ───────────────────────────── */
.remote-toggle {
  display: flex; align-items: center; gap: 12px; width: 100%;
  text-align: left; cursor: pointer;
  padding: 11px 13px; border-radius: 12px;
  border: 1.5px solid var(--c-border); background: var(--c-surface);
  color: var(--c-text);
  transition: border-color 0.15s ease, background 0.15s ease;
}
.remote-toggle:hover { border-color: color-mix(in srgb, var(--c-trade) 45%, var(--c-border)); }
.remote-toggle > .v-icon { color: var(--c-muted); flex-shrink: 0; }
.remote-toggle--on {
  border-color: color-mix(in srgb, var(--c-trade) 55%, transparent);
  background: color-mix(in srgb, var(--c-trade) 10%, var(--c-surface));
}
.remote-toggle--on > .v-icon { color: var(--c-trade); }
.remote-toggle__label { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.remote-toggle__title { font-size: 13px; font-weight: 700; }
.remote-toggle__hint { font-size: 11px; font-weight: 500; color: var(--c-muted); }

/* ── Kind set ─────────────────────────────────────── */
.kind-set { border: none; padding: 0; margin: 0; min-width: 0; }
.kind-set__row { display: flex; flex-wrap: wrap; gap: 8px; margin: 2px 0 6px; }

.kind-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 13px; border-radius: 999px; cursor: pointer;
  border: 1.5px solid var(--c-border); background: var(--c-surface);
  color: var(--c-text); font-size: 13px; font-weight: 600;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.kind-chip:hover { border-color: color-mix(in srgb, var(--c-trade) 45%, var(--c-border)); }
.kind-chip > .v-icon { color: var(--c-muted); }
.kind-chip--on {
  border-color: color-mix(in srgb, var(--c-trade) 55%, transparent);
  background: color-mix(in srgb, var(--c-trade) 10%, var(--c-surface));
}
.kind-chip--on > .v-icon { color: var(--c-trade); }

/* The tick is the chip. Kept reachable rather than display:none so the set is
   still a real group of checkboxes to a keyboard and a screen reader. */
.kind-chip__box { position: absolute; opacity: 0; width: 1px; height: 1px; }
.kind-chip:focus-within { outline: 2px solid var(--c-trade); outline-offset: 2px; }

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
