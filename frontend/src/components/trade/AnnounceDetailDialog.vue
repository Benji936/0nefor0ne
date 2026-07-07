<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { timeAgo } from "@/lib/notifications";
import { deleteAnnounce, updateAnnounce } from "@/lib/announces";

const props = defineProps({
  modelValue:    { type: Boolean, default: false },
  announce:      { type: Object,  default: null  },
  currentUserId: { type: String,  default: null  },
});
const emit = defineEmits(["update:modelValue", "deleted", "updated", "propose"]);
const { t } = useI18n();

const deleting  = ref(false);
const updating  = ref(false);
const imgIdx    = ref(0);

watch(() => props.modelValue, open => { if (open) imgIdx.value = 0; });

const isOwner = computed(() => props.announce?.seller === props.currentUserId);

const formattedPrice = computed(() => {
  if (!props.announce) return "";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: props.announce.currency || "EUR" }).format(props.announce.price);
});

const sellerName    = computed(() => props.announce?.Trader?.Name || props.announce?.Trader?.name || t("announces.unknownSeller"));
const sellerAvatar  = computed(() => props.announce?.Trader?.avatar_url ?? null);
const sellerInitial = computed(() => (sellerName.value || "?")[0].toUpperCase());
const location = computed(() => {
  const city    = props.announce?.Trader?.City    || props.announce?.Trader?.city;
  const country = props.announce?.Trader?.Country || props.announce?.Trader?.country;
  if (city && country) return `${city}, ${country}`;
  return country || null;
});
const rating = computed(() => props.announce?.Trader?.avg_rating ?? null);
const images = computed(() => props.announce?.images ?? []);

function close() { emit("update:modelValue", false); }

async function handleDelete() {
  if (!confirm(t("announce.deleteConfirm"))) return;
  deleting.value = true;
  try { await deleteAnnounce(props.announce.id); emit("deleted", props.announce.id); close(); }
  catch (err) { alert(err.message ?? "Failed to delete"); }
  finally { deleting.value = false; }
}

async function handleMarkSold() {
  updating.value = true;
  try { await updateAnnounce(props.announce.id, { status: "sold" }); emit("updated", props.announce.id); close(); }
  catch (err) { alert(err.message ?? "Failed to update"); }
  finally { updating.value = false; }
}

function handlePropose() { emit("propose", props.announce.seller); close(); }
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
    <div v-if="announce" class="dlg">

      <!-- Image gallery (full bleed at top) -->
      <div class="gallery">
        <img
          v-if="images.length"
          :src="images[imgIdx].url"
          :alt="announce.title"
          class="gallery__img"
        />
        <div v-else class="gallery__empty">
          <v-icon icon="mdi-image-off-outline" size="48" style="color: var(--c-border)" />
        </div>

        <!-- Prev / Next -->
        <button v-if="imgIdx > 0" class="gallery__arrow gallery__arrow--left" @click.stop="imgIdx--">
          <v-icon icon="mdi-chevron-left" size="22" />
        </button>
        <button v-if="imgIdx < images.length - 1" class="gallery__arrow gallery__arrow--right" @click.stop="imgIdx++">
          <v-icon icon="mdi-chevron-right" size="22" />
        </button>

        <!-- Dot nav -->
        <div v-if="images.length > 1" class="gallery__dots">
          <button
            v-for="(_, i) in images" :key="i"
            class="gallery__dot"
            :class="{ 'gallery__dot--active': i === imgIdx }"
            @click.stop="imgIdx = i"
          />
        </div>

        <!-- Price overlay -->
        <div class="gallery__price">{{ formattedPrice }}</div>

        <!-- Close button -->
        <button class="gallery__close" @click="close">
          <v-icon icon="mdi-close" size="18" />
        </button>

        <!-- Own badge -->
        <div v-if="isOwner" class="gallery__own">
          <v-icon icon="mdi-account-check" size="12" />
          {{ t("announces.yourAnnounce") }}
        </div>

        <!-- Photo count -->
        <div v-if="images.length > 1" class="gallery__count">
          <v-icon icon="mdi-image-multiple-outline" size="12" />
          {{ imgIdx + 1 }} / {{ images.length }}
        </div>
      </div>

      <!-- Scrollable content -->
      <div class="dlg-body">

        <!-- Title + time -->
        <div class="info-row">
          <h2 class="info-title">{{ announce.title }}</h2>
          <span class="info-time">{{ timeAgo(announce.created_at, t) }}</span>
        </div>

        <!-- Description -->
        <p v-if="announce.description" class="info-desc">{{ announce.description }}</p>

        <!-- Divider -->
        <div class="divider" />

        <!-- Seller card -->
        <div class="seller">
          <img v-if="sellerAvatar" :src="sellerAvatar" class="seller__avatar" :alt="sellerName" />
          <div v-else class="seller__avatar seller__avatar--letter">{{ sellerInitial }}</div>
          <div class="seller__info">
            <span class="seller__label">{{ t('announce.postedBy') }}</span>
            <span class="seller__name">{{ sellerName }}</span>
            <span v-if="location" class="seller__loc">
              <v-icon icon="mdi-map-marker-outline" size="11" />
              {{ location }}
            </span>
          </div>
          <div v-if="rating" class="seller__rating">
            <v-icon icon="mdi-star" size="13" style="color: #f59e0b" />
            <span>{{ Number(rating).toFixed(1) }}</span>
          </div>
        </div>

      </div>

      <!-- Actions footer -->
      <div class="dlg-foot">
        <template v-if="isOwner">
          <button class="btn-del" :disabled="deleting" @click="handleDelete">
            <v-progress-circular v-if="deleting" indeterminate size="14" width="2" />
            <v-icon v-else icon="mdi-delete-outline" size="16" />
            {{ t('announce.delete') }}
          </button>
          <button class="btn-sold" :disabled="updating" @click="handleMarkSold">
            <v-progress-circular v-if="updating" indeterminate size="14" width="2" />
            <v-icon v-else icon="mdi-check-circle-outline" size="16" />
            {{ t('announce.markSold') }}
          </button>
        </template>
        <template v-else>
          <button v-if="currentUserId" class="btn-contact" @click="handlePropose">
            <v-icon icon="mdi-handshake-outline" size="17" />
            {{ t('announce.contactSeller') }}
          </button>
        </template>
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

/* ── Gallery ──────────────────────────────────────── */
.gallery {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #0a0614;
  overflow: hidden;
  flex-shrink: 0;
}
.gallery__img {
  width: 100%; height: 100%;
  object-fit: contain;
}
.gallery__empty {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: var(--c-surface-2);
}

/* Nav arrows */
.gallery__arrow {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(0,0,0,0.55); color: white;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; backdrop-filter: blur(6px);
  transition: background 0.15s ease;
}
.gallery__arrow:hover { background: rgba(0,0,0,0.8); }
.gallery__arrow--left  { left: 10px; }
.gallery__arrow--right { right: 10px; }

/* Dot nav */
.gallery__dots {
  position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 5px;
}
.gallery__dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(255,255,255,0.35); cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}
.gallery__dot--active { background: #fff; transform: scale(1.25); }

/* Overlays */
.gallery__price {
  position: absolute; bottom: 0; left: 0;
  padding: 36px 14px 12px;
  background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%);
  color: #fff; font-size: 22px; font-weight: 900; letter-spacing: -0.02em;
  text-shadow: 0 1px 6px rgba(0,0,0,0.5);
}
.gallery__close {
  position: absolute; top: 10px; right: 10px;
  width: 32px; height: 32px; border-radius: 50%;
  background: rgba(0,0,0,0.55); color: white;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; backdrop-filter: blur(6px);
  transition: background 0.15s ease;
}
.gallery__close:hover { background: rgba(0,0,0,0.8); }

.gallery__own {
  position: absolute; top: 10px; left: 10px;
  display: flex; align-items: center; gap: 4px;
  padding: 4px 9px; border-radius: 99px;
  background: var(--c-trade); color: #fff;
  font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
  backdrop-filter: blur(4px);
}
.gallery__count {
  position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 99px;
  background: rgba(0,0,0,0.55); color: white;
  font-size: 10px; font-weight: 700;
  backdrop-filter: blur(6px);
}

/* ── Body ─────────────────────────────────────────── */
.dlg-body {
  padding: 18px 18px 4px;
  display: flex; flex-direction: column; gap: 14px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--c-border) transparent;
}
.dlg-body::-webkit-scrollbar { width: 4px; }
.dlg-body::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 99px; }

.info-row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
}
.info-title {
  font-size: 17px; font-weight: 800; color: var(--c-text);
  line-height: 1.3; margin: 0; flex: 1;
}
.info-time {
  font-size: 11px; font-weight: 600; color: var(--c-muted);
  white-space: nowrap; padding-top: 3px;
}
.info-desc {
  font-size: 13.5px; color: var(--c-muted);
  line-height: 1.6; margin: 0; white-space: pre-wrap;
}
.divider { height: 1px; background: var(--c-border); }

/* ── Seller ───────────────────────────────────────── */
.seller {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 14px;
  background: var(--c-surface);
  border: 1.5px solid var(--c-border);
  margin-bottom: 4px;
}
.seller__avatar {
  width: 44px; height: 44px; border-radius: 50%;
  object-fit: cover; border: 2px solid var(--c-border); flex-shrink: 0;
}
.seller__avatar--letter {
  display: flex; align-items: center; justify-content: center;
  background: var(--c-surface-2); color: var(--c-text);
  font-size: 16px; font-weight: 800;
}
.seller__info { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.seller__label { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--c-muted); }
.seller__name  { font-size: 14px; font-weight: 700; color: var(--c-text); }
.seller__loc   { display: flex; align-items: center; gap: 3px; font-size: 11px; color: var(--c-muted); }
.seller__rating {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 9px; border-radius: 9px;
  background: color-mix(in srgb, #f59e0b 12%, transparent);
  font-size: 13px; font-weight: 800; color: #f59e0b;
  flex-shrink: 0;
}

/* ── Footer ───────────────────────────────────────── */
.dlg-foot {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px;
  background: var(--c-surface);
  border-top: 1px solid var(--c-border);
  flex-shrink: 0;
}

.btn-del {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 15px; border-radius: 11px;
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: #ef4444; font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background 0.15s ease;
}
.btn-del:hover { background: color-mix(in srgb, #ef4444 22%, transparent); }
.btn-del:disabled { opacity: 0.4; pointer-events: none; }

.btn-sold {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 15px; border-radius: 11px; margin-left: auto;
  background: var(--c-surface-2); color: var(--c-text);
  font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background 0.15s ease;
}
.btn-sold:hover { background: var(--c-border); }
.btn-sold:disabled { opacity: 0.4; pointer-events: none; }

.btn-contact {
  display: flex; align-items: center; gap: 7px;
  padding: 10px 22px; border-radius: 12px;
  width: 100%;  justify-content: center;
  background: var(--c-trade); color: #fff;
  font-size: 14px; font-weight: 700;
  cursor: pointer; transition: opacity 0.15s ease, transform 0.15s ease;
}
.btn-contact:hover { opacity: 0.88; transform: translateY(-1px); }
</style>
