<script setup lang="ts">
import { discoverOnlineSongs } from '@/api/system'
import defaultAlbum from '@/assets/default_album.jpg'
import { formatTime } from '@/utils'
import { ElNotification } from 'element-plus'

const router = useRouter()
const audio = AudioStore()
const { loadTrack, play, isPlaying } = useAudioPlayer()

const recommendedSongList = ref<any[]>([])
const loading = ref(false)
const onlineUnavailable = ref(false)
const recentTracks = computed(() => audio.trackList.slice(-6).reverse())
const featured = computed(() => recommendedSongList.value[0])

const handleRefreshSongs = async () => {
  loading.value = true
  onlineUnavailable.value = false
  try {
    const result = await discoverOnlineSongs(20)
    if (result.code !== 0 || !Array.isArray(result.data)) {
      throw new Error(result.message || '在线推荐暂时不可用')
    }
    recommendedSongList.value = result.data.map((item: any) => ({
      id: item.songId,
      name: item.songName,
      artists: [{ name: item.artistName }],
      album: { name: item.album, picUrl: item.coverUrl },
      duration: Number(item.duration) || 0,
      audioUrl: item.audioUrl,
      likeStatus: item.likeStatus || 0,
      sourceName: item.sourceName,
      source: item.source,
      sourceSongId: item.sourceSongId,
      sourceUrlId: item.sourceUrlId,
      sourcePicId: item.sourcePicId,
      sourceLyricId: item.sourceLyricId,
      online: true,
    }))
  } catch (error: any) {
    recommendedSongList.value = []
    onlineUnavailable.value = true
    ElNotification({
      type: 'warning',
      title: '在线音源暂时不可用',
      message: error?.message || '请检查在线音源服务是否已启动',
      duration: 3000,
    })
  } finally {
    loading.value = false
  }
}

onMounted(handleRefreshSongs)

const convertToTrackModel = (song: any) => ({
  id: String(song.id),
  title: song.name,
  artist: song.artists.map((artist: any) => artist.name).join(', '),
  album: song.album.name,
  cover: song.album.picUrl || defaultAlbum,
  url: song.audioUrl,
  duration: song.duration,
  likeStatus: song.likeStatus || 0,
  source: song.source,
  sourceName: song.sourceName,
  sourceSongId: song.sourceSongId,
  sourceUrlId: song.sourceUrlId,
  sourcePicId: song.sourcePicId,
  sourceLyricId: song.sourceLyricId,
  online: song.online,
})

const handlePlayClick = async (row: any) => {
  const allTracks = recommendedSongList.value.map(convertToTrackModel)
  const selectedIndex = recommendedSongList.value.findIndex((song) => song.id === row.id)
  audio.setAudioStore('trackList', allTracks)
  audio.setAudioStore('currentSongIndex', selectedIndex)
  await loadTrack()
  play()
}

const isCurrentPlaying = (songId: number | string) => {
  const currentTrack = audio.trackList[audio.currentSongIndex]
  return currentTrack && currentTrack.id === String(songId)
}
</script>

<template>
  <div class="home-page w-full px-5 py-6 md:px-8">
    <section class="editorial-hero mb-12">
      <div class="hero-copy">
        <p class="mb-3 text-[10px] font-semibold tracking-[0.28em] text-primary">FREE MUSIC PLAYER · DISCOVER</p>
        <h1 class="mb-4 max-w-2xl text-4xl font-semibold leading-[1.12] tracking-tight md:text-5xl">从一首真正可播放的歌开始。</h1>
        <p class="mb-7 max-w-xl text-sm leading-7 text-muted-foreground">聚合本地曲库与可用在线来源。试听、完整播放和不可用状态都会明确标注，不用失效链接伪装曲库。</p>
        <div class="flex flex-wrap gap-3">
          <button class="primary-action" @click="router.push('/library')"><icon-tabler:search />搜索音乐</button>
          <button v-if="featured" class="secondary-action" @click="handlePlayClick(featured)"><icon-tabler:player-play-filled />播放今日首选</button>
        </div>
      </div>
      <button v-if="featured" class="feature-art" :aria-label="`播放 ${featured.name}`" @click="handlePlayClick(featured)">
        <img :src="featured.album.picUrl || defaultAlbum" :alt="featured.name" />
        <span><small>今日首选</small><strong>{{ featured.name }}</strong><em>{{ featured.artists.map((artist: any) => artist.name).join(' / ') }}</em></span>
      </button>
    </section>

    <section v-if="recentTracks.length" class="mb-12">
      <div class="section-heading"><div><p>RECENTLY PLAYED</p><h2>继续聆听</h2></div></div>
      <div class="cover-strip">
        <button v-for="track in recentTracks" :key="track.id" class="recent-cover" @click="router.push('/library?query=' + encodeURIComponent(track.title))">
          <img :src="track.cover || defaultAlbum" :alt="track.title" /><strong>{{ track.title }}</strong><span>{{ track.artist }}</span>
        </button>
      </div>
    </section>

    <section class="w-full">
      <div class="section-heading mb-4">
        <div>
          <p>ONLINE DISCOVERY</p>
          <h2>在线发现</h2>
        </div>
        <button class="group/refresh inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          :disabled="loading" @click="handleRefreshSongs">
          {{ loading ? '加载中' : '换一批' }}
          <icon-tabler:refresh class="text-base transition-transform duration-500 group-hover/refresh:rotate-180" />
        </button>
      </div>

      <div v-if="recommendedSongList.length" class="grid grid-cols-1 gap-x-16 gap-y-1 md:grid-cols-2">
        <div v-for="(item, index) in recommendedSongList" :key="item.id"
          class="group grid w-full cursor-pointer grid-cols-[auto_auto_2fr_1fr] items-center gap-4 rounded-md p-2 transition-all duration-200"
          :class="isCurrentPlaying(item.id) ? 'bg-activeMenuBg' : 'hover:bg-hoverMenuBg'"
          @click="handlePlayClick(item)">
          <span class="w-6 text-right font-serif-display text-xs tabular-nums text-muted-foreground">
            {{ String(index + 1).padStart(2, '0') }}
          </span>
          <div class="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg">
            <el-image :alt="item.name" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              :src="item.album.picUrl || defaultAlbum" fit="cover">
              <template #error><img :src="defaultAlbum" class="h-full w-full object-cover" /></template>
            </el-image>
            <div class="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/50 group-hover:opacity-100">
              <icon-tabler:player-play-filled class="text-lg" />
            </div>
          </div>
          <div class="ml-1 min-w-0 text-left">
            <h3 class="flex items-center gap-2 font-medium" :class="isCurrentPlaying(item.id) ? 'text-primary' : ''">
              <span class="truncate">{{ item.name }}</span>
              <span class="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{{ item.sourceName }}</span>
              <PlayingIndicator v-if="isCurrentPlaying(item.id)" :paused="!isPlaying" class="flex-shrink-0 scale-75" />
            </h3>
            <p class="truncate text-sm text-muted-foreground">{{ item.artists.map((artist: any) => artist.name).join(' ') }}</p>
          </div>
          <p class="mr-3 text-right text-sm tabular-nums text-muted-foreground">{{ Number(item.duration) > 0 ? formatTime(item.duration) : '--:--' }}</p>
        </div>
      </div>

      <div v-else-if="onlineUnavailable" class="rounded-2xl border border-dashed border-border p-12 text-center">
        <h3 class="mb-2 text-lg font-medium">在线音源暂时无法连接</h3>
        <p class="mb-5 text-sm text-muted-foreground">这不会影响登录、收藏等本地功能，请检查 provider 服务后重试。</p>
        <button class="rounded-full border border-border px-5 py-2 text-sm hover:border-primary hover:text-primary" @click="handleRefreshSongs">重新连接</button>
      </div>

      <div v-else class="grid grid-cols-1 gap-x-16 gap-y-1 md:grid-cols-2">
        <div v-for="n in 10" :key="n" class="flex items-center gap-4 p-2">
          <div class="h-14 w-14 flex-shrink-0 animate-pulse rounded-lg bg-muted"></div>
          <div class="flex-1 space-y-2">
            <div class="h-3.5 w-3/5 animate-pulse rounded bg-muted"></div>
            <div class="h-3 w-2/5 animate-pulse rounded bg-muted"></div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home-page { max-width: 1480px; margin-inline: auto; }
.editorial-hero { display: grid; min-height: 360px; grid-template-columns: minmax(0,1.35fr) minmax(260px,.65fr); align-items: end; gap: clamp(28px,6vw,88px); padding: 44px 6px 36px; border-bottom: 1px solid hsl(var(--border)); }
.hero-copy { align-self: center; }
.primary-action,.secondary-action { display:inline-flex; height:42px; align-items:center; gap:8px; border-radius:7px; padding-inline:18px; font-size:13px; font-weight:600; transition:background .15s ease,color .15s ease,border .15s ease; }
.primary-action { color:#141519; background:var(--primary); }.primary-action:hover { filter:brightness(1.07); }
.secondary-action { border:1px solid hsl(var(--border)); color:hsl(var(--foreground)); }.secondary-action:hover { border-color:var(--primary); color:var(--primary); }
.feature-art { position:relative; aspect-ratio:1; width:min(100%,330px); justify-self:end; overflow:hidden; background:hsl(var(--muted)); text-align:left; }
.feature-art img { width:100%; height:100%; object-fit:cover; transition:transform .35s ease; }.feature-art:hover img { transform:scale(1.025); }
.feature-art span { position:absolute; inset:auto 0 0; display:grid; gap:2px; padding:42px 18px 16px; color:white; background:linear-gradient(transparent,rgb(0 0 0/.78)); }
.feature-art small { font-size:9px; letter-spacing:.16em; opacity:.74; }.feature-art strong { font-size:17px; }.feature-art em { overflow:hidden; font-size:11px; font-style:normal; text-overflow:ellipsis; white-space:nowrap; opacity:.72; }
.section-heading { display:flex; align-items:end; justify-content:space-between; border-bottom:1px solid hsl(var(--border)); padding-bottom:14px; }
.section-heading p { margin-bottom:4px; color:var(--primary); font-size:9px; font-weight:700; letter-spacing:.24em; }.section-heading h2 { font-size:22px; font-weight:600; letter-spacing:-.02em; }
.cover-strip { display:grid; grid-template-columns:repeat(6,minmax(120px,1fr)); gap:18px; padding-top:18px; }
.recent-cover { min-width:0; text-align:left; }.recent-cover img { aspect-ratio:1; width:100%; object-fit:cover; border-radius:7px; }.recent-cover strong,.recent-cover span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.recent-cover strong { margin-top:9px; font-size:13px; }.recent-cover span { margin-top:2px; color:hsl(var(--muted-foreground)); font-size:11px; }
@media(max-width:900px){.editorial-hero{grid-template-columns:1fr minmax(190px,.5fr)}.cover-strip{grid-template-columns:repeat(3,1fr)}}
@media(max-width:640px){.editorial-hero{grid-template-columns:1fr;min-height:auto}.feature-art{display:none}.cover-strip{grid-template-columns:repeat(2,1fr)}}
</style>
