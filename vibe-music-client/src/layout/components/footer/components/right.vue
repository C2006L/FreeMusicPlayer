<script setup lang="ts">
import { Icon } from '@iconify/vue'
import Recently from './recently.vue'
const { volume, playMode, setVolume, setPlayMode } = useAudioPlayer()

const isMuted = computed(() => volume.value === 0)
const volumeBeforeMute = ref(50)

const toggleVolume = () => {
  if (isMuted.value) {
    setVolume(volumeBeforeMute.value || 50)
    return
  }
  volumeBeforeMute.value = volume.value
  setVolume(0)
}

// 添加播放模式相关逻辑
const playModes = {
  order: {
    icon: 'ri:order-play-line',
    next: 'shuffle',
    tooltip: '顺序播放',
  },
  shuffle: {
    icon: 'ri:shuffle-line',
    next: 'loop',
    tooltip: '随机播放',
  },
  loop: {
    icon: 'ri:repeat-2-line',
    next: 'single',
    tooltip: '列表循环',
  },
  single: {
    icon: 'ri:repeat-one-line',
    next: 'order',
    tooltip: '单曲循环',
  },
} as const

const togglePlayMode = () => {
  const nextMode = playModes[playMode.value].next
  setPlayMode(nextMode)
}
</script>
<template>
  <div class="player-tools flex items-center justify-end pr-4">
    <div class="flex items-center mx-4">
      <el-tooltip
        :content="playModes[playMode].tooltip"
        placement="top"
        effect="dark"
      >
        <button
          class="p-2 rounded-full hover:bg-hoverMenuBg hover:text-primary transition-all duration-200 hover:scale-110 active:scale-95 w-9 h-9"
          @click="togglePlayMode"
          aria-label="切换播放模式"
        >
          <Icon :icon="playModes[playMode].icon" class="w-full h-full" />
        </button>
      </el-tooltip>
    </div>
    <button
      @click="toggleVolume"
      :aria-label="isMuted ? '恢复音量' : '静音'"
      class="p-2 rounded-full hover:bg-hoverMenuBg hover:text-primary transition-all duration-200 hover:scale-110 active:scale-95 w-9 h-9"
    >
      <Icon
        :icon="isMuted ? 'ic:round-volume-off' : 'ic:round-volume-up'"
        class="w-full h-full"
      />
    </button>
    <el-slider
      v-model="volume"
      :show-tooltip="false"
      @change="setVolume"
      class="mr-4 !w-24 max-[900px]:hidden"
      size="small"
      :max="100"
    />
    <Recently />
  </div>
</template>
