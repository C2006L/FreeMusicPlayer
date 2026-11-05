<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import defaultAlbum from '@/assets/default_album.jpg'

const props = withDefaults(defineProps<{ src?: string; alt?: string; eager?: boolean }>(), { src: '', alt: '专辑封面', eager: false })
const failed = ref(false)
watch(() => props.src, () => { failed.value = false })
const imageSource = computed(() => failed.value || !props.src ? defaultAlbum : props.src)
</script>

<template>
  <img :src="imageSource" :alt="alt" :loading="eager ? 'eager' : 'lazy'" decoding="async"
    class="music-cover" @error="failed = true" />
</template>

<style scoped>
.music-cover { display:block; width:100%; height:100%; object-fit:cover; background:hsl(var(--muted)); }
</style>
