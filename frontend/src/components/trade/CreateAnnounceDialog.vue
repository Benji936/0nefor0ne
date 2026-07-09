<script setup>
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { createAnnounce, updateAnnounce, addAnnounceImages, deleteAnnounceImage } from "@/lib/announces";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // When set, the dialog opens in EDIT mode for this announce; otherwise CREATE mode.
  announce:   { type: Object,  default: null },
});
const emit  = defineEmits(["update:modelValue", "created", "updated"]);
const { t } = useI18n();

const isEdit = computed(() => !!props.announce);

const title       = ref("");
const description = ref("");
const price       = ref("");
const currency    = ref("EUR");
const newImages      = ref([]);   // freshly picked: { file, preview }
const existingImages = ref([]);   // already uploaded: { id, url, sort_order }
const removedImages  = ref([]);   // existing images the user removed: { id, url }
const submitting  = ref(false);
const errorMsg    = ref("");
const fileInput   = ref(null);
const MAX         = 5;

const totalCount = computed(() => existingImages.value.length + newImages.value.length);

const canSubmit = computed(() =>
  title.value.trim().length > 0 &&
  title.value.trim().length <= 120 &&
  Number(price.value) >= 0 &&
  !submitting.value
);

watch(() => props.modelValue, open => {
  if (!open) return;
  errorMsg.value = "";
  newImages.value = [];
  removedImages.value = [];
  if (props.announce) {
    title.value       = props.announce.title ?? "";
    description.value  = props.announce.description ?? "";
    price.value        = props.announce.price ?? "";
    currency.value     = props.announce.currency ?? "EUR";
    existingImages.value = [...(props.announce.images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  } else {
    title.value = ""; description.value = ""; price.value = ""; currency.value = "EUR";
    existingImages.value = [];
  }
});

function close() { emit("update:modelValue", false); }

function pickFiles(e) {
  Array.from(e.target.files).filter(f => f.type.startsWith("image/")).forEach(file => {
    if (totalCount.value >= MAX) { errorMsg.value = t("announce.maxImages", { max: MAX }); return; }
    newImages.value.push({ file, preview: URL.createObjectURL(file) });
  });
  if (fileInput.value) fileInput.value.value = "";
}

function removeNew(i) {
  URL.revokeObjectURL(newImages.value[i].preview);
  newImages.value.splice(i, 1);
  errorMsg.value = "";
}

function removeExisting(i) {
  const [img] = existingImages.value.splice(i, 1);
  removedImages.value.push(img);
  errorMsg.value = "";
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true; errorMsg.value = "";
  try {
    if (isEdit.value) {
      const id = props.announce.id;
      await updateAnnounce(id, {
        title:       title.value.trim(),
        description: description.value.trim(),
        price:       Number(price.value),
        currency:    currency.value,
      });
      // Remove images the user deleted.
      for (const img of removedImages.value) {
        await deleteAnnounceImage(img.id, img.url);
      }
      // Append new images after the highest existing sort_order.
      const startSort = existingImages.value.reduce((m, img) => Math.max(m, img.sort_order ?? 0), -1) + 1;
      await addAnnounceImages(id, newImages.value.map(i => i.file), startSort);
      emit("updated", id);
    } else {
      const id = await createAnnounce(
        title.value.trim(), description.value.trim(),
        Number(price.value), currency.value,
        newImages.value.map(i => i.file)
      );
      emit("created", id);
    }
    close();
  } catch (err) {
    errorMsg.value = err.message ?? "Failed to save announce";
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
      <!-- Header -->
      <div class="dlg-head">
        <div class="dlg-head__icon">
          <v-icon icon="mdi-bullhorn-outline" size="18" />
        </div>
        <span class="dlg-head__title">{{ isEdit ? t('announce.editTitle') : t('announce.create') }}</span>
        <button class="dlg-close" @click="close">
          <v-icon icon="mdi-close" size="19" />
        </button>
      </div>

      <!-- Scrollable body: 2-col on desktop, stack on mobile -->
      <div class="dlg-body">
        <div class="form-layout">

          <!-- LEFT: Photo panel -->
          <div class="photo-col">
            <div class="field-label-row" style="margin-bottom:8px">
              <span class="field-label">{{ t('announce.images') }}</span>
              <span class="field-hint">{{ totalCount }} / {{ MAX }}</span>
            </div>
            <div class="photo-grid">
              <!-- Already-uploaded images (edit mode) -->
              <div v-for="(img, i) in existingImages" :key="'ex-' + img.id" class="photo-thumb">
                <img :src="img.url" class="photo-thumb__img" />
                <button class="photo-thumb__del" @click="removeExisting(i)">
                  <v-icon icon="mdi-close" size="13" />
                </button>
                <span v-if="i === 0" class="photo-thumb__cover">Cover</span>
              </div>
              <!-- Newly picked images -->
              <div v-for="(img, i) in newImages" :key="'new-' + i" class="photo-thumb">
                <img :src="img.preview" class="photo-thumb__img" />
                <button class="photo-thumb__del" @click="removeNew(i)">
                  <v-icon icon="mdi-close" size="13" />
                </button>
                <span v-if="existingImages.length === 0 && i === 0" class="photo-thumb__cover">Cover</span>
              </div>
              <button v-if="totalCount < MAX" class="photo-add" @click="fileInput?.click()">
                <v-icon icon="mdi-camera-plus-outline" size="28" style="color: var(--c-muted)" />
                <span class="photo-add__label">{{ t('announce.addImages') }}</span>
              </button>
            </div>
            <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="pickFiles" />
          </div>

          <!-- RIGHT: Text fields -->
          <div class="fields-col">

            <!-- Title -->
            <div class="field-block">
              <label class="field-label">{{ t('announce.title') }} <span style="color:var(--c-accent)">*</span></label>
              <input
                v-model="title"
                type="text"
                maxlength="120"
                :placeholder="t('announce.titlePlaceholder')"
                class="field-input"
                autofocus
              />
              <span v-if="title.length > 100" class="field-hint" style="text-align:right">{{ title.length }} / 120</span>
            </div>

            <!-- Price + Currency -->
            <div class="field-row">
              <div class="field-block" style="flex:1">
                <label class="field-label">{{ t('announce.price') }} <span style="color:var(--c-accent)">*</span></label>
                <div class="price-wrap">
                  <span class="price-symbol">{{ currency === 'EUR' ? '€' : currency === 'USD' ? '$' : '£' }}</span>
                  <input
                    v-model="price"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    class="field-input price-input"
                  />
                </div>
              </div>
              <div class="field-block" style="width:105px; flex-shrink:0">
                <label class="field-label">{{ t('announce.currency') }}</label>
                <select v-model="currency" class="field-input field-select">
                  <option value="EUR">EUR €</option>
                  <option value="USD">USD $</option>
                  <option value="GBP">GBP £</option>
                </select>
              </div>
            </div>

            <!-- Description -->
            <div class="field-block" style="flex:1; display:flex; flex-direction:column">
              <label class="field-label">{{ t('announce.description') }}</label>
              <textarea
                v-model="description"
                maxlength="1000"
                :placeholder="t('announce.descPlaceholder')"
                class="field-input field-textarea"
                style="flex:1; min-height:100px"
              />
              <span class="field-hint" style="text-align:right">{{ description.length }} / 1000</span>
            </div>

            <!-- Error -->
            <div v-if="errorMsg" class="error-bar">
              <v-icon icon="mdi-alert-circle-outline" size="15" />
              {{ errorMsg }}
            </div>

          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="dlg-foot">
        <button class="btn-cancel" @click="close" :disabled="submitting">{{ t('common.cancel') }}</button>
        <button class="btn-submit" :disabled="!canSubmit" @click="submit">
          <template v-if="submitting">
            <v-progress-circular indeterminate size="16" width="2" color="white" />
          </template>
          <template v-else>
            <v-icon :icon="isEdit ? 'mdi-content-save-outline' : 'mdi-send-outline'" size="16" />
            {{ isEdit ? t('announce.saveChanges') : t('announce.create') }}
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

/* 2-col grid on ≥ 500px, single col below */
.form-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}
@media (min-width: 500px) {
  .form-layout {
    grid-template-columns: 200px 1fr;
    gap: 24px;
    align-items: start;
  }
}

.photo-col {
  display: flex;
  flex-direction: column;
}

.fields-col {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ── Field blocks ─────────────────────────────────── */
.field-block { display: flex; flex-direction: column; gap: 6px; }
.field-row   { display: flex; gap: 12px; align-items: flex-start; }

.field-label-row { display: flex; align-items: center; justify-content: space-between; }
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

.field-textarea { resize: none; line-height: 1.5; }
.field-select   { cursor: pointer; appearance: none; padding-right: 10px; }

/* Price wrapper */
.price-wrap { position: relative; }
.price-symbol {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  font-size: 14px; font-weight: 700; color: var(--c-muted); pointer-events: none;
}
.price-input { padding-left: 28px; }

/* ── Photo grid ───────────────────────────────────── */
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 12px;
}
.photo-thumb {
  position: relative;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
  border: 1.5px solid var(--c-border);
}
.photo-thumb__img { width: 100%; height: 100%; object-fit: cover; }
.photo-thumb__del {
  position: absolute; top: 5px; right: 5px;
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(0,0,0,0.65); color: white;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease;
}
.photo-thumb__del:hover { background: rgba(200,0,0,0.8); }
.photo-thumb__cover {
  position: absolute; bottom: 4px; left: 4px;
  padding: 2px 6px; border-radius: 5px;
  font-size: 9px; font-weight: 800; letter-spacing: 0.05em;
  background: rgba(0,0,0,0.55); color: #fff;
  backdrop-filter: blur(4px);
}
.photo-add {
  aspect-ratio: 1;
  border-radius: 12px;
  border: 1.5px dashed var(--c-border);
  background: var(--c-surface);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.photo-add:hover { border-color: var(--c-trade); background: color-mix(in srgb, var(--c-trade) 6%, transparent); }
.photo-add__label { font-size: 10px; font-weight: 600; color: var(--c-muted); }

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
