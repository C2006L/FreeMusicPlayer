<script setup lang="ts">
import {
  getAllPlaylists,
  getFavoritePlaylists,
  getOnlinePlaylistSongs,
  getOnlinePlaylists,
} from '@/api/system'
import coverImg from '@/assets/cover.png'
import MusicCover from '@/components/MusicCover.vue'
import { AudioStore } from '@/stores/modules/audio'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { songToTrack } from '@/utils/songTrack'
import { ElNotification } from 'element-plus'

const router = useRouter()
const audio = AudioStore()
const { play } = useAudioPlayer()

// 路由
const playlists = ref<any[]>([])
const selected = ref('all')
const searchKeyword = ref('')
const loading = ref(false)

// 数据库没有可展示歌单时，回退到平台真实推荐歌单
const onlineMode = ref(false)
const onlinePlaylists = ref<any[]>([])
const onlineLoading = ref(false)
const onlineError = ref('')
const onlineLoaded = ref(false)
const openingKey = ref('')

const playlistsList = [
  { name: '精选歌单', value: 'all' },
  { name: '收藏歌单', value: 'favorite' }
]
const playTags = ref<{ name: string }[]>([])
const selectedTag = ref('全部')

const currentPage = ref(1)
const pageSize = ref(12)
const state = reactive({
  size: 'default',
  disabled: false,
  background: false,
  layout: 'total, sizes, prev, pager, next',
  total: 0,
  pageSizes: [12, 24, 36, 48],
})

const onlineQuery = computed(() => searchKeyword.value.trim().toLowerCase())
const visibleOnline = computed(() => onlineQuery.value
  ? onlinePlaylists.value.filter(item => item.name.toLowerCase().includes(onlineQuery.value)
    || (item.creator || '').toLowerCase().includes(onlineQuery.value))
  : onlinePlaylists.value)

const trackText = (count: number) => count > 0 ? `${count} 首` : '曲目数未提供'
const playCountText = (count: number) => count > 0
  ? `${count >= 10000 ? `${(count / 10000).toFixed(1)} 万` : count} 次播放`
  : ''

const loadOnlinePlaylists = async (force = false) => {
  if (onlineLoaded.value && !force) return
  onlineLoading.value = true
  onlineError.value = ''
  try {
    const res = await getOnlinePlaylists(24)
    if (res.code !== 0 || !Array.isArray(res.data)) throw new Error(res.message || '在线歌单暂时不可用')
    onlinePlaylists.value = res.data
    onlineLoaded.value = true
  } catch (e: any) {
    onlinePlaylists.value = []
    onlineError.value = e?.message || '在线歌单暂时不可用'
  } finally {
    onlineLoading.value = false
  }
}

const getPlaylists = async () => {
  loading.value = true
  try {
    const params = {
      pageNum: currentPage.value,
      pageSize: pageSize.value,
      title: searchKeyword.value || null,
      style: selectedTag.value === '全部' ? null : selectedTag.value
    }
    const res = selected.value === 'favorite'
      ? await getFavoritePlaylists(params)
      : await getAllPlaylists(params)
    if (res.code !== 0) throw new Error(res.message || '获取歌单列表失败')
    const payload: any = res.data || {}
    const items = Array.isArray(payload.items) ? payload.items : []
    playlists.value = items.map(item => ({
      id: item.playlistId,
      name: item.title,
      coverImgUrl: item.coverUrl ?? coverImg,
      creator: {
        nickname: 'FreeMusicPlayer',
        avatarUrl: coverImg
      },
      playCount: 0,
      subscribedCount: 0
    }))
    state.total = Number(payload.total) || 0
    const canUseOnline = selected.value === 'all' && selectedTag.value === '全部'
    onlineMode.value = canUseOnline && state.total === 0
    if (onlineMode.value) await loadOnlinePlaylists()
  } catch (e: any) {
    playlists.value = []
    state.total = 0
    const canUseOnline = selected.value === 'all' && selectedTag.value === '全部'
    onlineMode.value = canUseOnline
    if (onlineMode.value) await loadOnlinePlaylists()
    else ElNotification({ type: 'error', message: e?.message || '获取歌单列表失败', duration: 2000 })
  } finally {
    loading.value = false
  }
}

const handleSizeChange = () => { getPlaylists() }
const handleCurrentChange = () => { getPlaylists() }

const selectPlaylist = (value: string) => {
  selected.value = value
  currentPage.value = 1
  getPlaylists()
}

const handleSearch = () => {
  currentPage.value = 1
  getPlaylists()
}

const handleKeyPress = (e: KeyboardEvent) => {
  if (e.key === 'Enter') handleSearch()
}

const playOnlinePlaylist = async (playlist: any) => {
  if (openingKey.value) return
  const key = `${playlist.source}:${playlist.id}`
  openingKey.value = key
  try {
    const res = await getOnlinePlaylistSongs(playlist.source, playlist.id)
    if (res.code !== 0 || !Array.isArray(res.data) || !res.data.length) {
      throw new Error(res.message || '该歌单暂无可播放曲目')
    }
    audio.setAudioStore('trackList', res.data.map(item => songToTrack(item)))
    audio.setAudioStore('currentSongIndex', 0)
    await play()
  } catch (e: any) {
    ElNotification({ type: 'warning', title: '无法播放该歌单', message: e?.message || '请稍后重试', duration: 3000 })
  } finally {
    openingKey.value = ''
  }
}

onMounted(() => {
  playTags.value = [
    { name: '全部' }, { name: '节奏布鲁斯' }, { name: '欧美流行' }, { name: '华语流行' },
    { name: '粤语流行' }, { name: '国风流行' }, { name: '韩语流行' }, { name: '日本流行' },
    { name: '嘻哈说唱' }, { name: '非洲节拍' }, { name: '原声带' }, { name: '轻音乐' },
    { name: '摇滚' }, { name: '朋克' }, { name: '电子' }, { name: '国风' },
    { name: '乡村' }, { name: '古典' },
  ]
  getPlaylists()
})
</script>

<template>
  <section class="playlist-page">
    <header class="page-header">
      <div class="page-heading">
        <p class="eyebrow">PLAYLISTS</p>
        <h1>歌单</h1>
        <p class="description">优先展示站内歌单；站内暂无可播放歌单时，展示平台真实推荐歌单，点击即可播放整张歌单。</p>
      </div>
      <div class="header-tools">
        <div class="search-box">
          <icon-mdi:magnify class="search-icon" />
          <input v-model="searchKeyword" type="search" placeholder="搜索歌单..." @keydown="handleKeyPress" />
        </div>
        <el-select v-if="!onlineMode" v-model="selectedTag" class="style-select" @change="handleSearch">
          <el-option v-for="item in playTags" :key="item.name" :label="item.name" :value="item.name" />
        </el-select>
      </div>
    </header>

    <div class="tabs">
      <button v-for="playlist in playlistsList" :key="playlist.value" :class="{ 'is-active': selected === playlist.value }"
        @click="selectPlaylist(playlist.value)">
        {{ playlist.name }}
      </button>
    </div>

    <div class="page-body">
      <template v-if="onlineMode">
        <div class="section-heading">
          <div>
            <p>PLATFORM RECOMMENDATION</p>
            <h2>平台推荐歌单</h2>
            <span>{{ visibleOnline.length }} 张 · 来自在线平台真实推荐{{ onlineQuery ? `，匹配「${searchKeyword.trim()}」` : '' }}</span>
          </div>
          <button class="ghost-action" :disabled="onlineLoading" @click="loadOnlinePlaylists(true)">
            <icon-tabler:refresh class="text-sm" :class="{ 'animate-spin': onlineLoading }" />
            {{ onlineLoading ? '加载中' : '刷新推荐' }}
          </button>
        </div>

        <div v-if="onlineLoading" class="playlist-grid" role="status" aria-label="正在加载平台推荐歌单">
          <div v-for="n in 12" :key="n" class="playlist-card" aria-hidden="true">
            <span class="skeleton-art animate-pulse"></span>
            <span class="skeleton-body">
              <span class="mb-2 block h-3 w-4/5 animate-pulse rounded bg-muted"></span>
              <span class="block h-2.5 w-3/5 animate-pulse rounded bg-muted"></span>
            </span>
          </div>
        </div>

        <div v-else-if="onlineError" class="state-panel" role="alert">
          <h2>在线歌单暂时无法连接</h2>
          <p>{{ onlineError }}</p>
          <div class="state-actions">
            <button @click="loadOnlinePlaylists(true)">重新连接</button>
            <button class="is-quiet" @click="selected = 'favorite'; selectPlaylist('favorite')">查看收藏歌单</button>
          </div>
        </div>

        <div v-else-if="!visibleOnline.length" class="state-panel">
          <h2>{{ onlineQuery ? '没有匹配的平台歌单' : '平台暂未返回推荐歌单' }}</h2>
          <p>{{ onlineQuery ? '换个关键词，或清空搜索查看平台推荐。' : '在线音源这次没有返回可展示的歌单，可以稍后刷新。' }}</p>
          <div class="state-actions">
            <button v-if="onlineQuery" @click="searchKeyword = ''; handleSearch()">清空搜索</button>
            <button class="is-quiet" @click="loadOnlinePlaylists(true)">刷新推荐</button>
          </div>
        </div>

        <div v-else class="playlist-grid">
          <button v-for="item in visibleOnline" :key="`${item.source}:${item.id}`" class="playlist-card"
            :aria-label="`播放歌单 ${item.name}`" @click="playOnlinePlaylist(item)">
            <span class="playlist-card__art">
              <MusicCover :src="item.coverUrl" :alt="item.name" />
              <span class="source-badge">{{ item.sourceName }}</span>
              <span class="play-button">
                <icon-tabler:loader-2 v-if="openingKey === `${item.source}:${item.id}`" class="animate-spin" />
                <icon-tabler:player-play-filled v-else />
              </span>
            </span>
            <span class="playlist-card__body">
              <strong :title="item.name">{{ item.name }}</strong>
              <small :title="`${item.creator || item.sourceName} · ${trackText(item.trackCount)}`">
                {{ item.creator || item.sourceName }} · {{ trackText(item.trackCount) }}<template v-if="playCountText(item.playCount)"> · {{ playCountText(item.playCount) }}</template>
              </small>
            </span>
          </button>
        </div>
      </template>

      <template v-else>
        <div class="section-heading">
          <div>
            <p>{{ selected === 'favorite' ? 'MY COLLECTION' : 'LIBRARY PLAYLISTS' }}</p>
            <h2>{{ selected === 'favorite' ? '收藏的歌单' : '站内歌单' }}</h2>
            <span>{{ state.total }} 张{{ selectedTag !== '全部' ? ` · ${selectedTag}` : '' }}</span>
          </div>
        </div>

        <div v-if="loading" class="playlist-grid" role="status" aria-label="正在加载歌单">
          <div v-for="n in 8" :key="n" class="playlist-card" aria-hidden="true">
            <span class="skeleton-art animate-pulse"></span>
            <span class="skeleton-body">
              <span class="mb-2 block h-3 w-4/5 animate-pulse rounded bg-muted"></span>
              <span class="block h-2.5 w-3/5 animate-pulse rounded bg-muted"></span>
            </span>
          </div>
        </div>

        <div v-else-if="!playlists.length" class="state-panel">
          <h2>{{ selected === 'favorite' ? '还没有收藏歌单' : '当前筛选下没有歌单' }}</h2>
          <p>{{ selected === 'favorite' ? '在歌单详情页收藏后会出现在这里；收藏的歌曲请前往「喜欢」页查看。' : '换个风格或关键词再试。' }}</p>
          <div class="state-actions">
            <button v-if="selected === 'favorite'" @click="selectPlaylist('all')">浏览歌单</button>
            <button v-else class="is-quiet" @click="selectedTag = '全部'; searchKeyword = ''; handleSearch()">重置筛选</button>
          </div>
        </div>

        <div v-else class="playlist-grid">
          <button v-for="playlist in playlists" :key="playlist.id" class="playlist-card"
            @click="router.push('/playlist/' + playlist.id)">
            <span class="playlist-card__art">
              <el-image lazy :alt="playlist.name" class="h-full w-full" :src="playlist.coverImgUrl + '?param=330y330'" />
              <span class="play-button"><icon-tabler:player-play-filled /></span>
            </span>
            <span class="playlist-card__body">
              <strong :title="playlist.name">{{ playlist.name }}</strong>
              <small>{{ playlist.creator.nickname }}</small>
            </span>
          </button>
        </div>

        <nav v-if="playlists.length" class="pagination">
          <el-pagination v-model:page-size="pageSize" v-model:current-page="currentPage" v-bind="state"
            @size-change="handleSizeChange" @current-change="handleCurrentChange" />
        </nav>
      </template>
    </div>
  </section>
</template>

<style scoped>
.playlist-page { display:flex; flex-direction:column; height:100%; min-height:0; padding:24px 32px; gap:14px; max-width:1480px; margin-inline:auto; }
.page-header { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(300px,.75fr); align-items:end; gap:24px; border-bottom:1px solid hsl(var(--border)); padding-bottom:20px; }
.eyebrow { font-size:10px; letter-spacing:.22em; color:var(--primary); }
.page-heading h1 { font-size:27px; font-weight:650; margin:4px 0 8px; }
.description { font-size:12px; color:hsl(var(--muted-foreground)); max-width:600px; line-height:1.85; }
.header-tools { display:flex; align-items:center; justify-content:flex-end; gap:10px; flex-wrap:wrap; }
.search-box { position:relative; flex:1 1 220px; max-width:320px; }
.search-icon { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:hsl(var(--muted-foreground)); font-size:17px; }
.search-box input { width:100%; height:38px; padding:0 12px 0 34px; border:1px solid hsl(var(--border)); border-radius:7px; background:hsl(var(--muted)); font-size:13px; }
.style-select { width:150px; }
.tabs { display:inline-flex; align-self:flex-start; gap:2px; padding:3px; border-radius:8px; background:hsl(var(--muted)/.7); }
.tabs button { padding:7px 14px; border-radius:6px; font-size:13px; color:hsl(var(--muted-foreground)); transition:background .15s ease,color .15s ease; }
.tabs button.is-active { background:hsl(var(--background)); color:hsl(var(--foreground)); box-shadow:0 1px 2px rgb(0 0 0 / .08); }
.page-body { min-height:0; flex:1; overflow-y:auto; overflow-x:hidden; }
.section-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:18px; }
.section-heading div > p { font-size:9px; letter-spacing:.24em; color:var(--primary); }
.section-heading h2 { font-size:20px; font-weight:600; margin:5px 0 6px; }
.section-heading div > span { font-size:11px; color:hsl(var(--muted-foreground)); }
.ghost-action { display:inline-flex; align-items:center; gap:6px; flex-shrink:0; padding:8px 12px; border:1px solid hsl(var(--border)); border-radius:999px; font-size:12px; color:hsl(var(--muted-foreground)); transition:border-color .15s ease,color .15s ease; }
.ghost-action:hover { border-color:var(--primary); color:var(--primary); }
.ghost-action:disabled { opacity:.55; }
.playlist-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(178px,1fr)); gap:24px 20px; padding-bottom:8px; }
.playlist-card { min-width:0; text-align:left; border:1px solid hsl(var(--border)); border-radius:10px; background:hsl(var(--card)); overflow:hidden; transition:box-shadow .2s ease,border-color .2s ease; }
.playlist-card:hover { border-color:hsl(var(--border)/.4); box-shadow:0 10px 24px rgb(0 0 0 / .08); }
.playlist-card__art { position:relative; display:block; aspect-ratio:1; overflow:hidden; background:hsl(var(--muted)); }
.playlist-card__art :deep(.music-cover) { transition:transform .4s ease; }
.playlist-card:hover .playlist-card__art :deep(.music-cover) { transform:scale(1.04); }
.playlist-card__art::after { content:''; position:absolute; inset:auto 0 0; height:42%; background:linear-gradient(to top, rgb(20 21 25 / .30), transparent); pointer-events:none; }
.source-badge { position:absolute; top:9px; left:9px; z-index:1; padding:4px 8px; border-radius:999px; background:rgb(255 255 255 / .9); color:#26241f; font-size:10px; backdrop-filter:blur(6px); }
.play-button { position:absolute; right:10px; bottom:10px; z-index:1; display:grid; place-items:center; width:32px; height:32px; border-radius:50%; background:rgb(255 255 255 / .94); color:#26241f; box-shadow:0 2px 8px rgb(0 0 0 / .16); }
.playlist-card__body { display:block; padding:11px 12px 13px; }
.playlist-card__body strong { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; font-size:14px; font-weight:600; line-height:1.45; min-height:2.9em; }
.playlist-card__body small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:4px; font-size:11px; color:hsl(var(--muted-foreground)); }
.skeleton-art { display:block; aspect-ratio:1; background:hsl(var(--muted)); }
.skeleton-body { display:block; padding:12px; }
.state-panel { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:260px; gap:12px; text-align:center; padding:36px 20px; border:1px dashed hsl(var(--border)); border-radius:14px; }
.state-panel h2 { font-size:19px; font-weight:600; }
.state-panel p { font-size:12px; color:hsl(var(--muted-foreground)); max-width:520px; line-height:1.8; }
.state-actions { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
.state-actions button { padding:8px 13px; border:1px solid hsl(var(--border)); border-radius:6px; font-size:12px; transition:border-color .15s ease,color .15s ease; }
.state-actions button:hover { border-color:var(--primary); color:var(--primary); }
.state-actions .is-quiet { color:hsl(var(--muted-foreground)); }
.pagination { display:flex; justify-content:center; padding:18px 0 6px; }
@media(max-width:767px){
  .playlist-page { padding:18px 14px; gap:12px; }
  .page-header { grid-template-columns:minmax(0,1fr); gap:16px; }
  .header-tools { justify-content:flex-start; }
  .search-box { flex:1 1 100%; max-width:none; }
  .search-box input { min-height:44px; }
  .style-select { width:100%; }
  .playlist-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px 12px; }
  .playlist-card__body strong { font-size:13px; }
  .section-heading { align-items:flex-start; }
  .section-heading h2 { font-size:18px; }
}
</style>
