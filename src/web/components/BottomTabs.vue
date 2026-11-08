<template>
  <nav class="tabs" aria-label="主导航">
    <RouterLink to="/today">今天</RouterLink>
    <RouterLink to="/tasks">作业</RouterLink>
    <RouterLink to="/behaviors">表现</RouterLink>
  </nav>
</template>

<style scoped>
.tabs { position: sticky; bottom: 0; display: flex; gap: 4px; padding: 8px 0 max(8px, env(safe-area-inset-bottom)); background: color-mix(in srgb, var(--surface) 92%, transparent); border-top: 1px solid var(--line); backdrop-filter: blur(12px); }
.tabs a { flex: 1; text-align: center; text-decoration: none; color: var(--muted); padding: 10px 6px; border-radius: 12px; }
.tabs a.router-link-active { color: var(--accent); background: var(--accent-soft); font-weight: 600; }
</style>
