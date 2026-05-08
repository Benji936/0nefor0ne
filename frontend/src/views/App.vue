<script setup>
import Search from "@/components/Pages/Search.vue";
import Library from "@/components/Pages/Library.vue";
import TradeCenter from "@/components/Pages/TradeCenter.vue";
import Account from "@/components/Pages/Account.vue";
import AuthDialog from "@/components/AuthDialog.vue";
import NavItem from "@/components/NavItem.vue";
import NotificationBell from "@/components/NotificationBell.vue";
import UserMenuChip from "@/components/UserMenuChip.vue";
</script>

<template>
  <!-- ── Top navbar ── -->
  <nav
    class="flex flex-row py-2 px-3 md:py-3 md:px-5 gap-2 md:gap-6 shadow-xs items-center justify-between sticky top-0 z-30"
    style="background: var(--c-nav); border-bottom: 1px solid var(--c-border); transition: background 0.3s ease"
  >

  <div class="flex flex-row justify-start w-2/3 gap-3">
    <!-- Logo -->
    <img
      src="/logo.png"
      alt="One for One"
      class="shrink-0 cursor-pointer select-none align-center max-md:hidden"
      style="height: 55px; width: 55px; object-fit: contain"
      @click="changePage('search')"
    />

    <div
      class="flex flex-1 rounded-lg md:flex-none my-1 w-full has-[input:focus-within]:outline-2"
      style="background: var(--c-surface-2); outline-color: var(--c-accent)"
    >
      <input
        v-model="searchQuery"
        @focus="changePage('search')"
        @keyup.enter="update"
        class="placeholder:opacity-50 outline-none bg-transparent w-full"
        style="color: var(--c-text); font-size: 16px; font-weight: 500; padding: 10px 14px; letter-spacing: 0.01em;"
        placeholder="Search cards or set codes…"
        type="text"
        name="search"
        inputmode="search"
      />
    </div>
  </div>

    <div class="flex items-center gap-1">
      <div v-if="authenticated" class="flex max-md:hidden items-center gap-1">
        <NavItem
          tooltip="Collection"
          icon="mdi-cards"
          img-src="/src/assets/library.svg"
          :active="page === 'library'"
          @click="changePage('library')"
        />
        <NavItem
          tooltip="Trade matches"
          icon="mdi-swap-horizontal-bold"
          :active="page === 'TradeCenter'"
          @click="openMatches()"
        />
      </div>

      <NavItem
        :tooltip="isDarkTheme ? 'Light mode' : 'Dark mode'"
        :icon="isDarkTheme ? 'mdi-white-balance-sunny' : 'mdi-moon-waning-crescent'"
        :indicator="false"
        @click="toggleTheme"
      />

      <NotificationBell
        v-if="authenticated"
        :login="authenticated"
        @navigate="openProposals"
      />

      <!-- Authenticated: user chip with dropdown -->
      <UserMenuChip
        v-if="authenticated"
        :login="authenticated"
        @navigate="changePage"
        @logout="logout"
      />

      <!-- Guest: login button -->
      <NavItem
        v-else
        tooltip="Login / Sign up"
        icon="mdi-login"
        :indicator="false"
        @click="openLogin()"
      />
    </div>
  </nav>

  <!-- ── Mobile bottom tab bar (authenticated only, phones < 640 px) ── -->
  <nav
    v-if="authenticated"
    class="fixed bottom-0 left-0 right-0 z-40 flex sm:hidden items-stretch"
    style="background: var(--c-nav); border-top: 1px solid var(--c-border); touch-action: manipulation"
  >
    <button
      v-for="tab in mobileTabs"
      :key="tab.key"
      class="flex flex-col items-center justify-center gap-0.5 flex-1 py-2 cursor-pointer transition-colors"
      style="min-height: 56px"
      :style="{ color: page === tab.key ? 'var(--c-accent)' : 'var(--c-muted)' }"
      @click="tab.action()"
    >
      <v-icon :icon="page === tab.key ? tab.iconActive : tab.icon" size="22" />
      <span class="text-[10px] font-semibold">{{ tab.label }}</span>
    </button>
  </nav>

  <main class="px-5 md:px-16 pt-5 md:pt-8 min-h-screen pb-20 sm:pb-0" style="background: var(--c-bg); transition: background 0.3s ease">
    <TradeCenter
      v-if="page=='TradeCenter'"
      ref="tradeCenter"
      :login="authenticated"
      :filter-card-name="filterCardName"
      @clear-filter="filterCardName = ''"
    ></TradeCenter>
    <Search @TradeCenter="openMatches($event)" @requireAuth="openLogin()" :searchCards="cards" v-if="page=='search'"></Search>
    <Library v-if="page=='library'" :login="authenticated" />
    <Account v-if="page=='account'" :login="authenticated" @logout="logout" />

    <AuthDialog v-model="authDialogOpen" @authenticated="onAuthenticated" />

  </main>
</template>


<script>
import { searchCardByName, searchCardBySetCode, searchById } from "@/api";
import { signOut, getCurrentSession, onAuthChange } from "@/lib/supabaseClient";


  export default {
    computed: {
        isDarkTheme() {
          return this.$vuetify.theme.global.name === 'neonDusk';
        },
        mobileTabs() {
          return [
            { key: 'search',      label: 'Search',  icon: 'mdi-magnify',                iconActive: 'mdi-magnify',                action: () => this.changePage('search') },
            { key: 'library',     label: 'Library', icon: 'mdi-cards-outline',           iconActive: 'mdi-cards',                  action: () => this.changePage('library') },
            { key: 'TradeCenter', label: 'Trades',  icon: 'mdi-swap-horizontal',         iconActive: 'mdi-swap-horizontal-bold',   action: () => this.openMatches() },
            { key: 'account',     label: 'Account', icon: 'mdi-account-circle-outline',  iconActive: 'mdi-account-circle',         action: () => this.changePage('account') },
          ];
        },
      },
      data() {
          return {
            filterCardName: "",
            searchQuery: "",
            cards: {},
            // null when logged out, { user, session } when logged in
            authenticated: null,
            authDialogOpen: false,
            authUnsubscribe: null,
            page:"search",
          };
      },
      methods: {
        async update() {
          if (!this.searchQuery.trim()) {
            this.cards = {};
            return;
          }
          const response = await searchCardByName(this.searchQuery);
          if (response.data?.data?.length > 0) {
            this.cards = response.data;
          } else if (response.data?.length > 0) {
            this.cards = { data: response.data };
          } else {
            const alt = await searchCardBySetCode(this.searchQuery);
            if (alt?.data?.id) {
              const byId = await searchById(alt.data.id);
              this.cards = byId.data?.data ? byId.data : { data: byId.data ?? [] };
            } else {
              this.cards = { data: [] };
            }
          }
        },
        openLogin() {
          this.authDialogOpen = true;
        },
        onAuthenticated(session) {
          // Called by AuthDialog after a successful sign in / sign up.
          this.authenticated = session;
        },
        async logout(){
          await signOut();
          // onAuthChange listener will clear `authenticated`, but clear it
          // immediately for snappier UI.
          this.authenticated = null;
          // Bounce back to search so we don't leave them on a logged-in page.
          if (["library", "TradeCenter", "account"].includes(this.page)) {
            this.page = "search";
          }
        },

        changePage(name) {
          this.page = name;
        },
        openMatches(card = null) {
          this.filterCardName = card?.name ?? "";
          this.page = "TradeCenter";
        },
        openProposals() {
          this.page = "TradeCenter";
          this.$nextTick(() => this.$refs.tradeCenter?.switchToProposals?.());
        },
        toggleTheme() {
          const isDark = this.$vuetify.theme.global.name === 'neonDusk';
          this.$vuetify.theme.global.name = isDark ? 'neonDuskLight' : 'neonDusk';
          document.documentElement.classList.toggle('dark', !isDark);
          localStorage.setItem('theme', isDark ? 'light' : 'dark');
        },
      },
      async mounted() {
        // Init theme from localStorage
        const saved = localStorage.getItem('theme') || 'dark';
        const isDark = saved !== 'light';
        this.$vuetify.theme.global.name = isDark ? 'neonDusk' : 'neonDuskLight';
        document.documentElement.classList.toggle('dark', isDark);

        this.authenticated = await getCurrentSession();

        // Stay in sync if the token refreshes or the user signs in/out from
        // another tab.
        this.authUnsubscribe = onAuthChange((session) => {
          this.authenticated = session;
        });
      },
      beforeUnmount() {
        if (typeof this.authUnsubscribe === "function") {
          this.authUnsubscribe();
        }
      },
  };
</script>
