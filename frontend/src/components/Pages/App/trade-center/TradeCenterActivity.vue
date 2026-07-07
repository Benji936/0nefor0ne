<script setup>
import { notifMeta, notifText, timeAgo } from "@/lib/notifications";

defineProps({
  notifs:    { type: Array,   required: true },
  expanded:  { type: Boolean, default: false },
});

const emit = defineEmits(["toggle", "click"]);
</script>

<template>
  <div
    v-if="notifs.length > 0"
    class="flex flex-col rounded-2xl border overflow-hidden"
    style="background: var(--c-surface); border-color: var(--c-border)"
  >
    <!-- Collapsible header -->
    <button
      class="flex items-center justify-between px-4 py-3 w-full text-left cursor-pointer transition-colors hover:bg-white/5"
      :style="expanded ? 'border-bottom: 1px solid var(--c-border)' : ''"
      @click="emit('toggle')"
    >
      <div class="flex items-center gap-2">
        <v-icon icon="mdi-bell-outline" size="14" style="color: var(--c-muted)" />
        <span class="text-[11px] font-bold uppercase tracking-widest" style="color: var(--c-muted)">Recent activity</span>
        <span
          v-if="notifs.some(n => !n.read)"
          class="size-4 rounded-full flex items-center justify-center text-[10px] font-bold tabular-nums"
          style="background: var(--c-accent); color: white"
        >{{ notifs.filter(n => !n.read).length }}</span>
      </div>
      <v-icon
        :icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        size="16"
        style="color: var(--c-muted)"
      />
    </button>

    <!-- Rows -->
    <template v-if="expanded">
      <button
        v-for="n in notifs"
        :key="n.id"
        class="notif-row flex items-center gap-3 px-4 py-3 w-full text-left cursor-pointer transition-colors"
        :style="{ backgroundColor: n.read ? 'transparent' : `color-mix(in srgb, ${notifMeta(n).color} 5%, transparent)` }"
        @click="emit('click', n)"
      >
        <div
          class="size-7 rounded-full shrink-0 flex items-center justify-center"
          :style="{ background: `color-mix(in srgb, ${notifMeta(n).color} 14%, transparent)` }"
        >
          <v-icon :icon="notifMeta(n).icon" size="14" :color="notifMeta(n).color" />
        </div>
        <span
          class="text-sm grow truncate"
          :style="{
            color: n.read ? 'var(--c-muted)' : 'var(--c-text)',
            fontWeight: n.read ? '400' : '500',
          }"
        >{{ notifText(n) }}</span>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[11px] tabular-nums" style="color: var(--c-muted)">{{ timeAgo(n.created_at, { short: true }) }}</span>
          <span
            v-if="!n.read"
            class="size-2 rounded-full"
            :style="{ backgroundColor: notifMeta(n).color }"
          />
        </div>
      </button>
    </template>
  </div>
</template>

<style scoped>
.notif-row:not(:last-child) { border-bottom: 1px solid var(--c-border); }
.notif-row:hover            { background-color: var(--c-surface-2) !important; }
</style>
