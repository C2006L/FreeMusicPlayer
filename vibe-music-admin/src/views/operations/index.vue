<script setup lang="ts">
import { ref, onMounted } from "vue";
import { http } from "@/utils/http";
const data = ref<any>(null),
  loading = ref(false),
  error = ref("");
const sources = ref<any>(null);
const visitors = ref<any>(null);
const eventLabels: Record<string, string> = { search: "搜索", stream: "播放", probe: "探测" };
const refresh = async () => {
  loading.value = true;
  error.value = "";
  try {
    const [r, s, v] = await Promise.all([
      http.request<any>("get", "/admin/ops"),
      http.request<any>("get", "/admin/ops/sources"),
      http.request<any>("get", "/admin/ops/visitors")
    ]);
    if (r.code !== 0) throw new Error(r.message);
    data.value = r.data;
    sources.value = s.data;
    visitors.value = v.data;
  } catch (e: any) {
    error.value = e.message || "无法获取诊断信息";
  } finally {
    loading.value = false;
  }
};
onMounted(refresh);
</script>
<template>
  <section class="p-6 space-y-6">
    <header class="flex justify-between">
      <div>
        <h1 class="text-2xl font-semibold">运行与任务诊断</h1>
        <p class="text-sm text-gray-500 mt-2">
          实时数据库任务与审计记录；HTTP
          指标为当前进程启动以来的数据，不是压测成绩。
        </p>
      </div>
      <el-button :loading="loading" @click="refresh">刷新</el-button>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <div v-if="data" class="space-y-6">
      <p>
        执行器：{{ data.worker.active }} /
        {{ data.worker.threads }} 活跃线程，队列 {{ data.worker.queued }} /
        {{ data.worker.queueCapacity }}
      </p>
      <h2 class="text-lg font-medium">音源搜索运行状态</h2>
      <p v-if="sources?.status === 'DOWN'">音源侧车暂不可达</p>
      <template v-else-if="sources"
        ><p>
          并发 {{ sources.active }} / {{ sources.concurrency }} · 等待
          {{ sources.queued }} / {{ sources.queueCapacity }} · 缓存命中
          {{ sources.cacheHits }} · 合并请求 {{ sources.coalesced }}
        </p>
        <el-table
          :data="
            Object.entries(sources.sources || {}).map(([name, value]: any) => ({
              name,
              ...value
            }))
          "
          max-height="340"
          ><el-table-column
            prop="name"
            label="引擎 / 平台"
            min-width="180"
          /><el-table-column prop="requests" label="请求" /><el-table-column
            prop="successes"
            label="成功"
          /><el-table-column prop="empty" label="空结果" /><el-table-column
            prop="failures"
            label="失败"
          /><el-table-column prop="meanMs" label="平均 ms" /><el-table-column
            label="冷却至"
            min-width="180"
            ><template #default="{ row }">{{
              row.openUntil > Date.now()
                ? new Date(row.openUntil).toLocaleTimeString()
                : "—"
            }}</template></el-table-column
          ></el-table
        ></template
      >
      <h2 class="text-lg font-medium">任务状态分布</h2>
      <div class="flex gap-6">
        <span v-for="item in data.jobs" :key="item.status"
          >{{ item.status }}：{{ item.count }}</span
        >
      </div>
      <h2 class="text-lg font-medium">最近任务</h2>
      <el-table :data="data.recentJobs" max-height="340"
        ><el-table-column prop="title" label="任务" /><el-table-column
          prop="user_id"
          label="用户" /><el-table-column
          prop="status"
          label="状态" /><el-table-column
          prop="processed"
          label="已处理" /><el-table-column
          prop="total"
          label="总条目" /><el-table-column prop="failed" label="失败"
      /></el-table>
      <h2 class="text-lg font-medium">HTTP 指标</h2>
      <el-table :data="data.http" max-height="340"
        ><el-table-column prop="method" label="方法" /><el-table-column
          prop="uri"
          label="路由"
          min-width="230" /><el-table-column
          prop="status"
          label="状态码" /><el-table-column
          prop="count"
          label="次数" /><el-table-column
          prop="meanMs"
          label="平均 ms" /><el-table-column prop="maxMs" label="窗口最大 ms"
      /></el-table>
      <h2 class="text-lg font-medium">匿名访客（近 {{ visitors?.windowDays || 7 }} 天）</h2>
      <div v-if="visitors && visitors.events > 0">
        <p>
          去重访客 {{ visitors.uniqueVisitors }} 人 · 今日 {{ visitors.todayVisitors }} 人 ·
          事件 {{ visitors.events }} 条（搜索 {{ visitors.searches }} 次）
        </p>
        <div class="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 class="mb-2 font-medium">搜索关键词 Top</h3>
            <el-table :data="visitors.topKeywords" max-height="320"
              ><el-table-column prop="keyword" label="关键词" min-width="180" /><el-table-column
                prop="count" label="次数" width="90"
            /></el-table>
          </div>
          <div>
            <h3 class="mb-2 font-medium">播放 / 探测来源分布</h3>
            <el-table :data="visitors.sources" max-height="320"
              ><el-table-column prop="source" label="来源" min-width="180" /><el-table-column
                prop="count" label="事件数" width="90"
            /></el-table>
          </div>
        </div>
        <h3 class="mb-2 mt-4 font-medium">最近匿名流水</h3>
        <el-table :data="visitors.recent" max-height="340"
          ><el-table-column prop="visitor_id" label="访客" min-width="220" /><el-table-column
            label="行为" width="90"
            ><template #default="{ row }">{{ eventLabels[row.event] || row.event }}</template></el-table-column
          ><el-table-column prop="keyword" label="关键词" min-width="150" /><el-table-column
            prop="source" label="来源" min-width="150" /><el-table-column
            prop="song_key" label="歌曲" min-width="180" /><el-table-column
            prop="created_at" label="时间" min-width="190"
        /></el-table>
      </div>
      <p v-else class="text-sm text-gray-500">暂无匿名访问记录。</p>
      <h2 class="text-lg font-medium">操作审计</h2>
      <el-table :data="data.audit" max-height="340"
        ><el-table-column prop="user_id" label="用户" /><el-table-column
          prop="action"
          label="操作" /><el-table-column
          prop="resource_id"
          label="资源"
          min-width="230" /><el-table-column
          prop="request_id"
          label="请求编号"
          min-width="230" /><el-table-column
          prop="created_at"
          label="时间"
          min-width="190"
      /></el-table>
    </div>
  </section>
</template>
