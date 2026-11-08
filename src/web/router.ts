import { createRouter, createWebHistory } from "vue-router";
import { ensureSession } from "./stores/app";
import LoginView from "./views/LoginView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/today" },
    { path: "/login", component: LoginView, meta: { public: true } },
    { path: "/today", component: () => import("./views/TodayView.vue") },
    { path: "/tasks", component: () => import("./views/TasksView.vue") },
    { path: "/tasks/:id", component: () => import("./views/TaskDetailView.vue") },
    { path: "/behaviors", component: () => import("./views/BehaviorsView.vue") },
    { path: "/behaviors/:id", component: () => import("./views/BehaviorDetailView.vue") },
  ],
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  if (await ensureSession()) return true;
  return { path: "/login", query: { next: to.fullPath } };
});

export default router;
