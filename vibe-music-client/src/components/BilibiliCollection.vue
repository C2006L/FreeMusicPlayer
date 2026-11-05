<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { AudioStore } from '@/stores/modules/audio'
import { getBilibiliCollection } from '@/api/system'
import type { Song } from '@/api/interface'
import { songToTrack } from '@/utils/songTrack'
import { bilibiliBvid, insertCollection, collectionEntryTitle } from '@/utils/collections'
import { formatTime } from '@/utils'

const audio = AudioStore()
const { currentTrack, play, setPlayMode } = useAudioPlayer()
const bvid = computed(() => bilibiliBvid(currentTrack.value))
const visible = ref(false)
const loading = ref(false)
const starting = ref(false)
const error = ref('')
const songs = ref<Song[]>([])
const targetId = ref('')
let generation = 0
let controller: AbortController | undefined
const open = async () => {
  controller?.abort()
  controller = new AbortController()
  const request = ++generation
  targetId.value = currentTrack.value.id
  visible.value = true
  songs.value = []
  error.value = ''
  loading.value = true
  try {
    const result = await getBilibiliCollection(bvid.value, controller.signal)
    if (request !== generation) return
    if (result.code !== 0 || !Array.isArray(result.data) || !result.data.length) throw new Error(result.message || '目录为空')
    songs.value = result.data as Song[]
  } catch (reason: any) {
    if (request === generation && reason?.code !== 'ERR_CANCELED') error.value = reason?.message || '无法获取合集目录'
  } finally { if (request === generation) loading.value = false }
}
const playCollection = async (start = 0) => {
  if (starting.value || targetId.value !== currentTrack.value.id || !songs.value.length) return
  starting.value = true
  try {
    const tracks = songs.value.map((song, index) => ({ ...songToTrack(song), title: collectionEntryTitle(song.songName), collectionId: bvid.value, collectionIndex: index + 1, collectionSize: songs.value.length }))
    const inserted = insertCollection(audio.trackList, audio.currentSongIndex, tracks)
    audio.setAudioStore('trackList', inserted.tracks)
    audio.setAudioStore('currentSongIndex', inserted.index + start)
    setPlayMode('order')
    visible.value = false
    await play()
  } catch (reason: any) { ElMessage.error(reason?.message || '无法播放合集') }
  finally { starting.value = false }
}
const playCurrent = async () => {
  if (targetId.value !== currentTrack.value.id) return
  visible.value = false
  await play()
}
watch(() => currentTrack.value.id, () => { generation++; controller?.abort(); visible.value = false; songs.value = []; loading.value = false })
watch(visible, value => { if (!value) { generation++; controller?.abort() } })
onUnmounted(() => { generation++; controller?.abort() })
</script>

<template>
  <button v-if="bvid" class="collection-trigger" aria-label="查看 B 站合集目录" @click.stop="open">B站合集</button>
  <el-dialog v-model="visible" title="B 站分 P / 合集目录" width="min(680px, 94vw)" append-to-body :close-on-click-modal="false">
    <p class="mb-4 text-xs text-muted-foreground">按平台原目录排列，不按标题猜测拆曲。整合集会插入当前位置并切换为顺序播放，其他队列歌曲保留。</p>
    <div v-if="loading" role="status" class="py-8 text-center">正在获取真实目录…</div>
    <div v-else-if="error" role="alert" class="py-6 text-center"><p>{{ error }}</p><button class="mt-3 text-primary" @click="open">重新获取</button></div>
    <template v-else>
      <p class="mb-3 text-sm">{{ songs.length > 1 ? `共 ${songs.length} 个条目` : '源站仅返回 1 个条目：可能是单视频长合集，不会按标题拆曲。' }}</p>
      <ol class="collection-directory" aria-label="合集目录">
        <li v-for="(song, index) in songs" :key="song.songId">
          <button :disabled="starting" :aria-label="`从第 ${index + 1} 项顺序播放 ${song.songName}`" @click="playCollection(index)">
            <span class="tabular-nums text-muted-foreground">{{ index + 1 }}</span><span class="min-w-0 truncate" :title="song.songName">{{ collectionEntryTitle(song.songName) }}</span><span class="text-xs text-muted-foreground">{{ Number(song.duration) ? formatTime(Number(song.duration)) : '--:--' }}</span>
          </button>
        </li>
      </ol>
    </template>
    <template #footer>
      <el-button :disabled="loading || starting" @click="playCurrent">只播当前条目</el-button>
      <el-button type="primary" :disabled="loading || !!error || !songs.length || starting" @click="playCollection(0)">播放整个合集</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.collection-trigger{flex:none;border:1px solid hsl(var(--border));border-radius:5px;padding:4px 7px;font-size:11px;color:var(--primary)}
.collection-trigger:hover{background:hsl(var(--muted))}.collection-trigger:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.collection-directory{max-height:50vh;overflow-y:auto}.collection-directory button{display:grid;width:100%;grid-template-columns:28px minmax(0,1fr) 42px;gap:10px;align-items:center;text-align:left;padding:11px 6px;border-bottom:1px solid hsl(var(--border))}.collection-directory button:hover{background:hsl(var(--muted))}.collection-directory button:focus-visible{outline:2px solid var(--primary);outline-offset:-2px}
</style>
