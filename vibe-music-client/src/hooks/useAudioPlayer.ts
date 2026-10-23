import { trackModel } from '@/stores/interface'
import { defaultSong } from '@/mock'
import { ElNotification } from 'element-plus'
import { PlayMode } from './interface'
import { searchOnlineSongs, getSongDetail } from '@/api/system'
interface AudioPlayer {
  isPlaying: Ref<boolean>
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
  const audioElement = ref<HTMLAudioElement | null>(null)
  const isPlaying = ref(false)
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
  let fallbackInProgress = false
  let loadGeneration = 0

  const onlineSources = [
    'netease', 'qq', 'kugou', 'kuwo', 'migu', 'qianqian',
    'jamendo', 'bilibili', 'fivesing', 'joox', 'baidu',
  ]

  const normalizeText = (value: string) =>
    value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')

  const trackKey = (track: trackModel) =>
    `${normalizeText(track.title)}::${normalizeText(track.artist)}`

  const getSource = (track: trackModel) =>
    track.source || track.id.match(/^online:([^:]+):/)?.[1] || ''

  const isOnlineTrack = (track: trackModel) =>
    Boolean(track.online || track.source || track.id.startsWith('online:'))

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
  const play = async () => {
    if (!audioElement.value || !currentTrack.value.url) return
    const requestedTrack = currentTrack.value
    try {
      await audioElement.value.play()
    } catch (error) {
      if (requestedTrack !== currentTrack.value || error instanceof DOMException && error.name === 'AbortError') return
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
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
        audioElement.value!.currentTime = 0
        break
      case 'order':
      default:
        if (audioStore.currentSongIndex < audioStore.trackList.length - 1) {
          audioStore.currentSongIndex++
        } else {
          audioStore.currentSongIndex = 0 // 从头开始
        }
        break
    }
    await loadTrack()
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
        audioElement.value!.currentTime = 0
        break
      case 'order':
      default:
        if (audioStore.currentSongIndex > 0) {
          audioStore.currentSongIndex--
        } else {
          audioStore.currentSongIndex = audioStore.trackList.length - 1 // 从尾开始
        }
        break
    }
    await loadTrack()
    await play()
  }

  // 加载当前歌曲
  const loadTrack = async () => {
    const generation = ++loadGeneration
    const track = currentTrack.value
    // 检查歌曲 URL
    await checkUrl()
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
      audioElement.value.src = currentTrack.value.url
      audioElement.value.load()
    }
  }

  // 检查歌曲 URL
  const checkUrl = async () => {
    // 查看歌曲 URL 是否存在
    if (!currentTrack.value.url) {
      // 如果 currentTrack 的 url 不存在，则获取 URL
      const track = currentTrack.value
      const id = Number(track.id)
      if (!Number.isFinite(id)) return
      const response = await getSongDetail(id)
      const url = (response.data as unknown as { audioUrl?: string })?.audioUrl

      if (!url) return
      // 更新 trackList 中的对应歌曲的 url
      const trackIndex = audioStore.trackList.findIndex(
        (item: { id: any }) => item.id === track.id
      )
      if (trackIndex !== -1) {
        audioStore.trackList[trackIndex].url = url // 更新 URL
      }
    }
    return Promise.resolve()
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
    }
  }

  // 更新总时长
  const onLoadedMetadata = async () => {
    if (!audioElement.value) return
    const mediaDuration = audioElement.value.duration
    if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return

    const expectedDuration = Number(currentTrack.value.duration) || 0
    duration.value = mediaDuration

    const looksLikePreview = mediaDuration >= 25 && mediaDuration <= 32
      && (expectedDuration === 0 || expectedDuration > mediaDuration + 15)
    if (!looksLikePreview || !isOnlineTrack(currentTrack.value)) {
      if (!expectedDuration) currentTrack.value.duration = mediaDuration
      currentTrack.value.playbackStatus = undefined
      return
    }

    const shouldResume = !audioElement.value.paused
    audioElement.value.pause()
    await tryAlternative('检测到约 30 秒的试听音源', shouldResume)
  }

  const matchesTrack = (candidate: any, track: trackModel) => {
    const sameTitle = normalizeText(candidate.songName || '') === normalizeText(track.title)
    const candidateArtist = normalizeText(candidate.artistName || '')
    const primaryArtist = normalizeText(track.artist.split(/[,，/&、]/)[0] || '')
    const expectedDuration = Number(track.duration) || 0
    const candidateDuration = Number(candidate.duration) || 0
    const durationMatches = !expectedDuration || !candidateDuration
      || Math.abs(expectedDuration - candidateDuration) <= Math.max(8, expectedDuration * 0.05)
    // A VIP marker is informational: the user's own Cookie may still grant
    // access. Only confirmed unavailable resources are skipped before loading.
    const usable = candidate.availability !== 'unavailable'
    return usable && sameTitle && Boolean(primaryArtist)
      && candidateArtist.includes(primaryArtist) && durationMatches
  }

  const tryAlternative = async (reason: string, resumePlayback = true) => {
    const track = currentTrack.value
    if (fallbackInProgress || !isOnlineTrack(track)) return false

    fallbackInProgress = true
    const originalKey = trackKey(track)
    const originalIndex = audioStore.currentSongIndex
    const attempts = fallbackAttempts.get(originalKey) || new Set<string>()
    const currentSource = getSource(track)
    if (currentSource) attempts.add(currentSource)
    fallbackAttempts.set(originalKey, attempts)
    track.playbackStatus = 'switching'

    try {
      const remainingSources = onlineSources.filter((source) => !attempts.has(source))
      if (remainingSources.length) {
        // 多个平台由后端并行查询，避免逐个平台等待超时。
        const result = await searchOnlineSongs(`${track.title} ${track.artist}`, remainingSources)
        const candidates = Array.isArray(result.data) ? result.data : []
        const candidate = candidates.find((item: any) =>
          !attempts.has(item.source) && matchesTrack(item, track)
        )
        if (candidate) {
          attempts.add(candidate.source)
          if (audioStore.currentSongIndex !== originalIndex || trackKey(currentTrack.value) !== originalKey) {
            track.playbackStatus = undefined
            return false
          }
          Object.assign(audioStore.trackList[originalIndex], {
            id: String(candidate.songId),
            title: candidate.songName,
            artist: candidate.artistName,
            album: candidate.album,
            cover: candidate.coverUrl || track.cover,
            url: candidate.audioUrl,
            duration: Number(candidate.duration) || 0,
            source: candidate.source,
            sourceName: candidate.sourceName,
            sourceSongId: candidate.sourceSongId,
            sourceUrlId: candidate.sourceUrlId,
            sourcePicId: candidate.sourcePicId,
            sourceLyricId: candidate.sourceLyricId,
            sourceExtra: candidate.sourceExtra,
            providerEngine: candidate.providerEngine,
            availability: candidate.availability,
            vip: candidate.vip,
            online: true,
            lyric: undefined,
            translatedLyric: undefined,
            playbackStatus: undefined,
          })
          await loadTrack()
          ElNotification({
            title: '已自动切换音源',
            message: `${reason}，已改用 ${candidate.sourceName || candidate.source}`,
            type: 'info',
          })
          // 允许新音源的 metadata 事件继续判定它是否仍是 30 秒试听。
          fallbackInProgress = false
          if (resumePlayback) await play()
          return true
        }
        remainingSources.forEach((source) => attempts.add(source))
      }

      track.playbackStatus = reason.includes('30 秒') ? 'preview' : 'error'
      ElNotification({
        title: reason.includes('30 秒') ? '该歌曲仅提供试听' : '播放失败',
        message: '已检查其他平台，暂未找到可正常播放的同一首歌曲。',
        type: 'warning',
      })
      return false
    } catch {
      track.playbackStatus = reason.includes('30 秒') ? 'preview' : 'error'
      ElNotification({
        title: '切换音源失败',
        message: '在线音源服务暂时无法连接，请稍后重试。',
        type: 'warning',
      })
      return false
    } finally {
      fallbackInProgress = false
    }
  }

  const handlePlaybackFailure = async (reason = '当前音源无法播放') => {
    isPlaying.value = false
    if (!isOnlineTrack(currentTrack.value)) {
      currentTrack.value.playbackStatus = 'error'
      ElNotification({ title: '播放失败', message: '本地音频不存在或无法读取，请检查附件存储。', type: 'warning' })
      return
    }
    await tryAlternative(reason, true)
  }

  const onPlay = () => { isPlaying.value = true }
  const onPause = () => { isPlaying.value = false }
  const onPlaybackError = () => { void handlePlaybackFailure() }

  // 切换播放/暂停状态
  const togglePlayPause = () => {
    if (isPlaying.value) {
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
    audioElement.value = new Audio(currentTrack.value.url)
    volume.value = audioStore.volume ?? 50
    audioElement.value.volume = volume.value / 100
    // 歌词是否存在
    // checkLyrics()
    // 添加事件监听器
    audioElement.value.addEventListener('timeupdate', updateTime)
    audioElement.value.addEventListener('ended', nextTrack)
    audioElement.value.addEventListener('loadedmetadata', onLoadedMetadata)
    audioElement.value.addEventListener('play', onPlay)
    audioElement.value.addEventListener('pause', onPause)
    audioElement.value.addEventListener('error', onPlaybackError)
  })

  // 组件卸载时移除事件监听器
  onUnmounted(() => {
    if (audioElement.value) {
      audioElement.value.removeEventListener('timeupdate', updateTime)
      audioElement.value.removeEventListener('ended', nextTrack)
      audioElement.value.removeEventListener('loadedmetadata', onLoadedMetadata)
      audioElement.value.removeEventListener('play', onPlay)
      audioElement.value.removeEventListener('pause', onPause)
      audioElement.value.removeEventListener('error', onPlaybackError)
    }
  })

  const audioPlayer: AudioPlayer = {
    isPlaying,
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
