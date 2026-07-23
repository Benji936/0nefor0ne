import { createRouter, createWebHistory } from "vue-router";
import { SUPPORTED, detectLocale, setLocale } from "@/i18n.js";
// LandingPage is eagerly loaded — it's the public home every user hits first.
// All other pages are lazy-loaded so their code is only downloaded when needed.
import LandingPage from "@/components/Pages/Public/LandingPage.vue";

// Pages shared by every locale
const localeChildren = [
  { path: "",          name: "home",        component: LandingPage },
  { path: "library",   name: "library",     component: () => import(/* webpackChunkName: "library" */     "@/components/Pages/App/Library.vue") },
  { path: 'community', name: 'community',   component: () => import(/* webpackChunkName: "community" */   '@/components/Pages/App/CommunityDirectory.vue') },
  { path: "trade",     name: "TradeCenter", component: () => import(/* webpackChunkName: "trade" */       "@/components/Pages/App/TradeCenter.vue") },
  { path: "account",   name: "account",     component: () => import(/* webpackChunkName: "account" */     "@/components/Pages/App/Account.vue") },
  { path: "card/:id",  name: "card",        component: () => import(/* webpackChunkName: "card" */        "@/components/Pages/App/CardPage.vue") },
  { path: "combo/:id", name: "combo",       component: () => import(/* webpackChunkName: "combo" */       "@/components/Pages/App/ComboExplorer.vue") },
  { path: 'set/:setSlug', name: 'set', component: () => import(/* webpackChunkName: "set" */ '@/components/Pages/App/SetPage.vue') },
  { path: "privacy",   name: "privacy",     component: () => import(/* webpackChunkName: "privacy" */     "@/components/Pages/App/PrivacyPage.vue") },
  { path: "terms",     name: "terms",       component: () => import(/* webpackChunkName: "terms" */       "@/components/Pages/App/TermsPage.vue") },
  { path: "built-with", name: "built-with", component: () => import(/* webpackChunkName: "built-with" */  "@/components/Pages/App/BuiltWithPage.vue") },
  { path: 'decks',     name: 'decks',       component: () => import(/* webpackChunkName: "decks" */        '@/components/Pages/App/DecksPage.vue') },
  { path: 'decks/:deckId', name: 'deckDetail', component: () => import(/* webpackChunkName: "deck-detail" */ '@/components/Pages/App/DeckDetailPage.vue') },
  { path: 'cards',     name: 'cards',       component: () => import(/* webpackChunkName: "cards" */         '@/components/Pages/App/CardsPage.vue') },
  { path: 'dashboard', name: 'dashboard',   component: () => import(/* webpackChunkName: "dashboard" */   '@/components/Pages/App/AppHome.vue') },
  // Discord / Supabase OAuth callback — Supabase JS picks up the token from the
  // URL hash automatically; we just need this route to exist so the SPA doesn't
  // 404. The component redirects straight to the locale home.
  { path: 'auth/callback', name: 'auth-callback', component: () => import(/* webpackChunkName: "auth-callback" */ '@/components/Pages/App/AuthCallback.vue') },
];


export const routes = [
  // Bare root → detected locale
  { path: "/", redirect: () => `/${detectLocale()}/` },

  // Legacy paths without locale prefix → redirect to locale-prefixed equivalent
  { path: "/library",   redirect: ()   => `/${detectLocale()}/library` },
  { path: '/community', redirect: () => `/${detectLocale()}/community` },
  { path: "/trade",     redirect: ()   => `/${detectLocale()}/trade`   },
  { path: "/account",   redirect: ()   => `/${detectLocale()}/account` },
  { path: "/privacy",   redirect: ()   => `/${detectLocale()}/privacy` },
  { path: "/terms",     redirect: ()   => `/${detectLocale()}/terms`   },
  { path: "/built-with", redirect: ()  => `/${detectLocale()}/built-with` },
  { path: "/decks",     redirect: ()   => `/${detectLocale()}/decks`   },
  { path: '/decks/:deckId', redirect: (to) => `/${detectLocale()}/decks/${to.params.deckId}` },
  { path: "/cards",     redirect: ()   => `/${detectLocale()}/cards`   },
  { path: "/card/:id",  redirect: (to) => `/${detectLocale()}/card/${to.params.id}` },
  { path: "/combo/:id", redirect: (to) => `/${detectLocale()}/combo/${to.params.id}` },
  { path: '/set/:setSlug', redirect: to => '/en/set/' + to.params.setSlug },

  // OAuth callback safety net: Supabase may strip the redirectTo and land on the
  // Site URL root, OR it may redirect to /auth/callback without a locale prefix.
  // Either way, we preserve the full query string + hash so the token isn't lost.
  { path: '/auth/callback', redirect: to => ({ path: '/en/auth/callback', query: to.query, hash: to.hash }) },

  // Non-English locale set URLs → redirect to English
  { path: '/:locale(fr|de|it)/set/:setSlug', redirect: to => '/en/set/' + to.params.setSlug },

  // Locale-prefixed parent — validates locale and activates it
  {
    path: "/:locale",
    beforeEnter(to, _from, next) {
      const locale = to.params.locale;
      if (!SUPPORTED.includes(locale)) return next(`/${detectLocale()}/`);
      setLocale(locale);
      next();
    },
    children: localeChildren,
  },

  // Catch-all
  { path: "/:pathMatch(.*)*", redirect: () => `/${detectLocale()}/` },
];

/** Reset scroll to the top when navigating to a different page, but:
 *  - restore the saved position on back/forward,
 *  - jump to an in-page anchor when the URL has a hash,
 *  - leave scroll untouched on same-path changes (e.g. search query/filter updates),
 *    so typing in search or toggling filters doesn't yank the page to the top. */
export function scrollBehavior(to, from, savedPosition) {
  if (savedPosition) return savedPosition;
  if (to.hash) return { el: to.hash, top: 80 };
  if (from && to.path === from.path) return false;
  return { top: 0 };
}

// Only instantiate the router in browser environments (SPA / dev mode).
// During vite-ssg SSR, ViteSSG creates its own router from `routes` above.
const router = typeof window !== 'undefined'
  ? createRouter({ history: createWebHistory(), routes, scrollBehavior })
  : null;

export default router;
