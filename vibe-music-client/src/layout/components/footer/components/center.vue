<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { formatTime } from '@/utils'
import { UserStore } from '@/stores/modules/user'
import { AudioStore } from '@/stores/modules/audio'
import { collectSong, cancelCollectSong, importOnlineSong } from '@/api/system'
import { ElMessage } from 'element-plus'
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useLibraryStore } from '@/stores/modules/library'
import { useArtistStore } from '@/stores/modules/artist'
import { usePlaylistStore } from '@/stores/modules/playlist'

const userStore = UserStore()
const audioStore = AudioStore()
const route = useRoute()
const libraryStore = useLibraryStore()

const {
  isPlaying,
  currentTime,
  duration,
  currentTrack,
  seekingTime,
  isSeeking,
  nextTrack,
  prevTrack,
  togglePlayPause,
  seek,
  startSeeking,
  previewSeek,
} = useAudioPlayer()

// 获取当前播放歌曲的喜欢状态
const currentSongLikeStatus = computed(() => {
  const currentTrack = audioStore.trackList[audioStore.currentSongIndex]
  return currentTrack?.likeStatus || 0
})

// 更新所有相同歌曲的喜欢状态
const updateAllSongLikeStatus = (songId: number, status: number) => {
  // 更新播放列表中的状态
  audioStore.trackList.forEach((track) => {
    if (Number(track.id) === songId) {
      track.likeStatus = status
    }
  })

  // 更新当前页面的歌曲列表状态
  if (audioStore.currentPageSongs) {
    audioStore.currentPageSongs.forEach((song) => {
      if (song.songId === songId) {
        song.likeStatus = status
      }
    })
  }

  // 更新曲库页面的数据
  if (route.path === '/library' && libraryStore.tableData?.items) {
    const song = libraryStore.tableData.items.find(
      (song) => song.songId === songId
    )
    if (song) {
      song.likeStatus = status
    }
  }

  // 更新歌手详情页的数据
  if (route.path.startsWith('/artist/')) {
    const artistStore = useArtistStore()
    if (artistStore.artistInfo?.songs) {
      const song = artistStore.artistInfo.songs.find(
        (song) => song.songId === songId
      )
      if (song) {
        song.likeStatus = status
      }
    }
  }

  // 更新歌单详情页的数据
  if (route.path.startsWith('/playlist/')) {
    const playlistStore = usePlaylistStore()
    if (playlistStore.songs) {
      const song = playlistStore.songs.find((song) => song.songId === songId)
      if (song) {
        song.likeStatus = status
      }
    }
  }
}

// 处理喜欢/取消喜欢
const handleLike = async () => {
  if (!userStore.isLoggedIn) {
    ElMessage.warning('请先登录')
    return
  }

  const currentTrack = audioStore.trackList[audioStore.currentSongIndex]
  if (!currentTrack) return

  try {
    let songId = Number(currentTrack.id)
    if (currentTrack.online) {
      const imported = await importOnlineSong({
        source: currentTrack.source,
        sourceSongId: currentTrack.sourceSongId,
        sourceUrlId: currentTrack.sourceUrlId,
        sourcePicId: currentTrack.sourcePicId,
        songName: currentTrack.title,
        artistName: currentTrack.artist,
        album: currentTrack.album,
        duration: Number(currentTrack.duration) || 0,
      })
      if (imported.code !== 0 || typeof imported.data !== 'number') {
        ElMessage.error(imported.message || '在线歌曲登记失败')
        return
      }
      songId = imported.data
      currentTrack.id = String(songId)
      currentTrack.online = false
    }
    if (!Number.isFinite(songId)) {
      ElMessage.error('歌曲标识无效')
      return
    }
    if (currentSongLikeStatus.value === 0) {
      // 收藏歌曲
      const res = await collectSong(songId)
      if (res.code === 0) {
        updateAllSongLikeStatus(songId, 1)
        ElMessage.success('已添加到我的喜欢')
      } else {
        ElMessage.error(res.message || '添加到我的喜欢失败')
      }
    } else {
      // 取消收藏
      const res = await cancelCollectSong(songId)
      if (res.code === 0) {
        updateAllSongLikeStatus(songId, 0)
        ElMessage.success('已取消喜欢')
      } else {
        ElMessage.error(res.message || '取消喜欢失败')
      }
    }
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败')
  }
}
</script>

<template>
  <div class="player-center min-w-0 px-4 py-2">
    <div class="transport-controls">
      <button
        @click="prevTrack"
        class="transport-button"
        aria-label="上一首"
      >
        <icon-solar:skip-previous-bold class="text-lg" />
      </button>
      <button
        @click="togglePlayPause"
        class="play-button"
        :aria-label="isPlaying ? '暂停' : '播放'"
      >
        <Icon
          :icon="
            isPlaying ? 'ic:round-pause-circle' : 'material-symbols:play-circle'
          "
          class="text-3xl"
        />
      </button>
      <button
        @click="nextTrack"
        class="transport-button"
        aria-label="下一首"
      >
        <icon-solar:skip-previous-bold class="transform scale-x-[-1] text-lg" />
      </button>
      <button
        class="transport-button favorite-button"
        :aria-label="currentSongLikeStatus ? '取消收藏' : '收藏歌曲'"
        @click="handleLike"
      >
        <icon-mdi:cards-heart-outline
          v-if="currentSongLikeStatus === 0"
          class="text-lg"
        />
        <icon-mdi:cards-heart v-else class="text-lg text-primary" />
      </button>
    </div>
    <div class="progress-row">
      <span class="time-label">{{ formatTime(isSeeking ? seekingTime : currentTime) }}</span>
      <el-slider
        v-model="seekingTime"
        :step="1"
        :show-tooltip="false"
        :disabled="duration <= 0"
        @mousedown="startSeeking"
        @touchstart="startSeeking"
        @input="previewSeek"
        @change="seek"
        :max="Math.max(duration, 1)"
        class="min-w-0 flex-1"
        size="small"
      />
      <span class="time-label">{{ formatTime(duration) }}</span>
      <span
        v-if="currentTrack.playbackStatus === 'switching'"
        class="whitespace-nowrap rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
      >切换音源中</span>
      <span
        v-else-if="currentTrack.playbackStatus === 'preview'"
        class="whitespace-nowrap rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500"
      >仅试听</span>
    </div>
  </div>
</template>

<style scoped>
.player-center { display: grid; gap: 4px; }
.transport-controls { display: flex; min-height: 38px; align-items: center; justify-content: center; gap: 10px; }
.transport-button { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 50%; color: hsl(var(--muted-foreground)); transition: color .15s ease, background .15s ease, transform .15s ease; }
.transport-button:hover { color: hsl(var(--foreground)); background: hsl(var(--muted)); }
.transport-button:active { transform: scale(.94); }
.play-button { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 50%; color: #111216; background: var(--primary); transition: filter .15s ease, transform .15s ease; }
.play-button:hover { filter: brightness(1.08); transform: scale(1.03); }
.favorite-button { margin-left: 4px; }
.progress-row { display: flex; min-width: 0; align-items: center; gap: 10px; }
.time-label { width: 38px; flex: none; color: hsl(var(--muted-foreground)); font-size: 10px; font-variant-numeric: tabular-nums; text-align: center; }
@media (max-width: 680px) { .player-center { padding-inline: 4px; } .progress-row { display: none; } .favorite-button { display: none; } }
</style>
