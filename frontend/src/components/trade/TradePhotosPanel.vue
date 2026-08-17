<script setup>
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { fetchTradePhotos, uploadTradePhoto, deleteTradePhoto } from "@/lib/proposals";
import { getClient } from "@/lib/supabaseClient";

const { t } = useI18n();

const props = defineProps({
  open:          { type: Boolean, default: false },
  proposal:      { type: Object,  default: null  },
  currentUserId: { type: String,  default: null  },
});

const emit = defineEmits(["update:bothUploaded", "update:mineUploaded", "update:theirsUploaded"]);

// ── State ─────────────────────────────────────────────────────────────────
const photos        = ref([]);
const loadingPhotos = ref(false);
const uploading     = ref(false);
const uploadError   = ref("");
const fileInputRef  = ref(null);
let   photoSub      = null;

// ── Derived ───────────────────────────────────────────────────────────────
const myPhotos    = computed(() => photos.value.filter(p => p.uploader === props.currentUserId));
const theirPhotos = computed(() => photos.value.filter(p => p.uploader !== props.currentUserId));
const mineUploaded   = computed(() => myPhotos.value.length > 0);
const theirsUploaded = computed(() => theirPhotos.value.length > 0);
const bothUploaded   = computed(() => mineUploaded.value && theirsUploaded.value);

// Lifted individually, not just as "both": this panel is subscribed to
// trade_photo in realtime, so it is the only place that knows who has uploaded
// *right now*. The dialog around it would otherwise be reading a snapshot
// taken when the proposals list last loaded.
watch(bothUploaded,   val => emit("update:bothUploaded",   val), { immediate: true });
watch(mineUploaded,   val => emit("update:mineUploaded",   val), { immediate: true });
watch(theirsUploaded, val => emit("update:theirsUploaded", val), { immediate: true });

// ── Data loading ──────────────────────────────────────────────────────────
async function loadPhotos() {
  if (!props.proposal?.id) return;
  loadingPhotos.value = true;
  try {
    photos.value = await fetchTradePhotos(props.proposal.id);
  } catch { /* silent */ } finally {
    loadingPhotos.value = false;
  }
}

// ── Status ────────────────────────────────────────────────────────────────
// Three states, not two. "Waiting for both sides" was shown whenever the pair
// was incomplete, so it kept saying "both" to somebody who had already
// uploaded — which reads as though their photo had not registered.
const statusKey = computed(() => {
  if (bothUploaded.value) return "bothVerified";
  if (mineUploaded.value || theirsUploaded.value) return "waitingOne";
  return "noPhotosYet";
});
const statusTone = computed(() =>
  bothUploaded.value ? "var(--c-mutual)" : "var(--c-trade)");

// ── Actions ───────────────────────────────────────────────────────────────
const dragging = ref(false);

function onDrop(event) {
  dragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) onFileSelected({ target: { files: [file] } });
}

async function onFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file || !props.currentUserId) return;
  uploading.value   = true;
  uploadError.value = "";
  try {
    await uploadTradePhoto(props.proposal.id, props.currentUserId, file);
    await loadPhotos();
  } catch (err) {
    uploadError.value = err.message ?? "Upload failed. Please try again.";
  } finally {
    uploading.value = false;
    if (fileInputRef.value) fileInputRef.value.value = "";
  }
}

async function onDeletePhoto(photo) {
  try {
    await deleteTradePhoto(photo.id);
    await loadPhotos();
  } catch { /* silent */ }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────
watch(() => props.open, (open) => {
  if (open && props.proposal) {
    loadPhotos();
    photoSub = getClient()
      .channel(`trade-photos-${props.proposal.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "trade_photo",
        filter: `trade=eq.${props.proposal.id}`,
      }, loadPhotos)
      .subscribe();
  } else {
    photos.value      = [];
    uploadError.value = "";
    if (photoSub) { getClient().removeChannel(photoSub); photoSub = null; }
  }
}, { immediate: true });
</script>

<template>
  <!--
    Two rows, one per trader, rather than two columns of dashed boxes.

    The old layout gave a control and a status readout equal weight and dressed
    both in a dashed border — the universal "drop a file here" signal — so half
    the panel looked interactive and wasn't. It also spent its largest element
    on an empty state: the box asking for a photo was bigger than the photo.

    A row per side answers the only question this panel exists to answer — has
    each trader shown their cards — in the same shape as the confirmation
    checklist further down the page, and the asymmetry is honest: only your row
    can be acted on.
  -->
  <div class="flex flex-col gap-3 !p-4">

    <!-- Header -->
    <div class="flex items-center gap-3 flex-wrap">
      <v-icon icon="mdi-camera-outline" size="18" color="var(--c-muted)" />
      <h3 class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">{{ t('tradePhotos.title') }}</h3>
      <span
        class="ml-auto flex items-center gap-2 text-[11px] font-bold px-3 py-1 rounded-lg border shrink-0"
        :style="{
          color: statusTone,
          borderColor: `color-mix(in srgb, ${statusTone} 45%, transparent)`,
          backgroundColor: `color-mix(in srgb, ${statusTone} 12%, transparent)`,
        }"
      >
        <v-icon :icon="bothUploaded ? 'mdi-check-all' : 'mdi-clock-outline'" size="13" :color="statusTone" />
        {{ t(`tradePhotos.${statusKey}`) }}
      </span>
    </div>
    <p class="text-xs" style="color: var(--c-muted); line-height: 1.55">{{ t('tradePhotos.desc') }}</p>

    <div class="rounded-xl overflow-hidden" style="border: 1px solid var(--c-border)">

      <!-- Your row. Also the drop target: dragging a file anywhere onto it
           uploads, but the button is the path that works without a mouse. -->
      <div
        class="photo-row"
        :class="{ 'is-dropping': dragging }"
        @dragover.prevent="dragging = true"
        @dragenter.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <v-icon
          :icon="mineUploaded ? 'mdi-check-circle' : 'mdi-circle-outline'"
          size="16"
          :color="mineUploaded ? 'var(--c-mutual)' : 'var(--c-muted)'"
          class="shrink-0"
        />
        <span class="photo-row-name" :style="{ color: mineUploaded ? 'var(--c-text)' : 'var(--c-muted)' }">
          {{ t('tradeDetail.you') }}
        </span>

        <div class="flex items-center gap-2 flex-wrap grow min-w-0">
          <v-tooltip
            v-for="photo in myPhotos"
            :key="photo.id"
            location="top"
            :open-delay="140"
            content-class="photo-preview"
          >
            <template #activator="{ props: tip }">
              <div v-bind="tip" class="thumb">
                <a :href="photo.url" target="_blank" rel="noopener noreferrer"
                  class="block w-full h-full" :aria-label="t('tradePhotos.openPhoto')">
                  <img :src="photo.url" loading="lazy" alt="" class="w-full h-full object-cover" />
                </a>
                <button
                  type="button"
                  class="thumb-del"
                  :aria-label="t('tradePhotos.deletePhoto')"
                  @click.stop.prevent="onDeletePhoto(photo)"
                >
                  <v-icon icon="mdi-close" size="15" />
                </button>
              </div>
            </template>
            <img :src="photo.url" alt="" class="photo-preview-img" />
          </v-tooltip>
          <span v-if="dragging" class="text-xs font-semibold" style="color: var(--c-trade)">
            {{ t('tradePhotos.dropToUpload') }}
          </span>
        </div>

        <button type="button" class="add-btn shrink-0" :disabled="uploading" @click="fileInputRef?.click()">
          <v-progress-circular v-if="uploading" indeterminate size="14" width="2" color="var(--c-trade)" />
          <v-icon v-else icon="mdi-plus-circle-outline" size="15" />
          {{ uploading ? t('tradePhotos.uploading') : t('tradePhotos.addPhoto') }}
        </button>

        <input
          ref="fileInputRef"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          class="hidden"
          @change="onFileSelected"
        />
      </div>

      <!-- Their row. No control, because there is nothing here you can do. -->
      <div class="photo-row" style="border-top: 1px solid var(--c-border)">
        <v-icon
          :icon="theirsUploaded ? 'mdi-check-circle' : 'mdi-clock-outline'"
          size="16"
          :color="theirsUploaded ? 'var(--c-mutual)' : 'var(--c-muted)'"
          class="shrink-0"
        />
        <span class="photo-row-name" :style="{ color: theirsUploaded ? 'var(--c-text)' : 'var(--c-muted)' }">
          {{ proposal?.counterparty_name ?? t('common.anonymous') }}
        </span>

        <div class="flex items-center gap-2 flex-wrap grow min-w-0">
          <span v-if="loadingPhotos" class="text-xs" style="color: var(--c-muted)">{{ t('tradePhotos.loading') }}</span>
          <template v-else-if="theirPhotos.length">
            <v-tooltip
              v-for="photo in theirPhotos"
              :key="photo.id"
              location="top"
              :open-delay="140"
              content-class="photo-preview"
            >
              <template #activator="{ props: tip }">
                <a
                  v-bind="tip"
                  :href="photo.url" target="_blank" rel="noopener noreferrer"
                  class="thumb block"
                  :aria-label="t('tradePhotos.openPhoto')"
                >
                  <img :src="photo.url" loading="lazy" alt="" class="w-full h-full object-cover" />
                </a>
              </template>
              <img :src="photo.url" alt="" class="photo-preview-img" />
            </v-tooltip>
          </template>
          <span v-else class="text-xs" style="color: var(--c-muted)">{{ t('tradePhotos.notAddedYet') }}</span>
        </div>
      </div>
    </div>

    <p v-if="uploadError" class="text-xs" style="color: var(--c-accent)">{{ uploadError }}</p>
  </div>
</template>

<style scoped>
.photo-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--c-surface);
  transition: background-color 0.2s ease;
}
.photo-row.is-dropping {
  background: color-mix(in srgb, var(--c-trade) 10%, transparent);
  box-shadow: inset 0 0 0 1.5px var(--c-trade);
}

.photo-row-name {
  font-size: 13px;
  font-weight: 600;
  min-width: 88px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
  Sized so the photo is worth looking at. At 48px a phone shot of a card was a
  smudge — you had to open every one in a new tab to learn anything, which is
  the opposite of what a verification panel is for. One variable so this stays
  easy to tune.
*/
.thumb {
  --thumb: 88px;
  position: relative;
  width: var(--thumb);
  height: var(--thumb);
  flex-shrink: 0;
  border-radius: 10px;
  overflow: hidden;
  background: var(--c-surface-2);
  outline: 1px solid var(--c-border);
  outline-offset: -1px;
  transition: outline-color 0.2s ease, transform 0.2s ease;
}
/* Lifts rather than grows: scaling the tile would reflow the row. */
.thumb:hover {
  outline-color: var(--c-trade);
  transform: translateY(-2px);
}
.thumb:focus-within {
  outline: 2px solid var(--c-accent);
}

/* Always visible, not hover-only: on a touch screen there is no hover, so a
   hover-only delete is a control that does not exist on half the devices. */
.thumb-del {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  color: #fff;
  background: rgba(0, 0, 0, 0.65);
  transition: background-color 0.2s ease;
}
.thumb-del:hover { background: var(--c-accent); }
.thumb-del:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 1px; }

.add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--c-border);
  background: var(--c-surface-2);
  color: var(--c-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}
.add-btn:hover:not(:disabled) {
  border-color: var(--c-trade);
  background: color-mix(in srgb, var(--c-trade) 12%, transparent);
}
.add-btn:disabled { opacity: 0.6; cursor: default; }
.add-btn:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }

/* The row wraps before the name or the button get squeezed. */
@media (max-width: 560px) {
  .photo-row { flex-wrap: wrap; }
  .photo-row-name { min-width: 0; }
  .add-btn { margin-left: auto; }
}

/* Small screens: still much larger than the old 48px, but two per row rather
   than one and a half. */
@media (max-width: 400px) {
  .thumb { --thumb: 72px; }
}

@media (prefers-reduced-motion: reduce) {
  .photo-row, .thumb, .thumb-del, .add-btn { transition: none; }
  .thumb:hover { transform: none; }
}
</style>

<!--
  Unscoped on purpose. Vuetify teleports tooltip content to an overlay
  container outside this component, so it never receives the scope attribute
  and a `scoped` rule would not reach it. The class name is specific enough to
  be safe as a global.
-->
<style>
.photo-preview {
  padding: 0 !important;
  background: transparent !important;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
  /* Vuetify sets a narrow default; the preview is the whole point here. */
  max-width: none !important;
}

.photo-preview-img {
  display: block;
  width: auto;
  height: auto;
  /* Big enough to read a card, capped so it can never outgrow the viewport
     on a laptop or a narrow window. */
  max-width: min(360px, 78vw);
  max-height: min(360px, 60vh);
  border-radius: 12px;
  background: var(--c-surface-2);
  outline: 1px solid var(--c-border);
  outline-offset: -1px;
}
</style>
