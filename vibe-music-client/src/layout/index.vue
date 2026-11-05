<script setup lang="ts">
import Header from './components/header/index.vue'
import Aside from './components/aside/index.vue'
import Main from './components/main/index.vue'
import Footer from './components/footer/index.vue'
// import BG from './components/bg/index.vue'
import AgentChat from '@/components/Agent/AgentChat.vue'
import { AudioPlayer } from '@/hooks/useAudioPlayer'

provide('audioPlayer', AudioPlayer())
const mobileNavOpen = ref(false)
</script>
<template>
  <!-- <BG /> -->
  <SplashScreen />
  <div class="absolute w-full flex flex-col h-full">
    <div class="w-full flex flex-col h-full overflow-hidden bg-background">
      <Header v-model:mobile-nav="mobileNavOpen" />
      <div class="flex flex-1 overflow-hidden">
        <Aside />
        <Main />
      </div>
      <Footer />
    </div>
    <!-- 手机/平板的导航抽屉 -->
    <el-drawer
      v-model="mobileNavOpen"
      direction="ltr"
      size="min(82vw, 300px)"
      :with-header="false"
      append-to-body
      class="app-nav-drawer"
    >
      <Aside mobile @navigate="mobileNavOpen = false" />
    </el-drawer>
    <!-- 全局悬浮的 FreeMusic Assistant 聊天窗 -->
    <AgentChat />
  </div>
</template>

<style scoped>
:global(.app-nav-drawer .el-drawer__body) { padding: 0; overflow: hidden; }
</style>
