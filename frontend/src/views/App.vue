<script setup>
import Search from "@/components/Pages/Search.vue";
import Library from "@/components/Pages/Library.vue";
import TradeCenter from "@/components/Pages/TradeCenter.vue";
import Account from "@/components/Pages/Account.vue";
import AuthDialog from "@/components/AuthDialog.vue";
import NavItem from "@/components/NavItem.vue";
import NotificationBell from "@/components/NotificationBell.vue";
</script>

<template>
  <nav
    class="flex flex-row py-3 px-5 flex-shrink gap-6 shadow-xs place-items-center justify-between"
    style="background: var(--c-nav); border-bottom: 1px solid var(--c-border); transition: background 0.3s ease"
  >

        <div
        class="flex my-2 w-2/3 rounded-lg has-[input:focus-within]:outline-2"
          style="background: var(--c-surface-2); outline-color: var(--c-accent)">
          
          <input
            v-model="searchQuery"
            @focus="changePage('search')"
            @keyup.enter="update"
            class="placeholder:opacity-50 outline-none bg-transparent w-full"
            style="color: var(--c-text); font-size: 18px; font-weight: 500; padding: 12px 18px; letter-spacing: 0.01em;"
            placeholder="Search cards or set codes…"
            type="text"
            name="search"
          />
        </div>

          

          <div class="flex row items-center justify-around w-fit gap-1">

            <NavItem
              v-if="authenticated"
              tooltip="Collection"
              icon="mdi-cards"
              img-src="/src/assets/library.svg"
              :active="page === 'library'"
              @click="changePage('library')"
            />

            <NavItem
              v-if="authenticated"
              tooltip="Trade matches"
              icon="mdi-swap-horizontal-bold"
              :active="page === 'TradeCenter'"
              @click="openMatches()"
            />

            

            <NavItem
              v-if="authenticated"
              tooltip="Account"
              icon="mdi-account-circle-outline"
              :active="page === 'account'"
              @click="changePage('account')"
            />

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

            <NavItem
              :tooltip="authenticated ? 'Logout' : 'Login / Sign up'"
              :icon="authenticated ? 'mdi-logout' : 'mdi-login'"
              :indicator="false"
              @click="authenticated ? logout() : openLogin()"
            />

        </div>
  </nav>

  <main class="px-10 pt-6 min-h-screen" style="background: var(--c-bg); transition: background 0.3s ease">
    <TradeCenter
      v-if="page=='TradeCenter'"
      ref="tradeCenter"
      :login="authenticated"
      :filter-card-name="filterCardName"
      @clear-filter="filterCardName = ''"
    ></TradeCenter>
    <Search @TradeCenter="openMatches($event)" :searchCards="cards" v-if="page=='search'"></Search>
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
