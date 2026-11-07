<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'

// 手机端歌词抽屉看不到底部播放条，这里在抽屉顶部补一条可拖动的紧凑进度条。
const { currentTrack, currentTime, duration, isSeeking, seekingTime, audioElement, startSeeking, previewSeek, seek } = useAudioPlayer()
const durationSeconds = computed(() => {
  if (Number.isFinite(duration.value) && duration.value > 0) return duration.value
  const expected = Number(currentTrack.value.duration)
  return Number.isFinite(expected) && expected > 0 ? expected : 0
})
const displayTime = computed(() => isSeeking.value ? seekingTime.value : currentTime.value)
const playedPercent = computed(() => durationSeconds.value > 0 ? Math.min(100, Math.max(0, displayTime.value / durationSeconds.value * 100)) : 0)
const bufferedEnd = ref(0)
const bufferedPercent = computed(() => durationSeconds.value > 0 ? Math.min(100, bufferedEnd.value / durationSeconds.value * 100) : 0)
const formatTime = (seconds: number) => {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), rest = total % 60
  const mm = String(minutes).padStart(2, '0'), ss = String(rest).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}
const syncBuffered = () => {
  const audio = audioElement.value
  if (!audio || !audio.buffered.length) { bufferedEnd.value = 0; return }
  const end = audio.buffered.end(audio.buffered.length - 1)
  bufferedEnd.value = Number.isFinite(end) ? end : 0
}
watch(audioElement, (audio, previous) => {
  previous?.removeEventListener('progress', syncBuffered)
  previous?.removeEventListener('timeupdate', syncBuffered)
  audio?.addEventListener('progress', syncBuffered)
  audio?.addEventListener('timeupdate', syncBuffered)
  syncBuffered()
}, { immediate: true })
watch(duration, syncBuffered)
onUnmounted(() => {
  audioElement.value?.removeEventListener('progress', syncBuffered)
  audioElement.value?.removeEventListener('timeupdate', syncBuffered)
})
const onInput = (event: Event) => { previewSeek(Number((event.target as HTMLInputElement).value)) }
const onCommit = (event: Event) => { seek(Number((event.target as HTMLInputElement).value)) }
</script>

<template>
  <section v-if="durationSeconds > 0" class="mini-progress" aria-label="播放进度">
    <span class="mini-time">{{ formatTime(displayTime) }}</span>
    <div class="mini-track-wrap">
      <div class="mini-track">
        <span class="mini-buffered" :style="{ width: `${bufferedPercent}%` }"></span>
        <span class="mini-played" :style="{ width: `${playedPercent}%` }"></span>
      </div>
      <span class="mini-thumb" :style="{ left: `${playedPercent}%` }" aria-hidden="true"></span>
      <input
        class="mini-range"
        type="range"
        min="0"
        :max="durationSeconds"
        step="0.1"
        :value="displayTime"
        aria-label="拖动跳转播放进度"
        @pointerdown="startSeeking()"
        @input="onInput"
        @change="onCommit"
      />
    </div>
    <span class="mini-time total">{{ formatTime(durationSeconds) }}</span>
  </section>
</template>

<style scoped>
.mini-progress{display:none;align-items:center;gap:10px}
@media(max-width:900px){.mini-progress{display:flex}}
.mini-time{font-size:12px;font-variant-numeric:tabular-nums;letter-spacing:.02em;color:hsl(var(--foreground));min-width:42px}
.mini-time.total{color:hsl(var(--muted-foreground));text-align:right}
.mini-track-wrap{position:relative;display:flex;flex:1;align-items:center;height:44px;touch-action:none}
.mini-track{position:relative;width:100%;height:4px;border-radius:999px;background:hsl(var(--border))}
.mini-buffered{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:hsl(var(--muted-foreground)/.45)}
.mini-played{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--primary)}
.mini-thumb{position:absolute;top:50%;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:var(--primary);box-shadow:0 0 0 3px rgb(239 111 82 / .22);transform:translateY(-50%);pointer-events:none}
.mini-range{position:absolute;inset:0;width:100%;height:44px;margin:0;opacity:0;cursor:pointer;-webkit-appearance:none;appearance:none;background:transparent}
.mini-range::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:44px}
.mini-range::-moz-range-thumb{width:24px;height:44px;border:0;background:transparent}
.mini-track-wrap:has(.mini-range:focus-visible) .mini-track{outline:2px solid var(--primary);outline-offset:3px}
</style>
