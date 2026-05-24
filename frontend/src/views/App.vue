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
    class="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 flex sm:hidden items-stretch"
    style="background: var(--c-nav); border-top: 1px solid var(--c-border); touch-action: manipulation"
  >
    <button
      v-for="tab in mobileTabs"
      :key="tab.key"
      class="flex flex-col items-center justify-center gap-1 flex-1 py-2 cursor-pointer transition-colors"
      style="min-height: 56px"
      :style="{ color: page === tab.key ? 'var(--c-accent)' : 'var(--c-muted)' }"
      @click="tab.action()"
    >
      <v-icon :icon="page === tab.key ? tab.iconActive : tab.icon" size="22" />
      <span class="text-[10px] font-semibold">{{ tab.label }}</span>
    </button>
  </nav>

  <main class="main-content-mobile-pb px-5 md:px-16 pt-5 md:pt-8 min-h-screen sm:pb-0" style="background: var(--c-bg); transition: background 0.3s ease">
    <!-- RouterView renders the active page component; props are forwarded via slot -->
    <RouterView v-slot="{ Component }">
      <component
        :is="Component"
        ref="pageRef"
        :login="authenticated"
        :search-cards="cards"
        :filter-card-name="filterCardName"
        @TradeCenter="openMatches($event)"
        @requireAuth="openLogin()"
        @logout="logout"
        @clear-filter="filterCardName = ''"
      />
    </RouterView>

    <AuthDialog v-model="authDialogOpen" @authenticated="onAuthenticated" />

  </main>

  <!-- ── Footer ── -->
  <footer
    class="flex flex-wrap items-center justify-between gap-3 px-5 md:px-16 py-5 text-xs sm:pb-5"
    style="border-top: 1px solid var(--c-border); color: var(--c-muted)"
    :class="authenticated ? 'pb-20' : 'pb-5'"
  >
    <span>© {{ new Date().getFullYear() }} One for One</span>
    <nav class="flex items-center gap-4">
      <router-link to="/privacy" class="no-underline transition-opacity hover:opacity-70" style="color: var(--c-muted)">Privacy Policy</router-link>
      <a href="mailto:hello@0nefor.one" class="no-underline transition-opacity hover:opacity-70" style="color: var(--c-muted)">Contact</a>
    </nav>
  </footer>
</template>


<script>
import { searchCardByName, searchCardBySetCode, searchById } from "@/api";
import { signOut, getCurrentSession, onAuthChange } from "@/lib/supabaseClient";


  export default {
    computed: {
        isDarkTheme() {
          return this.$vuetify.theme.global.name === 'neonDusk';
        },
        /** Current page name — derived from the active route so the URL is the source of truth. */
        page() {
          return this.$route.name ?? 'search';
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
            authenticated: null,
            authDialogOpen: false,
            authUnsubscribe: null,
            _searchTimer: null,
          };
      },
      watch: {
        $route()      { this._updateMeta(); },
        searchQuery() { if (this.page === 'search') this._updateMeta(); },
        // Sync URL ?q= back into the input when the user navigates back/forward
        '$route.query.q'(q) {
          if (this.page === 'search' && q !== this.searchQuery) {
            this.searchQuery = q ?? '';
            if (q) this._doSearch(q);
            else this.cards = {};
          }
        },
      },
      methods: {
        _updateMeta(overrides = {}) {
          const BASE = 'One for One';
          const q    = this.searchQuery.trim();

          const defaults = {
            search: {
              title: q
                ? `${q} — Yu-Gi-Oh! Trading | ${BASE}`
                : `${BASE} — Yu-Gi-Oh! Card Trading`,
              desc:  q
                ? `Find traders for ${q} on One for One the free Yu-Gi-Oh! card trading platform.`
                : 'Trade Yu-Gi-Oh! cards directly with other collectors. List your trade pile, build your wishlist, and find perfect one-for-one matches near you.',
              image: 'https://0nefor.one/logo.png',
            },
            library: {
              title: `My Collection — ${BASE}`,
              desc:  'Manage your Yu-Gi-Oh! card collection, trade pile, and wishlist on One for One.',
              image: 'https://0nefor.one/logo.png',
            },
            TradeCenter: {
              title: `Trade Center — ${BASE}`,
              desc:  'Browse your trade matches, send proposals, and complete card trades on One for One.',
              image: 'https://0nefor.one/logo.png',
            },
            account: {
              title: `My Account — ${BASE}`,
              desc:  'Manage your One for One profile, location, and trade preferences.',
              image: 'https://0nefor.one/logo.png',
            },
          };

          const meta = { ...defaults[this.page] ?? defaults.search, ...overrides };

          // <title>
          document.title = meta.title;

          // <meta name="description">
          this._setMeta('name', 'description', meta.desc);

          // Open Graph
          this._setMeta('property', 'og:title',       meta.title);
          this._setMeta('property', 'og:description',  meta.desc);
          this._setMeta('property', 'og:image',        meta.image);

          // Twitter / X
          this._setMeta('name', 'twitter:title',       meta.title);
          this._setMeta('name', 'twitter:description', meta.desc);
          this._setMeta('name', 'twitter:image',       meta.image);

          // <link rel="canonical"> — reflects the real URL for this route
          const canonical = document.head.querySelector('link[rel="canonical"]');
          if (canonical) {
            canonical.setAttribute('href', `https://0nefor.one${this.$route?.fullPath ?? '/'}`);
          }
        },

        /** Upsert a <meta> tag by its attribute selector. */
        _setMeta(attr, key, value) {
          let el = document.head.querySelector(`meta[${attr}="${key}"]`);
          if (!el) {
            el = document.createElement('meta');
            el.setAttribute(attr, key);
            document.head.appendChild(el);
          }
          el.setAttribute('content', value);
        },
        update() {
          clearTimeout(this._searchTimer);
          this._searchTimer = setTimeout(() => this._doSearch(this.searchQuery), 300);
        },
        async _doSearch(query) {
          if (!query.trim()) { this.cards = {}; return; }
          try {
            const response = await searchCardByName(query);
            if (query !== this.searchQuery) return; // stale
            if (response.data?.data?.length > 0) {
              this.cards = response.data;
            } else if (response.data?.length > 0) {
              this.cards = { data: response.data };
            } else {
              const alt = await searchCardBySetCode(query);
              if (query !== this.searchQuery) return;
              if (alt?.data?.id) {
                const byId = await searchById(alt.data.id);
                if (query !== this.searchQuery) return;
                this.cards = byId.data?.data ? byId.data : { data: byId.data ?? [] };
              } else {
                this.cards = { data: [] };
              }
            }
            // Reflect the query in the URL so the link is shareable / bookmarkable
            const q = query.trim();
            if (this.$route.name === 'search' && this.$route.query.q !== q) {
              this.$router.replace({ name: 'search', query: q ? { q } : undefined });
            }
          } catch (err) {
            console.error('Search failed', err);
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
          const routeMap = { search: '/', library: '/library', TradeCenter: '/trade', account: '/account' };
          this.$router.push(routeMap[name] ?? '/');
        },
        openMatches(card = null) {
          this.filterCardName = card?.name ?? "";
          this.$router.push('/trade');
        },
        openProposals() {
          this.$router.push('/trade').then(() => {
            this.$nextTick(() => this.$refs.pageRef?.switchToProposals?.());
          });
        },
        toggleTheme() {
          const isDark = this.isDarkTheme;
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

        // Restore search query from URL on first load (e.g. shared link /?q=Dark+Magician)
        const initialQuery = this.$route.query.q;
        if (initialQuery) {
          this.searchQuery = initialQuery;
          this._doSearch(initialQuery);
        }

        this._updateMeta();
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
