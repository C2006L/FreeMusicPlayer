<script setup lang="ts">
import type { PropType } from 'vue'
import type { Song } from '@/api/interface'
import defaultAlbum from '@/assets/default_album.jpg'
import { formatTime } from '@/utils'
import { cancelCollectSong, collectSong, importOnlineSong, probeOnlineSong } from '@/api/system'
import { ElMessage } from 'element-plus'
import { UserStore } from '@/stores/modules/user'
import { useFavoriteStore } from '@/stores/modules/favorite'
import { songToTrack } from '@/utils/songTrack'
import { usePlaybackEvidence } from '@/stores/modules/playbackEvidence'
import { evidenceLabel } from '@/utils/playbackPolicy'
import { availabilityKey, probeAvailabilityOnDemand, rememberGrade, rememberedGrade } from '@/utils/availabilityProbe'
import { resolveResourceUrl } from '@/utils/apiBase'

const props = defineProps({
  data: { type: Array as PropType<Song[]>, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  emptyText: { type: String, default: '这里还没有歌曲' },
})
const emit = defineEmits<{ retry: [] }>()
const audio = AudioStore()
const favoriteStore = useFavoriteStore()
const evidence = usePlaybackEvidence()
const probeGrades = ref<Record<string, string>>({})
const gradeOf = (song: Song) => probeGrades.value[availabilityKey(song)] ?? rememberedGrade(song) ?? song.availability
const statusLabel = (song: Song) => {
  const observed = evidence.get(song)
  if (observed !== 'unknown') return evidenceLabel(observed)
  const availability = gradeOf(song)
  if (availability === 'unavailable') return '暂不可播'
  if (availability === 'preview') return '试听片段'
  if (song.vip || availability === 'restricted') return '权益待验证'
  if (availability === 'full') return '已验证完整'
  return song.online || song.source ? '完整性未知' : ''
}
// 紧凑布局下用色点 + 短文案，保持状态可辨且不占宽。
const statusShort = (song: Song) => {
  const label = statusLabel(song)
  if (label === '已验证完整') return '完整'
  if (label === '试听片段') return '试听'
  if (label === '暂不可播') return '不可播'
  if (label === '权益待验证') return '待验证'
  if (label === '完整性未知') return '未知'
  return label
}
const statusTone = (song: Song) => {
  const label = statusLabel(song)
  if (label === '已验证完整') return 'is-full'
  if (label === '试听片段') return 'is-preview'
  if (label === '暂不可播') return 'is-unavailable'
  if (label === '权益待验证') return 'is-restricted'
  if (label === '完整性未知') return 'is-unknown'
  return ''
}
// 悬停或聚焦时才探测该条，替代搜索时批量预探，避免拖慢搜索与浪费上游请求。
const requestProbe = (song: Song) => {
  if (!song.online && (!song.source || song.source === 'local')) return
  const availability = gradeOf(song)
  if (availability && availability !== 'unknown') return
  const key = availabilityKey(song)
  probeAvailabilityOnDemand(
    song,
    async () => {
      const result = await probeOnlineSong(song)
      if (result.code !== 0 || !result.data) return null
      return String(result.data) as 'full' | 'preview' | 'unavailable' | 'restricted'
    },
    (grade) => { probeGrades.value[key] = grade; rememberGrade(song, grade) }
  )
}
const userStore = UserStore()
const { play, isPlaying, isBuffering } = useAudioPlayer()
const selectedId = ref<string | null>(null)
const handleCoverError = (event: Event) => {
  const image = event.target as HTMLImageElement
  // 单次失败（代理超时/502）不永久锁定占位图：同一地址自动重试一次，
  // 仍失败才回退默认封面；地址变化后会重新尝试。
  if (image.src === defaultAlbum || image.src.includes('coverRetry=1')) { image.src = defaultAlbum; return }
  const original = image.src
  window.setTimeout(() => { image.src = `${original}${original.includes('?') ? '&' : '?'}coverRetry=1` }, 1500)
}
const coverOf = (song: Song) => resolveResourceUrl(song.coverUrl) || defaultAlbum

watch(() => props.data, (songs) => audio.setCurrentPageSongs(songs), { immediate: true })

const songKey = (song: Song) => String(song.sourceSongId ? `${song.source || 'online'}:${song.sourceSongId}` : song.songId)
const convertToTrack = songToTrack

const handlePlay = async (song: Song) => {
  const tracks = props.data.map(convertToTrack).filter((track) => Boolean(track.url))
  const index = tracks.findIndex((track) => track.id === String(song.songId))
  if (index < 0) return ElMessage.warning('当前歌曲暂时没有可用播放地址')
  audio.setAudioStore('trackList', tracks)
  audio.setAudioStore('currentSongIndex', index)
  await play()
}

const updateLikeState = (song: Song, id: number | string, status: number) => {
  song.songId = id
  song.likeStatus = status
  audio.trackList.forEach((track) => {
    if (track.id === String(id) || (track.sourceSongId && track.sourceSongId === song.sourceSongId && track.source === song.source)) track.likeStatus = status
  })
}

const handleLike = async (song: Song) => {
  if (!userStore.isLoggedIn) return ElMessage.warning('登录后才能收藏歌曲')
  try {
    const wasLiked = Boolean(song.likeStatus)
    if (wasLiked) {
      // 已收藏的在线歌曲同样按 songId 取消，不能再走“在线登记 + 收藏”，否则心形永远取消不掉
      const id = Number(song.songId)
      if (!Number.isFinite(id)) throw new Error('歌曲标识无效')
      const response = await cancelCollectSong(id)
      if (response.code !== 0) throw new Error(response.message || '操作失败')
      updateLikeState(song, id, 0)
      favoriteStore.refreshLikeCount()
      return ElMessage.success('已取消喜欢')
    }
    let id = Number(song.songId)
    if (song.online) {
      const imported = await importOnlineSong({
        source: song.source, sourceSongId: song.sourceSongId, sourceUrlId: song.sourceUrlId,
        sourcePicId: song.sourcePicId, songName: song.songName, artistName: song.artistName,
        sourceExtra: song.sourceExtra, providerEngine: song.providerEngine,
        album: song.album, duration: Number(song.duration) || 0,
      })
      if (imported.code !== 0 || typeof imported.data !== 'number') throw new Error(imported.message || '在线歌曲登记失败')
      id = imported.data
      song.online = false
    }
    if (!Number.isFinite(id)) throw new Error('歌曲标识无效')
    const response = await collectSong(id)
    if (response.code !== 0) throw new Error(response.message || '收藏失败')
    updateLikeState(song, id, 1)
    favoriteStore.refreshLikeCount()
    ElMessage.success('已添加到我的喜欢')
  } catch (error: any) {
    ElMessage.error(error?.message || '操作失败')
  }
}

const downloadSong = (song: Song) => {
  if (!song.audioUrl) return ElMessage.warning('当前歌曲没有可用下载地址')
  const link = document.createElement('a')
  link.href = song.audioUrl
  link.download = `${song.songName} - ${song.artistName}`
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

const isCurrent = (song: Song) => {
  const track = audio.trackList[audio.currentSongIndex]
  return Boolean(track && (track.id === String(song.songId) || (track.sourceSongId && track.sourceSongId === song.sourceSongId && track.source === song.source)))
}
</script>

<template>
  <section class="song-list" aria-label="歌曲列表">
    <div class="song-list__header" aria-hidden="true"><span>歌曲</span><span>专辑</span><span>时长</span><span /></div>
    <div v-if="loading" class="space-y-1 py-2" aria-label="正在加载歌曲">
      <div v-for="index in 8" :key="index" class="song-skeleton">
        <span class="h-11 w-11 animate-pulse rounded-md bg-muted" />
        <span class="space-y-2"><i class="block h-3 w-40 animate-pulse rounded bg-muted" /><i class="block h-2.5 w-24 animate-pulse rounded bg-muted" /></span>
      </div>
    </div>
    <div v-else-if="error" class="song-state" role="alert">
      <icon-tabler:cloud-off class="text-3xl text-muted-foreground" /><h3>歌曲加载失败</h3><p>{{ error }}</p>
      <button class="state-action" @click="emit('retry')">重新加载</button>
    </div>
    <div v-else-if="!data.length" class="song-state">
      <icon-tabler:music-off class="text-3xl text-muted-foreground" /><h3>{{ emptyText }}</h3><p>试试搜索其他关键词，或检查在线音源状态。</p>
    </div>
    <div v-else class="song-list__body">
      <article v-for="song in data" :key="songKey(song)" class="song-row group"
        :class="{ 'is-current': isCurrent(song), 'is-selected': selectedId === songKey(song) }" tabindex="0"
        :aria-current="isCurrent(song) ? 'true' : undefined" @click="selectedId = songKey(song); requestProbe(song)"
        @mouseenter="requestProbe(song)" @focusin="requestProbe(song)"
        @dblclick="handlePlay(song)" @keydown.enter="handlePlay(song)">
        <div class="song-primary">
          <span class="playing-rail" aria-hidden="true" />
          <button class="cover-button" :aria-label="`播放 ${song.songName}`" @click.stop="handlePlay(song)">
            <img :src="coverOf(song)" :alt="`${song.songName} 封面`" loading="lazy" @error="handleCoverError" />
            <span class="cover-overlay">
              <span v-if="isCurrent(song) && isBuffering" class="cover-spinner" aria-hidden="true" />
              <PlayingIndicator v-else-if="isCurrent(song)" :paused="!isPlaying" />
              <icon-tabler:player-play-filled v-else class="cover-play-icon" />
            </span>
          </button>
          <div class="min-w-0">
            <div class="song-title-line">
              <strong class="truncate text-sm font-medium" :title="song.songName">{{ song.songName }}</strong>
              <span v-if="song.online || song.source" class="source-badge">{{ song.sourceName || song.source }}</span>
              <span v-if="statusLabel(song)" class="availability-badge" :class="statusTone(song)" :title="statusLabel(song) === '完整性未知' ? '完整性未知不等于播放失败；没有标称时长或尚未播完时无法确认整曲。记录在本次页面内15分钟有效。' : undefined"><i class="status-dot" aria-hidden="true" /><span class="status-full">{{ statusLabel(song) }}</span><span class="status-short">{{ statusShort(song) }}</span></span>
            </div>
            <span class="song-subline">
              <span class="song-artist truncate" :title="song.artistName">{{ song.artistName || '未知歌手' }}</span>
              <span class="song-inline-duration tabular-nums">{{ Number(song.duration) > 0 ? formatTime(Number(song.duration)) : '--:--' }}</span>
            </span>
          </div>
        </div>
        <span class="song-album truncate" :title="song.album">{{ song.album || '未知专辑' }}</span>
        <span class="song-duration tabular-nums">{{ Number(song.duration) > 0 ? formatTime(Number(song.duration)) : '--:--' }}</span>
        <div class="song-actions">
          <button class="row-action favorite-action" :class="{ 'is-liked': song.likeStatus }" :aria-label="song.likeStatus ? '取消收藏' : '收藏歌曲'" @click.stop="handleLike(song)"><icon-mdi:heart v-if="song.likeStatus" /><icon-mdi:heart-outline v-else /></button>
          <button class="row-action secondary-action" aria-label="下载歌曲" @click.stop="downloadSong(song)"><icon-tabler:download /></button>
          <button class="row-action secondary-action" aria-label="更多操作"><icon-tabler:dots /></button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.song-list { width: 100%; min-width: 0; }
.song-list__header,.song-row { display:grid; grid-template-columns:minmax(260px,2fr) minmax(140px,1fr) 64px 116px; align-items:center; gap:18px; }
.song-list__header { min-height:34px; padding:0 12px; border-bottom:1px solid hsl(var(--border)); color:hsl(var(--muted-foreground)); font-size:10px; font-weight:600; letter-spacing:.12em; }
.song-list__body { padding-block:4px; }
.song-row { position:relative; min-height:60px; padding:6px 10px 6px 12px; border-bottom:1px solid hsl(var(--border)/.56); transition:background .15s ease; }
.song-row:hover,.song-row:focus-visible,.song-row.is-selected { background:hsl(var(--muted)/.54); }
.song-row.is-current { background:rgb(239 111 82 / .07); }
.playing-rail { position:absolute; left:0; width:2px; height:28px; border-radius:2px; background:transparent; }
.is-current .playing-rail { background:var(--primary); }
.song-primary { display:grid; min-width:0; grid-template-columns:44px minmax(0,1fr); align-items:center; gap:12px; }
.cover-button { position:relative; width:44px; height:44px; overflow:hidden; border-radius:6px; background:hsl(var(--muted)); transition:transform .18s cubic-bezier(.22,.61,.36,1),box-shadow .18s ease; }
.cover-button:hover { transform:scale(1.04); box-shadow:0 4px 12px rgb(0 0 0/.18); }
.cover-button:active { transform:scale(.95); transition-duration:.09s; }
.cover-button img { width:100%; height:100%; object-fit:cover; }
.cover-overlay { position:absolute; inset:0; display:grid; place-items:center; color:white; background:rgb(0 0 0/.48); opacity:0; transition:opacity .15s ease,background .15s ease; }
.cover-play-icon { transition:transform .2s cubic-bezier(.22,.61,.36,1); }
.cover-button:hover .cover-play-icon { transform:scale(1.12); }
.cover-spinner { width:16px; height:16px; border:2px solid rgb(255 255 255/.28); border-top-color:#fff; border-radius:50%; animation:cover-spin .75s linear infinite; }
@keyframes cover-spin { to { transform:rotate(360deg); } }
.song-row:hover .cover-overlay,.song-row:focus-within .cover-overlay,.is-current .cover-overlay { opacity:1; }
.song-album,.song-duration { min-width:0; color:hsl(var(--muted-foreground)); font-size:12px; }
.song-actions { display:flex; justify-content:flex-end; gap:2px; }
.row-action { display:grid; width:32px; height:32px; place-items:center; border-radius:6px; color:hsl(var(--muted-foreground)); transition:color .15s ease,background .15s ease,opacity .15s ease; }
.row-action:hover { color:hsl(var(--foreground)); background:hsl(var(--muted)); }
.favorite-action.is-liked { color:var(--primary); }.secondary-action { opacity:0; }.song-row:hover .secondary-action,.song-row:focus-within .secondary-action { opacity:1; }
.source-badge { flex:none; border:1px solid hsl(var(--border)); border-radius:4px; padding:1px 5px; color:hsl(var(--muted-foreground)); font-size:9px; font-weight:500; }
.availability-badge { flex:none; border-radius:4px; padding:1px 5px; background:rgb(239 111 82/.1); color:var(--primary); font-size:9px; }.availability-badge.is-unavailable{background:hsl(var(--muted));color:hsl(var(--muted-foreground));}
.song-state { display:grid; min-height:260px; place-items:center; align-content:center; gap:8px; color:hsl(var(--muted-foreground)); text-align:center; }
.song-state h3 { color:hsl(var(--foreground)); font-size:15px; font-weight:600; }.song-state p { max-width:380px; font-size:12px; }
.state-action { margin-top:8px; border:1px solid hsl(var(--border)); border-radius:6px; padding:7px 14px; color:hsl(var(--foreground)); font-size:12px; }
.song-skeleton { display:grid; min-height:60px; grid-template-columns:44px 1fr; align-items:center; gap:12px; padding-inline:12px; border-bottom:1px solid hsl(var(--border)/.45); }
.song-title-line { display:flex; min-width:0; align-items:center; gap:6px; }
.song-title-line strong { min-width:0; }
.song-subline { display:flex; min-width:0; align-items:baseline; gap:8px; color:hsl(var(--muted-foreground)); font-size:12px; }
.song-artist { min-width:0; }
.song-inline-duration,.status-dot,.status-short { display:none; }
.availability-badge.is-unknown { color:hsl(var(--muted-foreground));background:hsl(var(--muted)/.5); }
@media(max-width:840px){.song-list__header,.song-row{grid-template-columns:minmax(220px,1fr) 54px 108px}.song-album,.song-list__header span:nth-child(2){display:none}}
@media(max-width:767px){
  .song-list__header{display:none}
  .song-row{display:flex;min-height:56px;gap:8px;padding:5px 4px}
  .song-row:active{background:hsl(var(--muted)/.54)}
  .song-primary{flex:1 1 auto;grid-template-columns:44px minmax(0,1fr);gap:9px}
  .song-album,.song-duration{display:none}
  .song-actions{flex:none;gap:0}
  .row-action{width:44px;height:44px}
  .secondary-action{opacity:1}
  .song-actions .secondary-action[aria-label="更多操作"]{display:none}
  .song-row .song-title-line{flex-wrap:nowrap;gap:5px}
  .song-row .song-title-line strong{flex:1 1 auto;min-width:0}
  .song-row .source-badge,.song-row .availability-badge{flex:none}
  .song-row .availability-badge{display:inline-flex;align-items:center;gap:3px;padding:1px 4px;line-height:14px}
  .status-full{display:none}
  .status-short{display:inline}
  .status-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor}
  .availability-badge.is-full{color:#2f8f67;background:rgb(47 143 103/.12)}
  .availability-badge.is-preview{color:#b8741a;background:rgb(184 116 26/.14)}
  .availability-badge.is-restricted{color:#bf551d;background:rgb(191 85 29/.12)}
  .availability-badge.is-unavailable{color:hsl(var(--muted-foreground));background:hsl(var(--muted))}
  .availability-badge.is-unknown{color:hsl(var(--muted-foreground));background:hsl(var(--muted)/.5)}
  .song-subline{font-size:11px;line-height:14px;margin-top:1px;gap:6px}
  .song-inline-duration{display:inline;flex:none;font-size:11px;color:hsl(var(--muted-foreground))}
  .song-row .cover-overlay{opacity:0}
  .is-current .cover-overlay{opacity:1}
}
@media(max-width:560px){.song-list__header{display:none}.song-row{grid-template-columns:minmax(0,1fr) 90px;gap:8px}.song-duration{display:none}}
</style>
