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
import { useRoute } from "vue-router";
import NotificationBell from "@/components/nav/NotificationBell.vue";
import UserMenuChip from "@/components/nav/UserMenuChip.vue";
import { SUPPORTED, LANG_LABELS } from "@/i18n.js";

const props = defineProps({
  // Pinned state. Drives the rail width AND the content margin (owned by App).
  collapsed: { type: Boolean, default: false },
  authenticated: { type: Object, default: null },
  // Active route name, so the matching item lights up.
  page: { type: String, default: "search" },
  // Active trade sub-tab (matches | proposals | announces)
  activeTradeTab: { type: String, default: "matches" },
  // Theme + language live here rather than in the top bar, so the rail holds
  // every persistent app control and the bar is left to search. App still owns
  // the state; the rail only reports the intent.
  isDark: { type: Boolean, default: true },
});

const emit = defineEmits([
  "update:collapsed", "navigate", "matches", "tradeTab",
  "toggleTheme", "switchLang", "notifications", "logout", "login",
]);

// `locale` is the URL segment used to build in-app links; `currentLang` is the
// active i18n language shown on the switcher. They agree in practice, but the
// links must follow the URL and the label must follow what is being rendered.
const { t, locale: currentLang } = useI18n();
const route = useRoute();
const locale = computed(() => route.params.locale || "en");

// `guest: true` items show for everyone; the rest require a session.
const items = computed(() => {
  const all = [
    { key: "cards",     label: t("nav.search"),     icon: "mdi-magnify",              event: "navigate", arg: "cards",    match: ["cards", "search"], guest: true },
    { key: "dashboard", label: t("nav.home"),       icon: "mdi-home-outline",         event: "navigate", arg: "dashboard", match: ["dashboard"],       guest: true },
    // Collection, Decks and Proposals live in the user menu instead. They are
    // about your own things rather than places to explore, and the rail was
    // seven items deep; what is left is what you come here to look through.
    { key: "trade-matches",   label: t("tradeCenter.matches"),   icon: "mdi-account-group-outline", event: "tradeTab", arg: "matches", match: ["TradeCenter"], guest: false, tab: "matches" },
    // Announces is guest-visible: the board is public, so hiding the way to it
    // from the people most likely to be browsing was the wrong way round.
    { key: "trade-announces", label: t("tradeCenter.announces"), icon: "mdi-bullhorn-outline",       event: "tradeTab", arg: "announces", match: ["TradeCenter"], guest: true,  tab: "announces" },
  ];
  return props.authenticated ? all : all.filter((i) => i.guest);
});

const isActive = (item) => item.match.includes(props.page);
const isItemActive = (item) => item.tab ? props.page === "TradeCenter" && props.activeTradeTab === item.tab : isActive(item);
const discordUrl = "https://discord.gg/MeaQcR29Fa";

function activate(item) {
  if (item.event === "tradeTab") emit("tradeTab", item.arg);
  else if (item.event === "matches") emit("matches");
  else emit("navigate", item.arg);
}
</script>

<template>
  <aside
    class="side-nav fixed left-0 top-0 bottom-0 z-40"
    :class="{ 'side-nav--collapsed': collapsed }"
  >
    <!-- Head of the rail: who you are signed in as, and the menu of your own
         things. Guests have no account to show, so they keep the logo — and
         with it the way home. -->
    <UserMenuChip
      v-if="authenticated"
      :login="authenticated"
      placement="rail"
      :collapsed="collapsed"
      @navigate="emit('navigate', $event)"
      @logout="emit('logout')"
    />
    <button v-else class="sn-logo" :aria-label="$t('nav.search')" @click="emit('navigate', 'search')">
      <img src="/logo.png" alt="One for One" class="sn-logo-img" />
      <span v-show="!collapsed" class="sn-wordmark">One for One</span>
    </button>

    <!-- Primary destinations (labels become tooltips when collapsed) -->
    <nav class="sn-list flex flex-col gap-1 mt-2">
      <!-- Notifications sit above Search: what is waiting for you outranks
           what you came to look for. Guests have nothing to be notified of. -->
      <v-tooltip
        v-if="authenticated"
        location="right"
        :text="t('notifications.title')"
        :disabled="!collapsed"
      >
        <template #activator="{ props: tip }">
          <div v-bind="tip" class="sn-bell-row">
            <NotificationBell
              :login="authenticated"
              placement="rail"
              @navigate="emit('notifications')"
            />
            <span v-show="!collapsed" class="sn-label sn-bell-label">{{ t('notifications.title') }}</span>
          </div>
        </template>
      </v-tooltip>

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
              :class="{ 'sn-item--active': isItemActive(item) }"
              :aria-current="isItemActive(item) ? 'page' : undefined"
              @click="activate(item)"
            >
              <v-icon :icon="item.icon" size="24" class="sn-ico" />
              <span v-show="!collapsed" class="sn-label">{{ item.label }}</span>
            </button>
          </template>
        </v-tooltip>
      </template>

      <!-- Community directory: a plain named-route link rather than the
           `navigate` event above, since that event is routed through
           App.vue's changePage() arg map, which this task doesn't touch. -->
      <v-tooltip
        location="right"
        :text="t('community.home')"
        :disabled="!collapsed"
      >
        <template #activator="{ props: tip }">
          <router-link
            v-bind="tip"
            class="sn-item"
            :class="{ 'sn-item--active': page === 'community' }"
            :aria-current="page === 'community' ? 'page' : undefined"
            :to="{ name: 'community', params: { locale } }"
          >
            <v-icon icon="mdi-storefront-outline" size="24" class="sn-ico" />
            <span v-show="!collapsed" class="sn-label">{{ t('community.home') }}</span>
          </router-link>
        </template>
      </v-tooltip>
    </nav>

    <div class="sn-footer mt-auto">
      <!-- Theme -->
      <v-tooltip
        location="right"
        :text="isDark ? $t('nav.lightMode') : $t('nav.darkMode')"
        :disabled="!collapsed"
      >
        <template #activator="{ props: tip }">
          <button v-bind="tip" class="sn-item" @click="emit('toggleTheme')">
            <v-icon :icon="isDark ? 'mdi-white-balance-sunny' : 'mdi-moon-waning-crescent'" size="22" class="sn-ico" />
            <span v-show="!collapsed" class="sn-label">{{ isDark ? $t('nav.lightMode') : $t('nav.darkMode') }}</span>
          </button>
        </template>
      </v-tooltip>

      <!-- Language. v-menu teleports to the body, which is what keeps the list
           from being cut off by the rail's own overflow: hidden. -->
      <v-menu location="right" offset="10" :close-on-content-click="true">
        <template #activator="{ props: menu }">
          <button v-bind="menu" class="sn-item" :title="$t('language.label')">
            <v-icon icon="mdi-translate" size="22" class="sn-ico" />
            <span v-show="!collapsed" class="sn-label sn-lang-label">
              {{ LANG_LABELS[currentLang] }}
              <span class="sn-lang-code">{{ currentLang }}</span>
            </span>
          </button>
        </template>
        <div class="sn-lang-menu">
          <button
            v-for="lang in SUPPORTED"
            :key="lang"
            class="sn-lang-opt"
            :class="{ 'sn-lang-opt--active': lang === currentLang }"
            @click="emit('switchLang', lang)"
          >
            <span class="sn-lang-code">{{ lang }}</span>
            <span>{{ LANG_LABELS[lang] }}</span>
          </button>
        </div>
      </v-menu>

      <v-tooltip
        location="right"
        :text="$t('nav.support')"
        :disabled="!collapsed"
      >
        <template #activator="{ props: tip }">
          <router-link
            v-bind="tip"
            class="sn-item sn-support"
            :class="{ 'sn-item--active': page === 'built-with' }"
            :to="`/${locale}/built-with`"
          >
            <v-icon icon="mdi-heart-outline" size="22" class="sn-ico" />
            <span v-show="!collapsed" class="sn-label">{{ $t('nav.support') }}</span>
          </router-link>
        </template>
      </v-tooltip>

      <v-tooltip
        location="right"
        :text="$t('nav.joinDiscord')"
        :disabled="!collapsed"
      >
        <template #activator="{ props: tip }">
          <a
            v-bind="tip"
            class="sn-item sn-discord"
            :href="discordUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg class="sn-discord-logo" viewBox="0 0 127.14 96.36" aria-hidden="true">
              <path
                fill="currentColor"
                d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83A97.68 97.68 0 0 0 49 6.83 72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21h0A105.73 105.73 0 0 0 32.71 96.36 77.7 77.7 0 0 0 39.6 85.25a68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1A105.25 105.25 0 0 0 126.6 80.22h0C129.24 52.84 122.09 29.11 107.7 8.07ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53 48.84 65.69 42.45 65.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53 91.08 65.69 84.69 65.69Z"
              />
            </svg>
            <span v-show="!collapsed" class="sn-label">{{ $t('nav.joinDiscord') }}</span>
          </a>
        </template>
      </v-tooltip>

      <!-- Sign out, or — for a guest — the way in. The top bar is gone on
           desktop, so this row is the only sign-in affordance the rail offers. -->
      <v-tooltip
        location="right"
        :text="authenticated ? $t('userMenu.signOut') : $t('nav.loginSignup')"
        :disabled="!collapsed"
      >
        <template #activator="{ props: tip }">
          <button
            v-bind="tip"
            class="sn-item sn-signout"
            @click="emit(authenticated ? 'logout' : 'login')"
          >
            <v-icon :icon="authenticated ? 'mdi-logout' : 'mdi-login'" size="22" class="sn-ico" />
            <span v-show="!collapsed" class="sn-label">
              {{ authenticated ? $t('userMenu.signOut') : $t('nav.loginSignup') }}
            </span>
          </button>
        </template>
      </v-tooltip>

      <!-- Collapse / expand toggle -->
      <button
        class="sn-item sn-toggle"
        :aria-label="collapsed ? $t('nav.expandMenu') : $t('nav.collapseMenu')"
        @click="emit('update:collapsed', !collapsed)"
      >
        <v-icon :icon="collapsed ? 'mdi-chevron-right' : 'mdi-chevron-left'" size="22" class="sn-ico" />
        <span v-show="!collapsed" class="sn-label">{{ $t('nav.collapseMenu') }}</span>
      </button>
    </div>
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

/* The bell is its own component, so the row around it reproduces .sn-item's
   geometry instead of wrapping it in one — a button inside a button is not
   markup we can ship. */
.sn-bell-row {
  display: flex;
  align-items: center;
  /* The bell is a 36px square button with its own centring, so the padding and
     gap here differ from .sn-item's 10/14 in order to land the glyph and the
     label on exactly the same two columns as every item below it. */
  padding: 0 4px;
  gap: 8px;
  height: 44px;
  border-radius: 12px;
}
.side-nav--collapsed .sn-bell-row { justify-content: center; padding: 0; gap: 0; }
.sn-bell-row:hover { background: var(--c-surface-2); }
.sn-bell-label { color: var(--c-text); }

.sn-lang-label { display: flex; align-items: center; gap: 8px; }
.sn-lang-code {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--c-muted);
}
.sn-lang-menu {
  display: flex;
  flex-direction: column;
  min-width: 150px;
  padding: 4px;
  border-radius: 12px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
}
.sn-lang-opt {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  color: var(--c-text);
}
.sn-lang-opt:hover { background: var(--c-surface-2); }
.sn-lang-opt--active { color: var(--c-accent); font-weight: 700; }
.sn-lang-opt--active .sn-lang-code { color: var(--c-accent); }

.sn-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
}
.sn-support {
  text-decoration: none;
  color: var(--c-text);
}
.sn-discord {
  text-decoration: none;
  color: var(--c-text);
}
.sn-discord-logo {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
.sn-discord:hover {
  background: var(--c-surface-2);
}
/* Sign out / sign in: the one identity action in the rail, and the one row that
   carries the accent — everything above it rests muted. */
.sn-signout .sn-ico,
.sn-signout .sn-label { color: var(--c-accent); }
.sn-signout:hover { background: color-mix(in srgb, var(--c-accent) 8%, transparent); }

.sn-toggle { color: var(--c-muted); }
.sn-toggle .sn-label { font-weight: 500; }

@media (prefers-reduced-motion: reduce) {
  .side-nav { transition: none; }
}
</style>
