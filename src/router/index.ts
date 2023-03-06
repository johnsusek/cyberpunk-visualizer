import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import CyberdocTree from "../components/CyberdocTree.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomeView
    },
    {
      path: "/class/:name+",
      name: "class",
      component: CyberdocTree,
      props: true
    }
  ]
});

export default router;
