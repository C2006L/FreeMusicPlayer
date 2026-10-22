<script setup lang="ts">
import { getOnlineLyrics } from '@/api/system'

type LyricLine = { time: number; text: string; translation?: string }

const { currentTrack, currentTime, seek } = useAudioPlayer()
const lines = ref<LyricLine[]>([])
const loading = ref(false)
const error = ref('')
const scrollArea = ref<HTMLElement | null>(null)

const parseLrc = (value = ''): LyricLine[] => {
  const parsed: LyricLine[] = []
  value.split(/\r?\n/).forEach((rawLine) => {
    const matches = [...rawLine.matchAll(/\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g)]
    const text = rawLine.replace(/\[[^\]]+\]/g, '').trim()
    if (!matches.length || !text) return
    matches.forEach((match) => parsed.push({
      time: Number(match[1]) * 60 + Number(match[2]),
      text,
    }))
  })
  return parsed.sort((left, right) => left.time - right.time)
}

const mergeTranslation = (original: LyricLine[], translated = '') => {
  const translationMap = new Map(parseLrc(translated).map((line) => [line.time.toFixed(2), line.text]))
  return original.map((line) => ({ ...line, translation: translationMap.get(line.time.toFixed(2)) }))
}

const activeIndex = computed(() => {
  for (let index = lines.value.length - 1; index >= 0; index--) {
    if (currentTime.value >= lines.value[index].time) return index
  }
  return -1
})

watch(
  () => [currentTrack.value.id, currentTrack.value.sourceLyricId, currentTrack.value.lyric],
  async () => {
    lines.value = []
    error.value = ''
    const track = currentTrack.value
    if (track.lyric) {
      lines.value = mergeTranslation(parseLrc(track.lyric), track.translatedLyric)
      return
    }
    if (track.online && track.source && (track.sourceLyricId || track.sourceSongId)) {
      loading.value = true
      try {
        const result = await getOnlineLyrics(track.source, track.sourceLyricId || track.sourceSongId || '', {
          name: track.title, artist: track.artist, album: track.album,
          duration: track.duration, extra: track.sourceExtra, engine: track.providerEngine,
        })
        const payload = result.data as { lyric?: string; tlyric?: string } | undefined
        if (result.code !== 0 || !payload?.lyric) throw new Error(result.message || '暂无歌词')
        track.lyric = payload.lyric
        track.translatedLyric = payload.tlyric || ''
        lines.value = mergeTranslation(parseLrc(payload.lyric), payload.tlyric)
      } catch (reason: any) {
        error.value = reason?.message || '暂未找到这首歌的歌词'
      } finally {
        loading.value = false
      }
      return
    }
    error.value = '暂未找到这首歌的歌词'
  },
  { immediate: true },
)

watch(activeIndex, async () => {
  await nextTick()
  scrollArea.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
})

const seekToLine = (line: LyricLine) => {
  seek(line.time)
}
</script>

<template>
  <section class="lyrics-panel" aria-label="歌词">
    <header><p>NOW PLAYING</p><h2>歌词</h2></header>
    <div ref="scrollArea" class="lyrics-scroll">
      <div v-if="loading" class="lyrics-state"><icon-tabler:loader-2 class="animate-spin" />正在获取歌词</div>
      <div v-else-if="error" class="lyrics-state"><icon-tabler:microphone-off />{{ error }}</div>
      <button v-for="(line, index) in lines" v-else :key="`${line.time}-${index}`" class="lyric-line"
        :data-active="index === activeIndex" @click="seekToLine(line)">
        <span>{{ line.text }}</span><small v-if="line.translation">{{ line.translation }}</small>
      </button>
    </div>
  </section>
</template>

<style scoped>
.lyrics-panel { display:flex; min-height:0; height:100%; flex-direction:column; padding:18px 28px 32px; }
header { padding-bottom:16px; border-bottom:1px solid hsl(var(--border)); }
header p { color:var(--primary); font-size:10px; font-weight:700; letter-spacing:.2em; }
header h2 { margin-top:4px; font-size:22px; font-weight:650; }
.lyrics-scroll { min-height:0; flex:1; overflow-y:auto; padding-block:34vh; scrollbar-width:thin; }
.lyric-line { display:block; width:100%; padding:10px 4px; color:hsl(var(--muted-foreground)); text-align:left; transition:color .18s ease,transform .18s ease; }
.lyric-line span,.lyric-line small { display:block; }.lyric-line span { font-size:17px; line-height:1.5; }.lyric-line small { margin-top:3px; font-size:12px; }
.lyric-line:hover { color:hsl(var(--foreground)); }.lyric-line[data-active="true"] { color:var(--primary); transform:translateX(5px); font-weight:650; }
.lyrics-state { display:flex; min-height:220px; align-items:center; justify-content:center; gap:8px; color:hsl(var(--muted-foreground)); font-size:13px; }
</style>
