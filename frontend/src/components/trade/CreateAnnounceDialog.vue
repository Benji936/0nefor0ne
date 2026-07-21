<script setup>
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { createAnnounce, updateAnnounce, addAnnounceImages, deleteAnnounceImage } from "@/lib/announces";
import { searchCardByName, searchCardBySetCode, getArchetypes } from "@/api";
import { ANNOUNCE_KIND, composeWantHeadline } from "@/lib/announceKind";

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
const kind           = ref(ANNOUNCE_KIND.SELL);
const archetype      = ref("");
const wantDetail     = ref("");
const archetypeList  = ref([]);      // canonical names from YGOPRODeck
const archetypeQuery = ref("");      // what the user is typing
const archetypeErr   = ref("");      // shown when the list cannot be fetched

const isLf = computed(() => kind.value === ANNOUNCE_KIND.LOOKING_FOR);

// Top 8 case-insensitive substring matches, so the dropdown stays short.
const archetypeMatches = computed(() => {
  const q = archetypeQuery.value.trim().toLowerCase();
  if (!q) return [];
  return archetypeList.value
    .filter(a => a.toLowerCase().includes(q))
    .slice(0, 8);
});

/** Fetch the archetype list once, the first time the user switches to LF. */
async function ensureArchetypes() {
  if (archetypeList.value.length > 0) return;
  archetypeErr.value = "";
  const list = await getArchetypes();   // never throws; [] on failure
  if (list.length === 0) {
    archetypeErr.value = t("announce.archetypeLoadFailed");
    return;
  }
  archetypeList.value = list;
}

function setKind(next) {
  kind.value = next;
  if (next === ANNOUNCE_KIND.LOOKING_FOR) ensureArchetypes();
}

function pickArchetype(name) {
  archetype.value = name;
  archetypeQuery.value = name;
}

const newImages      = ref([]);   // freshly picked: { file, preview }
const existingImages = ref([]);   // already uploaded: { id, url, sort_order }
const removedImages  = ref([]);   // existing images the user removed: { id, url }
const submitting  = ref(false);
const errorMsg    = ref("");
const fileInput   = ref(null);
const MAX         = 5;

// ── Card picker ───────────────────────────────────────────────────────────────
const cardQuery      = ref("");      // what the user is typing
const cardResults    = ref([]);      // YGOPRODeck results dropdown
const cardSearching  = ref(false);  // spinner while fetching
const cardSearchErr  = ref("");      // inline error
const selectedCard   = ref(null);   // { ygo_card_id, card_name, extension, rarity, image_url }
let   cardDebounce   = null;

const SET_CODE_RE = /^[A-Z0-9]{2,6}-[A-Z]{0,2}\d{3,4}$/i;

function onCardInput() {
  clearTimeout(cardDebounce);
  cardResults.value = [];
  cardSearchErr.value = "";
  if (selectedCard.value) selectedCard.value = null; // clear selection on new typing
  const q = cardQuery.value.trim();
  if (q.length < 2) return;
  cardDebounce = setTimeout(() => searchCard(q), 350);
}

async function searchCard(q) {
  cardSearching.value = true;
  cardSearchErr.value = "";
  try {
    let cards = [];
    if (SET_CODE_RE.test(q)) {
      // searchCardBySetCode returns an axios response; card data is at res.data
      const res = await searchCardBySetCode(q);
      const card = res?.data;
      if (card?.id) {
        cards = [card]; // already has id, name, card_sets, card_images
      }
    } else {
      const res = await searchCardByName(q);
      cards = res?.data?.data ?? [];
    }
    cardResults.value = cards.slice(0, 8);
    if (cards.length === 0) cardSearchErr.value = "No card found.";
  } catch {
    cardSearchErr.value = "Search failed. Try again.";
  } finally {
    cardSearching.value = false;
  }
}

function pickCard(card) {
  const firstSet  = card.card_sets?.[0] ?? {};
  const firstImg  = card.card_images?.[0];
  selectedCard.value = {
    ygo_card_id: card.id,
    card_name:   card.name,
    extension:   firstSet.set_name  ?? '',
    rarity:      firstSet.set_rarity?.toLowerCase() ?? 'common',
    image_url:   firstImg?.image_url_small ?? firstImg?.image_url ?? null,
  };
  cardQuery.value   = card.name;
  cardResults.value = [];
}

function clearCard() {
  selectedCard.value = null;
  cardQuery.value    = "";
  cardResults.value  = [];
  cardSearchErr.value = "";
}

const totalCount = computed(() => existingImages.value.length + newImages.value.length);

const canSubmit = computed(() => {
  if (submitting.value) return false;
  if (isLf.value) {
    // An LF post needs something to look for; price and photos are optional.
    return composeWantHeadline(archetype.value, wantDetail.value).length > 0;
  }
  return title.value.trim().length > 0 &&
         title.value.trim().length <= 120 &&
         price.value !== "" &&
         Number(price.value) >= 0;
});

watch(() => props.modelValue, open => {
  if (!open) return;
  errorMsg.value = "";
  newImages.value = [];
  removedImages.value = [];
  clearCard();
  if (props.announce) {
    title.value       = props.announce.title ?? "";
    description.value  = props.announce.description ?? "";
    price.value        = props.announce.price ?? "";
    currency.value     = props.announce.currency ?? "EUR";
    kind.value           = props.announce.kind        ?? ANNOUNCE_KIND.SELL;
    archetype.value      = props.announce.archetype   ?? "";
    wantDetail.value     = props.announce.want_detail ?? "";
    archetypeQuery.value = archetype.value;
    if (kind.value === ANNOUNCE_KIND.LOOKING_FOR) ensureArchetypes();
    existingImages.value = [...(props.announce.images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  } else {
    title.value = ""; description.value = ""; price.value = ""; currency.value = "EUR";
    kind.value = ANNOUNCE_KIND.SELL;
    archetype.value = ""; wantDetail.value = ""; archetypeQuery.value = "";
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
        title:       isLf.value
                       ? composeWantHeadline(archetype.value, wantDetail.value)
                       : title.value.trim(),
        description: description.value.trim(),
        price:       price.value === "" ? null : Number(price.value),
        currency:    currency.value,
        kind:        kind.value,
        archetype:   isLf.value ? (archetype.value.trim()  || null) : null,
        want_detail: isLf.value ? (wantDetail.value.trim() || null) : null,
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
      const id = await createAnnounce({
        title:       isLf.value
                       ? composeWantHeadline(archetype.value, wantDetail.value)
                       : title.value.trim(),
        description: description.value.trim(),
        price:       price.value === "" ? null : Number(price.value),
        currency:    currency.value,
        imageFiles:  newImages.value.map(i => i.file),
        card:        selectedCard.value,  // null if no card picked
        kind:        kind.value,
        archetype:   isLf.value ? (archetype.value.trim()  || null) : null,
        wantDetail:  isLf.value ? (wantDetail.value.trim() || null) : null,
      });
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
              <span class="field-label">{{ isLf ? t('announce.photosOptionalLf') : t('announce.images') }}</span>
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

            <!-- Kind toggle -->
            <div class="field-block">
              <label class="field-label">{{ t('announce.kindHint') }}</label>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-lg text-xs font-semibold border cursor-pointer transition-all"
                  :style="!isLf
                    ? { backgroundColor: 'var(--c-trade)', borderColor: 'var(--c-trade)', color: 'white' }
                    : { backgroundColor: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
                  :aria-pressed="!isLf"
                  @click="setKind('sell')"
                >
                  <v-icon icon="mdi-tag-outline" size="14" />{{ t('announce.kindSell') }}
                </button>
                <button
                  type="button"
                  class="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-lg text-xs font-semibold border cursor-pointer transition-all"
                  :style="isLf
                    ? { backgroundColor: 'var(--c-mutual)', borderColor: 'var(--c-mutual)', color: 'white' }
                    : { backgroundColor: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
                  :aria-pressed="isLf"
                  @click="setKind('looking_for')"
                >
                  <v-icon icon="mdi-magnify" size="14" />{{ t('announce.kindLookingFor') }}
                </button>
              </div>
            </div>

            <!-- Looking For: archetype + detail replace the Title field -->
            <template v-if="isLf">
              <div class="field-block">
                <label class="field-label" for="lf-archetype">{{ t('announce.archetype') }}</label>
                <input
                  id="lf-archetype"
                  v-model="archetypeQuery"
                  class="field-input"
                  :placeholder="t('announce.archetypePlaceholder')"
                  autocomplete="off"
                  @focus="ensureArchetypes"
                />
                <ul v-if="archetypeMatches.length" class="archetype-list">
                  <li v-for="name in archetypeMatches" :key="name">
                    <button type="button" class="archetype-option" @click="pickArchetype(name)">
                      {{ name }}
                    </button>
                  </li>
                </ul>
                <p v-else-if="archetypeQuery.trim() && archetypeList.length" class="field-hint">
                  {{ t('announce.archetypeNoMatch') }}
                </p>
                <p v-if="archetypeErr" class="field-hint" style="color: var(--c-accent)">{{ archetypeErr }}</p>
              </div>

              <div class="field-block">
                <label class="field-label" for="lf-detail">{{ t('announce.wantDetail') }}</label>
                <input
                  id="lf-detail"
                  v-model="wantDetail"
                  class="field-input"
                  maxlength="120"
                  :placeholder="t('announce.wantDetailPlaceholder')"
                />
              </div>
            </template>

            <!-- Title -->
            <template v-if="!isLf">
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
            </template>

            <!-- Price + Currency -->
            <div class="field-row">
              <div class="field-block" style="flex:1">
                <label class="field-label">
                  {{ isLf ? t('announce.budgetOptional') : t('announce.price') }}
                  <span v-if="!isLf" style="color:var(--c-accent)">*</span>
                </label>
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
                <p v-if="isLf" class="field-hint">{{ t('announce.budgetHint') }}</p>
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

            <!-- Card picker (create mode only) -->
            <div v-if="!isEdit" class="field-block" style="position:relative">
              <label class="field-label">Card <span style="color:var(--c-muted);font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></label>

              <!-- Selected card chip -->
              <div v-if="selectedCard" class="card-chip">
                <img v-if="selectedCard.image_url" :src="selectedCard.image_url" class="card-chip__img" />
                <div class="card-chip__info">
                  <span class="card-chip__name">{{ selectedCard.card_name }}</span>
                  <span class="card-chip__sub">{{ selectedCard.extension }}</span>
                </div>
                <button class="card-chip__clear" @click="clearCard" title="Remove">
                  <v-icon icon="mdi-close" size="13" />
                </button>
              </div>

              <!-- Search input -->
              <div v-else class="card-search-wrap">
                <v-icon icon="mdi-magnify" size="15" class="card-search-icon" />
                <input
                  v-model="cardQuery"
                  type="text"
                  placeholder="Search by name or set code (LOB-EN001)"
                  class="field-input card-search-input"
                  @input="onCardInput"
                  autocomplete="off"
                />
                <v-progress-circular v-if="cardSearching" indeterminate size="14" width="2" class="card-search-spinner" />
              </div>

              <!-- Dropdown results -->
              <div v-if="cardResults.length > 0 && !selectedCard" class="card-dropdown">
                <button
                  v-for="c in cardResults"
                  :key="c.id"
                  class="card-result"
                  @click="pickCard(c)"
                >
                  <img
                    v-if="c.card_images?.[0]?.image_url_small"
                    :src="c.card_images[0].image_url_small"
                    class="card-result__img"
                  />
                  <div class="card-result__info">
                    <span class="card-result__name">{{ c.name }}</span>
                    <span class="card-result__sub">{{ c.card_sets?.[0]?.set_name ?? '' }}</span>
                  </div>
                </button>
              </div>

              <span v-if="cardSearchErr && !cardSearching" class="field-hint" style="color:#ef4444">{{ cardSearchErr }}</span>
              <span v-if="selectedCard" class="field-hint" style="color:var(--c-muted)">
                🃏 This card will be added to your trade list automatically.
              </span>
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
            {{ isEdit ? t('announce.saveChanges') : (isLf ? t('announce.createLookingFor') : t('announce.create')) }}
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
.archetype-list {
  list-style: none;
  margin-top: 4px;
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid var(--c-border);
  border-radius: 8px;
  background: var(--c-surface-2);
}
.archetype-option {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--c-text);
  background: transparent;
  cursor: pointer;
}
.archetype-option:hover,
.archetype-option:focus-visible {
  background: color-mix(in srgb, var(--c-mutual) 18%, transparent);
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

/* ── Card picker ───────────────────────────────────── */
.card-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.card-search-icon {
  position: absolute;
  left: 12px;
  color: var(--c-muted);
  pointer-events: none;
  flex-shrink: 0;
}
.card-search-input { padding-left: 34px; }
.card-search-spinner {
  position: absolute;
  right: 12px;
  color: var(--c-muted);
}

.card-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0; right: 0;
  background: var(--c-surface);
  border: 1.5px solid var(--c-border);
  border-radius: 14px;
  overflow: hidden;
  z-index: 50;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  max-height: 260px;
  overflow-y: auto;
}

.card-result {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
  border-bottom: 1px solid var(--c-border);
}
.card-result:last-child { border-bottom: none; }
.card-result:hover { background: var(--c-surface-2); }
.card-result__img {
  width: 32px;
  height: 46px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
  border: 1px solid var(--c-border);
}
.card-result__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.card-result__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-result__sub {
  font-size: 11px;
  color: var(--c-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Selected card chip */
.card-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--c-trade) 10%, transparent);
  border: 1.5px solid color-mix(in srgb, var(--c-trade) 35%, transparent);
  border-radius: 12px;
}
.card-chip__img {
  width: 28px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}
.card-chip__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.card-chip__name {
  font-size: 13px;
  font-weight: 700;
  color: var(--c-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-chip__sub {
  font-size: 11px;
  color: var(--c-muted);
}
.card-chip__clear {
  width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--c-muted); cursor: pointer; flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
}
.card-chip__clear:hover { background: var(--c-surface-2); color: var(--c-text); }

</style>
