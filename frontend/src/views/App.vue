<script setup>
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter, useRoute } from "vue-router";
import { useHead } from "@unhead/vue";
import AuthDialog from "@/components/dialogs/AuthDialog.vue";
import VerifyPhoneDialog from "@/components/dialogs/VerifyPhoneDialog.vue";
import { usePhoneGate } from "@/lib/phoneGate";
import NavItem from "@/components/nav/NavItem.vue";
import SideNav from "@/components/nav/SideNav.vue";
import NotificationBell from "@/components/nav/NotificationBell.vue";
import UserMenuChip from "@/components/nav/UserMenuChip.vue";
import TcgPlayerAd from "@/components/ads/TcgPlayerAd.vue";
import CardHoverPreview from "@/components/ui/card/CardHoverPreview.vue";
import { persistLocale, SUPPORTED } from "@/i18n.js";

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

    // vue-i18n returns the key itself when a message is missing, and a key is
    // a truthy string, so `t(...) || fallback` never reached its fallback: any
    // route without a meta entry put the literal "meta.TradeCenter.title" in
    // the browser tab and the <title> tag. Compare against the key instead.
    const meta = (key, fallbackKey) => {
      const res = t(key, {}, { missingWarn: false, fallbackWarn: false, locale: loc });
      return res === key ? t(fallbackKey, {}, { locale: loc }) : res;
    };

    const isSearch = page === "search" || !page;
    const title = isSearch && q
      ? t("meta.search.titleWithQuery", { query: q }, { locale: loc })
      : meta(`meta.${page || "search"}.title`, "meta.search.title");
    const desc = isSearch && q
      ? t("meta.search.descWithQuery", { query: q }, { locale: loc })
      : meta(`meta.${page || "search"}.desc`, "meta.search.desc");

    // The policy pages exist at all four locale URLs and each resolves to
    // itself, but only their chrome is translated — the legal text is English
    // everywhere on purpose, because machine-translating a GDPR notice would be
    // publishing binding statements nobody here can read. Declaring the four as
    // translations of each other therefore describes four near-identical pages,
    // which Google resolves by keeping one and dropping the rest, and a cluster
    // of thin locale duplicates is a site-wide quality signal rather than a
    // per-page one. Pointing every locale at the English original says the same
    // thing deliberately, and costs nothing: nobody searches for a privacy
    // policy. Unlike isEnglishOnly below there is no redirect involved, so the
    // canonical has to do the work the 301 does there.
    const isEnglishBody = /^\/[a-z]{2}\/(privacy|terms)$/.test(path);

    // English-only page types: card, set and archetype. All three name things
    // that exist only in English, and router/index.js 301s their /fr, /de and
    // /it URLs to /en. Only card pages were listed here, so set pages have been
    // advertising three hreflang alternates that redirect — and a hreflang
    // target that does not resolve to itself gets the whole cluster discarded,
    // taking the valid en and x-default entries with it. Archetype pages are
    // the same shape, hence the widened test rather than a third special case.
    const isEnglishOnly = /^\/[a-z]{2}\/(card|set|archetype)\//.test(path);
    const enPath = path.replace(new RegExp(`^/${loc}(/|$)`), `/en$1`);
    const canonical = `${BASE}${isEnglishBody ? enPath : path}`;
    const hreflangLinks = [];
    if (isEnglishBody) {
      hreflangLinks.push({ rel: "alternate", hreflang: "en", href: `${BASE}${enPath}` });
    } else if (!isEnglishOnly) {
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

// One instance for the whole app. Any trade surface that gets refused for want
// of a confirmed number opens this via handleIfPhoneRequired, rather than each
// of them owning a copy of the dialog and its open state.
const { promptOpen: phonePromptOpen, promptReason: phonePromptReason } = usePhoneGate();

const LANG_LABELS = { en: "English", fr: "Français", de: "Deutsch", it: "Italiano" };

function switchLang(lang) {
  // `locale` here is this app's own instance, injected by useI18n — the router
  // hook in main.js sets the same ref again when the replace below lands, which
  // is idempotent. Doing it here too means the switch still works if the URL
  // has no locale segment to rewrite.
  locale.value = lang;
  persistLocale(lang);
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
    v-if="!chromeless"
    v-model:collapsed="railCollapsed"
    :authenticated="authenticated"
    :page="page"
    :active-trade-tab="activeTradeTab"
    @navigate="changePage"
    @matches="openMatches()"
    @tradeTab="openTradeTab"
  />

  <!-- App shell: everything to the right of the rail, shifted by its width. -->
  <div class="app-shell" :style="{ '--rail-w': chromeless ? '0px' : (railCollapsed ? '64px' : '210px') }">
  <!-- ── Top navbar ── -->
  <nav
    v-if="!chromeless"
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
    v-if="authenticated && !chromeless"
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
    v-if="langMenuOpen && !chromeless"
    class="fixed inset-0 z-20"
    @click="langMenuOpen = false"
  />

  <main :class="mainClass" style="background: var(--c-bg); transition: background 0.3s ease">
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


  </div>
  <!-- /app-shell -->

  <!-- Verify-your-number prompt. Outside the shell so it is reachable from
       every route, including the chromeless ones. -->
  <VerifyPhoneDialog v-model="phonePromptOpen" :reason="phonePromptReason" />

  <!-- Floating rich preview on card-thumbnail hover (client-only, self-installing) -->
  <CardHoverPreview />
</template>


<script>
import { signOut, getCurrentSession, onAuthChange } from "@/lib/supabaseClient";
import { startPathIfNeeded, divertsFrom } from "@/lib/onboarding";

// Search state, the single async writer, and the URL serialization helpers now
// live in @/composables/useCardSearch.js and are owned exclusively by
// CardsPage.vue (KD-1/KD-2). App.vue is navbar/shell only — it does not search.

// Which routes may divert into the first run lives in @/lib/onboarding, with
// the rest of the decisions this flow makes — and with the tests that keep a
// later route from being added to it by accident.

  export default {
    computed: {
        isDarkTheme() {
          return this.$vuetify.theme.global.name === 'neonDusk';
        },
        /** Current page name — derived from the active route so the URL is the source of truth. */
        page() {
          return this.$route.name ?? 'search';
        },
        /** Routes that own the whole viewport: no rail, no navbar, no bottom tab
         *  bar, no shell padding. The landing page is a marketing site, and the
         *  first run is one decision at a time — surrounding either with app
         *  chrome invites people to leave before they have anything to leave to. */
        chromeless() {
          return ['home', 'start'].includes(this.page);
        },
        /** The shell's own padding, which /start replaces with its own. */
        mainClass() {
          if (this.page === 'start') return ['min-h-screen'];
          return [
            'main-content-mobile-pb pt-5 md:pt-8 min-h-screen sm:pb-0',
            this.page === 'dashboard' ? 'dashboard-compact-horizontal' : 'px-5 md:px-16',
          ];
        },
        /** Active Trade Center sub-tab, for SideNav's highlight. From the route
         *  for the same reason as `page`: it used to be mirrored in local state
         *  here and in the page, and two copies of one fact drift. */
        activeTradeTab() {
          return this.$route.params.tab ?? 'matches';
        },
        mobileTabs() {
          // Collection and Decks moved to the user menu, same as on the rail.
          return [
            { key: 'search',      label: this.$t('cards.nav'),   icon: 'mdi-magnify',                iconActive: 'mdi-magnify',                action: () => this.changePage('cards') },
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
        async onAuthenticated(session) {
          // Called by AuthDialog after a successful sign in / sign up.
          this.authenticated = session;

          // A fresh account has nothing in either pile, so every surface it
          // could land on is empty. Send it to the first run instead.
          //
          // Checked on sign-in too, not just sign-up: a signup that needed
          // email confirmation comes back through the sign-in branch days
          // later, and that person is every bit as new. startPathIfNeeded
          // answers null for anyone who already has cards or has skipped.
          // Redirected from wherever they happened to be, unlike the load-time
          // check below: signing in is an explicit "take me into the app" and
          // carries no page the person was already reading.
          await this.divertToOnboarding({ anywhere: true });
        },

        /**
         * Send an account with an empty pile to the first run.
         *
         * Shared by sign-in and by opening the app. `startPathIfNeeded` answers
         * null for anybody who already has cards, who has skipped, or whose
         * collection could not be read — so this is a no-op for everyone the
         * flow is not for.
         *
         * @param {{anywhere?: boolean}} opts `anywhere` ignores the route
         *   allowlist, for the case where the person just asked to come in.
         */
        async divertToOnboarding({ anywhere = false } = {}) {
          const uid = this.authenticated?.user?.id;
          if (!uid) return;
          if (!anywhere && !divertsFrom(this.page)) return;

          const locale = this.$route.params.locale || 'en';
          const start = await startPathIfNeeded(
            uid,
            locale,
            typeof localStorage !== 'undefined' ? localStorage : null,
          );
          if (!start || this.$route.path === start) return;

          // replace, not push: the page being left was empty, and leaving it on
          // the stack only gives Back somewhere useless to return to.
          this.$router.replace(start);
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
          const pathMap = {
            dashboard: `/${lc}/dashboard`,
            search: `/${lc}/`,
            library: `/${lc}/library`,
            decks: `/${lc}/decks`,
            TradeCenter: `/${lc}/trade/matches`,
            // Not a route name — the user menu's shortcut straight to the tab.
            proposals: `/${lc}/trade/proposals`,
            account: `/${lc}/account`,
            cards: `/${lc}/cards`,
            simulator: `/${lc}/simulator`,
          };
          this.$router.push(pathMap[name] ?? `/${lc}/`);
        },
        // The tab is in the URL now, so opening one is just navigating to it —
        // no reaching into the page's instance after the route settles.
        openMatches(card = null) {
          this.filterCardName = card?.name ?? "";
          this.openTradeTab('matches');
        },
        openTradeTab(tab) {
          const lc = this.$route.params.locale || 'en';
          this.$router.push(`/${lc}/trade/${tab}`);
        },
        openProposals() { this.openTradeTab('proposals'); },
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

        // Existing accounts get the first run too, not only fresh signups.
        // Someone who registered months ago and never filled a pile is looking
        // at exactly the same empty app as someone who registered today, and
        // they never pass back through the auth callback to be caught there.
        //
        // Waits for the router so `page` is the real destination rather than
        // whatever the initial navigation had resolved to so far.
        await this.$router.isReady();
        await this.divertToOnboarding();

        // Stay in sync if the token refreshes or the user signs in/out from
        // another tab. Deliberately no onboarding check here: this fires on
        // every token refresh, and a redirect on a timer would yank people out
        // of whatever they were doing.
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
.dashboard-compact-horizontal {
  padding-left: 0.75rem;
  padding-right: 0.75rem;
}
@media (min-width: 768px) {
  .dashboard-compact-horizontal {
    padding-left: 1rem;
    padding-right: 1rem;
  }
}
@media (min-width: 640px) and (prefers-reduced-motion: reduce) {
  .app-shell { transition: none; }
}
</style>
