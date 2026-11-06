import { getDashboardMetrics } from "@/api/data";
import { onMounted, ref } from "vue";
import { message } from "@/utils/message";

/** 真实聚合行：数字卡与图表都直接映射数据库 GROUP BY 结果。 */
export interface MetricRow {
  name: string;
  count: number;
}
export interface TrendPoint {
  date: string;
  count: number;
}
export interface DashboardMetrics {
  users: { total: number; today: number };
  artists: { total: number; withArea: number; withGender: number };
  songs: { total: number; active: number };
  playlists: { total: number };
  sources: MetricRow[];
  mediaStatus: MetricRow[];
  importJobs: MetricRow[];
  topKeywords: MetricRow[];
  userTrend: TrendPoint[];
  visitorTrend: TrendPoint[];
  generatedAt?: string;
}

export default () => {
  const metrics = ref<DashboardMetrics | null>(null);
  const loading = ref(false);
  const error = ref("");

  const fetchData = async () => {
    loading.value = true;
    error.value = "";
    try {
      const response = await getDashboardMetrics();
      if (response.code !== 0 || !response.data) {
        throw new Error(response.message || "首页指标返回异常");
      }
      metrics.value = response.data;
    } catch (cause: any) {
      error.value = cause?.message || "无法获取首页指标";
      metrics.value = null;
      message(error.value, { type: "error" });
    } finally {
      loading.value = false;
    }
  };

  onMounted(fetchData);

  return { metrics, loading, error, refresh: fetchData };
};
