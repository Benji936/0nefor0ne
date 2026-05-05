<script setup>
import { ref, computed, watch } from 'vue';
import { getClient } from '@/lib/supabaseClient';

const props = defineProps({
  login: { type: Object, required: true },
});

const emit = defineEmits(['navigate', 'logout']);

const menuOpen   = ref(false);
const traderName = ref(null);
const avatarUrl  = ref(null);

async function loadProfile(userId) {
  if (!userId) return;
  const { data } = await getClient()
    .from('Trader')
    .select('Name, avatar_url')
    .eq('id', userId)
    .single();
  if (data) {
    traderName.value = data.Name  ?? null;
    avatarUrl.value  = data.avatar_url ?? null;
  }
}

watch(() => props.login?.user?.id, id => loadProfile(id), { immediate: true });

const initials = computed(() => {
  const raw = traderName.value?.trim() || props.login?.user?.email || '?';
  return raw
    .split(/\s+/)
    .map(p => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
});

const displayName = computed(() =>
  traderName.value?.trim() || props.login?.user?.email?.split('@')[0] || 'Account'
);

const menuItems = [
  {
    label: 'Account & profile',
    icon:  'mdi-account-circle-outline',
    action: 'account',
  },
  // Future slots go here
];

function handleAction(action) {
  menuOpen.value = false;
  if (action === 'logout') return emit('logout');
  emit('navigate', action);
}
</script>

<template>
  <v-menu
    v-model="menuOpen"
    location="bottom end"
    :offset="8"
    transition="fade-transition"
    :close-on-content-click="false"
  >
    <!-- ── Chip trigger ── -->
    <template #activator="{ props: menuProps }">
      <button
        v-bind="menuProps"
        class="flex items-center gap-2  px-3 py-2 cursor-pointer transition-all select-none"
        :class="{ 'chip-open': menuOpen }"
      >
        <!-- Avatar -->
        <div class="avatar-ring size-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-[11px] font-bold">
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            alt="avatar"
            class="w-full h-full object-cover"
          />
          <span v-else>{{ initials }}</span>
        </div>

        <!-- Name — hidden on small screens -->
        <span class="hidden md:inline text-sm font-semibold leading-none max-w-[96px] truncate" style="color: var(--c-text)">
          {{ displayName }}
        </span>

        <!-- Chevron — hidden on small screens -->
        <v-icon
          icon="mdi-chevron-down"
          size="16"
          class="hidden md:flex chip-chevron transition-transform duration-200 shrink-0"
          :class="{ 'rotate-180': menuOpen }"
          style="color: var(--c-muted)"
        />
      </button>
    </template>

    <!-- ── Dropdown ── -->
    <div
      class="menu-panel flex flex-col rounded-2xl overflow-hidden py-1.5 min-w-[180px]"
      style="
        background: var(--c-surface);
        border: 1px solid var(--c-border);
        box-shadow: 0 16px 48px rgba(0,0,0,0.36), 0 2px 8px rgba(0,0,0,0.22);
      "
    >
      <!-- User identity header -->
      <div class="flex items-center gap-3 px-4 py-3" style="border-bottom: 1px solid var(--c-border)">
        <div
          class="size-9 rounded-xl shrink-0 overflow-hidden flex items-center justify-center text-sm font-bold"
          style="background: color-mix(in srgb, var(--c-trade) 18%, transparent); color: var(--c-trade); border: 1px solid color-mix(in srgb, var(--c-trade) 28%, transparent)"
        >
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            alt="avatar"
            class="w-full h-full object-cover"
          />
          <span v-else>{{ initials }}</span>
        </div>
        <div class="flex flex-col min-w-0">
          <span class="text-sm font-semibold truncate leading-tight" style="color: var(--c-text)">{{ displayName }}</span>
          <span class="text-[11px] truncate mt-1" style="color: var(--c-muted)">{{ login?.user?.email }}</span>
        </div>
      </div>

      <!-- Action items -->
      <div class="flex flex-col py-1">
        <button
          v-for="item in menuItems"
          :key="item.action"
          class="menu-item flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors text-left w-full"
          @click="handleAction(item.action)"
        >
          <v-icon :icon="item.icon" size="16" style="color: var(--c-muted)" />
          <span class="text-sm" style="color: var(--c-text)">{{ item.label }}</span>
        </button>
      </div>

      <!-- Divider + Sign out -->
      <div style="border-top: 1px solid var(--c-border)">
        <button
          class="menu-item menu-item-danger flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors text-left w-full"
          @click="handleAction('logout')"
        >
          <v-icon icon="mdi-logout" size="16" style="color: var(--c-accent)" />
          <span class="text-sm font-medium" style="color: var(--c-accent)">Sign out</span>
        </button>
      </div>
    </div>
  </v-menu>
</template>

<style scoped>
.avatar-ring {
  background: color-mix(in srgb, var(--c-trade) 20%, transparent);
  color: var(--c-trade);
  border: 1px solid color-mix(in srgb, var(--c-trade) 30%, transparent);
}

.menu-item:hover {
  background: var(--c-surface-2);
}
.menu-item-danger:hover {
  background: color-mix(in srgb, var(--c-accent) 8%, transparent);
}

</style>
