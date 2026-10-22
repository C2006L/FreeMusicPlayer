<script lang="ts" setup>
import { getConfig } from "@/config";

const TITLE = getConfig("Title");
</script>

<template>
  <footer
    class="layout-footer text-[rgba(0,0,0,0.6)] dark:text-[rgba(220,220,242,0.8)]"
  >
    <span>FreeMusicPlayer · 本地音乐管理控制台</span>
    <span class="footer-title">{{ TITLE }}</span>
  </footer>
</template>

<style lang="scss" scoped>
.layout-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0 0 8px;
  font-size: 14px;
}

.footer-title {
  margin-left: 12px;
  color: var(--fmp-accent);
}
</style>
