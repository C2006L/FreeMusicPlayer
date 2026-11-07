<script setup lang="ts">
import { getDiscoverArtists, searchOnlineSongs } from '@/api/system'
import type { Song } from '@/api/interface'
import { normalizeArtist, relatedArtists, type RelatedArtist } from '@/utils/artists'
import MusicCover from '@/components/MusicCover.vue'
import { useMediaQuery } from '@vueuse/core'

const isPhone = useMediaQuery('(max-width: 767px)')

type ArtistCard = {
  key: string
  name: string
  source: string
  sourceName: string
  count: number
  coverUrl: string
  sampleSongName: string
  sources: string[]
}
// The upstream aggregation keeps one entry per platform. Search cards merge the
// same display name so one artist does not stack five identical tiles.
const groupArtists = (artists: RelatedArtist[], query = ''): ArtistCard[] => {
  const needle = normalizeArtist(query)
  const map = new Map<string, ArtistCard & { primaryCount: number }>()
  for (const artist of artists) {
    const key = normalizeArtist(artist.name)
    const existing = map.get(key)
    if (existing) {
      existing.count += artist.count
      if (!existing.coverUrl && artist.coverUrl) existing.coverUrl = artist.coverUrl
      if (!existing.sources.includes(artist.sourceName)) existing.sources.push(artist.sourceName)
      if (artist.count > existing.primaryCount) {
        existing.primaryCount = artist.count
        existing.source = artist.source
        existing.sourceName = artist.sourceName
        existing.sampleSongName = artist.sampleSongName || existing.sampleSongName
      }
    } else {
      map.set(key, {
        key,
        name: artist.name,
        source: artist.source,
        sourceName: artist.sourceName,
        count: artist.count,
        coverUrl: artist.coverUrl,
        sampleSongName: artist.sampleSongName,
        sources: [artist.sourceName],
        primaryCount: artist.count,
      })
    }
  }
  return [...map.values()].sort(
    (a, b) => Number(normalizeArtist(b.name) === needle) - Number(normalizeArtist(a.name) === needle) || b.count - a.count
  )
}

const discoveryPageSize = 24
const router = useRouter()
const route = useRoute()
const searchKeyword = ref(String(route.query.query || ''))
const submitted = ref('')
const searchArtists = ref<ArtistCard[]>([])
const discoveryArtists = ref<ArtistCard[]>([])
const discoveryOffset = ref(0)
const discoveryLoading = ref(false)
const discoveryError = ref('')
const searchLoading = ref(false)
const searchError = ref('')
const currentPage = ref(1)
const pageSize = ref(12)
const searchInput = ref<HTMLInputElement>()
let requestId = 0
let discoveryId = 0
let controller: AbortController | undefined
let inputTimer: ReturnType<typeof setTimeout> | undefined
let composing = false

const discoveryPage = computed(() => {
  const all = discoveryArtists.value
  if (!all.length) return []
  const start = discoveryOffset.value % all.length
  return [...all.slice(start), ...all.slice(0, start)].slice(0, discoveryPageSize)
})
const pagedArtists = computed(() => searchArtists.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
const searchActive = computed(() => Boolean(submitted.value))
const loading = computed(() => searchActive.value ? searchLoading.value : discoveryLoading.value)
const error = computed(() => searchActive.value ? searchError.value : discoveryError.value)
const visibleArtists = computed(() => searchActive.value ? pagedArtists.value : discoveryPage.value)
const summary = computed(() => searchActive.value
  ? `${searchArtists.value.length} 位相关歌手`
  : `${discoveryArtists.value.length} 位歌手 · 来自多份平台推荐歌单`)

const toArtistCard = (raw: any): ArtistCard => {
  const name = String(raw?.name || '').trim()
  const source = String(raw?.source || '')
  const sourceName = String(raw?.sourceName || source)
  return {
    key: normalizeArtist(name),
    name,
    source,
    sourceName,
    count: Number(raw?.songCount) || 0,
    coverUrl: String(raw?.coverUrl || ''),
    sampleSongName: String(raw?.sampleSongName || ''),
    sources: Array.isArray(raw?.sources) && raw.sources.length ? raw.sources.map(String) : [sourceName],
  }
}

const loadDiscovery = async () => {
  const id = ++discoveryId
  discoveryLoading.value = true
  discoveryError.value = ''
  try {
    const result = await getDiscoverArtists(60)
    if (id !== discoveryId) return
    if (result.code !== 0 || !Array.isArray(result.data)) throw new Error(result.message || '在线歌手暂时不可用')
    discoveryArtists.value = (result.data as any[]).map(toArtistCard).filter((artist) => artist.name)
    discoveryOffset.value = 0
  } catch (e: any) {
    if (id !== discoveryId) return
    discoveryArtists.value = []
    discoveryError.value = e?.message || '在线音源暂时无法连接'
  } finally {
    if (id === discoveryId) discoveryLoading.value = false
  }
}

const clearInputTimer = () => {
  if (inputTimer) {
    clearTimeout(inputTimer)
    inputTimer = undefined
  }
}

const search = async (value = searchKeyword.value) => {
  clearInputTimer()
  controller?.abort()
  const id = ++requestId
  searchKeyword.value = value
  submitted.value = value.trim()
  searchArtists.value = []
  currentPage.value = 1
  searchError.value = ''
  if (!submitted.value) {
    if (!discoveryArtists.value.length && !discoveryLoading.value) void loadDiscovery()
    return
  }
  searchLoading.value = true
  controller = new AbortController()
  try {
    const result = await searchOnlineSongs(submitted.value, undefined, 50, controller.signal)
    if (id !== requestId) return
    if (result.code !== 0 || !Array.isArray(result.data)) throw new Error(result.message || '歌手搜索失败')
    searchArtists.value = groupArtists(relatedArtists(result.data as Song[], submitted.value), submitted.value)
  } catch (e: any) {
    if (id === requestId && e?.code !== 'ERR_CANCELED') searchError.value = e?.message || '在线曲库无法连接'
  } finally {
    if (id === requestId) searchLoading.value = false
  }
}

// Typing now refreshes results after a short pause, so the list can no longer
// disagree with a filled-in search box. Enter and the search button still run
// immediately, and IME composition never searches intermediate pinyin.
const scheduleLiveSearch = () => {
  clearInputTimer()
  inputTimer = setTimeout(() => {
    inputTimer = undefined
    if (searchKeyword.value.trim() === submitted.value) return
    void search()
  }, 350)
}
const onSearchInput = () => { if (!composing) scheduleLiveSearch() }
const onCompositionStart = () => { composing = true }
const onCompositionEnd = () => {
  composing = false
  scheduleLiveSearch()
}

const nextDiscoveryBatch = () => {
  if (!discoveryArtists.value.length) {
    void loadDiscovery()
    return
  }
  discoveryOffset.value = (discoveryOffset.value + discoveryPageSize) % discoveryArtists.value.length
}
const resetSearch = () => search('')
const retry = () => searchActive.value ? search(submitted.value) : loadDiscovery()
const focusSearch = () => nextTick(() => searchInput.value?.focus())
const artistMeta = (artist: ArtistCard) => {
  const parts: string[] = []
  if (searchActive.value) {
    if (artist.count > 1) parts.push(`本次匹配 ${artist.count} 首`)
    if (artist.sampleSongName) parts.push(artist.count > 1 ? artist.sampleSongName : `匹配：${artist.sampleSongName}`)
  } else {
    if (artist.count > 1) parts.push(`${artist.count} 首`)
    if (artist.sampleSongName) parts.push(artist.count > 1 ? artist.sampleSongName : `代表作：${artist.sampleSongName}`)
  }
  if (artist.sources.length > 1) parts.push(`${artist.sources.length} 个平台`)
  return parts.filter(Boolean).join(' · ') || artist.sourceName
}
const openArtist = (artist: ArtistCard) => router.push({ path: '/library', query: { query: artist.name, artist: artist.name, source: artist.source } })

watch(pageSize, () => { currentPage.value = 1 })
onMounted(() => {
  if (searchKeyword.value) void search(searchKeyword.value)
  else void loadDiscovery()
})
onUnmounted(() => {
  requestId++
  discoveryId++
  controller?.abort()
  clearInputTimer()
})
</script>

<template>
  <section class="artist-page">
    <header class="artist-header">
      <div class="artist-heading">
        <p class="eyebrow">ARTISTS</p>
        <h1>歌手发现</h1>
        <p class="description">从平台多份推荐歌单跨来源聚合本批可检索的歌手，曲目数是跨歌单去重后的真实候选数。这里展示的是推荐歌单里的署名聚合，不是完整歌手档案。</p>
      </div>
      <form class="artist-search" @submit.prevent="search()">
        <label class="sr-only" for="artist-query">搜索歌手</label>
        <input
          id="artist-query"
          ref="searchInput"
          v-model="searchKeyword"
          placeholder="输入歌手或乐队名称"
          maxlength="100"
          @input="onSearchInput"
          @compositionstart="onCompositionStart"
          @compositionend="onCompositionEnd"
        />
        <button type="submit">搜索</button>
        <button type="button" @click="resetSearch">重置</button>
      </form>
    </header>

    <div class="artist-body">
      <div class="section-heading">
        <div>
          <p>{{ searchActive ? 'SEARCH RESULT' : 'PLATFORM PLAYLISTS' }}</p>
          <h2>{{ searchActive ? `「${submitted}」相关歌手` : '本批平台推荐歌手' }}</h2>
          <span>{{ summary }}</span>
        </div>
        <button v-if="!searchActive" class="ghost-action" :disabled="loading" @click="nextDiscoveryBatch">
          <icon-tabler:refresh class="text-sm" :class="{ 'animate-spin': discoveryLoading }" />
          {{ discoveryLoading ? '加载中' : '换一批' }}
        </button>
      </div>

      <div v-if="loading" class="artist-grid" role="status" aria-label="正在加载在线歌手">
        <div v-for="n in 12" :key="n" class="artist-card" aria-hidden="true">
          <span class="artist-card__art animate-pulse bg-muted"></span>
          <span class="artist-card__text">
            <span class="mb-2 block h-3 w-3/4 animate-pulse rounded bg-muted"></span>
            <span class="block h-2.5 w-1/2 animate-pulse rounded bg-muted"></span>
          </span>
        </div>
      </div>

      <div v-else-if="error" class="artist-state" role="alert">
        <h2>在线音源暂时无法连接</h2>
        <p>{{ error }}</p>
        <div class="state-actions">
          <button @click="retry">重新连接</button>
          <button class="is-quiet" @click="focusSearch">直接搜索</button>
        </div>
      </div>

      <div v-else-if="!visibleArtists.length" class="artist-state">
        <template v-if="searchActive">
          <h2>未找到相关歌手</h2>
          <p>「{{ submitted }}」没有匹配结果，可尝试完整名称、其他语言名称或别名。</p>
          <div class="state-actions"><button @click="resetSearch">返回平台推荐</button></div>
        </template>
        <template v-else>
          <h2>本次没有可展示的歌手</h2>
          <p>平台这次返回的歌单为空或暂不可用，可以换一批，或直接按名字搜索。</p>
          <div class="state-actions">
            <button @click="nextDiscoveryBatch">换一批</button>
            <button class="is-quiet" @click="focusSearch">直接搜索</button>
          </div>
        </template>
      </div>

      <div v-else class="artist-grid">
        <button v-for="artist in visibleArtists" :key="artist.key" class="artist-card" @click="openArtist(artist)">
          <span class="artist-card__art">
            <MusicCover :src="artist.coverUrl" :alt="`${artist.name} 的作品封面`" />
            <span class="artist-card__badge">{{ artist.sourceName }}</span>
            <span class="artist-card__arrow"><icon-tabler:arrow-up-right /></span>
          </span>
          <span class="artist-card__text">
            <strong :title="artist.name">{{ artist.name }}</strong>
            <small :title="artistMeta(artist)">{{ artistMeta(artist) }}</small>
          </span>
        </button>
      </div>

      <el-pagination v-if="searchActive && searchArtists.length" v-model:current-page="currentPage" v-model:page-size="pageSize"
        :total="searchArtists.length" :page-sizes="[12, 24, 48]" :pager-count="isPhone ? 5 : 7"
        layout="total, sizes, prev, pager, next" />
    </div>
  </section>
</template>

<style scoped>
.artist-page { display:flex; flex-direction:column; height:100%; min-height:0; padding:24px 32px; gap:18px; max-width:1480px; margin-inline:auto; }
.artist-header { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr); align-items:end; gap:24px; border-bottom:1px solid hsl(var(--border)); padding-bottom:20px; }
.eyebrow { font-size:10px; letter-spacing:.22em; color:var(--primary); }
.artist-heading h1 { font-size:27px; font-weight:650; margin:4px 0 8px; }
.description { font-size:12px; color:hsl(var(--muted-foreground)); max-width:600px; line-height:1.85; }
.artist-search { display:flex; gap:8px; align-items:center; justify-content:flex-end; flex-wrap:wrap; }
.artist-search input { min-width:160px; width:240px; background:hsl(var(--muted)); border:1px solid hsl(var(--border)); border-radius:6px; padding:9px 12px; font-size:13px; }
.artist-search button,.state-actions button { padding:8px 13px; border:1px solid hsl(var(--border)); border-radius:6px; font-size:12px; transition:border-color .15s ease, color .15s ease; }
.artist-search button:hover,.state-actions button:hover { border-color:var(--primary); color:var(--primary); }
.artist-search button[type=submit] { color:var(--primary); }
.artist-body { min-height:0; flex:1; overflow-y:auto; }
.section-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:20px; }
.section-heading div > p { font-size:9px; letter-spacing:.24em; color:var(--primary); }
.section-heading h2 { font-size:20px; font-weight:600; margin:5px 0 6px; }
.section-heading div > span { font-size:11px; color:hsl(var(--muted-foreground)); }
.ghost-action { display:inline-flex; align-items:center; gap:6px; flex-shrink:0; padding:8px 12px; border:1px solid hsl(var(--border)); border-radius:999px; font-size:12px; color:hsl(var(--muted-foreground)); transition:border-color .15s ease, color .15s ease; }
.ghost-action:hover { border-color:var(--primary); color:var(--primary); }
.ghost-action:disabled { opacity:.55; }
.artist-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(168px,1fr)); gap:24px 20px; padding-bottom:8px; }
.artist-card { min-width:0; text-align:left; border-radius:8px; }
.artist-card__art { position:relative; display:block; aspect-ratio:1; overflow:hidden; border-radius:8px; background:hsl(var(--muted)); }
.artist-card__art :deep(.music-cover) { transition:transform .4s ease; }
.artist-card:hover .artist-card__art :deep(.music-cover) { transform:scale(1.04); }
.artist-card__art::after { content:''; position:absolute; inset:auto 0 0; height:38%; background:linear-gradient(to top, rgb(20 21 25 / .32), transparent); pointer-events:none; }
.artist-card__badge { position:absolute; top:9px; left:9px; z-index:1; padding:4px 8px; border-radius:999px; background:rgb(255 255 255 / .9); color:#26241f; font-size:10px; letter-spacing:.02em; backdrop-filter:blur(6px); }
.artist-card__arrow { position:absolute; right:9px; bottom:9px; z-index:1; display:grid; place-items:center; width:28px; height:28px; border-radius:50%; background:rgb(255 255 255 / .92); color:#26241f; opacity:0; transform:translateY(4px); transition:opacity .18s ease, transform .18s ease; }
.artist-card:hover .artist-card__arrow,.artist-card:focus-visible .artist-card__arrow { opacity:1; transform:none; }
.artist-card__text { display:block; padding-top:10px; }
.artist-card__text strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; font-weight:600; }
.artist-card__text small { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:3px; font-size:11px; color:hsl(var(--muted-foreground)); }
.artist-state { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:280px; gap:12px; text-align:center; padding:36px 20px; border:1px dashed hsl(var(--border)); border-radius:14px; }
.artist-state h2 { font-size:19px; font-weight:600; }
.artist-state p { font-size:12px; color:hsl(var(--muted-foreground)); max-width:520px; line-height:1.8; }
.state-actions { display:flex; gap:10px; flex-wrap:wrap; justify-content:center; }
.state-actions .is-quiet { color:hsl(var(--muted-foreground)); }
@media(max-width:767px){
  .artist-page { padding:18px 14px; gap:16px; }
  .artist-header { grid-template-columns:minmax(0,1fr); gap:16px; }
  .artist-search { width:100%; justify-content:flex-start; }
  .artist-search input { flex:1 1 100%; width:100%; min-height:44px; }
  .artist-search button,.state-actions button { min-height:44px; }
  .artist-grid { gap:18px 12px; grid-template-columns:repeat(2,minmax(0,1fr)); }
  .section-heading { align-items:flex-start; }
  .section-heading h2 { font-size:18px; }
}
</style>
