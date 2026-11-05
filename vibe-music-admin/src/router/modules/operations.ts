export default {
  path: "/operations",
  redirect: "/operations/index",
  meta: { icon: "ri:pulse-line", title: "运行与任务诊断", rank: 8 },
  children: [
    {
      path: "/operations/index",
      name: "Operations",
      component: () => import("@/views/operations/index.vue"),
      meta: { title: "运行与任务诊断" }
    }
  ]
} satisfies RouteConfigsTable;
