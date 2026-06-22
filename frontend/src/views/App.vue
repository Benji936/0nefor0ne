<script setup>
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter, useRoute } from "vue-router";
import { useHead } from "@unhead/vue";
import AuthDialog from "@/components/AuthDialog.vue";
import NavItem from "@/components/NavItem.vue";
import SideNav from "@/components/SideNav.vue";
import NotificationBell from "@/components/NotificationBell.vue";
import UserMenuChip from "@/components/UserMenuChip.vue";
import TcgPlayerAd from "@/components/TcgPlayerAd.vue";
import CardHoverPreview from "@/components/CardHoverPreview.vue";
import { setLocale, SUPPORTED } from "@/i18n.js";

const { t, locale } = useI18n();
const router = useRouter();
const route  = useRoute();
const langMenuOpen = ref(false);

// ── Navbar search: navigation-only (KD-2). The navbar never instantiates
// useCardSearch and never fetches; it routes to /:locale/cards?q=… and the
// dedicated CardsPage owns all search state + fetching (the sole async writer).
const navQuery = ref("");

function goToCards() {
  // Refining the text query must NOT drop active filters. When already on /cards,
  // merge `q` into the existing query (filters/sort/density preserved); when
  // arriving from another page there are no filters to keep, so start clean.
  const query = route.name === "cards" ? { ...route.query } : {};
  if (navQuery.value) query.q = navQuery.value;
  else delete query.q;
  router.push({
    name: "cards",
    params: { locale: route.params.locale || "en" },
    query,
  });
}

// Focusing the navbar search expresses navigate-to-cards intent: jump to the
// dedicated page if we're not already there (don't clobber existing query).
function focusSearch() {
  if (route.name !== "cards") {
    router.push({ name: "cards", params: { locale: route.params.locale || "en" } });
  }
}

// ── SEO head: reactive, SSR-rendered via @unhead/vue ──
const pageName = computed(() => route.name);
const seoQuery = computed(() => route.query?.q ?? "");
const localeVal = computed(() => route.params?.locale || "en");

useHead(
  computed(() => {
    const page = pageName.value;
    const q = seoQuery.value;
    const loc = localeVal.value;
    const path = route.path;
    const BASE = "https://0nefor.one";
    const IMAGE = `${BASE}/logo.png`;
    const OG_LOCALES = { en: "en_US", fr: "fr_FR", de: "de_DE", it: "it_IT" };

    const isSearch = page === "search" || !page;
    const title = isSearch && q
      ? t("meta.search.titleWithQuery", { query: q }, { locale: loc })
      : t(`meta.${page || "search"}.title`, {}, { missingWarn: false, locale: loc }) || t("meta.search.title", {}, { locale: loc });
    const desc = isSearch && q
      ? t("meta.search.descWithQuery", { query: q }, { locale: loc })
      : t(`meta.${page || "search"}.desc`, {}, { missingWarn: false, locale: loc }) || t("meta.search.desc", {}, { locale: loc });

    const canonical = `${BASE}${path}`;

    // Card pages (/xx/card/:id) are English-only; emit en + x-default only.
    const isCardPage = /^\/[a-z]{2}\/card\//.test(path);
    const enPath = path.replace(new RegExp(`^/${loc}(/|$)`), `/en$1`);
    const hreflangLinks = [];
    if (!isCardPage) {
      for (const lang of SUPPORTED) {
        const localePath = path.replace(new RegExp(`^/${loc}(/|$)`), `/${lang}$1`);
        hreflangLinks.push({ rel: "alternate", hreflang: lang, href: `${BASE}${localePath}` });
      }
    } else {
      hreflangLinks.push({ rel: "alternate", hreflang: "en", href: `${BASE}${enPath}` });
    }
    hreflangLinks.push({ rel: "alternate", hreflang: "x-default", href: `${BASE}${enPath}` });

    return {
      title,
      htmlAttrs: { lang: loc },
      meta: [
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:image", content: IMAGE },
        { property: "og:url", content: canonical },
        { property: "og:locale", content: OG_LOCALES[loc] || "en_US" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: IMAGE },
        { "http-equiv": "content-language", content: loc },
      ],
      link: [
        { rel: "canonical", href: canonical },
        ...hreflangLinks,
      ],
    };
  })
);

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
  <!-- ── Collapsible side rail (desktop ≥ sm) — primary navigation ── -->
  <SideNav
    v-model:collapsed="railCollapsed"
    :authenticated="authenticated"
    :page="page"
    @navigate="changePage"
    @matches="openMatches()"
  />

  <!-- App shell: everything to the right of the rail, shifted by its width. -->
  <div class="app-shell" :style="{ '--rail-w': railCollapsed ? '64px' : '210px' }">
  <!-- ── Top navbar ── -->
  <nav
    class="flex flex-row py-2 px-3 md:py-3 md:px-5 gap-2 md:gap-6 shadow-xs items-center justify-between sticky top-0 z-30"
    style="background: var(--c-nav); border-bottom: 1px solid var(--c-border); transition: background 0.3s ease"
  >

    <!-- Search — the core action, kept prominent at the top. -->
    <div
      class="flex flex-1 min-w-0 max-w-md md:max-w-lg rounded-lg my-1 has-[input:focus-within]:outline-2"
      style="background: var(--c-surface-2); outline-color: var(--c-accent)"
    >
      <input
        v-model="navQuery"
        @focus="focusSearch"
        @keyup.enter="goToCards"
        class="placeholder:opacity-50 outline-none bg-transparent w-full"
        style="color: var(--c-text); font-size: 16px; font-weight: 500; padding: 10px 14px; letter-spacing: 0.01em;"
        :placeholder="$t('nav.searchPlaceholder')"
        type="text"
        name="search"
        inputmode="search"
      />
    </div>

    <div class="flex items-center gap-1">
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
    <!-- RouterView renders the active page component; props are forwarded via slot 
     <TcgPlayerAd :ad-id="3913674" :width="1940" :height="500" />-->
    <RouterView v-slot="{ Component }">
      <component
        :is="Component"
        ref="pageRef"
        :login="authenticated"
        :filter-card-name="filterCardName"
        @TradeCenter="openMatches($event)"
        @requireAuth="openLogin()"
        @logout="logout"
        @clear-filter="filterCardName = ''"
      />
    </RouterView>

    <AuthDialog v-model="authDialogOpen" @authenticated="onAuthenticated" />

  </main>

  <!-- ── TCGPlayer skyscraper — fixed right sidebar, desktop only (disabled) ── -->
  <div
    v-if="false"
    class="max-xl:hidden flex fixed right-4 top-1/2 -translate-y-1/2 z-20 flex-col items-center"
    style="pointer-events: none"
  >
    <div style="pointer-events: auto">
      <TcgPlayerAd :ad-id="3913676" :width="240" :height="1200" />
    </div>
  </div> 

  <!-- ── Footer ── -->
  <footer
    class="flex flex-wrap items-center justify-between gap-3 px-5 md:px-16 py-5 text-xs sm:pb-5"
    style="border-top: 1px solid var(--c-border); color: var(--c-muted)"
    :class="authenticated ? 'pb-20' : 'pb-5'"
  >
    <span>© {{ new Date().getFullYear() }} One for One</span>
    <nav class="flex items-center gap-4">
      <router-link :to="`/${$route.params.locale || 'en'}/privacy`" class="no-underline transition-opacity hover:opacity-70" style="color: var(--c-muted)">{{ $t('footer.privacy') }}</router-link>
      <a href="mailto:hello@0nefor.one" class="no-underline transition-opacity hover:opacity-70" style="color: var(--c-muted)">{{ $t('footer.contact') }}</a>
    </nav>
  </footer>
  </div>
  <!-- /app-shell -->

  <!-- Floating rich preview on card-thumbnail hover (client-only, self-installing) -->
  <CardHoverPreview />
</template>


<script>
import { signOut, getCurrentSession, onAuthChange } from "@/lib/supabaseClient";

// Search state, the single async writer, and the URL serialization helpers now
// live in @/composables/useCardSearch.js and are owned exclusively by
// CardsPage.vue (KD-1/KD-2). App.vue is navbar/shell only — it does not search.

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
          // NOTE: 5 tabs on mobile — if layout requires exactly 4, consider removing one or grouping.
          return [
            { key: 'search',      label: this.$t('cards.nav'),   icon: 'mdi-magnify',                iconActive: 'mdi-magnify',                action: () => this.changePage('cards') },
            { key: 'library',     label: this.$t('nav.library'), icon: 'mdi-cards-outline',           iconActive: 'mdi-cards',                  action: () => this.changePage('library') },
            { key: 'decks',       label: this.$t('nav.decks'),   icon: 'mdi-cards-variant',           iconActive: 'mdi-cards-variant',          action: () => this.changePage('decks') },
            { key: 'TradeCenter', label: this.$t('nav.trades'),  icon: 'mdi-swap-horizontal',         iconActive: 'mdi-swap-horizontal-bold',   action: () => this.openMatches() },
            { key: 'account',     label: this.$t('nav.account'), icon: 'mdi-account-circle-outline',  iconActive: 'mdi-account-circle',         action: () => this.changePage('account') },
          ];
        },
      },
      data() {
          return {
            filterCardName: "",
            authenticated: null,
            authDialogOpen: false,
            authUnsubscribe: null,
            // Side-rail pinned/collapsed state — restored from localStorage in mounted().
            railCollapsed: false,
          };
      },
      watch: {
        railCollapsed(val) {
          if (typeof localStorage !== "undefined") {
            localStorage.setItem("railCollapsed", val ? "true" : "false");
          }
        },
      },
      methods: {
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
          if (["library", "TradeCenter", "account", "decks"].includes(this.page)) {
            this.page = "search";
          }
        },

        changePage(name) {
          const lc = this.$route.params.locale || 'en';
          const pathMap = { search: `/${lc}/`, library: `/${lc}/library`, decks: `/${lc}/decks`, TradeCenter: `/${lc}/trade`, account: `/${lc}/account`, cards: `/${lc}/cards` };
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
          if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', !isDark);
          localStorage.setItem('theme', isDark ? 'light' : 'dark');
        },
      },
      async mounted() {
        if (typeof document === 'undefined') return;
        // Init theme from localStorage
        const saved = localStorage.getItem('theme') || 'dark';
        const isDark = saved !== 'light';
        this.$vuetify.theme.global.name = isDark ? 'neonDusk' : 'neonDuskLight';
        document.documentElement.classList.toggle('dark', isDark);

        // Restore the side-rail pinned state (default: expanded).
        this.railCollapsed = localStorage.getItem('railCollapsed') === 'true';

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
/* Shift the whole app right of the rail (desktop only — phones have no rail). */
@media (min-width: 640px) {
  .app-shell {
    margin-left: var(--rail-w, 64px);
    transition: margin-left 0.18s ease;
  }
}
@media (min-width: 640px) and (prefers-reduced-motion: reduce) {
  .app-shell { transition: none; }
}
</style>
