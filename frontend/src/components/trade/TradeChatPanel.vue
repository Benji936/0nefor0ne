<script setup>
import { ref, watch, nextTick } from "vue";
import { useI18n } from "vue-i18n";
import { fetchTradeMessages, sendTradeMessage } from "@/lib/proposals";
import { getClient } from "@/lib/supabaseClient";

const { t } = useI18n();

const props = defineProps({
  open:          { type: Boolean, default: false },
  proposal:      { type: Object,  default: null  },
  currentUserId: { type: String,  default: null  },
  standalone:    { type: Boolean, default: false },
});

// ── State ─────────────────────────────────────────────────────────────────
const messages        = ref([]);
const loadingMessages = ref(false);
const newMessage      = ref("");
const sendingMessage  = ref(false);
const msgListRef      = ref(null);
let   msgSub          = null;

// ── Helpers ───────────────────────────────────────────────────────────────
function formatMsgTime(ts) {
  if (!ts) return "";
  const d    = new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60000)    return "just now";
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

function scrollToBottom() {
  nextTick(() => {
    if (msgListRef.value) msgListRef.value.scrollTop = msgListRef.value.scrollHeight;
  });
}

// ── Data loading ──────────────────────────────────────────────────────────
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

// ── Actions ───────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = newMessage.value.trim();
  if (!text || sendingMessage.value || !props.proposal?.id) return;
  sendingMessage.value = true;
  newMessage.value = "";
  try {
    await sendTradeMessage(props.proposal.id, text);
    await loadMessages();
  } catch {
    newMessage.value = text;
  } finally {
    sendingMessage.value = false;
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────
watch(() => props.open, (open) => {
  if (open && props.proposal) {
    loadMessages();
    msgSub = getClient()
      .channel(`trade-msgs-${props.proposal.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "trade_message",
        filter: `trade=eq.${props.proposal.id}`,
      }, loadMessages)
      .subscribe();
  } else {
    messages.value  = [];
    newMessage.value = "";
    if (msgSub) { getClient().removeChannel(msgSub); msgSub = null; }
  }
}, { immediate: true });
</script>

<template>
  <!-- Embedded mode: shown inside TradeDetailDialog with its own header/border -->
  <div v-if="!standalone" class="mt-6 pt-5 px-4 " style="border-top: 1px solid var(--c-border)">
    <div class="flex items-center gap-3 mb-3">
      <v-icon icon="mdi-message-outline" size="20" color="var(--c-muted)" />
      <span class="text-sm font-bold uppercase tracking-wide" style="color: var(--c-text)">{{ t('tradeChat.title') }}</span>
      <span class="text-[11px] ml-auto" style="color: var(--c-muted)">{{ t('tradeChat.visibleToBoth') }}</span>
    </div>
    <div
      ref="msgListRef"
      class="flex flex-col gap-2 overflow-y-auto rounded-xl border px-3 py-3"
      style="min-height: 160px; max-height: 240px; border-color: var(--c-border); background-color: var(--c-surface-2)"
    >
      <div v-if="loadingMessages" class="flex items-center justify-center flex-1 py-6" style="color: var(--c-muted)">
        <v-progress-circular indeterminate size="20" width="2" color="var(--c-muted)" />
      </div>
      <p v-else-if="messages.length === 0" class="text-xs italic text-center m-auto py-4" style="color: var(--c-muted)">
        {{ t('tradeChat.noMessages') }}
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
          <span class="text-[10px] mt-1 px-1" style="color: var(--c-muted)">{{ formatMsgTime(msg.created_at) }}</span>
        </div>
      </template>
    </div>
    <div v-if="proposal?.status === 'pending' || proposal?.status === 'accepted'" class="flex gap-2 mt-2">
      <input
        v-model="newMessage"
        :placeholder="t('tradeChat.typeMessage')"
        class="flex-1 rounded-lg px-4 py-2 text-sm border outline-none"
        :style="{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
        @keydown.enter.prevent="sendMessage"
      />
      <v-btn icon="mdi-send" variant="flat"  density="default" :loading="sendingMessage"
        :disabled="!newMessage.trim()"
        style="background-color: var(--c-trade); color: white; border-radius: 12px"
        @click="sendMessage"/>
    </div>
    <p v-else class="text-xs mt-2 italic" style="color: var(--c-muted)">
      {{ t('tradeChat.readOnly') }}
    </p>
  </div>

  <!-- Standalone mode: fills the parent container (used inside TradeChatDialog) -->
  <div v-else class="flex flex-col h-full">
    <!-- Message list fills all available space -->
    <div
      ref="msgListRef"
      class="flex flex-col gap-2 overflow-y-auto px-4 py-3 grow"
      style="background-color: var(--c-surface)"
    >
      <div v-if="loadingMessages" class="flex items-center justify-center flex-1 py-6" style="color: var(--c-muted)">
        <v-progress-circular indeterminate size="20" width="2" color="var(--c-muted)" />
      </div>
      <p v-else-if="messages.length === 0" class="text-xs italic text-center m-auto py-4" style="color: var(--c-muted)">
        {{ t('tradeChat.noMessages') }}
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
              : { backgroundColor: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }"
          >{{ msg.content }}</div>
          <span class="text-[10px] mt-1 px-1" style="color: var(--c-muted)">{{ formatMsgTime(msg.created_at) }}</span>
        </div>
      </template>
    </div>

    <!-- Input area -->
    <div class="shrink-0 px-4 py-3" style="border-top: 1px solid var(--c-border)">
      <div v-if="proposal?.status === 'pending' || proposal?.status === 'accepted'" class="flex gap-2">
        <input
          v-model="newMessage"
          :placeholder="t('tradeChat.typeMessage')"
          class="flex-1 rounded-xl px-4 py-2 text-sm border outline-none"
          :style="{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
          @keydown.enter.prevent="sendMessage"
        />
        <v-btn icon="mdi-send" variant="flat" size="small" density="default" :loading="sendingMessage"
          :disabled="!newMessage.trim()"
          style="background-color: var(--c-trade); color: white; border-radius: 12px; padding: 5px;"
          @click="sendMessage" />
      </div>
      <p v-else class="text-xs italic" style="color: var(--c-muted)">
        {{ t('tradeChat.readOnly') }}
      </p>
    </div>
  </div>
</template>
