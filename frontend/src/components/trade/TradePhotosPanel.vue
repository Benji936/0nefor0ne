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

const emit = defineEmits(["update:bothUploaded"]);

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
const bothUploaded = computed(() => myPhotos.value.length > 0 && theirPhotos.value.length > 0);

watch(bothUploaded, val => emit("update:bothUploaded", val), { immediate: true });

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

// ── Actions ───────────────────────────────────────────────────────────────
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
});
</script>

<template>
  <div class="mt-6 pt-5" style="border-top: 1px solid var(--c-border)">

    <!-- Section header -->
    <div class="flex items-center gap-3 mb-1">
      <v-icon icon="mdi-camera-outline" size="20" color="var(--c-muted)" />
      <span class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">{{ t('tradePhotos.title') }}</span>
      <span
        class="ml-auto flex items-center gap-2 text-[11px] font-bold px-3 py-1 rounded-lg border"
        :style="bothUploaded
          ? { color: 'var(--c-mutual)', borderColor: 'var(--c-mutual)', backgroundColor: 'color-mix(in srgb, var(--c-mutual) 15%, transparent)' }
          : { color: 'var(--c-trade)',  borderColor: 'var(--c-trade)',  backgroundColor: 'color-mix(in srgb, var(--c-trade)  15%, transparent)' }"
      >
        <v-icon
          :icon="bothUploaded ? 'mdi-check-all' : 'mdi-clock-outline'"
          size="13"
          :color="bothUploaded ? 'var(--c-mutual)' : 'var(--c-trade)'"
        />
        {{ bothUploaded ? t('tradePhotos.bothVerified') : t('tradePhotos.waitingBothSides') }}
      </span>
    </div>
    <p class="text-xs mb-4" style="color: var(--c-muted)">
      <template v-if="proposal?.status === 'pending'">
        {{ t('tradePhotos.pendingDesc') }}
      </template>
      <template v-else>
        {{ t('tradePhotos.acceptedDesc') }}
      </template>
    </p>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

      <!-- My uploads -->
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-accent)">{{ t('tradePhotos.yourPhotos') }}</span>
          <span v-if="myPhotos.length" class="text-[11px] px-2 py-1 rounded font-semibold"
            style="background: color-mix(in srgb, var(--c-accent) 15%, transparent); color: var(--c-accent)">
            {{ myPhotos.length }}
          </span>
          <span v-else class="text-[11px]" style="color: var(--c-muted)">{{ t('common.noneYet') }}</span>
        </div>

        <!-- Drop zone -->
        <button
          type="button"
          class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-5 px-4 transition-colors cursor-pointer"
          :style="uploading
            ? { borderColor: 'var(--c-trade)', backgroundColor: 'color-mix(in srgb, var(--c-trade) 8%, transparent)' }
            : { borderColor: 'var(--c-border)', backgroundColor: 'transparent' }"
          :disabled="uploading"
          @click="fileInputRef?.click()"
          @dragover.prevent
          @drop.prevent="e => onFileSelected({ target: { files: e.dataTransfer.files } })"
        >
          <v-progress-circular v-if="uploading" indeterminate size="24" width="2" color="var(--c-trade)" />
          <v-icon v-else icon="mdi-camera-plus-outline" size="24" color="var(--c-muted)" />
          <span class="text-xs" style="color: var(--c-muted)">{{ uploading ? t('tradePhotos.uploading') : t('tradePhotos.clickOrDrag') }}</span>
        </button>
        <input
          ref="fileInputRef"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          class="hidden"
          @change="onFileSelected"
        />

        <p v-if="uploadError" class="text-xs px-1" style="color: var(--c-accent)">{{ uploadError }}</p>

        <div v-if="myPhotos.length" class="flex flex-wrap gap-2">
          <div
            v-for="photo in myPhotos"
            :key="photo.id"
            class="relative group rounded-lg overflow-hidden cursor-pointer"
            style="width: 80px; height: 80px; background-color: var(--c-surface-2)"
          >
            <img :src="photo.url" loading="lazy" class="w-full h-full object-cover"
              @click="window.open(photo.url, '_blank')" />
            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style="background: rgba(0,0,0,0.55)">
              <v-btn
                icon="mdi-delete-outline" size="x-small" variant="text"
                style="color: var(--c-accent)"
                @click.stop="onDeletePhoto(photo)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Their uploads -->
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-trade)">{{ t('tradePhotos.theirPhotos') }}</span>
          <span v-if="theirPhotos.length" class="text-[11px] px-2 py-1 rounded font-semibold"
            style="background: color-mix(in srgb, var(--c-trade) 15%, transparent); color: var(--c-trade)">
            {{ theirPhotos.length }}
          </span>
          <span v-else class="text-[11px]" style="color: var(--c-muted)">{{ t('common.noneYet') }}</span>
        </div>

        <div v-if="loadingPhotos" class="flex items-center gap-2 py-4" style="color: var(--c-muted)">
          <v-progress-circular indeterminate size="16" width="2" color="var(--c-muted)" />
          <span class="text-xs">{{ t('tradePhotos.loading') }}</span>
        </div>

        <div v-else-if="!theirPhotos.length"
          class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-5 px-4"
          style="border-color: var(--c-border); color: var(--c-muted)">
          <v-icon icon="mdi-clock-outline" size="24" color="var(--c-muted)" />
          <span class="text-xs">{{ t('tradePhotos.waitingUpload', { name: proposal?.counterparty_name ?? t('common.anonymous') }) }}</span>
        </div>

        <div v-else class="flex flex-wrap gap-2">
          <a
            v-for="photo in theirPhotos"
            :key="photo.id"
            :href="photo.url"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-lg overflow-hidden block"
            style="width: 80px; height: 80px; background-color: var(--c-surface-2)"
          >
            <img :src="photo.url" loading="lazy" class="w-full h-full object-cover" />
          </a>
        </div>
      </div>
    </div>
  </div>
</template>
