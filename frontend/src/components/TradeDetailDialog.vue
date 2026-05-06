<script setup>
import { ref, computed, watch, nextTick } from "vue";
import { cardImage } from "@/lib/cardImage";
import { fetchTradePhotos, uploadTradePhoto, deleteTradePhoto, fetchTradeMessages, sendTradeMessage } from "@/lib/matches";
import { getClient } from "@/lib/supabaseClient";

const props = defineProps({
  modelValue:    { type: Boolean, default: false },
  proposal:      { type: Object,  default: null },
  currentUserId: { type: String,  default: null },
});

const emit = defineEmits(["update:modelValue", "accept", "decline", "cancel", "complete", "counter"]);

// ── Message state ────────────────────────────────────────────────────────────
const messages        = ref([]);
const loadingMessages = ref(false);
const newMessage      = ref("");
const sendingMessage  = ref(false);
const msgListRef      = ref(null);
let   msgSub          = null;

async function loadMessages() {
  if (!props.proposal?.id) return;
  loadingMessages.value = true;
  try {
    messages.value = await fetchTradeMessages(props.proposal.id);
  } catch { /* silent */ } finally {
    loadingMessages.value = false;
    scrollToBottom();
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (msgListRef.value) msgListRef.value.scrollTop = msgListRef.value.scrollHeight;
  });
}

async function sendMessage() {
  const text = newMessage.value.trim();
  if (!text || sendingMessage.value || !props.proposal?.id) return;
  sendingMessage.value = true;
  newMessage.value = "";
  try {
    await sendTradeMessage(props.proposal.id, text);
    await loadMessages();
  } catch { newMessage.value = text; } finally {
    sendingMessage.value = false;
  }
}

function formatMsgTime(ts) {
  if (!ts) return "";
  const d    = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60000)    return "just now";
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

// ── Photo state ─────────────────────────────────────────────────────────────
const photos       = ref([]);
const loadingPhotos = ref(false);
const uploading    = ref(false);
const uploadError  = ref("");
const fileInputRef = ref(null);
let   photoSub     = null;

const myPhotos    = computed(() => photos.value.filter(p => p.uploader === props.currentUserId));
const theirPhotos = computed(() => photos.value.filter(p => p.uploader !== props.currentUserId));
const bothUploaded = computed(() => myPhotos.value.length > 0 && theirPhotos.value.length > 0);

async function loadPhotos() {
  if (!props.proposal?.id) return;
  loadingPhotos.value = true;
  try {
    photos.value = await fetchTradePhotos(props.proposal.id);
  } catch { /* silent */ }
  finally { loadingPhotos.value = false; }
}

watch(() => props.modelValue, (open) => {
  if (open && props.proposal) {
    // Photos — only for active trades
    if (["pending", "accepted"].includes(props.proposal.status)) {
      loadPhotos();
      photoSub = getClient()
        .channel(`trade-photos-${props.proposal.id}`)
        .on("postgres_changes", {
          event: "*", schema: "public", table: "trade_photo",
          filter: `trade=eq.${props.proposal.id}`,
        }, loadPhotos)
        .subscribe();
    }

    // Messages — always shown
    loadMessages();
    msgSub = getClient()
      .channel(`trade-msgs-${props.proposal.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "trade_message",
        filter: `trade=eq.${props.proposal.id}`,
      }, loadMessages)
      .subscribe();
  } else {
    photos.value   = [];
    uploadError.value = "";
    messages.value = [];
    newMessage.value = "";
    if (photoSub) { getClient().removeChannel(photoSub); photoSub = null; }
    if (msgSub)   { getClient().removeChannel(msgSub);   msgSub   = null; }
  }
});

async function onFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file || !props.currentUserId) return;
  uploading.value = true;
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

// ── Shared helpers ───────────────────────────────────────────────────────────
const statusMeta = computed(() => {
  if (!props.proposal) return {};
  const map = {
    pending:   { label: "Pending",   color: "var(--c-trade)",  icon: "mdi-clock-outline" },
    accepted:  { label: "Accepted",  color: "var(--c-mutual)", icon: "mdi-check-circle-outline" },
    declined:  { label: "Declined",  color: "var(--c-accent)", icon: "mdi-close-circle-outline" },
    cancelled: { label: "Cancelled", color: "var(--c-muted)",  icon: "mdi-cancel" },
    completed: { label: "Completed", color: "var(--c-mutual)", icon: "mdi-handshake-outline" },
  };
  return map[props.proposal.status] ?? map.pending;
});

const formattedDate = computed(() => {
  if (!props.proposal?.created_at) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" })
    .format(new Date(props.proposal.created_at));
});

const declining     = ref(false);
const declineReason = ref("");

const isPending      = computed(() => props.proposal?.status === "pending");
const isAccepted     = computed(() => props.proposal?.status === "accepted");
const showPhotoPanel = computed(() => isPending.value || isAccepted.value);
const iConfirmed     = computed(() => props.proposal?.i_confirmed    ?? false);
const theyConfirmed  = computed(() => props.proposal?.they_confirmed ?? false);

function shortenRarity(r) {
  return r ? r.split(" ").map(w => w[0]).join("") : "";
}

function marketLinks(name, extension) {
  const q = encodeURIComponent(name ?? "");
  const s = encodeURIComponent(extension ?? "");
  return [
    { label: "TCGPlayer",  url: `https://www.tcgplayer.com/search/yugioh/product?q=${q}` },
    { label: "Cardmarket", url: extension
        ? `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${s}`
        : `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${q}` },
    { label: "eBay",       url: `https://www.ebay.com/sch/i.html?_nkw=${q}+yugioh` },
  ];
}

function close() {
  emit("update:modelValue", false);
  declining.value = false;
  declineReason.value = "";
}
function action(event) { emit(event, props.proposal); close(); }
function confirmDecline() {
  emit("decline", { proposal: props.proposal, reason: declineReason.value.trim() || null });
  close();
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="900"
    width="92vw"
    scrollable
  >
    <v-card
      v-if="proposal"
      class="!rounded-2xl overflow-hidden"
      style="background-color: var(--c-surface); color: var(--c-text); border: 1px solid var(--c-border)"
    >
      <!-- Header -->
      <div>
        <div class="flex items-center gap-4 px-6 py-4">
          <div class="relative shrink-0">
            <div class="absolute -inset-1 rounded-full blur-md opacity-35"
              :style="{ backgroundColor: proposal.i_am_proposer ? 'var(--c-trade)' : 'var(--c-accent)' }" />
            <div
              class="relative size-11 rounded-full flex items-center justify-center font-bold text-sm text-white ring-2 ring-white/10"
              :style="{ backgroundColor: proposal.i_am_proposer ? 'var(--c-trade)' : 'var(--c-accent)' }"
            >{{ (proposal.counterparty_name ?? "?")[0].toUpperCase() }}</div>
          </div>
          <div class="flex flex-col grow min-w-0">
            <span class="font-bold text-lg leading-tight" style="color: var(--c-text)">
              Trade #{{ proposal.id }} · {{ proposal.counterparty_name ?? "Anonymous" }}
            </span>
            <span class="text-sm mt-0.5" style="color: var(--c-muted)">
              {{ proposal.i_am_proposer ? "You proposed" : "Proposed to you" }} · {{ formattedDate }}
            </span>
          </div>
          <span
            class="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg border shrink-0"
            :style="{ color: statusMeta.color, borderColor: statusMeta.color + '60', backgroundColor: statusMeta.color + '18' }"
          >
            <v-icon :icon="statusMeta.icon" size="14" :color="statusMeta.color" />
            {{ statusMeta.label }}
          </span>
          <v-btn icon="mdi-close" variant="text" density="compact" style="color: var(--c-muted)" @click="close" />
        </div>
        <div class="h-px w-full" style="background: linear-gradient(90deg, var(--c-accent), transparent 40%, transparent 60%, var(--c-trade))" />
      </div>

      <!-- Body -->
      <v-card-text class="pa-6" style="overflow-y: auto">

        <!-- ── Card columns ────────────────────────────────────────────────── -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

          <!-- You give -->
          <section class="flex flex-col gap-3">
            <div class="flex items-center gap-2 pb-1" style="border-bottom: 1px solid var(--c-border)">
              <v-icon icon="mdi-arrow-up-circle" size="18" color="var(--c-accent)" />
              <span class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">You give</span>
              <span v-if="proposal.i_give?.length" class="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-md"
                style="background: color-mix(in srgb, var(--c-accent) 15%, transparent); color: var(--c-accent)">
                {{ proposal.i_give.length }} card{{ proposal.i_give.length !== 1 ? "s" : "" }}
              </span>
            </div>
            <p v-if="!proposal.i_give?.length" class="text-sm italic py-4 text-center" style="color: var(--c-muted)">Nothing on this side</p>
            <div v-for="card in proposal.i_give" :key="card.id"
              class="flex gap-3 rounded-lg p-3"
              style="background-color: var(--c-surface-2); border: 1px solid var(--c-border)">
              <img :src="cardImage(card.image_id)" :alt="card.name" loading="lazy"
                class="rounded-md object-contain shrink-0 ring-1 ring-white/10"
                style="width: 62px; height: 88px; background-color: var(--c-surface)" />
              <div class="flex flex-col gap-1.5 min-w-0 grow">
                <p class="font-semibold text-sm leading-tight" style="color: var(--c-text)">{{ card.name }}</p>
                <div class="flex flex-wrap gap-1.5">
                  <span v-if="card.extension" class="text-[11px] px-1.5 py-0.5 rounded font-mono"
                    style="background: color-mix(in srgb, var(--c-trade) 15%, transparent); color: var(--c-trade)">{{ card.extension }}</span>
                  <span v-if="card.rarity" class="text-[11px] px-1.5 py-0.5 rounded"
                    style="background: color-mix(in srgb, var(--c-muted) 15%, transparent); color: var(--c-text)"
                    :title="card.rarity">{{ shortenRarity(card.rarity) }}</span>
                  <span v-if="card.condition" class="text-[11px] px-1.5 py-0.5 rounded"
                    style="background: color-mix(in srgb, var(--c-muted) 12%, transparent); color: var(--c-muted)">{{ card.condition }}</span>
                  <span v-if="card.language" class="text-[11px] px-1.5 py-0.5 rounded"
                    style="background: color-mix(in srgb, var(--c-muted) 12%, transparent); color: var(--c-muted)">{{ card.language }}</span>
                </div>
                <p class="text-xs font-semibold mt-auto" style="color: var(--c-text)">
                  Qty: <span style="color: var(--c-accent)">{{ card.quantity }}</span>
                </p>
                <div class="flex gap-2 mt-0.5">
                  <a v-for="m in marketLinks(card.name, card.extension)" :key="m.label"
                    :href="m.url" target="_blank" rel="noopener noreferrer"
                    class="text-[11px] flex items-center gap-0.5 no-underline transition-opacity hover:opacity-70"
                    style="color: var(--c-muted)">
                    <v-icon icon="mdi-open-in-new" size="11" />{{ m.label }}
                  </a>
                </div>
              </div>
            </div>
          </section>

          <!-- You receive -->
          <section class="flex flex-col gap-3">
            <div class="flex items-center gap-2 pb-1" style="border-bottom: 1px solid var(--c-border)">
              <v-icon icon="mdi-arrow-down-circle" size="18" color="var(--c-trade)" />
              <span class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">You receive</span>
              <span v-if="proposal.i_receive?.length" class="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-md"
                style="background: color-mix(in srgb, var(--c-trade) 15%, transparent); color: var(--c-trade)">
                {{ proposal.i_receive.length }} card{{ proposal.i_receive.length !== 1 ? "s" : "" }}
              </span>
            </div>
            <p v-if="!proposal.i_receive?.length" class="text-sm italic py-4 text-center" style="color: var(--c-muted)">Nothing on this side</p>
            <div v-for="card in proposal.i_receive" :key="card.id"
              class="flex gap-3 rounded-lg p-3"
              style="background-color: var(--c-surface-2); border: 1px solid var(--c-border)">
              <img :src="cardImage(card.image_id)" :alt="card.name" loading="lazy"
                class="rounded-md object-contain shrink-0 ring-1 ring-white/10"
                style="width: 62px; height: 88px; background-color: var(--c-surface)" />
              <div class="flex flex-col gap-1.5 min-w-0 grow">
                <p class="font-semibold text-sm leading-tight" style="color: var(--c-text)">{{ card.name }}</p>
                <div class="flex flex-wrap gap-1.5">
                  <span v-if="card.extension" class="text-[11px] px-1.5 py-0.5 rounded font-mono"
                    style="background: color-mix(in srgb, var(--c-trade) 15%, transparent); color: var(--c-trade)">{{ card.extension }}</span>
                  <span v-if="card.rarity" class="text-[11px] px-1.5 py-0.5 rounded"
                    style="background: color-mix(in srgb, var(--c-muted) 15%, transparent); color: var(--c-text)"
                    :title="card.rarity">{{ shortenRarity(card.rarity) }}</span>
                  <span v-if="card.condition" class="text-[11px] px-1.5 py-0.5 rounded"
                    style="background: color-mix(in srgb, var(--c-muted) 12%, transparent); color: var(--c-muted)">{{ card.condition }}</span>
                  <span v-if="card.language" class="text-[11px] px-1.5 py-0.5 rounded"
                    style="background: color-mix(in srgb, var(--c-muted) 12%, transparent); color: var(--c-muted)">{{ card.language }}</span>
                </div>
                <p class="text-xs font-semibold mt-auto" style="color: var(--c-text)">
                  Qty: <span style="color: var(--c-trade)">{{ card.quantity }}</span>
                </p>
                <div class="flex gap-2 mt-0.5">
                  <a v-for="m in marketLinks(card.name, card.extension)" :key="m.label"
                    :href="m.url" target="_blank" rel="noopener noreferrer"
                    class="text-[11px] flex items-center gap-0.5 no-underline transition-opacity hover:opacity-70"
                    style="color: var(--c-muted)">
                    <v-icon icon="mdi-open-in-new" size="11" />{{ m.label }}
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- ── Decline reason ─────────────────────────────────────────────────── -->
        <div
          v-if="proposal.status === 'declined' && proposal.decline_reason"
          class="mt-6 flex items-start gap-3 rounded-xl px-4 py-3"
          style="background: color-mix(in srgb, var(--c-accent) 8%, transparent); border: 1px solid color-mix(in srgb, var(--c-accent) 20%, transparent)"
        >
          <v-icon icon="mdi-message-reply-outline" size="16" color="var(--c-accent)" class="shrink-0 mt-0.5" />
          <div class="flex flex-col gap-0.5 min-w-0">
            <p class="text-xs font-semibold" style="color: var(--c-accent)">Reason for declining</p>
            <p class="text-sm leading-snug" style="color: var(--c-text)">{{ proposal.decline_reason }}</p>
          </div>
        </div>

        <!-- ── Verification photos ────────────────────────────────────────────── -->
        <template v-if="showPhotoPanel">
          <div class="mt-6 pt-5" style="border-top: 1px solid var(--c-border)">

            <!-- Section header -->
            <div class="flex items-center gap-3 mb-1">
              <v-icon icon="mdi-camera-outline" size="20" color="var(--c-muted)" />
              <span class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">Verification photos</span>
              <!-- Status pill -->
              <span
                class="ml-auto flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border"
                :style="bothUploaded
                  ? { color: 'var(--c-mutual)', borderColor: 'var(--c-mutual)', backgroundColor: 'color-mix(in srgb, var(--c-mutual) 15%, transparent)' }
                  : { color: 'var(--c-trade)',  borderColor: 'var(--c-trade)',  backgroundColor: 'color-mix(in srgb, var(--c-trade)  15%, transparent)' }"
              >
                <v-icon
                  :icon="bothUploaded ? 'mdi-check-all' : 'mdi-clock-outline'"
                  size="13"
                  :color="bothUploaded ? 'var(--c-mutual)' : 'var(--c-trade)'"
                />
                {{ bothUploaded ? "Both verified" : "Waiting for both sides" }}
              </span>
            </div>
            <!-- Context-aware subtitle -->
            <p class="text-xs mb-4" style="color: var(--c-muted)">
              <template v-if="isPending">
                Both traders must upload photos of their cards before the trade can be accepted.
              </template>
              <template v-else>
                Photos were verified before acceptance.
              </template>
            </p>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

              <!-- My uploads -->
              <div class="flex flex-col gap-3">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-accent)">Your photos</span>
                  <span v-if="myPhotos.length" class="text-[11px] px-1.5 py-0.5 rounded font-semibold"
                    style="background: color-mix(in srgb, var(--c-accent) 15%, transparent); color: var(--c-accent)">
                    {{ myPhotos.length }}
                  </span>
                  <span v-else class="text-[11px]" style="color: var(--c-muted)">none yet</span>
                </div>

                <!-- Upload drop zone -->
                <button
                  type="button"
                  class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-5 px-4 transition-colors cursor-pointer"
                  :style="uploading
                    ? { borderColor: 'var(--c-trade)', backgroundColor: 'color-mix(in srgb, var(--c-trade) 8%, transparent)' }
                    : { borderColor: 'var(--c-border)', backgroundColor: 'transparent' }"
                  :disabled="uploading"
                  @click="fileInputRef?.click()"
                  @dragover.prevent
                  @drop.prevent="e => { fileInputRef && (fileInputRef.files = e.dataTransfer.files); onFileSelected({ target: { files: e.dataTransfer.files } }) }"
                >
                  <v-progress-circular v-if="uploading" indeterminate size="24" width="2" color="var(--c-trade)" />
                  <v-icon v-else icon="mdi-camera-plus-outline" size="24" color="var(--c-muted)" />
                  <span class="text-xs" style="color: var(--c-muted)">
                    {{ uploading ? "Uploading…" : "Click or drag a photo" }}
                  </span>
                </button>
                <input
                  ref="fileInputRef"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  class="hidden"
                  @change="onFileSelected"
                />

                <!-- Error -->
                <p v-if="uploadError" class="text-xs px-1" style="color: var(--c-accent)">{{ uploadError }}</p>

                <!-- My photo grid -->
                <div v-if="myPhotos.length" class="flex flex-wrap gap-2">
                  <div
                    v-for="photo in myPhotos"
                    :key="photo.id"
                    class="relative group rounded-lg overflow-hidden cursor-pointer"
                    style="width: 80px; height: 80px; background-color: var(--c-surface-2)"
                  >
                    <img :src="photo.url" loading="lazy" class="w-full h-full object-cover"
                      @click="window.open(photo.url, '_blank')" />
                    <!-- Delete overlay -->
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
                  <span class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-trade)">Their photos</span>
                  <span v-if="theirPhotos.length" class="text-[11px] px-1.5 py-0.5 rounded font-semibold"
                    style="background: color-mix(in srgb, var(--c-trade) 15%, transparent); color: var(--c-trade)">
                    {{ theirPhotos.length }}
                  </span>
                  <span v-else class="text-[11px]" style="color: var(--c-muted)">none yet</span>
                </div>

                <div v-if="loadingPhotos" class="flex items-center gap-2 py-4" style="color: var(--c-muted)">
                  <v-progress-circular indeterminate size="16" width="2" color="var(--c-muted)" />
                  <span class="text-xs">Loading…</span>
                </div>

                <div v-else-if="!theirPhotos.length"
                  class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-5 px-4"
                  style="border-color: var(--c-border); color: var(--c-muted)">
                  <v-icon icon="mdi-clock-outline" size="24" color="var(--c-muted)" />
                  <span class="text-xs">Waiting for {{ proposal.counterparty_name ?? "them" }} to upload</span>
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

        <!-- ── Trade chat ───────────────────────────────────────────────────── -->
        <div class="mt-6 pt-5" style="border-top: 1px solid var(--c-border)">
          <div class="flex items-center gap-3 mb-3">
            <v-icon icon="mdi-message-outline" size="20" color="var(--c-muted)" />
            <span class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">Trade chat</span>
            <span class="text-[11px] ml-auto" style="color: var(--c-muted)">Visible to both traders</span>
          </div>

          <!-- Message list -->
          <div
            ref="msgListRef"
            class="flex flex-col gap-2 overflow-y-auto rounded-xl border px-3 py-3"
            style="min-height: 160px; max-height: 240px; border-color: var(--c-border); background-color: var(--c-surface-2)"
          >
            <div v-if="loadingMessages" class="flex items-center justify-center flex-1 py-6" style="color: var(--c-muted)">
              <v-progress-circular indeterminate size="20" width="2" color="var(--c-muted)" />
            </div>
            <p v-else-if="messages.length === 0" class="text-xs italic text-center m-auto py-4" style="color: var(--c-muted)">
              No messages yet. Say something!
            </p>
            <template v-else>
              <div
                v-for="msg in messages"
                :key="msg.id"
                class="flex flex-col max-w-[75%]"
                :class="msg.sender === currentUserId ? 'self-end items-end' : 'self-start items-start'"
              >
                <div
                  class="rounded-2xl px-3 py-2 text-sm leading-snug"
                  :style="msg.sender === currentUserId
                    ? { backgroundColor: 'var(--c-trade)', color: 'white' }
                    : { backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }"
                >{{ msg.content }}</div>
                <span class="text-[10px] mt-0.5 px-1" style="color: var(--c-muted)">{{ formatMsgTime(msg.created_at) }}</span>
              </div>
            </template>
          </div>

          <!-- Input row -->
          <div v-if="proposal.status === 'pending' || proposal.status === 'accepted'" class="flex gap-2 mt-2">
            <input
              v-model="newMessage"
              placeholder="Type a message…"
              class="flex-1 rounded-lg px-4 py-2 text-sm border outline-none"
              :style="{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
              @keydown.enter.prevent="sendMessage"
            />
            <v-btn
              icon="mdi-send"
              variant="flat"
              density="default"
              :loading="sendingMessage"
              :disabled="!newMessage.trim()"
              style="background-color: var(--c-trade); color: white; border-radius: 12px"
              @click="sendMessage"
            />
          </div>
          <p v-else class="text-xs mt-2 italic" style="color: var(--c-muted)">
            This trade is {{ proposal.status }}. Chat is read-only.
          </p>
        </div>

      </v-card-text>

      <!-- Footer -->
      <div>
        <div class="h-px w-full" style="background: linear-gradient(90deg, var(--c-accent), transparent 40%, transparent 60%, var(--c-trade))" />
        <div class="flex items-center justify-between px-6 py-4 gap-3 flex-wrap">

          <!-- Accepted actions -->
          <template v-if="isAccepted">
            <div class="flex flex-col gap-3 w-full">
              <!-- Dual confirmation status -->
              <div class="flex gap-3">
                <div
                  class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm flex-1 border"
                  :style="iConfirmed
                    ? { background: 'color-mix(in srgb, var(--c-mutual) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--c-mutual) 30%, transparent)' }
                    : { background: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }"
                >
                  <v-icon
                    :icon="iConfirmed ? 'mdi-check-circle' : 'mdi-circle-outline'"
                    size="16"
                    :color="iConfirmed ? 'var(--c-mutual)' : 'var(--c-muted)'"
                  />
                  <span class="font-medium" :style="{ color: iConfirmed ? 'var(--c-mutual)' : 'var(--c-muted)' }">You</span>
                </div>
                <div
                  class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm flex-1 border"
                  :style="theyConfirmed
                    ? { background: 'color-mix(in srgb, var(--c-mutual) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--c-mutual) 30%, transparent)' }
                    : { background: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }"
                >
                  <v-icon
                    :icon="theyConfirmed ? 'mdi-check-circle' : 'mdi-clock-outline'"
                    size="16"
                    :color="theyConfirmed ? 'var(--c-mutual)' : 'var(--c-muted)'"
                  />
                  <span class="font-medium truncate" :style="{ color: theyConfirmed ? 'var(--c-mutual)' : 'var(--c-muted)' }">
                    {{ proposal.counterparty_name ?? 'Them' }}
                  </span>
                </div>
              </div>
              <!-- Help text -->
              <p class="text-xs" style="color: var(--c-muted)">
                <template v-if="!bothUploaded">Upload photos on both sides before confirming.</template>
                <template v-else-if="iConfirmed">Waiting for {{ proposal.counterparty_name ?? 'them' }} to confirm the exchange.</template>
                <template v-else>Both sides have uploaded — confirm when you've received your cards.</template>
              </p>
              <!-- Buttons -->
              <div class="flex gap-2 flex-wrap justify-end">
                <v-btn variant="outlined" prepend-icon="mdi-cancel"
                  style="border-color: var(--c-accent); color: var(--c-accent)"
                  @click="action('cancel')"
                >Cancel trade</v-btn>
                <v-btn
                  v-if="!iConfirmed"
                  variant="flat" prepend-icon="mdi-handshake-outline"
                  :disabled="!bothUploaded"
                  :style="bothUploaded
                    ? 'background-color: var(--c-mutual); color: #0C0820'
                    : 'opacity: 0.45'"
                  @click="action('complete')"
                >Confirm your side</v-btn>
              </div>
            </div>
          </template>

          <!-- Pending actions -->
          <template v-else-if="isPending">
            <span class="text-xs grow" style="color: var(--c-muted)">
              <template v-if="!proposal.i_am_proposer && !bothUploaded">
                Upload photos on both sides to enable accepting.
              </template>
              <template v-else-if="!proposal.i_am_proposer && bothUploaded">
                Photos verified — you can now accept this trade.
              </template>
              <template v-else-if="proposal.i_am_proposer && !myPhotos.length">
                Upload photos of your cards to let the other side accept.
              </template>
              <template v-else-if="proposal.i_am_proposer && !theirPhotos.length">
                Waiting for {{ proposal.counterparty_name ?? "them" }} to upload their photos.
              </template>
              <template v-else>
                Both sides uploaded — waiting for {{ proposal.counterparty_name ?? "them" }} to accept.
              </template>
            </span>
            <div class="flex gap-2 shrink-0 flex-wrap w-full">
              <template v-if="!proposal.i_am_proposer">
                <!-- Decline reason form -->
                <template v-if="declining">
                  <div class="flex flex-col gap-2 w-full gap-5">
                    <textarea
                      v-model="declineReason"
                      placeholder="Optional — let them know why you're declining…"
                      rows="2"
                      class="w-full rounded-xl px-3 py-3 text-sm border outline-none resize-none"
                      :style="{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
                      autofocus
                    />
                    <div class="flex gap-2 justify-end">
                      <v-btn size="small" variant="text" style="color: var(--c-muted)" @click="declining = false">
                        Back
                      </v-btn>
                      <v-btn size="small" variant="flat"
                        style="background-color: var(--c-accent); color: white"
                        @click="confirmDecline"
                      >Confirm decline</v-btn>
                    </div>
                  </div>
                </template>

                <template v-else>
                  <v-btn variant="text" prepend-icon="mdi-cancel"
                    style="color: var(--c-muted)"
                    @click="action('cancel')"
                  >Cancel</v-btn>
                  <v-btn variant="outlined" prepend-icon="mdi-close"
                    style="border-color: var(--c-accent); color: var(--c-accent)"
                    @click="declining = true"
                  >Decline</v-btn>
                  <v-btn variant="outlined" prepend-icon="mdi-swap-horizontal"
                    style="border-color: var(--c-trade); color: var(--c-trade)"
                    @click="emit('counter', proposal); close()"
                  >Counter</v-btn>
                  <v-btn variant="flat" prepend-icon="mdi-check"
                    :disabled="!bothUploaded"
                    :style="bothUploaded
                      ? 'background-color: var(--c-mutual); color: #0C0820'
                      : 'opacity: 0.45'"
                    @click="action('accept')"
                  >Accept</v-btn>
                </template>
              </template>
              <v-btn v-else variant="text" prepend-icon="mdi-cancel"
                style="color: var(--c-muted)"
                @click="action('cancel')"
              >Cancel proposal</v-btn>
            </div>
          </template>

          <!-- Read-only -->
          <template v-else>
            <div class="ml-auto">
              <v-btn variant="text" style="color: var(--c-muted)" @click="close">Close</v-btn>
            </div>
          </template>

        </div>
      </div>
    </v-card>
  </v-dialog>
</template>
