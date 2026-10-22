<script setup lang="ts">
import { Icon } from '@iconify/vue'
import Avatar from './components/avatar.vue'
const route = useRoute()
const router = useRouter()
const currentIcon = ref('material-symbols:wb-sunny-outline-rounded')
const theme = themeStore()
import { useDark, useToggle } from '@vueuse/core'

const searchText = ref('')

const isDark = useDark({
  selector: 'html',
  attribute: 'class',
  valueDark: 'dark',
  valueLight: 'light',
})
const toggleDark = useToggle(isDark)

const toggleMode = () => {
  theme.setDark(!isDark.value)
  toggleDark()
}

// 初始化时根据 store 设置图标
watch(
  () => theme.isDark,
  (newValue) => {
    currentIcon.value = newValue
      ? 'mdi:weather-night'
      : 'material-symbols:wb-sunny-outline-rounded'
  },
  { immediate: true }
)

// 赋值到搜索框
watch(
  () => route.query,
  (newValue) => {
    if (newValue.query) {
      searchText.value = newValue.query as string
    }
  },
  { immediate: true }
)
</script>
<template>
  <header class="app-header flex items-center border-b border-border px-4">
    <button
      class="brand-button group flex items-center"
      @click="router.push('/')"
    >
      <img
        src="\logo.svg"
        alt="logo"
        class="h-8 w-8"
      />
      <span
        class="brand-name ml-2.5 text-lg font-semibold tracking-tight"
        >FreeMusicPlayer</span
      >
    </button>
    <!-- 输入框和头像 -->
    <div class="header-tools flex min-w-0 flex-1 items-center gap-3">
      <div class="search-shell relative w-full max-w-xl">
        <Icon
          icon="mdi:magnify"
          class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground text-lg pointer-events-none"
        />
        <input
          v-model="searchText"
          type="text"
          class="h-10 w-full rounded-lg border border-border bg-muted/45 py-2 pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground hover:border-border/80 focus:border-primary/60 focus:bg-muted/70"
          placeholder="搜索歌曲、歌手或专辑"
          @keyup.enter="router.push('/library?query=' + searchText)"
        />
      </div>
      <button
        class="icon-button"
        aria-label="切换深浅色主题"
        @click="toggleMode"
      >
        <Icon class="text-xl" :icon="currentIcon" />
      </button>
    </div>
    <div class="ml-3 flex items-center gap-3"><Avatar /></div>
  </header>
</template>

<style scoped>
.app-header { min-height: var(--app-header-height); background: hsl(var(--background) / .96); }
.brand-button { width: calc(var(--app-sidebar-width) - 16px); flex: 0 0 auto; }
.icon-button { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 8px; color: hsl(var(--muted-foreground)); transition: color .15s ease, background .15s ease; }
.icon-button:hover { color: hsl(var(--foreground)); background: hsl(var(--muted) / .7); }
@media (max-width: 960px) { .brand-name { display: none; } .brand-button { width: 60px; justify-content: center; } }
@media (max-width: 640px) { .app-header { padding-inline: 10px; } .brand-button { width: 42px; } .search-shell { max-width: none; } }
</style>
