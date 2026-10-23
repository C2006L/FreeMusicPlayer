<script setup lang="ts">
const loading = ref(false)
const error = ref('')
const health = ref<any>(null)
const names: Record<string, string> = { mysql: '数据库', redis: '登录会话与缓存', onlineProvider: '在线音源', minio: '附件存储', ai: '音乐助手', mail: '验证码邮件' }
const refresh = async () => {
  loading.value = true; error.value = ''
  try {
    const base = import.meta.env.VITE_APP_BASE_API || 'http://localhost:18080'
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`健康接口返回 HTTP ${response.status}，请检查后端地址和版本`)
    const data = await response.json()
    if (data.application !== 'FreeMusicPlayer') throw new Error('当前地址运行的不是 FreeMusicPlayer 后端')
    health.value = data
  } catch (e: any) { health.value = null; error.value = e.message || '后端无法连接' }
  finally { loading.value = false }
}
onMounted(refresh)
</script>
<template>
  <section class="max-w-3xl mx-auto p-8 w-full overflow-y-auto">
    <div class="flex justify-between items-center border-b border-border pb-5 mb-5"><h1 class="text-2xl font-semibold">服务状态</h1><button class="text-primary text-sm" :disabled="loading" @click="refresh">{{ loading ? '检查中…' : '重新检查' }}</button></div>
    <p v-if="error" role="alert" class="text-sm text-primary">{{ error }}</p>
    <div v-for="(component, key) in health?.components" :key="key" class="py-5 border-b border-border flex justify-between gap-5">
      <div class="min-w-0"><h2>{{ names[key] || key }}</h2><p v-if="component.message" class="mt-1 text-xs text-muted-foreground">{{ component.message }}</p>
        <div v-if="component.sources && Object.keys(component.sources).length" class="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground"><span v-for="(source, label) in component.sources" :key="label">{{ label }}: {{ source.status }}</span></div>
      </div>
      <span class="text-sm tabular-nums" :class="component.status === 'UP' ? 'text-primary' : 'text-muted-foreground'">{{ component.status }}</span>
    </div>
    <p class="mt-6 text-xs text-muted-foreground leading-6">AI 和附件存储可以独立关闭。音源服务可连接不代表每个平台的每首歌均可播放，歌曲的版权、地区和账号限制以实际请求为准。</p>
  </section>
</template>
