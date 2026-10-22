<script setup lang="ts">
import Left from './components/left.vue'
import Center from './components/center.vue'
import Right from './components/right.vue'
</script>
<template>
  <footer class="player-shell relative z-20 grid items-center border-t border-border">
    <!-- 左边：歌曲封面和歌曲名称 -->
    <Left />
    <!-- 中间：控制区 -->
    <Center />
    <!-- 右边：历史播放和音量 -->
    <Right />
  </footer>
</template>

<style scoped>
.player-shell {
  min-height: var(--app-player-height);
  grid-template-columns: minmax(190px, 26%) minmax(320px, 1fr) minmax(190px, 26%);
  background: hsl(var(--background) / .98);
  backdrop-filter: blur(14px);
}
@media (max-width: 900px) { .player-shell { grid-template-columns: 180px minmax(260px, 1fr) auto; } }
@media (max-width: 680px) { .player-shell { grid-template-columns: 1fr auto; padding-inline: 8px; } .player-shell :deep(.player-tools) { display: none; } }
</style>
