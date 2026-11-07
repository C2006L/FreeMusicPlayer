<script setup lang="ts">
import { workspaceRequest } from '@/api/workspace'
import { UserStore } from '@/stores/modules/user'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Song } from '@/api/interface'
import { useMediaQuery } from '@vueuse/core'
import { createUuid } from '@/utils/uuid'

const isPhone = useMediaQuery('(max-width: 767px)')

const user = UserStore()
const route = useRoute(),
  router = useRouter()
const tab = ref(String(route.query.tab || 'collections'))
const jobs = ref<any[]>([]),
  collections = ref<any[]>([]),
  stats = ref<any>(null)
const selected = ref<any>(null),
  songs = ref<Song[]>([]),
  songPage = ref(1)
const details = ref<any[]>([]),
  detailsVisible = ref(false)
const loading = ref(false),
  submitting = ref(false),
  error = ref('')
const link = ref(''),
  title = ref(''),
  requestKey = ref(createUuid())
let alive = true,
  timer: ReturnType<typeof setInterval> | undefined,
  controller: AbortController | undefined,
  lastRefresh = 0
// 只有排队/执行中的任务需要高频刷新；空闲时降频，避免空转请求。
const hasActiveJobs = computed(() =>
  jobs.value.some((job) => ['QUEUED', 'RUNNING'].includes(job.status))
)
const labels: Record<string, string> = {
  QUEUED: '等待执行',
  RUNNING: '执行中',
  SUCCEEDED: '已完成',
  PARTIAL: '部分成功',
  FAILED: '失败',
  CANCELLED: '已取消',
}
watch([link, title], () => {
  requestKey.value = createUuid()
})
watch(
  () => route.query.tab,
  (value) => {
    tab.value = String(value || 'collections')
  }
)
const choose = (value: string) =>
  router.replace({ path: '/workspace', query: { tab: value } })
const refresh = async (force = false) => {
  if (!user.isLoggedIn || loading.value) return
  if (!force && !hasActiveJobs.value && Date.now() - lastRefresh < 5000)
    return
  lastRefresh = Date.now()
  const owner = user.userInfo.userId
  loading.value = true
  error.value = ''
  controller = new AbortController()
  try {
    const [j, c, s] = await Promise.all([
      workspaceRequest('get', '/imports', undefined, controller.signal),
      workspaceRequest('get', '/collections', undefined, controller.signal),
      workspaceRequest('get', '/listening', undefined, controller.signal),
    ])
    if (!alive || !user.isLoggedIn || owner !== user.userInfo.userId) return
    jobs.value = j
    collections.value = c
    stats.value = s
  } catch (e: any) {
    if (alive && e.code !== 'ERR_CANCELED')
      error.value = e.message || '无法加载个人工作区'
  } finally {
    loading.value = false
  }
}
const submit = async () => {
  if (!link.value.trim() || !title.value.trim() || submitting.value) return
  submitting.value = true
  try {
    await workspaceRequest('post', '/imports', {
      link: link.value.trim(),
      title: title.value.trim(),
      requestKey: requestKey.value,
    })
    ElMessage.success('任务已创建，重复提交会返回原任务')
    await choose('tasks')
    await refresh(true)
  } catch (e: any) {
    ElMessage.error(e.message)
  } finally {
    submitting.value = false
  }
}
const action = async (job: any, kind: string) => {
  try {
    await workspaceRequest('post', `/imports/${job.id}/${kind}`)
    await refresh()
  } catch (e: any) {
    ElMessage.error(e.message)
  }
}
const showDetails = async (job: any) => {
  try {
    details.value = (
      await workspaceRequest<any[]>('get', `/imports/${job.id}/items`)
    ).map((item) => {
      let name = '元数据不可读'
      try {
        name = JSON.parse(item.metadata).songName
      } catch {
        /* Show explicit failure. */
      }
      return { ...item, name }
    })
    detailsVisible.value = true
  } catch (e: any) {
    ElMessage.error(e.message)
  }
}
const openCollection = async (collection: any) => {
  selected.value = collection
  songs.value = []
  songPage.value = 1
  try {
    const data = await workspaceRequest<Song[]>(
      'get',
      `/collections/${collection.id}/songs`
    )
    if (selected.value?.id === collection.id) songs.value = data
  } catch (e: any) {
    ElMessage.error(e.message)
  }
}
const rename = async (collection: any) => {
  try {
    const { value } = await ElMessageBox.prompt('输入歌单名称', '重命名', {
      inputValue: collection.title,
      inputValidator: (v) =>
        (!!v?.trim() && v.length <= 160) || '名称需要1到160个字符',
    })
    await workspaceRequest('patch', `/collections/${collection.id}`, {
      title: value,
    })
    await refresh()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close')
      ElMessage.error(e.message || '重命名失败')
  }
}
const remove = async (collection: any) => {
  try {
    await ElMessageBox.confirm(
      '只删除你导入的歌单与条目，不删除平台音乐或其他用户数据。',
      '确认删除',
      { type: 'warning' }
    )
    await workspaceRequest('delete', `/collections/${collection.id}`)
    if (selected.value?.id === collection.id) selected.value = null
    await refresh()
  } catch (e: any) {
    if (e !== 'cancel' && e !== 'close')
      ElMessage.error(e.message || '删除失败')
  }
}
watch(
  () => [user.isLoggedIn, user.userInfo.userId],
  () => {
    controller?.abort()
    jobs.value = []
    collections.value = []
    stats.value = null
    selected.value = null
    songs.value = []
    details.value = []
    detailsVisible.value = false
    if (timer) clearInterval(timer)
    if (user.isLoggedIn) {
      void refresh(true)
      // 有活跃任务时 1.5 秒轮询到终态（即使页面在后台也继续），空闲时 5 秒一次。
      timer = setInterval(() => {
        if (hasActiveJobs.value || !document.hidden) void refresh()
      }, 1500)
    }
  },
  { immediate: true }
)
onUnmounted(() => {
  alive = false
  controller?.abort()
  if (timer) clearInterval(timer)
})
</script>

<template>
  <section class="workspace-page">
    <header
      class="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5"
    >
      <div>
        <p class="text-[10px] tracking-widest text-primary">
          PERSONAL WORKSPACE
        </p>
        <h1 class="text-2xl font-semibold mt-1">我的音乐工作区</h1>
      </div>
      <button :disabled="loading" class="text-sm text-primary" @click="refresh(true)">
        {{ loading ? '刷新中…' : '刷新数据' }}
      </button>
    </header>
    <p v-if="!user.isLoggedIn" class="py-12 text-muted-foreground">
      请先登录，任务、个人歌单和播放统计按账号独立保存。
    </p>
    <template v-else>
      <nav class="flex gap-5 border-b border-border" aria-label="工作区分类">
        <button
          v-for="item in [
            { key: 'collections', name: '个人歌单' },
            { key: 'tasks', name: '导入任务' },
            { key: 'stats', name: '听歌统计' },
          ]"
          :key="item.key"
          :class="[
            'py-3 text-sm',
            tab === item.key
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground',
          ]"
          @click="choose(item.key)"
        >
          {{ item.name }}
        </button>
      </nav>
      <p v-if="error" role="alert" class="text-primary py-3">{{ error }}</p>
      <div v-if="tab === 'tasks'" class="space-y-6 pt-5">
        <form class="space-y-3" @submit.prevent="submit">
          <h2 class="font-medium">从公开链接导入歌单元数据</h2>
          <p class="text-xs text-muted-foreground">
            支持网易云 playlist、QQ ryqq/playlist、B站 video 的 HTTPS
            链接。不会下载音频或保证完整播放。
          </p>
          <input
            v-model="title"
            class="workspace-input"
            maxlength="160"
            placeholder="个人歌单名称"
            aria-label="导入歌单名称"
            required
          /><input
            v-model="link"
            class="workspace-input"
            maxlength="500"
            placeholder="https://music.163.com/playlist?id=…"
            aria-label="公开歌单链接"
            required
          /><button class="workspace-button" :disabled="submitting">
            {{ submitting ? '提交中…' : '创建导入任务' }}
          </button>
        </form>
        <p v-if="!jobs.length" class="text-muted-foreground">
          还没有导入任务。任务支持取消、失败重试与重启后恢复检查点。
        </p>
        <article
          v-for="job in jobs"
          :key="job.id"
          class="py-4 border-b border-border"
        >
          <div class="flex flex-wrap justify-between gap-2">
            <strong>{{ job.title }}</strong
            ><span class="text-sm text-primary">{{
              labels[job.status] || job.status
            }}</span>
          </div>
          <p class="my-2 text-xs text-muted-foreground">
            {{ job.source }} · {{ job.processed }} / {{ job.total }} 条 · 成功
            {{ job.succeeded }} · 失败 {{ job.failed
            }}<span v-if="job.cancel_requested && job.status === 'RUNNING'">
              · 正在等待当前操作结束后取消</span
            >
          </p>
          <progress
            class="w-full h-1.5 accent-primary"
            :max="Math.max(job.total, 1)"
            :value="job.processed"
          />
          <p v-if="job.error_text" class="text-xs text-primary mt-2">
            {{ job.error_text }}
          </p>
          <div class="flex gap-4 mt-3 text-xs">
            <button @click="showDetails(job)">查看明细</button
            ><button
              v-if="['QUEUED', 'RUNNING'].includes(job.status)"
              @click="action(job, 'cancel')"
            >
              取消任务</button
            ><button
              v-if="['FAILED', 'PARTIAL', 'CANCELLED'].includes(job.status)"
              class="text-primary"
              @click="action(job, 'retry')"
            >
              重试未成功条目
            </button>
          </div>
        </article>
      </div>
      <div v-else-if="tab === 'collections'" class="pt-5">
        <p v-if="!collections.length" class="text-muted-foreground">
          还没有个人歌单，去“导入任务”添加公开歌单或 B 站合集。
        </p>
        <article
          v-for="collection in collections"
          :key="collection.id"
          class="flex items-center gap-4 py-4 border-b border-border"
        >
          <button
            class="flex-1 min-w-0 text-left"
            @click="openCollection(collection)"
          >
            <strong>{{ collection.title }}</strong
            ><span class="block text-xs text-muted-foreground mt-1"
              >{{ collection.source }} · {{ collection.song_count }} 首</span
            ></button
          ><button class="text-xs" @click="rename(collection)">重命名</button
          ><button
            class="text-xs text-muted-foreground"
            @click="remove(collection)"
          >
            删除
          </button>
        </article>
        <div v-if="selected" class="mt-8">
          <h2 class="text-lg mb-3">{{ selected.title }}</h2>
          <Table
            :data="songs.slice((songPage - 1) * 20, songPage * 20)"
            empty-text="该歌单暂无已成功导入条目"
          /><el-pagination
            v-if="songs.length > 20"
            v-model:current-page="songPage"
            :page-size="20"
            :total="songs.length"
            :pager-count="isPhone ? 5 : 7"
            layout="prev,pager,next"
          />
        </div>
      </div>
      <div v-else class="pt-5 space-y-7">
        <p class="text-xs text-muted-foreground">
          近30天，上海时区；累计实际播放时间，快进不计时，重复上报不重复累计。页面关闭前尚未上报的短片段可能丢失；数据不是版权或完整音源证明。
        </p>
        <div class="flex flex-wrap gap-10">
          <div>
            <strong class="text-3xl tabular-nums">{{
              Math.floor(Number(stats?.summary?.playedSeconds || 0) / 60)
            }}</strong
            ><span class="ml-2 text-sm">分钟</span>
          </div>
          <div>
            <strong class="text-3xl">{{
              stats?.summary?.playCount || 0
            }}</strong
            ><span class="ml-2 text-sm">次有效播放</span>
          </div>
          <div>
            <strong class="text-3xl">{{
              stats?.summary?.uniqueSongs || 0
            }}</strong
            ><span class="ml-2 text-sm">首歌曲</span>
          </div>
        </div>
        <h2 class="font-medium">最常听</h2>
        <p v-if="!stats?.top?.length" class="text-muted-foreground">
          还没有账号播放数据，登录后实际播放歌曲即可开始记录。
        </p>
        <ol>
          <li
            v-for="(song, index) in stats?.top"
            :key="song.song_key"
            class="flex gap-4 py-3 border-b border-border"
          >
            <span>{{ index + 1 }}</span
            ><button
              class="flex-1 text-left"
              @click="
                router.push({ path: '/library', query: { query: song.title } })
              "
            >
              {{ song.title
              }}<small class="block text-muted-foreground"
                >{{ song.artist }} · {{ song.source }}</small
              ></button
            ><span class="text-xs tabular-nums"
              >{{ song.playedSeconds }} 秒</span
            >
          </li>
        </ol>
        <h2 class="font-medium">账号最近播放</h2>
        <ul>
          <li
            v-for="(song, index) in stats?.recent"
            :key="index"
            class="py-2 text-sm"
          >
            {{ song.title }} · {{ song.artist }}
            <span class="text-xs text-muted-foreground">{{
              song.playedAt
            }}</span>
          </li>
        </ul>
      </div>
    </template>
    <el-dialog
      v-model="detailsVisible"
      title="导入条目明细"
      width="min(760px,94vw)"
      ><div class="max-h-[55vh] overflow-y-auto">
        <p v-if="!details.length">尚未获取目录，或任务在获取目录前结束。</p>
        <div
          v-for="item in details"
          :key="item.position"
          class="py-3 border-b border-border"
        >
          <span>{{ item.position + 1 }}. {{ item.name }}</span
          ><small class="block text-muted-foreground"
            >{{ item.status }} {{ item.error_text }}</small
          >
        </div>
      </div></el-dialog
    >
  </section>
</template>
<style scoped>
.workspace-page {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  max-width: 1100px;
  margin: auto;
  padding: 28px 32px;
}
.workspace-input {
  display: block;
  width: 100%;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
}
.workspace-button {
  padding: 9px 15px;
  border-radius: 6px;
  background: var(--primary);
  color: #151515;
  font-size: 13px;
}
.workspace-button:disabled {
  opacity: 0.5;
}
progress {
  appearance: none;
  border: 0;
  background: hsl(var(--border));
  color: var(--primary);
}
progress::-webkit-progress-bar { background: hsl(var(--border)); }
progress::-webkit-progress-value { background: var(--primary); }
progress::-moz-progress-bar { background: var(--primary); }
button:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
/* 原生输入框只给一层细边框 + 轻光晕，避免和页面其它输入框出现粗细不一的描边 */
input:focus-visible {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgb(239 111 82 / 0.12);
}
@media (max-width: 640px) {
  .workspace-page {
    padding: 20px 14px;
  }
}
@media (max-width: 767px) {
  .workspace-page button,
  .workspace-button {
    min-height: 44px;
  }
  .workspace-input {
    min-height: 44px;
  }
}
</style>
