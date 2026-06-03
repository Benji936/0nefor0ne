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
  { path: "privacy",   name: "privacy",     component: () => import(/* webpackChunkName: "privacy" */     "@/components/Pages/PrivacyPage.vue") },
];

export const routes = [
  // Bare root → detected locale
  { path: "/", redirect: () => `/${detectLocale()}/` },

  // Legacy paths without locale prefix → redirect to locale-prefixed equivalent
  { path: "/library",   redirect: ()   => `/${detectLocale()}/library` },
  { path: "/trade",     redirect: ()   => `/${detectLocale()}/trade`   },
  { path: "/account",   redirect: ()   => `/${detectLocale()}/account` },
  { path: "/privacy",   redirect: ()   => `/${detectLocale()}/privacy` },
  { path: "/card/:id",  redirect: (to) => `/${detectLocale()}/card/${to.params.id}` },

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

// Only instantiate the router in browser environments (SPA / dev mode).
// During vite-ssg SSR, ViteSSG creates its own router from `routes` above.
const router = typeof window !== 'undefined'
  ? createRouter({ history: createWebHistory(), routes })
  : null;

export default router;
