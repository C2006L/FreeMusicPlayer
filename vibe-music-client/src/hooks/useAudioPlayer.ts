import { trackModel } from '@/stores/interface'
import { defaultSong } from '@/mock'
import { ElNotification } from 'element-plus'
import { PlayMode } from './interface'
import { searchOnlineSongs, getSongDetail } from '@/api/system'
import { sameRecording, classifyMedia, fullyPlayed, alternativeTier } from '@/utils/playbackPolicy'
import { usePlaybackEvidence, resourceIdentity } from '@/stores/modules/playbackEvidence'
import { songToTrack } from '@/utils/songTrack'
import { rebuildOnlineTrack } from '@/utils/mediaResources'
import { resolveApiBase } from '@/utils/apiBase'
import { createUuid } from '@/utils/uuid'
import { usePlayHistory } from '@/stores/modules/playHistory'
import { UserStore } from '@/stores/modules/user'
import { getVisitorId } from '@/utils/visitor'
interface AudioPlayer {
  isBuffering: Ref<boolean>
  isPlaying: Ref<boolean>
  playbackRequested: Ref<boolean>
  currentTrack: ComputedRef<trackModel>
  currentTime: Ref<number>
  duration: Ref<number>
  seekingTime: Ref<number>
  isSeeking: Ref<boolean>
  volume: Ref<number>
  playMode: Ref<PlayMode>
  //   currentLyricIndex: Ref<number>
  audioElement: Ref<HTMLAudioElement | null>
  play: () => Promise<void>
  pause: () => void
  nextTrack: () => void
  prevTrack: () => void
  seek: (time: number) => void
  startSeeking: () => void
  previewSeek: (time: number) => void
  togglePlayPause: () => void
  setVolume: (volume: number) => void
  setPlayMode: (mode: PlayMode) => void
  loadTrack: () => Promise<void>
}

export const AudioPlayer = () => {
  const audioStore = AudioStore()
  const evidence = usePlaybackEvidence()
  const history = usePlayHistory()
  const user = UserStore()
  const apiBase = resolveApiBase()
  const audioElement = ref<HTMLAudioElement | null>(null)
  const isPlaying = ref(false)
  const playbackRequested = ref(false)
  let playbackRequest = 0
  const isBuffering = ref(false)
  const volume = ref(audioStore.volume ?? 50)
  const playMode = ref<PlayMode>(audioStore.playMode || 'order')

  // 当前播放的歌曲
  const currentTrack = computed<trackModel>(
    () => audioStore.trackList[audioStore.currentSongIndex] || defaultSong
  )
  const currentTime = ref(0)
  const duration = ref(0)
  const seekingTime = ref(0)
  const isSeeking = ref(false)
  const fallbackAttempts = new Map<string, Set<string>>()
  // Tracks already downgraded to a notified trial fallback: do not re-search
  // forever when the short media ends.
  const previewFallbacks = new Set<string>()
  let fallbackLease: symbol | undefined
  let fallbackLoadGeneration = -1
  let loadGeneration = 0
  let handledFailureGeneration = -1
  let loadedTrack: trackModel | undefined
  let playedSeconds = 0
  let historyRecorded = false
  let lastObservedTime = 0
  let lastObservedWall = 0
  let reportSession = createUuid(), reportOffset = 0, lastReported = 0
  let stallTimer: ReturnType<typeof setTimeout> | undefined
  const clearStall = () => { if (stallTimer) clearTimeout(stallTimer); stallTimer=undefined;isBuffering.value=false }
  const armStall = () => {
    clearStall(); const generation=loadGeneration
    isBuffering.value=true
    stallTimer=setTimeout(()=>{if(generation===loadGeneration && loadedTrack===currentTrack.value && !audioElement.value?.paused) void handlePlaybackFailure('音源加载或缓冲超过20秒')},20000)
  }
  const reportListening = (track = loadedTrack, force = false) => {
    const seconds=Math.max(0,Math.floor(playedSeconds-reportOffset))
    if(!track || !user.isLoggedIn || !user.userInfo.token || seconds<3 || seconds<=lastReported || !force && lastReported>0 && seconds-lastReported<15)return
    const session=reportSession, previous=lastReported
    lastReported=seconds
    void fetch(`${apiBase}/workspace/listening`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${user.userInfo.token}`},keepalive:true,signal:AbortSignal.timeout(5000),body:JSON.stringify({sessionId:session,songId:String(track.sourceSongId||track.id).slice(0,128),title:track.title.slice(0,256),artist:(track.artist||'').slice(0,256),source:track.source||'local',playedSeconds:Math.min(seconds,86400),position:Math.min(86400,Math.floor(currentTime.value))})})
      .then(response=>{if(!response.ok)throw new Error('telemetry rejected')})
      .catch(()=>{if(reportSession===session && lastReported===seconds)lastReported=previous})
  }
  const flushListening = () => reportListening(loadedTrack,true)
  watch(()=>user.userInfo.userId,()=>{reportSession=createUuid();reportOffset=playedSeconds;lastReported=0})

  const onlineSources = [
    'kugou', 'kuwo', 'migu', 'qianqian', 'jamendo',
    'bilibili', 'fivesing', 'joox', 'baidu', 'netease', 'qq',
  ]

  const normalizeText = (value: string) =>
    value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')

  const trackKey = (track: trackModel) =>
    `${normalizeText(track.title)}::${normalizeText(track.artist)}`

  const isOnlineTrack = (track: trackModel) =>
    Boolean(track.online || (track.source && track.source !== 'local') || String(track.id).startsWith('online:'))

  // <audio> 无法自定义请求头，匿名访客用查询参数携带标识；登录用户不写匿名事件。
  const guestAwareStreamUrl = (url: string) => {
    if (!url || !url.includes('/song/streamOnline')) return url
    if (UserStore().userInfo?.token) return url
    try {
      const parsed = new URL(url, window.location.origin)
      parsed.searchParams.set('visitor', getVisitorId())
      return parsed.toString()
    } catch {
      return url
    }
  }

  //   // 用于追踪当前歌词索引
  //   const currentLyricIndex = ref(0)

  //   currentTrack.value.lyrics?.lyrics

  //   // 更新当前歌曲歌词索引
  //   const updateCurrentLyricIndex = (newTime: number = 0) => {
  //     if (!currentTrack.value.lyrics?.lines) return

  //     // 找到当前时间对应的歌词行
  //     const lyrics = currentTrack.value.lyrics.lines
  //     const targetIndex = lyrics.findIndex(
  //       (line: { time: number }) => line.time > newTime * 1000
  //     )
  //     currentLyricIndex.value =
  //       targetIndex === -1 ? lyrics.length - 1 : targetIndex - 1
  //   }

  // 播放音乐
  const play = async (resetAttempts = true) => {
    if (!audioElement.value || !currentTrack.value.id) return
    const request = ++playbackRequest
    playbackRequested.value = true
    const selected = currentTrack.value
    if (loadedTrack !== selected || selected.playbackStatus === 'error' || selected.playbackStatus === 'preview' || audioElement.value.error) {
      if (resetAttempts) fallbackAttempts.delete(trackKey(selected))
      await loadTrack()
    }
    if (request !== playbackRequest || !playbackRequested.value || selected !== currentTrack.value || loadedTrack !== selected || !selected.url) return
    const requestedTrack = currentTrack.value
    const requestedGeneration = loadGeneration
    try {
      const pending = audioElement.value.play()
      armStall()
      await pending
    } catch (error) {
      if (request !== playbackRequest || requestedGeneration !== loadGeneration || requestedTrack !== currentTrack.value || error instanceof DOMException && error.name === 'AbortError') return
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        clearStall(); playbackRequested.value = false
        ElNotification({
          title: '浏览器已阻止自动播放',
          message: '请再次点击播放按钮。',
          type: 'info',
        })
        return
      }
      await handlePlaybackFailure('当前音源无法播放')
    }
  }
  // 跳转到指定时间
  const seek = (time: number) => {
    if (audioElement.value) {
      const safeDuration = Number.isFinite(duration.value) ? duration.value : 0
      const target = Math.min(Math.max(Number(time) || 0, 0), safeDuration)
      audioElement.value.currentTime = target
      currentTime.value = target
      seekingTime.value = target
      isSeeking.value = false
    }
  }

  const startSeeking = () => {
    isSeeking.value = true
    seekingTime.value = currentTime.value
  }

  const previewSeek = (time: number) => {
    isSeeking.value = true
    seekingTime.value = Number(time) || 0
  }
  // 暂停音乐
  const pause = () => {
    playbackRequest++
    playbackRequested.value = false
    clearStall()
    if (audioElement.value) {
      audioElement.value.pause()
      isPlaying.value = false
    }
  }

  // 播放下一首
  const nextTrack = async () => {
    if (!audioStore.trackList.length) return
    switch (playMode.value) {
      case 'loop':
        if (audioStore.currentSongIndex < audioStore.trackList.length - 1) {
          audioStore.currentSongIndex++
        } else {
          audioStore.currentSongIndex = 0 // 从头开始
        }
        break
      case 'shuffle':
        audioStore.currentSongIndex = Math.floor(
          Math.random() * audioStore.trackList.length
        )
        break
      case 'single':
      case 'order':
      default:
        if (audioStore.currentSongIndex < audioStore.trackList.length - 1) {
          audioStore.currentSongIndex++
        } else {
          audioStore.currentSongIndex = 0 // 从头开始
        }
        break
    }
    if (loadedTrack === currentTrack.value) seek(0)
    await play()
  }

  // 播放上一首
  const prevTrack = async () => {
    if (!audioStore.trackList.length) return
    switch (playMode.value) {
      case 'loop':
        if (audioStore.currentSongIndex > 0) {
          audioStore.currentSongIndex--
        } else {
          audioStore.currentSongIndex = audioStore.trackList.length - 1 // 从尾开始
        }
        break
      case 'shuffle':
        audioStore.currentSongIndex = Math.floor(
          Math.random() * audioStore.trackList.length
        )
        break
      case 'single':
      case 'order':
      default:
        if (audioStore.currentSongIndex > 0) {
          audioStore.currentSongIndex--
        } else {
          audioStore.currentSongIndex = audioStore.trackList.length - 1 // 从尾开始
        }
        break
    }
    if (loadedTrack === currentTrack.value) seek(0)
    await play()
  }

  // 加载当前歌曲
  const loadTrack = async () => {
    reportListening(loadedTrack,true)
    clearStall()
    const generation = ++loadGeneration
    const track = currentTrack.value
    if (loadedTrack && historyRecorded) history.updatePosition(loadedTrack, currentTime.value)
    loadedTrack = undefined
    audioElement.value?.pause()
    isPlaying.value = false
    // Stop old media while resolving the next track; do not request persisted
    // URLs before we have rebuilt them for the current backend configuration.
    audioElement.value?.removeAttribute('src')
    currentTime.value = 0; seekingTime.value = 0; duration.value = 0; isSeeking.value = false
    playedSeconds = 0
    reportSession=createUuid();reportOffset=0;lastReported=0
    historyRecorded = false
    lastObservedTime = 0
    lastObservedWall = performance.now()
    try { await checkUrl(track, generation) } catch (error: any) {
      if (generation !== loadGeneration || track !== currentTrack.value) return
      track.playbackStatus = 'error'
      playbackRequested.value = false
      ElNotification({ title: '无法刷新播放资源', message: error?.message || '请检查后端或重新搜索这首歌', type: 'warning' })
      return
    }
    if (generation !== loadGeneration || track !== currentTrack.value) return
    // 歌词是否存在
    // checkLyrics()

    if (audioElement.value) {
      audioElement.value.pause()
      currentTime.value = 0
      seekingTime.value = 0
      const expectedDuration = Number(currentTrack.value.duration)
      duration.value = Number.isFinite(expectedDuration) && expectedDuration > 0
        ? expectedDuration
        : 0
      audioElement.value.src = guestAwareStreamUrl(currentTrack.value.url)
      loadedTrack = track
      audioElement.value.load()
    }
  }

  // 检查歌曲 URL
  const checkUrl = async (track: trackModel, generation: number) => {
    if (isOnlineTrack(track)) {
      const refreshed = rebuildOnlineTrack(track, apiBase, true)
      if (!refreshed.sourceUrlId) throw new Error('旧队列缺少平台歌曲标识，请重新搜索后播放；原队列不会被清空。')
      Object.assign(track, refreshed, { playbackStatus: undefined })
      return
    }
    const id = Number(track.id)
    if (Number.isFinite(id) && id > 0) {
      const response = await getSongDetail(id)
      if (generation !== loadGeneration || track !== currentTrack.value) return
      const detail = response.data as unknown as { audioUrl?: string; coverUrl?: string }
      if (response.code !== 0 || !detail?.audioUrl) throw new Error('歌曲详情没有可用音频，请检查资源或重新搜索。')
      track.url = detail.audioUrl
      if (detail.coverUrl) track.cover = detail.coverUrl
    }
    if (!track.url) throw new Error('当前歌曲没有可用播放地址')
  }

  // 解析歌词数据
  //   const checkLyrics = () => {
  //     // 查看歌词是否存在
  //     if (!currentTrack.value.lyrics) {
  //       // 如果 currentTrack 的 lyrics 不存在，则获取歌词
  //       lyricNew(currentTrack.value.id).then((response) => {
  //         // 更新 trackList 中的对应歌曲的 url
  //         const trackIndex = audioStore.trackList.findIndex(
  //           (track: { id: any }) => track.id === currentTrack.value.id
  //         )
  //         if (trackIndex !== -1) {
  //           audioStore.trackList[trackIndex].lyrics =
  //             parseAndMergeLyrics(response) // 更新 URL
  //         }
  //       })
  //     }
  //   }

  // 更新当前播放时间
  const updateTime = () => {
    if (audioElement.value) {
      const nextTime = Number.isFinite(audioElement.value.currentTime)
        ? audioElement.value.currentTime
        : 0
      currentTime.value = nextTime
      if (!isSeeking.value) seekingTime.value = nextTime
      const now = performance.now()
      const delta = nextTime - lastObservedTime
      if (loadedTrack === currentTrack.value && !audioElement.value.paused && delta > 0 && delta < 2) {
        clearStall()
        playedSeconds += Math.min(delta, Math.max(0, (now - lastObservedWall) / 1000) * 1.25)
        if (playedSeconds >= 3 && !historyRecorded) {
          history.record(currentTrack.value, nextTime)
          historyRecorded = true
        }
        reportListening()
      }
      lastObservedTime = nextTime
      lastObservedWall = now
    }
  }

  // 更新总时长
  const onLoadedMetadata = async () => {
    if (!audioElement.value || loadedTrack !== currentTrack.value) return
    const mediaDuration = audioElement.value.duration
    if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return

    const expectedDuration = Number(currentTrack.value.duration) || 0
    duration.value = mediaDuration

    const state = classifyMedia(expectedDuration, mediaDuration)
    evidence.set(currentTrack.value, state)
    if (state !== 'preview' || !isOnlineTrack(currentTrack.value)) {
      if (!expectedDuration && !isOnlineTrack(currentTrack.value)) currentTrack.value.duration = mediaDuration
      currentTrack.value.playbackStatus = undefined
      return
    }

    const shouldResume = playbackRequested.value
    audioElement.value.pause()
    if (!shouldResume) { currentTrack.value.playbackStatus = 'preview'; return }
    if (currentTrack.value.collectionId) {
      await handlePlaybackFailure('合集条目仅提供试听')
      return
    }
    await tryAlternative('检测到试听片段', shouldResume)
  }

  const matchesTrack = (candidate: any, track: trackModel, allowPreview = false) => {
    return !['preview', 'unavailable'].includes(evidence.get(candidate)) && sameRecording({
      title: candidate.songName, artist: candidate.artistName, album: candidate.album,
      duration: Number(candidate.duration), availability: allowPreview ? 'unknown' : candidate.availability,
    }, track)
  }

  const tryAlternative = async (reason: string, resumePlayback = true) => {
    const track = currentTrack.value
    if ((fallbackLease && fallbackLoadGeneration === loadGeneration) || !isOnlineTrack(track)) return false
    // The already-notified trial fallback must not trigger another round of
    // source switching just because the excerpt ended early.
    if (reason.includes('试听') && previewFallbacks.has(resourceIdentity(track))) {
      track.playbackStatus = 'preview'
      return false
    }

    const lease = Symbol('fallback')
    fallbackLease = lease
    fallbackLoadGeneration = loadGeneration
    const originalKey = trackKey(track)
    const originalIndex = audioStore.currentSongIndex
    const generation = loadGeneration
    const request = playbackRequest
    const stillCurrent = () => currentTrack.value === track && audioStore.currentSongIndex === originalIndex && generation === loadGeneration
      && (!resumePlayback || playbackRequested.value && request === playbackRequest)
    const attempts = fallbackAttempts.get(originalKey) || new Set<string>()
    attempts.add(resourceIdentity(track))
    fallbackAttempts.set(originalKey, attempts)
    if (fallbackAttempts.size > 100) fallbackAttempts.delete(fallbackAttempts.keys().next().value!)
    track.playbackStatus = 'switching'

    try {
      if (attempts.size < 4) {
        // 多个平台由后端并行查询，避免逐个平台等待超时。
        const result = await searchOnlineSongs(`${track.title} ${track.artist}`, onlineSources)
        if (!stillCurrent()) return false
        const candidates = Array.isArray(result.data) ? result.data : []
        const available = candidates.filter((item: any) =>
          item.audioUrl && !attempts.has(resourceIdentity(item))
        )
        // Automatic switching only trusts proven complete audio. An entry graded
        // as a trial is used solely when no complete candidate exists.
        const complete = available.filter((item: any) =>
          matchesTrack(item, track) && alternativeTier(item, evidence.get(item)) === 'full'
        )
        const trials = available.filter((item: any) =>
          alternativeTier(item, evidence.get(item)) === 'preview' && matchesTrack(item, track, true)
        )
        const candidate = complete[0] || trials[0]
        const trialFallback = Boolean(candidate) && complete.length === 0
        if (candidate) {
          attempts.add(resourceIdentity(candidate))
          if (audioStore.currentSongIndex !== originalIndex || trackKey(currentTrack.value) !== originalKey) {
            track.playbackStatus = undefined
            return false
          }
          reportListening(track,true)
          Object.assign(audioStore.trackList[originalIndex], {
            ...songToTrack(candidate),
            cover: candidate.coverUrl || track.cover,
            lyric: undefined,
            translatedLyric: undefined,
            playbackStatus: trialFallback ? 'preview' : undefined,
          })
          if (trialFallback) {
            if (previewFallbacks.size > 100) previewFallbacks.delete(previewFallbacks.values().next().value!)
            previewFallbacks.add(resourceIdentity(candidate))
          }
          // play() owns loading and the cancellation lease. Calling it once
          // prevents late source resolution from overriding an explicit pause.
          loadedTrack = undefined
          ElNotification({
            title: trialFallback ? '仅找到试听片段' : '已自动切换音源',
            message: trialFallback
              ? `${reason}，未找到完整音源，已改用 ${candidate.sourceName || candidate.source} 的试听片段（播放会提前结束）。`
              : `${reason}，已改用 ${candidate.sourceName || candidate.source}`,
            type: trialFallback ? 'warning' : 'info',
          })
          // 新音源仍须根据实际媒体时长验证，换源本身不是成功证明。
          if (fallbackLease === lease) fallbackLease = undefined
          if (resumePlayback) await play(false)
          return true
        }
      }

      if (!stillCurrent()) return false
      if (reason.includes('试听') && loadedTrack === track && audioElement.value && !audioElement.value.error) {
        // 试听是当前唯一可用的音源：明确告知后继续播放它，并在结束时不再换源。
        if (previewFallbacks.size > 100) previewFallbacks.delete(previewFallbacks.values().next().value!)
        previewFallbacks.add(resourceIdentity(track))
        track.playbackStatus = 'preview'
        playbackRequested.value = true
        ElNotification({
          title: '当前来源仅提供试听',
          message: '未找到同歌手、同版本且时长匹配的完整音源，将播放试听片段（会提前结束）；不会自动替换为翻唱或现场版。',
          type: 'warning',
        })
        try { await audioElement.value.play() } catch { /* 自动播放被阻止时保持暂停，用户可手动继续 */ }
        return false
      }
      track.playbackStatus = reason.includes('试听') ? 'preview' : 'error'
      playbackRequested.value = false
      ElNotification({
        title: reason.includes('试听') ? '当前来源仅提供试听' : '播放失败',
        message: '当前返回结果中未找到同歌手、同版本且时长匹配的替代资源。可在搜索页手动查看其他版本；不会自动替换为翻唱或现场版。',
        type: 'warning',
      })
      return false
    } catch {
      if (!stillCurrent()) return false
      track.playbackStatus = reason.includes('试听') ? 'preview' : 'error'
      playbackRequested.value = false
      ElNotification({
        title: '切换音源失败',
        message: '在线音源服务暂时无法连接，请稍后重试。',
        type: 'warning',
      })
      return false
    } finally {
      if (currentTrack.value === track && generation === loadGeneration && track.playbackStatus === 'switching') {
        track.playbackStatus = reason.includes('试听') ? 'preview' : 'error'
      }
      if (fallbackLease === lease) fallbackLease = undefined
    }
  }

  const handlePlaybackFailure = async (reason = '当前音源无法播放') => {
    clearStall()
    if (handledFailureGeneration === loadGeneration) return
    handledFailureGeneration = loadGeneration
    isPlaying.value = false
    audioElement.value?.pause()
    evidence.set(currentTrack.value, 'unavailable')
    if (!playbackRequested.value) { currentTrack.value.playbackStatus = 'error'; return }
    if (currentTrack.value.collectionId && playMode.value === 'order') {
      currentTrack.value.playbackStatus = 'error'
      const hasNext = audioStore.currentSongIndex < audioStore.trackList.length - 1
      ElNotification({ title: '合集条目无法播放', message: hasNext ? '已跳过当前条目，继续顺序播放下一条。' : '最后一个条目无法播放，顺序播放已停止。', type: 'warning' })
      if (hasNext) await nextTrack()
      else playbackRequested.value = false
      return
    }
    if (!isOnlineTrack(currentTrack.value)) {
      playbackRequested.value = false
      currentTrack.value.playbackStatus = 'error'
      ElNotification({ title: '播放失败', message: '本地音频不存在或无法读取，请检查附件存储。', type: 'warning' })
      return
    }
    await tryAlternative(reason, true)
  }

  const onPlay = () => { if (!playbackRequested.value) audioElement.value?.pause() }
  const onPlaying = () => {
    if (!playbackRequested.value) { audioElement.value?.pause(); return }
    if (loadedTrack === currentTrack.value && !audioElement.value?.paused) { isPlaying.value = true; clearStall() }
  }
  const onPause = () => {
    if (!audioElement.value?.paused) return
    clearStall()
    reportListening(loadedTrack,true)
    isPlaying.value = false
    if (loadedTrack && historyRecorded) history.updatePosition(loadedTrack, currentTime.value)
  }
  const onPlaybackError = () => { if (loadedTrack === currentTrack.value && audioElement.value?.error) void handlePlaybackFailure() }
  const onEnded = async () => {
    const element = audioElement.value
    if (loadedTrack !== currentTrack.value || !element?.ended || !playbackRequested.value) return
    if (element && isOnlineTrack(currentTrack.value) && classifyMedia(Number(currentTrack.value.duration), element.currentTime) === 'preview') {
      evidence.set(currentTrack.value, 'preview')
      if (currentTrack.value.collectionId) { await handlePlaybackFailure('合集条目仅提供试听'); return }
      await tryAlternative('音频在完整时长之前结束，疑似试听片段', true)
      return
    }
    if (element && classifyMedia(Number(currentTrack.value.duration), element.duration) === 'duration-matched'
        && fullyPlayed(element.duration, element.played)) evidence.set(currentTrack.value, 'full')
    if (playMode.value === 'single') { seek(0); await play(); return }
    if (playMode.value === 'order' && audioStore.currentSongIndex >= audioStore.trackList.length - 1) { pause(); return }
    void nextTrack()
  }

  // 切换播放/暂停状态
  const togglePlayPause = () => {
    if (playbackRequested.value) {
      pause()
    } else {
      play()
    }
  }

  // 设置音量
  const setVolume = (newVolume: number) => {
    if (audioElement.value) {
      volume.value = newVolume
      audioStore.setAudioStore('volume', newVolume)
      audioElement.value.volume = newVolume / 100
    }
  }

  // 设置播放模式
  const setPlayMode = (mode: PlayMode) => {
    playMode.value = mode
    audioStore.setAudioStore('playMode', mode)
    const modeText = {
      order: '顺序播放',
      shuffle: '随机播放',
      loop: '列表循环',
      single: '单曲循环',
    }
    ElNotification({
      title: '播放模式',
      message: `已切换为${modeText[mode]}`,
      type: 'success',
    })
  }

  //   // 更新currentLyricIndex
  //   watch(currentTime, (newTime) => {
  //     updateCurrentLyricIndex(newTime)
  //   })

  // 组件挂载时初始化音频元素
  onMounted(() => {
    window.addEventListener('pagehide',flushListening)
    audioElement.value = new Audio()
    audioElement.value.preload = 'metadata'
    volume.value = audioStore.volume ?? 50
    audioElement.value.volume = volume.value / 100
    // 歌词是否存在
    // checkLyrics()
    // 添加事件监听器
    audioElement.value.addEventListener('timeupdate', updateTime)
    audioElement.value.addEventListener('ended', onEnded)
    audioElement.value.addEventListener('loadedmetadata', onLoadedMetadata)
    audioElement.value.addEventListener('play', onPlay)
    audioElement.value.addEventListener('pause', onPause)
    audioElement.value.addEventListener('error', onPlaybackError)
    audioElement.value.addEventListener('waiting', armStall)
    audioElement.value.addEventListener('stalled', armStall)
    audioElement.value.addEventListener('playing', onPlaying)
  })

  // 组件卸载时移除事件监听器
  onUnmounted(() => {
    flushListening();clearStall();window.removeEventListener('pagehide',flushListening)
    loadGeneration++
    if (loadedTrack && historyRecorded) history.updatePosition(loadedTrack, currentTime.value)
    if (audioElement.value) {
      audioElement.value.removeEventListener('timeupdate', updateTime)
      audioElement.value.removeEventListener('ended', onEnded)
      audioElement.value.removeEventListener('loadedmetadata', onLoadedMetadata)
      audioElement.value.removeEventListener('play', onPlay)
      audioElement.value.removeEventListener('pause', onPause)
      audioElement.value.removeEventListener('error', onPlaybackError)
      audioElement.value.removeEventListener('waiting', armStall)
      audioElement.value.removeEventListener('stalled', armStall)
      audioElement.value.removeEventListener('playing', onPlaying)
      audioElement.value.pause()
      audioElement.value.removeAttribute('src')
    }
  })

  const audioPlayer: AudioPlayer = {
    isBuffering,
    isPlaying,
    playbackRequested,
    currentTrack,
    currentTime,
    duration,
    seekingTime,
    isSeeking,
    volume,
    playMode,
    // currentLyricIndex,
    audioElement,
    play,
    pause,
    nextTrack,
    prevTrack,
    seek,
    startSeeking,
    previewSeek,
    togglePlayPause,
    setVolume,
    setPlayMode,
    loadTrack,
  }

  return audioPlayer
}

export const useAudioPlayer = (): AudioPlayer => {
  const audioPlayer = inject<AudioPlayer>('audioPlayer')
  if (!audioPlayer) {
    throw new Error('useAudioPlayer must be used within a provider')
  }
  return audioPlayer
}
