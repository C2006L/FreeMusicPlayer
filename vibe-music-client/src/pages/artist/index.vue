<script setup lang="ts">
import { searchOnlineSongs } from '@/api/system'
import type { Song } from '@/api/interface'
import { relatedArtists } from '@/utils/artists'

const router = useRouter()
const route = useRoute()
const searchKeyword = ref(String(route.query.query || ''))
const allArtists = ref<ReturnType<typeof relatedArtists>>([])
const currentPage = ref(1)
const pageSize = ref(12)
const searched = ref(false)
const loading = ref(false)
const error = ref('')
const submitted = ref('')
let requestId = 0
let controller: AbortController | undefined
const hotKeywords = ['周杰伦', '林俊杰', '陈奕迅', '邓紫棋', '五月天', 'Taylor Swift', 'Adele', 'Linkin Park']
const artists = computed(() => allArtists.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
const search = async (value = searchKeyword.value) => {
  controller?.abort()
  const id = ++requestId
  searchKeyword.value = value
  submitted.value = value.trim()
  allArtists.value = []
  currentPage.value = 1
  error.value = ''
  searched.value = Boolean(submitted.value)
  loading.value = searched.value
  if (!searched.value) return
  controller = new AbortController()
  try {
    const result = await searchOnlineSongs(submitted.value, undefined, 50, controller.signal)
    if (id !== requestId) return
    if (result.code !== 0 || !Array.isArray(result.data)) throw new Error(result.message || '歌手搜索失败')
    allArtists.value = relatedArtists(result.data as Song[], submitted.value)
  } catch (e: any) {
    if (id === requestId && e?.code !== 'ERR_CANCELED') error.value = e?.message || '在线曲库无法连接'
  } finally { if (id === requestId) loading.value = false }
}
const openArtist = (artist: typeof allArtists.value[number]) => router.push({ path: '/library', query: { query: artist.name, artist: artist.name, source: artist.source } })
watch(pageSize, () => { currentPage.value = 1 })
onMounted(() => { if (searchKeyword.value) void search() })
onUnmounted(() => { requestId++; controller?.abort() })
</script>

<template>
  <section class="artist-page">
    <header class="artist-header">
      <div><p class="eyebrow">ARTISTS</p><h1>歌手发现</h1><p class="description">从在线歌曲发现相关歌手，按平台保留结果。同名结果可能属于不同歌手。</p></div>
      <form class="artist-search" @submit.prevent="search()">
        <label class="sr-only" for="artist-query">搜索歌手</label>
        <input id="artist-query" v-model="searchKeyword" placeholder="输入歌手或乐队名称" maxlength="100" />
        <button type="submit">搜索</button><button type="button" @click="search('')">重置</button>
      </form>
    </header>
    <div class="artist-body">
      <div v-if="loading" class="artist-state" role="status">正在搜索「{{ submitted }}」…</div>
      <div v-else-if="error" class="artist-state" role="alert"><h2>暂时无法搜索</h2><p>{{ error }}</p><button @click="search(submitted)">重试</button></div>
      <div v-else-if="!searched" class="artist-state"><h2>从一个熟悉的名字开始</h2><p>搜索歌手，查看各平台返回的相关歌曲。</p><div class="keyword-list"><button v-for="word in hotKeywords" :key="word" @click="search(word)">{{ word }}</button></div></div>
      <div v-else-if="!allArtists.length" class="artist-state"><h2>未找到相关歌手</h2><p>「{{ submitted }}」没有匹配结果，可尝试完整名称、其他语言名称或别名。</p></div>
      <div v-else class="artist-grid">
        <button v-for="artist in artists" :key="artist.key" class="artist-item" @click="openArtist(artist)">
          <span class="artist-monogram" aria-hidden="true">{{ artist.name.slice(0, 1).toUpperCase() }}</span>
          <strong :title="artist.name">{{ artist.name }}</strong><span>{{ artist.sourceName }}</span><small>本次找到 {{ artist.count }} 首相关歌曲</small>
        </button>
      </div>
    </div>
    <el-pagination v-if="allArtists.length" v-model:current-page="currentPage" v-model:page-size="pageSize" :total="allArtists.length" :page-sizes="[12,24,48]" layout="total, sizes, prev, pager, next" />
  </section>
</template>

<style scoped>
.artist-page{display:flex;flex-direction:column;height:100%;min-height:0;padding:24px 32px;gap:20px}.artist-header{border-bottom:1px solid hsl(var(--border));padding-bottom:20px;display:flex;gap:24px;justify-content:space-between;flex-wrap:wrap}.eyebrow{font-size:10px;letter-spacing:.2em;color:var(--primary)}h1{font-size:26px;font-weight:650;margin:4px 0 8px}.description,.artist-state p{font-size:12px;color:hsl(var(--muted-foreground));max-width:540px;line-height:1.8}.artist-search{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.artist-search input{min-width:160px;width:240px;background:hsl(var(--muted));border:1px solid hsl(var(--border));border-radius:6px;padding:9px 12px;font-size:13px}.artist-search button,.artist-state button{padding:8px 12px;border:1px solid hsl(var(--border));border-radius:6px;font-size:12px}.artist-search button[type=submit]{color:var(--primary)}.artist-body{min-height:0;flex:1;overflow-y:auto}.artist-state{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;gap:14px;text-align:center}.artist-state h2{font-size:20px}.keyword-list{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:540px}.artist-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:24px 20px}.artist-item{display:flex;flex-direction:column;align-items:center;gap:7px;padding:16px 8px;min-width:0;border-radius:8px}.artist-item:hover{background:hsl(var(--muted)/.5)}.artist-monogram{width:104px;height:104px;border-radius:50%;display:grid;place-items:center;background:hsl(var(--muted));color:var(--primary);font-size:36px;margin-bottom:8px}.artist-item strong{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px}.artist-item span:not(.artist-monogram),small{font-size:11px;color:hsl(var(--muted-foreground))}@media(max-width:640px){.artist-page{padding:18px 14px}.artist-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
