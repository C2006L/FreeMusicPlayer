<script setup lang="ts">
import { type PropType, ref, computed, watch, nextTick } from "vue";
import { useDark, useECharts } from "@pureadmin/utils";

const props = defineProps({
  data: {
    type: Array as PropType<Array<number>>,
    default: () => []
  },
  color: {
    type: String,
    default: "#41b6ff"
  }
});

const { isDark } = useDark();

const theme = computed(() => (isDark.value ? "dark" : "light"));

const chartRef = ref();
const { setOptions } = useECharts(chartRef, {
  theme,
  renderer: "svg"
});

const isEmpty = computed(
  () => props.data.length === 0 || props.data.every(value => Number(value) <= 0)
);

watch(
  () => props.data,
  async newVal => {
    await nextTick();
    setOptions({
      xAxis: { type: "category", show: false, data: newVal },
      grid: { top: "15px", bottom: 0, left: 0, right: 0 },
      yAxis: { show: false, type: "value" },
      series: [
        {
          data: newVal,
          type: "line",
          symbol: "none",
          smooth: true,
          color: props.color,
          lineStyle: {
            shadowOffsetY: 3,
            shadowBlur: 7,
            shadowColor: props.color
          }
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
    <div v-if="isEmpty" class="chart-empty">暂无趋势</div>
  </div>
</template>

<style scoped>
.chart-shell {
  position: relative;
  width: 100%;
  height: 60px;
}
.chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 8px;
  color: var(--fmp-text-muted, #909399);
  font-size: 12px;
}
</style>
