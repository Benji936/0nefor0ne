<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { getClient } from '@/lib/supabaseClient';
import { communityMenuTarget } from '@/lib/communityMenu';

const props = defineProps({
  login: { type: Object, required: true },
  // 'bar' is the top-right chip; 'rail' is the head of the side rail, where the
  // chip stands in for the logo and follows the rail's collapsed state.
  placement: { type: String, default: 'bar' },
  // Rail only: icon-strip mode, where the name and chevron give way to the avatar.
  collapsed: { type: Boolean, default: false },
});
const isRail = computed(() => props.placement === 'rail');

const emit = defineEmits(['navigate', 'logout']);

const { t } = useI18n();
const route  = useRoute();
const router = useRouter();
const menuOpen   = ref(false);
const traderName = ref(null);
const avatarUrl  = ref(null);
const ownedSlugs = ref([]);

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

async function loadOwnedCommunities(userId) {
  if (!userId) { ownedSlugs.value = []; return; }
  const { data, error } = await getClient()
    .from('community')
    .select('slug')
    .eq('owner', userId)
    .limit(2);
  if (props.login?.user?.id !== userId) return; // superseded by a newer user
  if (error) { console.error('loadOwnedCommunities failed', error); ownedSlugs.value = []; return; }
  ownedSlugs.value = (data ?? []).map(r => r.slug);
}

watch(() => props.login?.user?.id, id => {
  loadProfile(id);
  loadOwnedCommunities(id);
}, { immediate: true });

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

// Your own things: the collection you keep, the decks you build, the trades you
// have going. They used to sit in the left rail and the phone tab bar beside
// places to explore; they belong behind your own name instead.
const menuItems = computed(() => [
  {
    label: t('userMenu.accountProfile'),
    icon:  'mdi-account-circle-outline',
    action: 'account',
  },
  {
    label: t('nav.collection'),
    icon:  'mdi-cards',
    action: 'library',
  },
  {
    label: t('nav.decks'),
    icon:  'mdi-cards-variant',
    action: 'decks',
  },
  {
    label: t('tradeCenter.proposals'),
    icon:  'mdi-swap-horizontal-bold',
    action: 'proposals',
  },
]);

const communityTarget = computed(() => communityMenuTarget(ownedSlugs.value, route.params.locale || 'en'));

function goCommunity() {
  menuOpen.value = false;
  if (communityTarget.value) router.push(communityTarget.value);
}

function handleAction(action) {
  menuOpen.value = false;
  if (action === 'logout') return emit('logout');
  emit('navigate', action);
}
</script>

<template>
  <v-menu
    v-model="menuOpen"
    :location="isRail ? 'right' : 'bottom end'"
    :offset="8"
    transition="fade-transition"
    :close-on-content-click="false"
  >
    <!-- ── Chip trigger ── -->
    <template #activator="{ props: menuProps }">
      <button
        v-bind="menuProps"
        class="flex items-center cursor-pointer transition-all select-none"
        :class="[isRail ? 'chip-rail' : 'gap-2 px-3 py-2', { 'chip-open': menuOpen, 'chip-rail--collapsed': isRail && collapsed }]"
      >
        <!-- Avatar. In the rail it is the whole control when collapsed, so it
             takes the 40px the logo used to occupy rather than the chip's 28. -->
        <div
          class="avatar-ring rounded-full shrink-0 overflow-hidden flex items-center justify-center font-bold"
          :class="isRail ? 'size-10 text-sm' : 'size-7 text-[11px]'"
        >
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            alt="avatar"
            class="w-full h-full object-cover"
          />
          <span v-else>{{ initials }}</span>
        </div>

        <!-- Name — hidden on small screens in the bar, and when the rail is collapsed -->
        <span
          v-show="!(isRail && collapsed)"
          class="inline font-semibold leading-none truncate"
          :class="isRail ? 'text-[15px]' : 'max-md:hidden text-sm max-w-[96px]'"
          style="color: var(--c-text)"
        >
          {{ displayName }}
        </span>

        <!-- Chevron — hidden on small screens, and in the collapsed rail -->
        <v-icon
          icon="mdi-chevron-down"
          size="16"
          v-show="!(isRail && collapsed)"
          class="flex chip-chevron transition-transform duration-200 shrink-0"
          :class="[{ 'rotate-180': menuOpen }, isRail ? '' : 'max-md:hidden']"
          style="color: var(--c-muted)"
        />
      </button>
    </template>

    <!-- ── Dropdown ── -->
    <div
      class="menu-panel flex flex-col rounded-2xl overflow-hidden py-2 min-w-[180px]"
      style="
        background: var(--c-surface);
        border: 1px solid var(--c-border);
        box-shadow: 0 16px 48px rgba(0,0,0,0.36), 0 2px 8px rgba(0,0,0,0.22);
      "
    >
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
        <button
          v-if="communityTarget"
          class="menu-item flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors text-left w-full"
          @click="goCommunity"
        >
          <v-icon icon="mdi-storefront-outline" size="16" style="color: var(--c-muted)" />
          <span class="text-sm" style="color: var(--c-text)">{{ t('userMenu.myCommunity') }}</span>
        </button>
      </div>

      <!-- Divider + Sign out. Omitted in the rail, which carries its own sign-out
           row beneath Discord; two of them in one open menu is one too many. -->
      <div v-if="!isRail" style="border-top: 1px solid var(--c-border)">
        <button
          class="menu-item menu-item-danger flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors text-left w-full"
          @click="handleAction('logout')"
        >
          <v-icon icon="mdi-logout" size="16" style="color: var(--c-accent)" />
          <span class="text-sm font-medium" style="color: var(--c-accent)">{{ t('userMenu.signOut') }}</span>
        </button>
      </div>
    </div>
  </v-menu>
</template>

<style scoped>
.chip-rail {
  gap: 12px;
  width: 100%;
  height: 52px;
  padding: 0 6px;
  margin-bottom: 4px;
  border-radius: 12px;
  white-space: nowrap;
}
.chip-rail:hover { background: var(--c-surface-2); }
.chip-rail--collapsed { justify-content: center; padding: 0; gap: 0; }

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
