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
