<template>
  <main class="app-main flex-1 overflow-x-hidden bg-background">
    <router-view v-slot="{ Component }">
      <transition name="page-fade" mode="out-in">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </transition>
    </router-view>
  </main>
</template>

<style scoped>
/* 为悬浮 AI 入口预留空间，避免遮挡分页等底部控件 */
@media (max-width: 1023px) {
  .app-main {
    padding-bottom: 60px;
  }
}

.page-fade-enter-active {
  transition:
    opacity 0.35s cubic-bezier(0.22, 0.61, 0.36, 1),
    transform 0.35s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.page-fade-leave-active {
  transition: opacity 0.15s ease;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.page-fade-leave-to {
  opacity: 0;
}
</style>
