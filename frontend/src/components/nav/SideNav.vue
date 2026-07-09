<script setup>
// Collapsible left navigation rail (desktop ≥ sm only — phones keep the bottom
// tab bar). Holds the primary destinations that used to crowd the top bar:
// Search, Collection, Decks, Trades. Purely toggle-driven, with two states the
// parent persists:
//   • expanded   → icons + labels; App shifts content right by the rail width.
//   • collapsed  → slim icon strip; labels surface as hover tooltips instead.
// (No hover-to-expand: a lingering cursor after a click made the rail feel like
//  the toggle did nothing.)
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  // Pinned state. Drives the rail width AND the content margin (owned by App).
  collapsed: { type: Boolean, default: false },
  authenticated: { type: Object, default: null },
  // Active route name, so the matching item lights up.
  page: { type: String, default: "search" },
  // Active trade sub-tab (matches | proposals | announces)
  activeTradeTab: { type: String, default: "matches" },
});

const emit = defineEmits(["update:collapsed", "navigate", "matches", "tradeTab"]);

const { t } = useI18n();

// `guest: true` items show for everyone; the rest require a session.
const items = computed(() => {
  const all = [
    { key: "cards",     label: t("nav.search"),     icon: "mdi-magnify",              event: "navigate", arg: "cards",    match: ["cards", "search"], guest: true },
    { key: "dashboard", label: t("nav.home"),       icon: "mdi-home-outline",         event: "navigate", arg: "dashboard", match: ["dashboard"],       guest: true },
    { key: "library",   label: t("nav.collection"), icon: "mdi-cards",                event: "navigate", arg: "library",   match: ["library"],           guest: false },
    { key: "decks",     label: t("nav.decks"),      icon: "mdi-cards-variant",        event: "navigate", arg: "decks",     match: ["decks", "deckDetail"], guest: false },
    {
      key: "trade",
      label: t("nav.trades"),
      icon: "mdi-swap-horizontal-bold",
      event: "matches",
      arg: null,
      match: ["TradeCenter"],
      guest: false,
      children: [
        { key: "trade-matches",   label: t("tradeCenter.matches"),   icon: "mdi-account-group-outline", tab: "matches" },
        { key: "trade-proposals", label: t("tradeCenter.proposals"), icon: "mdi-swap-horizontal-bold",  tab: "proposals" },
        { key: "trade-announces", label: t("tradeCenter.announces"), icon: "mdi-bullhorn-outline",       tab: "announces" },
      ],
    },
  ];
  return props.authenticated ? all : all.filter((i) => i.guest);
});

const isActive = (item) => item.match.includes(props.page);
const isTradeOpen = computed(() => props.page === "TradeCenter");

function activate(item) {
  if (item.event === "matches") emit("matches");
  else emit("navigate", item.arg);
}

function activateTradeTab(tab) {
  emit("tradeTab", tab);
}
</script>

<template>
  <aside
    class="side-nav fixed left-0 top-0 bottom-0 z-40"
    :class="{ 'side-nav--collapsed': collapsed }"
  >
    <!-- Logo → home -->
    <button class="sn-logo" :aria-label="$t('nav.search')" @click="emit('navigate', 'search')">
      <img src="/logo.png" alt="One for One" class="sn-logo-img" />
      <span v-show="!collapsed" class="sn-wordmark">One for One</span>
    </button>

    <!-- Primary destinations (labels become tooltips when collapsed) -->
    <nav class="sn-list flex flex-col gap-1 mt-2">
      <template v-for="item in items" :key="item.key">
        <v-tooltip
          location="right"
          :text="item.label"
          :disabled="!collapsed"
        >
          <template #activator="{ props: tip }">
            <button
              v-bind="tip"
              class="sn-item"
              :class="{ 'sn-item--active': isActive(item) }"
              :aria-current="isActive(item) ? 'page' : undefined"
              @click="activate(item)"
            >
              <v-icon :icon="item.icon" size="24" class="sn-ico" />
              <span v-show="!collapsed" class="sn-label">{{ item.label }}</span>
            </button>
          </template>
        </v-tooltip>

        <!-- Sub-items: shown when this item is active and nav is expanded -->
        <template v-if="item.children && isActive(item) && !collapsed">
          <button
            v-for="child in item.children"
            :key="child.key"
            class="sn-item sn-subitem"
            :class="{ 'sn-subitem--active': activeTradeTab === child.tab }"
            @click="activateTradeTab(child.tab)"
          >
            <v-icon :icon="child.icon" size="18" class="sn-ico" />
            <span class="sn-label">{{ child.label }}</span>
          </button>
        </template>

        <!-- Collapsed tooltips for sub-items -->
        <template v-if="item.children && isActive(item) && collapsed">
          <v-tooltip
            v-for="child in item.children"
            :key="child.key + '-tip'"
            location="right"
            :text="child.label"
          >
            <template #activator="{ props: tip }">
              <button
                v-bind="tip"
                class="sn-item sn-subitem"
                :class="{ 'sn-subitem--active': activeTradeTab === child.tab }"
                @click="activateTradeTab(child.tab)"
              >
                <v-icon :icon="child.icon" size="18" class="sn-ico" />
              </button>
            </template>
          </v-tooltip>
        </template>
      </template>
    </nav>

    <!-- Collapse / expand toggle -->
    <button
      class="sn-item sn-toggle mt-auto"
      :aria-label="collapsed ? $t('nav.expandMenu') : $t('nav.collapseMenu')"
      @click="emit('update:collapsed', !collapsed)"
    >
      <v-icon :icon="collapsed ? 'mdi-chevron-right' : 'mdi-chevron-left'" size="22" class="sn-ico" />
      <span v-show="!collapsed" class="sn-label">{{ $t('nav.collapseMenu') }}</span>
    </button>
  </aside>
</template>

<style scoped>
/* Hidden on phones (they keep the bottom tab bar); shown as a flex column ≥sm.
   Display is handled here rather than via Tailwind's `hidden sm:flex` because
   Tailwind v4 orders the base `.hidden` utility after the `sm:` variants, which
   makes `hidden sm:flex` collapse to display:none even on desktop. */
.side-nav {
  display: none;
  flex-direction: column;
  width: 210px;
  padding: 14px 12px;
  background: var(--c-nav);
  border-right: 1px solid var(--c-border);
  overflow: hidden;
  transition: width 0.18s ease;
}
@media (min-width: 640px) {
  .side-nav { display: flex; }
}
.side-nav--collapsed { width: 64px; }

.sn-logo,
.sn-item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  height: 44px;
  padding: 0 10px;
  border-radius: 12px;
  cursor: pointer;
  white-space: nowrap;
  color: var(--c-text);
  transition: background 0.15s ease, color 0.15s ease;
}
/* Centre the icons when the rail is a slim strip. */
.side-nav--collapsed .sn-logo,
.side-nav--collapsed .sn-item {
  justify-content: center;
  padding: 0;
  gap: 0;
}

.sn-logo { height: 52px; margin-bottom: 4px; }
.sn-logo-img { width: 40px; height: 40px; object-fit: contain; flex-shrink: 0; }
.sn-wordmark { font-weight: 800; font-size: 16px; letter-spacing: -0.01em; }

.sn-item:hover,
.sn-logo:hover { background: var(--c-surface-2); }

.sn-ico { color: var(--c-muted); flex-shrink: 0; transition: color 0.15s ease; }
.sn-label { font-size: 14px; font-weight: 600; }

.sn-item--active { background: var(--c-surface-2); color: var(--c-accent); }
.sn-item--active .sn-ico { color: var(--c-accent); }

.sn-subitem {
  padding-left: 28px;
  height: 36px;
  font-size: 13px;
  color: var(--c-muted);
  opacity: 0.85;
}
.side-nav--collapsed .sn-subitem {
  padding-left: 0;
  justify-content: center;
  height: 36px;
}
.sn-subitem--active { color: var(--c-accent); opacity: 1; }
.sn-subitem--active .sn-ico { color: var(--c-accent); }
.sn-subitem:hover { opacity: 1; background: var(--c-surface-2); }

.sn-toggle { color: var(--c-muted); }
.sn-toggle .sn-label { font-weight: 500; }

@media (prefers-reduced-motion: reduce) {
  .side-nav { transition: none; }
}
</style>
