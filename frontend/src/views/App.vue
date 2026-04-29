
<script setup>
import Search from "@/components/Pages/Search.vue";
import Library from "@/components/Pages/Library.vue";
import TradeCenter from "@/components/Pages/TradeCenter.vue"
import AuthDialog from "@/components/AuthDialog.vue";
import NavItem from "@/components/NavItem.vue";
</script>

<template>
  <header class="">
    
  </header>

  <nav
    class="flex flex-row py-3 px-5 flex-shrink gap-6 shadow-xs place-items-center justify-between"
    style="background: var(--c-nav); border-bottom: 1px solid var(--c-border); transition: background 0.3s ease"
  >
      <div class="flex flex-row w-2/3 gap-6">
        <img alt="TradeMarket Logo" class="" src="../assets/theLogoNobg.png" width="250"/>
        <div
          class="flex my-2 rounded-md has-[input:focus-within]:outline-2 w-3/5 justify-between"
          style="background: var(--c-surface-2); outline-color: var(--c-accent)"
        >

          <input
            v-model="searchQuery"
            v-on:focus="changePage('search')"
            v-on:keyup.enter="update"
            class="placeholder:opacity-50 mx-4 my-2 outline-none bg-transparent"
            style="color: var(--c-text)"
            placeholder="Rechercher"
            type="text"
            name="search"
          />

          
        </div>
      </div>

      <div class="flex row items-center justify-around w-1/6 gap-1">

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

        <NavItem
          :tooltip="authenticated ? 'Logout' : 'Login / Sign up'"
          :icon="authenticated ? 'mdi-logout' : 'mdi-login'"
          :indicator="false"
          @click="authenticated ? logout() : openLogin()"
        />

        <!-- Future nav items -->
      </div>
      
      

    </nav>

  <main class="px-10 pt-6 min-h-screen" style="background: var(--c-bg); transition: background 0.3s ease">


<TradeCenter
      v-if="page=='TradeCenter'"
      :login="authenticated"
      :filter-card-name="filterCardName"
      @clear-filter="filterCardName = ''"
    ></TradeCenter>
    <Search @TradeCenter="openMatches($event)" :searchCards="cards" v-if="page=='search'"></Search>
    <div v-if="page=='library'" class="py-8">
      <Library :login="authenticated"></Library>
    </div>

    <AuthDialog v-model="authDialogOpen" @authenticated="onAuthenticated" />

  </main>
</template>


<script>
import { get, getUrl } from "@/api";
import { signOut, getCurrentSession, onAuthChange } from "@/lib/supabaseClient";


  export default {
      

      computed: {
        isDarkTheme() {
          return this.$vuetify.theme.global.name === 'neonDusk';
        },
      },
      data() {
          return {
            show_card:null,
            filterCardName: "",
            searchQuery: "",
            cards: {},
            // null when logged out, { user, session } when logged in
            authenticated: null,
            authDialogOpen: false,
            authUnsubscribe: null,
            page:"search",
            previousPage:"",
          };
      },
      methods: {
        async update() {
          if (!this.searchQuery.trim()) {
            this.cards = {};
            return;
          }
          const response = await get(getUrl() + 'cardinfo.php?fname=' + encodeURIComponent(this.searchQuery));
          this.cards = response.data;
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
          if (this.page === "library" || this.page === "TradeCenter") {
            this.page = "search";
          }
        },

        changePage(name) {
          this.page = name;
        },
        // Open the TradeCenter (matches page). If a card is passed (from
        // "See traders" on a card tile), pre-filter the matches by that
        // card's name. Without an arg, opens the global view.
        openMatches(card = null) {
          this.show_card = card;
          this.filterCardName = card?.name ?? "";
          this.page = "TradeCenter";
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

<style scoped>
/* SVG icons on login/logout buttons */
.nav-icon {
  transition: filter 0.3s ease;
}

html:not(.dark) .nav-icon {
  filter: brightness(0) saturate(0%);
}
</style>