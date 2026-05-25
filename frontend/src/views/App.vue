<script setup>
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter, useRoute } from "vue-router";
import AuthDialog from "@/components/AuthDialog.vue";
import NavItem from "@/components/NavItem.vue";
import NotificationBell from "@/components/NotificationBell.vue";
import UserMenuChip from "@/components/UserMenuChip.vue";
import { setLocale, SUPPORTED } from "@/i18n.js";

const { locale } = useI18n();
const router = useRouter();
const route  = useRoute();
const langMenuOpen = ref(false);

const LANG_LABELS = { en: "English", fr: "Français", de: "Deutsch", it: "Italiano" };

function switchLang(lang) {
  setLocale(lang);
  // Swap the locale segment in the current URL so the address bar stays in sync
  const currentLocale = route.params.locale || "en";
  const newPath = route.path.replace(
    new RegExp(`^/${currentLocale}(/|$)`),
    `/${lang}$1`
  );
  router.replace(newPath);
  langMenuOpen.value = false;
}
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
        :placeholder="$t('nav.searchPlaceholder')"
        type="text"
        name="search"
        inputmode="search"
      />
    </div>
  </div>

    <div class="flex items-center gap-1">
      <div v-if="authenticated" class="flex max-md:hidden items-center gap-1">
        <NavItem
          :tooltip="$t('nav.collection')"
          icon="mdi-cards"
          img-src="/src/assets/library.svg"
          :active="page === 'library'"
          @click="changePage('library')"
        />
        <NavItem
          :tooltip="$t('nav.tradeMatches')"
          icon="mdi-swap-horizontal-bold"
          :active="page === 'TradeCenter'"
          @click="openMatches()"
        />
      </div>

      <NavItem
        :tooltip="isDarkTheme ? $t('nav.lightMode') : $t('nav.darkMode')"
        :icon="isDarkTheme ? 'mdi-white-balance-sunny' : 'mdi-moon-waning-crescent'"
        :indicator="false"
        @click="toggleTheme"
      />

      <NotificationBell
        v-if="authenticated"
        :login="authenticated"
        @navigate="openProposals"
      />

      <!-- ── Language switcher ── -->
      <div class="relative">
        <button
          class="flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer transition-opacity hover:opacity-70 select-none"
          :title="$t('language.label')"
          @click.stop="langMenuOpen = !langMenuOpen"
        >
          <span class="text-xs font-bold tracking-wide uppercase" style="color: var(--c-muted)">{{ locale }}</span>
          <v-icon icon="mdi-chevron-down" size="13" :class="{ 'rotate-180': langMenuOpen }" class="transition-transform duration-200" style="color: var(--c-muted)" />
        </button>

        <div
          v-if="langMenuOpen"
          class="absolute right-0 top-full mt-1 flex flex-col rounded-xl overflow-hidden min-w-[140px]"
          style="background: var(--c-surface); border: 1px solid var(--c-border); box-shadow: 0 8px 32px rgba(0,0,0,0.28); z-index: 9999"
        >
          <button
            v-for="lang in SUPPORTED"
            :key="lang"
            class="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer text-left"
            :style="locale === lang
              ? { background: 'color-mix(in srgb, var(--c-accent) 10%, transparent)', color: 'var(--c-accent)', fontWeight: 700 }
              : { color: 'var(--c-text)' }"
            :class="locale !== lang ? 'hover:opacity-70' : ''"
            @click.stop="switchLang(lang)"
          >
            <span class="text-xs font-bold uppercase w-6" style="color: var(--c-muted)">{{ lang }}</span>
            <span>{{ LANG_LABELS[lang] }}</span>
          </button>
        </div>
      </div>

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
        :tooltip="$t('nav.loginSignup')"
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

  <!-- Click-outside overlay for lang menu (z-20 so it doesn't block the sticky nav at z-30) -->
  <div
    v-if="langMenuOpen"
    class="fixed inset-0 z-20"
    @click="langMenuOpen = false"
  />

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
      <router-link to="/privacy" class="no-underline transition-opacity hover:opacity-70" style="color: var(--c-muted)">{{ $t('footer.privacy') }}</router-link>
      <a href="mailto:hello@0nefor.one" class="no-underline transition-opacity hover:opacity-70" style="color: var(--c-muted)">{{ $t('footer.contact') }}</a>
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
            { key: 'search',      label: this.$t('nav.search'),  icon: 'mdi-magnify',                iconActive: 'mdi-magnify',                action: () => this.changePage('search') },
            { key: 'library',     label: this.$t('nav.library'), icon: 'mdi-cards-outline',           iconActive: 'mdi-cards',                  action: () => this.changePage('library') },
            { key: 'TradeCenter', label: this.$t('nav.trades'),  icon: 'mdi-swap-horizontal',         iconActive: 'mdi-swap-horizontal-bold',   action: () => this.openMatches() },
            { key: 'account',     label: this.$t('nav.account'), icon: 'mdi-account-circle-outline',  iconActive: 'mdi-account-circle',         action: () => this.changePage('account') },
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
          const q      = this.searchQuery.trim();
          const locale = this.$route.params.locale || 'en';
          const OG_LOCALES = { en: 'en_US', fr: 'fr_FR', de: 'de_DE', it: 'it_IT' };
          const IMAGE = 'https://0nefor.one/logo.png';

          const defaults = {
            search: {
              title: q ? this.$t('meta.search.titleWithQuery', { query: q }) : this.$t('meta.search.title'),
              desc:  q ? this.$t('meta.search.descWithQuery',  { query: q }) : this.$t('meta.search.desc'),
              image: IMAGE,
            },
            library: {
              title: this.$t('meta.library.title'),
              desc:  this.$t('meta.library.desc'),
              image: IMAGE,
            },
            TradeCenter: {
              title: this.$t('meta.trade.title'),
              desc:  this.$t('meta.trade.desc'),
              image: IMAGE,
            },
            account: {
              title: this.$t('meta.account.title'),
              desc:  this.$t('meta.account.desc'),
              image: IMAGE,
            },
            card: {
              title: this.$t('meta.card.title'),
              desc:  this.$t('meta.card.desc'),
              image: IMAGE,
            },
            privacy: {
              title: this.$t('meta.privacy.title'),
              desc:  this.$t('meta.privacy.desc'),
              image: IMAGE,
            },
          };

          const meta = { ...defaults[this.page] ?? defaults.search, ...overrides };

          document.title = meta.title;
          this._setMeta('name',     'description',      meta.desc);
          this._setMeta('property', 'og:title',         meta.title);
          this._setMeta('property', 'og:description',   meta.desc);
          this._setMeta('property', 'og:image',         meta.image);
          this._setMeta('property', 'og:locale',        OG_LOCALES[locale] || 'en_US');
          this._setMeta('name',     'twitter:title',       meta.title);
          this._setMeta('name',     'twitter:description', meta.desc);
          this._setMeta('name',     'twitter:image',       meta.image);

          // Canonical
          const canonical = document.head.querySelector('link[rel="canonical"]');
          if (canonical) canonical.setAttribute('href', `https://0nefor.one${this.$route?.fullPath ?? '/'}`);

          // hreflang — one tag per supported locale + x-default
          this._updateHreflang(locale);
        },

        _updateHreflang(currentLocale) {
          const SUPPORTED = ['en', 'fr', 'de', 'it'];
          const path = this.$route.path; // e.g. /fr/trade

          SUPPORTED.forEach(lang => {
            const localePath = path.replace(new RegExp(`^/${currentLocale}(/|$)`), `/${lang}$1`);
            let el = document.head.querySelector(`link[rel="alternate"][hreflang="${lang}"]`);
            if (!el) {
              el = document.createElement('link');
              el.setAttribute('rel', 'alternate');
              el.setAttribute('hreflang', lang);
              document.head.appendChild(el);
            }
            el.setAttribute('href', `https://0nefor.one${localePath}`);
          });

          // x-default points to the English version
          const enPath = path.replace(new RegExp(`^/${currentLocale}(/|$)`), `/en$1`);
          let xDefault = document.head.querySelector('link[rel="alternate"][hreflang="x-default"]');
          if (!xDefault) {
            xDefault = document.createElement('link');
            xDefault.setAttribute('rel', 'alternate');
            xDefault.setAttribute('hreflang', 'x-default');
            document.head.appendChild(xDefault);
          }
          xDefault.setAttribute('href', `https://0nefor.one${enPath}`);
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
          const lc = this.$route.params.locale || 'en';
          const pathMap = { search: `/${lc}/`, library: `/${lc}/library`, TradeCenter: `/${lc}/trade`, account: `/${lc}/account` };
          this.$router.push(pathMap[name] ?? `/${lc}/`);
        },
        openMatches(card = null) {
          this.filterCardName = card?.name ?? "";
          const lc = this.$route.params.locale || 'en';
          this.$router.push(`/${lc}/trade`);
        },
        openProposals() {
          const lc = this.$route.params.locale || 'en';
          this.$router.push(`/${lc}/trade`).then(() => {
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
