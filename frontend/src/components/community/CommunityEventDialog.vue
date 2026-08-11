<script setup>
// Create / edit a community event. Mirrors CommunityEditDialog's shell. The
// cover image is uploaded at save/pick time via the shared community-media
// storage flow (kind "event"), so cover_url is set before the row is written.
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { createEvent, updateEvent, validateEvent, communityLocation, MAX_TITLE, MAX_DESC } from "@/lib/communityEvents";
import { validateImageFile, uploadCommunityMedia } from "@/lib/communityMedia";
import PlaceAutocomplete from "@/components/community/PlaceAutocomplete.vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  community:  { type: Object, required: true }, // needs id (+ city for the location default)
  event:      { type: Object, default: null },  // null = create, object = edit
});
const emit = defineEmits(["update:modelValue", "saved"]);
const { t } = useI18n();

const isEdit = computed(() => !!props.event);

const title    = ref("");
const desc     = ref("");
const startsAt = ref("");
const endsAt   = ref("");
const isOnline = ref(false);
const location = ref("");
const url      = ref("");
const coverUrl = ref(null);
const hidden   = ref(false);

const submitting = ref(false);
const uploading  = ref(false);
const errorMsg   = ref("");
const coverInput = ref(null);

// Stored ISO (UTC) → "YYYY-MM-DDThh:mm" in the viewer's local time for the input.
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Reset from props whenever the dialog opens, so a re-open is never stale.
watch(() => props.modelValue, (open) => {
  if (!open) return;
  errorMsg.value = ""; submitting.value = false; uploading.value = false;
  const e = props.event;
  title.value    = e?.title ?? "";
  desc.value     = e?.description ?? "";
  startsAt.value = toLocalInput(e?.starts_at) || "";
  endsAt.value   = toLocalInput(e?.ends_at) || "";
  isOnline.value = !!e?.is_online;
  // A store's events are almost always at the store, so a new event starts
  // prefilled with its address. Only for new events — editing must never
  // silently rewrite a location the owner chose.
  location.value = e
    ? (e.location ?? "")
    : (props.community?.kind === "store" ? communityLocation(props.community) : "");
  url.value      = e?.url ?? "";
  coverUrl.value = e?.cover_url ?? null;
  hidden.value   = e?.status === "hidden";
});

const ERR_KEY = {
  titleRequired: "Required", startRequired: "Required",
  titleTooLong: "TooLong", descTooLong: "TooLong",
  startInvalid: "Date", endInvalid: "Date",
  endBeforeStart: "EndBeforeStart", urlInvalid: "Url",
};

const draft = computed(() => ({
  title: title.value, description: desc.value,
  starts_at: startsAt.value, ends_at: endsAt.value || null,
  is_online: isOnline.value, location: location.value, url: url.value,
  cover_url: coverUrl.value, status: hidden.value ? "hidden" : "published",
}));

const canSubmit = computed(() => !submitting.value && !uploading.value && validateEvent(draft.value).ok);

function close() { emit("update:modelValue", false); }

async function onPickCover(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = "";
  if (!file) return;
  const check = validateImageFile(file);
  if (!check.ok) {
    errorMsg.value = check.error === "too_large" ? t("community.imageTooLarge")
      : check.error === "wrong_type" ? t("community.imageWrongType") : t("community.uploadFailed");
    return;
  }
  uploading.value = true; errorMsg.value = "";
  try {
    coverUrl.value = await uploadCommunityMedia(props.community.id, "event", file);
  } catch {
    errorMsg.value = t("community.uploadFailed");
  } finally {
    uploading.value = false;
  }
}

async function submit() {
  const res = validateEvent(draft.value);
  if (!res.ok) { errorMsg.value = t(`community.eventErr${ERR_KEY[res.error] ?? "Required"}`); return; }
  if (submitting.value || uploading.value) return;
  submitting.value = true; errorMsg.value = "";
  try {
    // Store the editor's timezone so the event reads at the store's local time
    // for every viewer.
    const payload = { ...draft.value, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    const row = isEdit.value
      ? await updateEvent(props.event.id, props.community.id, payload)
      : await createEvent(props.community.id, payload);
    emit("saved", row);
    close();
  } catch (err) {
    errorMsg.value = err?.message ?? t("community.uploadFailed");
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
        <div class="dlg-head__icon"><v-icon icon="mdi-calendar-star" size="18" /></div>
        <span class="dlg-head__title">{{ isEdit ? t('community.editEvent') : t('community.addEvent') }}</span>
        <button class="dlg-close" @click="close"><v-icon icon="mdi-close" size="19" /></button>
      </div>

      <div class="dlg-body">
        <div class="fields-col">

          <!-- Cover -->
          <div class="field-block">
            <label class="field-label">{{ t('community.eventCover') }}</label>
            <input ref="coverInput" type="file" accept="image/*" class="cover-file" @change="onPickCover" />
            <button type="button" class="cover-drop" :class="{ 'cover-drop--has': coverUrl }" :disabled="uploading" @click="coverInput?.click()">
              <img v-if="coverUrl" :src="coverUrl" alt="" class="cover-img" />
              <span class="cover-cta">
                <v-progress-circular v-if="uploading" indeterminate size="18" width="2" color="white" />
                <template v-else>
                  <v-icon :icon="coverUrl ? 'mdi-image-edit-outline' : 'mdi-image-plus-outline'" size="18" />
                  {{ coverUrl ? t('community.changeCover') : t('community.addCover') }}
                </template>
              </span>
            </button>
          </div>

          <!-- Title -->
          <div class="field-block">
            <label class="field-label">{{ t('community.eventName') }} <span style="color:var(--c-accent)">*</span></label>
            <input v-model="title" type="text" :maxlength="MAX_TITLE" class="field-input" autofocus />
          </div>

          <!-- When: start | end -->
          <div class="field-row">
            <div class="field-block field-col">
              <label class="field-label">{{ t('community.eventStart') }} <span style="color:var(--c-accent)">*</span></label>
              <input v-model="startsAt" type="datetime-local" class="field-input" />
            </div>
            <div class="field-block field-col">
              <label class="field-label">{{ t('community.eventEnd') }}</label>
              <input v-model="endsAt" type="datetime-local" class="field-input" />
            </div>
          </div>

          <!-- Mode toggles: online | hidden -->
          <div class="field-row">
            <label class="check-row field-col">
              <input v-model="isOnline" type="checkbox" class="check-box" />
              <span>{{ t('community.eventIsOnline') }}</span>
            </label>
            <label class="check-row field-col">
              <input v-model="hidden" type="checkbox" class="check-box" />
              <span>{{ t('community.eventHidden') }}</span>
            </label>
          </div>

          <!-- Location (in-person) | Details link -->
          <div class="field-row">
            <div v-if="!isOnline" class="field-block field-col">
              <label class="field-label">{{ t('community.eventLocation') }}</label>
              <PlaceAutocomplete
                v-model="location"
                :placeholder="community.city || ''"
                id="event-location"
              />
            </div>
            <div class="field-block field-col">
              <label class="field-label">{{ t('community.eventUrl') }}</label>
              <input v-model="url" type="text" placeholder="https://" class="field-input" />
            </div>
          </div>

          <!-- Description -->
          <div class="field-block">
            <label class="field-label">{{ t('community.eventDesc') }}</label>
            <textarea v-model="desc" :maxlength="MAX_DESC" class="field-input field-textarea" style="min-height:90px" />
          </div>

          <div v-if="errorMsg" class="error-bar">
            <v-icon icon="mdi-alert-circle-outline" size="15" />
            {{ errorMsg }}
          </div>
        </div>
      </div>

      <div class="dlg-foot">
        <button class="btn-cancel" @click="close" :disabled="submitting">{{ t('community.cancel') }}</button>
        <button class="btn-submit" :disabled="!canSubmit" @click="submit">
          <template v-if="submitting"><v-progress-circular indeterminate size="16" width="2" color="white" /></template>
          <template v-else>
            <v-icon :icon="isEdit ? 'mdi-content-save-outline' : 'mdi-plus'" size="16" />
            {{ isEdit ? t('community.saveChanges') : t('community.create') }}
          </template>
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
/* Paired rows: side by side on the wide dialog, wrapping to a single column when
   the sheet is narrow (mobile bottom-sheet). */
.field-row { display: flex; gap: 12px 14px; align-items: flex-start; flex-wrap: wrap; }
.field-col { flex: 1 1 240px; min-width: 0; }
.check-row.field-col { min-height: 42px; }
.field-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--c-muted); }

.field-input { width: 100%; background: var(--c-surface); border: 1.5px solid var(--c-border); border-radius: 12px; padding: 10px 13px; font-size: 13.5px; color: var(--c-text); outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
.field-input:focus { border-color: var(--c-trade); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-trade) 15%, transparent); }
.field-input::placeholder { color: var(--c-muted); opacity: 0.5; font-size: 13px; }
.field-input:disabled { opacity: 0.5; cursor: not-allowed; }
.field-textarea { resize: none; line-height: 1.5; font-family: inherit; }

/* datetime-local: keep the native picker icon visible on dark surfaces */
input[type="datetime-local"] { color-scheme: dark; }

.check-row { display: flex; align-items: center; gap: 9px; font-size: 13px; font-weight: 600; color: var(--c-text); cursor: pointer; }
.check-box { width: 17px; height: 17px; accent-color: var(--c-trade); cursor: pointer; }

/* Cover uploader */
.cover-file { display: none; }
.cover-drop {
  position: relative; width: 100%; height: 150px; border-radius: 14px; overflow: hidden;
  border: 1.5px dashed var(--c-border); background: var(--c-surface);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: border-color 0.15s ease;
}
.cover-drop:hover:not(:disabled) { border-color: var(--c-trade); }
.cover-drop:disabled { opacity: 0.7; pointer-events: none; }
.cover-drop--has { border-style: solid; }
.cover-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cover-cta {
  position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 7px;
  padding: 8px 14px; border-radius: 999px; font-size: 12.5px; font-weight: 700; color: #fff;
  background: color-mix(in srgb, var(--c-bg) 62%, transparent);
}
.cover-drop:not(.cover-drop--has) .cover-cta { color: var(--c-muted); background: transparent; }

.error-bar { display: flex; align-items: center; gap: 6px; padding: 9px 12px; border-radius: 10px; background: color-mix(in srgb, #ef4444 12%, transparent); color: #ef4444; font-size: 12px; font-weight: 600; }

.dlg-foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 16px 24px; background: var(--c-surface); border-top: 1px solid var(--c-border); flex-shrink: 0; }
.btn-cancel { padding: 9px 16px; border-radius: 11px; font-size: 13px; font-weight: 600; color: var(--c-muted); cursor: pointer; transition: background 0.15s ease; }
.btn-cancel:hover { background: var(--c-surface-2); }
.btn-cancel:disabled { opacity: 0.4; pointer-events: none; }
.btn-submit { display: flex; align-items: center; gap: 7px; padding: 9px 20px; border-radius: 11px; background: var(--c-trade); color: var(--c-on-accent); font-size: 13px; font-weight: 700; cursor: pointer; transition: opacity 0.15s ease, transform 0.15s ease; min-width: 120px; justify-content: center; }
.btn-submit:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
.btn-submit:disabled { opacity: 0.4; pointer-events: none; }
</style>
