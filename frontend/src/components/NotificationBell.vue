<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { getClient } from '@/lib/supabaseClient';
import { notifMeta, notifText, timeAgo } from '@/lib/notifications';

const { t } = useI18n();

const props = defineProps({
  login: { type: Object, default: null },
});
const emit = defineEmits(['navigate']);

const containerRef  = ref(null);
const open          = ref(false);
const notifications = ref([]);
const loading       = ref(false);
let   sub           = null;

const unreadCount = computed(() => notifications.value.filter(n => !n.read).length);


async function load() {
  if (!props.login?.user?.id) return;
  loading.value = true;
  const { data } = await getClient()
    .from('notification')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  notifications.value = data ?? [];
  loading.value = false;
}

async function markAllRead() {
  const ids = notifications.value.filter(n => !n.read).map(n => n.id);
  if (!ids.length) return;
  await getClient().from('notification').update({ read: true }).in('id', ids);
  notifications.value = notifications.value.map(n => ({ ...n, read: true }));
}

async function toggle() {
  open.value = !open.value;
  if (open.value) {
    await load();
    setTimeout(markAllRead, 1400);
  }
}

function onItemClick() {
  open.value = false;
  emit('navigate', 'proposals');
}

function onDocClick(e) {
  if (containerRef.value && !containerRef.value.contains(e.target)) {
    open.value = false;
  }
}

// Subscribe to realtime inserts when login is ready
watch(() => props.login?.user?.id, (uid) => {
  if (sub) { getClient().removeChannel(sub); sub = null; }
  if (!uid) return;
  load();
  sub = getClient()
    .channel(`notif-${uid}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notification',
      filter: `user_id=eq.${uid}`,
    }, (payload) => {
      notifications.value = [payload.new, ...notifications.value].slice(0, 20);
    })
    .subscribe();
}, { immediate: true });

onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  if (sub) getClient().removeChannel(sub);
});
</script>

<template>
  <div ref="containerRef" class="relative">
    <!-- Bell button -->
    <button
      class="relative flex items-center justify-center size-9 rounded-xl transition-colors cursor-pointer"
      :style="open
        ? { backgroundColor: 'var(--c-surface-2)', color: 'var(--c-accent)' }
        : { backgroundColor: 'transparent', color: 'var(--c-accent)' }"
      @click.stop="toggle"
      :title="unreadCount > 0 ? t('notifications.bellTitleUnread', { count: unreadCount }) : t('notifications.bellTitle')"
    >
      <v-icon :icon="unreadCount > 0 ? 'mdi-bell-badge' : 'mdi-bell-outline'" size="22" />
      <!-- Unread badge -->
      <span
        v-if="unreadCount > 0"
        class="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full flex items-center justify-center text-[10px] font-bold px-1 pointer-events-none"
        style="background: var(--c-accent); color: white; line-height: 1"
      >{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
    </button>

    <!-- Dropdown -->
    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-[-4px]"
      leave-active-class="transition-all duration-100 ease-in"
      leave-to-class="opacity-0 translate-y-[-4px]"
    >
      <div
        v-if="open"
        class="absolute right-0 mt-2 rounded-2xl border shadow-2xl overflow-hidden"
        style="
          width: min(320px, calc(100vw - 24px));
          top: 100%;
          background: var(--c-surface);
          border-color: var(--c-border);
          z-index: 200;
          box-shadow: 0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2);
        "
        @click.stop
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3" style="border-bottom: 1px solid var(--c-border)">
          <span class="text-sm font-bold" style="color: var(--c-text)">{{ t('notifications.title') }}</span>
          <button
            v-if="unreadCount > 0"
            class="text-[11px] font-semibold cursor-pointer transition-opacity hover:opacity-70"
            style="color: var(--c-muted)"
            @click="markAllRead"
          >{{ t('notifications.markAllRead') }}</button>
        </div>

        <!-- List -->
        <div class="overflow-y-auto" style="max-height: 380px">
          <!-- Loading -->
          <div v-if="loading" class="flex flex-col divide-y" style="border-color: var(--c-border)">
            <div v-for="i in 4" :key="i" class="flex items-start gap-3 px-4 py-3 animate-pulse">
              <div class="size-5 rounded-full shrink-0 mt-1" style="background: var(--c-skeleton)" />
              <div class="flex flex-col gap-2 grow">
                <div class="h-3 rounded w-4/5" style="background: var(--c-skeleton)" />
                <div class="h-3 rounded w-1/3" style="background: var(--c-skeleton)" />
              </div>
            </div>
          </div>

          <!-- Empty -->
          <div v-else-if="notifications.length === 0" class="flex flex-col items-center gap-2 py-10">
            <v-icon icon="mdi-bell-sleep-outline" size="32" color="var(--c-muted)" />
            <p class="text-sm" style="color: var(--c-muted)">{{ t('notifications.empty') }}</p>
          </div>

          <!-- Items -->
          <div v-else class="flex flex-col divide-y" style="border-color: var(--c-border)">
            <button
              v-for="n in notifications"
              :key="n.id"
              class="flex items-start gap-3 px-4 py-3 w-full text-left cursor-pointer transition-colors"
              :style="{ backgroundColor: n.read ? 'transparent' : 'color-mix(in srgb, var(--c-trade) 5%, transparent)' }"
              @click="onItemClick"
            >
              <v-icon
                :icon="notifMeta(n).icon"
                size="17"
                :color="notifMeta(n).color"
                class="shrink-0 mt-1"
              />
              <div class="flex flex-col min-w-0 grow gap-1">
                <p class="text-xs leading-snug" :style="{ color: n.read ? 'var(--c-muted)' : 'var(--c-text)', fontWeight: n.read ? '400' : '500' }">
                  {{ notifText(n, t) }}
                </p>
                <p class="text-[11px]" style="color: var(--c-muted)">{{ timeAgo(n.created_at) }}</p>
              </div>
              <span
                v-if="!n.read"
                class="size-2 rounded-full shrink-0 mt-2"
                :style="{ backgroundColor: notifMeta(n).color }"
              />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
