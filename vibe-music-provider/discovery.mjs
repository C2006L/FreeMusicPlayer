// Real platform recommendation -> playlist detail, never keyword-search a
// phrase such as “热门歌曲” and present matching compilation titles as charts.
export const discoverFromPlaylists = async (apiBase, normalizeSongs, fetchImpl = fetch) => {
  const json = async (path, params) => {
    const response = await fetchImpl(`${apiBase}${path}?${params}`, { signal: AbortSignal.timeout(6500), headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`playlist upstream ${response.status}`)
    const payload = await response.json()
    if (!Array.isArray(payload.data)) throw new Error('invalid playlist payload')
    return payload.data
  }
  const platforms = ['netease', 'qq']
  const settled = await Promise.allSettled(platforms.map(async source => {
    const playlists = await json('/api/v1/playlist/recommend', new URLSearchParams({ sources: source }))
    const selected = playlists.filter(item => item.source === source && item.id).slice(0, 2)
    const details = await Promise.allSettled(selected.map(async playlist => {
      const rows = await json('/api/v1/playlist/detail', new URLSearchParams({ source, id: String(playlist.id) }))
      return normalizeSongs(rows.filter(song => song.source === source), 50)
    }))
    const fulfilled = details.filter(item => item.status === 'fulfilled')
    if (selected.length && !fulfilled.length) throw new Error('playlist details failed')
    return fulfilled.flatMap(item => item.value)
  }))
  const failedSources = platforms.filter((_, index) => settled[index].status === 'rejected')
  const groups = settled.map(item => item.status === 'fulfilled' ? item.value : [])
  const songs = []
  const seen = new Set()
  const longest = Math.max(0, ...groups.map(group => group.length))
  for (let i = 0; i < longest; i++) for (const group of groups) {
    const song = group[i]
    if (!song || song.availability === 'unavailable' || /串烧|大串烧|下载歌曲|音乐论坛|studio_video/i.test(song.name)) continue
    const key = `${song.source}:${song.id}`
    if (!seen.has(key)) { seen.add(key); songs.push(song) }
  }
  return { songs, failedSources }
}

export const discoveryBatch = (songs, offset, limit) => {
  if (!songs.length) return []
  return Array.from({ length: Math.min(limit, songs.length) }, (_, index) => songs[(offset + index) % songs.length])
}

const playlistPlatforms = [
  { source: 'netease', sourceName: '网易云音乐' },
  { source: 'qq', sourceName: 'QQ音乐' },
]

// Counts on artist cards must reflect songs found across many recommended
// playlists. One batch of 30 discovery songs made almost every artist say
// "1 首", so the artist feed aggregates playlist details server-side.
const artistDelimiters = /[,，、;；]|\s+\/\s+|\s+(?:feat\.?|ft\.?)\s+/i
const normalizeArtistKey = (name) => String(name || '').trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')
const artistNameList = (raw) => String(raw || '').split(artistDelimiters).map((name) => name.trim()).filter(Boolean)
// Same song repeated in several playlists is one candidate. Album and a
// rounded duration separate different editions instead of collapsing them.
const songIdentity = (song) => [
  normalizeArtistKey(song.name),
  normalizeArtistKey(song.artist),
  normalizeArtistKey(song.album),
  Math.round((Number(song.duration) || 0) / 5),
].join('|')
const rejectedRecording = /串烧|大串烧|下载歌曲|音乐论坛|studio_video/i

const mapWithConcurrency = async (items, limit, worker) => {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(runners)
  return results
}

export const discoverArtists = async (apiBase, normalizeSongs, fetchImpl = fetch, options = {}) => {
  const playlistLimit = Math.min(Math.max(Number(options.playlistLimit) || 8, 1), 12)
  const artistLimit = Math.min(Math.max(Number(options.artistLimit) || 60, 1), 120)
  const songsPerPlaylist = Math.min(Math.max(Number(options.songsPerPlaylist) || 120, 20), 200)
  const { playlists } = await discoverPlaylists(apiBase, fetchImpl, playlistLimit)
  const selected = playlists.slice(0, playlistLimit)
  const details = await mapWithConcurrency(selected, 4, async (playlist) => {
    try {
      const query = new URLSearchParams({ source: playlist.source, id: playlist.id })
      const response = await fetchImpl(`${apiBase}/api/v1/playlist/detail?${query}`, {
        signal: AbortSignal.timeout(10000),
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) return null
      const payload = await response.json()
      if (!Array.isArray(payload.data)) return null
      return normalizeSongs(payload.data.filter((song) => song.source === playlist.source), songsPerPlaylist)
    } catch { return null }
  })
  const artists = new Map()
  const seenSongs = new Set()
  let loadedPlaylists = 0
  for (const songs of details) {
    if (!songs) continue
    loadedPlaylists++
    for (const song of songs) {
      if (!song || !song.name || song.availability === 'unavailable' || rejectedRecording.test(song.name)) continue
      const identity = songIdentity(song)
      if (seenSongs.has(identity)) continue
      seenSongs.add(identity)
      for (const name of artistNameList(song.artist)) {
        const key = normalizeArtistKey(name)
        if (!key) continue
        const existing = artists.get(key)
        if (existing) {
          existing.songCount++
          if (!existing.coverUrl && song.coverOriginal) {
            existing.coverUrl = song.coverOriginal
            existing.coverSource = song.source
          }
          const sourceName = song.sourceName || song.source
          if (!existing.sources.includes(sourceName)) existing.sources.push(sourceName)
        } else {
          artists.set(key, {
            key,
            name,
            songCount: 1,
            sampleSongName: song.name,
            coverUrl: song.coverOriginal || '',
            coverSource: song.source,
            source: song.source,
            sourceName: song.sourceName || song.source,
            sources: [song.sourceName || song.source],
          })
        }
      }
    }
  }
  const list = [...artists.values()]
    .sort((left, right) => right.songCount - left.songCount || left.name.localeCompare(right.name, 'zh-Hans-CN'))
    .slice(0, artistLimit)
  return { artists: list, playlistTotal: selected.length, loadedPlaylists }
}

// Only expose the platform's own recommendation feed: id, cover, creator and
// counters come straight from upstream and are never synthesised here.
export const discoverPlaylists = async (apiBase, fetchImpl = fetch, limit = 24) => {
  const capped = Math.min(Math.max(Number(limit) || 24, 1), 48)
  const perSource = Math.max(1, Math.ceil(capped / playlistPlatforms.length))
  const settled = await Promise.allSettled(playlistPlatforms.map(async (platform) => {
    const response = await fetchImpl(`${apiBase}/api/v1/playlist/recommend?sources=${platform.source}`, {
      signal: AbortSignal.timeout(6500),
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`playlist recommend ${response.status}`)
    const payload = await response.json()
    if (!Array.isArray(payload.data)) throw new Error('invalid playlist recommend payload')
    return payload.data
      .filter((item) => item.source === platform.source && item.id && item.name)
      .slice(0, perSource)
      .map((item) => ({
        id: String(item.id),
        name: String(item.name),
        coverUrl: typeof item.cover === 'string' ? item.cover : '',
        trackCount: Number(item.track_count) || 0,
        playCount: Number(item.play_count) || 0,
        creator: typeof item.creator === 'string' ? item.creator : '',
        source: platform.source,
        sourceName: platform.sourceName,
        link: typeof item.link === 'string' ? item.link : '',
      }))
  }))
  const groups = settled.map((item) => item.status === 'fulfilled' ? item.value : [])
  const failedSources = playlistPlatforms
    .filter((_, index) => settled[index].status === 'rejected')
    .map((platform) => platform.source)
  const playlists = []
  const seen = new Set()
  const longest = Math.max(0, ...groups.map((group) => group.length))
  for (let index = 0; index < longest; index++) {
    for (const group of groups) {
      const item = group[index]
      if (!item || seen.has(`${item.source}:${item.id}`) || playlists.length >= capped) continue
      seen.add(`${item.source}:${item.id}`)
      playlists.push(item)
    }
  }
  return { playlists, failedSources }
}
