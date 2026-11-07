<script setup lang="ts">
import { ref, watch } from 'vue'
import defaultAlbum from '@/assets/default_album.jpg'

const props = withDefaults(defineProps<{ src?: string; alt?: string; eager?: boolean }>(), { src: '', alt: '专辑封面', eager: false })
const imageSource = ref(defaultAlbum)
const retries = ref(0)
let retryTimer: ReturnType<typeof setTimeout> | undefined
const clearRetry = () => { if (retryTimer) { clearTimeout(retryTimer); retryTimer = undefined } }

watch(() => props.src, () => {
  clearRetry()
  retries.value = 0
  imageSource.value = props.src || defaultAlbum
}, { immediate: true })

// 单次失败（代理超时/502）不应永久锁定占位图：同一地址最多自动重试一次，
// 仍失败才回退默认封面；下次地址变化会重新尝试。
const handleError = () => {
  if (!props.src || retries.value >= 1) { imageSource.value = defaultAlbum; return }
  retries.value += 1
  clearRetry()
  retryTimer = setTimeout(() => {
    const joiner = props.src.includes('?') ? '&' : '?'
    imageSource.value = `${props.src}${joiner}coverRetry=${retries.value}`
  }, 1500)
}
</script>

<template>
  <img :src="imageSource" :alt="alt" :loading="eager ? 'eager' : 'lazy'" decoding="async"
    class="music-cover" @error="handleError" />
</template>

<style scoped>
.music-cover { display:block; width:100%; height:100%; object-fit:cover; background:hsl(var(--muted)); }
</style>
