<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { getClient } from "@/lib/supabaseClient";
import { fetchAnnounceThread, sendAnnounceMessage, fetchAnnounceThreads } from "@/lib/announceMessages";

const props = defineProps({
  announceId:    { type: [Number, String], default: null },
  sellerId:      { type: String,  default: null },
  currentUserId: { type: String,  default: null },
  isOwner:       { type: Boolean, default: false },
  active:        { type: Boolean, default: false }, // panel is visible
});

const { t } = useI18n();

// ── State ───────────────────────────────────────────────────────────────────
const messages       = ref([]);
const loading        = ref(false);
const sending        = ref(false);
const draft          = ref("");
const listRef        = ref(null);

const threads        = ref([]);   // seller only: one entry per buyer
const loadingThreads = ref(false);
const selectedUser   = ref(null); // seller only: the buyer currently open

let sub = null;

// The other participant of the open thread: seller for a buyer, the picked buyer for a seller.
const otherUser = computed(() => (props.isOwner ? selectedUser.value : props.sellerId));
const canChat   = computed(() =>
  !!props.currentUserId && !!otherUser.value && otherUser.value !== props.currentUserId
);
const showThreadList = computed(() => props.isOwner && !selectedUser.value);

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60000)    return t("announceChat.justNow");
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString();
}
function initial(name) { return (name || "?").trim()[0]?.toUpperCase() ?? "?"; }
function scrollToBottom() {
  nextTick(() => { if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight; });
}

// ── Data ────────────────────────────────────────────────────────────────────
async function loadThreads() {
  if (!props.isOwner || !props.announceId) return;
  loadingThreads.value = true;
  try { threads.value = await fetchAnnounceThreads(props.announceId); }
  catch { /* silent */ }
  finally { loadingThreads.value = false; }
}

async function loadThread() {
  if (!props.announceId || !otherUser.value) { messages.value = []; return; }
  loading.value = true;
  try { messages.value = await fetchAnnounceThread(props.announceId, otherUser.value); }
  catch { /* silent */ }
  finally { loading.value = false; scrollToBottom(); }
}

async function send() {
  const text = draft.value.trim();
  if (!text || sending.value || !canChat.value) return;
  sending.value = true;
  draft.value = "";
  try {
    await sendAnnounceMessage(props.announceId, otherUser.value, text);
    await loadThread();
    if (props.isOwner) loadThreads();
  } catch {
    draft.value = text; // restore on failure
  } finally {
    sending.value = false;
  }
}

function openThread(userId) { selectedUser.value = userId; loadThread(); }
function backToList() { selectedUser.value = null; messages.value = []; }

// ── Realtime ────────────────────────────────────────────────────────────────
function unsubscribe() { if (sub) { getClient().removeChannel(sub); sub = null; } }
function subscribe() {
  unsubscribe();
  if (!props.announceId) return;
  sub = getClient()
    .channel(`announce-msgs-${props.announceId}`)
    .on("postgres_changes", {
      event: "INSERT", schema: "public", table: "announce_message",
      filter: `announce=eq.${props.announceId}`,
    }, () => {
      if (props.isOwner) loadThreads();
      if (otherUser.value) loadThread();
    })
    .subscribe();
}

watch(() => [props.active, props.announceId, props.currentUserId], ([active]) => {
  if (active && props.announceId && props.currentUserId) {
    selectedUser.value = null;
    messages.value = [];
    if (props.isOwner) loadThreads();
    else loadThread();
    subscribe();
  } else {
    unsubscribe();
    messages.value = []; threads.value = []; selectedUser.value = null; draft.value = "";
  }
}, { immediate: true });

onUnmounted(unsubscribe);

// Buyer name for the header when a seller has a thread open.
const openThreadName = computed(() => {
  const t2 = threads.value.find(x => x.userId === selectedUser.value);
  return t2?.name || t("announceChat.buyer");
});
</script>

<template>
  <div class="chat">
    <!-- Header -->
    <div class="chat-head">
      <button v-if="isOwner && selectedUser" class="chat-back" @click="backToList">
        <v-icon icon="mdi-chevron-left" size="20" />
      </button>
      <v-icon v-else icon="mdi-message-outline" size="18" style="color: var(--c-muted)" />
      <span class="chat-title">
        {{ isOwner
          ? (selectedUser ? openThreadName : t("announceChat.messages"))
          : t("announceChat.withSeller") }}
      </span>
    </div>

    <!-- Not logged in -->
    <div v-if="!currentUserId" class="chat-empty">
      <v-icon icon="mdi-lock-outline" size="30" style="color: var(--c-muted)" />
      <p class="chat-empty__txt">{{ t("announceChat.loginToChat") }}</p>
    </div>

    <!-- Seller: conversation list -->
    <template v-else-if="showThreadList">
      <div class="chat-list">
        <div v-if="loadingThreads" class="chat-center">
          <v-progress-circular indeterminate size="20" width="2" color="var(--c-muted)" />
        </div>
        <p v-else-if="threads.length === 0" class="chat-empty__txt chat-center">
          {{ t("announceChat.noConversations") }}
        </p>
        <button
          v-for="th in threads"
          :key="th.userId"
          class="thread-row"
          @click="openThread(th.userId)"
        >
          <img v-if="th.avatarUrl" :src="th.avatarUrl" class="thread-avatar" :alt="th.name || ''" />
          <div v-else class="thread-avatar thread-avatar--letter">{{ initial(th.name) }}</div>
          <div class="thread-main">
            <span class="thread-name">{{ th.name || t("announceChat.buyer") }}</span>
            <span class="thread-last">{{ th.lastContent }}</span>
          </div>
          <span class="thread-time">{{ fmtTime(th.lastTime) }}</span>
        </button>
      </div>
    </template>

    <!-- Thread view (buyer always, or seller after picking) -->
    <template v-else>
      <div ref="listRef" class="chat-msgs">
        <div v-if="loading" class="chat-center">
          <v-progress-circular indeterminate size="20" width="2" color="var(--c-muted)" />
        </div>
        <p v-else-if="messages.length === 0" class="chat-empty__txt chat-center">
          {{ t("announceChat.noMessages") }}
        </p>
        <template v-else>
          <div
            v-for="m in messages"
            :key="m.id"
            class="msg"
            :class="m.sender === currentUserId ? 'msg--me' : 'msg--them'"
          >
            <div class="msg-bubble">{{ m.content }}</div>
            <span class="msg-time">{{ fmtTime(m.created_at) }}</span>
          </div>
        </template>
      </div>

      <div class="chat-input">
        <input
          v-model="draft"
          :placeholder="t('announceChat.typeMessage')"
          :disabled="!canChat"
          class="chat-field"
          maxlength="2000"
          @keydown.enter.prevent="send"
        />
        <button class="chat-send" :disabled="!canChat || !draft.trim() || sending" @click="send">
          <v-progress-circular v-if="sending" indeterminate size="16" width="2" color="white" />
          <v-icon v-else icon="mdi-send" size="18" />
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--c-surface);
}

/* Header */
.chat-head {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--c-border);
  flex-shrink: 0;
}
.chat-title { font-size: 13px; font-weight: 800; color: var(--c-text); }
.chat-back {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 8px;
  color: var(--c-muted); cursor: pointer; transition: background 0.15s ease;
}
.chat-back:hover { background: var(--c-surface-2); }

/* Empty / centered */
.chat-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px; padding: 24px;
}
.chat-empty__txt { font-size: 12.5px; color: var(--c-muted); text-align: center; margin: 0; line-height: 1.5; }
.chat-center { margin: auto; }

/* Conversation list */
.chat-list {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column;
  scrollbar-width: thin; scrollbar-color: var(--c-border) transparent;
}
.thread-row {
  display: flex; align-items: center; gap: 11px;
  padding: 11px 14px; text-align: left; cursor: pointer;
  border-bottom: 1px solid var(--c-border);
  transition: background 0.15s ease;
}
.thread-row:hover { background: var(--c-surface-2); }
.thread-avatar {
  width: 38px; height: 38px; border-radius: 50%;
  object-fit: cover; flex-shrink: 0; border: 1.5px solid var(--c-border);
}
.thread-avatar--letter {
  display: flex; align-items: center; justify-content: center;
  background: var(--c-surface-2); color: var(--c-text); font-size: 15px; font-weight: 800;
}
.thread-main { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.thread-name { font-size: 13px; font-weight: 700; color: var(--c-text); }
.thread-last {
  font-size: 12px; color: var(--c-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
}
.thread-time { font-size: 10.5px; color: var(--c-muted); flex-shrink: 0; align-self: flex-start; padding-top: 2px; }

/* Messages */
.chat-msgs {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: 8px;
  padding: 14px;
  scrollbar-width: thin; scrollbar-color: var(--c-border) transparent;
}
.msg { display: flex; flex-direction: column; max-width: 78%; }
.msg--me   { align-self: flex-end;   align-items: flex-end; }
.msg--them { align-self: flex-start; align-items: flex-start; }
.msg-bubble {
  border-radius: 16px; padding: 8px 12px;
  font-size: 13px; line-height: 1.4; word-break: break-word;
}
.msg--me .msg-bubble   { background: var(--c-trade); color: #fff; }
.msg--them .msg-bubble { background: var(--c-surface-2); border: 1px solid var(--c-border); color: var(--c-text); }
.msg-time { font-size: 10px; color: var(--c-muted); margin-top: 3px; padding: 0 3px; }

/* Input */
.chat-input {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px; border-top: 1px solid var(--c-border); flex-shrink: 0;
}
.chat-field {
  flex: 1; background: var(--c-surface-2);
  border: 1.5px solid var(--c-border); border-radius: 12px;
  padding: 9px 13px; font-size: 13px; color: var(--c-text); outline: none;
  transition: border-color 0.15s ease;
}
.chat-field:focus { border-color: var(--c-trade); }
.chat-field:disabled { opacity: 0.5; }
.chat-field::placeholder { color: var(--c-muted); opacity: 0.6; }
.chat-send {
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
  background: var(--c-trade); color: #fff; cursor: pointer;
  transition: opacity 0.15s ease;
}
.chat-send:disabled { opacity: 0.4; pointer-events: none; }
</style>
