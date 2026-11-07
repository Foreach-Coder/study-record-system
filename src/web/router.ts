import { createRouter, createWebHistory } from "vue-router";
import HomePlaceholder from "./HomePlaceholder.vue";

export default createRouter({
  history: createWebHistory(),
  routes: [{ path: "/", component: HomePlaceholder }],
});
