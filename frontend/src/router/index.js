import { createRouter, createWebHistory } from "vue-router";
import { SUPPORTED, detectLocale, setLocale } from "@/i18n.js";
// Search is eagerly loaded — it's the landing page every user hits first.
// All other pages are lazy-loaded so their code is only downloaded when needed.
import Search from "@/components/Pages/Search.vue";

// Pages shared by every locale
const localeChildren = [
  { path: "",          name: "search",      component: Search },
  { path: "library",   name: "library",     component: () => import(/* webpackChunkName: "library" */     "@/components/Pages/Library.vue") },
  { path: "trade",     name: "TradeCenter", component: () => import(/* webpackChunkName: "trade" */       "@/components/Pages/TradeCenter.vue") },
  { path: "account",   name: "account",     component: () => import(/* webpackChunkName: "account" */     "@/components/Pages/Account.vue") },
  { path: "card/:id",  name: "card",        component: () => import(/* webpackChunkName: "card" */        "@/components/Pages/CardPage.vue") },
  { path: "combo/:id", name: "combo",       component: () => import(/* webpackChunkName: "combo" */       "@/components/Pages/ComboExplorer.vue") },
  { path: 'set/:setSlug', name: 'set', component: () => import(/* webpackChunkName: "set" */ '@/components/Pages/SetPage.vue') },
  { path: "privacy",   name: "privacy",     component: () => import(/* webpackChunkName: "privacy" */     "@/components/Pages/PrivacyPage.vue") },
  { path: 'decks',     name: 'decks',       component: () => import(/* webpackChunkName: "decks" */        '@/components/Pages/DecksPage.vue') },
  { path: 'decks/:deckId', name: 'deckDetail', component: () => import(/* webpackChunkName: "deck-detail" */ '@/components/Pages/DeckDetailPage.vue') },
  { path: 'cards',     name: 'cards',       component: () => import(/* webpackChunkName: "cards" */         '@/components/Pages/CardsPage.vue') },
];

export const routes = [
  // Bare root → detected locale
  { path: "/", redirect: () => `/${detectLocale()}/` },

  // Legacy paths without locale prefix → redirect to locale-prefixed equivalent
  { path: "/library",   redirect: ()   => `/${detectLocale()}/library` },
  { path: "/trade",     redirect: ()   => `/${detectLocale()}/trade`   },
  { path: "/account",   redirect: ()   => `/${detectLocale()}/account` },
  { path: "/privacy",   redirect: ()   => `/${detectLocale()}/privacy` },
  { path: "/decks",     redirect: ()   => `/${detectLocale()}/decks`   },
  { path: '/decks/:deckId', redirect: (to) => `/${detectLocale()}/decks/${to.params.deckId}` },
  { path: "/cards",     redirect: ()   => `/${detectLocale()}/cards`   },
  { path: "/card/:id",  redirect: (to) => `/${detectLocale()}/card/${to.params.id}` },
  { path: "/combo/:id", redirect: (to) => `/${detectLocale()}/combo/${to.params.id}` },
  { path: '/set/:setSlug', redirect: to => '/en/set/' + to.params.setSlug },

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
