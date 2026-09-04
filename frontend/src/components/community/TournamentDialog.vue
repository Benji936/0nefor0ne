<script setup>
// Create / edit a tournament. Mirrors CommunityEventDialog's shell so the two
// owner dialogs on the same page are the same object.
//
// Deliberately short. Everything a tournament does — its status, its rounds,
// its scoring once anyone has played — is decided by the RPCs and refused to
// this form by the column guard, so what is left here is the handful of fields
// an organizer actually types.
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  createTournament, updateTournament, validateTournament, MATCH_FORMATS,
} from "@/lib/tournaments";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  community:  { type: Object, required: true },
  tournament: { type: Object, default: null }, // null = create
});
const emit = defineEmits(["update:modelValue", "saved"]);
const { t } = useI18n();

const isEdit = computed(() => !!props.tournament);

const name        = ref("");
const description = ref("");
const format      = ref("");
const matchFormat = ref(3);
const maxPlayers  = ref("");
const startsAt    = ref("");

const submitting = ref(false);
const errorMsg   = ref("");

// Stored ISO (UTC) → "YYYY-MM-DDThh:mm" in the viewer's local time, and back.
// Same conversion as the event dialog: the input is local, the column is not.
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    const x = props.tournament;
    name.value        = x?.name ?? "";
    description.value = x?.description ?? "";
    format.value      = x?.format ?? "";
    matchFormat.value = x?.match_format ?? 3;
    maxPlayers.value  = x?.max_players ?? "";
    startsAt.value    = toLocalInput(x?.starts_at);
    errorMsg.value    = "";
  },
  { immediate: true },
);

function close() {
  if (submitting.value) return;
  emit("update:modelValue", false);
}

async function save() {
  const draft = {
    name: name.value,
    description: description.value,
    format: format.value,
    match_format: Number(matchFormat.value),
    max_players: maxPlayers.value === "" ? null : Number(maxPlayers.value),
    // The browser's timezone is what the organizer typed in, so it is what the
    // event is stored against rather than a guess from the community's city.
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    starts_at: startsAt.value || null,
  };

  const check = validateTournament(draft);
  if (!check.ok) {
    errorMsg.value = t(`tournament.err_${check.error}`);
    return;
  }

  submitting.value = true;
  errorMsg.value = "";
  try {
    const row = isEdit.value
      ? await updateTournament(props.tournament.id, draft)
      : await createTournament(props.community.id, draft);
    emit("saved", row);
    emit("update:modelValue", false);
  } catch (e) {
    console.error("TournamentDialog: save failed", e);
    errorMsg.value = t("tournament.actionFailed");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="680"
    content-class="!m-0 sm:!m-6 items-end sm:items-center"
    transition="dialog-bottom-transition"
    scrollable
  >
    <div class="dlg">
      <div class="dlg-head">
        <div class="dlg-head__icon"><v-icon icon="mdi-trophy-outline" size="18" /></div>
        <span class="dlg-head__title">{{ isEdit ? t('tournament.edit') : t('tournament.add') }}</span>
        <button class="dlg-close" :aria-label="t('tournament.cancel')" @click="close">
          <v-icon icon="mdi-close" size="19" />
        </button>
      </div>

      <div class="dlg-body">
        <div class="fields-col">
          <div class="field-block">
            <label class="field-label" for="tn-name">{{ t('tournament.name') }}</label>
            <input id="tn-name" v-model="name" class="field-input" type="text" maxlength="140" />
          </div>

          <div class="field-row">
            <div class="field-block field-col">
              <label class="field-label" for="tn-start">{{ t('tournament.startsAt') }}</label>
              <input id="tn-start" v-model="startsAt" class="field-input" type="datetime-local" />
            </div>
            <div class="field-block field-col">
              <label class="field-label" for="tn-format">{{ t('tournament.formatLabel') }}</label>
              <input
                id="tn-format"
                v-model="format"
                class="field-input"
                type="text"
                maxlength="60"
                :placeholder="t('tournament.formatPlaceholder')"
              />
            </div>
          </div>

          <div class="field-row">
            <div class="field-block field-col">
              <label class="field-label" for="tn-bestof">{{ t('tournament.matchFormat') }}</label>
              <select id="tn-bestof" v-model.number="matchFormat" class="field-input">
                <option v-for="f in MATCH_FORMATS" :key="f" :value="f">{{ t('tournament.bestOf', { n: f }) }}</option>
              </select>
            </div>
            <div class="field-block field-col">
              <label class="field-label" for="tn-cap">{{ t('tournament.maxPlayers') }}</label>
              <input id="tn-cap" v-model="maxPlayers" class="field-input" type="number" min="2" max="512" />
            </div>
          </div>

          <div class="field-block">
            <label class="field-label" for="tn-desc">{{ t('tournament.description') }}</label>
            <textarea id="tn-desc" v-model="description" class="field-input field-textarea" rows="4" maxlength="2000" />
          </div>

          <p v-if="errorMsg" class="error-bar">
            <v-icon icon="mdi-alert-circle-outline" size="15" />{{ errorMsg }}
          </p>
        </div>
      </div>

      <div class="dlg-foot">
        <button type="button" class="btn-cancel" :disabled="submitting" @click="close">
          {{ t('tournament.cancel') }}
        </button>
        <button type="button" class="btn-submit" :disabled="submitting" @click="save">
          <v-progress-circular v-if="submitting" indeterminate size="16" width="2" />
          <span>{{ t('tournament.save') }}</span>
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
.dlg { display: flex; flex-direction: column; width: 680px; max-width: 100%; background: var(--c-bg); border-radius: 20px 20px 0 0; overflow: hidden; max-height: 92vh; }
@media (min-width: 640px) { .dlg { border-radius: 20px; } }

.dlg-head { display: flex; align-items: center; gap: 10px; padding: 18px 24px; background: var(--c-surface); border-bottom: 1px solid var(--c-border); flex-shrink: 0; }
.dlg-head__icon { width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--c-trade) 18%, transparent); color: var(--c-trade); flex-shrink: 0; }
.dlg-head__title { font-size: 15px; font-weight: 800; color: var(--c-text); flex: 1; }
.dlg-close { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--c-muted); cursor: pointer; transition: background 0.15s ease; }
.dlg-close:hover { background: var(--c-surface-2); }

.dlg-body { padding: 24px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--c-border) transparent; }
.dlg-body::-webkit-scrollbar { width: 4px; }
.dlg-body::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 99px; }
.fields-col { display: flex; flex-direction: column; gap: 18px; }

.field-block { display: flex; flex-direction: column; gap: 6px; }
.field-row { display: flex; gap: 12px 14px; align-items: flex-start; flex-wrap: wrap; }
.field-col { flex: 1 1 240px; min-width: 0; }
.field-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--c-muted); }

.field-input { width: 100%; background: var(--c-surface); border: 1.5px solid var(--c-border); border-radius: 12px; padding: 10px 13px; font-size: 13.5px; color: var(--c-text); outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
.field-input:focus { border-color: var(--c-trade); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-trade) 15%, transparent); }
.field-input::placeholder { color: var(--c-muted); opacity: 0.5; font-size: 13px; }
.field-input:disabled { opacity: 0.5; cursor: not-allowed; }
.field-textarea { resize: none; line-height: 1.5; font-family: inherit; }

.error-bar { display: flex; align-items: center; gap: 6px; padding: 9px 12px; border-radius: 10px; background: color-mix(in srgb, #ef4444 12%, transparent); color: #ef4444; font-size: 12px; font-weight: 600; margin: 0; }

.dlg-foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 16px 24px; background: var(--c-surface); border-top: 1px solid var(--c-border); flex-shrink: 0; }
.btn-cancel { padding: 9px 16px; border-radius: 11px; font-size: 13px; font-weight: 600; color: var(--c-muted); cursor: pointer; transition: background 0.15s ease; }
.btn-cancel:hover { background: var(--c-surface-2); }
.btn-cancel:disabled { opacity: 0.4; pointer-events: none; }
.btn-submit { display: flex; align-items: center; gap: 7px; padding: 9px 20px; border-radius: 11px; background: var(--c-trade); color: var(--c-on-accent); font-size: 13px; font-weight: 700; cursor: pointer; transition: opacity 0.15s ease, transform 0.15s ease; min-width: 120px; justify-content: center; }
.btn-submit:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
.btn-submit:disabled { opacity: 0.4; pointer-events: none; }

@media (prefers-reduced-motion: reduce) {
  .dlg-close, .field-input, .btn-cancel, .btn-submit { transition: none; }
  .btn-submit:hover:not(:disabled) { transform: none; }
}
</style>
