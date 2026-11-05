<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { parseLyricDocument, lyricKey, activeLyricIndex, hasWordTiming, type LyricDocument, type TimedLyricLine } from '@/utils/lyricLines'
import { readLyrics, saveLyrics, reusableLyrics, LYRIC_SCHEMA } from '@/utils/lyricStorage'
import { LyricTranslationSession } from '@/utils/lyricTranslationSession'
import { fetchLyrics, findLyrics, startTranslation, translationStatus, cancelTranslation } from '@/api/lyrics'
import { sameRecording } from '@/utils/playbackPolicy'
import type { Song } from '@/api/interface'
const { currentTrack, currentTime, seek } = useAudioPlayer()
const empty = (): LyricDocument => ({ lines: [], synced: false, source: '', translationSource: '' })
const document = ref<LyricDocument>(empty()), loading = ref(false), error = ref(''), notice = ref('')
const offset = ref(0), imported = ref(false), following = ref(true), scrollArea = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null), candidates = ref<Song[]>([]), searching = ref(false)
const preference = (key: string, fallback: boolean) => { try { return localStorage.getItem(key) == null ? fallback : localStorage.getItem(key) === 'true' } catch { return fallback } }
const showTranslation = ref(preference('fmp-lyric-translation', true)), showRoma = ref(preference('fmp-lyric-roma', false))
const showWords = ref(preference('fmp-lyric-words', true))
watch(showTranslation, value => { try { localStorage.setItem('fmp-lyric-translation', String(value)) } catch {} })
watch(showRoma, value => { try { localStorage.setItem('fmp-lyric-roma', String(value)) } catch {} })
watch(showWords, value => { try { localStorage.setItem('fmp-lyric-words', String(value)) } catch {} })
const key = computed(() => lyricKey(currentTrack.value))
const hasTranslation = computed(() => document.value.lines.some(line => line.translation))
const hasRoma = computed(() => document.value.lines.some(line => line.romanization))
const hasWords = computed(() => document.value.lines.some(hasWordTiming))
const translating = ref(false), cancellingTranslation = ref(false), translationProgress = ref('')
const translationSession = new LyricTranslationSession((lines: { id: number; text: string }[]) => startTranslation(lines, AbortSignal.timeout(10000)), cancelTranslation)
let generation = 0, translationGeneration = 0, cancelSequence = 0, cacheUpdated = Date.now(), operation: AbortController | undefined, translationPoll: AbortController | undefined
let resizeObserver: ResizeObserver | undefined
const activeIndex = computed(() => document.value.synced ? activeLyricIndex(document.value.lines, currentTime.value - offset.value) : -1)
async function persist() {
  if (!document.value.lines.length) return
  const savedKey = key.value
  try { await saveLyrics({ key: savedKey, document: JSON.parse(JSON.stringify(document.value)), imported: imported.value, offset: offset.value, updated: cacheUpdated, schema: LYRIC_SCHEMA }) }
  catch { if (savedKey === key.value) notice.value = '浏览器未能保存歌词，当前仍可使用；请检查存储空间或隐私设置。' }
}
async function stopTranslation() {
  translationGeneration++; translationPoll?.abort()
  translating.value = false; cancellingTranslation.value = true
  const savedKey = key.value, sequence = ++cancelSequence
  try { await translationSession.stop() }
  catch { if (savedKey === key.value) notice.value = '未确认服务端翻译已停止，请稍后重试；原歌词未改动。' }
  finally { if (sequence === cancelSequence) cancellingTranslation.value = false }
}
async function load(force = false, song?: Song) {
  const id = ++generation, savedKey = key.value, track = { ...currentTrack.value }
  let previous = force && document.value.lines.length ? { document: document.value, imported: imported.value, offset: offset.value, updated: cacheUpdated } : undefined
  operation?.abort(); operation = new AbortController()
  const signal = operation.signal
  void stopTranslation()
  loading.value = true; searching.value = false; error.value = ''; notice.value = ''; candidates.value = []; following.value = true
  document.value = empty(); offset.value = 0; imported.value = false; cacheUpdated = Date.now()
  const timer = setTimeout(() => { if (operation?.signal === signal) operation.abort() }, 25000)
  try {
    const saved = await readLyrics(savedKey).catch(() => undefined)
    if (id !== generation || savedKey !== key.value) return
    offset.value = saved?.offset || 0
    if (!force && saved && reusableLyrics(saved)) { document.value = saved.document; imported.value = saved.imported; cacheUpdated = saved.updated; return }
    if (!force && saved?.document.lines.length) previous = { document: saved.document, imported: saved.imported, offset: saved.offset, updated: saved.updated }
    if (!song && !force && track.lyric) {
      document.value = parseLyricDocument({ lyric: track.lyric, tlyric: track.translatedLyric, source: '歌曲自带' })
      if (document.value.lines.length) return
    }
    const source = song?.source || track.source, lyricId = song?.sourceLyricId || song?.sourceSongId || track.sourceLyricId || track.sourceSongId
    if (!source || source === 'local' || !lyricId || source === 'bilibili') {
      error.value = source === 'bilibili' ? '当前 B 站条目没有同步歌词，可查找当前单曲或导入歌词。' : '暂未找到歌词，可以查找其他来源或导入 LRC / TXT。'; return
    }
    const fields = song ? { name: song.songName, artist: song.artistName, album: song.album, duration: song.duration, extra: song.sourceExtra, engine: song.providerEngine }
      : { name: track.title, artist: track.artist, album: track.album, duration: track.duration, extra: track.sourceExtra, engine: track.providerEngine }
    const payload = await fetchLyrics(source, lyricId, fields, signal)
    if (id !== generation || savedKey !== key.value) return
    document.value = parseLyricDocument(payload)
    cacheUpdated = Date.now()
    if (!document.value.lines.length) error.value = '音源未提供可用歌词，可以查找其他来源或导入歌词。'
    else await persist()
  } catch (failure) {
    if (id === generation) error.value = signal.aborted ? '歌词获取超时，请重试。' : failure instanceof Error ? failure.message : '歌词获取失败，请重试。'
  } finally {
    clearTimeout(timer)
    if (id === generation) {
      if (previous && !document.value.lines.length) {
        document.value = previous.document; imported.value = previous.imported; offset.value = previous.offset
        cacheUpdated = previous.updated
        notice.value = `${error.value || '本次没有取得新歌词。'}已保留原有歌词。`; error.value = ''
      }
      loading.value = false
    }
  }
}
watch(() => [key.value, currentTrack.value.lyric], () => { void load() }, { immediate: true })
watch(offset, () => { if (!loading.value) void persist() })
async function searchOtherSources() {
  const query = `${currentTrack.value.title || ''} ${currentTrack.value.artist || ''}`.trim()
  if (!query || query.length > 100) { notice.value = '请先在曲库中定位合集里的具体单曲，再查找歌词。'; return }
  operation?.abort(); const controller = new AbortController(); operation = controller
  const savedKey = key.value, id = ++generation, track = { ...currentTrack.value }
  searching.value = true; loading.value = false; candidates.value = []; notice.value = ''
  const timer = setTimeout(() => controller.abort(), 25000)
  try {
    const rows: Song[] = await findLyrics(query, controller.signal)
    if (savedKey !== key.value || id !== generation) return
    const seen = new Set<string>()
    candidates.value = rows.filter(row => {
      const match = sameRecording({ title: row.songName, artist: row.artistName, album: row.album, duration: Number(row.duration) }, track)
      const identity = `${row.source}:${row.sourceSongId}`
      if (!match || seen.has(identity)) return false
      seen.add(identity); return true
    }).slice(0, 6)
    notice.value = candidates.value.length ? '按歌名、歌手、版本和时长筛选，请选择歌词来源。音频不会切换。' : '未找到版本和时长均匹配的候选，未套用其他版本。可以导入自己的 LRC。'
  } catch { if (id === generation) notice.value = '其他来源检索失败，请稍后重试。' }
  finally { clearTimeout(timer); if (id === generation) searching.value = false }
}
async function chooseCandidate(song: Song) {
  const savedKey = key.value
  if (imported.value) { try { await ElMessageBox.confirm('将替换这首歌在本浏览器保存的导入歌词，是否继续？', '替换歌词', { type: 'warning' }) } catch { return } }
  if (savedKey !== key.value) return
  await load(true, song)
}
async function refreshLyrics() {
  const savedKey = key.value
  if (imported.value) { try { await ElMessageBox.confirm('重新获取成功后会替换本浏览器中的导入歌词，是否继续？', '重新获取歌词') } catch { return } }
  if (savedKey === key.value) await load(true)
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0], savedKey = key.value
  input.value = ''; if (!file) return
  if (file.size > 262144 || !/\.(lrc|txt)$/i.test(file.name)) { ElMessage.warning('请选择不超过 256KB 的 LRC 或 TXT 文件'); return }
  try {
    const bytes = await file.arrayBuffer(); let text: string
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { text = new TextDecoder('gb18030').decode(bytes) }
    const parsed = parseLyricDocument({ lyric: text, source: `本地导入 · ${file.name}` })
    if (!parsed.lines.length) { ElMessage.warning('文件中未找到可识别的歌词'); return }
    if (savedKey !== key.value) return
    if (document.value.lines.length) { try { await ElMessageBox.confirm('用该文件替换当前歌词？仅保存在此浏览器，不上传文件。', '导入歌词') } catch { return } }
    if (savedKey !== key.value) return
    generation++; operation?.abort(); void stopTranslation()
    document.value = parsed; imported.value = true; cacheUpdated = Date.now(); error.value = ''; loading.value = false; searching.value = false; candidates.value = []; notice.value = ''; following.value = true
    await persist(); ElMessage.success('歌词已导入')
  } catch { ElMessage.error('无法读取歌词文件，请检查文件编码') }
}
async function translate() {
  if (translating.value || cancellingTranslation.value || loading.value) return
  const missing = document.value.lines.map((line, id) => ({ id, text: line.text, translated: !!line.translation })).filter(line => !line.translated).map(({ id, text }) => ({ id, text }))
  if (!missing.length) return
  if (missing.length > 200 || missing.reduce((sum, l) => sum + l.text.length, 0) > 20000) { notice.value = '自动翻译最多支持 200 行、20000 字，请导入较短的歌词。'; return }
  const id = ++translationGeneration, savedKey = key.value
  translating.value = true; translationProgress.value = '等待本机模型'; notice.value = ''
  translationPoll = new AbortController(); const signal = translationPoll.signal
  let finished = false, lease: number | undefined
  try {
    const started = await translationSession.start(missing)
    let job = started.job; lease = started.lease
    if (id !== translationGeneration || savedKey !== key.value) return
    const deadline = Date.now() + 300000
    while (['QUEUED', 'RUNNING'].includes(job.status)) {
      translationProgress.value = `翻译 ${job.processed} / ${job.total} 行`
      if (Date.now() > deadline) throw new Error('翻译超时，可以重试。')
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new Error('cancelled')) }
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, 1500)
        signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort()
      })
      job = await translationStatus(job.id, signal)
    }
    if (id !== translationGeneration || savedKey !== key.value) return
    finished = true
    if (job.status !== 'SUCCEEDED') throw new Error(job.error || '翻译已停止，可重试。')
    for (const line of job.lines) { if (document.value.lines[line.id] && !document.value.lines[line.id].translation) document.value.lines[line.id].translation = line.text }
    document.value.translationSource = '含 Ollama 机器翻译'; showTranslation.value = true; await persist()
  } catch (failure) { if (id === translationGeneration) notice.value = failure instanceof Error ? failure.message : '翻译失败，请检查 Ollama。' }
  finally {
    if (id === translationGeneration) {
      translating.value = false
      if (finished && lease != null) translationSession.finish(lease)
      else await stopTranslation()
    }
  }
}
async function followCurrent() {
  await nextTick()
  if (!following.value) return
  const area = scrollArea.value, target = area?.querySelector<HTMLElement>('[data-active="true"]')
  if (target && area) area.scrollTo({ top: target.offsetTop - area.clientHeight / 2 + target.offsetHeight / 2, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}
watch([activeIndex, showRoma, showTranslation, showWords], () => { if (following.value) void followCurrent() })
const resume = () => { following.value = true; void followCurrent() }
const seekToLine = (line: TimedLyricLine) => { if (document.value.synced) { seek(Math.max(0, line.time + offset.value)); resume() } }
onMounted(() => { resizeObserver = new ResizeObserver(() => { if (following.value) void followCurrent() }); if (scrollArea.value) resizeObserver.observe(scrollArea.value) })
onUnmounted(() => { generation++; operation?.abort(); resizeObserver?.disconnect(); void stopTranslation() })
</script>
<template>
  <section class="lyrics-panel" aria-label="歌词">
    <header>
      <div class="lyric-title"><div><p>NOW PLAYING</p><h2>歌词</h2></div><span v-if="document.lines.length" class="lyric-mode">{{ document.synced ? '同步歌词' : '非同步歌词' }}</span></div>
      <div class="lyric-toolbar">
        <button :aria-pressed="showTranslation" :disabled="!hasTranslation" @click="showTranslation = !showTranslation">译文</button>
        <button :aria-pressed="showRoma" :disabled="!hasRoma" @click="showRoma = !showRoma">罗马音</button>
        <button :aria-pressed="showWords" :disabled="!hasWords" :title="hasWords ? '使用音源提供的逐字时间' : '音源未提供可靠逐字时间'" @click="showWords = !showWords">逐字</button>
        <button v-if="cancellingTranslation" disabled>正在停止翻译…</button>
        <button v-else-if="translating" @click="stopTranslation">停止翻译 · {{ translationProgress }}</button>
        <button v-else :disabled="loading || !document.lines.length || document.lines.every(line => line.translation)" @click="translate">补充中文翻译</button>
        <button :disabled="loading || searching" @click="searchOtherSources">{{ searching ? '检索中…' : '查找其他来源' }}</button>
        <button :disabled="loading || searching" @click="refreshLyrics">重新获取</button>
        <button @click="fileInput?.click()">导入歌词</button>
        <input ref="fileInput" class="file-input" type="file" accept=".lrc,.txt" aria-label="选择歌词文件" @change="importFile" />
      </div>
      <div v-if="document.lines.length" class="lyric-caption">{{ document.source }}<span v-if="document.translationSource"> · {{ document.translationSource }}</span><span v-if="!hasTranslation"> · 暂无译文，可使用本机 Ollama 补充</span></div>
      <div v-if="notice" class="lyric-notice" role="status">{{ notice }}</div>
      <div v-if="candidates.length" class="lyric-candidates"><button v-for="song in candidates" :key="`${song.source}:${song.sourceSongId}:${song.providerEngine}`" @click="chooseCandidate(song)"><span>{{ song.songName }} · {{ song.artistName }}</span><small>{{ song.sourceName || song.source }} · {{ song.album }} · {{ song.duration }}s</small></button></div>
    </header>
    <div v-if="document.synced && document.lines.length" class="lyric-sync-controls">
      <label>歌词延后 <input v-model.number="offset" type="number" min="-30" max="30" step="0.1" aria-label="歌词时间偏移（秒）" @change="offset = Math.min(30, Math.max(-30, Number(offset) || 0))" /> 秒</label>
      <button :disabled="offset === 0" @click="offset = 0">重置</button><button v-if="!following" @click="resume">回到当前句</button>
    </div>
    <div ref="scrollArea" class="lyrics-scroll" :class="{ 'is-synced': document.synced }" @wheel.passive="following = false" @touchstart.passive="following = false" @pointerdown="following = false" @keydown="following = false">
      <div v-if="loading" class="lyrics-state" role="status">正在获取歌词…</div>
      <div v-else-if="error" class="lyrics-state"><span>{{ error }}</span></div>
      <template v-else>
        <button v-for="(line, index) in document.lines" :key="`${line.time}-${index}`" class="lyric-line" :class="{ 'is-plain': !document.synced }"
          :data-active="index === activeIndex" :aria-current="index === activeIndex ? 'true' : undefined"
          :aria-label="document.synced ? `跳转到：${line.text}` : undefined" :disabled="!document.synced" @click="seekToLine(line)">
          <span v-if="showWords && hasWordTiming(line)" class="lyric-words">
            <span v-for="(word, wordIndex) in line.words" :key="wordIndex" class="lyric-word"
              :data-passed="currentTime - offset >= word.time" :data-current="currentTime - offset >= word.time && currentTime - offset < word.end!">{{ word.text }}</span>
          </span>
          <span v-else>{{ line.text }}</span>
          <small v-if="showRoma && line.romanization" class="lyric-roma">{{ line.romanization }}</small>
          <small v-if="showTranslation && line.translation" class="lyric-translation">{{ line.translation }}</small>
        </button>
      </template>
    </div>
  </section>
</template>
<style scoped>
.lyrics-panel{display:flex;min-height:0;height:100%;flex-direction:column;padding:18px 28px 24px;overflow:hidden}header{padding-bottom:14px;border-bottom:1px solid hsl(var(--border));flex-shrink:0}
.lyric-title{display:flex;align-items:center;justify-content:space-between;gap:16px}.lyric-title p{color:var(--primary);font-size:10px;font-weight:700;letter-spacing:.2em}.lyric-title h2{margin-top:4px;font-size:22px;font-weight:650}
.lyric-mode,.lyric-caption,.lyric-notice{color:hsl(var(--muted-foreground));font-size:12px;line-height:1.6}.lyric-caption{margin-top:8px;overflow-wrap:anywhere}.lyric-notice{margin-top:8px}
.lyric-toolbar{display:flex;flex-wrap:wrap;gap:4px 8px;margin-top:12px}.lyric-toolbar button,.lyrics-state button,.lyric-sync-controls button{font-size:12px;padding:5px 8px;border:1px solid hsl(var(--border));border-radius:5px;color:hsl(var(--muted-foreground))}
button:hover:not(:disabled){color:hsl(var(--foreground));border-color:var(--primary)}button:focus-visible,input:focus-visible{outline:2px solid var(--primary);outline-offset:3px}button:disabled{opacity:.45;cursor:default}.lyric-toolbar button[aria-pressed=true]{color:var(--primary)}.file-input{display:none}
.lyric-candidates{display:grid;gap:4px;max-height:160px;overflow-y:auto;margin-top:8px}.lyric-candidates button{text-align:left;padding:7px 8px;border-bottom:1px solid hsl(var(--border));font-size:13px;overflow-wrap:anywhere}.lyric-candidates small{display:block;color:hsl(var(--muted-foreground));font-size:11px}
.lyric-sync-controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding-top:10px;font-size:12px;color:hsl(var(--muted-foreground));flex-shrink:0}.lyric-sync-controls input{width:58px;background:transparent;border:1px solid hsl(var(--border));border-radius:4px;padding:3px 4px;font-variant-numeric:tabular-nums;color:hsl(var(--foreground))}
.lyrics-scroll{position:relative;min-height:0;flex:1;overflow-y:auto;overflow-x:hidden;padding-block:24px;scrollbar-width:thin;overscroll-behavior:contain}.lyrics-scroll.is-synced{padding-block:20vh}
.lyric-line{display:block;width:100%;padding:12px 4px;color:hsl(var(--muted-foreground));text-align:left;white-space:normal;overflow-wrap:anywhere;transition:color .18s ease;line-height:1.6}.lyric-line span,.lyric-line small{display:block}.lyric-line span{font-size:18px}.lyric-line small{margin-top:5px;font-size:13px;font-weight:400;opacity:.85}.lyric-line .lyric-roma{font-size:12px;letter-spacing:.02em}.lyric-line[data-active=true]{color:var(--primary);font-weight:650}.lyric-line.is-plain:disabled{opacity:1}.lyrics-state{display:flex;min-height:200px;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:hsl(var(--muted-foreground));font-size:13px;text-align:center}
.lyric-line .lyric-word{display:inline;white-space:pre-wrap}.lyric-line[data-active=true] .lyric-word{color:hsl(var(--muted-foreground))}.lyric-line[data-active=true] .lyric-word[data-passed=true]{color:var(--primary)}.lyric-line[data-active=true] .lyric-word[data-current=true]{text-decoration:underline;text-underline-offset:5px;text-decoration-thickness:1px}
@media(max-width:600px){.lyrics-panel{padding:12px 16px}.lyric-line span{font-size:17px}.lyric-toolbar{gap:5px}.lyric-sync-controls{font-size:11px}}@media(prefers-reduced-motion:reduce){.lyric-line{transition:none}}
</style>
