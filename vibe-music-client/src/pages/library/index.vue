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
const searchingOnline = ref(false)

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
    libraryStore.setTableData(null)
    const keyword = (route.query.query as string || '').trim()
    const localRequest = getAllSongs({
        pageNum: currentPage.value,
        pageSize: pageSize.value,
        songName: keyword,
        artistName: '',
        album: '',
    })

    searchingOnline.value = Boolean(keyword && currentPage.value === 1)
    const onlineRequest = searchingOnline.value
        ? searchOnlineSongs(keyword).catch(() => null)
        : Promise.resolve(null)
    const [local, online] = await Promise.all([localRequest, onlineRequest])

    if (local.code === 0 && local.data) {
        const onlineItems = online?.code === 0 && Array.isArray(online.data)
            ? online.data
            : []
        localTotal.value = local.data.total || 0
        onlineTotal.value = onlineItems.length
        state.total = localTotal.value
        libraryStore.setTableData({
            ...local.data,
            items: [...(local.data.items || []), ...onlineItems],
        })
        if (online && online.code !== 0) ElMessage.warning(online.message)
    }
    searchingOnline.value = false
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
    <div class="flex-1 h-full flex flex-col overflow-hidden">
        <div v-if="route.query.query" class="px-4 pb-2 text-xs text-muted-foreground">
            本地曲库 {{ localTotal }} 首
            <span v-if="searchingOnline"> · 正在搜索在线曲库…</span>
            <span v-else> · 在线补充 {{ onlineTotal }} 首</span>
        </div>
        <Table :data="tableData?.items" class="flex-1 overflow-x-hidden" />
        <nav class="mx-auto flex w-full justify-center mt-3">
            <el-pagination v-model:page-size="pageSize" v-model:currentPage="currentPage" v-bind="state"
                @size-change="handleSizeChange" @current-change="handleCurrentChange" class="mb-3" />
        </nav>
    </div>
</template>
