<script setup lang="ts">
import { ref } from 'vue'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import DrawerMusic from '@/components/DrawerMusic/index.vue'
import defaultAlbum from '@/assets/default_album.jpg'

const { currentTrack, isPlaying } = useAudioPlayer()
const showDrawerMusic = ref(false)
const handleCoverError = (event: Event) => {
  const image = event.target as HTMLImageElement
  if (image.src !== defaultAlbum) image.src = defaultAlbum
}
</script>

<template>
  <div
    class="group flex min-w-0 cursor-pointer select-none items-center gap-3 px-4 py-2"
    @click="showDrawerMusic = !showDrawerMusic"
  >
    <div class="h-14 w-14 flex-none overflow-hidden rounded-md bg-muted">
      <img
        :src="currentTrack.cover || defaultAlbum"
        :alt="currentTrack.title"
        decoding="async"
        class="h-full w-full object-cover"
        @error="handleCoverError"
      />
    </div>
    <div class="min-w-0">
      <div class="flex items-center gap-2 mx-2 mb-0.5">
        <div
          class="line-clamp-1 text-sm font-medium text-foreground"
          :title="currentTrack.title"
        >
          {{ currentTrack.title }}
        </div>
        <PlayingIndicator v-if="isPlaying" class="flex-shrink-0 scale-75" />
      </div>
      <div class="text-xs text-muted-foreground line-clamp-1 h-4 mt-0.5 mx-2">
        {{ currentTrack.artist }}
      </div>
    </div>
    <DrawerMusic v-model="showDrawerMusic" />
  </div>
</template>
