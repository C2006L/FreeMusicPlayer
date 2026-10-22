<script setup lang="ts">
import Left from './left.vue'
import Right from './right.vue'
import { useDark, useToggle } from '@vueuse/core'
import { useDateFormat, useNow } from '@vueuse/core'
import { getSongDetail } from '@/api/system'
import type { SongDetail } from '@/api/interface'
import { ref, provide } from 'vue'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { themeStore } from '@/stores/modules/theme'

const formatted = useDateFormat(useNow(), 'HH:mm:ss')
const theme = themeStore()
const showDrawer = defineModel<boolean>()
const songDetail = ref<SongDetail | null>(null)

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
const { currentTrack } = useAudioPlayer()

// 监听 currentTrack 的变化，获取歌曲详情
watch(
  () => currentTrack.value.id,
  async (newId) => {
    songDetail.value = null
    const numericId = Number(newId)
    if (newId && Number.isFinite(numericId) && numericId > 0 && !currentTrack.value.online) {
      try {
        const res = await getSongDetail(numericId)
        if (res.code === 0 && res.data) {
          // 确保返回的数据符合 SongDetail 接口
          const songData = res.data as unknown as SongDetail
          if (
            'songId' in songData &&
            'songName' in songData &&
            'artistName' in songData &&
            'album' in songData
          ) {
            songDetail.value = songData
            currentTrack.value.lyric = songData.lyric || ''
          } else {
            console.error('歌曲详情数据格式不正确')
          }
        }
      } catch (error) {
        console.error('获取歌曲详情失败:', error)
      }
    }
  },
  { immediate: true }
)

// 提供 songDetail 给子组件
provide('songDetail', songDetail)
</script>
<template>
  <el-drawer
    :style="{
      '--track-cover-url': `url(${currentTrack.cover})`,
    }"
    v-model="showDrawer"
    direction="btt"
    size="100vh"
    append-to-body
    :modal="false"
    :showClose="false"
    class="now-playing-drawer"
  >
    <template #header>
      <div class="flex items-center justify-between">
        <div
          class="flex items-center justify-center gap-2 text-primary-foreground"
        >
          <el-button text circle @click="showDrawer = false">
            <icon-uiw:down />
          </el-button>
        </div>
        <div class="flex items-center gap-1">
          <icon-meteor-icons:clock />
          <span class="text-base"> {{ formatted }} </span>
        </div>
      </div>
    </template>
    <main class="drawer-content h-full">
        <div class="player-pane">
          <Left />
        </div>
        <div class="lyrics-pane">
          <Right />
        </div>
    </main>
    <template #footer>
      <div class="flex justify-end gap-2">
        <el-switch
          v-model="theme.isDark"
          @change="toggleMode"
          active-text="暗黑模式"
        />
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.drawer-content { display:grid; grid-template-columns:minmax(420px,.9fr) minmax(440px,1.1fr); overflow:hidden; }
.player-pane,.lyrics-pane { min-width:0; min-height:0; }.player-pane { border-right:1px solid hsl(var(--border)); }
:global(.now-playing-drawer.el-drawer) { background:hsl(var(--background)); color:hsl(var(--foreground)); }
:global(.now-playing-drawer .el-drawer__header) { height:58px; margin:0; padding:0 22px; border-bottom:1px solid hsl(var(--border)); color:hsl(var(--foreground)); }
:global(.now-playing-drawer .el-drawer__body) { min-height:0; padding:0; overflow:hidden; }
:global(.now-playing-drawer .el-drawer__footer) { padding:8px 22px; border-top:1px solid hsl(var(--border)); }
@media(max-width:900px){.drawer-content{grid-template-columns:1fr}.player-pane{display:none}.lyrics-pane{height:100%}}
</style>
