<script setup>
import { ref, computed, watch, nextTick, useTemplateRef } from 'vue';

const props = defineProps({
  log: { type: Array, default: () => [] },
  chat: { type: Array, default: () => [] },
  me: { type: String, default: null },
});
const emit = defineEmits(['send']);

const tab = ref('chat');
const draft = ref('');
const unread = ref(0);
const scroller = useTemplateRef('scroller');

const chatMessages = computed(() => props.chat ?? []);
const logEntries = computed(() => (props.log ?? []).slice().reverse());

function send() {
  const text = draft.value.trim();
  if (!text) return;
  emit('send', text);
  draft.value = '';
}

async function scrollToLatest() {
  await nextTick();
  const el = scroller.value;
  if (el) el.scrollTop = el.scrollHeight;
}

// Newest chat sits at the bottom, so follow it; badge it when on the Log tab.
watch(
  () => chatMessages.value.length,
  (len, prev) => {
    if (len <= (prev ?? 0)) return;
    if (tab.value === 'chat') scrollToLatest();
    else unread.value += len - (prev ?? 0);
  },
);

watch(tab, (t) => {
  if (t === 'chat') {
    unread.value = 0;
    scrollToLatest();
  }
});
</script>

<template>
  <aside class="panel">
    <div class="tabs" role="tablist">
      <button
        class="tab"
        :class="{ on: tab === 'chat' }"
        type="button"
        role="tab"
        :aria-selected="tab === 'chat'"
        @click="tab = 'chat'"
      >
        Chat
        <span v-if="unread > 0" class="badge">{{ unread > 9 ? '9+' : unread }}</span>
      </button>
      <button
        class="tab"
        :class="{ on: tab === 'log' }"
        type="button"
        role="tab"
        :aria-selected="tab === 'log'"
        @click="tab = 'log'"
      >
        Log
      </button>
    </div>

    <div v-if="tab === 'chat'" ref="scroller" class="entries">
      <p v-if="chatMessages.length === 0" class="muted small empty">Say something to your opponent.</p>
      <div v-for="m in chatMessages" :key="m.seq" class="msg" :class="{ mine: m.uid === me }">
        <span class="who">{{ m.name }}</span>
        <span class="text">{{ m.text }}</span>
      </div>
    </div>

    <div v-else class="entries">
      <p v-if="logEntries.length === 0" class="muted small empty">No moves yet.</p>
      <div v-for="entry in logEntries" :key="entry.seq" class="log-line">{{ entry.text }}</div>
    </div>

    <form v-if="tab === 'chat'" class="composer" @submit.prevent="send">
      <input
        v-model="draft"
        class="composer-input"
        type="text"
        maxlength="240"
        placeholder="Message"
        aria-label="Chat message"
      />
      <button class="composer-send" type="submit" :disabled="!draft.trim()" aria-label="Send">
        Send
      </button>
    </form>
  </aside>
</template>
