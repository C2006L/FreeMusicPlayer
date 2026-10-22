<script setup lang="ts">
const visible = ref(true)
onMounted(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.setTimeout(() => { visible.value = false }, reduceMotion ? 150 : 950)
})
</script>

<template>
  <div v-if="visible" class="splash-screen">
    <div class="flex flex-col items-center">
      <img src="/logo.svg" alt="logo" class="splash-logo w-16 h-16" />
      <h1 class="splash-title">FreeMusicPlayer</h1>
      <p class="splash-tagline">LISTEN ON YOUR TERMS</p>
    </div>
  </div>
</template>

<style scoped>
/* 全屏开场页：Logo + 标题渐显上浮，1.1s 时整体淡出 */
.splash-screen {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #0e0f12;
  pointer-events: none;
  animation: splash-out 0.3s cubic-bezier(0.22, 0.61, 0.36, 1) 0.65s forwards;
}

.splash-logo {
  animation: splash-rise 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) 0.1s both;
}

.splash-title {
  margin-top: 20px;
  font-size: 44px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #f2eee8;
  animation: splash-rise 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) 0.3s both;
}

.splash-tagline {
  margin-top: 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.35em;
  color: var(--primary);
  animation: splash-rise 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) 0.5s both;
}

@keyframes splash-rise {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes splash-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
    visibility: hidden;
  }
}

@media (prefers-reduced-motion: reduce) {
  .splash-screen,
  .splash-logo,
  .splash-title,
  .splash-tagline {
    animation-duration: 0.01s;
    animation-delay: 0s;
  }
}
</style>
