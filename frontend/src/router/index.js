import { createRouter, createWebHistory } from "vue-router";
import { SUPPORTED, detectLocale, setLocale } from "@/i18n.js";
import Search      from "@/components/Pages/Search.vue";
import Library     from "@/components/Pages/Library.vue";
import TradeCenter from "@/components/Pages/TradeCenter.vue";
import Account     from "@/components/Pages/Account.vue";
import CardPage    from "@/components/Pages/CardPage.vue";
import PrivacyPage from "@/components/Pages/PrivacyPage.vue";

// Pages shared by every locale
const localeChildren = [
  { path: "",           name: "search",      component: Search      },
  { path: "library",   name: "library",     component: Library     },
  { path: "trade",     name: "TradeCenter", component: TradeCenter },
  { path: "account",   name: "account",     component: Account     },
  { path: "card/:id",  name: "card",        component: CardPage    },
  { path: "privacy",   name: "privacy",     component: PrivacyPage },
];

const routes = [
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

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
