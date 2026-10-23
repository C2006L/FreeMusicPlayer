<script setup lang="ts">
import type { PropType } from 'vue'
import type { Song } from '@/api/interface'
import defaultAlbum from '@/assets/default_album.jpg'
import { formatTime } from '@/utils'
import { cancelCollectSong, collectSong, importOnlineSong } from '@/api/system'
import { ElMessage } from 'element-plus'
import { UserStore } from '@/stores/modules/user'
import { songToTrack } from '@/utils/songTrack'

const props = defineProps({
  data: { type: Array as PropType<Song[]>, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  emptyText: { type: String, default: '这里还没有歌曲' },
})
const emit = defineEmits<{ retry: [] }>()
const audio = AudioStore()
const userStore = UserStore()
const { loadTrack, play, isPlaying } = useAudioPlayer()
const selectedId = ref<string | null>(null)
const handleCoverError = (event: Event) => {
  const image = event.target as HTMLImageElement
  if (image.src !== defaultAlbum) image.src = defaultAlbum
}

watch(() => props.data, (songs) => audio.setCurrentPageSongs(songs), { immediate: true })

const songKey = (song: Song) => String(song.sourceSongId ? `${song.source || 'online'}:${song.sourceSongId}` : song.songId)
const convertToTrack = songToTrack

const handlePlay = async (song: Song) => {
  const tracks = props.data.map(convertToTrack).filter((track) => Boolean(track.url))
  const index = tracks.findIndex((track) => track.id === String(song.songId))
  if (index < 0) return ElMessage.warning('当前歌曲暂时没有可用播放地址')
  audio.setAudioStore('trackList', tracks)
  audio.setAudioStore('currentSongIndex', index)
  await loadTrack()
  await play()
}

const updateLikeState = (song: Song, id: number | string, status: number) => {
  song.songId = id
  song.likeStatus = status
  audio.trackList.forEach((track) => {
    if (track.id === String(id) || track.sourceSongId === song.sourceSongId) track.likeStatus = status
  })
}

const handleLike = async (song: Song) => {
  if (!userStore.isLoggedIn) return ElMessage.warning('登录后才能收藏歌曲')
  try {
    if (song.online) {
      const imported = await importOnlineSong({
        source: song.source, sourceSongId: song.sourceSongId, sourceUrlId: song.sourceUrlId,
        sourcePicId: song.sourcePicId, songName: song.songName, artistName: song.artistName,
        sourceExtra: song.sourceExtra, providerEngine: song.providerEngine,
        album: song.album, duration: Number(song.duration) || 0,
      })
      if (imported.code !== 0 || typeof imported.data !== 'number') throw new Error(imported.message || '在线歌曲登记失败')
      const collected = await collectSong(imported.data)
      if (collected.code !== 0) throw new Error(collected.message || '收藏失败')
      song.online = false
      updateLikeState(song, imported.data, 1)
      return ElMessage.success('已添加到我的喜欢')
    }
    const id = Number(song.songId)
    if (!Number.isFinite(id)) throw new Error('歌曲标识无效')
    const wasLiked = Boolean(song.likeStatus)
    const response = wasLiked ? await cancelCollectSong(id) : await collectSong(id)
    if (response.code !== 0) throw new Error(response.message || '操作失败')
    updateLikeState(song, id, wasLiked ? 0 : 1)
    ElMessage.success(wasLiked ? '已取消喜欢' : '已添加到我的喜欢')
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
  return Boolean(track && (track.id === String(song.songId) || (track.sourceSongId && track.sourceSongId === song.sourceSongId)))
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
        :aria-current="isCurrent(song) ? 'true' : undefined" @click="selectedId = songKey(song)"
        @dblclick="handlePlay(song)" @keydown.enter="handlePlay(song)">
        <div class="song-primary">
          <span class="playing-rail" aria-hidden="true" />
          <button class="cover-button" :aria-label="`播放 ${song.songName}`" @click.stop="handlePlay(song)">
            <img :src="song.coverUrl || defaultAlbum" :alt="`${song.songName} 封面`" loading="lazy" @error="handleCoverError" />
            <span class="cover-overlay"><PlayingIndicator v-if="isCurrent(song)" :paused="!isPlaying" /><icon-tabler:player-play-filled v-else /></span>
          </button>
          <div class="min-w-0">
            <div class="flex min-w-0 items-center gap-2"><strong class="truncate text-sm font-medium" :title="song.songName">{{ song.songName }}</strong><span v-if="song.online" class="source-badge">{{ song.sourceName || song.source }}</span><span v-if="song.availability === 'restricted' || song.vip" class="availability-badge">可能需会员</span><span v-else-if="song.availability === 'unavailable'" class="availability-badge is-unavailable">暂不可播</span></div>
            <span class="block truncate text-xs text-muted-foreground" :title="song.artistName">{{ song.artistName || '未知歌手' }}</span>
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
.cover-button { position:relative; width:44px; height:44px; overflow:hidden; border-radius:6px; background:hsl(var(--muted)); }
.cover-button img { width:100%; height:100%; object-fit:cover; }
.cover-overlay { position:absolute; inset:0; display:grid; place-items:center; color:white; background:rgb(0 0 0/.48); opacity:0; transition:opacity .15s ease; }
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
@media(max-width:840px){.song-list__header,.song-row{grid-template-columns:minmax(220px,1fr) 54px 108px}.song-album,.song-list__header span:nth-child(2){display:none}}
@media(max-width:560px){.song-list__header{display:none}.song-row{grid-template-columns:minmax(0,1fr) 90px;gap:8px}.song-duration{display:none}}
</style>
