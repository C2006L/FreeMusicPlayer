<script setup lang="ts">
import { ref } from "vue";
import ReCol from "@/components/ReCol";
import { useDark } from "./utils";
import { ReNormalCountTo } from "@/components/ReCountTo";
import { ChartBar, ChartLine, ChartPie1, ChartPie2 } from "./components/charts";
import useChartData from "./hooks/useChartData";
import GroupLine from "@iconify-icons/ri/group-line";
import Artist from "@iconify-icons/ri/mic-fill";
import Music from "@iconify-icons/ri/music-2-fill";
import Album from "@iconify-icons/ri/album-fill";

defineOptions({
  name: "Welcome"
});

const { isDark } = useDark();

const {
  userCount,
  artistCount,
  songCount,
  playlistCount,
  westernPopCount,
  chinesePopCount,
  cantonesePopCount,
  koreanPopCount,
  classicCount,
  hiphopCount,
  rockCount,
  electronicCount,
  jazzCount,
  lightCount,
  countAmerica,
  countChina,
  countKorea,
  countJapan,
  countGermany,
  countBritain,
  maleCount,
  femaleCount
} = useChartData();

const pieChartData1 = ref([
  { value: westernPopCount, name: "欧美流行" },
  { value: chinesePopCount, name: "华语流行" },
  { value: cantonesePopCount, name: "粤语流行" },
  { value: koreanPopCount, name: "韩国流行" },
  { value: classicCount, name: "古典" },
  { value: hiphopCount, name: "嘻哈说唱" },
  { value: rockCount, name: "摇滚" },
  { value: electronicCount, name: "电子" },
  { value: jazzCount, name: "节奏布鲁斯" },
  { value: lightCount, name: "轻音乐" }
]);

const pieChartData2 = ref([
  { value: maleCount, name: "男" },
  { value: femaleCount, name: "女" }
]);
</script>

<template>
  <div class="console-dashboard">
    <header class="dashboard-heading">
      <div>
        <p class="dashboard-kicker">LIBRARY OVERVIEW</p>
        <h1>内容控制台</h1>
        <p class="dashboard-description">
          查看 FreeMusicPlayer
          当前曲库与用户数据，并从左侧导航进入具体管理任务。
        </p>
      </div>
      <div class="dashboard-context" aria-label="控制台范围">
        <span>用户</span><span>音乐内容</span><span>运营反馈</span>
      </div>
    </header>
    <div class="section-label">关键数据</div>
    <el-row :gutter="24" justify="space-around">
      <re-col
        v-motion
        class="mb-[18px]"
        :value="6"
        :md="12"
        :sm="12"
        :xs="24"
        :initial="{
          opacity: 0,
          y: 100
        }"
        :enter="{
          opacity: 1,
          y: 0,
          transition: {
            delay: 80 * 1
          }
        }"
      >
        <el-card class="line-card" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">
              {{ "用户数量" }}
            </span>
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
                :startVal="100"
                :endVal="userCount"
              />
            </div>
            <ChartLine
              class="!w-1/2"
              :color="'#ef6f52'"
              :data="[210, 439, 530, 496, 575, 680, 845]"
            />
          </div>
        </el-card>
      </re-col>

      <re-col
        v-motion
        class="mb-[18px]"
        :value="6"
        :md="12"
        :sm="12"
        :xs="24"
        :initial="{
          opacity: 0,
          y: 100
        }"
        :enter="{
          opacity: 1,
          y: 0,
          transition: {
            delay: 80 * 2
          }
        }"
      >
        <el-card class="line-card" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">
              {{ "歌手数量" }}
            </span>
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
            <div class="w-1/2">
              <ReNormalCountTo
                :duration="2200"
                :fontSize="'2.5em'"
                :startVal="100"
                :endVal="artistCount"
              />
            </div>
            <ChartLine
              class="!w-1/2"
              :color="'#e7a36e'"
              :data="[210, 399, 500, 492, 652, 688, 850]"
            />
          </div>
        </el-card>
      </re-col>

      <re-col
        v-motion
        class="mb-[18px]"
        :value="6"
        :md="12"
        :sm="12"
        :xs="24"
        :initial="{
          opacity: 0,
          y: 100
        }"
        :enter="{
          opacity: 1,
          y: 0,
          transition: {
            delay: 80 * 3
          }
        }"
      >
        <el-card class="line-card" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">
              {{ "歌曲数量" }}
            </span>
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
            <div class="w-1/2">
              <ReNormalCountTo
                :duration="2200"
                :fontSize="'2.5em'"
                :startVal="100"
                :endVal="songCount"
              />
            </div>
            <ChartLine
              class="!w-1/2"
              :color="'#d8c0ae'"
              :data="[2101, 3399, 5300, 4962, 6952, 6808, 8450]"
            />
          </div>
        </el-card>
      </re-col>

      <re-col
        v-motion
        class="mb-[18px]"
        :value="6"
        :md="12"
        :sm="12"
        :xs="24"
        :initial="{
          opacity: 0,
          y: 100
        }"
        :enter="{
          opacity: 1,
          y: 0,
          transition: {
            delay: 80 * 4
          }
        }"
      >
        <el-card class="line-card" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">
              {{ "歌单数量" }}
            </span>
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
            <div class="w-1/2">
              <ReNormalCountTo
                :duration="2200"
                :fontSize="'2.5em'"
                :startVal="100"
                :endVal="playlistCount"
              />
            </div>
            <ChartLine
              class="!w-1/2"
              :color="'#9d7d6c'"
              :data="[2101, 5288, 4239, 4962, 6752, 5208, 7450]"
            />
          </div>
        </el-card>
      </re-col>

      <re-col
        v-motion
        class="mb-[18px]"
        :value="12"
        :xs="24"
        :initial="{
          opacity: 0,
          y: 100
        }"
        :enter="{
          opacity: 1,
          y: 0,
          transition: {
            delay: 400
          }
        }"
      >
        <el-card class="bar-card" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">歌曲类型比例</span>
          </div>
          <div class="flex justify-between items-start mt-3">
            <ChartPie1 :chartData="pieChartData1" />
          </div>
        </el-card>
      </re-col>

      <re-col
        v-motion
        class="mb-[18px]"
        :value="12"
        :xs="24"
        :initial="{
          opacity: 0,
          y: 100
        }"
        :enter="{
          opacity: 1,
          y: 0,
          transition: {
            delay: 400
          }
        }"
      >
        <el-card class="bar-card" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">歌手国籍分布</span>
          </div>
          <div class="flex justify-between items-start mt-3">
            <ChartBar
              :barChartData="[
                countAmerica,
                countChina,
                countKorea,
                countJapan,
                countGermany,
                countBritain
              ]"
            />
          </div>
        </el-card>

        <el-card class="bar-card bar-position" shadow="never">
          <div class="flex justify-between">
            <span class="text-md font-medium">歌手性别比例</span>
          </div>
          <div class="flex justify-between items-start mt-3">
            <ChartPie2 :chartData="pieChartData2" />
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

.dashboard-context {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.dashboard-context span {
  padding: 6px 10px;
  color: var(--fmp-text-muted);
  font-size: 12px;
  border: 1px solid var(--fmp-border);
  border-radius: 999px;
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

  .dashboard-context {
    justify-content: flex-start;
  }
}
</style>
