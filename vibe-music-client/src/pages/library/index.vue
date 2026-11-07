<script setup lang="ts">
import { getAllSongs, searchOnlineProgressive } from '@/api/system'
import { ElMessage } from 'element-plus'
import { useLibraryStore } from '@/stores/modules/library'
import { artistNames, normalizeArtist } from '@/utils/artists'
import { usePlaybackEvidence } from '@/stores/modules/playbackEvidence'
import { rememberedGrade, availabilityKey } from '@/utils/availabilityProbe'
import { useMediaQuery } from '@vueuse/core'

const isPhone = useMediaQuery('(max-width: 767px)')

const route = useRoute()
const libraryStore = useLibraryStore()
const evidence = usePlaybackEvidence()
const playbackFilter = ref('prefer')
// 只有用户主动「收起」时才把暂不可播的行移出列表；存的是当时 key 的快照，
// 之后悬停补探只更新标签，不会让行继续消失或挪位。
const hiddenBadKeys = ref<string[]>([])
// 「隐藏已知试听与失败」同样用快照：在搜索周期结束时定格，避免逐条补探造成抖动。
const noPreviewHiddenKeys = ref<string[]>([])
let localPageData: any = null
const keyOf = (song: any) => availabilityKey(song)
const hiddenBadSet = computed(() => new Set(hiddenBadKeys.value))
const noPreviewHiddenSet = computed(() => new Set(noPreviewHiddenKeys.value))
// 悬停补探的结果可能只回填到歌曲对象，这里统一读取，保证筛选和表格标签看到同一等级。
const gradeOf = (song: any) => rememberedGrade(song) ?? song.availability
const observedState = (song: any) => evidence.get(song)
const isKnownUnavailable = (song: any) => observedState(song) === 'unavailable' || gradeOf(song) === 'unavailable'
const isKnownBad = (song: any) =>
  ['preview', 'unavailable'].includes(observedState(song)) || ['preview', 'unavailable'].includes(gradeOf(song))
const knownUnavailableCount = computed(() => onlineResults.value.filter(isKnownUnavailable).length)
// 播放/探测不再参与可见集合的实时计算：只在搜索周期结束时或用户切换筛选时定格一次。
const refreshNoPreviewSnapshot = () => {
  noPreviewHiddenKeys.value = playbackFilter.value === 'no-preview'
    ? onlineResults.value.filter(isKnownBad).map(keyOf)
    : []
}
const toggleUnavailable = () => {
  hiddenBadKeys.value = hiddenBadSet.value.size ? [] : onlineResults.value.filter(isKnownUnavailable).map(keyOf)
}
const applyRemembered = (songs: any[]) => songs.map(song => {
  const grade = rememberedGrade(song)
  return grade && song.availability !== grade ? { ...song, availability: grade } : song
})
// 始终保持搜索返回的稳定顺序：同一批结果相对顺序固定，播放与探测只更新标签。
const filteredOnline = computed(() => onlineResults.value.filter(song => {
  if (hiddenBadSet.value.has(keyOf(song))) return false
  if (playbackFilter.value === 'verified') return observedState(song) === 'full'
  if (playbackFilter.value === 'no-preview') return !noPreviewHiddenSet.value.has(keyOf(song))
  return true
}))

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
const sourceLabels:Record<string,string>={kugou:'酷狗',kuwo:'酷我',migu:'咪咕',qianqian:'千千',jamendo:'Jamendo',bilibili:'B站',netease:'网易云',qq:'QQ音乐'}
// 状态行按固定顺序渲染，保证网易云 / QQ 始终排在最后。
const sourceOrder = ['kugou','kuwo','migu','qianqian','jamendo','bilibili','netease','qq']
const orderedSourceStates = computed(() => Object.keys(sourceStates.value)
  .sort((a, b) => (sourceOrder.indexOf(a) + 1 || 99) - (sourceOrder.indexOf(b) + 1 || 99))
  .map(source => [source, sourceStates.value[source]] as const))
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
  // 顶部计数用搜索返回的原始条数，只增不减；筛选只影响表格与分页总数。
  onlineTotal.value = onlineResults.value.length
  state.total = localTotal.value + filteredOnline.value.length
  const offset = (currentPage.value - 1) * pageSize.value
  const source = String(route.query.source || '')
  const localItems = source && source !== 'local' ? [] : localPageData?.items || []
  const onlineOffset = Math.max(0, offset - localTotal.value)
  libraryStore.setTableData({ ...localPageData, items: [...localItems, ...filteredOnline.value.slice(onlineOffset, onlineOffset + Math.max(0, pageSize.value - localItems.length))] })
}
watch(filteredOnline, () => { if (!loading.value) updateTable() })
watch(playbackFilter, () => {
  currentPage.value = 1
  refreshNoPreviewSnapshot()
  if (!loading.value) updateTable()
})

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
      hiddenBadKeys.value = []
      noPreviewHiddenKeys.value = []
    }
    const needsOnlineSearch = Boolean(keyword && onlineQuery.value !== queryKey)
    // 新的一轮搜索从干净状态开始；同一轮内分页沿用已有的折叠/筛选快照。
    if (needsOnlineSearch) {
      hiddenBadKeys.value = []
      noPreviewHiddenKeys.value = []
    }
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
      if (id === requestId) {
        searchingOnline.value = false
        loading.value = false
        // 一轮搜索结束（含中途失败）后，才按当前已知状态定格「隐藏试听/失败」的集合。
        refreshNoPreviewSnapshot()
        updateTable()
      }
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
    <div class="flex h-full flex-1 flex-col overflow-hidden px-5 pb-4 pt-5 max-sm:px-4 max-sm:pb-2 max-sm:pt-2 md:px-8">
        <div class="mb-5 flex flex-wrap items-end justify-between gap-2 border-b border-border pb-4 max-sm:mb-2 max-sm:pb-2">
          <div>
            <p class="mb-1 text-[10px] font-semibold tracking-[0.2em] text-primary">LIBRARY</p>
            <h1 class="text-2xl font-semibold max-sm:text-xl">{{ route.query.artist ? `${route.query.artist} · 相关歌曲` : route.query.query ? `“${route.query.query}” 的搜索结果` : '曲库' }}</h1>
            <p v-if="route.query.artist" class="mt-2 text-xs text-muted-foreground">已按平台与歌手名称筛选；同名歌手仍可能出现。</p>
          </div>
          <div v-if="route.query.query" class="text-xs text-muted-foreground">
            本地 {{ localTotal }} 首
            <span v-if="searchingOnline"> · 正在搜索在线曲库… 已返回 {{ onlineResults.length }} 首</span>
            <span v-else> · 在线补充 {{ onlineTotal }} 首</span>
          </div>
        </div>
        <div v-if="route.query.query" class="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground max-sm:mb-1 max-sm:gap-2">
          <label for="playback-filter" class="max-sm:hidden">在线结果</label>
          <select id="playback-filter" v-model="playbackFilter" class="min-h-[44px] rounded border border-border bg-background px-3 py-2 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary max-sm:w-full">
            <option value="prefer">默认顺序（播放与探测不重排）</option>
            <option value="all">全部结果</option>
            <option value="no-preview">隐藏已知试听与失败</option>
            <option value="verified">仅本次已完整播完</option>
          </select>
          <span v-if="playbackFilter === 'no-preview'" class="max-sm:w-full max-sm:text-[10px] max-sm:leading-4">已在本次搜索结束时定格判定为试听或不可播放的结果；之后补探只更新状态标签，不会让行逐条消失。</span>
          <span v-else class="max-sm:w-full max-sm:text-[10px] max-sm:leading-4">{{ playbackFilter === 'verified' ? '仅显示本次确实完整播完的在线结果，本地曲库不受影响。' : '保持搜索返回的稳定顺序；悬停、播放与探测只更新状态标签，不移动列表行。' }}</span>
          <button v-if="playbackFilter === 'prefer' && onlineResults.length" type="button"
            :disabled="!knownUnavailableCount && !hiddenBadKeys.length"
            class="min-h-[44px] rounded border border-border bg-background px-3 py-2 text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 max-sm:w-full"
            @click="toggleUnavailable">
            {{ hiddenBadKeys.length ? `展开 ${hiddenBadKeys.length} 条暂不可播结果` : knownUnavailableCount ? `收起 ${knownUnavailableCount} 条暂不可播结果` : '暂无可收起的不可播结果' }}
          </button>
        </div>
        <div v-if="searchingOnline || Object.keys(sourceStates).length" class="mb-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground max-sm:mb-1 max-sm:gap-x-2 max-sm:text-[10px] max-sm:leading-4" role="status"><span v-for="([source,status]) in orderedSourceStates" :key="source" :title="status==='检索失败'?'该平台本次请求失败或超时，不影响其他平台，也不表示所有歌曲不可播放。':status==='无结果'?'该平台本次未返回匹配歌曲。':''">{{ sourceLabels[source] || source }} · {{ status }}</span></div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <Table :data="tableData?.items" :loading="loading" :error="loadError"
            :empty-text="searchingOnline ? '正在等待其余音源结果…' : playbackFilter === 'verified' && route.query.query ? '还没有完整播放验证过的结果，可切换到全部结果' : playbackFilter === 'no-preview' && route.query.query ? '在线结果均为已知试听或不可播放，可切换到全部结果查看' : route.query.query ? '没有找到匹配的歌曲' : '曲库还是空的'" @retry="getSongs" />
        </div>
        <nav class="mx-auto flex w-full justify-center mt-3 max-sm:mt-1">
            <el-pagination v-model:page-size="pageSize" v-model:currentPage="currentPage" v-bind="state" :pager-count="isPhone ? 5 : 7"
                @size-change="handleSizeChange" @current-change="handleCurrentChange" class="mb-3" />
        </nav>
    </div>
</template>
