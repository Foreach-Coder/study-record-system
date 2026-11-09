<template>
  <nav class="tabs" aria-label="主导航">
    <RouterLink to="/today" class="tab">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24">
        <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span>今天</span>
    </RouterLink>
    <RouterLink to="/tasks" class="tab">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24">
        <rect x="4" y="3.5" width="16" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="1.8" />
        <path d="m8 12 2.4 2.4L16 9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>作业</span>
    </RouterLink>
    <RouterLink to="/behaviors" class="tab">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24">
        <path d="M12 20s-7-4.2-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8c0 5-7 9.2-7 9.2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
      </svg>
      <span>表现</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.tabs {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 20;
  display: flex;
  align-items: stretch;
  justify-content: space-around;
  min-height: var(--tab-height);
  padding: 4px max(8px, env(safe-area-inset-right)) max(4px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left));
  border-top: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(18px);
}

.tab {
  display: inline-flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 52px;
  border-radius: var(--radius-md);
  color: var(--muted);
  font-size: 11px;
  font-weight: 500;
  text-decoration: none;
  transition: color var(--duration-fast), background var(--duration-fast);
}

.tab.router-link-active {
  color: var(--primary);
}

.tab.router-link-active svg {
  filter: drop-shadow(0 2px 6px color-mix(in srgb, var(--primary) 30%, transparent));
}

.tab:active {
  background: var(--primary-soft);
}

@media (min-width: 600px) {
  .tabs {
    top: 0;
    right: auto;
    bottom: 0;
    width: var(--rail-width);
    min-height: 100dvh;
    flex-direction: column;
    justify-content: flex-start;
    gap: var(--space-2);
    padding: var(--space-5) var(--space-2);
    border-top: 0;
    border-right: 1px solid var(--line);
    background: var(--surface);
    backdrop-filter: none;
  }

  .tab {
    flex: none;
    width: 100%;
    min-height: 64px;
    border-radius: var(--radius-lg);
  }

  .tab.router-link-active {
    background: var(--primary-soft);
  }
}
</style>
