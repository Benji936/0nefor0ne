import { createRouter, createWebHistory } from "vue-router";
import Home from "../views/App.vue";
import Cards from "../views/Cards.vue";


const routes = [
    { path: "/", name: "Home", component: Home },
    { path: "/cards", name: "My Cards", component: Cards},
];


const router = createRouter({
    history: createWebHistory(),
    routes,
});

export default router;