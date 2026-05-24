import { createRouter, createWebHistory } from "vue-router";
import Search      from "@/components/Pages/Search.vue";
import Library     from "@/components/Pages/Library.vue";
import TradeCenter from "@/components/Pages/TradeCenter.vue";
import Account     from "@/components/Pages/Account.vue";
import CardPage    from "@/components/Pages/CardPage.vue";

const routes = [
  { path: "/",           name: "search",      component: Search      },
  { path: "/library",    name: "library",     component: Library     },
  { path: "/trade",      name: "TradeCenter", component: TradeCenter },
  { path: "/account",    name: "account",     component: Account     },
  // Permalink for every card — crawlable by Google, shareable link
  { path: "/card/:id",   name: "card",        component: CardPage    },
  // Catch-all: redirect unknown paths to search
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
