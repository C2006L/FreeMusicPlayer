<script setup lang="ts">
import { getAllSongs, searchOnlineSongs } from '@/api/system'
import { ElMessage } from 'element-plus'
import { useLibraryStore } from '@/stores/modules/library'

const route = useRoute()
const libraryStore = useLibraryStore()

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

const state = reactive({
    size: 'default',
    disabled: false,
    background: false,
    layout: 'total, sizes, prev, pager, next, jumper',
    total: 0,
    pageSizes: [20, 30, 50],
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
    loading.value = true
    loadError.value = ''
    libraryStore.setTableData(null)
    const keyword = (route.query.query as string || '').trim()
    const localRequest = getAllSongs({
        pageNum: currentPage.value,
        pageSize: pageSize.value,
        songName: keyword,
        artistName: '',
        album: '',
    })

    if (!keyword) {
      onlineResults.value = []
      onlineQuery.value = ''
      onlineTotal.value = 0
    }
    const needsOnlineSearch = Boolean(keyword && onlineQuery.value !== keyword)
    searchingOnline.value = needsOnlineSearch
    const onlineRequest = needsOnlineSearch
        ? searchOnlineSongs(keyword, undefined, 20).catch(() => null)
        : Promise.resolve(null)
    try {
      const [local, online] = await Promise.all([localRequest, onlineRequest])
      if (local.code === 0 && local.data) {
        if (needsOnlineSearch) {
          onlineResults.value = online?.code === 0 && Array.isArray(online.data) ? online.data : []
          onlineQuery.value = online?.code === 0 ? keyword : ''
        }
        localTotal.value = local.data.total || 0
        onlineTotal.value = onlineResults.value.length
        state.total = localTotal.value + onlineTotal.value
        const offset = (currentPage.value - 1) * pageSize.value
        const localItems = local.data.items || []
        const onlineOffset = Math.max(0, offset - localTotal.value)
        const onlineItems = onlineResults.value.slice(onlineOffset, onlineOffset + Math.max(0, pageSize.value - localItems.length))
        libraryStore.setTableData({
            ...local.data,
            items: [...localItems, ...onlineItems],
        })
        if (online && online.code !== 0) ElMessage.warning(online.message)
      } else {
        loadError.value = local.message || '曲库加载失败'
      }
    } catch (error: any) {
      loadError.value = error?.message || '无法连接音乐服务'
    } finally {
      searchingOnline.value = false
      loading.value = false
    }
}

watch(
    () => [route.query.query, props.selected],
    (val, previous) => {
        if (!val[1] || val[1] != '1') return
        if (previous && val[0] !== previous[0]) currentPage.value = 1
        getSongs()
    },
    {
        immediate: true,
    }
)
</script>

<template>
    <div class="flex h-full flex-1 flex-col overflow-hidden px-5 pb-4 pt-5 md:px-8">
        <div class="mb-5 flex items-end justify-between border-b border-border pb-4">
          <div>
            <p class="mb-1 text-[10px] font-semibold tracking-[0.2em] text-primary">LIBRARY</p>
            <h1 class="text-2xl font-semibold">{{ route.query.query ? `“${route.query.query}” 的搜索结果` : '曲库' }}</h1>
          </div>
          <div v-if="route.query.query" class="text-xs text-muted-foreground">
            本地 {{ localTotal }} 首
            <span v-if="searchingOnline"> · 正在搜索在线曲库…</span>
            <span v-else> · 在线补充 {{ onlineTotal }} 首</span>
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <Table :data="tableData?.items" :loading="loading" :error="loadError"
            :empty-text="route.query.query ? '没有找到匹配的歌曲' : '曲库还是空的'" @retry="getSongs" />
        </div>
        <nav class="mx-auto flex w-full justify-center mt-3">
            <el-pagination v-model:page-size="pageSize" v-model:currentPage="currentPage" v-bind="state"
                @size-change="handleSizeChange" @current-change="handleCurrentChange" class="mb-3" />
        </nav>
    </div>
</template>
