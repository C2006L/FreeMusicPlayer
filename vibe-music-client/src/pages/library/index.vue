<script setup lang="ts">
import { getAllSongs, searchOnlineProgressive } from '@/api/system'
import { ElMessage } from 'element-plus'
import { useLibraryStore } from '@/stores/modules/library'
import { artistNames, normalizeArtist } from '@/utils/artists'
import { usePlaybackEvidence } from '@/stores/modules/playbackEvidence'
import { rememberedGrade } from '@/utils/availabilityProbe'

const route = useRoute()
const libraryStore = useLibraryStore()
const evidence = usePlaybackEvidence()
const playbackFilter = ref('prefer')
const showUnavailable = ref(false)
let localPageData: any = null
// 悬停补探的结果可能只回填到歌曲对象，这里统一读取，保证筛选和表格标签看到同一等级。
const gradeOf = (song: any) => rememberedGrade(song) ?? song.availability
const observedState = (song: any) => evidence.get(song)
const isKnownUnavailable = (song: any) => observedState(song) === 'unavailable' || gradeOf(song) === 'unavailable'
const isKnownBad = (song: any) =>
  ['preview', 'unavailable'].includes(observedState(song)) || ['preview', 'unavailable'].includes(gradeOf(song))
const knownUnavailableCount = computed(() => onlineResults.value.filter(isKnownUnavailable).length)
// 折叠只在仍有条目可显示时生效；如果全部结果都不可播，就保持可见，避免整页空白。
const collapseApplies = computed(() =>
  playbackFilter.value === 'prefer' && !showUnavailable.value &&
  knownUnavailableCount.value > 0 && onlineResults.value.length > knownUnavailableCount.value
)
const hiddenUnavailableCount = computed(() => collapseApplies.value ? knownUnavailableCount.value : 0)
const applyRemembered = (songs: any[]) => songs.map(song => {
  const grade = rememberedGrade(song)
  return grade && song.availability !== grade ? { ...song, availability: grade } : song
})
const filteredOnline = computed(() => {
  const songs = onlineResults.value.filter(song => {
    if (collapseApplies.value && isKnownUnavailable(song)) return false
    if (playbackFilter.value === 'verified') return observedState(song) === 'full'
    // 语义：隐藏“已知”试听与不可播；完整性未知的条目保留，悬停补探后再决定去留。
    if (playbackFilter.value === 'no-preview') return !isKnownBad(song)
    return true
  })
  if (playbackFilter.value !== 'prefer') return songs
  // 先完整可播，再试听、权益待验证，未知排在后面；已确认不可播的默认折叠。
  const rank = (song: any) => {
    const state = observedState(song)
    const grade = gradeOf(song)
    return state === 'full' ? 0 : state === 'duration-matched' ? 1 : state === 'preview' || grade === 'preview' ? 2 : song.vip || grade === 'restricted' ? 3 : state === 'unavailable' || grade === 'unavailable' ? 5 : 4
  }
  return [...songs].sort((a, b) => rank(a) - rank(b))
})

const props = defineProps({
    selected: {
        type: String,
        default: '1',
    },
})
const tableData = computed(() => libraryStore.tableData)

const currentPage = ref(1) // 当前页
const pageSize = ref(20) // 每页显示的数量
const localTotal = ref(0)
const onlineTotal = ref(0)
const onlineResults = ref<any[]>([])
const onlineQuery = ref('')
const searchingOnline = ref(false)
const loading = ref(false)
const loadError = ref('')
const sourceStates = ref<Record<string,string>>({})
const sourceLabels:Record<string,string>={netease:'网易云',qq:'QQ音乐',kugou:'酷狗',kuwo:'酷我',migu:'咪咕',qianqian:'千千',jamendo:'Jamendo',bilibili:'B站'}
let requestId = 0
let controller: AbortController | undefined

const state = reactive({
    size: 'default',
    disabled: false,
    background: false,
    layout: 'total, sizes, prev, pager, next, jumper',
    total: 0,
    pageSizes: [20, 30, 50],
})
const updateTable = () => {
  onlineTotal.value = filteredOnline.value.length
  state.total = localTotal.value + onlineTotal.value
  const offset = (currentPage.value - 1) * pageSize.value
  const source = String(route.query.source || '')
  const localItems = source && source !== 'local' ? [] : localPageData?.items || []
  const onlineOffset = Math.max(0, offset - localTotal.value)
  libraryStore.setTableData({ ...localPageData, items: [...localItems, ...filteredOnline.value.slice(onlineOffset, onlineOffset + Math.max(0, pageSize.value - localItems.length))] })
}
watch(filteredOnline, () => { if (!loading.value) updateTable() })
watch(playbackFilter, () => { currentPage.value = 1; if (!loading.value) updateTable() })
watch(showUnavailable, () => { currentPage.value = 1; if (!loading.value) updateTable() })

// 监听分页变化
const handleSizeChange = () => {
    getSongs()
}
// 监听当前页变化
const handleCurrentChange = () => {
    getSongs()
}

const getSongs = async () => {
    const id = ++requestId
    controller?.abort()
    controller = new AbortController()
    loading.value = true
    loadError.value = ''
    localPageData = null
    localTotal.value = 0
    libraryStore.setTableData(null)
    const keyword = (route.query.query as string || '').trim()
    const artist = String(route.query.artist || '')
    const source = String(route.query.source || '')
    const queryKey = JSON.stringify([keyword, artist, source])
    const localRequest = getAllSongs({
        pageNum: currentPage.value,
        pageSize: pageSize.value,
        songName: artist ? '' : keyword,
        artistName: artist,
        album: '',
    }).then(result=>{
      if(id===requestId && result.code===0){
        localPageData=result.data;localTotal.value=source && source!=='local'?0:result.data?.total || 0
        if(localTotal.value>0){loading.value=false;updateTable()}
      }
      return result
    })

    if (!keyword) {
      sourceStates.value = {}
      onlineResults.value = []
      onlineQuery.value = ''
      onlineTotal.value = 0
    }
    const needsOnlineSearch = Boolean(keyword && onlineQuery.value !== queryKey)
    searchingOnline.value = needsOnlineSearch
    const onlineRequest = needsOnlineSearch
        ? searchOnlineProgressive(keyword, source && source !== 'local' ? [source] : undefined, 50, controller.signal,(songs,states)=>{
          if(id!==requestId)return
          sourceStates.value=states
          onlineResults.value=applyRemembered(artist?songs.filter(song=>artistNames(song.artistName||'').some(name=>normalizeArtist(name)===normalizeArtist(artist))):songs)
          if(songs.length || Object.values(states).some(state=>state!=='搜索中'))loading.value=false
          updateTable()
        })
        : Promise.resolve(null)
    try {
      const [localResult, onlineResult] = await Promise.allSettled([localRequest, onlineRequest])
      if (id !== requestId) return
      const local = localResult.status === 'fulfilled' ? localResult.value : null
      const online = onlineResult.status === 'fulfilled' ? onlineResult.value : null
      if (local?.code === 0 || online?.code === 0 || !needsOnlineSearch && onlineResults.value.length) {
        if (needsOnlineSearch) {
          onlineResults.value = online?.code === 0 && Array.isArray(online.data) ? applyRemembered(online.data) : []
          if (artist) onlineResults.value = onlineResults.value.filter(song => artistNames(song.artistName || '').some(name => normalizeArtist(name) === normalizeArtist(artist)))
          onlineQuery.value = online?.code === 0 ? queryKey : ''
        }
        localTotal.value = source && source !== 'local' ? 0 : local?.data?.total || 0
        localPageData = local?.data
        updateTable()
        if (needsOnlineSearch && online?.code !== 0) ElMessage.warning('在线搜索暂时失败，已显示可用的本地结果')
      } else {
        loadError.value = online?.message || local?.message || '曲库服务无法连接，请重试'
      }
    } catch (error: any) {
      if (id === requestId) loadError.value = error?.message || '无法连接音乐服务'
    } finally {
      if (id === requestId) { searchingOnline.value = false; loading.value = false }
    }
}

watch(
    () => [route.query.query, props.selected, route.query.artist, route.query.source],
    (val, previous) => {
        if (!val[1] || val[1] != '1') return
        if (previous && val.join() !== previous.join()) currentPage.value = 1
        getSongs()
    },
    {
        immediate: true,
    }
)
onUnmounted(() => { requestId++; controller?.abort() })
</script>

<template>
    <div class="flex h-full flex-1 flex-col overflow-hidden px-5 pb-4 pt-5 md:px-8">
        <div class="mb-5 flex items-end justify-between border-b border-border pb-4">
          <div>
            <p class="mb-1 text-[10px] font-semibold tracking-[0.2em] text-primary">LIBRARY</p>
            <h1 class="text-2xl font-semibold">{{ route.query.artist ? `${route.query.artist} · 相关歌曲` : route.query.query ? `“${route.query.query}” 的搜索结果` : '曲库' }}</h1>
            <p v-if="route.query.artist" class="mt-2 text-xs text-muted-foreground">已按平台与歌手名称筛选；同名歌手仍可能出现。</p>
          </div>
          <div v-if="route.query.query" class="text-xs text-muted-foreground">
            本地 {{ localTotal }} 首
            <span v-if="searchingOnline"> · 正在搜索在线曲库…</span>
            <span v-else> · 在线补充 {{ onlineTotal }} 首</span>
          </div>
        </div>
        <div v-if="route.query.query" class="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <label for="playback-filter">在线结果</label>
          <select id="playback-filter" v-model="playbackFilter" class="rounded border border-border bg-background px-3 py-2 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <option value="prefer">按本次播放状态排序</option>
            <option value="all">全部结果</option>
            <option value="no-preview">隐藏已知试听与失败</option>
            <option value="verified">仅本次已完整播完</option>
          </select>
          <span v-if="playbackFilter === 'no-preview'">已隐藏判定为试听或不可播放的在线结果；完整性未知的条目仍会显示，悬停后可补探并自动移除。</span>
          <span v-else>{{ playbackFilter === 'verified' ? '仅显示本次确实完整播完的在线结果，本地曲库不受影响。' : '完整性未知不等于无法播放；时长匹配表示音频时长一致。' }}</span>
          <button v-if="playbackFilter === 'prefer' && (hiddenUnavailableCount || showUnavailable)" type="button"
            class="rounded border border-border bg-background px-3 py-2 text-foreground transition hover:bg-muted"
            @click="showUnavailable = !showUnavailable">
            {{ showUnavailable ? '收起暂不可播结果' : `展开 ${hiddenUnavailableCount} 条暂不可播结果` }}
          </button>
        </div>
        <div v-if="searchingOnline || Object.keys(sourceStates).length" class="mb-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground" role="status"><span v-for="(status,source) in sourceStates" :key="source" :title="status==='检索失败'?'该平台本次请求失败或超时，不影响其他平台，也不表示所有歌曲不可播放。':status==='无结果'?'该平台本次未返回匹配歌曲。':''">{{ sourceLabels[source] || source }} · {{ status }}</span></div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <Table :data="tableData?.items" :loading="loading" :error="loadError"
            :empty-text="searchingOnline ? '正在等待其余音源结果…' : playbackFilter === 'verified' && route.query.query ? '还没有完整播放验证过的结果，可切换到全部结果' : playbackFilter === 'no-preview' && route.query.query ? '在线结果均为已知试听或不可播放，可切换到全部结果查看' : route.query.query ? '没有找到匹配的歌曲' : '曲库还是空的'" @retry="getSongs" />
        </div>
        <nav class="mx-auto flex w-full justify-center mt-3">
            <el-pagination v-model:page-size="pageSize" v-model:currentPage="currentPage" v-bind="state"
                @size-change="handleSizeChange" @current-change="handleCurrentChange" class="mb-3" />
        </nav>
    </div>
</template>
