<script setup lang="ts">
import { ref, computed, nextTick, watch } from "vue";
import { useDark, useECharts } from "@pureadmin/utils";

const props = defineProps({
  chartData: {
    type: Array as PropType<Array<{ name: string; count: number }>>,
    default: () => []
  },
  seriesName: { type: String, default: "数量" },
  emptyText: { type: String, default: "暂无数据" }
});

const { isDark } = useDark();

const theme = computed(() => (isDark.value ? "dark" : "light"));

const chartRef = ref();
const { setOptions } = useECharts(chartRef, {
  theme
});

const isEmpty = computed(
  () =>
    props.chartData.length === 0 ||
    props.chartData.every(item => Number(item.count) <= 0)
);

watch(
  () => props.chartData,
  async newVal => {
    await nextTick();
    setOptions({
      tooltip: {
        trigger: "item"
      },
      legend: {
        top: "5%",
        left: "center"
      },
      series: [
        {
          name: props.seriesName,
          type: "pie",
          radius: ["40%", "70%"],
          avoidLabelOverlap: false,
          padAngle: 5,
          itemStyle: {
            borderRadius: 10
          },
          label: {
            show: false,
            position: "center"
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 40,
              fontWeight: "bold"
            }
          },
          labelLine: {
            show: false
          },
          // 全 0 时不要画出等分的假扇区。
          stillShowZeroSum: false,
          data: newVal.map(item => ({ name: item.name, value: item.count }))
        }
      ]
    });
  },
  {
    deep: true,
    immediate: true
  }
);
</script>

<template>
  <div class="chart-shell">
    <div ref="chartRef" style="width: 100%; height: 100%" />
    <div v-if="isEmpty" class="chart-empty">{{ emptyText }}</div>
  </div>
</template>

<style scoped>
.chart-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 253px;
}
.chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fmp-text-muted, #909399);
  font-size: 13px;
}
</style>
