<script setup lang="ts">
import { useDark, useECharts } from "@pureadmin/utils";
import { type PropType, ref, computed, watch, nextTick } from "vue";

const props = defineProps({
  items: {
    type: Array as PropType<Array<{ name: string; count: number }>>,
    default: () => []
  },
  seriesName: { type: String, default: "数量" },
  horizontal: { type: Boolean, default: false },
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
    props.items.length === 0 || props.items.every(item => Number(item.count) <= 0)
);

watch(
  () => props.items,
  async () => {
    await nextTick();
    // 类目和数值都来自真实查询结果，不再写死国家/类型图例。
    const names = props.items.map(item => item.name);
    const values = props.items.map(item => item.count);
    const longest = names.reduce((max, name) => Math.max(max, name.length), 0);
    const categoryAxis = {
      type: "category",
      data: names,
      axisLabel: {
        fontSize: "0.75rem",
        interval: 0,
        rotate: !props.horizontal && names.length > 6 ? 30 : 0
      },
      axisPointer: { type: "shadow" }
    };
    const valueAxis = {
      type: "value",
      axisLabel: { fontSize: "0.875rem" },
      splitLine: { show: false }
    };
    setOptions({
      color: ["#41b6ff"],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "none" }
      },
      grid: {
        top: "20px",
        // 横向条形图的类目标签按最长名称留出空间，避免被网格裁切。
        left: props.horizontal
          ? Math.min(180, Math.max(64, longest * 14 + 16))
          : "50px",
        right: props.horizontal ? "24px" : 0,
        bottom: props.horizontal ? "34px" : "40px"
      },
      legend: {
        show: !isEmpty.value,
        data: [props.seriesName],
        textStyle: { color: "#606266", fontSize: "0.875rem" },
        bottom: 0
      },
      xAxis: props.horizontal ? valueAxis : categoryAxis,
      yAxis: props.horizontal
        ? { ...categoryAxis, type: "category" }
        : valueAxis,
      series: [
        {
          name: props.seriesName,
          type: "bar",
          barMaxWidth: 39,
          itemStyle: {
            color: "#41b6ff",
            borderRadius: props.horizontal ? [0, 10, 10, 0] : [10, 10, 0, 0]
          },
          data: values
        }
      ]
    });
  },
  { deep: true, immediate: true }
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
