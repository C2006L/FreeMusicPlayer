<script setup lang="ts">
import { computed } from "vue";
import ReCol from "@/components/ReCol";
import { useDark } from "./utils";
import { ReNormalCountTo } from "@/components/ReCountTo";
import { ChartBar, ChartLine, ChartPie1 } from "./components/charts";
import useChartData from "./hooks/useChartData";
import GroupLine from "@iconify-icons/ri/group-line";
import Artist from "@iconify-icons/ri/mic-fill";
import Music from "@iconify-icons/ri/music-2-fill";
import Album from "@iconify-icons/ri/album-fill";

defineOptions({
  name: "Welcome"
});

const { isDark } = useDark();
const { metrics, loading, error, refresh } = useChartData();

const userCount = computed(() => metrics.value?.users.total ?? 0);
const todayUsers = computed(() => metrics.value?.users.today ?? 0);
const artistCount = computed(() => metrics.value?.artists.total ?? 0);
const artistsWithArea = computed(() => metrics.value?.artists.withArea ?? 0);
const songCount = computed(() => metrics.value?.songs.total ?? 0);
const activeSongs = computed(() => metrics.value?.songs.active ?? 0);
const playlistCount = computed(() => metrics.value?.playlists.total ?? 0);
// 用户卡片的趋势线来自 tb_user.create_time 的 14 天按日统计，只取最近 7 天。
const userSpark = computed(() =>
  (metrics.value?.userTrend ?? []).slice(-7).map(point => point.count)
);
// 图表类目与数值全部来自数据库 GROUP BY 结果。
const sourceData = computed(() => metrics.value?.sources ?? []);
const mediaStatusData = computed(() => metrics.value?.mediaStatus ?? []);
const visitorTrendData = computed(() =>
  (metrics.value?.visitorTrend ?? []).map(point => ({
    name: point.date.slice(5),
    count: point.count
  }))
);
const keywordData = computed(() => metrics.value?.topKeywords ?? []);
const importJobData = computed(() => metrics.value?.importJobs ?? []);
</script>

<template>
  <div class="console-dashboard">
    <header class="dashboard-heading">
      <div>
        <p class="dashboard-kicker">LIBRARY OVERVIEW</p>
        <h1>内容控制台</h1>
        <p class="dashboard-description">
          数据来自本机数据库实时聚合：数字卡为表计数，图表为 GROUP BY
          结果，空数据时显示空态。
        </p>
      </div>
      <div class="dashboard-actions">
        <span v-if="metrics?.generatedAt" class="dashboard-time"
          >更新于 {{ metrics.generatedAt }}</span
        >
        <el-button :loading="loading" @click="refresh">刷新</el-button>
      </div>
    </header>
    <p v-if="error" class="dashboard-error" role="alert">{{ error }}</p>
    <div class="section-label">关键数据</div>
    <el-row :gutter="24" justify="space-around">
      <re-col
        v-motion
        class="mb-[18px]"
        :value="6"
        :md="12"
        :sm="12"
        :xs="24"
        :initial="{ opacity: 0, y: 100 }"
        :enter="{ opacity: 1, y: 0, transition: { delay: 80 * 1 } }"
      >
        <el-card class="line-card" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">{{ "用户数量" }}</span>
            <div
              class="w-8 h-8 flex justify-center items-center rounded-md"
              :style="{
                backgroundColor: isDark ? 'transparent' : '#effaff'
              }"
            >
              <IconifyIconOffline
                :icon="GroupLine"
                :color="'#ef6f52'"
                width="18"
              />
            </div>
          </div>
          <div class="flex justify-between items-start mt-3">
            <div class="w-1/2">
              <ReNormalCountTo
                :duration="2200"
                :fontSize="'2.5em'"
                :startVal="0"
                :endVal="userCount"
              />
            </div>
            <ChartLine
              class="!w-1/2"
              :color="'#ef6f52'"
              :data="userSpark"
            />
          </div>
          <p class="metric-note">注册用户 · 今日新增 {{ todayUsers }}</p>
        </el-card>
      </re-col>

      <re-col
        v-motion
        class="mb-[18px]"
        :value="6"
        :md="12"
        :sm="12"
        :xs="24"
        :initial="{ opacity: 0, y: 100 }"
        :enter="{ opacity: 1, y: 0, transition: { delay: 80 * 2 } }"
      >
        <el-card class="line-card" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">{{ "歌手数量" }}</span>
            <div
              class="w-8 h-8 flex justify-center items-center rounded-md"
              :style="{
                backgroundColor: isDark ? 'transparent' : '#fff5f4'
              }"
            >
              <IconifyIconOffline
                :icon="Artist"
                :color="'#e7a36e'"
                width="18"
              />
            </div>
          </div>
          <div class="flex justify-between items-start mt-3">
            <div class="w-full">
              <ReNormalCountTo
                :duration="2200"
                :fontSize="'2.5em'"
                :startVal="0"
                :endVal="artistCount"
              />
            </div>
          </div>
          <p class="metric-note">
            {{ artistsWithArea }} 位已标注国籍 ·
            {{ metrics?.artists.withGender ?? 0 }} 位已标注性别
          </p>
        </el-card>
      </re-col>

      <re-col
        v-motion
        class="mb-[18px]"
        :value="6"
        :md="12"
        :sm="12"
        :xs="24"
        :initial="{ opacity: 0, y: 100 }"
        :enter="{ opacity: 1, y: 0, transition: { delay: 80 * 3 } }"
      >
        <el-card class="line-card" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">{{ "歌曲记录" }}</span>
            <div
              class="w-8 h-8 flex justify-center items-center rounded-md"
              :style="{
                backgroundColor: isDark ? 'transparent' : '#eff8f4'
              }"
            >
              <IconifyIconOffline :icon="Music" :color="'#d8c0ae'" width="18" />
            </div>
          </div>
          <div class="flex justify-between items-start mt-3">
            <div class="w-full">
              <ReNormalCountTo
                :duration="2200"
                :fontSize="'2.5em'"
                :startVal="0"
                :endVal="songCount"
              />
            </div>
          </div>
          <p class="metric-note">
            已启用 {{ activeSongs }} · 其余为历史种子记录（disabled）
          </p>
        </el-card>
      </re-col>

      <re-col
        v-motion
        class="mb-[18px]"
        :value="6"
        :md="12"
        :sm="12"
        :xs="24"
        :initial="{ opacity: 0, y: 100 }"
        :enter="{ opacity: 1, y: 0, transition: { delay: 80 * 4 } }"
      >
        <el-card class="line-card" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">{{ "歌单数量" }}</span>
            <div
              class="w-8 h-8 flex justify-center items-center rounded-md"
              :style="{
                backgroundColor: isDark ? 'transparent' : '#f6f4fe'
              }"
            >
              <IconifyIconOffline :icon="Album" :color="'#9d7d6c'" width="18" />
            </div>
          </div>
          <div class="flex justify-between items-start mt-3">
            <div class="w-full">
              <ReNormalCountTo
                :duration="2200"
                :fontSize="'2.5em'"
                :startVal="0"
                :endVal="playlistCount"
              />
            </div>
          </div>
          <p class="metric-note">后台维护的系统歌单</p>
        </el-card>
      </re-col>

      <re-col
        v-motion
        class="mb-[18px]"
        :value="12"
        :xs="24"
        :initial="{ opacity: 0, y: 100 }"
        :enter="{ opacity: 1, y: 0, transition: { delay: 400 } }"
      >
        <el-card class="bar-card" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">曲库来源分布</span>
            <span class="chart-caption">tb_song.source</span>
          </div>
          <div class="chart-body">
            <ChartPie1
              :chartData="sourceData"
              seriesName="歌曲数"
              emptyText="tb_song 暂无记录"
            />
          </div>
        </el-card>
      </re-col>

      <re-col
        v-motion
        class="mb-[18px]"
        :value="12"
        :xs="24"
        :initial="{ opacity: 0, y: 100 }"
        :enter="{ opacity: 1, y: 0, transition: { delay: 400 } }"
      >
        <el-card class="bar-card" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">曲库可播性分布</span>
            <span class="chart-caption">tb_song.media_status</span>
          </div>
          <div class="chart-body">
            <ChartBar
              :items="mediaStatusData"
              seriesName="歌曲数"
              emptyText="暂无曲库记录"
            />
          </div>
        </el-card>
      </re-col>

      <re-col
        v-motion
        class="mb-[18px]"
        :value="12"
        :xs="24"
        :initial="{ opacity: 0, y: 100 }"
        :enter="{ opacity: 1, y: 0, transition: { delay: 400 } }"
      >
        <el-card class="bar-card" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">匿名访客趋势（近 7 天去重）</span>
            <span class="chart-caption">fmp_visitor_event</span>
          </div>
          <div class="chart-body">
            <ChartBar
              :items="visitorTrendData"
              seriesName="访客"
              emptyText="近 7 天暂无匿名访问"
            />
          </div>
        </el-card>
      </re-col>

      <re-col
        v-motion
        class="mb-[18px]"
        :value="12"
        :xs="24"
        :initial="{ opacity: 0, y: 100 }"
        :enter="{ opacity: 1, y: 0, transition: { delay: 400 } }"
      >
        <el-card class="bar-card" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">匿名搜索关键词 Top</span>
            <span class="chart-caption">search · 近 7 天</span>
          </div>
          <div class="chart-body">
            <ChartBar
              :items="keywordData"
              seriesName="搜索次数"
              horizontal
              emptyText="暂无匿名搜索关键词"
            />
          </div>
        </el-card>
      </re-col>

      <re-col
        v-motion
        class="mb-[18px]"
        :value="12"
        :xs="24"
        :initial="{ opacity: 0, y: 100 }"
        :enter="{ opacity: 1, y: 0, transition: { delay: 400 } }"
      >
        <el-card class="bar-card" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">导入任务状态分布</span>
            <span class="chart-caption">fmp_import_job</span>
          </div>
          <div class="chart-body">
            <ChartBar
              :items="importJobData"
              seriesName="任务数"
              emptyText="暂无导入任务"
            />
          </div>
        </el-card>
      </re-col>
    </el-row>
  </div>
</template>

<style lang="scss" scoped>
:deep(.el-card) {
  --el-card-border-color: none;

  /* 解决概率进度条宽度 */
  .el-progress--line {
    width: 85%;
  }

  /* 解决概率进度条字体大小 */
  .el-progress-bar__innerText {
    font-size: 15px;
  }

  /* 隐藏 el-scrollbar 滚动条 */
  .el-scrollbar__bar {
    display: none;
  }

  /* el-timeline 每一项上下、左右边距 */
  .el-timeline-item {
    margin: 0 6px;
  }
}

.main-content {
  margin: 20px 20px 0 !important;
}

.console-dashboard {
  max-width: 1500px;
  margin: 0 auto;
}

.dashboard-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  padding: 14px 2px 32px;
  margin-bottom: 22px;
  border-bottom: 1px solid var(--fmp-border);
}

.dashboard-kicker,
.section-label {
  color: var(--fmp-accent);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.18em;
}

.dashboard-heading h1 {
  margin: 5px 0 8px;
  color: var(--fmp-text);
  font-family: "Noto Serif SC", "Songti SC", serif;
  font-size: 34px;
  font-weight: 650;
  letter-spacing: -0.04em;
}

.dashboard-description {
  margin: 0;
  color: var(--fmp-text-muted);
  font-size: 14px;
}

.dashboard-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.dashboard-time {
  color: var(--fmp-text-muted);
  font-size: 12px;
}

.dashboard-error {
  margin: 0 0 16px;
  padding: 10px 12px;
  color: #b42318;
  background: #fef3f2;
  border-radius: 8px;
}

.metric-note {
  margin: 8px 0 0;
  color: var(--fmp-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.chart-caption {
  color: var(--fmp-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}

.chart-body {
  height: 253px;
  margin-top: 12px;
}

.section-label {
  margin: 0 0 12px 2px;
}

.bar-position {
  margin-top: 18px;
}

@media (width <= 760px) {
  .dashboard-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .dashboard-actions {
    justify-content: flex-start;
  }
}
</style>
